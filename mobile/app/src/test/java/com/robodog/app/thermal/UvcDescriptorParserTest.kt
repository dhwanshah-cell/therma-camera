package com.robodog.app.thermal

import com.robodog.app.thermal.usb.UsbDeviceMatcher
import com.robodog.app.thermal.usb.UvcDescriptorParser
import com.robodog.app.thermal.usb.UvcFormatKind
import com.robodog.app.thermal.usb.UvcModeSelector
import com.robodog.app.thermal.usb.UvcPixelFormat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Builds a synthetic descriptor blob shaped like a UVC thermal camera (VID 0x0F7E / PID 0x00BC,
 * one VideoControl and one VideoStreaming interface, YUY2 256x192 @25fps and 256x384 stacked,
 * plus MJPEG) and checks the parser and mode selector. This exercises the parsing logic only —
 * it is not a substitute for the real TC01A descriptors, which the app dumps on the THERMAL screen.
 */
class UvcDescriptorParserTest {
    private fun le16(v: Int) = byteArrayOf((v and 0xFF).toByte(), ((v shr 8) and 0xFF).toByte())
    private fun le32(v: Long) = byteArrayOf((v and 0xFF).toByte(), ((v shr 8) and 0xFF).toByte(), ((v shr 16) and 0xFF).toByte(), ((v shr 24) and 0xFF).toByte())
    private fun desc(type: Int, vararg body: ByteArray): ByteArray {
        val content = body.fold(ByteArray(0)) { a, b -> a + b }
        return byteArrayOf((content.size + 2).toByte(), type.toByte()) + content
    }
    private val yuy2Guid = byteArrayOf('Y'.code.toByte(), 'U'.code.toByte(), 'Y'.code.toByte(), '2'.code.toByte(), 0, 0, 0x10, 0, 0x80.toByte(), 0, 0, 0xAA.toByte(), 0, 0x38, 0x9B.toByte(), 0x71)

    private fun frameUncompressed(index: Int, w: Int, h: Int, interval: Long) = desc(0x24,
        byteArrayOf(0x05, index.toByte(), 0x00), le16(w), le16(h), le32(w * h * 16L * 25), le32(w * h * 16L * 25),
        le32(w * h * 2L), le32(interval), byteArrayOf(0x01), le32(interval))

    private fun blob(): ByteArray {
        val device = desc(0x01, le16(0x0200), byteArrayOf(0xEF.toByte(), 0x02, 0x01, 0x40), le16(0x0F7E), le16(0x00BC), le16(0x0100), byteArrayOf(1, 2, 3, 1))
        val vcHeader = desc(0x24, byteArrayOf(0x01), le16(0x0110), le16(0), le32(6_000_000), byteArrayOf(1, 1))
        val inputTerminal = desc(0x24, byteArrayOf(0x02, 0x01), le16(0x0201), byteArrayOf(0, 0), le16(0), le16(0), le16(0), byteArrayOf(0x03, 0x00, 0x00, 0x00))
        val outputTerminal = desc(0x24, byteArrayOf(0x03, 0x03), le16(0x0101), byteArrayOf(0, 0x02, 0))
        val processingUnit = desc(0x24, byteArrayOf(0x05, 0x02, 0x01), le16(0), byteArrayOf(0x02, 0x7F, 0x00, 0x00))
        val vcInterface = desc(0x04, byteArrayOf(0, 0, 1, 0x0E, 0x01, 0x00, 0))
        val vcEndpoint = desc(0x05, byteArrayOf(0x83.toByte(), 0x03), le16(16), byteArrayOf(8))
        val vsInterface = desc(0x04, byteArrayOf(1, 0, 1, 0x0E, 0x02, 0x00, 0))
        val vsHeader = desc(0x24, byteArrayOf(0x01, 0x02), le16(0), byteArrayOf(0x81.toByte(), 0x00, 0x02, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00))
        val fmtYuy2 = desc(0x24, byteArrayOf(0x04, 0x01, 0x02), yuy2Guid, byteArrayOf(16, 1, 0, 0, 0, 0, 0))
        val f1 = frameUncompressed(1, 256, 192, 400_000)
        val f2 = frameUncompressed(2, 256, 384, 400_000)
        val fmtMjpeg = desc(0x24, byteArrayOf(0x06, 0x02, 0x01, 0x01, 0x01, 0, 0, 0, 0))
        val fm1 = desc(0x24, byteArrayOf(0x07, 0x01, 0x00), le16(640), le16(480), le32(1), le32(1), le32(640 * 480 * 2L), le32(333_333), byteArrayOf(0x01), le32(333_333))
        val vsEndpoint = desc(0x05, byteArrayOf(0x81.toByte(), 0x02), le16(512), byteArrayOf(0))
        val body = vcInterface + vcHeader + inputTerminal + outputTerminal + processingUnit + vcEndpoint + vsInterface + vsHeader + fmtYuy2 + f1 + f2 + fmtMjpeg + fm1 + vsEndpoint
        val config = desc(0x02, le16(body.size + 9), byteArrayOf(2, 1, 0, 0x80.toByte(), 250.toByte()))
        return device + config + body
    }

    @Test fun parsesDeviceIdentity() {
        val d = UvcDescriptorParser.parse(blob())
        assertEquals(0x0F7E, d.vendorId); assertEquals(0x00BC, d.productId)
        assertTrue(d.isUvc); assertTrue(d.hasStreaming)
        assertTrue(d.warnings.isEmpty())
    }

