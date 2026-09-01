package app.v2rayez.gui;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;

final class AndroidLicenseGate {
    static final class Decision {
        final boolean allowed;
        final String reason;
        final String source;

        Decision(boolean allowed, String reason, String source) {
            this.allowed = allowed;
            this.reason = reason;
            this.source = source;
        }
    }

    private static final String STATE_PREFS = "v2rayez_license_state";
    private static final String KEY_EXPIRES_AT = "expiresAt";
    private static final String KEY_GRACE_UNTIL = "offlineGraceUntil";
    private static final String KEY_LAST_RESULT = "lastResult";
    private static final String KEY_LAST_REASON = "lastReason";

    private final Context context;
    private final SharedPreferences settings;
    private final SharedPreferences state;
    private final AndroidSecretStore secrets;

    AndroidLicenseGate(Context context, SharedPreferences settings, AndroidSecretStore secrets) {
        this.context = context.getApplicationContext();
        this.settings = settings;
        this.secrets = secrets;
        this.state = this.context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE);
    }

    Decision validate() {
        if (!secrets.contains(AndroidSecretStore.LICENSE_SERIAL)) {
            return remember(new Decision(true, "license_not_configured", "disabled"));
        }

        String licenseKey;
        try {
            licenseKey = secrets.get(AndroidSecretStore.LICENSE_SERIAL).trim();
        } catch (Exception error) {
            return remember(new Decision(false, "license_secret_unreadable", "local"));
        }
        if (licenseKey.isEmpty()) {
            return remember(new Decision(false, "license_secret_empty", "local"));
        }

        Decision hardCutoff = localHardCutoff();
        if (hardCutoff != null && !hardCutoff.allowed) return remember(hardCutoff);

        String accountId = settings.getString("licenseAccountId", "");
        String serverUrl = settings.getString("licenseServerUrl", "");
        if (accountId == null || accountId.trim().isEmpty() || serverUrl == null || serverUrl.trim().isEmpty()) {
            return remember(offlineDecision("license_account_or_server_missing"));
        }

        try {
            return remember(validateOnline(endpoint(serverUrl), licenseKey, accountId.trim()));
        } catch (Exception error) {
            return remember(offlineDecision("server_unreachable:" + safeError(error)));
        }
    }

    private Decision validateOnline(String endpoint, String licenseKey, String accountId) throws Exception {
        JSONObject body = new JSONObject()
                .put("licenseKey", licenseKey)
                .put("deviceId", deviceId())
                .put("accountId", accountId)
                .put("platform", "android")
                .put("appVersion", BuildConfig.VERSION_NAME)
                .put("deviceLabel", Build.MANUFACTURER + " " + Build.MODEL);

        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(25_000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("Accept", "application/json");
        try (OutputStream output = connection.getOutputStream()) {
            output.write(payload);
        }
        int code = connection.getResponseCode();
        String text = readAll(code >= 200 && code < 300 ? connection.getInputStream() : connection.getErrorStream());
        if (text.trim().isEmpty()) throw new IllegalStateException("empty_license_response");
        JSONObject response = new JSONObject(text);
        if (!response.optBoolean("success", false)) {
            return new Decision(false, response.optString("reason", "license_denied"), "server");
        }

        String expiresAt = response.optString("expiresAt", "");
        String graceUntil = response.optString("offlineGraceUntil", "");
        if (!expiresAt.isEmpty()) parseInstant(expiresAt);
        if (!graceUntil.isEmpty()) parseInstant(graceUntil);
        state.edit()
                .putString(KEY_EXPIRES_AT, expiresAt)
                .putString(KEY_GRACE_UNTIL, graceUntil)
                .putString("serverTime", response.optString("serverTime", ""))
                .putLong("remainingSeconds", Math.max(0L, response.optLong("remainingSeconds", 0L)))
                .apply();
        Decision cutoff = localHardCutoff();
        if (cutoff != null && !cutoff.allowed) return cutoff;
        return new Decision(true, response.optString("reason", "valid"), "server");
    }

    private Decision offlineDecision(String reasonPrefix) {
        Decision cutoff = localHardCutoff();
        if (cutoff != null) return cutoff.allowed ? new Decision(true, reasonPrefix + ":using_cached_grace", "offline_grace") : cutoff;
        String expiresAt = state.getString(KEY_EXPIRES_AT, "");
        String graceUntil = state.getString(KEY_GRACE_UNTIL, "");
        if (expiresAt == null || expiresAt.isEmpty() || graceUntil == null || graceUntil.isEmpty()) {
            return new Decision(false, reasonPrefix + ":online_validation_required", "offline_grace");
        }
        return new Decision(false, reasonPrefix + ":offline_grace_invalid", "offline_grace");
    }

    private Decision localHardCutoff() {
        String expiresAt = state.getString(KEY_EXPIRES_AT, "");
        String graceUntil = state.getString(KEY_GRACE_UNTIL, "");
        if (expiresAt == null || expiresAt.isEmpty() || graceUntil == null || graceUntil.isEmpty()) return null;
        try {
            Instant now = Instant.now();
            Instant expires = parseInstant(expiresAt);
            Instant grace = parseInstant(graceUntil);
            Instant cutoff = expires.isBefore(grace) ? expires : grace;
            if (!now.isBefore(expires)) return new Decision(false, "license_expired", "local_cutoff");
            if (!now.isBefore(grace)) return new Decision(false, "offline_grace_expired", "local_cutoff");
            return new Decision(true, "cached_grace_valid_until_" + cutoff.toString(), "offline_grace");
        } catch (Exception error) {
            return new Decision(false, "cached_license_state_invalid", "local_cutoff");
        }
    }

    private Decision remember(Decision decision) {
        state.edit()
                .putString(KEY_LAST_RESULT, decision.allowed ? "ALLOWED" : "DENIED")
                .putString(KEY_LAST_REASON, decision.reason)
                .putString("lastSource", decision.source)
                .putLong("lastCheckedAt", System.currentTimeMillis())
                .apply();
        return decision;
    }

    private String deviceId() {
        String androidId = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ANDROID_ID);
        if (androidId != null && !androidId.trim().isEmpty()) return "android:" + androidId.trim();
        return "android:" + Build.MANUFACTURER + ":" + Build.MODEL + ":" + Build.FINGERPRINT;
    }

    private static String endpoint(String raw) {
        String base = raw.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base.endsWith("/api/licenses/validate") ? base : base + "/api/licenses/validate";
    }

    private static Instant parseInstant(String value) {
        return Instant.parse(value);
    }

    private static String readAll(InputStream input) throws Exception {
        if (input == null) return "";
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
        }
        return builder.toString();
    }

    private static String safeError(Exception error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty() ? error.getClass().getSimpleName() : message;
    }
}
