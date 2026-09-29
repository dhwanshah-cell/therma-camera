package com.robodog.app.robot

import com.robodog.app.core.DataSource
import com.robodog.app.core.TimeFormat
import com.robodog.app.data.model.RobotStatus

/**
 * Builds the robot status snapshot. The hexapod body controller is not connected to the phone
 * yet, so battery, motor, leg, SLAM, GPS and LiDAR fields are null ("--" in the UI). A future
 * [RobotLink] implementation fills them in; nothing is fabricated here.
 */
interface RobotLink {
    val connected: Boolean
    val batteryPct: Double?
    val motorState: String?
    val legState: String?
    val moving: Boolean?
    val slamStatus: String?
}

object NoRobotLink : RobotLink {
    override val connected = false
    override val batteryPct: Double? = null
    override val motorState: String? = null
    override val legState: String? = null
    override val moving: Boolean? = null
    override val slamStatus: String? = null
}

class RobotStatusProvider(private val link: RobotLink = NoRobotLink) {
    fun snapshot(
        esp32Connected: Boolean,
        thermalConnected: Boolean,
        imuAvailable: Boolean,
        lidarAvailable: Boolean,
        activeMissionId: String?,
        simulation: Boolean,
    ): RobotStatus = if (simulation) simulated(esp32Connected, thermalConnected, imuAvailable, activeMissionId) else RobotStatus(
        timestamp = TimeFormat.nowIso(), source = DataSource.REAL, phoneConnected = true,
        esp32Connected = esp32Connected, thermalCameraConnected = thermalConnected, robotConnected = link.connected,
        batteryPct = link.batteryPct, motorState = link.motorState, legState = link.legState, imuAvailable = imuAvailable,
        moving = link.moving, slamStatus = link.slamStatus, gps = null, lidarAvailable = lidarAvailable, activeMissionId = activeMissionId,
    )

    private var simBattery = 87.0
    private fun simulated(esp32: Boolean, thermal: Boolean, imu: Boolean, missionId: String?): RobotStatus {
        simBattery = (simBattery - 0.01).coerceAtLeast(5.0)
        return RobotStatus(
            timestamp = TimeFormat.nowIso(), source = DataSource.SIMULATION, phoneConnected = true,
            esp32Connected = esp32, thermalCameraConnected = thermal, robotConnected = true,
            batteryPct = Math.round(simBattery * 10) / 10.0, motorState = "SIM: IDLE", legState = "SIM: STANDING", imuAvailable = imu,
            moving = false, slamStatus = "SIM: NOT RUNNING", gps = null, lidarAvailable = false, activeMissionId = missionId,
        )
    }
}
