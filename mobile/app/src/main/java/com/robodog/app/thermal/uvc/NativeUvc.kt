package com.robodog.app.thermal.uvc

import java.nio.ByteBuffer

/**
 * JNI bindings to the vendored libusb + libuvc driver (app/src/main/cpp/robodog_uvc.cpp).
 *
 * The Android USB stack opens the device and grants permission; we pass the resulting
 * usbfs file descriptor down so libusb can drive control, bulk and isochronous transfers
 * without device discovery.
 */
object NativeUvc {
    @Volatile private var loaded = false
    @Volatile var loadError: String? = null
        private set

    fun ensureLoaded(): Boolean {
        if (loaded) return true
        return try {
            System.loadLibrary("robodog_uvc")
            loaded = true
            true
        } catch (t: Throwable) {
            loadError = t.toString()
            false
        }
    }

    /** Creates the libusb/libuvc context. Returns handle (>0) or negative error. */
    external fun nativeInit(): Long
    external fun nativeExit(ctxHandle: Long)

    /** Wraps an open usbfs fd. Returns device handle (>0) or negative error. */
    external fun nativeOpen(ctxHandle: Long, fd: Int): Long
    external fun nativeClose(devHandle: Long)

    /** JSON description of the control/streaming descriptors as libuvc parsed them. */
    external fun nativeDescribe(devHandle: Long): String

    /** Negotiates and starts streaming. Returns stream handle (>0) or negative error. */
    /** [numTransfers]/[packetsPerTransfer] size the isochronous queue; Android rejects big queues with ENOMEM. */
    external fun nativeStartStream(devHandle: Long, formatIndex: Int, frameIndex: Int, intervalUnits: Int, numTransfers: Int, packetsPerTransfer: Int): Long
    external fun nativeStreamInfo(streamHandle: Long): String

    /**
     * Blocks up to [timeoutUs] for the next frame and copies it into the direct [out] buffer.
     * [info] receives width, height, libuvc frame_format ordinal, sequence, step, dataBytes.
     * Returns bytes copied, 0 on timeout, negative on error.
     */
    external fun nativeGetFrame(streamHandle: Long, out: ByteBuffer, info: IntArray, timeoutUs: Int): Int
    external fun nativeStopStream(streamHandle: Long)

    external fun nativeStrError(code: Int): String
    /** Captured libusb/driver log lines since the last call (for diagnostics). */
    external fun nativeLastLog(): String
    external fun nativeVersion(): String

    /** libuvc's enum uvc_frame_format ordinals (kept in sync with libuvc.h). */
    object FrameFormat {
        const val UNKNOWN = 0
        const val UNCOMPRESSED = 1
        const val COMPRESSED = 2
        const val YUYV = 3
        const val UYVY = 4
        const val RGB = 5
        const val BGR = 6
        const val MJPEG = 7
        const val H264 = 8
        const val GRAY8 = 9
        const val GRAY16 = 10
        const val NV12 = 17
        const val P010 = 18
        const val I420 = 19
        const val NV21 = 20
    }
}
