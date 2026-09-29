package com.robodog.app.data

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.robodog.app.core.DataSource
import com.robodog.app.data.db.RoboDogDatabase
import com.robodog.app.data.model.Alert
import com.robodog.app.data.model.AlertSeverity
import com.robodog.app.data.model.AlertType
import com.robodog.app.data.model.Mission
import com.robodog.app.data.model.MissionStatus
import com.robodog.app.data.model.SensorReading
import com.robodog.app.data.model.SyncItem
import com.robodog.app.data.model.ThermalImage
import com.robodog.app.mission.MissionManager
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Instrumented Room tests: run with `./gradlew connectedDebugAndroidTest` on a device or emulator. */
@RunWith(AndroidJUnit4::class)
class RoboDogDatabaseTest {
    private lateinit var db: RoboDogDatabase

    @Before fun setUp() { db = RoboDogDatabase.inMemory(ApplicationProvider.getApplicationContext()) }
    @After fun tearDown() { db.close() }

    @Test fun missionLifecycleAndStats() = runBlocking {
        val mm = MissionManager(db.missions())
        val m = mm.start()
        assertEquals(1, m.number); assertEquals(MissionStatus.ACTIVE, m.status)
        db.sensors().insert(SensorReading("s1", "2026-09-29T10:00:00Z", m.id, DataSource.REAL, 28.4, 61.0, 1842, false, null))
        db.alerts().insert(Alert("a1", AlertType.GAS_ALERT, AlertSeverity.CRITICAL, "2026-09-29T10:00:01Z", "gas", emptyMap(), m.id, null, DataSource.REAL))
        db.thermalImages().upsert(ThermalImage("t1", "2026-09-29T10:00:02Z", m.id, "TC01A", 256, 192, "thermal_x.jpg", "content://x", "IRON", "YUY2", false, null, null, null, null, null, null, null, null, null, DataSource.REAL, 10))
        val ended = mm.end(m.id)!!
        assertEquals(MissionStatus.COMPLETED, ended.status); assertEquals(1, ended.stats.sensorReadings); assertEquals(1, ended.stats.gasAlerts); assertEquals(1, ended.stats.thermalImages)
        assertNull(db.missions().active())
        assertEquals(2, mm.start().number)
    }

    @Test fun duplicateSensorIdsAreIgnored() = runBlocking {
        val r = SensorReading("dup", "2026-09-29T10:00:00Z", null, DataSource.REAL, 1.0, 2.0, 3, false, null)
        db.sensors().insert(r); db.sensors().insert(r.copy(temperatureC = 99.0))
        assertEquals(1.0, db.sensors().observeLatest().first()!!.temperatureC!!, 1e-9)
    }

    @Test fun syncQueueMarksDone() = runBlocking {
        db.sync().enqueue(SyncItem("q1", "sensor", "s1", "{}", null, "2026-09-29T10:00:00Z"))
        assertEquals(1, db.sync().pendingCount())
        db.sync().markFailed("q1", "offline"); assertEquals(1, db.sync().pending(10).single().attempts)
        db.sync().markDone("q1"); assertEquals(0, db.sync().pendingCount())
    }

    @Test fun nullTemperaturesRoundTrip() = runBlocking {
        db.thermalImages().upsert(ThermalImage("t2", "2026-09-29T10:00:02Z", null, "TC01A", 256, 192, "f.jpg", "content://f", "IRON", null, false, null, null, null, null, null, null, null, null, null, DataSource.SIMULATION, null))
        val img = db.thermalImages().byId("t2")!!
        assertNull(img.centerTemperature); assertNull(img.x); assertEquals(DataSource.SIMULATION, img.source)
    }
}
