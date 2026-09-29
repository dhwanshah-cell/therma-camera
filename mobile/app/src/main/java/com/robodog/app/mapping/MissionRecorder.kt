package com.robodog.app.mapping

import com.robodog.app.core.DataSource
import com.robodog.app.data.model.SensorReading
import com.robodog.app.thermal.ThermalFrame
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * "START THERMAL MAPPING": samples the live thermal stream at a fixed rate, attaches the best
 * available pose (or none), and feeds the [ThermalMapBuilder]. Sensor readings and RGB frames
 * are associated by timestamp through the mission id stored on each record.
 */
class MissionRecorder(private val registry: PoseSourceRegistry) {
    data class State(
        val active: Boolean = false,
        val missionId: String? = null,
        val frames: Int = 0,
        val points: Int = 0,
        val poseSourceName: String = "None",
        val poseAvailable: Boolean = false,
        val depthAvailable: Boolean = false,
        val startedMs: Long = 0,
        val lastSensor: SensorReading? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var builder: ThermalMapBuilder? = null
    private var lastSampleMs = 0L
    var sampleIntervalMs = 500L

    val current: ThermalMapBuilder? get() = builder

    fun start(missionId: String?, name: String, source: DataSource) {
        val pose = registry.bestPose()
        pose.start()
        builder = ThermalMapBuilder(missionId, name, source = source)
        lastSampleMs = 0
        _state.value = State(true, missionId, 0, 0, pose.name, pose.available, registry.bestDepth() != null, System.currentTimeMillis())
    }

    fun onFrame(frame: ThermalFrame) {
        val b = builder ?: return
        val now = System.currentTimeMillis()
        if (now - lastSampleMs < sampleIntervalMs) return
        lastSampleMs = now
        val pose = registry.bestPose().latestPose.value
        b.addFrame(frame, pose, registry.bestDepth())
        _state.value = _state.value.copy(frames = b.frameCount, points = b.pointCount, poseAvailable = pose != null)
    }

    fun onSensor(r: SensorReading) { if (_state.value.active) _state.value = _state.value.copy(lastSensor = r) }

    fun stop(): ThermalMapBuilder? {
        registry.bestPose().stop()
        val b = builder
        builder = null
        _state.value = State()
        return b
    }
}
