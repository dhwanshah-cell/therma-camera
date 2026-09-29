package com.robodog.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.robodog.app.core.Format
import com.robodog.app.core.TimeFormat
import com.robodog.app.ui.RoboDogViewModel
import com.robodog.app.ui.components.ActionButton
import com.robodog.app.ui.components.KeyValue
import com.robodog.app.ui.components.Label
import com.robodog.app.ui.components.Metric
import com.robodog.app.ui.components.Panel
import com.robodog.app.ui.components.ScreenTitle
import com.robodog.app.ui.components.SimulationBadge
import com.robodog.app.ui.components.StatusRow
import com.robodog.app.ui.components.ThermalView
import com.robodog.app.ui.theme.RdColors

@Composable
fun HomeScreen(vm: RoboDogViewModel, onMissions: () -> Unit, onThermal: () -> Unit) {
    val thermal by vm.c.thermalConnected.collectAsState()
    val esp32 by vm.c.esp32.state.collectAsState()
    val sensor by vm.latestSensor.collectAsState()
    val alerts by vm.activeAlerts.collectAsState()
    val mission by vm.activeMission.collectAsState()
    val robot by vm.robot.collectAsState()
    val frame by vm.c.thermalFrame.collectAsState()
    val palette by vm.c.palette.collectAsState()
    val live by vm.g.liveStreamer.state.collectAsState()
    val pending by vm.pendingSync.collectAsState()
    val sync by vm.g.syncRunner.state.collectAsState()

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        ScreenTitle("ROBO-DOG", "SEARCH & RESCUE")

        ThermalView(frame, palette, Modifier.fillMaxWidth().height(200.dp), placeholder = "THERMAL CAMERA NOT STREAMING")

        Panel(title = "Connection status") {
            StatusRow("THERMAL CAMERA (TC01A)", thermal)
            StatusRow("ESP32 SENSOR BOARD", esp32.connected)
            StatusRow("ROBOT BODY CONTROLLER", robot?.robotConnected == true, disconnectedText = "NOT CONNECTED")
            StatusRow("BACKEND LIVE LINK", live.connected, disconnectedText = if (pending > 0) "OFFLINE · $pending QUEUED" else "OFFLINE")
        }

        Panel(title = "Environment (ESP32 · DHT11 / MQ)") {
            val r = sensor
            Row(Modifier.fillMaxWidth()) {
                Metric("Temperature", Format.celsius(r?.temperatureC), Modifier.weight(1f))
                Metric("Humidity", Format.percent(r?.humidityPct), Modifier.weight(1f))
            }
            Row(Modifier.fillMaxWidth()) {
                Metric("Gas", if (r == null) "--" else if (r.gasAlert) "⚠ ALERT" else "NORMAL", Modifier.weight(1f),
                    valueColor = if (r?.gasAlert == true) RdColors.Red else RdColors.Green, sub = r?.gasRaw?.let { "raw ADC $it (not ppm)" } ?: "Waiting for sensor")
                Metric("Battery", robot?.batteryPct?.let { "${it.toInt()} %" } ?: "--", Modifier.weight(1f), sub = if (robot?.batteryPct == null) "Unavailable" else null)
            }
            Row { SimulationBadge(r?.source) }
            if (!esp32.connected && esp32.lastError != null) Text("ESP32: ${esp32.lastError}", color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
        }

        Panel(title = "Active alerts (${alerts.size})") {
            if (alerts.isEmpty()) Text("No active alerts", color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
            alerts.take(5).forEach { a ->
                Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(Modifier.weight(1f)) {
                        Text(a.message, color = if (a.severity.name == "CRITICAL") RdColors.Red else RdColors.Amber, style = MaterialTheme.typography.bodyMedium)
                        Text("${a.type} · ${TimeFormat.clock(a.timestamp)}", color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
                    }
                    ActionButton("ACK") { vm.c.acknowledgeAlert(a) }
                }
            }
        }

        Panel(title = "Mission") {
            val m = mission
            if (m == null) {
                Text("No active mission", color = RdColors.Muted)
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ActionButton("START MISSION", accent = true) { vm.c.startMission() }
                    ActionButton("HISTORY") { onMissions() }
                }
            } else {
                Text(Format.missionNumber(m.number), style = MaterialTheme.typography.titleMedium, color = RdColors.Accent)
                KeyValue("Start", TimeFormat.clock(m.startTime))
                KeyValue("Thermal images", m.stats.thermalImages.toString())
                KeyValue("Gas alerts", m.stats.gasAlerts.toString())
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ActionButton("END MISSION", danger = true) { vm.c.endMission() }
                    ActionButton("THERMAL", accent = true) { onThermal() }
                    ActionButton("HISTORY") { onMissions() }
                }
            }
        }

        Panel(title = "Sync") {
            KeyValue("Backend", if (sync.online) "ONLINE" else "OFFLINE (data stays on phone)")
            KeyValue("Queued records", pending.toString())
            KeyValue("Last sync", if (sync.lastSuccessMs > 0) TimeFormat.clock(TimeFormat.iso(sync.lastSuccessMs)) else "--")
            if (sync.lastError != null) KeyValue("Error", sync.lastError!!)
            Spacer(Modifier.height(6.dp))
            ActionButton("SYNC NOW") { vm.c.syncNow() }
        }
        Label("All values shown are measured or marked SIMULATION; unavailable values show as --")
    }
}
