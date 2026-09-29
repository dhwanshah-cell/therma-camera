package com.robodog.app.thermal

import com.robodog.app.thermal.radiometric.RadiometricDecoders
import com.robodog.app.thermal.radiometric.StackedRaw16Kelvin64Decoder
import com.robodog.app.thermal.radiometric.Y16CentiKelvinDecoder
import com.robodog.app.thermal.usb.UvcPixelFormat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RadiometricDecoderTest {
    @Test fun noneDecoderNeverProducesTemperatures() {
        assertNull(RadiometricDecoders.NONE.decode(4, 4, UvcPixelFormat.Y16, FrameLayout.SINGLE, IntArray(16) { 30000 }, null))
    }

    @Test fun stackedDecoderRequiresStackedLayoutAndRawHalf() {
        assertNull(StackedRaw16Kelvin64Decoder.decode(2, 2, UvcPixelFormat.YUY2, FrameLayout.SINGLE, IntArray(4), null))
        assertNull(StackedRaw16Kelvin64Decoder.decode(2, 2, UvcPixelFormat.YUY2, FrameLayout.STACKED_IMAGE_RAW, IntArray(4), null))
    }

    @Test fun stackedDecoderConvertsKelvinTimes64() {
        // 300 K * 64 = 19200 = 0x4B00 → 26.85 °C
        val raw = ByteArray(8) { i -> if (i % 2 == 0) 0x00 else 0x4B }
        val r = StackedRaw16Kelvin64Decoder.decode(2, 2, UvcPixelFormat.YUY2, FrameLayout.STACKED_IMAGE_RAW, IntArray(4), raw)!!
        assertEquals(26.85f, r.centerC, 0.01f); assertEquals(26.85f, r.maxC, 0.01f)
    }

    @Test fun implausibleValuesAreRejected() {
        val raw = ByteArray(8) { 0xFF.toByte() } // 65535/64 - 273 = 750 °C, outside plausible range
        assertNull(StackedRaw16Kelvin64Decoder.decode(2, 2, UvcPixelFormat.YUY2, FrameLayout.STACKED_IMAGE_RAW, IntArray(4), raw))
    }

    @Test fun y16CentiKelvinOnlyForY16() {
        assertNull(Y16CentiKelvinDecoder.decode(1, 1, UvcPixelFormat.YUY2, FrameLayout.SINGLE, intArrayOf(30000), null))
        val r = Y16CentiKelvinDecoder.decode(1, 1, UvcPixelFormat.Y16, FrameLayout.SINGLE, intArrayOf(31000), null)!!
        assertEquals(36.85f, r.centerC, 0.01f)
    }

    @Test fun byIdFallsBackToNone() {
        assertEquals("NONE", RadiometricDecoders.byId("does-not-exist").id)
        assertEquals("STACKED_RAW16_K64", RadiometricDecoders.byId("STACKED_RAW16_K64").id)
    }
}
