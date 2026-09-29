package com.robodog.app.core

import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

object TimeFormat {
    private val fileStamp: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss")
    private val clock: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm:ss")
    private val human: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")

    fun nowIso(): String = Instant.now().toString()
    fun iso(epochMs: Long): String = Instant.ofEpochMilli(epochMs).toString()

    /** thermal_YYYYMMDD_HHMMSS style stamp in local time. */
    fun fileStamp(epochMs: Long = System.currentTimeMillis()): String =
        LocalDateTime.ofInstant(Instant.ofEpochMilli(epochMs), ZoneId.systemDefault()).format(fileStamp)

    fun clock(iso: String): String = runCatching {
        LocalDateTime.ofInstant(Instant.parse(iso), ZoneId.systemDefault()).format(clock)
    }.getOrDefault("--")

    fun human(iso: String): String = runCatching {
        LocalDateTime.ofInstant(Instant.parse(iso), ZoneId.systemDefault()).format(human)
    }.getOrDefault("--")

    fun epochMs(iso: String): Long = runCatching { Instant.parse(iso).toEpochMilli() }.getOrDefault(0L)

    fun utc(epochMs: Long): LocalDateTime = LocalDateTime.ofInstant(Instant.ofEpochMilli(epochMs), ZoneOffset.UTC)
}
