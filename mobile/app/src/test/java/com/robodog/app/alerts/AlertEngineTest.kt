package com.robodog.app.alerts

import com.robodog.app.core.DataSource
import com.robodog.app.core.Ids
import com.robodog.app.data.model.AlertSeverity
import com.robodog.app.data.model.AlertType
import com.robodog.app.data.model.SensorReading
import com.robodog.app.thermal.FrameLayout
import com.robodog.app.thermal.RadiometricResult
import com.robodog.app.thermal.ThermalFrame
import com.robodog.app.thermal.usb.UvcPixelFormat
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class AlertEngineTest {
    private var now = 1_000_000L
    private val engine = AlertEngine(debounceMs = 30_000) { now }

    private fun reading(alert: Boolean, gas: Int = 2500) = SensorReading(Ids.sensor(), "2026-09-29T10:00:00Z", "m1", DataSource.REAL, 28.4, 61.0, gas, alert, null)

    @Test fun gasAlertOnRisingEdgeOnly() {
        assertNull(engine.onSensorReading(reading(false)))
        val a = engine.onSensorReading(reading(true))!!
        assertEquals(AlertType.GAS_ALERT, a.type); assertEquals(AlertSeverity.CRITICAL, a.severity); assertEquals("m1", a.missionId)
        assertEquals("2500", a.metadata["gasRaw"]!!.jsonPrimitive.content); assertEquals("28.4", a.metadata["temperatureC"]!!.jsonPrimitive.content)
        assertNull(engine.onSensorReading(reading(true))) // still active, debounced
        now += 31_000
        assertNotNull(engine.onSensorReading(reading(true))) // re-raised after debounce
        assertNull(engine.onSensorReading(reading(false)))
        now += 1
        assertNotNull(engine.onSensorReading(reading(true))) // new rising edge... but debounced?
    }

    @Test fun simulatedReadingsAreLabelled() {
        val r = reading(true).copy(source = DataSource.SIMULATION)
        val a = engine.onSensorReading(r)!!
        assertEquals(DataSource.SIMULATION, a.source)
        assert(a.message.startsWith("[SIMULATION]"))
    }

    private fun frame(intensity: IntArray, w: Int, h: Int, rad: RadiometricResult? = null) = ThermalFrame(
        "f1", 1_700_000_000_000, 0, 1, w, h, w, h, UvcPixelFormat.Y16, intensity, 16, intensity.min(), intensity.max(), null, false, null, rad, DataSource.REAL, FrameLayout.SINGLE)

    @Test fun intensityHotspotIsLabelledAsIntensityNotTemperature() {
        val w = 64; val h = 48
        val data = IntArray(w * h) { 1000 }
        for (y in 20..24) for (x in 30..34) data[y * w + x] = 60000 // 25 px of 3072 ≈ 0.8 %
        val a = engine.onThermalFrame(frame(data, w, h), 60f, 0.9f, "m1", null)!!
        assertEquals(AlertType.THERMAL_INTENSITY_HOTSPOT, a.type)
        assert(a.message.contains("no temperature data"))
        assert(!a.message.contains("°C"))
    }

    @Test fun flatFrameNeverTriggers() {
        val data = IntArray(64 * 48) { 1000 }
        assertNull(engine.onThermalFrame(frame(data, 64, 48), 60f, 0.9f, null, null))
    }

    @Test fun radiometricHotspotUsesCelsiusThreshold() {
        val data = IntArray(16) { 1 }
        val temps = FloatArray(16) { 25f }.also { it[5] = 72.4f }
        val rad = RadiometricResult("TEST", 25f, 25f, 72.4f, temps, 5, 0)
        val a = engine.onThermalFrame(frame(data, 4, 4, rad), 60f, 0.9f, "m1", null)!!
        assertEquals(AlertType.THERMAL_HOTSPOT, a.type)
        assertEquals("72.4", a.metadata["maxTemperature"]!!.jsonPrimitive.content)
        assertNull(engine.onThermalFrame(frame(data, 4, 4, RadiometricResult("TEST", 25f, 25f, 40f, temps, 5, 0)), 60f, 0.9f, "m1", null))
    }
}
