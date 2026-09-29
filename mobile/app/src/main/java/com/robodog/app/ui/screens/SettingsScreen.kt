package com.robodog.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.robodog.app.thermal.radiometric.RadiometricDecoders
import com.robodog.app.thermal.uvc.NativeUvc
import com.robodog.app.ui.RoboDogViewModel
import com.robodog.app.ui.components.ActionButton
import com.robodog.app.ui.components.KeyValue
import com.robodog.app.ui.components.Label
import com.robodog.app.ui.components.Panel
import com.robodog.app.ui.components.ScreenTitle
import com.robodog.app.ui.theme.RdColors

@Composable
fun SettingsScreen(vm: RoboDogViewModel) {
    val s by vm.settings.collectAsState()
    val settings = s ?: return
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        ScreenTitle("SETTINGS")

        Panel(title = "Simulation") {
            ToggleRow("SIMULATION MODE (labelled synthetic sensors, thermal frames and robot status)", settings.simulationMode) { vm.updateSettings { copy(simulationMode = it) } }
            Text("The real TC01A path is separate: when the camera streams, simulated thermal frames stop.", color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
        }

        Panel(title = "Backend") {
            TextRow("Server URL", settings.serverUrl) { vm.updateSettings { copy(serverUrl = it) } }
            TextRow("API token", settings.apiToken, secret = true) { vm.updateSettings { copy(apiToken = it) } }
            ToggleRow("Live streaming over WebSocket", settings.liveStreamingEnabled) { vm.updateSettings { copy(liveStreamingEnabled = it) } }
            ToggleRow("Background sync", settings.syncEnabled) { vm.updateSettings { copy(syncEnabled = it) } }
            KeyValue("Device id", settings.deviceId.ifEmpty { "--" })
        }

        Panel(title = "ESP32") {
            TextRow("Sensor URL", settings.esp32Url) { vm.updateSettings { copy(esp32Url = it) } }
            TextRow("Wi-Fi SSID", settings.esp32Ssid) { vm.updateSettings { copy(esp32Ssid = it) } }
            TextRow("Wi-Fi password", settings.esp32Password, secret = true) { vm.updateSettings { copy(esp32Password = it) } }
            ToggleRow("Bind requests to Wi-Fi (needed when the AP has no internet)", settings.bindToEsp32Wifi) { vm.updateSettings { copy(bindToEsp32Wifi = it) } }
            Text("Join the ROBO-DOG network in Android Wi-Fi settings; the app polls the ESP32 automatically.", color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
        }

        Panel(title = "Thermal camera") {
            ToggleRow("Auto-start when TC01A is plugged in", settings.autoStartCamera) { vm.updateSettings { copy(autoStartCamera = it) } }
            Label("Radiometric decoder")
            RadiometricDecoders.all.forEach { d ->
                Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    ActionButton(if (settings.radiometricDecoderId == d.id) "●" else "○", accent = settings.radiometricDecoderId == d.id) { vm.updateSettings { copy(radiometricDecoderId = d.id) } }
                    Column(Modifier.padding(start = 8.dp)) {
                        Text(d.label, color = if (d.experimental) RdColors.Amber else RdColors.Text)
                        Text(d.description, color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            Label("Stacked frame handling")
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("AUTO", "NEVER", "ALWAYS").forEach { m -> ActionButton(m, accent = settings.stackedLayoutMode == m) { vm.updateSettings { copy(stackedLayoutMode = m) } } }
            }
            TextRow("Force UVC format index (0 = auto)", settings.forcedFormatIndex.toString()) { v -> v.toIntOrNull()?.let { n -> vm.updateSettings { copy(forcedFormatIndex = n) } } }
            TextRow("Force UVC frame index (0 = auto)", settings.forcedFrameIndex.toString()) { v -> v.toIntOrNull()?.let { n -> vm.updateSettings { copy(forcedFrameIndex = n) } } }
            KeyValue("Native driver", if (NativeUvc.ensureLoaded()) NativeUvc.nativeVersion() else "failed: ${NativeUvc.loadError}")
        }

        Panel(title = "Alerts") {
            ToggleRow("Thermal hotspot alerts", settings.hotspotAlertsEnabled) { vm.updateSettings { copy(hotspotAlertsEnabled = it) } }
            TextRow("Temperature hotspot threshold °C (radiometric only)", settings.temperatureHotspotC.toString()) { v -> v.toFloatOrNull()?.let { n -> vm.updateSettings { copy(temperatureHotspotC = n) } } }
            TextRow("Intensity hotspot threshold 0..1 (no temperature)", settings.intensityHotspotThreshold.toString()) { v -> v.toFloatOrNull()?.let { n -> vm.updateSettings { copy(intensityHotspotThreshold = n.coerceIn(0.5f, 1f)) } } }
        }

        Panel(title = "About") {
            KeyValue("App", "RoboDog 0.1.0")
            KeyValue("Storage", "Pictures/RoboDog/Thermal/Images · Movies/RoboDog/Thermal/Videos · Documents/RoboDog/Thermal/Maps · Pictures/RoboDog/RGB/Images")
            KeyValue("Human detection", vm.g.humanDetector.name)
            KeyValue("Pose sources", vm.g.poseRegistry.allPose.joinToString { it.name })
            KeyValue("Depth sources", vm.g.poseRegistry.allDepth.joinToString { "${it.name}${if (it.available) "" else " (unavailable)"}" })
        }
    }
}

@Composable
private fun ToggleRow(label: String, value: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f), color = RdColors.Text, style = MaterialTheme.typography.bodyMedium)
        Switch(checked = value, onCheckedChange = onChange)
    }
}

@Composable
private fun TextRow(label: String, value: String, secret: Boolean = false, onChange: (String) -> Unit) {
    var text by remember(value) { mutableStateOf(value) }
    OutlinedTextField(
        value = text, onValueChange = { text = it; onChange(it) }, label = { Text(label) }, singleLine = true,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        visualTransformation = if (secret) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
    )
}