    @Test fun parsesControlInterface() {
        val vc = UvcDescriptorParser.parse(blob()).controlInterface!!
        assertEquals(0, vc.interfaceNumber); assertEquals(0x0110, vc.bcdUVC); assertEquals(6_000_000L, vc.clockFrequency)
        assertTrue(vc.inputTerminals.single().isCamera)
        assertEquals(1, vc.processingUnits.size)
    }

    @Test fun parsesStreamingFormatsAndFrames() {
        val vs = UvcDescriptorParser.parse(blob()).streamingInterfaces.single()
        assertEquals(1, vs.interfaceNumber); assertEquals(0x81, vs.endpointAddress)
        assertEquals(2, vs.formats.size)
        val yuy2 = vs.formats[0]
        assertEquals(UvcFormatKind.UNCOMPRESSED, yuy2.kind); assertEquals(UvcPixelFormat.YUY2, yuy2.pixelFormat); assertEquals("YUY2", yuy2.fourcc)
        assertEquals(listOf(256 to 192, 256 to 384), yuy2.frames.map { it.width to it.height })
        assertEquals(25.0, yuy2.frames[0].defaultFps()!!, 0.01)
        val mjpeg = vs.formats[1]
        assertEquals(UvcPixelFormat.MJPEG, mjpeg.pixelFormat); assertEquals(640, mjpeg.frames.single().width)
    }

    @Test fun endpointsAreClassified() {
        val d = UvcDescriptorParser.parse(blob())
        val vsIf = d.interfaces.first { it.number == 1 }
        assertEquals("BULK", vsIf.endpoints.single().transferType)
        assertTrue(vsIf.endpoints.single().isInput)
        assertEquals("INTERRUPT", d.interfaces.first { it.number == 0 }.endpoints.single().transferType)
    }

    @Test fun selectsStackedYuy2OverNativeAndMjpeg() {
        val mode = UvcModeSelector.select(UvcDescriptorParser.parse(blob()))!!
        assertEquals(1, mode.format.formatIndex); assertEquals(2, mode.frame.frameIndex)
        assertEquals(256, mode.frame.width); assertEquals(384, mode.frame.height)
        assertEquals(400_000L, mode.frameInterval)
        assertTrue(mode.reason.contains("stacked"))
    }

    @Test fun forcedModeIsHonoured() {
        val mode = UvcModeSelector.select(UvcDescriptorParser.parse(blob()), UvcModeSelector.Preference(forcedFormatIndex = 2, forcedFrameIndex = 1))!!
        assertEquals(UvcPixelFormat.MJPEG, mode.format.pixelFormat)
        assertEquals("forced by settings", mode.reason)
    }

    @Test fun truncatedBlobDoesNotCrash() {
        val d = UvcDescriptorParser.parse(blob().copyOf(60))
        assertNotNull(d)
        assertTrue(d.warnings.isNotEmpty() || d.streamingInterfaces.isEmpty())
    }

    @Test fun emptyBlobIsNotUvc() {
        val d = UvcDescriptorParser.parse(ByteArray(0))
        assertFalse(d.isUvc); assertNull(UvcModeSelector.select(d))
    }

    @Test fun guidFormatting() {
        assertEquals("32595559-0000-0010-8000-00aa00389b71", UvcDescriptorParser.guid(yuy2Guid, 0))
    }

    @Test fun pixelFormatIdentification() {
        assertEquals(UvcPixelFormat.Y16, UvcDescriptorParser.pixelFormatFor(UvcFormatKind.UNCOMPRESSED, "", "Y16 ", 16))
        assertEquals(UvcPixelFormat.Y8, UvcDescriptorParser.pixelFormatFor(UvcFormatKind.UNCOMPRESSED, "", "GREY", 8))
        assertEquals(UvcPixelFormat.NV12, UvcDescriptorParser.pixelFormatFor(UvcFormatKind.UNCOMPRESSED, "", "NV12", 12))
        assertEquals(UvcPixelFormat.MJPEG, UvcDescriptorParser.pixelFormatFor(UvcFormatKind.MJPEG, "", "MJPG", 0))
        assertEquals(UvcPixelFormat.UNKNOWN, UvcDescriptorParser.pixelFormatFor(UvcFormatKind.UNCOMPRESSED, "deadbeef-0000-0000-0000-000000000000", "????", 16))
    }

    @Test fun deviceMatcherIdentifiesTc01aAndGenericUvc() {
        assertTrue(UsbDeviceMatcher.isTc01a(0x0F7E, 0x00BC))
        assertFalse(UsbDeviceMatcher.isTc01a(0x0F7E, 0x00BD))
        val tc01a = UsbDeviceMatcher.Candidate(0x0F7E, 0x00BC, 0xEF, 2, listOf(0x0E to 1, 0x0E to 2))
        val webcam = UsbDeviceMatcher.Candidate(0x046D, 0x0825, 0xEF, 2, listOf(0x0E to 1, 0x0E to 2, 0x01 to 1))
        val storage = UsbDeviceMatcher.Candidate(0x0781, 0x5581, 0, 0, listOf(0x08 to 6))
        assertEquals(UsbDeviceMatcher.Match.TC01A, UsbDeviceMatcher.classify(tc01a))
        assertEquals(UsbDeviceMatcher.Match.GENERIC_UVC, UsbDeviceMatcher.classify(webcam))
        assertEquals(UsbDeviceMatcher.Match.NONE, UsbDeviceMatcher.classify(storage))
        assertEquals(tc01a, UsbDeviceMatcher.pickCamera(listOf(storage, webcam, tc01a)) { it })
        assertEquals(webcam, UsbDeviceMatcher.pickCamera(listOf(storage, webcam)) { it })
        assertNull(UsbDeviceMatcher.pickCamera(listOf(storage)) { it })
    }
}
