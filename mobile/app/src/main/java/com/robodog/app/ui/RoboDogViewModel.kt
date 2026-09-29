package com.robodog.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.robodog.app.AppGraph
import com.robodog.app.data.model.Alert
import com.robodog.app.data.model.Mission
import com.robodog.app.data.model.RgbImage
import com.robodog.app.data.model.RobotStatus
import com.robodog.app.data.model.SensorReading
import com.robodog.app.data.model.ThermalImage
import com.robodog.app.data.model.ThermalMap
import com.robodog.app.data.model.VideoRecording
import com.robodog.app.data.settings.Settings
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Thin adapter exposing the graph's flows to Compose. */
class RoboDogViewModel(val g: AppGraph) : ViewModel() {
    val c = g.controller
    private fun <T> kotlinx.coroutines.flow.Flow<T>.state(initial: T): StateFlow<T> = stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), initial)

    val settings: StateFlow<Settings?> = g.settings.settings.state(null)
    val activeMission: StateFlow<Mission?> = g.missions.active.state(null)
    val missions: StateFlow<List<Mission>> = g.missions.all.state(emptyList())
    val latestSensor: StateFlow<SensorReading?> = g.db.sensors().observeLatest().state(null)
    val recentSensors: StateFlow<List<SensorReading>> = g.db.sensors().observeRecent(120).state(emptyList())
    val activeAlerts: StateFlow<List<Alert>> = g.db.alerts().observeActive().state(emptyList())
    val recentAlerts: StateFlow<List<Alert>> = g.db.alerts().observeRecent(50).state(emptyList())
    val thermalImages: StateFlow<List<ThermalImage>> = g.db.thermalImages().observeAll().state(emptyList())
    val rgbImages: StateFlow<List<RgbImage>> = g.db.rgbImages().observeAll().state(emptyList())
    val videos: StateFlow<List<VideoRecording>> = g.db.videos().observeAll().state(emptyList())
    val maps: StateFlow<List<ThermalMap>> = g.db.maps().observeAll().state(emptyList())
    val robot: StateFlow<RobotStatus?> = g.db.robot().observeLatest().state(null)
    val pendingSync: StateFlow<Int> = g.syncQueue.pendingCount.state(0)

    fun updateSettings(block: Settings.() -> Settings) = viewModelScope.launch { g.settings.update(block) }
    fun deleteThermal(i: ThermalImage) = viewModelScope.launch { c.deleteThermalImage(i) }
    fun deleteRgb(i: RgbImage) = viewModelScope.launch { c.deleteRgbImage(i) }
    fun deleteVideo(v: VideoRecording) = viewModelScope.launch { c.deleteVideo(v) }
    fun deleteMap(m: ThermalMap) = viewModelScope.launch { c.deleteMap(m) }
    suspend fun missionWithStats(id: String): Mission? = g.missions.withStats(id)
    fun checkForUpdate() = viewModelScope.launch { g.updater.check() }
    fun installUpdate() = viewModelScope.launch { g.updater.downloadAndInstall() }
}
