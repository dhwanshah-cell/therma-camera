package com.robodog.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.robodog.app.core.Format
import com.robodog.app.core.TimeFormat
import com.robodog.app.data.model.Mission
import com.robodog.app.ui.RoboDogViewModel
import com.robodog.app.ui.components.ActionButton
import com.robodog.app.ui.components.KeyValue
import com.robodog.app.ui.components.Panel
import com.robodog.app.ui.components.ScreenTitle
import com.robodog.app.ui.components.SimulationBadge
import com.robodog.app.ui.theme.RdColors

@Composable
fun MissionsScreen(vm: RoboDogViewModel) {
    val missions by vm.missions.collectAsState()
    var detail by remember { mutableStateOf<Mission?>(null) }
    LaunchedEffect(missions) { detail = detail?.let { d -> missions.firstOrNull { it.id == d.id }?.let { vm.missionWithStats(it.id) } } }

    Column(Modifier.fillMaxSize().padding(12.dp)) {
        ScreenTitle("MISSIONS", "${missions.size} RECORDED")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 8.dp)) {
            ActionButton("START MISSION", accent = true, enabled = missions.none { it.status.name == "ACTIVE" }) { vm.c.startMission() }
            ActionButton("END MISSION", danger = true, enabled = missions.any { it.status.name == "ACTIVE" }) { vm.c.endMission() }
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(missions, key = { it.id }) { m ->
                val d = if (detail?.id == m.id) detail!! else m
                Panel {
                    Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.padding(bottom = 4.dp)) {
                        Text(Format.missionNumber(m.number), style = MaterialTheme.typography.titleMedium, color = if (m.status.name == "ACTIVE") RdColors.Green else RdColors.Text)
                        Text(m.status.name, color = RdColors.Muted, style = MaterialTheme.typography.labelSmall)
                    }
                    SimulationBadge(m.source)
                    KeyValue("Start", TimeFormat.human(m.startTime))
                    KeyValue("End", m.endTime?.let { TimeFormat.human(it) } ?: "--")
                    KeyValue("Thermal images", d.stats.thermalImages.toString())
                    KeyValue("RGB images", d.stats.rgbImages.toString())
                    KeyValue("Videos", d.stats.videos.toString())
                    KeyValue("Sensor readings", d.stats.sensorReadings.toString())
                    KeyValue("Gas alerts", d.stats.gasAlerts.toString())
                    KeyValue("Thermal hotspots", d.stats.thermalHotspots.toString())
                    KeyValue("Maps", d.stats.maps.toString())
                    ActionButton("REFRESH STATS", modifier = Modifier.padding(top = 6.dp)) { detail = m }
                }
            }
        }
    }
}
