package com.robodog.app.thermal.usb

/**
 * Pure-Kotlin model of the USB / UVC descriptors exposed by a camera.
 * Populated by [UvcDescriptorParser] from the raw descriptor bytes that Android
 * hands out via UsbDeviceConnection.rawDescriptors. No Android dependencies so
 * the parser can be unit-tested on the JVM.
 */
data class UvcDeviceDescription(
    val vendorId: Int,
    val productId: Int,
    val bcdDevice: Int,
    val bcdUsb: Int,
    val deviceClass: Int,
    val deviceSubClass: Int,
    val deviceProtocol: Int,
    val numConfigurations: Int,
    val interfaces: List<UsbInterfaceInfo>,
    val controlInterface: UvcControlInterface?,
    val streamingInterfaces: List<UvcStreamingInterface>,
    val warnings: List<String>,
) {
    /** True when the device carries at least one UVC VideoControl interface. */
    val isUvc: Boolean get() = controlInterface != null
    val hasStreaming: Boolean get() = streamingInterfaces.any { it.formats.isNotEmpty() }

    fun allFrames(): List<Pair<UvcFormat, UvcFrame>> =
        streamingInterfaces.flatMap { si -> si.formats.flatMap { f -> f.frames.map { f to it } } }

    /** Human-readable dump shown on the THERMAL screen so the exact camera layout can be reported. */
    fun dump(): String = buildString {
        appendLine("USB device %04X:%04X bcdDevice=%04X usb=%04X class=%02X/%02X/%02X configs=%d".format(
            vendorId, productId, bcdDevice, bcdUsb, deviceClass, deviceSubClass, deviceProtocol, numConfigurations))
        interfaces.forEach { i ->
            appendLine("  IF ${i.number} alt ${i.altSetting} class=%02X/%02X/%02X eps=${i.endpoints.size} ${uvcSubclassName(i.interfaceClass, i.interfaceSubClass)}".format(
                i.interfaceClass, i.interfaceSubClass, i.interfaceProtocol))
            i.endpoints.forEach { e ->
                appendLine("     EP %02X ${e.transferType} maxPacket=${e.maxPacketSize} x${e.transactionsPerMicroframe} interval=${e.interval}".format(e.address))
            }
        }
        controlInterface?.let { vc ->
            appendLine("VideoControl IF ${vc.interfaceNumber}: bcdUVC=%04X clock=${vc.clockFrequency}Hz".format(vc.bcdUVC))
            vc.inputTerminals.forEach { appendLine("  InputTerminal id=${it.id} type=%04X controls=%06X".format(it.terminalType, it.controls)) }
            vc.outputTerminals.forEach { appendLine("  OutputTerminal id=${it.id} type=%04X source=${it.sourceId}".format(it.terminalType)) }
            vc.processingUnits.forEach { appendLine("  ProcessingUnit id=${it.id} source=${it.sourceId} controls=%06X".format(it.controls)) }
            vc.extensionUnits.forEach { appendLine("  ExtensionUnit id=${it.id} guid=${it.guid} controls=${it.controls.toString(16)}") }
        }
        streamingInterfaces.forEach { vs ->
            appendLine("VideoStreaming IF ${vs.interfaceNumber}: endpoint=%02X formats=${vs.formats.size} stillMethod=${vs.stillCaptureMethod}".format(vs.endpointAddress))
            vs.formats.forEach { f ->
                appendLine("  Format ${f.formatIndex} ${f.kind} fourcc='${f.fourcc}' guid=${f.guid} bpp=${f.bitsPerPixel} default=${f.defaultFrameIndex}")
                f.frames.forEach { fr ->
                    val fps = fr.intervals.map { iv -> if (iv > 0) "%.1f".format(10_000_000.0 / iv) else "?" }
                    appendLine("    Frame ${fr.frameIndex} ${fr.width}x${fr.height} default=${fr.defaultFrameInterval} (${fr.defaultFps()?.let { "%.1f".format(it) } ?: "?"} fps) maxBuf=${fr.maxVideoFrameBufferSize} fps=$fps")
                }
            }
        }
        warnings.forEach { appendLine("WARNING: $it") }
    }

    companion object {
        fun uvcSubclassName(cls: Int, sub: Int): String = when {
            cls == 0x0E && sub == 0x01 -> "[UVC VideoControl]"
            cls == 0x0E && sub == 0x02 -> "[UVC VideoStreaming]"
            cls == 0x0E && sub == 0x03 -> "[UVC InterfaceCollection]"
            cls == 0x01 -> "[Audio]"
            else -> ""
        }
    }
}

