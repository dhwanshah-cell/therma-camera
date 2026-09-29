package com.robodog.app.thermal.usb

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Watches Android's USB host stack for the thermal camera: enumerates attached devices,
 * reacts to attach/detach broadcasts and drives the runtime USB permission dialog.
 */
class UsbDeviceMonitor(private val context: Context) {
    companion object {
        private const val TAG = "UsbDeviceMonitor"
        const val ACTION_USB_PERMISSION = "com.robodog.app.USB_PERMISSION"
    }

    sealed class State {
        data object NoDevice : State()
        data class Detected(val device: UsbDevice, val match: UsbDeviceMatcher.Match, val hasPermission: Boolean) : State()
        data class PermissionDenied(val device: UsbDevice) : State()
    }

    private val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    private val _state = MutableStateFlow<State>(State.NoDevice)
    val state: StateFlow<State> = _state.asStateFlow()

    /** Every attached device with its classification, for the diagnostics UI. */
    private val _attached = MutableStateFlow<List<Pair<UsbDevice, UsbDeviceMatcher.Match>>>(emptyList())
    val attached: StateFlow<List<Pair<UsbDevice, UsbDeviceMatcher.Match>>> = _attached.asStateFlow()

    private var registered = false
    // One permission request per device at a time: a second request cancels the first and Android
    // then reports "denied" without showing a dialog.
    @Volatile private var pendingRequestDevice: String? = null
    @Volatile private var pendingRequestAt = 0L
    private val deniedDevices = HashSet<String>()

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            val device: UsbDevice? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
            else @Suppress("DEPRECATION") intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
            when (intent.action) {
                UsbManager.ACTION_USB_DEVICE_ATTACHED -> { Log.i(TAG, "attached: ${device?.deviceName}"); refresh() }
                UsbManager.ACTION_USB_DEVICE_DETACHED -> { Log.i(TAG, "detached: ${device?.deviceName}"); refresh() }
                ACTION_USB_PERMISSION -> {
                    val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                    Log.i(TAG, "permission ${if (granted) "granted" else "denied"} for ${device?.deviceName}")
                    pendingRequestDevice = null
                    if (device != null && !granted && !usbManager.hasPermission(device)) {
                        synchronized(deniedDevices) { deniedDevices += device.deviceName }
                        _state.value = State.PermissionDenied(device)
                    } else refresh()
                }
            }
        }
    }

    fun start() {
        if (registered) return
        val filter = IntentFilter().apply {
            addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
            addAction(ACTION_USB_PERMISSION)
        }
        if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        else @Suppress("UnspecifiedRegisterReceiverFlag") context.registerReceiver(receiver, filter)
        registered = true
        refresh()
    }

    fun stop() {
        if (!registered) return
        runCatching { context.unregisterReceiver(receiver) }
        registered = false
    }

    fun refresh() {
        val devices = usbManager.deviceList.values.toList()
        val classified = devices.map { it to UsbDeviceMatcher.classify(candidate(it)) }
        _attached.value = classified
        val cam = UsbDeviceMatcher.pickCamera(devices, ::candidate)
        _state.value = if (cam == null) State.NoDevice
        else State.Detected(cam, UsbDeviceMatcher.classify(candidate(cam)), usbManager.hasPermission(cam))
    }

    fun hasPermission(device: UsbDevice): Boolean = usbManager.hasPermission(device)

    fun wasDenied(device: UsbDevice): Boolean = synchronized(deniedDevices) { device.deviceName in deniedDevices }

    /**
     * Shows the system USB permission dialog. Returns false when a request for this device is
     * already pending (within 20 s) so the dialog is not cancelled by a duplicate request.
     * [force] is used by the RECONNECT button and also clears an earlier denial.
     */
    fun requestPermission(device: UsbDevice, force: Boolean = false): Boolean {
        if (usbManager.hasPermission(device)) { refresh(); return true }
        val now = System.currentTimeMillis()
        if (!force && pendingRequestDevice == device.deviceName && now - pendingRequestAt < 20_000) {
            Log.i(TAG, "permission request already pending for ${device.deviceName}")
            return false
        }
        if (force) synchronized(deniedDevices) { deniedDevices -= device.deviceName }
        pendingRequestDevice = device.deviceName
        pendingRequestAt = now
        val flags = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
        val intent = Intent(ACTION_USB_PERMISSION).apply { setPackage(context.packageName) }
        val pi = PendingIntent.getBroadcast(context, 0, intent, flags)
        Log.i(TAG, "requesting permission for ${device.deviceName}")
        usbManager.requestPermission(device, pi)
        return true
    }

    fun openDevice(device: UsbDevice) = usbManager.openDevice(device)

    fun candidate(d: UsbDevice): UsbDeviceMatcher.Candidate {
        val ifs = (0 until d.interfaceCount).map { i -> val itf = d.getInterface(i); itf.interfaceClass to itf.interfaceSubclass }
        return UsbDeviceMatcher.Candidate(d.vendorId, d.productId, d.deviceClass, d.deviceSubclass, ifs, runCatching { d.productName }.getOrNull())
    }

    fun describe(d: UsbDevice): String = buildString {
        append("%04X:%04X ".format(d.vendorId, d.productId))
        append(runCatching { d.productName }.getOrNull() ?: "unknown")
        append(" (${d.deviceName}, class %02X, %d interfaces)".format(d.deviceClass, d.interfaceCount))
    }
}
