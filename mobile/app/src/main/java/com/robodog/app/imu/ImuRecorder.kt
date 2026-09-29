package com.robodog.app.imu

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.robodog.app.core.TimeFormat
import com.robodog.app.data.model.ImuSample
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Reads the phone's accelerometer, gyroscope and (if present) magnetometer and combines them
 * into synchronized [ImuSample]s. Samples are batched to the database during mapping missions.
 */
class ImuRecorder(context: Context) : SensorEventListener {
    private val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accel = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val gyro = sm.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    private val mag = sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)

    data class Availability(val accelerometer: Boolean, val gyroscope: Boolean, val magnetometer: Boolean) {
        val usable: Boolean get() = accelerometer && gyroscope
    }
    val availability = Availability(accel != null, gyro != null, mag != null)

    private val _latest = MutableStateFlow<ImuSample?>(null)
    val latest: StateFlow<ImuSample?> = _latest.asStateFlow()
    private val _sampleRateHz = MutableStateFlow(0.0)
    val sampleRateHz: StateFlow<Double> = _sampleRateHz.asStateFlow()

    @Volatile private var missionId: String? = null
    private val ax = FloatArray(3); private val gx = FloatArray(3); private var mx: FloatArray? = null
    private var haveAccel = false; private var haveGyro = false
    private val batch = ArrayList<ImuSample>(256)
    private var listener: ((List<ImuSample>) -> Unit)? = null
    private var counter = 0; private var windowStart = 0L
    var batchSize = 100

    fun start(missionId: String?, onBatch: ((List<ImuSample>) -> Unit)?) {
        this.missionId = missionId
        this.listener = onBatch
        accel?.let { sm.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        gyro?.let { sm.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        mag?.let { sm.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
    }

    fun setMission(id: String?) { missionId = id }

    fun stop() {
        sm.unregisterListener(this)
        flush()
        listener = null
    }

    fun flush() {
        val out: List<ImuSample>
        synchronized(batch) { if (batch.isEmpty()) return; out = ArrayList(batch); batch.clear() }
        listener?.invoke(out)
    }

    override fun onSensorChanged(e: SensorEvent) {
        when (e.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> { System.arraycopy(e.values, 0, ax, 0, 3); haveAccel = true }
            Sensor.TYPE_GYROSCOPE -> { System.arraycopy(e.values, 0, gx, 0, 3); haveGyro = true; emit(e.timestamp) }
            Sensor.TYPE_MAGNETIC_FIELD -> { mx = (mx ?: FloatArray(3)).also { System.arraycopy(e.values, 0, it, 0, 3) } }
        }
    }

    private fun emit(eventNs: Long) {
        if (!haveAccel || !haveGyro) return
        val m = mx
        val s = ImuSample(0, TimeFormat.nowIso(), eventNs, missionId, ax[0], ax[1], ax[2], gx[0], gx[1], gx[2], m?.get(0), m?.get(1), m?.get(2))
        _latest.value = s
        counter++
        val now = System.currentTimeMillis()
        if (windowStart == 0L) windowStart = now
        if (now - windowStart >= 1000) { _sampleRateHz.value = counter * 1000.0 / (now - windowStart); counter = 0; windowStart = now }
        if (listener != null) {
            val full: Boolean
            synchronized(batch) { batch += s; full = batch.size >= batchSize }
            if (full) flush()
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
