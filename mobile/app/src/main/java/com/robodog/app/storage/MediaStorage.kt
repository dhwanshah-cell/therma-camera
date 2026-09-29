package com.robodog.app.storage

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream

/**
 * Writes RoboDog media through MediaStore so captures show up in the phone's gallery under
 *   Pictures/RoboDog/Thermal/Images, Movies/RoboDog/Thermal/Videos, Pictures/RoboDog/RGB/Images, ...
 * Files remain fully available offline. Below Android 10 the legacy external-storage path is used.
 */
class MediaStorage(private val context: Context) {

    data class Saved(val uri: Uri, val fileName: String, val sizeBytes: Long?)

    fun saveJpeg(bitmap: Bitmap, relativeDir: String, fileName: String, quality: Int = 92): Saved {
        return openImage(relativeDir, fileName, "image/jpeg") { out -> bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out) }
    }

    fun saveBytes(bytes: ByteArray, relativeDir: String, fileName: String, mime: String, collection: Uri): Saved {
        return open(collection, relativeDir, fileName, mime) { out -> out.write(bytes) }
    }

    fun saveText(text: String, relativeDir: String, fileName: String, mime: String = "application/json"): Saved {
        // Maps/reports live under Documents/
        val collection = if (Build.VERSION.SDK_INT >= 29) MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY) else MediaStore.Files.getContentUri("external")
        return open(collection, relativeDir, fileName, mime, documents = true) { out -> out.write(text.toByteArray()) }
    }

    /** Creates a pending video entry and returns a writable file descriptor path via [VideoTarget]. */
    fun createVideo(relativeDir: String, fileName: String): VideoTarget {
        if (Build.VERSION.SDK_INT >= 29) {
            val values = ContentValues().apply {
                put(MediaStore.Video.Media.DISPLAY_NAME, fileName)
                put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                put(MediaStore.Video.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MOVIES}/$relativeDir")
                put(MediaStore.Video.Media.IS_PENDING, 1)
            }
            val uri = context.contentResolver.insert(MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values)
                ?: throw IllegalStateException("MediaStore insert failed")
            val pfd = context.contentResolver.openFileDescriptor(uri, "rw") ?: throw IllegalStateException("cannot open $uri")
            return VideoTarget(uri, fileName, pfd.detachFd(), null) {
                context.contentResolver.update(uri, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null)
            }
        } else {
            val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), relativeDir).apply { mkdirs() }
            val file = File(dir, fileName)
            return VideoTarget(Uri.fromFile(file), fileName, -1, file.absolutePath) { scanFile(file) }
        }
    }

    class VideoTarget(val uri: Uri, val fileName: String, val fd: Int, val path: String?, val finish: () -> Unit)

    fun delete(uri: Uri): Boolean = runCatching {
        if (uri.scheme == "file") File(uri.path!!).delete() else context.contentResolver.delete(uri, null, null) > 0
    }.getOrDefault(false)

    fun sizeOf(uri: Uri): Long? = runCatching {
        if (uri.scheme == "file") File(uri.path!!).length()
        else context.contentResolver.openFileDescriptor(uri, "r")?.use { it.statSize }
    }.getOrNull()

    fun openInput(uri: Uri) = context.contentResolver.openInputStream(uri)

    private fun openImage(relativeDir: String, fileName: String, mime: String, write: (OutputStream) -> Unit): Saved {
        val collection = if (Build.VERSION.SDK_INT >= 29) MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY) else MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        return open(collection, relativeDir, fileName, mime, write = write)
    }

    private fun open(collection: Uri, relativeDir: String, fileName: String, mime: String, documents: Boolean = false, write: (OutputStream) -> Unit): Saved {
        if (Build.VERSION.SDK_INT >= 29) {
            val base = when {
                documents -> Environment.DIRECTORY_DOCUMENTS
                mime.startsWith("video/") -> Environment.DIRECTORY_MOVIES
                else -> Environment.DIRECTORY_PICTURES
            }
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                put(MediaStore.MediaColumns.RELATIVE_PATH, "$base/$relativeDir")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val uri = context.contentResolver.insert(collection, values) ?: throw IllegalStateException("MediaStore insert failed")
            context.contentResolver.openOutputStream(uri)?.use(write) ?: throw IllegalStateException("cannot open $uri")
            context.contentResolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
            return Saved(uri, fileName, sizeOf(uri))
        } else {
            val base = when {
                documents -> Environment.DIRECTORY_DOCUMENTS
                mime.startsWith("video/") -> Environment.DIRECTORY_MOVIES
                else -> Environment.DIRECTORY_PICTURES
            }
            val dir = File(Environment.getExternalStoragePublicDirectory(base), relativeDir).apply { mkdirs() }
            val file = File(dir, fileName)
            FileOutputStream(file).use(write)
            scanFile(file)
            return Saved(Uri.fromFile(file), fileName, file.length())
        }
    }

    private fun scanFile(file: File) {
        runCatching { android.media.MediaScannerConnection.scanFile(context, arrayOf(file.absolutePath), null, null) }
    }
}
