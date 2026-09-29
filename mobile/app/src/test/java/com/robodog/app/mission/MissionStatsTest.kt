package com.robodog.app.mission

import com.robodog.app.core.Format
import org.junit.Assert.assertEquals
import org.junit.Test

class MissionStatsTest {
    @Test fun missionNumberFormatting() {
        assertEquals("MISSION #001", Format.missionNumber(1)); assertEquals("MISSION #042", Format.missionNumber(42))
    }
    @Test fun displayHelpersNeverInvent() {
        assertEquals("--", Format.celsius(null as Double?)); assertEquals("--", Format.percent(null)); assertEquals("--", Format.int(null as Int?))
        assertEquals("28.4 °C", Format.celsius(28.4))
    }
}
