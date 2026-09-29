package com.robodog.app.sync

import android.util.Log
import com.robodog.app.core.RoboDogConstants
import com.robodog.app.data.model.SyncItem
import com.robodog.app.storage.MediaStorage
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import java.io.IOException
import java.util.concurrent.TimeUnit

/** REST client for the RoboDog backend. */
class BackendClient(private val storage: MediaStorage) {
    companion object { private const val TAG = "BackendClient"; private val JSON = "application/json".toMediaType() }

    @Volatile var baseUrl: String = ""
    @Volatile var token: String = ""

    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).writeTimeout(60, TimeUnit.SECONDS).build()

    private fun url(path: String) = baseUrl.trimEnd('/') + path
    private fun req(path: String) = Request.Builder().url(url(path)).header(RoboDogConstants.AUTH_HEADER, token)

    data class Health(val ok: Boolean, val simulation: Boolean, val version: String?)

    fun health(): Health? = runCatching {
        http.newCall(Request.Builder().url(url(RoboDogConstants.API_HEALTH)).build()).execute().use { r ->
            if (!r.isSuccessful) return null
            val o = Json.parseToJsonElement(r.body?.string() ?: return null).jsonObject
            Health(o["status"]?.jsonPrimitive?.content == "ok", o["simulation"]?.jsonPrimitive?.content == "true", o["version"]?.jsonPrimitive?.content)
        }
    }.getOrNull()

    data class SyncResult(val accepted: List<String>, val duplicates: List<String>, val rejected: Map<String, String>)

    /** POST /api/sync with a batch of envelopes. */
    @Throws(IOException::class)
    fun syncBatch(deviceId: String, items: List<SyncItem>): SyncResult {
        val body = buildJsonObject {
            put("deviceId", JsonPrimitive(deviceId))
            put("items", JsonArray(items.map { it ->
                buildJsonObject {
                    put("id", JsonPrimitive(it.id)); put("kind", JsonPrimitive(it.kind))
                    put("payload", Json.parseToJsonElement(it.payloadJson)); put("createdAt", JsonPrimitive(it.createdAt)); put("attempts", JsonPrimitive(it.attempts))
                }
            }))
        }
        http.newCall(req(RoboDogConstants.API_SYNC).post(body.toString().toRequestBody(JSON)).build()).execute().use { r ->
            val text = r.body?.string() ?: ""
            if (!r.isSuccessful) throw IOException("sync HTTP ${r.code}: ${text.take(200)}")
            val o = Json.parseToJsonElement(text).jsonObject
            return SyncResult(
                o["accepted"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
                o["duplicates"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
                o["rejected"]?.jsonArray?.associate { e -> val eo = e.jsonObject; eo["id"]!!.jsonPrimitive.content to (eo["reason"]?.jsonPrimitive?.content ?: "rejected") } ?: emptyMap(),
            )
        }
    }

    /** Uploads a media binary to <path>/<id>/file as multipart; the server already has the metadata. */
    @Throws(IOException::class)
    fun uploadFile(apiPath: String, recordId: String, fileUri: android.net.Uri, fileName: String, mime: String) {
        val size = storage.sizeOf(fileUri) ?: -1L
        val fileBody = object : RequestBody() {
            override fun contentType() = mime.toMediaType()
            override fun contentLength() = size
            override fun writeTo(sink: BufferedSink) {
                storage.openInput(fileUri)?.use { input -> sink.outputStream().use { out -> input.copyTo(out) } } ?: throw IOException("cannot open $fileUri")
            }
        }
        val body = MultipartBody.Builder().setType(MultipartBody.FORM).addFormDataPart("file", fileName, fileBody).build()
        http.newCall(req("$apiPath/$recordId/file").post(body).build()).execute().use { r ->
            if (!r.isSuccessful) throw IOException("upload HTTP ${r.code}: ${r.body?.string()?.take(200)}")
        }
        Log.i(TAG, "uploaded $fileName ($size bytes) for $recordId")
    }
}
