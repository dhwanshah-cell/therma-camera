package com.robodog.app.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.robodog.app.MainActivity
import com.robodog.app.R
import com.robodog.app.RoboDogApp

/**
 * Foreground service that keeps the onboard pipeline (USB camera, ESP32 polling, IMU, sync,
 * live stream) alive while the phone is mounted on the robot with the screen off.
 */
class RoboDogService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        else startForeground(NOTIFICATION_ID, notification)
        (application as RoboDogApp).graph.controller.start()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    private fun buildNotification(): Notification {
        val pi = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, RoboDogApp.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("RoboDog onboard computer")
            .setContentText("Thermal camera, sensors and sync are running")
            .setOngoing(true)
            .setContentIntent(pi)
            .build()
    }

    companion object {
        private const val NOTIFICATION_ID = 1001
        fun start(context: Context) { ContextCompat.startForegroundService(context, Intent(context, RoboDogService::class.java)) }
    }
}
