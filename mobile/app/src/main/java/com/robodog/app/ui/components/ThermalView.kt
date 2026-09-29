package com.robodog.app.ui.components

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.robodog.app.thermal.ThermalFrame
import com.robodog.app.thermal.ThermalFrameProcessor
import com.robodog.app.thermal.palette.ThermalPalette
import com.robodog.app.thermal.palette.ThermalRenderer
import com.robodog.app.ui.theme.RdColors

/** Reusable renderer state so we do not allocate a bitmap per frame. */
class ThermalViewState {
    var argb = IntArray(0)
    var bitmap: Bitmap? = null
    var lastFrameId: String? = null
    var lastPalette: ThermalPalette? = null
    var clipPercent = 0.5f
    fun render(frame: ThermalFrame, palette: ThermalPalette): Bitmap {
        val b = bitmap
        if (b != null && lastFrameId == frame.frameId && lastPalette == palette) return b
        if (argb.size != frame.pixelCount) argb = IntArray(frame.pixelCount)
        ThermalRenderer.render(frame, palette, argb, clipPercent)
        val out = ThermalFrameProcessor.toBitmap(argb, frame.width, frame.height, b)
        bitmap = out; lastFrameId = frame.frameId; lastPalette = palette
        return out
    }
}

/** Draws the live thermal frame scaled to fit, with an overlay message when there is none. */
@Composable
fun ThermalView(frame: ThermalFrame?, palette: ThermalPalette, modifier: Modifier = Modifier, placeholder: String = "WAITING FOR THERMAL CAMERA", showReticle: Boolean = true) {
    val state = remember { ThermalViewState() }
    Box(modifier.background(Color.Black), contentAlignment = Alignment.Center) {
        if (frame == null) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(placeholder, color = RdColors.Muted, style = MaterialTheme.typography.labelSmall)
            }
        } else {
            val bmp = state.render(frame, palette)
            val image = bmp.asImageBitmap()
            Canvas(Modifier.fillMaxSize()) {
                val scale = minOf(size.width / frame.width, size.height / frame.height)
                val dw = frame.width * scale; val dh = frame.height * scale
                val ox = (size.width - dw) / 2; val oy = (size.height - dh) / 2
                drawImage(image, srcOffset = IntOffset.Zero, srcSize = IntSize(frame.width, frame.height),
                    dstOffset = IntOffset(ox.toInt(), oy.toInt()), dstSize = IntSize(dw.toInt(), dh.toInt()), filterQuality = FilterQuality.None)
                if (showReticle) {
                    val cx = ox + dw / 2; val cy = oy + dh / 2
                    drawLine(Color.White, Offset(cx - 12, cy), Offset(cx + 12, cy), 2f)
                    drawLine(Color.White, Offset(cx, cy - 12), Offset(cx, cy + 12), 2f)
                    frame.radiometric?.let { r ->
                        val mx = ox + (r.maxIndex % frame.width) * scale; val my = oy + (r.maxIndex / frame.width) * scale
                        drawCircle(Color.Red, 6f, Offset(mx, my), style = androidx.compose.ui.graphics.drawscope.Stroke(2f))
                    }
                }
            }
            SimulationBadge(frame.source, Modifier.align(Alignment.TopStart).padding(8.dp))
        }
    }
}
