package app.v2rayez.gui;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public final class AppUpdateManagerTest {
    @Test public void semanticVersionsCompareNumerically() {
        assertTrue(AppUpdateManager.compareVersions("1.2", "1.1") > 0);
        assertTrue(AppUpdateManager.compareVersions("1.12.0", "1.11.9") > 0);
        assertEquals(0, AppUpdateManager.compareVersions("v1.2", "1.2"));
    }

    @Test public void checksumFileSelectsExactAsset() {
        String sums = "aaa  V2RayEZ_1.2_android-arm64.apk\nabcdef  V2RayEZ_1.2_android-universal.apk\n";
        assertEquals("abcdef", AppUpdateManager.checksumFromFile(sums, "V2RayEZ_1.2_android-universal.apk"));
    }
}
