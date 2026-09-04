package com.v2rayez.licenseadmin;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters;
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters;
import org.bouncycastle.crypto.signers.Ed25519Signer;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.Security;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Offline-first V2RayEZ License Manager.
 *
 * This class is intentionally used only by the separate operator/admin Android app. It creates
 * Ed25519-signed V2RayEZ serials without contacting the dashboard, keeps an independent local
 * ledger per license, stores the private Ed25519 seed encrypted by Android Keystore, and exports
 * the ledger only as a passphrase-encrypted file. The end-user VPN app never contains this code.
 */
final class OfflineLicenseManager {
    private static final String PREFS = "v2rayez_offline_license_manager";
    private static final String KEY_ENCRYPTED_SEED = "ed25519_seed_gcm";
    private static final String KEY_LEDGER = "ledger_json";
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String AES_ALIAS = "v2rayez_license_manager_seed_aes_v1";
    private static final String LICENSE_TYP = "V2RayEZ-License";
    private static final String REVOCATION_TYP = "V2RayEZ-Revocation-List";
    private static final String KEY_ID = "license-manager-local";
    private static final byte[] ED25519_SPKI_PREFIX = hex("302a300506032b6570032100");
    private static final SecureRandom RNG = new SecureRandom();

    private final Context context;
    private final SharedPreferences prefs;

    OfflineLicenseManager(Context context) {
        this.context = context.getApplicationContext();
        this.prefs = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        ensureBouncyCastle();
    }

    String issue(
        String ownerLabel,
        String userId,
        String accountId,
        String expiresAt,
        int maxDevices,
        int offlineGraceHours,
        String deviceIdHash,
        String featuresCsv
    ) throws Exception {
        String licenseId = "lic_" + UUID.randomUUID().toString().replace("-", "");
        String issuedAt = Instant.now().toString();
        JSONArray features = featuresFromCsv(featuresCsv);
        JSONObject record = new JSONObject()
            .put("licenseId", licenseId)
            .put("ownerLabel", ownerLabel.trim())
            .put("userId", userId.trim())
            .put("accountId", accountId.trim().isEmpty() ? userId.trim() : accountId.trim())
            .put("issuedAt", issuedAt)
            .put("expiresAt", canonicalInstant(expiresAt))
            .put("maxDevices", Math.max(1, maxDevices))
            .put("offlineGraceHours", Math.max(0, offlineGraceHours))
            .put("deviceIdHash", deviceIdHash.trim())
            .put("features", features)
            .put("revocationEpoch", 0)
            .put("status", "ACTIVE");
        String token = signLicenseRecord(record);
        record.put("licenseKey", token);
        upsert(record);
        return token;
    }

    String renew(String licenseId, String expiresAt) throws Exception {
        JSONObject record = findRequired(licenseId);
        record.put("expiresAt", canonicalInstant(expiresAt));
        record.put("status", "ACTIVE");
        record.put("renewedAt", Instant.now().toString());
        record.put("licenseKey", signLicenseRecord(record));
        upsert(record);
        return record.getString("licenseKey");
    }

    String revoke(String licenseId, String reason) throws Exception {
        JSONObject record = findRequired(licenseId);
        int nextEpoch = record.optInt("revocationEpoch", 0) + 1;
        record.put("revocationEpoch", nextEpoch);
        record.put("status", "REVOKED");
        record.put("revokedAt", Instant.now().toString());
        record.put("revokedReason", reason == null || reason.trim().isEmpty() ? "operator_revoke" : reason.trim());
        record.put("licenseKey", signLicenseRecord(record));
        upsert(record);
        return exportRevocationListToken();
    }

    File exportLedger(String passphrase) throws Exception {
        JSONObject plain = new JSONObject()
            .put("schema", "v2rayez.license.ledger.v1")
            .put("exportedAt", Instant.now().toString())
            .put("publicKeyPem", publicKeyPem())
            .put("licenses", ledger());
        JSONObject encrypted = encryptJson(plain, passphrase);
        File out = new File(exportDir(), "v2rayez-license-ledger.enc");
        writeBytes(out, encrypted.toString(2).getBytes(StandardCharsets.UTF_8));
        return out;
    }

