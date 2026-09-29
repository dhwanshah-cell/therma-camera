package com.robodog.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.robodog.app.core.DataSource
import com.robodog.app.ui.theme.RdColors

@Composable
fun Panel(modifier: Modifier = Modifier, title: String? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(RdColors.Panel)
            .border(1.dp, RdColors.Border, RoundedCornerShape(10.dp))
            .padding(14.dp),
    ) {
        if (title != null) { Label(title); Spacer(Modifier.size(8.dp)) }
        content()
    }
}

@Composable
fun Label(text: String, color: Color = RdColors.Muted) {
    Text(text.uppercase(), style = MaterialTheme.typography.labelSmall, color = color)
}

@Composable
fun StatusRow(label: String, connected: Boolean, connectedText: String = "CONNECTED", disconnectedText: String = "DISCONNECTED") {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        StatusDot(connected)
        Spacer(Modifier.width(10.dp))
        Text(label, Modifier.weight(1f), color = RdColors.Text, style = MaterialTheme.typography.bodyMedium)
        Text(if (connected) connectedText else disconnectedText, color = if (connected) RdColors.Green else RdColors.Red, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
fun StatusDot(ok: Boolean, size: Int = 10) {
    Box(Modifier.size(size.dp).clip(CircleShape).background(if (ok) RdColors.Green else RdColors.Red))
}

@Composable
fun Metric(label: String, value: String, modifier: Modifier = Modifier, valueColor: Color = RdColors.Text, sub: String? = null) {
    Column(modifier.padding(4.dp)) {
        Label(label)
        Text(value, style = MaterialTheme.typography.headlineMedium, color = valueColor)
        if (sub != null) Text(sub, style = MaterialTheme.typography.bodySmall, color = RdColors.Muted)
    }
}

@Composable
fun SimulationBadge(source: DataSource?, modifier: Modifier = Modifier) {
    if (source == DataSource.SIMULATION) {
        Text("SIMULATION MODE", modifier.clip(RoundedCornerShape(4.dp)).background(RdColors.Amber).padding(horizontal = 6.dp, vertical = 2.dp),
            color = Color.Black, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun ActionButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, accent: Boolean = false, danger: Boolean = false, onClick: () -> Unit) {
    val bg = when { danger -> RdColors.Red; accent -> RdColors.Accent; else -> RdColors.PanelAlt }
    val fg = when { danger || accent -> Color.Black; else -> RdColors.Text }
    Button(onClick = onClick, modifier = modifier, enabled = enabled, shape = RoundedCornerShape(8.dp),
        colors = ButtonDefaults.buttonColors(containerColor = bg, contentColor = fg, disabledContainerColor = RdColors.Border, disabledContentColor = RdColors.Muted)) {
        Text(text, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun KeyValue(key: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(key, color = RdColors.Muted, style = MaterialTheme.typography.bodySmall)
        Text(value, color = RdColors.Text, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
fun ScreenTitle(title: String, subtitle: String? = null) {
    Column(Modifier.padding(bottom = 8.dp)) {
        Text(title, style = MaterialTheme.typography.titleLarge, color = RdColors.Text)
        if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.labelSmall, color = RdColors.Accent)
    }
}
