package com.robodog.app.sync

import android.net.Uri
import android.util.Log
import com.robodog.app.core.Ids
import com.robodog.app.core.RoboDogConstants
import com.robodog.app.core.TimeFormat
import com.robodog.app.data.db.RoboDogDatabase
import com.robodog.app.data.model.Alert
import com.robodog.app.data.model.ImuSample
import com.robodog.app.data.model.Mission
import com.robodog.app.data.model.RgbImage
import com.robodog.app.data.model.RobotStatus
import com.robodog.app.data.model.SensorReading
import com.robodog.app.data.model.SyncItem
import com.robodog.app.data.model.ThermalImage
import com.robodog.app.data.model.ThermalMapPayload
import com.robodog.app.data.model.VideoKind
import com.robodog.app.data.model.VideoRecording
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * Offline-first sync queue. Every record is written to the local database first, then an
 * envelope is enqueued here. [SyncRunner.flush] pushes envelopes in batches to POST /api/sync
 * (idempotent by record id), then uploads binaries for media records. Failures keep the item
 * queued with a back-off; duplicates reported by the server are treated as success.
 */
class SyncQueue(private val db: RoboDogDatabase) {
    private val json = Json { encodeDefaults = true; explicitNulls = true }

    val pendingCount: Flow<Int> = db.sync().observePendingCount()

    private suspend fun enqueue(kind: String, recordId: String, payload: String, fileUri: String? = null) {
        db.sync().enqueue(SyncItem(Ids.sync(), kind, recordId, payload, fileUri, TimeFormat.nowIso()))
    }

    suspend fun sensor(r: SensorReading) = enqueue("sensor", r.id, json.encodeToString(SensorReading.serializer(), r))
    suspend fun alert(a: Alert) = enqueue("alert", a.id, json.encodeToString(Alert.serializer(), a))
    suspend fun mission(m: Mission) = enqueue("mission", m.id, json.encodeToString(Mission.serializer(), m))
    suspend fun robot(s: RobotStatus) = enqueue("robot", "robot_${s.timestamp}", json.encodeToString(RobotStatus.serializer(), s))
    suspend fun imuBatch(samples: List<ImuSample>) = enqueue("imu_batch", Ids.sync(), json.encodeToString(ListSerializer(ImuSample.serializer()), samples))
    suspend fun thermalImage(i: ThermalImage) = enqueue("thermal_image", i.id, json.encodeToString(ThermalImage.serializer(), i.copy(uploaded = false)), i.filePath)
    suspend fun rgbImage(i: RgbImage) = enqueue("rgb_image", i.id, json.encodeToString(RgbImage.serializer(), i.copy(uploaded = false)), i.filePath)
    suspend fun video(v: VideoRecording) = enqueue("video", v.id, json.encodeToString(VideoRecording.serializer(), v.copy(uploaded = false)), v.filePath)
    suspend fun map(p: ThermalMapPayload) = enqueue("map", p.id, json.encodeToString(ThermalMapPayload.serializer(), p))

    suspend fun pending(limit: Int) = db.sync().pending(limit)
    suspend fun pendingCountNow() = db.sync().pendingCount()
}

class SyncRunner(private val db: RoboDogDatabase, private val queue: SyncQueue, private val client: BackendClient) {
    companion object { private const val TAG = "SyncRunner" }

    data class State(val online: Boolean = false, val lastAttemptMs: Long = 0, val lastSuccessMs: Long = 0, val lastError: String? = null, val uploading: Boolean = false, val serverSimulation: Boolean = false)

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** One sync pass. Returns the number of items completed. Safe to call repeatedly. */
    suspend fun flush(deviceId: String, batchSize: Int = 100): Int {
        _state.value = _state.value.copy(lastAttemptMs = System.currentTimeMillis(), uploading = true)
        val health = client.health()
        if (health == null || !health.ok) {
            _state.value = _state.value.copy(online = false, uploading = false, lastError = "backend unreachable")
            return 0
        }
        _state.value = _state.value.copy(online = true, serverSimulation = health.simulation, lastError = null)
        var done = 0
        try {
            while (true) {
                val items = queue.pending(batchSize)
                if (items.isEmpty()) break
                // Metadata first (all kinds), then binaries for media.
                val result = client.syncBatch(deviceId, items)
                val ok = (result.accepted + result.duplicates).toSet()
                for (item in items) {
                    when {
                        item.id in ok || item.recordId in ok -> {
                            val uploaded = uploadBinaryIfNeeded(item)
                            if (uploaded) { db.sync().markDone(item.id); done++ } else db.sync().markFailed(item.id, "binary upload failed")
                        }
                        result.rejected.containsKey(item.id) || result.rejected.containsKey(item.recordId) -> {
                            val reason = result.rejected[item.id] ?: result.rejected[item.recordId]
                            Log.w(TAG, "rejected ${item.kind} ${item.recordId}: $reason")
                            db.sync().markFailed(item.id, reason)
                            // Permanently rejected payloads are dropped after a few attempts so the queue does not wedge.
                            if (item.attempts >= 3) db.sync().markDone(item.id)
                        }
                        else -> db.sync().markFailed(item.id, "not acknowledged")
                    }
                }
                if (items.none { (it.id in ok || it.recordId in ok) }) break // avoid spinning on a stuck batch
            }
            _state.value = _state.value.copy(lastSuccessMs = System.currentTimeMillis(), uploading = false)
            db.sync().pruneDone(TimeFormat.iso(System.currentTimeMillis() - 7L * 24 * 3600 * 1000))
        } catch (t: Throwable) {
            Log.w(TAG, "sync failed: $t")
            _state.value = _state.value.copy(uploading = false, lastError = t.message ?: t.toString())
        }
        return done
    }

    private suspend fun uploadBinaryIfNeeded(item: SyncItem): Boolean {
        val uri = item.fileUri ?: return true
        val (path, mime, fileName) = when (item.kind) {
            "thermal_image" -> Triple(RoboDogConstants.API_THERMAL_IMAGES, "image/jpeg", fileNameOf(item))
            "rgb_image" -> Triple(RoboDogConstants.API_RGB_IMAGES, "image/jpeg", fileNameOf(item))
            "video" -> {
                val kind = Regex("\"kind\":\"(\\w+)\"").find(item.payloadJson)?.groupValues?.get(1)
                Triple(if (kind == VideoKind.RGB.name) RoboDogConstants.API_RGB_VIDEOS else RoboDogConstants.API_THERMAL_VIDEOS, "video/mp4", fileNameOf(item))
            }
            else -> return true
        }
        return try {
            client.uploadFile(path, item.recordId, Uri.parse(uri), fileName, mime)
            markUploaded(item)
            true
        } catch (t: Throwable) {
            Log.w(TAG, "binary upload failed for ${item.recordId}: $t")
            false
        }
    }

    private suspend fun markUploaded(item: SyncItem) {
        when (item.kind) {
            "thermal_image" -> db.thermalImages().markUploaded(item.recordId)
            "rgb_image" -> db.rgbImages().markUploaded(item.recordId)
            "video" -> db.videos().markUploaded(item.recordId)
        }
    }

    private fun fileNameOf(item: SyncItem): String = Regex("\"fileName\":\"([^\"]+)\"").find(item.payloadJson)?.groupValues?.get(1) ?: "${item.recordId}.bin"
}
