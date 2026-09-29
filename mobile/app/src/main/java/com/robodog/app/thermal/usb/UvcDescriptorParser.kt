package com.robodog.app.thermal.usb

import java.util.Locale

/**
 * Parses the raw USB descriptor blob (device descriptor followed by the full
 * configuration descriptor tree) that Android exposes through
 * `UsbDeviceConnection.rawDescriptors`, and extracts everything the app needs to
 * pick a real stream mode on the Fluke iSee TC01A.
 *
 * The parser is deliberately defensive: malformed or truncated descriptors are
 * skipped and reported in [UvcDeviceDescription.warnings] instead of crashing.
 */
object UvcDescriptorParser {
    private const val DT_DEVICE = 0x01
    private const val DT_CONFIGURATION = 0x02
    private const val DT_INTERFACE = 0x04
    private const val DT_ENDPOINT = 0x05
    private const val DT_INTERFACE_ASSOCIATION = 0x0B
    private const val DT_CS_INTERFACE = 0x24
    private const val DT_CS_ENDPOINT = 0x25

    private const val CLASS_VIDEO = 0x0E
    private const val SC_VIDEOCONTROL = 0x01
    private const val SC_VIDEOSTREAMING = 0x02

    // VideoControl CS_INTERFACE subtypes
    private const val VC_HEADER = 0x01
    private const val VC_INPUT_TERMINAL = 0x02
    private const val VC_OUTPUT_TERMINAL = 0x03
    private const val VC_SELECTOR_UNIT = 0x04
    private const val VC_PROCESSING_UNIT = 0x05
    private const val VC_EXTENSION_UNIT = 0x06

    // VideoStreaming CS_INTERFACE subtypes
    private const val VS_INPUT_HEADER = 0x01
    private const val VS_FORMAT_UNCOMPRESSED = 0x04
    private const val VS_FRAME_UNCOMPRESSED = 0x05
    private const val VS_FORMAT_MJPEG = 0x06
    private const val VS_FRAME_MJPEG = 0x07
    private const val VS_FORMAT_MPEG2TS = 0x0A
    private const val VS_FORMAT_DV = 0x0C
    private const val VS_FORMAT_FRAME_BASED = 0x10
    private const val VS_FRAME_FRAME_BASED = 0x11
    private const val VS_FORMAT_STREAM_BASED = 0x12
    private const val VS_FORMAT_H264 = 0x13
    private const val VS_FRAME_H264 = 0x14

