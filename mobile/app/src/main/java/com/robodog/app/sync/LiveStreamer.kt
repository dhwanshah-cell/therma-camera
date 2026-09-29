package com.robodog.app.sync

import android.graphics.Bitmap
import android.util.Log
import com.robodog.app.core.RoboDogConstants
import com.robodog.app.core.TimeFormat
import com.robodog.app.data.model.Alert
import com.robodog.app.data.model.Mission
import com.robodog.app.data.model.RobotStatus
import com.robodog.app.data.model.SensorReading
import com.robodog.app.thermal.ThermalFrame
import com.robodog.app.thermal.ThermalFrameProcessor
import com.robodog.app.thermal.palette.ThermalPalette
import com.robodog.app.thermal.palette.ThermalRenderer
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.concurrent.TimeUnit

/**
 * WebSocket link phone → backend (/ws, role=phone). Sends live thermal/RGB JPEG frames at a
 * throttled rate using the shared binary framing (4-byte header length + JSON header + JPEG),
 * plus sensor/alert/robot/mission JSON messages for real-time dashboards. Reconnects with
 * back-off; when offline nothing is lost because everything also goes through the sync queue.
 */
class LiveStreamer(private val deviceId: () -> String) {
    companion object { private const val TAG = "LiveStreamer" }

    data class State(val connected: Boolean = false, val url: String = "", val framesSent: Long = 0, val lastError: String? = null, val reconnectInMs: Long = 0)

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** Commands received from the web dashboard (capture_thermal, capture_rgb, start_recording, stop_recording). */
    private val _commands = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val commands: SharedFlow<String> = _commands.asSharedFlow()

    private val http = OkHttpClient.Builder().pingInterval(15, TimeUnit.SECONDS).connectTimeout(5, TimeUnit.SECONDS).build()
    private var socket: WebSocket? = null
    private var wantConnected = false
    private var backoffMs = 2000L
    private var lastThermalMs = 0L
    private var lastRgbMs = 0L
    private val json = Json { encodeDefaults = true }
    private var renderBuf = IntArray(0)
    private var bitmap: Bitmap? = null
    private var thermalMinIntervalMs = 1000L / RoboDogConstants.LIVE_THERMAL_FPS
    private var rgbMinIntervalMs = 1000L / RoboDogConstants.LIVE_RGB_FPS

    fun connect(serverUrl: String, token: String) {
        wantConnected = true
        val wsUrl = serverUrl.trimEnd('/').replaceFirst("http://", "ws://").replaceFirst("https://", "wss://") + RoboDogConstants.WS_PATH + "?token=" + token
        _state.value = _state.value.copy(url = wsUrl)
        open(wsUrl, token)
    }

