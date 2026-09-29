package com.robodog.app.mission

import com.robodog.app.core.DataSource
import com.robodog.app.core.Ids
import com.robodog.app.core.TimeFormat
import com.robodog.app.data.db.MissionDao
import com.robodog.app.data.model.Mission
import com.robodog.app.data.model.MissionStats
import com.robodog.app.data.model.MissionStatus
import kotlinx.coroutines.flow.Flow

/** Creates, ends and summarises missions. Stats are recomputed from the local database. */
class MissionManager(private val dao: MissionDao, private val onChanged: suspend (Mission) -> Unit = {}) {
    val active: Flow<Mission?> = dao.observeActive()
    val all: Flow<List<Mission>> = dao.observeAll()

    suspend fun activeId(): String? = dao.active()?.id

    suspend fun start(name: String? = null, source: DataSource = DataSource.REAL): Mission {
        dao.active()?.let { end(it.id) }
        val number = dao.maxNumber() + 1
        val m = Mission(
            id = Ids.mission(), number = number, name = name ?: "MISSION #%03d".format(number),
            startTime = TimeFormat.nowIso(), endTime = null, status = MissionStatus.ACTIVE, notes = null, source = source,
        )
        dao.upsert(m)
        onChanged(m)
        return m
    }

    suspend fun end(id: String, status: MissionStatus = MissionStatus.COMPLETED): Mission? {
        val m = dao.byId(id) ?: return null
        val updated = refreshStats(m.copy(endTime = TimeFormat.nowIso(), status = status))
        dao.update(updated)
        onChanged(updated)
        return updated
    }

    suspend fun refreshStats(m: Mission): Mission = m.copy(
        stats = MissionStats(
            thermalImages = dao.countThermal(m.id), rgbImages = dao.countRgb(m.id), videos = dao.countVideos(m.id),
            sensorReadings = dao.countSensors(m.id), gasAlerts = dao.countGasAlerts(m.id),
            thermalHotspots = dao.countHotspots(m.id), maps = dao.countMaps(m.id),
        ),
    )

    suspend fun withStats(id: String): Mission? = dao.byId(id)?.let { refreshStats(it) }
}
