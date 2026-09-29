package com.robodog.app.esp32

import com.robodog.app.core.DataSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class Esp32ParserTest {
    @Test fun parsesDocumentedPayload() {
        val p = Esp32Parser.parse("""{"temperature": 28.4, "humidity": 61, "gas_raw": 1842, "gas_alert": false}""")
        assertEquals(28.4, p.temperature!!, 1e-9); assertEquals(61.0, p.humidity!!, 1e-9); assertEquals(1842, p.gas_raw); assertEquals(false, p.gas_alert)
    }

    @Test fun mapsToReadingWithoutFabrication() {
        val p = Esp32Parser.parse("""{"temperature": 28.4, "humidity": 61, "gas_raw": 1842, "gas_alert": true}""")
        val r = Esp32Parser.toReading(p, "mission_1", nowMs = 1_700_000_000_000)
        assertEquals("mission_1", r.missionId); assertEquals(DataSource.REAL, r.source); assertTrue(r.gasAlert); assertEquals(1842, r.gasRaw)
        assertNull(r.position); assertEquals("2023-11-14T22:13:20Z", r.timestamp)
    }

    @Test fun missingFieldsStayNull() {
        val p = Esp32Parser.parse("""{"gas_raw": 5, "gas_alert": false}""")
        assertNull(p.temperature); assertNull(p.humidity)
        val r = Esp32Parser.toReading(p, null)
        assertNull(r.temperatureC); assertNull(r.humidityPct); assertFalse(r.gasAlert)
    }

    @Test fun ignoresExtraFields() {
        val p = Esp32Parser.parse("""{"temperature": 1, "humidity": 2, "gas_raw": 3, "gas_alert": false, "battery": 88}""")
        assertEquals(3, p.gas_raw)
    }

    @Test fun rejectsGarbage() {
        assertThrows(Esp32Parser.ParseException::class.java) { Esp32Parser.parse("<html>not json</html>") }
        assertThrows(Esp32Parser.ParseException::class.java) { Esp32Parser.parse("""{"foo": 1}""") }
        assertThrows(Esp32Parser.ParseException::class.java) { Esp32Parser.parse("""{"temperature": "hot", "humidity": 1, "gas_raw": 1, "gas_alert": false}""") }
        assertThrows(Esp32Parser.ParseException::class.java) { Esp32Parser.parse("""{"temperature": 1, "humidity": 140, "gas_raw": 1, "gas_alert": false}""") }
        assertThrows(Esp32Parser.ParseException::class.java) { Esp32Parser.parse("""{"temperature": 1, "humidity": 40, "gas_raw": -1, "gas_alert": false}""") }
    }
}
