package com.robodog.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.robodog.app.service.RoboDogService
import com.robodog.app.ui.RoboDogNavigation
import com.robodog.app.ui.RoboDogViewModel
import com.robodog.app.ui.theme.RoboDogTheme

class MainActivity : ComponentActivity() {
    private val vm: RoboDogViewModel by viewModels {
        object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = RoboDogViewModel((application as RoboDogApp).graph) as T
        }
    }

    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { startPipeline() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { RoboDogTheme { RoboDogNavigation(vm) } }
        requestPermissionsThenStart()
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        // USB_DEVICE_ATTACHED relaunch: re-scan devices.
        (application as RoboDogApp).graph.usbMonitor.refresh()
    }

    private fun requestPermissionsThenStart() {
        val wanted = mutableListOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= 33) wanted += Manifest.permission.POST_NOTIFICATIONS
        if (Build.VERSION.SDK_INT < 29) wanted += Manifest.permission.WRITE_EXTERNAL_STORAGE
        val missing = wanted.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isEmpty()) startPipeline() else permissionLauncher.launch(missing.toTypedArray())
    }

    private fun startPipeline() {
        RoboDogService.start(this)
        (application as RoboDogApp).graph.controller.start()
    }
}
