package com.robodog.app.thermal

import com.robodog.app.thermal.palette.ThermalPalette
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PixelConvertersTest {
    @Test fun yuy2LumaExtractsEveryOtherByte() {
        val src = byteArrayOf(10, 128.toByte(), 20, 128.toByte(), 30, 128.toByte(), 40, 128.toByte())
        val out = IntArray(4)
        val r = PixelConverters.yuy2Luma(src, 4, 1, out)
        assertEquals(listOf(10, 20, 30, 40), out.toList()); assertEquals(10, r.first); assertEquals(40, r.last)
    }

    @Test fun greyYuy2HasNoChroma() {
        val src = ByteArray(256 * 2) { i -> if (i % 2 == 0) (i / 2).toByte() else 128.toByte() }
        val out = IntArray(256)
        assertFalse(PixelConverters.yuy2ToArgb(src, 256, 1, out))
    }

    @Test fun colouredYuy2HasChroma() {
        val src = ByteArray(256 * 2) { i -> if (i % 2 == 0) 100 else if (i % 4 == 1) 60 else 200.toByte() }
        val out = IntArray(256)
        assertTrue(PixelConverters.yuy2ToArgb(src, 256, 1, out))
        assertEquals(0xFF, (out[0] ushr 24))
    }

    @Test fun gray16LittleEndian() {
        val src = byteArrayOf(0x34, 0x12, 0xFF.toByte(), 0xFF.toByte())
        val out = IntArray(2)
        val r = PixelConverters.gray16(src, 2, out)
        assertEquals(0x1234, out[0]); assertEquals(0xFFFF, out[1]); assertEquals(0x1234, r.first)
    }

    @Test fun palettesHave256EntriesAndOpaque() {
        ThermalPalette.entries.forEach { p ->
            assertEquals(256, p.lut.size)
            assertTrue(p.lut.all { (it ushr 24) == 0xFF })
        }
        assertEquals(0xFF000000.toInt(), ThermalPalette.WHITE_HOT.lut[0]); assertEquals(0xFFFFFFFF.toInt(), ThermalPalette.WHITE_HOT.lut[255])
        assertEquals(0xFFFFFFFF.toInt(), ThermalPalette.BLACK_HOT.lut[0])
    }
}