    int importLedger(String passphrase) throws Exception {
        File in = new File(exportDir(), "v2rayez-license-ledger.enc");
        String raw = new String(readBytes(in), StandardCharsets.UTF_8);
        JSONObject plain = decryptJson(new JSONObject(raw), passphrase);
        if (!"v2rayez.license.ledger.v1".equals(plain.optString("schema"))) {
            throw new IllegalArgumentException("Unexpected ledger export schema");
        }
        JSONArray incoming = plain.optJSONArray("licenses");
        if (incoming == null) incoming = new JSONArray();
        Map<String, JSONObject> merged = new LinkedHashMap<>();
        JSONArray current = ledger();
        for (int i = 0; i < current.length(); i++) {
            JSONObject item = current.getJSONObject(i);
            merged.put(item.optString("licenseId"), item);
        }
        for (int i = 0; i < incoming.length(); i++) {
            JSONObject item = incoming.getJSONObject(i);
            String id = item.optString("licenseId");
            verifyImportedRecord(item);
            if (!id.isEmpty()) merged.put(id, item);
        }
        JSONArray out = new JSONArray();
        for (JSONObject item : merged.values()) out.put(item);
        saveLedger(out);
        return incoming.length();
    }

    File exportRevocationListFile() throws Exception {
        File out = new File(exportDir(), "v2rayez-revocations.jwt");
        writeBytes(out, exportRevocationListToken().getBytes(StandardCharsets.UTF_8));
        return out;
    }

    String exportRevocationListToken() throws Exception {
        JSONArray records = ledger();
        List<Object> revocations = new ArrayList<>();
        for (int i = 0; i < records.length(); i++) {
            JSONObject item = records.getJSONObject(i);
            if (!"REVOKED".equals(item.optString("status"))) continue;
            Map<String, Object> revocation = new TreeMap<>();
            revocation.put("licenseId", item.optString("licenseId"));
            revocation.put("revocationEpoch", item.optInt("revocationEpoch", 1));
            revocation.put("revokedAt", item.optString("revokedAt"));
            revocation.put("reason", item.optString("revokedReason", "operator_revoke"));
            revocations.add(revocation);
        }
        Map<String, Object> payload = new TreeMap<>();
        payload.put("schema", "v2rayez.license.revocations.v1");
        payload.put("issuedAt", Instant.now().toString());
        payload.put("revocations", revocations);
        return signCompact(payload, REVOCATION_TYP);
    }

    String publicKeyPem() throws Exception {
        byte[] seed = seed();
        Ed25519PrivateKeyParameters privateKey = new Ed25519PrivateKeyParameters(seed, 0);
        byte[] rawPublic = privateKey.generatePublicKey().getEncoded();
        byte[] spki = new byte[ED25519_SPKI_PREFIX.length + rawPublic.length];
        System.arraycopy(ED25519_SPKI_PREFIX, 0, spki, 0, ED25519_SPKI_PREFIX.length);
        System.arraycopy(rawPublic, 0, spki, ED25519_SPKI_PREFIX.length, rawPublic.length);
        String body = Base64.encodeToString(spki, Base64.NO_WRAP);
        StringBuilder wrapped = new StringBuilder();
        for (int i = 0; i < body.length(); i += 64) {
            wrapped.append(body, i, Math.min(i + 64, body.length())).append('\n');
        }
        return "-----BEGIN PUBLIC KEY-----\n" + wrapped + "-----END PUBLIC KEY-----";
    }

    String ledgerSummary() throws Exception {
        JSONArray records = ledger();
        int active = 0;
        int revoked = 0;
        StringBuilder sb = new StringBuilder();
        sb.append("Offline ledger: ").append(records.length()).append(" license(s)\n");
        for (int i = 0; i < records.length(); i++) {
            JSONObject item = records.getJSONObject(i);
            if ("REVOKED".equals(item.optString("status"))) revoked++; else active++;
            sb.append(item.optString("licenseId"))
                .append(" | ").append(item.optString("status", "ACTIVE"))
                .append(" | owner=").append(item.optString("ownerLabel"))
                .append(" | account=").append(item.optString("accountId"))
                .append(" | expires=").append(item.optString("expiresAt"))
                .append(" | epoch=").append(item.optInt("revocationEpoch", 0))
                .append('\n');
        }
        sb.append("Active: ").append(active).append(" · Revoked: ").append(revoked);
        return sb.toString();
    }

