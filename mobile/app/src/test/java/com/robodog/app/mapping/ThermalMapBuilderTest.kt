package com.robodog.app.mapping

import com.robodog.app.core.DataSource
import com.robodog.app.data.model.Position
import com.robodog.app.data.model.PositionFrame
import com.robodog.app.data.model.Quaternion
import com.robodog.app.thermal.FrameLayout
import com.robodog.app.thermal.ThermalFrame
import com.robodog.app.thermal.usb.UvcPixelFormat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ThermalMapBuilderTest {
    private fun frame(id: String = "f") = ThermalFrame(id, 1_700_000_000_000, 0, 1, 256, 192, 256, 192, UvcPixelFormat.Y16,
        IntArray(256 * 192) { it % 256 * 100 }, 16, 0, 25500, null, false, null, null, DataSource.REAL, FrameLayout.SINGLE)

    @Test fun withoutPosePointsStayInImageSpaceAndNoDepth() {
        val b = ThermalMapBuilder("m1", "map", 16, 12)
        b.addFrame(frame(), null, null)
        assertEquals(16 * 12, b.pointCount)
        assertTrue(b.points().all { it.z == null })
        assertFalse(b.canRender3d)
        val m = b.metadata(null)
        assertEquals("2D", m.dimension); assertNull(m.poseSource); assertFalse(m.hasDepth); assertFalse(m.hasTemperature)
        assertTrue(b.points().all { it.temperature == null })
    }

    @Test fun withPoseFootprintFollowsTrajectory() {
        val b = ThermalMapBuilder("m1", "map", 4, 3)
        val p1 = Pose(Position(0.0, 0.0, 0.0, PositionFrame.IMU_DEAD_RECKONING, 0.15), Quaternion.IDENTITY, 0)
        val p2 = Pose(Position(5.0, 0.0, 0.0, PositionFrame.IMU_DEAD_RECKONING, 0.15), Quaternion.IDENTITY, 0)
        b.addFrame(frame("a"), p1, null); b.addFrame(frame("b"), p2, null)
        assertEquals(2, b.trajectory().size)
        assertEquals(PositionFrame.IMU_DEAD_RECKONING, b.metadata(null).poseSource)
        val xs = b.points().map { it.x }
        assertTrue(xs.max() > xs.min() + 4.0)
        assertTrue(b.points().all { it.z == null }) // no depth source → still no z
        assertEquals("2D", b.metadata(null).dimension)
    }

    @Test fun withDepthSourcePointsGetZ() {
        val depth = object : DepthSource {
            override val name = "fake"; override val available = true
            override fun depthAt(x: Int, y: Int, timestampMs: Long) = 2.5f
            override fun start() {}; override fun stop() {}
        }
        val b = ThermalMapBuilder("m1", "map", 4, 3)
        b.addFrame(frame(), Pose(Position(0.0, 0.0, 1.0, PositionFrame.LIDAR_SLAM, 0.9), Quaternion.IDENTITY, 0), depth)
        assertTrue(b.points().all { it.z != null })
        assertTrue(b.canRender3d); assertEquals("3D", b.metadata(null).dimension)
    }

    @Test fun registryPrefersBetterSources() {
        val reg = PoseSourceRegistry()
        assertEquals(NullPoseSource, reg.bestPose())
        val imu = ImuDeadReckoningPoseSource(); reg.registerPose(imu)
        assertEquals(NullPoseSource, reg.bestPose()) // not started → unavailable
        imu.start(); assertEquals(imu, reg.bestPose())
        assertNull(reg.bestDepth()); reg.registerDepth(LidarDepthSource()); assertNull(reg.bestDepth())
    }
}
