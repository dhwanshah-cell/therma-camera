package com.robodog.app.data.settings

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.robodog.app.BuildConfig
import com.robodog.app.core.Ids
import com.robodog.app.core.RoboDogConstants
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "robodog_settings")

data class Settings(
    val serverUrl: String,
    val apiToken: String,
    val deviceId: String,
    val esp32Url: String,
    val esp32Ssid: String,
    val esp32Password: String,
    val bindToEsp32Wifi: Boolean,
    val simulationMode: Boolean,
    val palette: String,
    val radiometricDecoderId: String,
    val stackedLayoutMode: String,
    val stackedDecode: String,
    val forcedFormatIndex: Int,
    val forcedFrameIndex: Int,
    val intensityHotspotThreshold: Float,
    val temperatureHotspotC: Float,
    val hotspotAlertsEnabled: Boolean,
    val liveStreamingEnabled: Boolean,
    val syncEnabled: Boolean,
    val autoStartCamera: Boolean,
    val agcClipPercent: Float,
)

class SettingsStore(private val context: Context) {
    private object K {
        val serverUrl = stringPreferencesKey("server_url")
        val apiToken = stringPreferencesKey("api_token")
        val deviceId = stringPreferencesKey("device_id")
        val esp32Url = stringPreferencesKey("esp32_url")
        val esp32Ssid = stringPreferencesKey("esp32_ssid")
        val esp32Password = stringPreferencesKey("esp32_password")
        val bindToEsp32Wifi = booleanPreferencesKey("bind_esp32_wifi")
        val simulation = booleanPreferencesKey("simulation_mode")
        val palette = stringPreferencesKey("palette")
        val radiometric = stringPreferencesKey("radiometric_decoder")
        val stacked = stringPreferencesKey("stacked_layout")
        val stackedDecode = stringPreferencesKey("stacked_decode")
        val forcedFormat = intPreferencesKey("forced_format")
        val forcedFrame = intPreferencesKey("forced_frame")
        val intensityThreshold = floatPreferencesKey("intensity_hotspot_threshold")
        val tempThreshold = floatPreferencesKey("temperature_hotspot_c")
        val hotspotAlerts = booleanPreferencesKey("hotspot_alerts")
        val liveStreaming = booleanPreferencesKey("live_streaming")
        val sync = booleanPreferencesKey("sync_enabled")
        val autoStartCamera = booleanPreferencesKey("auto_start_camera")
        val agcClip = floatPreferencesKey("agc_clip")
    }

    val settings: Flow<Settings> = context.dataStore.data.map { p ->
        Settings(
            serverUrl = p[K.serverUrl] ?: BuildConfig.DEFAULT_SERVER_URL,
            apiToken = p[K.apiToken] ?: BuildConfig.DEFAULT_API_TOKEN,
            deviceId = p[K.deviceId] ?: "",
            esp32Url = p[K.esp32Url] ?: RoboDogConstants.ESP32_SENSORS_URL,
            esp32Ssid = p[K.esp32Ssid] ?: RoboDogConstants.ESP32_SSID,
            esp32Password = p[K.esp32Password] ?: RoboDogConstants.ESP32_DEFAULT_PASSWORD,
            bindToEsp32Wifi = p[K.bindToEsp32Wifi] ?: true,
            simulationMode = p[K.simulation] ?: false,
            palette = p[K.palette] ?: "IRON",
            radiometricDecoderId = p[K.radiometric] ?: "NONE",
            stackedLayoutMode = p[K.stacked] ?: "AUTO",
            stackedDecode = p[K.stackedDecode] ?: "AUTO",
            forcedFormatIndex = p[K.forcedFormat] ?: 0,
            forcedFrameIndex = p[K.forcedFrame] ?: 0,
            intensityHotspotThreshold = p[K.intensityThreshold] ?: RoboDogConstants.DEFAULT_INTENSITY_HOTSPOT_THRESHOLD,
            temperatureHotspotC = p[K.tempThreshold] ?: RoboDogConstants.DEFAULT_TEMPERATURE_HOTSPOT_C,
            hotspotAlertsEnabled = p[K.hotspotAlerts] ?: false,
            liveStreamingEnabled = p[K.liveStreaming] ?: true,
            syncEnabled = p[K.sync] ?: true,
            autoStartCamera = p[K.autoStartCamera] ?: true,
            agcClipPercent = p[K.agcClip] ?: 0.5f,
        )
    }

    suspend fun current(): Settings = settings.first()

    /** Ensures a stable device id exists. */
    suspend fun ensureDeviceId(): String {
        val cur = current()
        if (cur.deviceId.isNotEmpty()) return cur.deviceId
        val id = Ids.device()
        context.dataStore.edit { it[K.deviceId] = id }
        return id
    }

    suspend fun update(block: Settings.() -> Settings) {
        val next = current().block()
        context.dataStore.edit { p ->
            p[K.serverUrl] = next.serverUrl
            p[K.apiToken] = next.apiToken
            p[K.deviceId] = next.deviceId
            p[K.esp32Url] = next.esp32Url
            p[K.esp32Ssid] = next.esp32Ssid
            p[K.esp32Password] = next.esp32Password
            p[K.bindToEsp32Wifi] = next.bindToEsp32Wifi
            p[K.simulation] = next.simulationMode
            p[K.palette] = next.palette
            p[K.radiometric] = next.radiometricDecoderId
            p[K.stacked] = next.stackedLayoutMode
            p[K.stackedDecode] = next.stackedDecode
            p[K.forcedFormat] = next.forcedFormatIndex
            p[K.forcedFrame] = next.forcedFrameIndex
            p[K.intensityThreshold] = next.intensityHotspotThreshold
            p[K.tempThreshold] = next.temperatureHotspotC
            p[K.hotspotAlerts] = next.hotspotAlertsEnabled
            p[K.liveStreaming] = next.liveStreamingEnabled
            p[K.sync] = next.syncEnabled
            p[K.autoStartCamera] = next.autoStartCamera
            p[K.agcClip] = next.agcClipPercent
        }
    }
}