    fun parse(raw: ByteArray): UvcDeviceDescription {
        val warnings = mutableListOf<String>()
        var vendorId = 0; var productId = 0; var bcdDevice = 0; var bcdUsb = 0
        var devClass = 0; var devSub = 0; var devProto = 0; var numConfigs = 0

        val interfaces = mutableListOf<UsbInterfaceInfo>()
        val streaming = mutableListOf<UvcStreamingInterface>()
        var control: UvcControlInterface? = null

        // Current parse state
        var curIf: MutableInterface? = null
        var vcBuilder: MutableControl? = null
        var vsBuilder: MutableStreaming? = null
        var curFormat: MutableFormat? = null

        fun flushInterface() {
            curIf?.let { interfaces += it.toInfo() }
            curIf = null
        }
        fun flushFormat() {
            curFormat?.let { f -> vsBuilder?.formats?.add(f.toFormat()) }
            curFormat = null
        }
        fun flushStreaming() {
            flushFormat()
            vsBuilder?.let { streaming += it.toStreaming() }
            vsBuilder = null
        }
        fun flushControl() {
            vcBuilder?.let { control = it.toControl() }
            vcBuilder = null
        }

        var pos = 0
        while (pos + 2 <= raw.size) {
            val len = raw[pos].toInt() and 0xFF
            val type = raw[pos + 1].toInt() and 0xFF
            if (len < 2) { warnings += "descriptor with length $len at offset $pos; stopping"; break }
            if (pos + len > raw.size) { warnings += "truncated descriptor type 0x%02X at offset %d".format(type, pos); break }
            val d = raw.copyOfRange(pos, pos + len)
            when (type) {
                DT_DEVICE -> if (len >= 18) {
                    bcdUsb = u16(d, 2); devClass = u8(d, 4); devSub = u8(d, 5); devProto = u8(d, 6)
                    vendorId = u16(d, 8); productId = u16(d, 10); bcdDevice = u16(d, 12); numConfigs = u8(d, 17)
                }
                DT_CONFIGURATION -> { /* wTotalLength at 2; nothing else needed */ }
                DT_INTERFACE_ASSOCIATION -> { /* informational */ }
                DT_INTERFACE -> if (len >= 9) {
                    flushInterface()
                    val number = u8(d, 2); val alt = u8(d, 3)
                    val cls = u8(d, 5); val sub = u8(d, 6); val proto = u8(d, 7)
                    curIf = MutableInterface(number, alt, cls, sub, proto)
                    if (cls == CLASS_VIDEO && alt == 0) {
                        when (sub) {
                            SC_VIDEOCONTROL -> { flushStreaming(); flushControl(); vcBuilder = MutableControl(number) }
                            SC_VIDEOSTREAMING -> { flushControl(); flushStreaming(); vsBuilder = MutableStreaming(number) }
                            else -> { flushControl(); flushStreaming() }
                        }
                    } else if (alt == 0) {
                        flushControl(); flushStreaming()
                    }
                }
                DT_ENDPOINT -> if (len >= 7) {
                    val maxPacketRaw = u16(d, 4)
                    curIf?.endpoints?.add(
                        UsbEndpointInfo(
                            address = u8(d, 2),
                            attributes = u8(d, 3),
                            maxPacketSize = maxPacketRaw and 0x07FF,
                            transactionsPerMicroframe = ((maxPacketRaw shr 11) and 0x03) + 1,
                            interval = u8(d, 6),
                        )
                    )
                }
                DT_CS_INTERFACE -> {
                    val sub = if (len >= 3) u8(d, 2) else -1
                    val vc = vcBuilder
                    val vs = vsBuilder
                    if (vc != null && curIf?.interfaceSubClass == SC_VIDEOCONTROL) parseControlCs(vc, sub, d, warnings)
                    else if (vs != null && curIf?.interfaceSubClass == SC_VIDEOSTREAMING) {
                        when (sub) {
                            VS_INPUT_HEADER -> if (len >= 13) { vs.endpointAddress = u8(d, 6); vs.stillCaptureMethod = u8(d, 9) }
                            VS_FORMAT_UNCOMPRESSED -> if (len >= 27) {
                                flushFormat()
                                curFormat = MutableFormat(vs.interfaceNumber, u8(d, 3), UvcFormatKind.UNCOMPRESSED,
                                    guid(d, 5), fourcc(d, 5), u8(d, 21), u8(d, 22))
                            }
                            VS_FORMAT_MJPEG -> if (len >= 11) {
                                flushFormat()
                                curFormat = MutableFormat(vs.interfaceNumber, u8(d, 3), UvcFormatKind.MJPEG, "", "MJPG", 0, u8(d, 6))
                            }
                            VS_FORMAT_FRAME_BASED -> if (len >= 28) {
                                flushFormat()
                                curFormat = MutableFormat(vs.interfaceNumber, u8(d, 3), UvcFormatKind.FRAME_BASED,
                                    guid(d, 5), fourcc(d, 5), u8(d, 21), u8(d, 22))
                            }
                            VS_FORMAT_H264 -> { flushFormat(); curFormat = MutableFormat(vs.interfaceNumber, u8(d, 3), UvcFormatKind.H264, "", "H264", 0, 1) }
                            VS_FORMAT_MPEG2TS -> { flushFormat(); curFormat = MutableFormat(vs.interfaceNumber, u8(d, 3), UvcFormatKind.MPEG2TS, "", "MP2T", 0, 1) }
                            VS_FORMAT_DV -> { flushFormat(); curFormat = MutableFormat(vs.interfaceNumber, u8(d, 3), UvcFormatKind.DV, "", "DV  ", 0, 1) }
                            VS_FORMAT_STREAM_BASED -> { flushFormat(); curFormat = MutableFormat(vs.interfaceNumber, u8(d, 3), UvcFormatKind.STREAM_BASED, guid(d, 4), fourcc(d, 4), 0, 1) }
                            VS_FRAME_UNCOMPRESSED, VS_FRAME_MJPEG -> if (len >= 26) {
                                val f = curFormat
                                if (f == null) warnings += "frame descriptor before any format descriptor"
                                else f.frames += parseFrame(d, dwMaxVideoFrameBufferSizeAt = 17, defaultIntervalAt = 21, intervalTypeAt = 25, intervalsAt = 26)
                            }
                            VS_FRAME_FRAME_BASED -> if (len >= 26) {
                                // Frame-based frames: no dwMaxVideoFrameBufferSize; layout differs
                                val f = curFormat
                                if (f == null) warnings += "frame-based frame descriptor before any format descriptor"
                                else f.frames += parseFrame(d, dwMaxVideoFrameBufferSizeAt = -1, defaultIntervalAt = 17, intervalTypeAt = 21, intervalsAt = 26)
                            }
                            VS_FRAME_H264 -> { /* rarely used on thermal cameras; ignore */ }
                            else -> { /* COLORFORMAT, STILL_IMAGE_FRAME etc. */ }
                        }
                    }
                }
                DT_CS_ENDPOINT -> { /* interrupt endpoint class descriptor; ignore */ }
                else -> { /* string, BOS, etc. */ }
            }
            pos += len
        }
        flushInterface(); flushControl(); flushStreaming()

        return UvcDeviceDescription(
            vendorId, productId, bcdDevice, bcdUsb, devClass, devSub, devProto, numConfigs,
            interfaces, control, streaming, warnings,
        )
    }

