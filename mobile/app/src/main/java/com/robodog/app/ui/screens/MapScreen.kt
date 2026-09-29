package com.robodog.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.robodog.app.data.model.ThermalMap
import com.robodog.app.data.model.ThermalMapPayload
import com.robodog.app.data.model.ThermalPoint
import com.robodog.app.thermal.palette.ThermalPalette
import com.robodog.app.ui.RoboDogViewModel
import com.robodog.app.ui.components.ActionButton
import com.robodog.app.ui.components.KeyValue
import com.robodog.app.ui.components.Panel
import com.robodog.app.ui.components.ScreenTitle
import com.robodog.app.ui.components.SimulationBadge
import com.robodog.app.ui.theme.RdColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlin.math.cos
import kotlin.math.sin

@Composable
fun MapScreen(vm: RoboDogViewModel) {
    val mapping by vm.g.missionRecorder.state.collectAsState()
    val maps by vm.maps.collectAsState()
    val mission by vm.activeMission.collectAsState()
    var selected by remember { mutableStateOf<ThermalMap?>(null) }
    var payload by remember { mutableStateOf<ThermalMapPayload?>(null) }
    var view3d by remember { mutableStateOf(false) }
    val livePoints = if (mapping.active) vm.g.missionRecorder.current?.points() ?: emptyList() else emptyList()

    LaunchedEffect(selected) {
        payload = selected?.filePath?.let { uri ->
            withContext(Dispatchers.IO) { runCatching { vm.g.storage.openInput(android.net.Uri.parse(uri))?.use { Json { ignoreUnknownKeys = true }.decodeFromString(ThermalMapPayload.serializer(), it.readBytes().decodeToString()) } }.getOrNull() }
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        ScreenTitle("THERMAL MAP", if (view3d) "3D VIEWER" else "2D VIEWER")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ActionButton(if (mission == null) "START MISSION" else "MISSION ACTIVE", accent = mission == null, enabled = mission == null) { vm.c.startMission() }
            ActionButton(if (mapping.active) "STOP THERMAL MAPPING" else "START THERMAL MAPPING", accent = !mapping.active, danger = mapping.active) { if (mapping.active) vm.c.stopMapping() else vm.c.startMapping() }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ActionButton("2D", accent = !view3d) { view3d = false }
            ActionButton("3D", accent = view3d) { view3d = true }
        }

        val points: List<ThermalPoint> = if (mapping.active) livePoints else payload?.points ?: emptyList()
        val trajectory = if (mapping.active) vm.g.missionRecorder.current?.trajectory() ?: emptyList() else payload?.trajectory ?: emptyList()
        val hasDepth = points.any { it.z != null }

        Box(Modifier.fillMaxWidth().height(340.dp)) {
            if (view3d) {
                if (hasDepth) Map3dView(points, trajectory.map { Triple(it.x, it.y, it.z ?: 0.0) }, Modifier.fillMaxSize())
                else Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("3D reconstruction requires a depth/pose source.", color = RdColors.Amber)
                        Text("Available: pose = ${vm.g.poseRegistry.bestPose().name}${if (vm.g.poseRegistry.bestPose().available) "" else " (inactive)"}, depth = ${vm.g.poseRegistry.bestDepth()?.name ?: "none"}", color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
                        Text("Plug in LiDAR / a depth camera, or a visual-inertial pose source, to enable 3D mapping.", color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
                    }
                }
            } else Map2dView(points, trajectory.map { it.x to it.y }, Modifier.fillMaxSize())
            SimulationBadge(if (mapping.active) null else selected?.source, Modifier.align(Alignment.TopStart).padding(6.dp))
        }

        Panel(title = if (mapping.active) "Live mapping" else "Selected map") {
            if (mapping.active) {
                KeyValue("Frames sampled", mapping.frames.toString())
                KeyValue("Points", mapping.points.toString())
                KeyValue("Pose source", mapping.poseSourceName + if (mapping.poseAvailable) "" else " (no pose yet — points in image space)")
                KeyValue("Depth source", if (mapping.depthAvailable) "available" else "none")
                mapping.lastSensor?.let { KeyValue("Last sensor", "T ${it.temperatureC ?: "--"} °C · H ${it.humidityPct ?: "--"} % · gas ${it.gasRaw ?: "--"}") }
            } else {
                val m = selected
                if (m == null) Text("Select a saved map below, or start thermal mapping.", color = RdColors.Muted)
                else {
                    KeyValue("Name", m.name); KeyValue("Dimension", m.dimension); KeyValue("Points", m.pointCount.toString())
                    KeyValue("Pose source", m.poseSource?.name ?: "none (image space)"); KeyValue("Temperature data", if (m.hasTemperature) "yes" else "no (intensity only)")
                    KeyValue("Saved", m.filePath ?: "--")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                        ActionButton("DELETE", danger = true) { vm.deleteMap(m); selected = null }
                    }
                }
            }
            Text("Colours show relative thermal intensity unless the map carries decoded temperatures.", color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
        }

        Panel(title = "Saved maps (${maps.size})") {
            if (maps.isEmpty()) Text("No maps saved yet", color = RdColors.Muted)
            maps.forEach { m ->
                Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(m.name, color = if (m == selected) RdColors.Accent else RdColors.Text)
                        Text("${m.dimension} · ${m.pointCount} pts · ${com.robodog.app.core.TimeFormat.human(m.timestamp)}", color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
                    }
                    ActionButton("OPEN") { selected = m }
                }
            }
        }
    }
}

