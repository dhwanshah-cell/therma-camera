package com.robodog.app.esp32

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * HTTP client for the ESP32 access point. Because the ROBO-DOG network has no internet,
 * Android may route traffic over mobile data instead; we therefore bind requests to the
 * Wi-Fi network when one is available.
 */
class Esp32Client(private val context: Context) {
    companion object { private const val TAG = "Esp32Client" }

    private val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    @Volatile private var wifiNetwork: Network? = null
    @Volatile private var client: OkHttpClient = buildClient(null)
    private var callbackRegistered = false

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { Log.i(TAG, "wifi available: $network"); wifiNetwork = network; client = buildClient(network) }
        override fun onLost(network: Network) { if (wifiNetwork == network) { Log.i(TAG, "wifi lost"); wifiNetwork = null; client = buildClient(null) } }
    }

    fun start(bindToWifi: Boolean) {
        if (!bindToWifi || callbackRegistered) return
        val req = NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build()
        runCatching { connectivity.registerNetworkCallback(req, callback); callbackRegistered = true }
            .onFailure { Log.w(TAG, "network callback failed: $it") }
    }

    fun stop() {
        if (callbackRegistered) runCatching { connectivity.unregisterNetworkCallback(callback) }
        callbackRegistered = false
    }

    val boundToWifi: Boolean get() = wifiNetwork != null

    private fun buildClient(network: Network?): OkHttpClient {
        val b = OkHttpClient.Builder()
            .connectTimeout(700, TimeUnit.MILLISECONDS)
            .readTimeout(900, TimeUnit.MILLISECONDS)
            .callTimeout(1500, TimeUnit.MILLISECONDS)
            .retryOnConnectionFailure(false)
        if (network != null) b.socketFactory(network.socketFactory)
        return b.build()
    }

    /** Fetches and parses one sensor sample. Throws on network or parse failure. */
    @Throws(IOException::class, Esp32Parser.ParseException::class)
    fun fetch(url: String): Esp32Payload {
        val req = Request.Builder().url(url).header("Accept", "application/json").build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw IOException("ESP32 HTTP ${resp.code}")
            val body = resp.body?.string() ?: throw IOException("ESP32 empty body")
            return Esp32Parser.parse(body)
        }
    }
}
