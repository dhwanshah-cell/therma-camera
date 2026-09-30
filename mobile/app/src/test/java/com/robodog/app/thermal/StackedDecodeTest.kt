package com.robodog.app.thermal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The stacked-frame auto-detector must pick the half/format that looks like a picture, never noise. */
class StackedDecodeTest {
    private val w = 64; private val h = 48

    private fun frame(imageTop: Boolean, raw16Image: Boolean): ByteArray {
        val n = w * h
        val buf = ByteArray(n * 4)
        val rnd = java.util.Random(7)
        val imgOff = if (imageTop) 0 else n * 2
        val noiseOff = if (imageTop) n * 2 else 0
        for (i in 0 until n) {
            val x = i % w; val y = i / w
            val v = 30 + x * 2 + y // smooth gradient
            if (raw16Image) { val s = 30000 + v * 40; buf[imgOff + i * 2] = (s and 0xFF).toByte(); buf[imgOff + i * 2 + 1] = (s shr 8).toByte() }
            else { buf[imgOff + i * 2] = v.toByte(); buf[imgOff + i * 2 + 1] = 128.toByte() }
            buf[noiseOff + i * 2] = rnd.nextInt(256).toByte(); buf[noiseOff + i * 2 + 1] = (0x80 + rnd.nextInt(3)).toByte()
        }
        return buf
    }

    @Test fun picksYuy2Top() { assertEquals(ThermalFrameProcessor.StackedDecode.YUY2_TOP, ThermalFrameProcessor().chooseStackedDecode(frame(true, false), w, h)) }
    @Test fun picksYuy2Bottom() { assertEquals(ThermalFrameProcessor.StackedDecode.YUY2_BOTTOM, ThermalFrameProcessor().chooseStackedDecode(frame(false, false), w, h)) }
    @Test fun picksRaw16Bottom() { assertEquals(ThermalFrameProcessor.StackedDecode.RAW16_BOTTOM, ThermalFrameProcessor().chooseStackedDecode(frame(false, true), w, h)) }
    @Test fun picksRaw16Top() { assertEquals(ThermalFrameProcessor.StackedDecode.RAW16_TOP, ThermalFrameProcessor().chooseStackedDecode(frame(true, true), w, h)) }

    @Test fun roughnessOrdersSmoothBeforeNoise() {
        val smooth = PixelConverters.roughness({ it % w }, w, h)
        val rnd = java.util.Random(1); val noisy = IntArray(w * h) { rnd.nextInt(256) }
        assertTrue(smooth < PixelConverters.roughness({ noisy[it] }, w, h))
    }
}
