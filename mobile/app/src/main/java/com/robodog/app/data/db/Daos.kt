package com.robodog.app.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.robodog.app.data.model.Alert
import com.robodog.app.data.model.ImuSample
import com.robodog.app.data.model.Mission
import com.robodog.app.data.model.RgbImage
import com.robodog.app.data.model.RobotStatus
import com.robodog.app.data.model.SensorReading
import com.robodog.app.data.model.SyncItem
import com.robodog.app.data.model.ThermalImage
import com.robodog.app.data.model.ThermalMap
import com.robodog.app.data.model.VideoRecording
import kotlinx.coroutines.flow.Flow

@Dao
interface MissionDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(m: Mission)
    @Update suspend fun update(m: Mission)
    @Query("SELECT * FROM missions ORDER BY number DESC") fun observeAll(): Flow<List<Mission>>
    @Query("SELECT * FROM missions WHERE status = 'ACTIVE' ORDER BY number DESC LIMIT 1") fun observeActive(): Flow<Mission?>
    @Query("SELECT * FROM missions WHERE status = 'ACTIVE' ORDER BY number DESC LIMIT 1") suspend fun active(): Mission?
    @Query("SELECT * FROM missions WHERE id = :id") suspend fun byId(id: String): Mission?
    @Query("SELECT COALESCE(MAX(number), 0) FROM missions") suspend fun maxNumber(): Int
    @Query("SELECT COUNT(*) FROM thermal_images WHERE missionId = :id") suspend fun countThermal(id: String): Int
    @Query("SELECT COUNT(*) FROM rgb_images WHERE missionId = :id") suspend fun countRgb(id: String): Int
    @Query("SELECT COUNT(*) FROM videos WHERE missionId = :id") suspend fun countVideos(id: String): Int
    @Query("SELECT COUNT(*) FROM sensor_readings WHERE missionId = :id") suspend fun countSensors(id: String): Int
    @Query("SELECT COUNT(*) FROM alerts WHERE missionId = :id AND type = 'GAS_ALERT'") suspend fun countGasAlerts(id: String): Int
    @Query("SELECT COUNT(*) FROM alerts WHERE missionId = :id AND (type = 'THERMAL_HOTSPOT' OR type = 'THERMAL_INTENSITY_HOTSPOT')") suspend fun countHotspots(id: String): Int
    @Query("SELECT COUNT(*) FROM thermal_maps WHERE missionId = :id") suspend fun countMaps(id: String): Int
}

@Dao
interface SensorDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun insert(r: SensorReading)
    @Query("SELECT * FROM sensor_readings ORDER BY timestamp DESC LIMIT 1") fun observeLatest(): Flow<SensorReading?>
    @Query("SELECT * FROM sensor_readings ORDER BY timestamp DESC LIMIT :limit") fun observeRecent(limit: Int): Flow<List<SensorReading>>
    @Query("SELECT * FROM sensor_readings WHERE missionId = :missionId ORDER BY timestamp ASC") suspend fun forMission(missionId: String): List<SensorReading>
    @Query("SELECT * FROM sensor_readings WHERE timestamp <= :iso ORDER BY timestamp DESC LIMIT 1") suspend fun latestBefore(iso: String): SensorReading?
    @Query("DELETE FROM sensor_readings WHERE timestamp < :iso AND missionId IS NULL") suspend fun pruneUnassigned(iso: String)
}

@Dao
interface AlertDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun insert(a: Alert)
    @Update suspend fun update(a: Alert)
    @Query("SELECT * FROM alerts ORDER BY timestamp DESC LIMIT :limit") fun observeRecent(limit: Int): Flow<List<Alert>>
    @Query("SELECT * FROM alerts WHERE acknowledged = 0 ORDER BY timestamp DESC") fun observeActive(): Flow<List<Alert>>
    @Query("SELECT * FROM alerts WHERE missionId = :missionId ORDER BY timestamp DESC") suspend fun forMission(missionId: String): List<Alert>
    @Query("SELECT * FROM alerts WHERE id = :id") suspend fun byId(id: String): Alert?
    @Query("SELECT * FROM alerts WHERE type = :type ORDER BY timestamp DESC LIMIT 1") suspend fun latestOfType(type: String): Alert?
}

