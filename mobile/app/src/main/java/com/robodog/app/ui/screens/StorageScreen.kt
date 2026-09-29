package com.robodog.app.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.robodog.app.core.Format
import com.robodog.app.core.TimeFormat
import com.robodog.app.ui.RoboDogViewModel
import com.robodog.app.ui.components.ActionButton
import com.robodog.app.ui.components.KeyValue
import com.robodog.app.ui.components.Panel
import com.robodog.app.ui.components.ScreenTitle
import com.robodog.app.ui.components.SimulationBadge
import com.robodog.app.ui.theme.RdColors

private enum class Tab { THERMAL, RGB, VIDEOS, MAPS }

@Composable
fun StorageScreen(vm: RoboDogViewModel) {
    val ctx = LocalContext.current
    val thermal by vm.thermalImages.collectAsState()
    val rgb by vm.rgbImages.collectAsState()
    val videos by vm.videos.collectAsState()
    val maps by vm.maps.collectAsState()
    var tab by remember { mutableStateOf(Tab.THERMAL) }

    fun open(uri: String, mime: String) { runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(uri), mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)) } }
    fun share(uri: String, mime: String) { runCatching { ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, Uri.parse(uri)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Share").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } }

    Column(Modifier.fillMaxSize().padding(12.dp)) {
        ScreenTitle("THERMAL STORAGE", "LOCAL · AVAILABLE OFFLINE")
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(bottom = 8.dp)) {
            ActionButton("THERMAL (${thermal.size})", accent = tab == Tab.THERMAL) { tab = Tab.THERMAL }
            ActionButton("RGB (${rgb.size})", accent = tab == Tab.RGB) { tab = Tab.RGB }
            ActionButton("VIDEOS (${videos.size})", accent = tab == Tab.VIDEOS) { tab = Tab.VIDEOS }
            ActionButton("MAPS (${maps.size})", accent = tab == Tab.MAPS) { tab = Tab.MAPS }
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            when (tab) {
                Tab.THERMAL -> items(thermal, key = { it.id }) { img ->
                    Panel {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            AsyncImage(model = img.filePath, contentDescription = img.fileName, modifier = Modifier.size(96.dp, 72.dp), contentScale = ContentScale.Crop)
                            Column(Modifier.weight(1f).padding(start = 10.dp)) {
                                Text(img.fileName, color = RdColors.Text, style = MaterialTheme.typography.bodyMedium)
                                Text(TimeFormat.human(img.timestamp), color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
                                Text(if (img.radiometric) "C ${Format.celsius(img.centerTemperature)} · max ${Format.celsius(img.maxTemperature)} · min ${Format.celsius(img.minTemperature)}" else "Radiometric temperature unavailable", color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
                                Text("${img.width}x${img.height} · ${img.palette} · ${img.frameFormat ?: "--"} · ${Format.bytes(img.sizeBytes)} · ${if (img.uploaded) "synced" else "local only"}", color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
                                SimulationBadge(img.source)
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 6.dp)) {
                            ActionButton("OPEN") { open(img.filePath, "image/jpeg") }
                            ActionButton("SHARE") { share(img.filePath, "image/jpeg") }
                            ActionButton("DELETE", danger = true) { vm.deleteThermal(img) }
                        }
                    }
                }
                Tab.RGB -> items(rgb, key = { it.id }) { img ->
                    Panel {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            AsyncImage(model = img.filePath, contentDescription = img.fileName, modifier = Modifier.size(96.dp, 72.dp), contentScale = ContentScale.Crop)
                            Column(Modifier.weight(1f).padding(start = 10.dp)) {
                                Text(img.fileName, color = RdColors.Text)
                                Text(TimeFormat.human(img.timestamp), color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
                                Text("${img.width}x${img.height} · ${Format.bytes(img.sizeBytes)} · thermal: ${img.associatedThermalImageId?.take(16) ?: "--"}", color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 6.dp)) {
                            ActionButton("OPEN") { open(img.filePath, "image/jpeg") }
                            ActionButton("SHARE") { share(img.filePath, "image/jpeg") }
                            ActionButton("DELETE", danger = true) { vm.deleteRgb(img) }
                        }
                    }
                }
                Tab.VIDEOS -> items(videos, key = { it.id }) { v ->
                    Panel {
                        Text(v.fileName, color = RdColors.Text)
                        KeyValue("Kind", v.kind.name); KeyValue("Recorded", TimeFormat.human(v.timestamp)); KeyValue("Duration", Format.durationMs(v.durationMs))
                        KeyValue("Frames", Format.int(v.frameCount)); KeyValue("Codec", v.codec); KeyValue("Size", Format.bytes(v.sizeBytes)); KeyValue("Synced", if (v.uploaded) "yes" else "local only")
                        SimulationBadge(v.source)
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 6.dp)) {
                            ActionButton("OPEN") { open(v.filePath, "video/mp4") }
                            ActionButton("SHARE") { share(v.filePath, "video/mp4") }
                            ActionButton("DELETE", danger = true) { vm.deleteVideo(v) }
                        }
                    }
                }
                Tab.MAPS -> items(maps, key = { it.id }) { m ->
                    Panel {
                        Text(m.name, color = RdColors.Text)
                        KeyValue("Saved", TimeFormat.human(m.timestamp)); KeyValue("Dimension", m.dimension); KeyValue("Points", m.pointCount.toString())
                        KeyValue("Pose", m.poseSource?.name ?: "none"); KeyValue("Synced", if (m.uploaded) "yes" else "local only")
                        SimulationBadge(m.source)
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 6.dp)) {
                            m.filePath?.let { ActionButton("SHARE JSON") { share(it, "application/json") } }
                            ActionButton("DELETE", danger = true) { vm.deleteMap(m) }
                        }
                    }
                }
            }
        }
    }
}
