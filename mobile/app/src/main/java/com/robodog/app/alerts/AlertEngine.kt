package com.robodog.app.alerts

import com.robodog.app.core.DataSource
import com.robodog.app.core.Ids
import com.robodog.app.core.TimeFormat
import com.robodog.app.data.model.Alert
import com.robodog.app.data.model.AlertSeverity
import com.robodog.app.data.model.AlertType
import com.robodog.app.data.model.Position
import com.robodog.app.data.model.SensorReading
import com.robodog.app.thermal.ThermalFrame
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/**
 * Pure alert rules. Stateful only for de-bouncing so a continuous condition raises one
 * alert instead of one per second. Unit-tested without Android.
 */
class AlertEngine(
    /** Minimum interval between two alerts of the same type. */
    private val debounceMs: Long = 30_000,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    private val lastRaised = HashMap<AlertType, Long>()
    private var gasActive = false

    fun reset() { lastRaised.clear(); gasActive = false }

    /** GAS_ALERT is raised on the rising edge of gas_alert and re-raised after the debounce window. */
    fun onSensorReading(r: SensorReading): Alert? {
        if (!r.gasAlert) { gasActive = false; return null }
        val rising = !gasActive
        gasActive = true
        if (!rising && !debounced(AlertType.GAS_ALERT)) return null
        lastRaised[AlertType.GAS_ALERT] = nowMs()
        return Alert(
            id = Ids.alert(),
            type = AlertType.GAS_ALERT,
            severity = AlertSeverity.CRITICAL,
            timestamp = r.timestamp,
            message = (if (r.source == DataSource.SIMULATION) "[SIMULATION] " else "") + "GAS LEAK ALERT — MQ sensor raw ${r.gasRaw ?: "--"}",
            metadata = mapOf(
                "gasRaw" to num(r.gasRaw), "temperatureC" to num(r.temperatureC), "humidityPct" to num(r.humidityPct),
            ),
            missionId = r.missionId,
            position = r.position,
            source = r.source,
        )
    }

    /**
     * Hotspot detection. With radiometric data, compares the frame maximum against a Celsius
     * threshold and emits THERMAL_HOTSPOT. Without it, compares the normalised intensity peak
     * against [intensityThreshold] and emits THERMAL_INTENSITY_HOTSPOT — explicitly not a temperature.
     */
    fun onThermalFrame(
        frame: ThermalFrame,
        temperatureThresholdC: Float,
        intensityThreshold: Float,
        missionId: String?,
        position: Position?,
        minIntensityRange: Int = 8,
    ): Alert? {
        val rad = frame.radiometric
        if (rad != null) {
            if (rad.maxC < temperatureThresholdC || !debounced(AlertType.THERMAL_HOTSPOT)) return null
            lastRaised[AlertType.THERMAL_HOTSPOT] = nowMs()
            val px = rad.maxIndex % frame.width; val py = rad.maxIndex / frame.width
            return Alert(
                id = Ids.alert(), type = AlertType.THERMAL_HOTSPOT, severity = AlertSeverity.WARNING,
                timestamp = TimeFormat.iso(frame.timestampMs),
                message = "THERMAL HOTSPOT — maximum %.1f °C".format(rad.maxC),
                metadata = mapOf("maxTemperature" to num(Math.round(rad.maxC * 100.0) / 100.0), "pixelX" to num(px), "pixelY" to num(py),
                    "decoder" to JsonPrimitive(rad.decoderName), "frameId" to JsonPrimitive(frame.frameId)),
                missionId = missionId, position = position, source = frame.source,
            )
        }
        // Intensity only: require a meaningful dynamic range so a flat frame never triggers.
        if (frame.intensityMax - frame.intensityMin < minIntensityRange) return null
        var maxI = 0; var maxV = Int.MIN_VALUE
        for (i in 0 until frame.pixelCount) if (frame.intensity[i] > maxV) { maxV = frame.intensity[i]; maxI = i }
        val norm = frame.normalizedIntensity(maxI)
        // The max pixel is always 1.0 by definition; use the fraction of pixels above threshold instead.
        var above = 0
        val cut = frame.intensityMin + ((frame.intensityMax - frame.intensityMin) * intensityThreshold).toInt()
        for (i in 0 until frame.pixelCount) if (frame.intensity[i] >= cut) above++
        val fraction = above.toFloat() / frame.pixelCount
        if (fraction < 0.002f || fraction > 0.25f || !debounced(AlertType.THERMAL_INTENSITY_HOTSPOT)) return null
        lastRaised[AlertType.THERMAL_INTENSITY_HOTSPOT] = nowMs()
        return Alert(
            id = Ids.alert(), type = AlertType.THERMAL_INTENSITY_HOTSPOT, severity = AlertSeverity.INFO,
            timestamp = TimeFormat.iso(frame.timestampMs),
            message = (if (frame.source == DataSource.SIMULATION) "[SIMULATION] " else "") + "Thermal intensity hotspot (%.0f%% of frame above %.0f%% intensity; no temperature data)".format(fraction * 100, intensityThreshold * 100),
            metadata = mapOf("peakNormalizedIntensity" to num(Math.round(norm * 1000.0) / 1000.0), "fractionAbove" to num(Math.round(fraction * 10000.0) / 10000.0),
                "pixelX" to num(maxI % frame.width), "pixelY" to num(maxI / frame.width), "frameId" to JsonPrimitive(frame.frameId)),
            missionId = missionId, position = position, source = frame.source,
        )
    }

    fun connectionAlert(type: AlertType, message: String, missionId: String?, source: DataSource = DataSource.REAL): Alert? {
        if (!debounced(type)) return null
        lastRaised[type] = nowMs()
        return Alert(Ids.alert(), type, AlertSeverity.WARNING, TimeFormat.iso(nowMs()), message, emptyMap(), missionId, null, source)
    }

    private fun debounced(type: AlertType): Boolean = nowMs() - (lastRaised[type] ?: Long.MIN_VALUE / 2) >= debounceMs

    private fun num(v: Number?): JsonElement = if (v == null) JsonNull else JsonPrimitive(v)
}
