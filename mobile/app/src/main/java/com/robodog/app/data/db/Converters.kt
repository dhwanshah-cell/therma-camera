package com.robodog.app.data.db

import androidx.room.TypeConverter
import com.robodog.app.data.model.GpsFix
import com.robodog.app.data.model.Position
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

class Converters {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val mapSerializer = MapSerializer(String.serializer(), JsonElement.serializer())

    @TypeConverter fun positionToJson(p: Position?): String? = p?.let { json.encodeToString(Position.serializer(), it) }
    @TypeConverter fun jsonToPosition(s: String?): Position? = s?.let { runCatching { json.decodeFromString(Position.serializer(), it) }.getOrNull() }

    @TypeConverter fun gpsToJson(g: GpsFix?): String? = g?.let { json.encodeToString(GpsFix.serializer(), it) }
    @TypeConverter fun jsonToGps(s: String?): GpsFix? = s?.let { runCatching { json.decodeFromString(GpsFix.serializer(), it) }.getOrNull() }

    @TypeConverter fun metadataToJson(m: Map<String, JsonElement>?): String = json.encodeToString(mapSerializer, m ?: emptyMap())
    @TypeConverter fun jsonToMetadata(s: String?): Map<String, JsonElement> = s?.let { runCatching { json.decodeFromString(mapSerializer, it) }.getOrNull() } ?: emptyMap()
}
