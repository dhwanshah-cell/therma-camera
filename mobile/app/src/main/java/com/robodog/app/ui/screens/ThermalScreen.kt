package com.robodog.app.ui.screens

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.robodog.app.core.Format
import com.robodog.app.thermal.FrameLayout
import com.robodog.app.thermal.palette.ThermalPalette
import com.robodog.app.thermal.usb.UsbDeviceMonitor
import com.robodog.app.thermal.uvc.UvcCamera
import com.robodog.app.ui.RoboDogViewModel
import com.robodog.app.ui.components.ActionButton
import com.robodog.app.ui.components.KeyValue
import com.robodog.app.ui.components.Label
import com.robodog.app.ui.components.Metric
import com.robodog.app.ui.components.Panel
import com.robodog.app.ui.components.ScreenTitle
import com.robodog.app.ui.components.StatusRow
import com.robodog.app.ui.components.ThermalView
import com.robodog.app.ui.theme.RdColors

@Composable
fun ThermalScreen(vm: RoboDogViewModel, onMap: () -> Unit, onStorage: () -> Unit) {
    val frame by vm.c.thermalFrame.collectAsState()
    val palette by vm.c.palette.collectAsState()
    val camState by vm.g.uvcCamera.state.collectAsState()
    val usb by vm.g.usbMonitor.state.collectAsState()
    val stats by vm.g.uvcCamera.stats.collectAsState()
    val recording by vm.c.recording.collectAsState()
    val mapping by vm.g.missionRecorder.state.collectAsState()
    val log by vm.g.uvcCamera.log.collectAsState()
    val desc by vm.g.uvcCamera.description.collectAsState()
    var showDiag by remember { mutableStateOf(false) }
    val connected = camState is UvcCamera.State.Streaming

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        ScreenTitle("THERMAL VISION", "FLUKE iSee TC01A")
        StatusRow("TC01A", connected, connectedText = (camState as? UvcCamera.State.Streaming)?.let { "CONNECTED · ${it.mode.frame.width}x${it.mode.frame.height} ${it.mode.format.pixelFormat}" } ?: "CONNECTED",
            disconnectedText = when (val s = camState) {
                is UvcCamera.State.Opening -> "CONNECTING…"
                is UvcCamera.State.Error -> "ERROR"
                else -> when (usb) { is UsbDeviceMonitor.State.Detected -> "DETECTED · NOT STREAMING"; is UsbDeviceMonitor.State.PermissionDenied -> "PERMISSION DENIED"; else -> "DISCONNECTED" }
            })

        ThermalView(frame, palette, Modifier.fillMaxWidth().aspectRatio(4f / 3f), placeholder = if (frame == null) "LIVE THERMAL IMAGE — WAITING FOR TC01A" else "")

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ActionButton("CAPTURE", Modifier.weight(1f), accent = true, enabled = frame != null) { vm.c.captureThermal() }
            ActionButton(if (recording) "STOP" else "RECORD", Modifier.weight(1f), danger = recording, enabled = frame != null) { vm.c.toggleThermalRecording() }
            ActionButton(if (mapping.active) "STOP MAP" else "MAP", Modifier.weight(1f), enabled = frame != null || mapping.active) { if (mapping.active) vm.c.stopMapping() else vm.c.startMapping() }
            ActionButton("STORAGE", Modifier.weight(1f)) { onStorage() }
        }
        if (recording) Text("● RECORDING  ${Format.durationMs(vm.g.thermalVideo.elapsedMs)}  ${vm.g.thermalVideo.recordedFrames} frames", color = RdColors.Red, style = MaterialTheme.typography.labelSmall)
        if (mapping.active) Text("● MAPPING  ${mapping.frames} frames · ${mapping.points} points · pose: ${mapping.poseSourceName}", color = RdColors.Amber, style = MaterialTheme.typography.labelSmall)

        Panel(title = "Palette") {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                ThermalPalette.selectable.forEach { p ->
                    val usable = p != ThermalPalette.CAMERA || frame?.cameraColor != null
                    ActionButton(p.label, accent = p == palette, enabled = usable) { vm.c.setPalette(p) }
                }
            }
            if (frame?.cameraColor == null && frame != null) Text("Stream is single-channel intensity; CAMERA palette not applicable", color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
        }

        Panel(title = "Temperature") {
            val rad = frame?.radiometric
            if (rad != null) {
                Row(Modifier.fillMaxWidth()) {
                    Metric("Center", Format.celsius(rad.centerC), Modifier.weight(1f))
                    Metric("Max", Format.celsius(rad.maxC), Modifier.weight(1f), valueColor = RdColors.Accent)
                    Metric("Min", Format.celsius(rad.minC), Modifier.weight(1f))
                }
                Text("Decoder: ${rad.decoderName} (experimental — verify against a reference)", color = RdColors.Amber, style = MaterialTheme.typography.bodySmall)
            } else {
                Text(if (frame != null) "Thermal image available" else "No thermal image", color = RdColors.Text)
                Text("Radiometric temperature unavailable", color = RdColors.Muted)
                frame?.let { f ->
                    Spacer(Modifier.height(6.dp))
                    KeyValue("Intensity (raw ${f.intensityBits}-bit)", "center ${f.centerIntensity} · min ${f.intensityMin} · max ${f.intensityMax}")
                    if (f.layout == FrameLayout.STACKED_IMAGE_RAW) Text("Double-height frame decoded as: ${f.decodeInfo}. The other half is kept as raw data for the (opt-in) temperature decoders. Change in Settings → Stacked frame decoding.", color = RdColors.Amber, style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        Panel(title = "Stream") {
            when (val s = camState) {
                is UvcCamera.State.Streaming -> {
                    KeyValue("Mode", s.mode.toString())
                    KeyValue("Why", s.mode.reason)
                    KeyValue("Transfer", if (s.info.isochronous) "isochronous" else "bulk")
                    KeyValue("Max frame bytes", s.info.maxVideoFrameSize.toString())
                    KeyValue("FPS", "%.1f".format(stats.fps))
                    KeyValue("Frames / timeouts", "${stats.frames} / ${stats.timeouts}")
                    frame?.let { KeyValue("Decoded", "${it.width}x${it.height} ${it.decodeInfo} seq ${it.sequence} ${if (it.hasChroma) "colour" else "mono"}") }
                }
                is UvcCamera.State.Error -> {
                    Text(s.message, color = RdColors.Red)
                    s.detail?.let { Text(it, color = RdColors.Muted, style = MaterialTheme.typography.bodySmall) }
                }
                is UvcCamera.State.Opening -> Text("Opening device and negotiating UVC stream…", color = RdColors.Amber)
                UvcCamera.State.Idle -> when (val u = usb) {
                    is UsbDeviceMonitor.State.Detected -> Text("${vm.g.usbMonitor.describe(u.device)} — ${if (u.hasPermission) "permission granted" else "waiting for USB permission"}", color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
                    is UsbDeviceMonitor.State.PermissionDenied -> Text("USB permission not granted. Tap RECONNECT and choose Allow in the dialog, or unplug and replug the camera and choose \"always open RoboDog\".", color = RdColors.Red)
                    UsbDeviceMonitor.State.NoDevice -> Text("No USB video device attached. Plug the TC01A into the USB-C port (OTG).", color = RdColors.Muted)
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ActionButton("RECONNECT") { vm.c.restartCamera() }
                ActionButton(if (showDiag) "HIDE DIAGNOSTICS" else "DIAGNOSTICS") { showDiag = !showDiag }
            }
        }

        if (showDiag) Panel(title = "USB / UVC diagnostics (copy this when reporting the camera format)") {
            Label("Connection log")
            log.forEach { Text(it, color = RdColors.Text, style = MaterialTheme.typography.bodySmall) }
            Spacer(Modifier.height(8.dp))
            Label("Descriptors")
            Text(desc?.dump() ?: "No descriptors read yet", color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
        }
    }
}
