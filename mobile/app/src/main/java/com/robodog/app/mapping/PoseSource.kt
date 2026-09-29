package com.robodog.app.mapping

import com.robodog.app.data.model.ImuSample
import com.robodog.app.data.model.Position
import com.robodog.app.data.model.PositionFrame
import com.robodog.app.data.model.Quaternion
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.sqrt

/** A timestamped pose from any localisation source. */
data class Pose(val position: Position, val orientation: Quaternion?, val timestampMs: Long)

/**
 * Pluggable localisation. The mapping module never assumes a pose exists: when no source
 * is available, thermal points are kept in image space and the 3D viewer states that a
 * depth/pose source is required. Future sources (visual-inertial odometry, robot odometry,
 * LiDAR SLAM, GPS) implement this interface and register with [PoseSourceRegistry].
 */
interface PoseSource {
    val name: String
    val frame: PositionFrame
    /** True when the source can currently deliver poses. */
    val available: Boolean
    val latestPose: StateFlow<Pose?>
    /** Human-readable quality note shown in the UI, e.g. "IMU dead reckoning: drifts within seconds". */
    val qualityNote: String
    fun start()
    fun stop()
}

/**
 * Pluggable depth. A thermal camera alone gives no depth; a depth camera, LiDAR or stereo RGB
 * would implement this. [available] is false until such hardware is attached.
 */
interface DepthSource {
    val name: String
    val available: Boolean
    /** Depth in metres for an image-space pixel, or null when unknown. */
    fun depthAt(x: Int, y: Int, timestampMs: Long): Float?
    fun start()
    fun stop()
}

/** Placeholder for LiDAR: reports unavailable until a driver is plugged in. */
class LidarDepthSource : DepthSource {
    override val name = "LiDAR"
    override val available = false
    override fun depthAt(x: Int, y: Int, timestampMs: Long): Float? = null
    override fun start() {}
    override fun stop() {}
}

/** No localisation at all. */
object NullPoseSource : PoseSource {
    override val name = "None"
    override val frame = PositionFrame.MANUAL
    override val available = false
    override val latestPose = MutableStateFlow<Pose?>(null).asStateFlow()
    override val qualityNote = "No pose source. Map points stay in image space."
    override fun start() {}
    override fun stop() {}
}

/**
 * Phone-IMU dead reckoning: integrates gyro for heading and accelerometer (gravity removed by
 * a slow low-pass) for a very rough planar displacement. It drifts within seconds and is only
 * an ordering/relative-motion hint — confidence is reported as 0.15 and the frame is
 * IMU_DEAD_RECKONING so nothing downstream mistakes it for a surveyed position.
 */
class ImuDeadReckoningPoseSource : PoseSource {
    override val name = "Phone IMU dead reckoning"
    override val frame = PositionFrame.IMU_DEAD_RECKONING
    override var available = false
        private set
    private val _pose = MutableStateFlow<Pose?>(null)
    override val latestPose: StateFlow<Pose?> = _pose.asStateFlow()
    override val qualityNote = "IMU-only dead reckoning; drifts quickly, confidence 0.15. Not a surveyed position."

    private var lastNs = 0L
    private var yaw = 0.0
    private var vx = 0.0; private var vy = 0.0
    private var x = 0.0; private var y = 0.0
    private val gravity = DoubleArray(3)
    private var gravityInit = false
    private var running = false

    override fun start() { running = true; available = true; reset() }
    override fun stop() { running = false; available = false }

    fun reset() { lastNs = 0; yaw = 0.0; vx = 0.0; vy = 0.0; x = 0.0; y = 0.0; gravityInit = false; _pose.value = null }

    fun onSample(s: ImuSample) {
        if (!running) return
        if (lastNs == 0L) { lastNs = s.monotonicNs; return }
        val dt = ((s.monotonicNs - lastNs) / 1e9).coerceIn(0.0, 0.1)
        lastNs = s.monotonicNs
        // Gravity low-pass
        val alpha = if (gravityInit) 0.02 else 1.0
        gravity[0] += alpha * (s.ax - gravity[0]); gravity[1] += alpha * (s.ay - gravity[1]); gravity[2] += alpha * (s.az - gravity[2])
        gravityInit = true
        val lax = s.ax - gravity[0]; val lay = s.ay - gravity[1]
        yaw += s.gz * dt
        // Rotate linear acceleration by yaw into the mission frame, integrate with heavy damping.
        val c = kotlin.math.cos(yaw); val sn = kotlin.math.sin(yaw)
        val axw = lax * c - lay * sn; val ayw = lax * sn + lay * c
        val damping = 0.9
        vx = (vx + axw * dt) * damping; vy = (vy + ayw * dt) * damping
        x += vx * dt; y += vy * dt
        val q = Quaternion(0.0, 0.0, kotlin.math.sin(yaw / 2), kotlin.math.cos(yaw / 2))
        _pose.value = Pose(Position(x, y, 0.0, frame, 0.15), q, System.currentTimeMillis())
    }

    fun speed(): Double = sqrt(vx * vx + vy * vy)
}

/** Registry of pose/depth sources; the best available source is used for mapping. */
class PoseSourceRegistry {
    private val poseSources = mutableListOf<PoseSource>()
    private val depthSources = mutableListOf<DepthSource>()
    fun registerPose(s: PoseSource) { poseSources += s }
    fun registerDepth(s: DepthSource) { depthSources += s }
    val allPose: List<PoseSource> get() = poseSources
    val allDepth: List<DepthSource> get() = depthSources
    /** Priority: LiDAR SLAM > visual-inertial > robot odometry > GPS > IMU dead reckoning. */
    fun bestPose(): PoseSource = poseSources.filter { it.available }.minByOrNull { priority(it.frame) } ?: NullPoseSource
    fun bestDepth(): DepthSource? = depthSources.firstOrNull { it.available }
    private fun priority(f: PositionFrame) = when (f) {
        PositionFrame.LIDAR_SLAM -> 0; PositionFrame.VISUAL_INERTIAL -> 1; PositionFrame.ROBOT_ODOMETRY -> 2
        PositionFrame.GPS -> 3; PositionFrame.IMU_DEAD_RECKONING -> 4; PositionFrame.MANUAL -> 5
    }
}
