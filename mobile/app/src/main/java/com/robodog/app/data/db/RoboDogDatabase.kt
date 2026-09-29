package com.robodog.app.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
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

@Database(
    entities = [Mission::class, SensorReading::class, Alert::class, ThermalImage::class, RgbImage::class,
        VideoRecording::class, ThermalMap::class, ImuSample::class, RobotStatus::class, SyncItem::class],
    version = 1,
    exportSchema = true,
)
@TypeConverters(Converters::class)
abstract class RoboDogDatabase : RoomDatabase() {
    abstract fun missions(): MissionDao
    abstract fun sensors(): SensorDao
    abstract fun alerts(): AlertDao
    abstract fun thermalImages(): ThermalImageDao
    abstract fun rgbImages(): RgbImageDao
    abstract fun videos(): VideoDao
    abstract fun maps(): ThermalMapDao
    abstract fun imu(): ImuDao
    abstract fun robot(): RobotStatusDao
    abstract fun sync(): SyncDao

    companion object {
        fun build(context: Context): RoboDogDatabase =
            Room.databaseBuilder(context.applicationContext, RoboDogDatabase::class.java, "robodog.db")
                .fallbackToDestructiveMigration()
                .build()

        fun inMemory(context: Context): RoboDogDatabase =
            Room.inMemoryDatabaseBuilder(context.applicationContext, RoboDogDatabase::class.java).allowMainThreadQueries().build()
    }
}
