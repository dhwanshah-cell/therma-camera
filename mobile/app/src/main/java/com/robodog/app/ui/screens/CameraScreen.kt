package com.robodog.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.camera.view.PreviewView
import com.robodog.app.ui.RoboDogViewModel
import com.robodog.app.ui.components.ActionButton
import com.robodog.app.ui.components.KeyValue
import com.robodog.app.ui.components.Panel
import com.robodog.app.ui.components.ScreenTitle
import com.robodog.app.ui.components.ThermalView
import com.robodog.app.ui.theme.RdColors

private enum class ViewMode { RGB, THERMAL, DUAL }

@Composable
fun CameraScreen(vm: RoboDogViewModel) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val frame by vm.c.thermalFrame.collectAsState()
    val palette by vm.c.palette.collectAsState()
    val rgbActive by vm.g.rgbCamera.active.collectAsState()
    val rgbRecording by vm.g.rgbCamera.recording.collectAsState()
    val rgbError by vm.g.rgbCamera.error.collectAsState()
    var mode by remember { mutableStateOf(ViewMode.DUAL) }
    val previewView = remember { PreviewView(context).apply { scaleType = PreviewView.ScaleType.FIT_CENTER } }

    DisposableEffect(owner) {
        vm.g.rgbCamera.bind(owner, previewView.surfaceProvider)
        onDispose { vm.g.rgbCamera.unbind() }
    }

    Column(Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        ScreenTitle("CAMERA", "RGB · THERMAL · DUAL VIEW")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ViewMode.entries.forEach { m -> ActionButton(if (m == ViewMode.DUAL) "DUAL VIEW" else m.name, accent = mode == m) { mode = m } }
        }
        when (mode) {
            ViewMode.RGB -> RgbPreview(previewView, rgbActive, rgbError, Modifier.fillMaxWidth().aspectRatio(3f / 4f))
            ViewMode.THERMAL -> ThermalView(frame, palette, Modifier.fillMaxWidth().aspectRatio(4f / 3f))
            ViewMode.DUAL -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                RgbPreview(previewView, rgbActive, rgbError, Modifier.weight(1f).aspectRatio(3f / 4f))
                ThermalView(frame, palette, Modifier.weight(1f).aspectRatio(3f / 4f), placeholder = "NO THERMAL")
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ActionButton("RGB PHOTO", Modifier.weight(1f), accent = true, enabled = rgbActive) { vm.c.captureRgb() }
            ActionButton(if (rgbRecording) "STOP RGB VIDEO" else "RGB VIDEO", Modifier.weight(1f), danger = rgbRecording, enabled = rgbActive) { vm.c.toggleRgbRecording() }
            ActionButton("THERMAL PHOTO", Modifier.weight(1f), enabled = frame != null) { vm.c.captureThermal() }
        }
        Panel(title = "Alignment") {
            val cal = remember { vm.g.calibration.load() }
            KeyValue("Calibrated", if (cal.calibrated) "yes" else "no — cameras are not assumed aligned")
            KeyValue("Relative translation (m)", cal.relativeTranslation.joinToString(", "))
            KeyValue("Relative rotation (quat)", "${cal.relativeRotation.qx}, ${cal.relativeRotation.qy}, ${cal.relativeRotation.qz}, ${cal.relativeRotation.qw}")
            KeyValue("Thermal FOV", cal.thermal.horizontalFovDeg?.let { "$it°" } ?: "--")
            Text("RGB and thermal captures are associated by timestamp and frame id; overlay requires calibration.", color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun RgbPreview(view: PreviewView, active: Boolean, error: String?, modifier: Modifier) {
    Box(modifier, contentAlignment = Alignment.Center) {
        AndroidView(factory = { view }, modifier = Modifier.fillMaxSize())
        if (!active) Text(error ?: "STARTING RGB CAMERA…", color = RdColors.Muted, style = MaterialTheme.typography.labelSmall)
    }
}