    private String signLicenseRecord(JSONObject record) throws Exception {
        Map<String, Object> metadata = new TreeMap<>();
        metadata.put("issuer", "v2rayez-license-manager-android");
        metadata.put("offlineFirst", true);
        metadata.put("deviceBindable", !record.optString("deviceIdHash").trim().isEmpty());

        Map<String, Object> payload = new TreeMap<>();
        payload.put("schema", "v2rayez.license.v1");
        payload.put("licenseId", record.optString("licenseId"));
        payload.put("ownerLabel", record.optString("ownerLabel"));
        payload.put("userId", record.optString("userId"));
        payload.put("accountId", record.optString("accountId"));
        payload.put("status", record.optString("status", "ACTIVE"));
        payload.put("issuedAt", record.optString("issuedAt"));
        payload.put("expiresAt", record.optString("expiresAt"));
        payload.put("maxDevices", record.optInt("maxDevices", 1));
        payload.put("offlineGraceHours", record.optInt("offlineGraceHours", 72));
        payload.put("revocationEpoch", record.optInt("revocationEpoch", 0));
        String deviceHash = record.optString("deviceIdHash").trim();
        if (!deviceHash.isEmpty()) payload.put("deviceIdHash", deviceHash);
        payload.put("features", listFromJsonArray(record.optJSONArray("features")));
        payload.put("metadata", metadata);
        return signCompact(payload, LICENSE_TYP);
    }

    private String signCompact(Map<String, Object> payload, String typ) throws Exception {
        Map<String, Object> header = new TreeMap<>();
        header.put("alg", "EdDSA");
        header.put("kid", KEY_ID);
        header.put("typ", typ);
        String encodedHeader = base64Url(stableJson(header).getBytes(StandardCharsets.UTF_8));
        String encodedPayload = base64Url(stableJson(payload).getBytes(StandardCharsets.UTF_8));
        byte[] signingInput = (encodedHeader + "." + encodedPayload).getBytes(StandardCharsets.UTF_8);
        Ed25519Signer signer = new Ed25519Signer();
        signer.init(true, new Ed25519PrivateKeyParameters(seed(), 0));
        signer.update(signingInput, 0, signingInput.length);
        return encodedHeader + "." + encodedPayload + "." + base64Url(signer.generateSignature());
    }

    private byte[] seed() throws Exception {
        String stored = prefs.getString(KEY_ENCRYPTED_SEED, "");
        if (!stored.isEmpty()) return decryptSeed(stored);
        byte[] seed = new byte[32];
        RNG.nextBytes(seed);
        // Use commit() (not apply()) for the encrypted seed: the private signing seed is the
        // single source of truth for every serial this operator has ever issued. If it were
        // written asynchronously and the process died first, the app would silently generate a
        // new key and every previously issued license would become unverifiable.
        if (!prefs.edit().putString(KEY_ENCRYPTED_SEED, encryptSeed(seed)).commit()) {
            throw new IllegalStateException("Failed to persist encrypted license-manager seed");
        }
        return seed;
    }

