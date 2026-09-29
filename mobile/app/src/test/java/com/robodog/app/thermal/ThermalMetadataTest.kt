package com.robodog.app.thermal

import com.robodog.app.core.DataSource
import com.robodog.app.core.TimeFormat
import com.robodog.app.data.model.ThermalImage
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Thermal image metadata must serialise nulls explicitly (never fabricated numbers) and use the required filename pattern. */
class ThermalMetadataTest {
    @Test fun unavailableFieldsSerialiseAsNull() {
        val img = ThermalImage("thermal_1", "2026-09-29T10:00:00Z", null, "Fluke iSee TC01A", 256, 192, "thermal_20260929_100000.jpg", "content://x", "IRON", "YUY2",
            radiometric = false, centerTemperature = null, minTemperature = null, maxTemperature = null, emissivity = null, distance = null, x = null, y = null, z = null, positionFrame = null,
            source = DataSource.REAL, sizeBytes = 1234)
        val json = Json { encodeDefaults = true; explicitNulls = true }.encodeToJsonElement(ThermalImage.serializer(), img).jsonObject
        listOf("centerTemperature", "minTemperature", "maxTemperature", "emissivity", "distance", "x", "y", "z", "positionFrame").forEach { assertEquals(it, JsonNull, json[it]) }
        assertEquals("false", json["radiometric"].toString())
    }

    @Test fun fileStampMatchesPattern() {
        val name = "thermal_${TimeFormat.fileStamp(1_700_000_000_000)}.jpg"
        assertTrue(name, Regex("thermal_\\d{8}_\\d{6}\\.jpg").matches(name))
    }
}
