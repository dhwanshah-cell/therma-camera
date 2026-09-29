package com.robodog.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.robodog.app.core.Format
import com.robodog.app.core.TimeFormat
import com.robodog.app.ui.RoboDogViewModel
import com.robodog.app.ui.components.KeyValue
import com.robodog.app.ui.components.Label
import com.robodog.app.ui.components.Metric
import com.robodog.app.ui.components.Panel
import com.robodog.app.ui.components.ScreenTitle
import com.robodog.app.ui.components.SimulationBadge
import com.robodog.app.ui.components.StatusRow
import com.robodog.app.ui.theme.RdColors

@Composable
fun SensorsScreen(vm: RoboDogViewModel) {
    val esp32 by vm.c.esp32.state.collectAsState()
    val latest by vm.latestSensor.collectAsState()
    val recent by vm.recentSensors.collectAsState()
    val imu by vm.g.imu.latest.collectAsState()
    val imuRate by vm.g.imu.sampleRateHz.collectAsState()
    val r = latest

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        ScreenTitle("SENSORS", "ESP32 · DHT11 · MQ GAS · PHONE IMU")
        StatusRow("ESP32", esp32.connected, connectedText = "🟢 ESP32 CONNECTED", disconnectedText = "🔴 ESP32 DISCONNECTED")
        Text("${esp32.url} · polled every second · ${esp32.polls} polls" + (if (vm.g.esp32Client.boundToWifi) " · bound to Wi-Fi" else ""), color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
        SimulationBadge(r?.source)

        Panel(title = "DHT11 environmental") {
            Row(Modifier.fillMaxWidth()) {
                Metric("Environmental Temperature", Format.celsius(r?.temperatureC), Modifier.weight(1f))
                Metric("Humidity", Format.percent(r?.humidityPct), Modifier.weight(1f))
            }
        }
        Panel(title = "MQ gas sensor") {
            Row(Modifier.fillMaxWidth()) {
                Metric("Gas Raw", Format.int(r?.gasRaw), Modifier.weight(1f), sub = "raw ADC reading — not a calibrated ppm value")
                Metric("Gas Status", if (r == null) "--" else if (r.gasAlert) "⚠ GAS ALERT" else "NORMAL", Modifier.weight(1f), valueColor = if (r?.gasAlert == true) RdColors.Red else RdColors.Green)
            }
        }
        Panel(title = "History (last ${recent.size} readings)") {
            SensorChart(recent.reversed().mapNotNull { it.temperatureC?.toFloat() }, RdColors.Accent, "Temperature °C")
            SensorChart(recent.reversed().mapNotNull { it.humidityPct?.toFloat() }, RdColors.Blue, "Humidity %")
            SensorChart(recent.reversed().mapNotNull { it.gasRaw?.toFloat() }, RdColors.Amber, "Gas raw")
            r?.let { KeyValue("Last reading", TimeFormat.clock(it.timestamp)) }
            if (esp32.lastError != null && !esp32.connected) KeyValue("Last error", esp32.lastError!!)
        }
        Panel(title = "Phone IMU") {
            val a = vm.g.imu.availability
            KeyValue("Accelerometer", if (a.accelerometer) "available" else "--")
            KeyValue("Gyroscope", if (a.gyroscope) "available" else "--")
            KeyValue("Magnetometer", if (a.magnetometer) "available" else "--")
            KeyValue("Sample rate", "%.0f Hz".format(imuRate))
            imu?.let {
                KeyValue("Accel (m/s²)", "%.2f, %.2f, %.2f".format(it.ax, it.ay, it.az))
                KeyValue("Gyro (rad/s)", "%.2f, %.2f, %.2f".format(it.gx, it.gy, it.gz))
                KeyValue("Mag (µT)", if (it.mx != null) "%.1f, %.1f, %.1f".format(it.mx, it.my, it.mz) else "--")
            }
        }
    }
}

@Composable
fun SensorChart(values: List<Float>, color: Color, label: String) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Label(label + (values.lastOrNull()?.let { "  %.1f".format(it) } ?: "  --"))
        Canvas(Modifier.fillMaxWidth().height(56.dp)) {
            drawRect(RdColors.PanelAlt)
            if (values.size < 2) return@Canvas
            val min = values.min(); val max = values.max()
            val range = (max - min).takeIf { it > 0f } ?: 1f
            val stepX = size.width / (values.size - 1)
            var prev: Offset? = null
            values.forEachIndexed { i, v ->
                val p = Offset(i * stepX, size.height - (v - min) / range * (size.height - 8) - 4)
                prev?.let { drawLine(color, it, p, 2f) }
                prev = p
            }
        }
    }
}