    private String encryptSeed(byte[] seed) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, keystoreKey());
        byte[] iv = cipher.getIV();
        byte[] ciphertext = cipher.doFinal(seed);
        return Base64.encodeToString(iv, Base64.NO_WRAP) + "." + Base64.encodeToString(ciphertext, Base64.NO_WRAP);
    }

    private byte[] decryptSeed(String encoded) throws Exception {
        String[] parts = encoded.split("\\.", 2);
        if (parts.length != 2) throw new IllegalArgumentException("Stored key seed is corrupt");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, keystoreKey(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP));
    }

    private SecretKey keystoreKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        if (!keyStore.containsAlias(AES_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
            generator.init(new KeyGenParameterSpec.Builder(AES_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
            generator.generateKey();
        }
        return (SecretKey) keyStore.getKey(AES_ALIAS, null);
    }

    private JSONObject encryptJson(JSONObject plain, String passphrase) throws Exception {
        requirePassphrase(passphrase);
        byte[] salt = randomBytes(16);
        byte[] iv = randomBytes(12);
        SecretKeySpec key = passphraseKey(passphrase, salt);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, iv));
        byte[] ciphertext = cipher.doFinal(plain.toString().getBytes(StandardCharsets.UTF_8));
        return new JSONObject()
            .put("schema", "v2rayez.license.ledger.encrypted.v1")
            .put("kdf", "PBKDF2WithHmacSHA256")
            .put("iterations", 120_000)
            .put("cipher", "AES-256-GCM")
            .put("salt", base64Url(salt))
            .put("iv", base64Url(iv))
            .put("ciphertext", base64Url(ciphertext));
    }

    private JSONObject decryptJson(JSONObject encrypted, String passphrase) throws Exception {
        requirePassphrase(passphrase);
        if (!"v2rayez.license.ledger.encrypted.v1".equals(encrypted.optString("schema"))) {
            throw new IllegalArgumentException("Unexpected encrypted ledger schema");
        }
        byte[] salt = base64UrlDecode(encrypted.getString("salt"));
        byte[] iv = base64UrlDecode(encrypted.getString("iv"));
        byte[] ciphertext = base64UrlDecode(encrypted.getString("ciphertext"));
        SecretKeySpec key = passphraseKey(passphrase, salt);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
        return new JSONObject(new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8));
    }

    private SecretKeySpec passphraseKey(String passphrase, byte[] salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(passphrase.toCharArray(), salt, 120_000, 256);
        byte[] key = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        return new SecretKeySpec(key, "AES");
    }

    private void requirePassphrase(String passphrase) {
        if (passphrase == null || passphrase.length() < 8) {
            throw new IllegalArgumentException("Ledger passphrase must be at least 8 characters");
        }
    }

    /**
     * Rejects any imported ledger record whose signed serial does not verify against this
     * manager's current Ed25519 public key, and whose signed payload does not match the stored
     * record fields. This keeps the offline admin ledger free of unverifiable license records;
     * a passphrase alone is not an excuse to accept a tampered export.
     */
    private void verifyImportedRecord(JSONObject record) throws Exception {
        if (record == null) throw new IllegalArgumentException("Imported license record is null");
        String token = record.optString("licenseKey", "");
        if (token.isEmpty()) {
            throw new IllegalArgumentException("Imported license record has no signed license key");
        }
        String[] parts = token.split("\\.");
        if (parts.length != 3 || parts[0].isEmpty() || parts[1].isEmpty() || parts[2].isEmpty()) {
            throw new IllegalArgumentException("Imported license key is not a compact token");
        }
        JSONObject header = new JSONObject(new String(base64UrlDecode(parts[0]), StandardCharsets.UTF_8));
        if (!"EdDSA".equals(header.optString("alg"))) {
            throw new IllegalArgumentException("Imported license key uses an unsupported algorithm");
        }
        if (!LICENSE_TYP.equals(header.optString("typ"))) {
            throw new IllegalArgumentException("Imported license key has an unexpected token type");
        }
        byte[] rawPublic = new Ed25519PrivateKeyParameters(seed(), 0).generatePublicKey().getEncoded();
        Ed25519PublicKeyParameters publicKey = new Ed25519PublicKeyParameters(rawPublic, 0);
        Ed25519Signer verifier = new Ed25519Signer();
        verifier.init(false, publicKey);
        byte[] signingInput = (parts[0] + "." + parts[1]).getBytes(StandardCharsets.UTF_8);
        verifier.update(signingInput, 0, signingInput.length);
        if (!verifier.verifySignature(base64UrlDecode(parts[2]))) {
            throw new IllegalArgumentException("Imported license key signature verification failed");
        }
        JSONObject payload = new JSONObject(new String(base64UrlDecode(parts[1]), StandardCharsets.UTF_8));
        if (!"v2rayez.license.v1".equals(payload.optString("schema"))) {
            throw new IllegalArgumentException("Imported license has an unexpected payload schema");
        }
        requireFieldMatch(record, payload, "licenseId");
        requireFieldMatch(record, payload, "status");
        requireFieldMatch(record, payload, "userId");
        requireFieldMatch(record, payload, "accountId");
        requireFieldMatch(record, payload, "expiresAt");
        requireFieldMatch(record, payload, "issuedAt");
        if (record.optInt("revocationEpoch", 0) != payload.optInt("revocationEpoch", 0)) {
            throw new IllegalArgumentException("Imported license revocation epoch does not match its signed payload");
        }
    }

    private static void requireFieldMatch(JSONObject record, JSONObject payload, String field) throws Exception {
        if (!record.optString(field).equals(payload.optString(field))) {
            throw new IllegalArgumentException("Imported license field '" + field + "' does not match its signed payload");
        }
    }

    private JSONObject findRequired(String licenseId) throws Exception {
        String wanted = licenseId == null ? "" : licenseId.trim();
        if (wanted.isEmpty()) throw new IllegalArgumentException("License ID is required");
        JSONArray records = ledger();
        for (int i = 0; i < records.length(); i++) {
            JSONObject item = records.getJSONObject(i);
            if (wanted.equals(item.optString("licenseId"))) return item;
        }
        throw new IllegalArgumentException("License ID not found in offline ledger: " + wanted);
    }

    private void upsert(JSONObject record) throws Exception {
        JSONArray records = ledger();
        JSONArray out = new JSONArray();
        boolean replaced = false;
        for (int i = 0; i < records.length(); i++) {
            JSONObject item = records.getJSONObject(i);
            if (record.optString("licenseId").equals(item.optString("licenseId"))) {
                out.put(record);
                replaced = true;
            } else {
                out.put(item);
            }
        }
        if (!replaced) out.put(record);
        saveLedger(out);
    }

    private JSONArray ledger() throws Exception {
        String raw = prefs.getString(KEY_LEDGER, "[]");
        return new JSONArray(raw == null || raw.trim().isEmpty() ? "[]" : raw);
    }

    private void saveLedger(JSONArray array) {
        prefs.edit().putString(KEY_LEDGER, array.toString()).apply();
    }

    private JSONArray featuresFromCsv(String csv) {
        List<String> values = new ArrayList<>();
        if (csv != null) {
            for (String part : csv.split(",")) {
                String value = part.trim();
                if (!value.isEmpty() && !values.contains(value)) values.add(value);
            }
        }
        Collections.sort(values);
        JSONArray array = new JSONArray();
        for (String value : values) array.put(value);
        return array;
    }

    private List<Object> listFromJsonArray(JSONArray array) throws Exception {
        List<Object> values = new ArrayList<>();
        if (array != null) {
            for (int i = 0; i < array.length(); i++) values.add(array.get(i));
        }
        return values;
    }

    private String canonicalInstant(String value) {
        return Instant.parse(value.trim()).toString();
    }

    private File exportDir() {
        File dir = context.getExternalFilesDir(null);
        if (dir == null) dir = context.getFilesDir();
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }


    private static void writeBytes(File file, byte[] bytes) throws Exception {
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
    }

    private static byte[] readBytes(File file) throws Exception {
        try (FileInputStream in = new FileInputStream(file); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toByteArray();
        }
    }

    private static void ensureBouncyCastle() {
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.addProvider(new BouncyCastleProvider());
        }
    }

    private static byte[] randomBytes(int len) {
        byte[] bytes = new byte[len];
        RNG.nextBytes(bytes);
        return bytes;
    }

    private static String base64Url(byte[] bytes) {
        return Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    private static byte[] base64UrlDecode(String value) {
        return Base64.decode(value, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    private static byte[] hex(String value) {
        byte[] out = new byte[value.length() / 2];
        for (int i = 0; i < out.length; i++) {
            out[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
        }
        return out;
    }

    private static String stableJson(Object value) throws Exception {
        if (value == null || value == JSONObject.NULL) return "null";
        if (value instanceof String) return quote((String) value);
        if (value instanceof Number || value instanceof Boolean) return String.valueOf(value);
        if (value instanceof JSONObject) {
            JSONObject json = (JSONObject) value;
            Map<String, Object> map = new TreeMap<>();
            java.util.Iterator<String> keys = json.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                map.put(key, json.get(key));
            }
            return stableJson(map);
        }
        if (value instanceof Map) {
            @SuppressWarnings("unchecked") Map<String, Object> raw = (Map<String, Object>) value;
            Map<String, Object> sorted = new TreeMap<>(raw);
            StringBuilder sb = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<String, Object> entry : sorted.entrySet()) {
                if (entry.getValue() == null) continue;
                if (!first) sb.append(',');
                first = false;
                sb.append(quote(entry.getKey())).append(':').append(stableJson(entry.getValue()));
            }
            return sb.append('}').toString();
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < array.length(); i++) {
                if (i > 0) sb.append(',');
                sb.append(stableJson(array.get(i)));
            }
            return sb.append(']').toString();
        }
        if (value instanceof Iterable) {
            StringBuilder sb = new StringBuilder("[");
            boolean first = true;
            for (Object item : (Iterable<?>) value) {
                if (!first) sb.append(',');
                first = false;
                sb.append(stableJson(item));
            }
            return sb.append(']').toString();
        }
        return quote(String.valueOf(value));
    }

    private static String quote(String value) {
        StringBuilder sb = new StringBuilder(value.length() + 2).append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        return sb.append('"').toString();
    }
}
