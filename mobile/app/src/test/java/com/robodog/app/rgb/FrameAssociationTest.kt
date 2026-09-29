package com.robodog.app.rgb

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FrameAssociationTest {
    @Test fun nearestWithinWindow() {
        val thermal = listOf(FrameAssociation.Stamped(1000L, "t1"), FrameAssociation.Stamped(1040L, "t2"), FrameAssociation.Stamped(1080L, "t3"))
        assertEquals("t2", FrameAssociation.nearest(1045, thermal, 50)!!.item)
        assertNull(FrameAssociation.nearest(2000, thermal, 50))
    }

    @Test fun pairsRgbWithThermal() {
        val rgb = listOf(FrameAssociation.Stamped(1010L, "r1"), FrameAssociation.Stamped(5000L, "r2"))
        val thermal = listOf(FrameAssociation.Stamped(1000L, "t1"))
        val pairs = FrameAssociation.pair(rgb, thermal, 100)
        assertEquals("t1", pairs[0].second!!.item); assertNull(pairs[1].second)
    }
}
