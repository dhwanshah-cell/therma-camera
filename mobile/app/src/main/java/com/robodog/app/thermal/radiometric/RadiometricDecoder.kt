package com.robodog.app.thermal.radiometric

import com.robodog.app.thermal.FrameLayout
import com.robodog.app.thermal.RadiometricResult
import com.robodog.app.thermal.usb.UvcPixelFormat

/**
 * A radiometric decoder turns raw stream data into Celsius values.
 *
 * None of these decoders is enabled by default. The UVC stream of the TC01A carries an
 * image; whether it also carries calibrated temperature data, and in which encoding, must
 * be confirmed against a reference before the app reports temperatures. Until a decoder
 * is explicitly selected in Settings the app reports "Radiometric temperature unavailable".
 */
interface RadiometricDecoder {
    val id: String
    val label: String
    val description: String
    val experimental: Boolean

    /**
     * @param intensity decoded per-pixel intensity (image half for stacked layouts)
     * @param rawLowerHalf raw bytes of the lower half for stacked layouts, null otherwise
     */
    fun decode(
        width: Int,
        height: Int,
        pixelFormat: UvcPixelFormat,
        layout: FrameLayout,
        intensity: IntArray,
        rawLowerHalf: ByteArray?,
    ): RadiometricResult?
}

object RadiometricDecoders {
    val NONE: RadiometricDecoder = NoRadiometricDecoder
    val all: List<RadiometricDecoder> = listOf(NoRadiometricDecoder, StackedRaw16Kelvin64Decoder, Y16CentiKelvinDecoder, Y16Kelvin64Decoder)
    fun byId(id: String?): RadiometricDecoder = all.firstOrNull { it.id == id } ?: NONE

    /** Plausibility gate: reject decodes far outside the camera's datasheet range. */
    fun plausible(minC: Float, maxC: Float): Boolean = minC > -60f && maxC < 700f && maxC >= minC && (maxC - minC) < 800f
}

object NoRadiometricDecoder : RadiometricDecoder {
    override val id = "NONE"
    override val label = "Off (image only)"
    override val description = "No temperature decoding. Temperatures are shown as unavailable."
    override val experimental = false
    override fun decode(width: Int, height: Int, pixelFormat: UvcPixelFormat, layout: FrameLayout, intensity: IntArray, rawLowerHalf: ByteArray?): RadiometricResult? = null
}

/** Shared helper: 16-bit little-endian samples → Celsius through a linear mapping. */
internal fun decodeLinear16(
    name: String, width: Int, height: Int, samples: (Int) -> Int, toCelsius: (Int) -> Float,
): RadiometricResult? {
    val n = width * height
    val temps = FloatArray(n)
    var minC = Float.MAX_VALUE; var maxC = -Float.MAX_VALUE
    var minI = 0; var maxI = 0
    for (i in 0 until n) {
        val c = toCelsius(samples(i))
        temps[i] = c
        if (c < minC) { minC = c; minI = i }
        if (c > maxC) { maxC = c; maxI = i }
    }
    if (!RadiometricDecoders.plausible(minC, maxC)) return null
    val center = temps[(height / 2) * width + width / 2]
    return RadiometricResult(name, center, minC, maxC, temps, maxI, minI)
}

/**
 * Stacked YUY2 frames (image on top, 16-bit raw on the bottom) where raw = Kelvin * 64.
 * This convention is used by several 256x192 phone thermal modules. EXPERIMENTAL: verify
 * with a reference thermometer before trusting values.
 */
object StackedRaw16Kelvin64Decoder : RadiometricDecoder {
    override val id = "STACKED_RAW16_K64"
    override val label = "Stacked frame, raw16 = K×64 (experimental)"
    override val description = "The 16-bit raw half of a double-height frame; °C = value/64 − 273.15."
    override val experimental = true
    override fun decode(width: Int, height: Int, pixelFormat: UvcPixelFormat, layout: FrameLayout, intensity: IntArray, rawLowerHalf: ByteArray?): RadiometricResult? {
        if (layout != FrameLayout.STACKED_IMAGE_RAW || rawLowerHalf == null) return null
        if (rawLowerHalf.size < width * height * 2) return null
        return decodeLinear16(id, width, height,
            samples = { i -> (rawLowerHalf[i * 2].toInt() and 0xFF) or ((rawLowerHalf[i * 2 + 1].toInt() and 0xFF) shl 8) },
            toCelsius = { v -> v / 64f - 273.15f })
    }
}

/** Y16 streams where each sample is centi-Kelvin (FLIR "TLinear"-style). EXPERIMENTAL. */
object Y16CentiKelvinDecoder : RadiometricDecoder {
    override val id = "Y16_CENTIKELVIN"
    override val label = "Y16 = centi-Kelvin (experimental)"
    override val description = "°C = value/100 − 273.15 on a 16-bit single-channel stream."
    override val experimental = true
    override fun decode(width: Int, height: Int, pixelFormat: UvcPixelFormat, layout: FrameLayout, intensity: IntArray, rawLowerHalf: ByteArray?): RadiometricResult? {
        if (pixelFormat != UvcPixelFormat.Y16) return null
        return decodeLinear16(id, width, height, samples = { intensity[it] }, toCelsius = { v -> v / 100f - 273.15f })
    }
}

/** Y16 streams where each sample is Kelvin × 64. EXPERIMENTAL. */
object Y16Kelvin64Decoder : RadiometricDecoder {
    override val id = "Y16_K64"
    override val label = "Y16 = K×64 (experimental)"
    override val description = "°C = value/64 − 273.15 on a 16-bit single-channel stream."
    override val experimental = true
    override fun decode(width: Int, height: Int, pixelFormat: UvcPixelFormat, layout: FrameLayout, intensity: IntArray, rawLowerHalf: ByteArray?): RadiometricResult? {
        if (pixelFormat != UvcPixelFormat.Y16) return null
        return decodeLinear16(id, width, height, samples = { intensity[it] }, toCelsius = { v -> v / 64f - 273.15f })
    }
}
