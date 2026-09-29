package com.robodog.app.mapping

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import com.robodog.app.core.RoboDogConstants
import com.robodog.app.core.TimeFormat
import com.robodog.app.data.model.ThermalMapPayload
import com.robodog.app.storage.MediaStorage
import com.robodog.app.thermal.palette.ThermalPalette
import kotlinx.serialization.json.Json

/** Saves maps as JSON (full data) and a PNG rasterisation under RoboDog/Thermal/Maps. */
class MapExporter(private val storage: MediaStorage) {
    private val json = Json { encodeDefaults = true }

    data class Exported(val jsonUri: String, val pngUri: String?)

    fun export(payload: ThermalMapPayload, palette: ThermalPalette = ThermalPalette.IRON): Exported {
        val stamp = TimeFormat.fileStamp()
        val js = storage.saveText(json.encodeToString(ThermalMapPayload.serializer(), payload), RoboDogConstants.DIR_THERMAL_MAPS, "thermal_map_$stamp.json")
        val png = runCatching {
            val bmp = rasterize(payload, palette, 1024, 768)
            storage.saveJpeg(bmp, RoboDogConstants.DIR_THERMAL_MAPS, "thermal_map_$stamp.jpg").also { bmp.recycle() }
        }.getOrNull()
        return Exported(js.uri.toString(), png?.uri?.toString())
    }

    fun rasterize(p: ThermalMapPayload, palette: ThermalPalette, w: Int, h: Int): Bitmap {
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Color.rgb(11, 15, 20))
        val b = p.bounds ?: return bmp
        val sx = (w - 40) / (b.maxX - b.minX).coerceAtLeast(1e-6); val sy = (h - 40) / (b.maxY - b.minY).coerceAtLeast(1e-6)
        val s = minOf(sx, sy)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val r = (s * 0.5).toFloat().coerceIn(2f, 12f)
        for (pt in p.points) {
            val idx = (pt.thermalIntensity * 255).toInt().coerceIn(0, 255)
            paint.color = palette.lut[idx]
            c.drawCircle((20 + (pt.x - b.minX) * s).toFloat(), (h - 20 - (pt.y - b.minY) * s).toFloat(), r, paint)
        }
        paint.color = Color.WHITE; paint.strokeWidth = 2f
        var prev: Pair<Float, Float>? = null
        for (t in p.trajectory) {
            val x = (20 + (t.x - b.minX) * s).toFloat(); val y = (h - 20 - (t.y - b.minY) * s).toFloat()
            prev?.let { c.drawLine(it.first, it.second, x, y, paint) }
            prev = x to y
        }
        paint.textSize = 20f; paint.color = Color.LTGRAY
        c.drawText("${p.name}  ${p.dimension}  pose=${p.poseSource ?: "none"}  points=${p.pointCount}  ${if (p.source.name == "SIMULATION") "SIMULATION MODE" else ""}", 12f, 26f, paint)
        return bmp
    }
}
