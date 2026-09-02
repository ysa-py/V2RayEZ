package com.v2rayez.licenseadmin;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Separate Android companion for V2RayEZ license operators.
 *
 * It calls the same dashboard REST API used by the web admin panel. The bearer/session token is
 * intentionally kept in memory only and is never written to SharedPreferences. It never embeds a signing key:
 * anti-forgery stays server-side through Ed25519-issued serials and signed grace tokens. Revoke is
 * sent immediately to the server; active VPN clients cut off at their next online validation/watchdog
 * tick, while clients with no route to the validation server can only be stopped once they reconnect
 * or their already-signed offline grace expires.
 */
public final class MainActivity extends Activity {
    private static final String PREFS = "v2rayez_license_admin";
    private static final int PURPLE = Color.rgb(124, 58, 237);
    private static final int DARK = Color.rgb(21, 17, 38);
    private static final int TEXT = Color.rgb(31, 41, 55);

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    private SharedPreferences prefs;
    private EditText baseUrl;
    private EditText adminToken;
    private EditText userId;
    private EditText accountId;
    private EditText expiresAt;
    private EditText maxDevices;
    private EditText offlineGraceHours;
    private EditText featuresCsv;
    private EditText licenseId;
    private EditText licenseKey;
    private EditText revokeReason;
    private TextView output;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        setContentView(buildUi());
        loadPrefs();
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private View buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(18), dp(18), dp(24));
        scroll.addView(root);

        TextView title = text("V2RayEZ License Admin", 24, Color.WHITE, true);
        TextView sub = text("Issue, renew, revoke, and validate signed V2RayEZ serials from a separate Android operator app.", 14, Color.WHITE, false);
        LinearLayout header = card(DARK);
        header.addView(title);
        header.addView(sub);
        root.addView(header);

        root.addView(section("Dashboard connection"));
        baseUrl = field("Dashboard base URL", "https://dashboard.example.com", InputType.TYPE_TEXT_VARIATION_URI);
        adminToken = field("Admin bearer/session token", "LICENSE_ADMIN_TOKEN or dashboard session", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(baseUrl);
        root.addView(adminToken);
        TextView tokenNote = text("Admin token is intentionally session-only and is not saved on device.", 12, Color.rgb(107, 114, 128), false);
        root.addView(tokenNote);
        root.addView(row(button("Save non-secret settings", this::savePrefs), button("Validate settings", () -> postValidateOnly())));

        root.addView(section("Issue / renew per-user license"));
        userId = field("User ID", "user_cuid", InputType.TYPE_CLASS_TEXT);
        accountId = field("Account ID", "account-or-user-id", InputType.TYPE_CLASS_TEXT);
        expiresAt = field("Expiry ISO-8601", Instant.now().plus(30, ChronoUnit.DAYS).toString(), InputType.TYPE_CLASS_TEXT);
        maxDevices = field("Max devices", "1", InputType.TYPE_CLASS_NUMBER);
        offlineGraceHours = field("Offline grace hours", "72", InputType.TYPE_CLASS_NUMBER);
        featuresCsv = field("Features CSV", "vpn,dns-tunnel,ai-gateway", InputType.TYPE_CLASS_TEXT);
        licenseId = field("License ID for renew/revoke", "lic_...", InputType.TYPE_CLASS_TEXT);
        root.addView(userId);
        root.addView(accountId);
        root.addView(expiresAt);
        root.addView(maxDevices);
        root.addView(offlineGraceHours);
        root.addView(featuresCsv);
        root.addView(licenseId);
        root.addView(row(button("Issue serial", this::issue), button("Renew", this::renew)));

        root.addView(section("Instant revoke / client activation"));
        licenseKey = field("License key / serial", "eyJhbGciOiJFZERTQSIs...", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        licenseKey.setMinLines(3);
        revokeReason = field("Revoke reason", "operator_revoke", InputType.TYPE_CLASS_TEXT);
        root.addView(licenseKey);
        root.addView(revokeReason);
        root.addView(row(button("Revoke now", this::revoke), button("Validate serial", this::validateSerial)));
        root.addView(button("Copy result", this::copyResult));

        TextView note = text(
            "Hard cutoff note: revocation is immediate on the dashboard and on clients that can reach validation. Offline clients cannot receive an instant revoke packet; they stop at the next server validation or signed grace expiry.",
            13,
            Color.rgb(107, 114, 128),
            false
        );
        note.setPadding(0, dp(8), 0, dp(8));
        root.addView(note);

        output = text("Ready.", 13, TEXT, false);
        output.setInputType(InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        LinearLayout outCard = card(Color.rgb(245, 243, 255));
        outCard.addView(output);
        root.addView(outCard);
        return scroll;
    }

    private TextView section(String value) {
        TextView view = text(value, 17, PURPLE, true);
        view.setPadding(0, dp(18), 0, dp(6));
        return view;
    }

    private LinearLayout card(int color) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(16), dp(16), dp(16));
        card.setBackgroundColor(color);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        lp.setMargins(0, dp(6), 0, dp(10));
        card.setLayoutParams(lp);
        return card;
    }

    private LinearLayout row(View left, View right) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.addView(left, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout.LayoutParams rightParams = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        rightParams.setMargins(dp(8), 0, 0, 0);
        row.addView(right, rightParams);
        return row;
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        if (bold) view.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        return view;
    }

    private EditText field(String label, String hint, int inputType) {
        EditText edit = new EditText(this);
        edit.setHint(label + " — " + hint);
        edit.setSingleLine((inputType & InputType.TYPE_TEXT_FLAG_MULTI_LINE) == 0);
        edit.setInputType(inputType);
        edit.setPadding(0, dp(8), 0, dp(8));
        return edit;
    }

    private Button button(String label, Runnable action) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setOnClickListener(v -> action.run());
        return button;
    }

    private void loadPrefs() {
        baseUrl.setText(prefs.getString("baseUrl", ""));
        adminToken.setText("");
        userId.setText(prefs.getString("userId", ""));
        accountId.setText(prefs.getString("accountId", ""));
        maxDevices.setText(prefs.getString("maxDevices", "1"));
        offlineGraceHours.setText(prefs.getString("offlineGraceHours", "72"));
        featuresCsv.setText(prefs.getString("featuresCsv", "vpn,dns-tunnel,ai-gateway"));
    }

    private void savePrefs() {
        prefs.edit()
            .putString("baseUrl", value(baseUrl))
            .putString("userId", value(userId))
            .putString("accountId", value(accountId))
            .putString("maxDevices", value(maxDevices))
            .putString("offlineGraceHours", value(offlineGraceHours))
            .putString("featuresCsv", value(featuresCsv))
            .apply();
        toast("Saved");
    }

    private void issue() {
        savePrefs();
        JSONObject body = new JSONObject()
            .put("userId", value(userId))
            .put("accountId", value(accountId))
            .put("expiresAt", value(expiresAt))
            .put("maxDevices", parseInt(value(maxDevices), 1))
            .put("offlineGraceHours", parseInt(value(offlineGraceHours), 72))
            .put("features", features());
        call("POST", "/api/licenses/issue", body, true, json -> {
            String serial = json.optString("licenseKey", "");
            if (!serial.isEmpty()) licenseKey.setText(serial);
        });
    }

    private void renew() {
        savePrefs();
        JSONObject body = new JSONObject()
            .put("licenseId", value(licenseId))
            .put("licenseKey", value(licenseKey))
            .put("expiresAt", value(expiresAt));
        call("POST", "/api/licenses/renew", body, true, json -> {
            String serial = json.optString("licenseKey", "");
            if (!serial.isEmpty()) licenseKey.setText(serial);
        });
    }

    private void revoke() {
        savePrefs();
        JSONObject body = new JSONObject()
            .put("licenseId", value(licenseId))
            .put("licenseKey", value(licenseKey))
            .put("reason", value(revokeReason).isEmpty() ? "operator_revoke" : value(revokeReason));
        call("POST", "/api/licenses/revoke", body, true, null);
    }

    private void validateSerial() {
        savePrefs();
        JSONObject body = new JSONObject()
            .put("licenseKey", value(licenseKey))
            .put("deviceId", "license-admin-preview")
            .put("accountId", value(accountId))
            .put("platform", "android-admin")
            .put("deviceLabel", "V2RayEZ License Admin");
        call("POST", "/api/licenses/validate", body, false, null);
    }

    private void postValidateOnly() {
        savePrefs();
        JSONObject body = new JSONObject()
            .put("licenseKey", value(licenseKey))
            .put("deviceId", "license-admin-preview")
            .put("accountId", value(accountId))
            .put("platform", "android-admin")
            .put("deviceLabel", "V2RayEZ License Admin");
        call("POST", "/api/licenses/validate", body, false, null);
    }

    private JSONArray features() {
        JSONArray array = new JSONArray();
        for (String part : value(featuresCsv).split(",")) {
            String feature = part.trim();
            if (!feature.isEmpty()) array.put(feature);
        }
        return array;
    }

    private void call(String method, String path, JSONObject body, boolean admin, JsonSuccess success) {
        setOutput("Calling " + path + " …");
        executor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(endpoint(path));
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod(method);
                conn.setConnectTimeout(12_000);
                conn.setReadTimeout(20_000);
                conn.setRequestProperty("Accept", "application/json");
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                conn.setRequestProperty("User-Agent", "V2RayEZ-License-Admin-Android/1.0.0");
                String token = value(adminToken);
                if (admin && token.isEmpty()) {
                    throw new IllegalStateException("Admin token is required for this endpoint");
                }
                if (!token.isEmpty()) conn.setRequestProperty("Authorization", "Bearer " + token);
                conn.setDoOutput(true);
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(bytes);
                }
                int code = conn.getResponseCode();
                String response = readBody(conn, code);
                JSONObject json = new JSONObject(response.isEmpty() ? "{}" : response);
                main.post(() -> {
                    setOutput("HTTP " + code + "\n" + json.toString(2));
                    if (success != null && code >= 200 && code < 300) success.run(json);
                });
            } catch (Exception e) {
                main.post(() -> setOutput("ERROR: " + e.getMessage()));
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    private String endpoint(String path) {
        String base = value(baseUrl).replaceAll("/+$", "");
        if (base.isEmpty()) throw new IllegalStateException("Dashboard base URL is required");
        if (!base.startsWith("https://")) {
            throw new IllegalStateException("Use HTTPS dashboard URL for admin operations");
        }
        return base + path;
    }

    private String readBody(HttpURLConnection conn, int code) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(
            code >= 200 && code < 400 ? conn.getInputStream() : conn.getErrorStream(),
            StandardCharsets.UTF_8
        ));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) sb.append(line).append('\n');
        return sb.toString().trim();
    }

    private void copyResult() {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        clipboard.setPrimaryClip(ClipData.newPlainText("V2RayEZ license admin result", output.getText()));
        toast("Copied");
    }

    private String value(EditText edit) {
        return edit.getText() == null ? "" : edit.getText().toString().trim();
    }

    private int parseInt(String value, int fallback) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private void setOutput(String text) {
        output.setText(text);
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private interface JsonSuccess {
        void run(JSONObject json);
    }
}