/** 2D map with zoom, pan and reset. */
@Composable
fun Map2dView(points: List<ThermalPoint>, trajectory: List<Pair<Double, Double>>, modifier: Modifier) {
    var scale by remember { mutableStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    Box(modifier) {
        Canvas(Modifier.fillMaxSize().pointerInput(Unit) {
            detectTransformGestures { _, pan, zoom, _ -> scale = (scale * zoom).coerceIn(0.2f, 20f); offset += pan }
        }) {
            drawRect(Color.Black)
            if (points.isEmpty()) return@Canvas
            val minX = points.minOf { it.x }; val maxX = points.maxOf { it.x }; val minY = points.minOf { it.y }; val maxY = points.maxOf { it.y }
            val s = minOf(size.width / (maxX - minX).coerceAtLeast(1e-6).toFloat(), size.height / (maxY - minY).coerceAtLeast(1e-6).toFloat()) * 0.9f * scale
            val cx = size.width / 2 + offset.x; val cy = size.height / 2 + offset.y
            val mx = (minX + maxX) / 2; val my = (minY + maxY) / 2
            val r = (s * 0.02f).coerceIn(2f, 10f)
            val lut = ThermalPalette.IRON.lut
            points.forEach { p ->
                val c = lut[(p.thermalIntensity * 255).toInt().coerceIn(0, 255)]
                drawCircle(Color(c), r, Offset(cx + ((p.x - mx) * s).toFloat(), cy - ((p.y - my) * s).toFloat()))
            }
            var prev: Offset? = null
            trajectory.forEach { (x, y) ->
                val o = Offset(cx + ((x - mx) * s).toFloat(), cy - ((y - my) * s).toFloat())
                prev?.let { drawLine(Color.White, it, o, 2f) }
                prev = o
            }
        }
        Row(Modifier.align(Alignment.TopEnd).padding(6.dp)) { ActionButton("RESET") { scale = 1f; offset = Offset.Zero } }
        if (points.isEmpty()) Text("No map data. Start thermal mapping or open a saved map.", Modifier.align(Alignment.Center), color = RdColors.Muted, style = MaterialTheme.typography.labelSmall)
    }
}

/** Minimal 3D point viewer (orthographic projection): drag to rotate, pinch to zoom, two-finger pan. */
@Composable
fun Map3dView(points: List<ThermalPoint>, trajectory: List<Triple<Double, Double, Double>>, modifier: Modifier) {
    var yaw by remember { mutableStateOf(0.6f) }
    var pitch by remember { mutableStateOf(0.5f) }
    var zoom by remember { mutableStateOf(1f) }
    var pan by remember { mutableStateOf(Offset.Zero) }
    var selectedIdx by remember { mutableStateOf(-1) }
    Box(modifier) {
        Canvas(Modifier.fillMaxSize().pointerInput(Unit) {
            detectTransformGestures { _, p, z, _ ->
                if (z != 1f) zoom = (zoom * z).coerceIn(0.2f, 20f)
                else { yaw += p.x * 0.01f; pitch = (pitch + p.y * 0.01f).coerceIn(-1.5f, 1.5f) }
            }
        }.pointerInput(points) {
            detectTapGestures { tap: Offset ->
                // nearest projected point
                var best = -1; var bestD = 30f * 30f
                projected(points, yaw, pitch, zoom, pan, size.width.toFloat(), size.height.toFloat()).forEachIndexed { i, o -> val d = (o.x - tap.x) * (o.x - tap.x) + (o.y - tap.y) * (o.y - tap.y); if (d < bestD) { bestD = d; best = i } }
                selectedIdx = best
            }
        }) {
            drawRect(Color.Black)
            val proj = projected(points, yaw, pitch, zoom, pan, size.width, size.height)
            val lut = ThermalPalette.IRON.lut
            proj.forEachIndexed { i, o ->
                val p = points[i]
                drawCircle(Color(lut[(p.thermalIntensity * 255).toInt().coerceIn(0, 255)]), if (i == selectedIdx) 8f else 3f, o)
            }
            val tp = projected(trajectory.map { ThermalPoint(it.first, it.second, it.third, 0.0, null, "", "") }, yaw, pitch, zoom, pan, size.width, size.height)
            var prev: Offset? = null
            tp.forEach { o -> prev?.let { drawLine(Color.White, it, o, 2f) }; prev = o }
        }
        Column(Modifier.align(Alignment.BottomStart).padding(6.dp)) {
            if (selectedIdx in points.indices) {
                val p = points[selectedIdx]
                Text("x %.2f  y %.2f  z %s".format(p.x, p.y, p.z?.let { "%.2f".format(it) } ?: "--"), color = RdColors.Text, style = MaterialTheme.typography.bodySmall)
                Text("intensity %.2f  temp %s  %s".format(p.thermalIntensity, p.temperature?.let { "%.1f °C".format(it) } ?: "unavailable", p.frameId.take(14)), color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
            }
        }
        Row(Modifier.align(Alignment.TopEnd).padding(6.dp)) { ActionButton("RESET") { yaw = 0.6f; pitch = 0.5f; zoom = 1f; pan = Offset.Zero; selectedIdx = -1 } }
    }
}

private fun projected(points: List<ThermalPoint>, yaw: Float, pitch: Float, zoom: Float, pan: Offset, w: Float, h: Float): List<Offset> {
    if (points.isEmpty()) return emptyList()
    val cx = points.map { it.x }.average(); val cy = points.map { it.y }.average(); val cz = points.mapNotNull { it.z }.average().takeIf { !it.isNaN() } ?: 0.0
    val extent = points.maxOf { maxOf(kotlin.math.abs(it.x - cx), kotlin.math.abs(it.y - cy), kotlin.math.abs((it.z ?: 0.0) - cz)) }.coerceAtLeast(1e-6)
    val s = (minOf(w, h) / (2.2 * extent)).toFloat() * zoom
    val cyaw = cos(yaw); val syaw = sin(yaw); val cp = cos(pitch); val sp = sin(pitch)
    return points.map { p ->
        val x = (p.x - cx); val y = (p.y - cy); val z = ((p.z ?: 0.0) - cz)
        val x1 = x * cyaw - y * syaw; val y1 = x * syaw + y * cyaw
        val y2 = y1 * cp - z * sp; val z2 = y1 * sp + z * cp
        Offset((w / 2 + x1 * s).toFloat() + pan.x, (h / 2 - z2 * s + y2 * s * 0.0).toFloat() + pan.y)
    }
}
