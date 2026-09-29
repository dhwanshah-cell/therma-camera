package com.robodog.app.thermal.sim

import com.robodog.app.core.DataSource
import com.robodog.app.core.Ids
import com.robodog.app.core.RoboDogConstants
import com.robodog.app.thermal.FrameLayout
import com.robodog.app.thermal.ThermalFrame
import com.robodog.app.thermal.usb.UvcPixelFormat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.exp
import kotlin.math.sin

/**
 * SIMULATION MODE thermal source. Generates synthetic intensity frames so the UI, capture,
 * recording and mapping pipelines can be exercised without the camera. Every frame is
 * tagged [DataSource.SIMULATION]; it never carries temperatures and is never mixed with
 * the real [com.robodog.app.thermal.uvc.UvcCamera] path.
 */
class ThermalSimulator(private val scope: CoroutineScope) {
    private val width = RoboDogConstants.TC01A_WIDTH
    private val height = RoboDogConstants.TC01A_HEIGHT
    private val _frame = MutableStateFlow<ThermalFrame?>(null)
    val latestFrame: StateFlow<ThermalFrame?> = _frame.asStateFlow()
    private var job: Job? = null
    val running: Boolean get() = job?.isActive == true

    fun start(fps: Int = 12) {
        if (running) return
        job = scope.launch {
            var seq = 0
            val t0 = System.currentTimeMillis()
            while (isActive) {
                val t = (System.currentTimeMillis() - t0) / 1000.0
                _frame.value = generate(seq++, t)
                delay((1000L / fps).coerceAtLeast(16))
            }
        }
    }

    fun stop() { job?.cancel(); job = null; _frame.value = null }

    fun generate(seq: Int, t: Double): ThermalFrame {
        val n = width * height
        val data = IntArray(n)
        val cx = width * (0.5 + 0.3 * sin(t * 0.7)); val cy = height * (0.5 + 0.25 * sin(t * 1.1 + 1.0))
        val cx2 = width * (0.3 + 0.2 * sin(t * 0.4 + 2.0)); val cy2 = height * 0.7
        var mn = Int.MAX_VALUE; var mx = 0
        for (y in 0 until height) for (x in 0 until width) {
            val dx = x - cx; val dy = y - cy
            val dx2 = x - cx2; val dy2 = y - cy2
            val blob = exp(-(dx * dx + dy * dy) / 900.0) * 1.0 + exp(-(dx2 * dx2 + dy2 * dy2) / 2500.0) * 0.6
            val gradient = 0.15 * (y.toDouble() / height)
            val noise = ((x * 7 + y * 13 + seq * 3) % 17) / 17.0 * 0.03
            val v = ((0.1 + gradient + blob + noise) / 1.4 * 65535).toInt().coerceIn(0, 65535)
            data[y * width + x] = v
            if (v < mn) mn = v
            if (v > mx) mx = v
        }
        return ThermalFrame(
            frameId = Ids.frame(), timestampMs = System.currentTimeMillis(), monotonicNs = System.nanoTime(), sequence = seq,
            width = width, height = height, sourceWidth = width, sourceHeight = height, pixelFormat = UvcPixelFormat.Y16,
            intensity = data, intensityBits = 16, intensityMin = mn, intensityMax = mx, cameraColor = null, hasChroma = false,
            rawLowerHalf = null, radiometric = null, source = DataSource.SIMULATION, layout = FrameLayout.SINGLE,
        )
    }
}
