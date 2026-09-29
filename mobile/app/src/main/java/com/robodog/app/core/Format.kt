package com.robodog.app.core

import java.util.Locale

/** Display helpers that never invent a value: null renders as "--". */
object Format {
    fun celsius(v: Double?): String = if (v == null) "--" else String.format(Locale.US, "%.1f °C", v)
    fun celsius(v: Float?): String = celsius(v?.toDouble())
    fun percent(v: Double?): String = if (v == null) "--" else String.format(Locale.US, "%.0f %%", v)
    fun int(v: Int?): String = v?.toString() ?: "--"
    fun int(v: Long?): String = v?.toString() ?: "--"
    fun decimal(v: Double?, digits: Int = 2): String = if (v == null) "--" else String.format(Locale.US, "%.${digits}f", v)
    fun bytes(v: Long?): String = when {
        v == null -> "--"
        v < 1024 -> "$v B"
        v < 1024 * 1024 -> String.format(Locale.US, "%.1f KB", v / 1024.0)
        else -> String.format(Locale.US, "%.1f MB", v / (1024.0 * 1024.0))
    }
    fun durationMs(v: Long?): String {
        if (v == null) return "--"
        val s = v / 1000
        return String.format(Locale.US, "%02d:%02d", s / 60, s % 60)
    }
    fun missionNumber(n: Int): String = String.format(Locale.US, "MISSION #%03d", n)
}
