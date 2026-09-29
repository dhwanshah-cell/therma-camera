package com.robodog.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Thermostat
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.robodog.app.ui.components.SimulationBadge
import com.robodog.app.ui.components.StatusDot
import com.robodog.app.ui.screens.CameraScreen
import com.robodog.app.ui.screens.HomeScreen
import com.robodog.app.ui.screens.MapScreen
import com.robodog.app.ui.screens.MissionsScreen
import com.robodog.app.ui.screens.SensorsScreen
import com.robodog.app.ui.screens.SettingsScreen
import com.robodog.app.ui.screens.StorageScreen
import com.robodog.app.ui.screens.ThermalScreen
import com.robodog.app.ui.theme.RdColors
import com.robodog.app.core.DataSource

sealed class Route(val path: String, val label: String) {
    data object Home : Route("home", "HOME")
    data object Thermal : Route("thermal", "THERMAL")
    data object Camera : Route("camera", "CAMERA")
    data object Sensors : Route("sensors", "SENSORS")
    data object Map : Route("map", "MAP")
    data object Storage : Route("storage", "STORAGE")
    data object Settings : Route("settings", "SETTINGS")
    data object Missions : Route("missions", "MISSIONS")
}

private val bottomRoutes = listOf(Route.Home, Route.Thermal, Route.Camera, Route.Sensors, Route.Map, Route.Storage)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoboDogNavigation(vm: RoboDogViewModel) {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val current = backStack?.destination
    val snackbar = remember { SnackbarHostState() }
    val toast by vm.c.toast.collectAsState()
    val thermal by vm.c.thermalConnected.collectAsState()
    val esp32 by vm.c.esp32.state.collectAsState()
    val settings by vm.settings.collectAsState()
    LaunchedEffect(toast) { toast?.let { snackbar.showSnackbar(it); vm.c.consumeToast() } }

    Scaffold(
        containerColor = RdColors.Background,
        snackbarHost = { SnackbarHost(snackbar) { Snackbar(it, containerColor = RdColors.PanelAlt, contentColor = RdColors.Text) } },
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = RdColors.Background, titleContentColor = RdColors.Text),
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("ROBO-DOG", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.width(12.dp)); StatusDot(thermal, 8); Spacer(Modifier.width(4.dp)); Text("TC01A", style = MaterialTheme.typography.labelSmall, color = RdColors.Muted)
                        Spacer(Modifier.width(10.dp)); StatusDot(esp32.connected, 8); Spacer(Modifier.width(4.dp)); Text("ESP32", style = MaterialTheme.typography.labelSmall, color = RdColors.Muted)
                        Spacer(Modifier.width(10.dp))
                        if (settings?.simulationMode == true) SimulationBadge(DataSource.SIMULATION)
                    }
                },
                actions = {
                    IconButton(onClick = { nav.navigate(Route.Settings.path) }) { Icon(Icons.Default.Settings, "Settings", tint = RdColors.Muted) }
                },
            )
        },
        bottomBar = {
            NavigationBar(containerColor = RdColors.Panel) {
                bottomRoutes.forEach { r ->
                    val selected = current?.hierarchy?.any { it.route == r.path } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = { nav.navigate(r.path) { popUpTo(nav.graph.findStartDestination().id) { saveState = true }; launchSingleTop = true; restoreState = true } },
                        icon = { Icon(iconFor(r), r.label) },
                        label = { Text(r.label, style = MaterialTheme.typography.labelSmall) },
                        colors = NavigationBarItemDefaults.colors(selectedIconColor = RdColors.Accent, selectedTextColor = RdColors.Accent, indicatorColor = RdColors.PanelAlt, unselectedIconColor = RdColors.Muted, unselectedTextColor = RdColors.Muted),
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            NavHost(nav, startDestination = Route.Home.path) {
                composable(Route.Home.path) { HomeScreen(vm, onMissions = { nav.navigate(Route.Missions.path) }, onThermal = { nav.navigate(Route.Thermal.path) }) }
                composable(Route.Thermal.path) { ThermalScreen(vm, onMap = { nav.navigate(Route.Map.path) }, onStorage = { nav.navigate(Route.Storage.path) }) }
                composable(Route.Camera.path) { CameraScreen(vm) }
                composable(Route.Sensors.path) { SensorsScreen(vm) }
                composable(Route.Map.path) { MapScreen(vm) }
                composable(Route.Storage.path) { StorageScreen(vm) }
                composable(Route.Settings.path) { SettingsScreen(vm) }
                composable(Route.Missions.path) { MissionsScreen(vm) }
            }
        }
    }
}

private fun iconFor(r: Route) = when (r) {
    Route.Home -> Icons.Default.Home
    Route.Thermal -> Icons.Default.Thermostat
    Route.Camera -> Icons.Default.CameraAlt
    Route.Sensors -> Icons.Default.Sensors
    Route.Map -> Icons.Default.Map
    Route.Storage -> Icons.Default.Storage
    else -> Icons.Default.Settings
}
