package com.robodog.app.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.robodog.app.RoboDogApp
import java.util.concurrent.TimeUnit

/** WorkManager job that flushes the sync queue whenever a network is available. */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val graph = (applicationContext as RoboDogApp).graph
        val settings = graph.settings.current()
        if (!settings.syncEnabled) return Result.success()
        graph.backend.baseUrl = settings.serverUrl
        graph.backend.token = settings.apiToken
        val deviceId = graph.settings.ensureDeviceId()
        graph.syncRunner.flush(deviceId)
        return if (graph.syncQueue.pendingCountNow() > 0 && !graph.syncRunner.state.value.online) Result.retry() else Result.success()
    }

    companion object {
        private const val PERIODIC = "robodog-sync-periodic"
        private const val NOW = "robodog-sync-now"

        fun schedule(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val periodic = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, periodic)
        }

        fun syncNow(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val req = OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS).build()
            WorkManager.getInstance(context).enqueueUniqueWork(NOW, ExistingWorkPolicy.KEEP, req)
        }
    }
}