    private fun parseControlCs(vc: MutableControl, sub: Int, d: ByteArray, warnings: MutableList<String>) {
        when (sub) {
            VC_HEADER -> if (d.size >= 12) { vc.bcdUVC = u16(d, 3); vc.clockFrequency = u32(d, 7) }
            VC_INPUT_TERMINAL -> if (d.size >= 8) {
                val id = u8(d, 3); val ttype = u16(d, 4)
                val controls = if (ttype == 0x0201 && d.size >= 15) {
                    val n = u8(d, 14)
                    bitmap(d, 15, n)
                } else 0L
                vc.inputTerminals += UvcInputTerminal(id, ttype, controls)
            }
            VC_OUTPUT_TERMINAL -> if (d.size >= 9) vc.outputTerminals += UvcOutputTerminal(u8(d, 3), u16(d, 4), u8(d, 7))
            VC_PROCESSING_UNIT -> if (d.size >= 8) {
                val n = u8(d, 7)
                vc.processingUnits += UvcProcessingUnit(u8(d, 3), u8(d, 4), bitmap(d, 8, n))
            }
            VC_EXTENSION_UNIT -> if (d.size >= 22) {
                val id = u8(d, 3); val g = guid(d, 4); val numPins = u8(d, 21)
                val ctrlSizeAt = 22 + numPins
                val controls = if (d.size > ctrlSizeAt) bitmap(d, ctrlSizeAt + 1, u8(d, ctrlSizeAt)) else 0L
                vc.extensionUnits += UvcExtensionUnit(id, g, controls)
            }
            VC_SELECTOR_UNIT -> { /* not needed */ }
            else -> warnings += "unknown VideoControl subtype 0x%02X".format(sub)
        }
    }

    private fun parseFrame(d: ByteArray, dwMaxVideoFrameBufferSizeAt: Int, defaultIntervalAt: Int, intervalTypeAt: Int, intervalsAt: Int): UvcFrame {
        val idx = u8(d, 3)
        val w = u16(d, 5); val h = u16(d, 7)
        val maxBuf = if (dwMaxVideoFrameBufferSizeAt > 0 && d.size >= dwMaxVideoFrameBufferSizeAt + 4) u32(d, dwMaxVideoFrameBufferSizeAt) else 0L
        val defInterval = if (d.size >= defaultIntervalAt + 4) u32(d, defaultIntervalAt) else 0L
        val type = if (d.size > intervalTypeAt) u8(d, intervalTypeAt) else 0
        val intervals = mutableListOf<Long>()
        val continuous = type == 0
        val count = if (continuous) 3 else type
        for (i in 0 until count) {
            val at = intervalsAt + i * 4
            if (d.size >= at + 4) intervals += u32(d, at)
        }
        return UvcFrame(idx, w, h, defInterval, maxBuf, intervals, continuous)
    }

    // ---- format identification ---------------------------------------------------------

    private const val GUID_TAIL = "-0000-0010-8000-00aa00389b71"

