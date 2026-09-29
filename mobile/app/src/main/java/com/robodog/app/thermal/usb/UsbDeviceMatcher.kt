package com.robodog.app.thermal.usb

import com.robodog.app.core.RoboDogConstants

/** Pure decision logic for which attached USB devices we treat as the thermal camera. */
object UsbDeviceMatcher {
    data class Candidate(
        val vendorId: Int,
        val productId: Int,
        val deviceClass: Int,
        val deviceSubClass: Int,
        val interfaceClasses: List<Pair<Int, Int>>, // (class, subclass)
        val productName: String? = null,
    )

    enum class Match { TC01A, GENERIC_UVC, NONE }

    fun isTc01a(vendorId: Int, productId: Int): Boolean =
        vendorId == RoboDogConstants.TC01A_VENDOR_ID && productId == RoboDogConstants.TC01A_PRODUCT_ID

    fun hasVideoControlInterface(c: Candidate): Boolean =
        c.interfaceClasses.any { (cls, sub) -> cls == RoboDogConstants.USB_CLASS_VIDEO && sub == RoboDogConstants.USB_SUBCLASS_VIDEOCONTROL }

    fun hasVideoStreamingInterface(c: Candidate): Boolean =
        c.interfaceClasses.any { (cls, sub) -> cls == RoboDogConstants.USB_CLASS_VIDEO && sub == RoboDogConstants.USB_SUBCLASS_VIDEOSTREAMING }

    fun classify(c: Candidate): Match = when {
        isTc01a(c.vendorId, c.productId) -> Match.TC01A
        hasVideoControlInterface(c) -> Match.GENERIC_UVC
        c.deviceClass == RoboDogConstants.USB_CLASS_VIDEO -> Match.GENERIC_UVC
        else -> Match.NONE
    }

    /** Pick the best camera among attached devices: the TC01A first, then any UVC device. */
    fun <T> pickCamera(devices: List<T>, describe: (T) -> Candidate): T? {
        val classified = devices.map { it to classify(describe(it)) }
        return classified.firstOrNull { it.second == Match.TC01A }?.first
            ?: classified.firstOrNull { it.second == Match.GENERIC_UVC }?.first
    }
}
