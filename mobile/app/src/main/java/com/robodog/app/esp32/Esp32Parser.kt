package com.robodog.app.esp32

import com.robodog.app.core.DataSource
import com.robodog.app.core.Ids
import com.robodog.app.core.TimeFormat
import com.robodog.app.data.model.Position
import com.robodog.app.data.model.SensorReading
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** Raw payload of GET http://192.168.4.1/api/sensors exactly as the ESP32 serves it. */
@Serializable
data class Esp32Payload(
    val temperature: Double? = null,
    val humidity: Double? = null,
    val gas_raw: Int? = null,
    val gas_alert: Boolean? = null,
)

/** Parses ESP32 JSON strictly and maps it to a [SensorReading]. Pure Kotlin, unit-tested. */
object Esp32Parser {
    private val json = Json { ignoreUnknownKeys = true; isLenient = false }

    class ParseException(message: String, cause: Throwable? = null) : Exception(message, cause)

    fun parse(body: String): Esp32Payload {
        val p = try { json.decodeFromString(Esp32Payload.serializer(), body) } catch (t: Throwable) {
            throw ParseException("Invalid ESP32 JSON: ${t.message}", t)
        }
        if (p.temperature == null && p.humidity == null && p.gas_raw == null && p.gas_alert == null) {
            throw ParseException("ESP32 JSON has none of the expected fields")
        }
        p.gas_raw?.let { if (it < 0) throw ParseException("gas_raw must be non-negative") }
        p.humidity?.let { if (it < 0 || it > 100) throw ParseException("humidity out of range: $it") }
        return p
    }

    fun toReading(p: Esp32Payload, missionId: String?, position: Position? = null, nowMs: Long = System.currentTimeMillis(), source: DataSource = DataSource.REAL): SensorReading =
        SensorReading(
            id = Ids.sensor(),
            timestamp = TimeFormat.iso(nowMs),
            missionId = missionId,
            source = source,
            temperatureC = p.temperature,
            humidityPct = p.humidity,
            gasRaw = p.gas_raw,
            gasAlert = p.gas_alert ?: false,
            position = position,
        )
}