    fun pixelFormatFor(kind: UvcFormatKind, guid: String, fourcc: String, bitsPerPixel: Int): UvcPixelFormat {
        if (kind == UvcFormatKind.MJPEG) return UvcPixelFormat.MJPEG
        if (kind == UvcFormatKind.H264) return UvcPixelFormat.H264
        val fc = fourcc.uppercase(Locale.US).trim()
        return when {
            fc == "YUY2" || fc == "YUYV" -> UvcPixelFormat.YUY2
            fc == "UYVY" -> UvcPixelFormat.UYVY
            fc == "NV12" -> UvcPixelFormat.NV12
            fc == "I420" || fc == "IYUV" || fc == "YU12" -> UvcPixelFormat.I420
            fc == "Y16" || fc == "Y16 " -> UvcPixelFormat.Y16
            fc == "Y8" || fc == "Y800" || fc == "GREY" || fc == "GRAY" || fc == "Y8  " -> UvcPixelFormat.Y8
            fc == "RGBP" || fc == "RGB3" -> UvcPixelFormat.RGB24
            fc == "BGR3" -> UvcPixelFormat.BGR24
            guid.lowercase(Locale.US).endsWith(GUID_TAIL) && bitsPerPixel == 16 && kind == UvcFormatKind.UNCOMPRESSED -> UvcPixelFormat.UNKNOWN
            fc == "H264" -> UvcPixelFormat.H264
            bitsPerPixel == 8 && kind == UvcFormatKind.UNCOMPRESSED -> UvcPixelFormat.Y8
            else -> UvcPixelFormat.UNKNOWN
        }
    }

    // ---- byte helpers -------------------------------------------------------------------

    private fun u8(d: ByteArray, at: Int) = d[at].toInt() and 0xFF
    private fun u16(d: ByteArray, at: Int) = u8(d, at) or (u8(d, at + 1) shl 8)
    private fun u32(d: ByteArray, at: Int): Long =
        (u8(d, at).toLong()) or (u8(d, at + 1).toLong() shl 8) or (u8(d, at + 2).toLong() shl 16) or (u8(d, at + 3).toLong() shl 24)

    private fun bitmap(d: ByteArray, at: Int, n: Int): Long {
        var v = 0L
        for (i in 0 until minOf(n, 8)) if (d.size > at + i) v = v or (u8(d, at + i).toLong() shl (8 * i))
        return v
    }

    private fun fourcc(d: ByteArray, at: Int): String = buildString {
        for (i in 0 until 4) { val c = u8(d, at + i); append(if (c in 0x20..0x7E) c.toChar() else '?') }
    }

    /** GUID in canonical text form (little-endian first three groups). */
    fun guid(d: ByteArray, at: Int): String {
        if (d.size < at + 16) return ""
        val g = d.copyOfRange(at, at + 16).map { it.toInt() and 0xFF }
        return "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x".format(
            g[3], g[2], g[1], g[0], g[5], g[4], g[7], g[6], g[8], g[9], g[10], g[11], g[12], g[13], g[14], g[15])
    }

    // ---- builders -----------------------------------------------------------------------

    private class MutableInterface(val number: Int, val alt: Int, val interfaceClass: Int, val interfaceSubClass: Int, val proto: Int) {
        val endpoints = mutableListOf<UsbEndpointInfo>()
        fun toInfo() = UsbInterfaceInfo(number, alt, interfaceClass, interfaceSubClass, proto, endpoints.toList())
    }
    private class MutableControl(val interfaceNumber: Int) {
        var bcdUVC = 0; var clockFrequency = 0L
        val inputTerminals = mutableListOf<UvcInputTerminal>()
        val outputTerminals = mutableListOf<UvcOutputTerminal>()
        val processingUnits = mutableListOf<UvcProcessingUnit>()
        val extensionUnits = mutableListOf<UvcExtensionUnit>()
        fun toControl() = UvcControlInterface(interfaceNumber, bcdUVC, clockFrequency, inputTerminals.toList(), outputTerminals.toList(), processingUnits.toList(), extensionUnits.toList())
    }
    private class MutableStreaming(val interfaceNumber: Int) {
        var endpointAddress = 0; var stillCaptureMethod = 0
        val formats = mutableListOf<UvcFormat>()
        fun toStreaming() = UvcStreamingInterface(interfaceNumber, endpointAddress, stillCaptureMethod, formats.toList())
    }
    private class MutableFormat(val interfaceNumber: Int, val formatIndex: Int, val kind: UvcFormatKind, val guid: String, val fourcc: String, val bpp: Int, val defaultFrameIndex: Int) {
        val frames = mutableListOf<UvcFrame>()
        fun toFormat() = UvcFormat(interfaceNumber, formatIndex, kind, guid, fourcc, bpp, defaultFrameIndex, frames.toList())
    }
}
