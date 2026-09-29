package com.robodog.app.mapping

import com.robodog.app.core.DataSource
import com.robodog.app.core.Ids
import com.robodog.app.core.TimeFormat
import com.robodog.app.data.model.MapBounds
import com.robodog.app.data.model.PositionFrame
import com.robodog.app.data.model.ThermalMap
import com.robodog.app.data.model.ThermalMapPayload
import com.robodog.app.data.model.ThermalPoint
import com.robodog.app.data.model.TrajectoryPoint
import com.robodog.app.thermal.ThermalFrame

/**
 * Accumulates thermal samples into a map. Pure Kotlin, unit tested.
 *
 * Each frame is reduced to a coarse grid of cells (default 16x12 for a 256x192 frame). With a
 * pose source, cells are projected onto the ground plane around the pose using the camera's
 * horizontal field of view, giving a 2D thermal footprint along the robot's path. With a depth
 * source they also receive a z. Without any pose, points are kept in image space (x,y in
 * pixels) and the map is marked as such: no geometry is fabricated.
 */
class ThermalMapBuilder(
    val missionId: String?,
    val name: String,
    private val cellsX: Int = 16,
    private val cellsY: Int = 12,
    /** Assumed horizontal FOV in degrees only used to spread a footprint in front of the pose. */
    private val horizontalFovDeg: Double = 56.0,
    /** Nominal distance (m) at which the footprint is drawn when no depth is known. */
    private val nominalRangeM: Double = 2.0,
    private val source: DataSource = DataSource.REAL,
) {
    val id: String = Ids.map()
    private val points = ArrayList<ThermalPoint>()
    private val trajectory = ArrayList<TrajectoryPoint>()
    private var poseSource: PositionFrame? = null
    private var hasDepth = false
    private var hasTemperature = false
    private var frames = 0

    val pointCount: Int get() = points.size
    val frameCount: Int get() = frames
    fun points(): List<ThermalPoint> = points
    fun trajectory(): List<TrajectoryPoint> = trajectory

    fun addFrame(frame: ThermalFrame, pose: Pose?, depth: DepthSource?) {
        frames++
        val ts = TimeFormat.iso(frame.timestampMs)
        if (pose != null) {
            poseSource = pose.position.frame
            trajectory += TrajectoryPoint(pose.position.x, pose.position.y, pose.position.z, ts)
        }
        val cw = frame.width / cellsX; val ch = frame.height / cellsY
        if (cw == 0 || ch == 0) return
        val yaw = pose?.orientation?.let { 2 * kotlin.math.atan2(it.qz, it.qw) } ?: 0.0
        for (cy in 0 until cellsY) for (cx in 0 until cellsX) {
            var sum = 0L; var maxV = Int.MIN_VALUE; var maxIdx = 0; var n = 0
            for (y in cy * ch until (cy + 1) * ch) for (x in cx * cw until (cx + 1) * cw) {
                val i = y * frame.width + x
                val v = frame.intensity[i]
                sum += v; n++
                if (v > maxV) { maxV = v; maxIdx = i }
            }
            val mean = sum.toDouble() / n
            val intensity = ((mean - frame.intensityMin) / (frame.intensityMax - frame.intensityMin).coerceAtLeast(1)).coerceIn(0.0, 1.0)
            val temp = frame.radiometric?.perPixelC?.get(maxIdx)?.toDouble()
            if (temp != null) hasTemperature = true
            val px = cx * cw + cw / 2; val py = cy * ch + ch / 2
            if (pose == null) {
                points += ThermalPoint(px.toDouble(), py.toDouble(), null, intensity, temp, ts, frame.frameId)
            } else {
                // Project the cell to a footprint in front of the pose (planar approximation).
                val d = depth?.depthAt(px, py, frame.timestampMs)?.toDouble()
                val range = d ?: nominalRangeM
                val angle = Math.toRadians(((px.toDouble() / frame.width) - 0.5) * horizontalFovDeg)
                val fx = pose.position.x + range * kotlin.math.cos(yaw + angle)
                val fy = pose.position.y + range * kotlin.math.sin(yaw + angle)
                val z = if (d != null) { hasDepth = true; pose.position.z + (0.5 - py.toDouble() / frame.height) * range * kotlin.math.tan(Math.toRadians(horizontalFovDeg * frame.height / frame.width / 2)) * 2 } else null
                points += ThermalPoint(fx, fy, z, intensity, temp, ts, frame.frameId)
            }
        }
    }

    fun bounds(): MapBounds? {
        if (points.isEmpty()) return null
        val zs = points.mapNotNull { it.z }
        return MapBounds(points.minOf { it.x }, points.maxOf { it.x }, points.minOf { it.y }, points.maxOf { it.y }, zs.minOrNull(), zs.maxOrNull())
    }

    fun metadata(filePath: String?): ThermalMap = ThermalMap(
        id = id, missionId = missionId, timestamp = TimeFormat.nowIso(), name = name,
        dimension = if (hasDepth) "3D" else "2D", poseSource = poseSource, hasDepth = hasDepth, hasTemperature = hasTemperature,
        pointCount = points.size, filePath = filePath, bounds = bounds(), source = source,
    )

    fun payload(filePath: String?): ThermalMapPayload {
        val m = metadata(filePath)
        return ThermalMapPayload(m.id, m.missionId, m.timestamp, m.name, m.dimension, m.poseSource, m.hasDepth, m.hasTemperature,
            m.pointCount, m.filePath, m.bounds, m.source, points.toList(), trajectory.toList())
    }

    /** Whether the accumulated data can be shown as real 3D geometry. */
    val canRender3d: Boolean get() = hasDepth && points.any { it.z != null }
}