data class UsbInterfaceInfo(
    val number: Int,
    val altSetting: Int,
    val interfaceClass: Int,
    val interfaceSubClass: Int,
    val interfaceProtocol: Int,
    val endpoints: List<UsbEndpointInfo>,
)

data class UsbEndpointInfo(
    val address: Int,
    val attributes: Int,
    val maxPacketSize: Int,
    val transactionsPerMicroframe: Int,
    val interval: Int,
) {
    val isInput: Boolean get() = address and 0x80 != 0
    val transferType: String
        get() = when (attributes and 0x03) {
            0 -> "CONTROL"
            1 -> "ISOCHRONOUS"
            2 -> "BULK"
            else -> "INTERRUPT"
        }
}

data class UvcControlInterface(
    val interfaceNumber: Int,
    val bcdUVC: Int,
    val clockFrequency: Long,
    val inputTerminals: List<UvcInputTerminal>,
    val outputTerminals: List<UvcOutputTerminal>,
    val processingUnits: List<UvcProcessingUnit>,
    val extensionUnits: List<UvcExtensionUnit>,
)

data class UvcInputTerminal(val id: Int, val terminalType: Int, val controls: Long) {
    val isCamera: Boolean get() = terminalType == 0x0201
}
data class UvcOutputTerminal(val id: Int, val terminalType: Int, val sourceId: Int)
data class UvcProcessingUnit(val id: Int, val sourceId: Int, val controls: Long)
data class UvcExtensionUnit(val id: Int, val guid: String, val controls: Long)

data class UvcStreamingInterface(
    val interfaceNumber: Int,
    val endpointAddress: Int,
    val stillCaptureMethod: Int,
    val formats: List<UvcFormat>,
)

enum class UvcFormatKind { UNCOMPRESSED, MJPEG, FRAME_BASED, MPEG2TS, DV, STREAM_BASED, H264, OTHER }

/** Pixel layouts we know how to interpret on the phone. */
enum class UvcPixelFormat {
    YUY2, UYVY, NV12, I420, Y8, Y16, RGB24, BGR24, MJPEG, H264, UNKNOWN;

    val isSingleChannel: Boolean get() = this == Y8 || this == Y16
    val bytesPerPixel: Int? get() = when (this) {
        YUY2, UYVY, Y16 -> 2
        Y8 -> 1
        RGB24, BGR24 -> 3
        NV12, I420 -> null
        MJPEG, H264, UNKNOWN -> null
    }
}

data class UvcFormat(
    val interfaceNumber: Int,
    val formatIndex: Int,
    val kind: UvcFormatKind,
    val guid: String,
    val fourcc: String,
    val bitsPerPixel: Int,
    val defaultFrameIndex: Int,
    val frames: List<UvcFrame>,
) {
    val pixelFormat: UvcPixelFormat get() = UvcDescriptorParser.pixelFormatFor(kind, guid, fourcc, bitsPerPixel)
}

data class UvcFrame(
    val frameIndex: Int,
    val width: Int,
    val height: Int,
    val defaultFrameInterval: Long,
    val maxVideoFrameBufferSize: Long,
    /** Discrete intervals in 100 ns units, or [min, max, step] for continuous mode. */
    val intervals: List<Long>,
    val continuous: Boolean,
) {
    fun defaultFps(): Double? = if (defaultFrameInterval > 0) 10_000_000.0 / defaultFrameInterval else null
    fun maxFps(): Double? = intervals.filter { it > 0 }.minOrNull()?.let { 10_000_000.0 / it }
}

/** The stream mode selected for the thermal camera. */
data class UvcStreamMode(
    val format: UvcFormat,
    val frame: UvcFrame,
    /** 100 ns units */
    val frameInterval: Long,
    val reason: String,
) {
    val fps: Double get() = if (frameInterval > 0) 10_000_000.0 / frameInterval else 0.0
    override fun toString() = "fmt=${format.formatIndex}(${format.pixelFormat}) frame=${frame.frameIndex} ${frame.width}x${frame.height} @ %.1f fps".format(fps)
}
