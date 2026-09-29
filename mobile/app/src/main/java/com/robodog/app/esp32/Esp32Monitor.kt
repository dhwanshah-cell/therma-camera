package com.robodog.app.esp32

import android.util.Log
import com.robodog.app.core.DataSource
import com.robodog.app.core.RoboDogConstants
import com.robodog.app.data.model.SensorReading
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.sin

/**
 * Polls the ESP32 once per second without user interaction and reports connection state.
 * In simulation mode it produces clearly labelled synthetic readings instead of touching the network.
 */
class Esp32Monitor(
    private val client: Esp32Client,
    private val scope: CoroutineScope,
    private val onReading: suspend (SensorReading) -> Unit,
    private val missionIdProvider: () -> String?,
) {
    companion object { private const val TAG = "Esp32Monitor" }

    data class State(
        val connected: Boolean = false,
        val lastReading: SensorReading? = null,
        val lastSuccessMs: Long = 0,
        val consecutiveFailures: Int = 0,
        val lastError: String? = null,
        val simulation: Boolean = false,
        val url: String = RoboDogConstants.ESP32_SENSORS_URL,
        val polls: Long = 0,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var job: Job? = null

    fun start(url: String, simulation: Boolean, intervalMs: Long = RoboDogConstants.ESP32_POLL_INTERVAL_MS) {
        stop()
        _state.value = State(simulation = simulation, url = url)
        job = scope.launch(Dispatchers.IO) {
            var tick = 0
            while (isActive) {
                val started = System.currentTimeMillis()
                if (simulation) simulatedPoll(tick++) else realPoll(url)
                val elapsed = System.currentTimeMillis() - started
                delay((intervalMs - elapsed).coerceAtLeast(100))
            }
        }
    }

    fun stop() { job?.cancel(); job = null }

    private suspend fun realPoll(url: String) {
        val s = _state.value
        try {
            val payload = withContext(Dispatchers.IO) { client.fetch(url) }
            val reading = Esp32Parser.toReading(payload, missionIdProvider())
            _state.value = s.copy(connected = true, lastReading = reading, lastSuccessMs = System.currentTimeMillis(), consecutiveFailures = 0, lastError = null, polls = s.polls + 1)
            onReading(reading)
        } catch (t: Throwable) {
            val failures = s.consecutiveFailures + 1
            val connected = failures < RoboDogConstants.ESP32_DISCONNECT_AFTER_FAILURES && s.connected
            if (failures == RoboDogConstants.ESP32_DISCONNECT_AFTER_FAILURES) Log.w(TAG, "ESP32 unreachable: ${t.message}")
            _state.value = s.copy(connected = connected, consecutiveFailures = failures, lastError = t.message ?: t.toString(), polls = s.polls + 1)
        }
    }

    private suspend fun simulatedPoll(tick: Int) {
        val t = tick / 10.0
        val gasRaw = (1800 + 250 * sin(t / 3.0) + (tick % 7) * 5).toInt()
        val alert = tick % 45 in 20..24 // periodic simulated gas alert window
        val payload = Esp32Payload(
            temperature = Math.round((27.0 + 2.5 * sin(t / 5.0)) * 10) / 10.0,
            humidity = Math.round(58.0 + 6 * sin(t / 7.0)).toDouble(),
            gas_raw = if (alert) gasRaw + 900 else gasRaw,
            gas_alert = alert,
        )
        val reading = Esp32Parser.toReading(payload, missionIdProvider(), source = DataSource.SIMULATION)
        _state.value = _state.value.copy(connected = true, lastReading = reading, lastSuccessMs = System.currentTimeMillis(), consecutiveFailures = 0, polls = _state.value.polls + 1)
        onReading(reading)
    }
}
