package com.robodog.app.rgb

/**
 * Associates frames from different sensors by timestamp. Pure Kotlin so it can be unit tested.
 * Frames are matched to the nearest neighbour within [maxDeltaMs]; no alignment is assumed.
 */
object FrameAssociation {
    data class Stamped<T>(val timestampMs: Long, val item: T)

    /** Nearest [candidates] entry to [targetMs], or null if none is within [maxDeltaMs]. */
    fun <T> nearest(targetMs: Long, candidates: List<Stamped<T>>, maxDeltaMs: Long): Stamped<T>? {
        var best: Stamped<T>? = null
        var bestDelta = Long.MAX_VALUE
        for (c in candidates) {
            val d = kotlin.math.abs(c.timestampMs - targetMs)
            if (d < bestDelta) { bestDelta = d; best = c }
        }
        return if (best != null && bestDelta <= maxDeltaMs) best else null
    }

    /** Pairs every entry in [a] with its nearest entry in [b] (sorted inputs not required). */
    fun <A, B> pair(a: List<Stamped<A>>, b: List<Stamped<B>>, maxDeltaMs: Long): List<Pair<Stamped<A>, Stamped<B>?>> =
        a.map { it to nearest(it.timestampMs, b, maxDeltaMs) }
}
