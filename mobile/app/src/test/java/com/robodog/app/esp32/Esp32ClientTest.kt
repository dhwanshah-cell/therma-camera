package com.robodog.app.esp32

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Test

/** End-to-end HTTP + parse against a local mock of the ESP32 endpoint. */
class Esp32ClientTest {
    @Test fun fetchesAndParsesFromMockEsp32() {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"temperature":28.4,"humidity":61,"gas_raw":1842,"gas_alert":false}""").setHeader("Content-Type", "application/json"))
        server.start()
        try {
            val body = OkHttpClient().newCall(Request.Builder().url(server.url("/api/sensors")).build()).execute().use { it.body!!.string() }
            val p = Esp32Parser.parse(body)
            assertEquals(1842, p.gas_raw)
            assertEquals("/api/sensors", server.takeRequest().path)
        } finally { server.shutdown() }
    }
}