    private fun open(wsUrl: String, token: String) {
        if (!wantConnected) return
        socket?.cancel()
        val req = Request.Builder().url(wsUrl).header(RoboDogConstants.AUTH_HEADER, token).build()
        socket = http.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                backoffMs = 2000
                _state.value = _state.value.copy(connected = true, lastError = null, reconnectInMs = 0)
                webSocket.send(buildJsonObject { put("type", JsonPrimitive("hello")); put("role", JsonPrimitive("phone")); put("deviceId", JsonPrimitive(deviceId())); put("version", JsonPrimitive("0.1.0")) }.toString())
                Log.i(TAG, "connected")
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                runCatching {
                    val o = json.parseToJsonElement(text).jsonObject
                    if (o["type"]?.jsonPrimitive?.content == "command") o["command"]?.jsonPrimitive?.content?.let { _commands.tryEmit(it) }
                }
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                _state.value = _state.value.copy(connected = false, lastError = t.message ?: t.toString(), reconnectInMs = backoffMs)
                scheduleReconnect(wsUrl, token)
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                _state.value = _state.value.copy(connected = false, reconnectInMs = backoffMs)
                scheduleReconnect(wsUrl, token)
            }
        })
    }

    private fun scheduleReconnect(wsUrl: String, token: String) {
        if (!wantConnected) return
        val delay = backoffMs
        backoffMs = (backoffMs * 2).coerceAtMost(30_000)
        Thread { Thread.sleep(delay); if (wantConnected) open(wsUrl, token) }.start()
    }

    fun disconnect() {
        wantConnected = false
        socket?.close(1000, "bye"); socket = null
        _state.value = State()
    }

    fun sendJson(obj: JsonObject) { if (_state.value.connected) socket?.send(obj.toString()) }
    fun sendSensor(r: SensorReading) = sendJson(buildJsonObject { put("type", JsonPrimitive("sensor")); put("reading", json.encodeToJsonElement(SensorReading.serializer(), r)) })
    fun sendAlert(a: Alert) = sendJson(buildJsonObject { put("type", JsonPrimitive("alert")); put("alert", json.encodeToJsonElement(Alert.serializer(), a)) })
    fun sendRobot(s: RobotStatus) = sendJson(buildJsonObject { put("type", JsonPrimitive("robot")); put("status", json.encodeToJsonElement(RobotStatus.serializer(), s)) })
    fun sendMission(m: Mission) = sendJson(buildJsonObject { put("type", JsonPrimitive("mission")); put("mission", json.encodeToJsonElement(Mission.serializer(), m)) })

    /** Throttled thermal frame push. Returns true when a frame was sent. */
    fun sendThermal(frame: ThermalFrame, palette: ThermalPalette): Boolean {
        if (!_state.value.connected) return false
        val now = System.currentTimeMillis()
        if (now - lastThermalMs < thermalMinIntervalMs) return false
        lastThermalMs = now
        if (renderBuf.size != frame.pixelCount) renderBuf = IntArray(frame.pixelCount)
        ThermalRenderer.render(frame, palette, renderBuf)
        bitmap = ThermalFrameProcessor.toBitmap(renderBuf, frame.width, frame.height, bitmap)
        val jpeg = ByteArrayOutputStream().also { bitmap!!.compress(Bitmap.CompressFormat.JPEG, RoboDogConstants.LIVE_JPEG_QUALITY, it) }.toByteArray()
        val rad = frame.radiometric
        val header = buildJsonObject {
            put("channel", JsonPrimitive("thermal")); put("timestamp", JsonPrimitive(TimeFormat.iso(frame.timestampMs))); put("frameId", JsonPrimitive(frame.frameId))
            put("width", JsonPrimitive(frame.width)); put("height", JsonPrimitive(frame.height)); put("palette", JsonPrimitive(palette.name))
            put("radiometric", JsonPrimitive(rad != null))
            put("centerTemperature", rad?.let { JsonPrimitive(it.centerC) } ?: kotlinx.serialization.json.JsonNull)
            put("minTemperature", rad?.let { JsonPrimitive(it.minC) } ?: kotlinx.serialization.json.JsonNull)
            put("maxTemperature", rad?.let { JsonPrimitive(it.maxC) } ?: kotlinx.serialization.json.JsonNull)
            put("source", JsonPrimitive(frame.source.name))
        }
        return sendBinary(header, jpeg)
    }

    fun sendRgb(bitmap: Bitmap, frameId: String, timestampMs: Long): Boolean {
        if (!_state.value.connected) return false
        val now = System.currentTimeMillis()
        if (now - lastRgbMs < rgbMinIntervalMs) return false
        lastRgbMs = now
        val jpeg = ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, 60, it) }.toByteArray()
        val header = buildJsonObject {
            put("channel", JsonPrimitive("rgb")); put("timestamp", JsonPrimitive(TimeFormat.iso(timestampMs))); put("frameId", JsonPrimitive(frameId))
            put("width", JsonPrimitive(bitmap.width)); put("height", JsonPrimitive(bitmap.height)); put("source", JsonPrimitive("REAL"))
        }
        return sendBinary(header, jpeg)
    }

    private fun sendBinary(header: JsonObject, jpeg: ByteArray): Boolean {
        val h = header.toString().toByteArray(Charsets.UTF_8)
        val buf = ByteBuffer.allocate(4 + h.size + jpeg.size)
        buf.putInt(h.size); buf.put(h); buf.put(jpeg)
        val ok = socket?.send(buf.array().toByteString()) ?: false
        if (ok) _state.value = _state.value.copy(framesSent = _state.value.framesSent + 1)
        return ok
    }
}
