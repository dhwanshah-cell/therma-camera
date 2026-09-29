package com.robodog.app.core

import java.util.UUID

/** Unique, sortable-ish ids: <prefix>_<uuid>. The backend deduplicates on these. */
object Ids {
    fun sensor() = "sensor_" + UUID.randomUUID()
    fun alert() = "alert_" + UUID.randomUUID()
    fun thermalImage() = "thermal_" + UUID.randomUUID()
    fun rgbImage() = "rgb_" + UUID.randomUUID()
    fun video() = "video_" + UUID.randomUUID()
    fun map() = "map_" + UUID.randomUUID()
    fun mission() = "mission_" + UUID.randomUUID()
    fun frame() = "frame_" + UUID.randomUUID()
    fun sync() = "sync_" + UUID.randomUUID()
    fun device() = "phone_" + UUID.randomUUID().toString().take(8)
}
