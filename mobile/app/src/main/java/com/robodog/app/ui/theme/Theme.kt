package com.robodog.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Dark robotics HMI palette. */
object RdColors {
    val Background = Color(0xFF0B0F14)
    val Panel = Color(0xFF121821)
    val PanelAlt = Color(0xFF17202B)
    val Border = Color(0xFF1F2A37)
    val Text = Color(0xFFE6EDF3)
    val Muted = Color(0xFF8B98A5)
    val Accent = Color(0xFFFF7A1A)
    val Green = Color(0xFF22C55E)
    val Red = Color(0xFFEF4444)
    val Amber = Color(0xFFF59E0B)
    val Blue = Color(0xFF3B82F6)
}

private val scheme = darkColorScheme(
    primary = RdColors.Accent, onPrimary = Color.Black,
    background = RdColors.Background, onBackground = RdColors.Text,
    surface = RdColors.Panel, onSurface = RdColors.Text,
    surfaceVariant = RdColors.PanelAlt, onSurfaceVariant = RdColors.Muted,
    outline = RdColors.Border, error = RdColors.Red,
    secondary = RdColors.Blue, tertiary = RdColors.Amber,
)

private val typography = Typography(
    titleLarge = TextStyle(fontWeight = FontWeight.Bold, fontSize = 22.sp, letterSpacing = 2.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 16.sp, letterSpacing = 1.sp),
    labelSmall = TextStyle(fontSize = 11.sp, letterSpacing = 1.5.sp, fontWeight = FontWeight.Medium),
    bodyMedium = TextStyle(fontSize = 14.sp),
    bodySmall = TextStyle(fontSize = 12.sp, fontFamily = FontFamily.Monospace),
    headlineMedium = TextStyle(fontSize = 28.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace),
)

@Composable
fun RoboDogTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, typography = typography, content = content)
}
