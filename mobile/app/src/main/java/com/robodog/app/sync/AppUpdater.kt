package com.robodog.app.sync

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.core.content.FileProvider
import com.robodog.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Checks the GitHub "latest-apk" release for a newer build, downloads it and hands it to the
 * Android package installer. Every build is signed with the same key, so the installer
 * offers "Update" instead of demanding an uninstall.
 */
class AppUpdater(private val context: Context) {
    companion object { private const val TAG = "AppUpdater" }

    @Serializable
    data class Manifest(val versionCode: Int, val versionName: String, val commit: String = "", val builtAt: String = "", val apkUrl: String)

    data class State(
        val checking: Boolean = false,
        val latest: Manifest? = null,
        val updateAvailable: Boolean = false,
        val downloading: Boolean = false,
        val progressPct: Int = 0,
        val error: String? = null,
        val lastCheckedMs: Long = 0,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private val json = Json { ignoreUnknownKeys = true }
    private val http = OkHttpClient.Builder().connectTimeout(10, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).build()

    val currentVersionCode: Int get() = BuildConfig.VERSION_CODE
    val currentVersionName: String get() = BuildConfig.VERSION_NAME

    suspend fun check() = withContext(Dispatchers.IO) {
        _state.value = _state.value.copy(checking = true, error = null)
        try {
            val req = Request.Builder().url(BuildConfig.UPDATE_MANIFEST_URL).header("Cache-Control", "no-cache").build()
            http.newCall(req).execute().use { r ->
                if (!r.isSuccessful) throw IllegalStateException("HTTP ${r.code}")
                val m = json.decodeFromString(Manifest.serializer(), r.body!!.string())
                _state.value = _state.value.copy(checking = false, latest = m, updateAvailable = m.versionCode > currentVersionCode, lastCheckedMs = System.currentTimeMillis())
            }
        } catch (t: Throwable) {
            Log.w(TAG, "update check failed: $t")
            _state.value = _state.value.copy(checking = false, error = t.message ?: t.toString(), lastCheckedMs = System.currentTimeMillis())
        }
    }

    suspend fun downloadAndInstall() = withContext(Dispatchers.IO) {
        val m = _state.value.latest ?: return@withContext
        _state.value = _state.value.copy(downloading = true, progressPct = 0, error = null)
        try {
            val dir = File(context.cacheDir, "updates").apply { mkdirs() }
            val file = File(dir, "robodog-${m.versionCode}.apk")
            http.newCall(Request.Builder().url(m.apkUrl).build()).execute().use { r ->
                if (!r.isSuccessful) throw IllegalStateException("HTTP ${r.code}")
                val body = r.body!!
                val total = body.contentLength()
                body.byteStream().use { input -> file.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024); var read: Int; var done = 0L
                    while (input.read(buf).also { read = it } != -1) {
                        out.write(buf, 0, read); done += read
                        if (total > 0) _state.value = _state.value.copy(progressPct = (done * 100 / total).toInt())
                    }
                } }
            }
            val uri: Uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            _state.value = _state.value.copy(downloading = false, progressPct = 100)
            context.startActivity(intent)
        } catch (t: Throwable) {
            Log.e(TAG, "update download failed", t)
            _state.value = _state.value.copy(downloading = false, error = t.message ?: t.toString())
        }
    }
}