@Dao
interface ThermalImageDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(i: ThermalImage)
    @Query("SELECT * FROM thermal_images ORDER BY timestamp DESC") fun observeAll(): Flow<List<ThermalImage>>
    @Query("SELECT * FROM thermal_images WHERE missionId = :missionId ORDER BY timestamp DESC") suspend fun forMission(missionId: String): List<ThermalImage>
    @Query("SELECT * FROM thermal_images WHERE id = :id") suspend fun byId(id: String): ThermalImage?
    @Query("DELETE FROM thermal_images WHERE id = :id") suspend fun delete(id: String)
    @Query("UPDATE thermal_images SET uploaded = 1 WHERE id = :id") suspend fun markUploaded(id: String)
    @Query("SELECT * FROM thermal_images ORDER BY timestamp DESC LIMIT 1") suspend fun latest(): ThermalImage?
}

@Dao
interface RgbImageDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(i: RgbImage)
    @Query("SELECT * FROM rgb_images ORDER BY timestamp DESC") fun observeAll(): Flow<List<RgbImage>>
    @Query("SELECT * FROM rgb_images WHERE id = :id") suspend fun byId(id: String): RgbImage?
    @Query("DELETE FROM rgb_images WHERE id = :id") suspend fun delete(id: String)
    @Query("UPDATE rgb_images SET uploaded = 1 WHERE id = :id") suspend fun markUploaded(id: String)
}

@Dao
interface VideoDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(v: VideoRecording)
    @Query("SELECT * FROM videos ORDER BY timestamp DESC") fun observeAll(): Flow<List<VideoRecording>>
    @Query("SELECT * FROM videos WHERE id = :id") suspend fun byId(id: String): VideoRecording?
    @Query("DELETE FROM videos WHERE id = :id") suspend fun delete(id: String)
    @Query("UPDATE videos SET uploaded = 1 WHERE id = :id") suspend fun markUploaded(id: String)
}

@Dao
interface ThermalMapDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(m: ThermalMap)
    @Query("SELECT * FROM thermal_maps ORDER BY timestamp DESC") fun observeAll(): Flow<List<ThermalMap>>
    @Query("SELECT * FROM thermal_maps WHERE id = :id") suspend fun byId(id: String): ThermalMap?
    @Query("DELETE FROM thermal_maps WHERE id = :id") suspend fun delete(id: String)
    @Query("UPDATE thermal_maps SET uploaded = 1 WHERE id = :id") suspend fun markUploaded(id: String)
}

@Dao
interface ImuDao {
    @Insert suspend fun insertAll(samples: List<ImuSample>)
    @Query("SELECT * FROM imu_samples WHERE missionId = :missionId ORDER BY monotonicNs ASC") suspend fun forMission(missionId: String): List<ImuSample>
    @Query("SELECT COUNT(*) FROM imu_samples WHERE missionId = :missionId") suspend fun countForMission(missionId: String): Int
    @Query("DELETE FROM imu_samples WHERE missionId IS NULL") suspend fun pruneUnassigned()
}

@Dao
interface RobotStatusDao {
    @Insert suspend fun insert(s: RobotStatus)
    @Query("SELECT * FROM robot_status ORDER BY rowId DESC LIMIT 1") fun observeLatest(): Flow<RobotStatus?>
    @Query("DELETE FROM robot_status WHERE rowId NOT IN (SELECT rowId FROM robot_status ORDER BY rowId DESC LIMIT 500)") suspend fun prune()
}

@Dao
interface SyncDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun enqueue(item: SyncItem)
    @Query("SELECT * FROM sync_queue WHERE done = 0 ORDER BY createdAt ASC LIMIT :limit") suspend fun pending(limit: Int): List<SyncItem>
    @Query("SELECT COUNT(*) FROM sync_queue WHERE done = 0") fun observePendingCount(): Flow<Int>
    @Query("SELECT COUNT(*) FROM sync_queue WHERE done = 0") suspend fun pendingCount(): Int
    @Query("UPDATE sync_queue SET done = 1 WHERE id = :id") suspend fun markDone(id: String)
    @Query("UPDATE sync_queue SET attempts = attempts + 1, lastError = :error WHERE id = :id") suspend fun markFailed(id: String, error: String?)
    @Query("DELETE FROM sync_queue WHERE done = 1 AND createdAt < :iso") suspend fun pruneDone(iso: String)
    @Query("SELECT * FROM sync_queue WHERE recordId = :recordId AND kind = :kind LIMIT 1") suspend fun find(recordId: String, kind: String): SyncItem?
}
