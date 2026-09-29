package com.robodog.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.robodog.app.sync.SyncWorker

class RoboDogApp : Application() {
    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this)
        createNotificationChannel()
        SyncWorker.schedule(this)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val ch = NotificationChannel(CHANNEL_ID, getString(R.string.notification_channel_name), NotificationManager.IMPORTANCE_LOW).apply {
                description = getString(R.string.notification_channel_description)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    companion object { const val CHANNEL_ID = "robodog_service" }
}
