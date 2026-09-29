package com.robodog.app.thermal.palette

/**
 * Colour palettes applied to raw thermal intensity. CAMERA means "show the camera's own
 * colourised stream untouched" and is only meaningful when the stream carries chroma.
 */
enum class ThermalPalette(val label: String) {
    CAMERA("CAMERA"),
    IRON("IRON"),
    RAINBOW("RAINBOW"),
    WHITE_HOT("WHITE HOT"),
    BLACK_HOT("BLACK HOT"),
    LAVA("LAVA"),
    GRAYSCALE("GRAYSCALE");

    /** 256-entry ARGB lookup table; CAMERA falls back to IRON when used on intensity data. */
    val lut: IntArray by lazy { Palettes.build(this) }

    companion object {
        fun fromName(name: String?): ThermalPalette = entries.firstOrNull { it.name == name } ?: IRON
        val selectable: List<ThermalPalette> get() = entries
    }
}

object Palettes {
    private data class Stop(val pos: Float, val r: Int, val g: Int, val b: Int)

    private val IRON = listOf(
        Stop(0f, 0, 0, 0), Stop(0.12f, 32, 0, 82), Stop(0.28f, 120, 10, 140), Stop(0.45f, 200, 40, 90),
        Stop(0.62f, 240, 110, 30), Stop(0.80f, 255, 190, 20), Stop(1f, 255, 255, 230),
    )
    private val RAINBOW = listOf(
        Stop(0f, 0, 0, 80), Stop(0.2f, 0, 60, 255), Stop(0.4f, 0, 220, 220), Stop(0.6f, 60, 255, 0),
        Stop(0.8f, 255, 220, 0), Stop(1f, 255, 0, 0),
    )
    private val LAVA = listOf(
        Stop(0f, 0, 0, 0), Stop(0.25f, 70, 0, 0), Stop(0.5f, 180, 20, 0), Stop(0.75f, 255, 120, 0), Stop(1f, 255, 255, 120),
    )
    private val GRAY = listOf(Stop(0f, 0, 0, 0), Stop(1f, 255, 255, 255))
    private val GRAY_INV = listOf(Stop(0f, 255, 255, 255), Stop(1f, 0, 0, 0))

    fun build(p: ThermalPalette): IntArray = when (p) {
        ThermalPalette.CAMERA, ThermalPalette.IRON -> interpolate(IRON)
        ThermalPalette.RAINBOW -> interpolate(RAINBOW)
        ThermalPalette.WHITE_HOT, ThermalPalette.GRAYSCALE -> interpolate(GRAY)
        ThermalPalette.BLACK_HOT -> interpolate(GRAY_INV)
        ThermalPalette.LAVA -> interpolate(LAVA)
    }

    private fun interpolate(stops: List<Stop>): IntArray {
        val lut = IntArray(256)
        for (i in 0 until 256) {
            val t = i / 255f
            var a = stops.first(); var b = stops.last()
            for (k in 0 until stops.size - 1) if (t >= stops[k].pos && t <= stops[k + 1].pos) { a = stops[k]; b = stops[k + 1]; break }
            val span = (b.pos - a.pos).takeIf { it > 0f } ?: 1f
            val f = ((t - a.pos) / span).coerceIn(0f, 1f)
            val r = (a.r + (b.r - a.r) * f).toInt()
            val g = (a.g + (b.g - a.g) * f).toInt()
            val bb = (a.b + (b.b - a.b) * f).toInt()
            lut[i] = (0xFF shl 24) or (r shl 16) or (g shl 8) or bb
        }
        return lut
    }
}
