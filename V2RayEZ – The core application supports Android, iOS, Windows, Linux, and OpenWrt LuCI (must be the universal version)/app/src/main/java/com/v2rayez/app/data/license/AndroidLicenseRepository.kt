package com.v2rayez.app.data.license

import android.content.Context
import android.os.Build
import com.v2rayez.app.BuildConfig
import com.v2rayez.app.data.cert.BouncyCastleInstaller
import com.v2rayez.app.data.security.SecureStringStore
import com.v2rayez.app.domain.model.LicenseConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.PublicKey
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.time.Instant
import java.util.Base64
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Source that produced the latest license decision. */
enum class LicenseDecisionSource { SERVER, SIGNED_SERIAL, OFFLINE_GRACE, LOCAL_ERROR }

/** Fail-closed runtime license decision used by UI and every VPN start path. */
data class LicenseValidationResult(
    val allowed: Boolean,
    val result: String,
    val reason: String,
    val source: LicenseDecisionSource = LicenseDecisionSource.LOCAL_ERROR,
    val expiresAt: String = "",
    val remainingSeconds: Long = 0L,
    val offlineGraceUntil: String = "",
    val serverTime: String = "",
    val checkedAt: Long = System.currentTimeMillis()
) {
    val expired: Boolean get() = reason == "license_expired" || reason == "offline_grace_expired"
}

/**
 * Android client for V2RayEZ signed serials. It verifies Ed25519 compact tokens locally, binds
 * them to the configured account, validates/revokes online when a dashboard endpoint is present,
 * and uses signed grace tokens only until their hard expiry.
 */
@Singleton
class AndroidLicenseRepository @Inject constructor(
    @ApplicationContext context: Context,
    private val httpClient: OkHttpClient,
    private val secureStore: SecureStringStore
) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    suspend fun activate(licenseKey: String, config: LicenseConfig): LicenseValidationResult =
        withContext(Dispatchers.IO) {
            val key = licenseKey.trim()
            if (key.isBlank()) return@withContext deny("empty_license", "Serial number is empty")
            clearGrace()
            secureStore.put(KEY_LICENSE, key)
            val result = validate(config, forceServer = validationUrl(config).isNotBlank())
            if (!result.allowed) secureStore.remove(KEY_LICENSE)
            result
        }

    suspend fun validate(config: LicenseConfig, forceServer: Boolean = false): LicenseValidationResult =
        withContext(Dispatchers.IO) {
            val licenseKey = secureStore.get(KEY_LICENSE)
                ?: return@withContext deny("license_missing", "No serial number has been activated")
            val local = verifyLicenseToken(licenseKey, config)
            if (!local.allowed) return@withContext local

            val endpoint = validationUrl(config)
            if (endpoint.isBlank()) return@withContext local

            val serverResult = runCatching { validateWithServer(endpoint, licenseKey, config) }.getOrElse {
                val grace = verifyStoredGrace(config, local.expiresAt)
                if (grace.allowed && config.allowOfflineGrace && !forceServer) {
                    grace.copy(reason = "server_unreachable_using_grace")
                } else if (!forceServer && !config.allowOfflineGrace) {
                    deny("server_unreachable", it.message ?: "License server unreachable")
                } else {
                    deny("server_unreachable", it.message ?: "License server unreachable")
                }
            }
            serverResult
        }

    suspend fun enforce(config: LicenseConfig): LicenseValidationResult = validate(config, forceServer = false)

    fun clear() {
        secureStore.remove(KEY_LICENSE)
        clearGrace()
        prefs.edit().remove(KEY_LAST_SERVER_TIME).apply()
    }

    fun clearGrace() {
        secureStore.remove(KEY_GRACE)
    }

    fun hasActivatedLicense(): Boolean = secureStore.contains(KEY_LICENSE)

    fun redactedSerial(): String = redact(secureStore.get(KEY_LICENSE).orEmpty())

    fun deviceIdForDisplay(): String = deviceId().take(8)

    fun deviceHashForDisplay(config: LicenseConfig): String = hashDeviceId(deviceId(), config)

    private fun lastServerTime(): String? = prefs.getString(KEY_LAST_SERVER_TIME, null)?.takeIf { it.isNotBlank() }

    private fun validateWithServer(endpoint: String, licenseKey: String, config: LicenseConfig): LicenseValidationResult {
        val payload = JSONObject()
            .put("licenseKey", licenseKey)
            .put("deviceId", deviceId())
            .put("accountId", config.accountId.trim())
            .put("platform", "android")
            .put("appVersion", BuildConfig.VERSION_NAME)
            .put("deviceLabel", config.deviceLabel.ifBlank { defaultDeviceLabel() })
        lastServerTime()?.let { payload.put("clientLastServerTime", it) }
        val request = Request.Builder()
            .url(endpoint)
            .post(payload.toString().toRequestBody(JSON_MEDIA))
            .header("Accept", "application/json")
            .header("User-Agent", "V2RayEZ-Android/${BuildConfig.VERSION_NAME}")
            .build()
        httpClient.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            val json = runCatching { JSONObject(body) }.getOrElse { JSONObject() }
            if (!response.isSuccessful || !json.optBoolean("success", false)) {
                return deny(
                    json.optString("reason", "license_denied"),
                    json.optString("error", "License server denied this serial"),
                    expiresAt = json.optString("expiresAt", "")
                )
            }
            val serverTime = json.optString("serverTime", "")
            serverTime.takeIf { it.isNotBlank() }?.let { trustedServerTime ->
                prefs.edit().putString(KEY_LAST_SERVER_TIME, trustedServerTime).apply()
            }
            val grace = json.optString("graceToken", "")
            if (grace.isNotBlank()) {
                val graceDecision = verifyGraceToken(grace, config, json.optString("expiresAt", ""))
                if (graceDecision.allowed) secureStore.put(KEY_GRACE, grace)
            }
            return allow(
                reason = json.optString("reason", "valid"),
                source = LicenseDecisionSource.SERVER,
                expiresAt = json.optString("expiresAt", ""),
                remainingSeconds = json.optLong("remainingSeconds", 0L),
                offlineGraceUntil = json.optString("offlineGraceUntil", ""),
                serverTime = serverTime
            )
        }
    }

    private fun verifyLicenseToken(licenseKey: String, config: LicenseConfig): LicenseValidationResult {
        val parsed = runCatching { verifyCompactToken(licenseKey, LICENSE_TOKEN_TYPE, config) }.getOrElse {
            val message = it.message ?: "Serial signature verification failed"
            val reason = if (message.contains("public key", ignoreCase = true)) "license_not_configured" else "bad_signature"
            return deny(reason, message)
        }
        val payload = parsed.payload
        if (payload.optString("schema") != "v2rayez.license.v1") {
            return deny("unexpected_license_schema", "Unexpected license schema")
        }
        if (payload.optString("status", "ACTIVE") != "ACTIVE") {
            return deny("license_not_active", "License is not active")
        }
        val accountId = payload.optString("accountId", "")
        if (config.accountId.isNotBlank() && accountId != config.accountId.trim()) {
            return deny("account_mismatch", "Serial belongs to another account")
        }
        val deviceIdHash = payload.optString("deviceIdHash", "").trim()
        if (deviceIdHash.isNotBlank() && deviceIdHash != hashDeviceId(deviceId(), config)) {
            return deny("device_mismatch", "Serial belongs to another device")
        }
        revocationDecision(
            licenseId = payload.optString("licenseId", ""),
            licenseEpoch = payload.optInt("revocationEpoch", 0),
            config = config
        )?.let { return it }
        val notBefore = payload.optString("notBefore", "")
        if (notBefore.isNotBlank() && parseInstant(notBefore)?.isAfter(Instant.now()) == true) {
            return deny("license_not_yet_valid", "License is not valid yet")
        }
        val expiresAt = payload.optString("expiresAt", "")
        val expiry = parseInstant(expiresAt) ?: return deny("invalid_expiry", "License expiry is invalid")
        val remaining = expiry.epochSecond - Instant.now().epochSecond
        if (remaining <= 0L) {
            return deny("license_expired", "License has expired", expiresAt = expiresAt)
        }
        return allow(
            reason = "signed_serial_valid",
            source = LicenseDecisionSource.SIGNED_SERIAL,
            expiresAt = expiresAt,
            remainingSeconds = remaining
        )
    }

    private fun revocationDecision(
        licenseId: String,
        licenseEpoch: Int,
        config: LicenseConfig
    ): LicenseValidationResult? {
        val token = config.revocationListToken.trim()
        if (token.isBlank()) return null
        val parsed = runCatching { verifyCompactToken(token, REVOCATION_TOKEN_TYPE, config) }.getOrElse {
            return deny("revocation_list_invalid", it.message ?: "Signed revocation list is invalid")
        }
        val payload = parsed.payload
        if (payload.optString("schema") != "v2rayez.license.revocations.v1") {
            return deny("revocation_list_schema", "Unexpected revocation-list schema")
        }
        val revocations = payload.optJSONArray("revocations") ?: return null
        for (i in 0 until revocations.length()) {
            val item = revocations.optJSONObject(i) ?: continue
            if (item.optString("licenseId") == licenseId && item.optInt("revocationEpoch", 1) >= licenseEpoch) {
                return deny("license_revoked", "Serial is revoked by a signed revocation list")
            }
        }
        return null
    }

    private fun verifyStoredGrace(config: LicenseConfig, licenseExpiresAt: String): LicenseValidationResult {
        val token = secureStore.get(KEY_GRACE) ?: return deny("offline_grace_missing", "No offline grace token is stored")
        return verifyGraceToken(token, config, licenseExpiresAt)
    }

    private fun verifyGraceToken(token: String, config: LicenseConfig, licenseExpiresAt: String): LicenseValidationResult {
        val parsed = runCatching { verifyCompactToken(token, GRACE_TOKEN_TYPE, config) }.getOrElse {
            val message = it.message ?: "Offline grace token is invalid"
            val reason = if (message.contains("public key", ignoreCase = true)) "license_not_configured" else "offline_grace_invalid"
            return deny(reason, message)
        }
        val payload = parsed.payload
        if (payload.optString("schema") != "v2rayez.license.grace.v1") {
            return deny("offline_grace_schema", "Unexpected offline grace schema")
        }
        if (payload.optString("status", "ACTIVE") != "ACTIVE") {
            return deny("offline_grace_inactive", "Offline grace token is not active")
        }
        if (config.accountId.isNotBlank() && payload.optString("accountId", "") != config.accountId.trim()) {
            return deny("offline_grace_account_mismatch", "Offline grace token belongs to another account")
        }
        if (payload.optString("deviceIdHash", "") != hashDeviceId(deviceId(), config)) {
            return deny("offline_grace_device_mismatch", "Offline grace token belongs to another device")
        }
        val graceServerTime = parseInstant(payload.optString("serverTime", ""))
        val lastSeenServerTime = lastServerTime()?.let { parseInstant(it) }
        if (graceServerTime != null && lastSeenServerTime != null && graceServerTime.plusSeconds(300).isBefore(lastSeenServerTime)) {
            return deny("server_time_rollback_detected", "Offline grace token is older than the last trusted server validation")
        }
        val graceUntil = payload.optString("graceUntil", "")
        val graceExpiry = parseInstant(graceUntil) ?: return deny("offline_grace_invalid_expiry", "Offline grace expiry is invalid")
        val now = Instant.now()
        if (!graceExpiry.isAfter(now)) {
            return deny("offline_grace_expired", "Offline grace token has expired", expiresAt = licenseExpiresAt, offlineGraceUntil = graceUntil)
        }
        val licenseExpiry = parseInstant(payload.optString("expiresAt", licenseExpiresAt))
        if (licenseExpiry != null && !licenseExpiry.isAfter(now)) {
            return deny("license_expired", "License has expired", expiresAt = licenseExpiry.toString(), offlineGraceUntil = graceUntil)
        }
        return allow(
            reason = "offline_grace_valid",
            source = LicenseDecisionSource.OFFLINE_GRACE,
            expiresAt = payload.optString("expiresAt", licenseExpiresAt),
            remainingSeconds = graceExpiry.epochSecond - now.epochSecond,
            offlineGraceUntil = graceUntil,
            serverTime = payload.optString("serverTime", "")
        )
    }

    private data class ParsedToken(val header: JSONObject, val payload: JSONObject)

    private fun verifyCompactToken(token: String, expectedType: String, config: LicenseConfig): ParsedToken {
        val parts = token.split('.')
        require(parts.size == 3 && parts.none { it.isBlank() }) { "Invalid compact token format" }
        val header = JSONObject(String(base64UrlDecode(parts[0]), Charsets.UTF_8))
        val payload = JSONObject(String(base64UrlDecode(parts[1]), Charsets.UTF_8))
        require(header.optString("alg") == "EdDSA") { "Unsupported license algorithm" }
        require(header.optString("typ") == expectedType) { "Unexpected token type" }
        val pem = publicKeyFor(header.optString("kid", "default"), config)
            ?: throw IllegalStateException("License public key is not configured")
        BouncyCastleInstaller.ensureInstalled()
        val signature = Signature.getInstance("Ed25519", BC_PROVIDER)
        signature.initVerify(publicKeyFromPem(pem))
        signature.update("${parts[0]}.${parts[1]}".toByteArray(Charsets.UTF_8))
        require(signature.verify(base64UrlDecode(parts[2]))) { "Token signature verification failed" }
        return ParsedToken(header, payload)
    }

    private fun publicKeyFromPem(rawPem: String): PublicKey {
        BouncyCastleInstaller.ensureInstalled()
        val pem = rawPem.replace("\\n", "\n")
            .replace("-----BEGIN PUBLIC KEY-----", "")
            .replace("-----END PUBLIC KEY-----", "")
            .replace(Regex("\\s"), "")
        val bytes = Base64.getDecoder().decode(pem)
        return KeyFactory.getInstance("Ed25519", BC_PROVIDER).generatePublic(X509EncodedKeySpec(bytes))
    }

    private fun publicKeyFor(kid: String, config: LicenseConfig): String? {
        val keys = linkedMapOf<String, String>()
        mergePublicKeys(BuildConfig.LICENSE_ED25519_PUBLIC_KEYS_JSON, keys)
        val buildPem = BuildConfig.LICENSE_ED25519_PUBLIC_KEY_PEM.trim()
        if (buildPem.isNotBlank()) keys.putIfAbsent("default", buildPem)

        // No-code runtime configuration intentionally overlays build defaults so an enterprise
        // dashboard can rotate license keys without shipping a new APK.
        mergePublicKeys(config.publicKeysJson, keys)
        val configuredPem = config.publicKeyPem.trim()
        if (configuredPem.isNotBlank()) keys["default"] = configuredPem

        return keys[kid] ?: keys["default"] ?: keys.values.firstOrNull()
    }

    private fun mergePublicKeys(rawJson: String, keys: MutableMap<String, String>) {
        val keysJson = rawJson.trim()
        if (keysJson.isBlank()) return
        runCatching {
            val json = JSONObject(keysJson)
            val names = json.keys()
            while (names.hasNext()) {
                val name = names.next()
                val pem = json.optString(name).trim()
                if (pem.isNotBlank()) keys[name] = pem
            }
        }
    }

    private fun validationUrl(config: LicenseConfig): String {
        val base = config.validationUrl.ifBlank { BuildConfig.LICENSE_VALIDATION_URL }.trim().trimEnd('/')
        if (base.isBlank()) return ""
        return if (base.endsWith("/api/licenses/validate")) base else "$base/api/licenses/validate"
    }

    private fun deviceId(): String {
        prefs.getString(KEY_DEVICE_ID, null)?.let { return it }
        val generated = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_DEVICE_ID, generated).apply()
        return generated
    }

    private fun hashDeviceId(value: String, config: LicenseConfig): String {
        val salt = config.deviceHashSalt.ifBlank { BuildConfig.LICENSE_DEVICE_HASH_SALT }
            .ifBlank { "v2rayez-client-device-binding-v1" }
        val input = buildString {
            append("v2rayez-device")
            append(Char(0))
            append(salt)
            append(Char(0))
            append(value.trim())
        }.toByteArray(Charsets.UTF_8)
        return base64UrlEncode(MessageDigest.getInstance("SHA-256").digest(input))
    }

    private fun defaultDeviceLabel(): String = listOfNotNull(Build.MANUFACTURER, Build.MODEL)
        .joinToString(" ")
        .ifBlank { "Android device" }

    private fun parseInstant(value: String): Instant? = runCatching { Instant.parse(value) }.getOrNull()

    private fun allow(
        reason: String,
        source: LicenseDecisionSource,
        expiresAt: String,
        remainingSeconds: Long = 0L,
        offlineGraceUntil: String = "",
        serverTime: String = ""
    ): LicenseValidationResult = LicenseValidationResult(
        allowed = true,
        result = "ALLOWED",
        reason = reason,
        source = source,
        expiresAt = expiresAt,
        remainingSeconds = remainingSeconds.coerceAtLeast(0L),
        offlineGraceUntil = offlineGraceUntil,
        serverTime = serverTime
    )

    private fun deny(
        reason: String,
        message: String,
        expiresAt: String = "",
        offlineGraceUntil: String = ""
    ): LicenseValidationResult = LicenseValidationResult(
        allowed = false,
        result = "DENIED",
        reason = reason.ifBlank { message.ifBlank { "license_denied" } },
        source = LicenseDecisionSource.LOCAL_ERROR,
        expiresAt = expiresAt,
        offlineGraceUntil = offlineGraceUntil
    )

    private fun redact(value: String): String {
        if (value.isBlank()) return ""
        if (value.length <= 16) return "${value.take(4)}…${value.takeLast(4)}"
        return "${value.take(10)}…${value.takeLast(8)}"
    }

    private fun base64UrlDecode(value: String): ByteArray =
        Base64.getUrlDecoder().decode(value + "=".repeat((4 - value.length % 4) % 4))

    private fun base64UrlEncode(bytes: ByteArray): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)

    companion object {
        private const val PREFS_NAME = "v2rayez_license"
        private const val KEY_LICENSE = "license.serial"
        private const val KEY_GRACE = "license.grace"
        private const val KEY_DEVICE_ID = "license.device_id"
        private const val KEY_LAST_SERVER_TIME = "license.last_server_time"
        private const val LICENSE_TOKEN_TYPE = "V2RayEZ-License"
        private const val GRACE_TOKEN_TYPE = "V2RayEZ-License-Grace"
        private const val REVOCATION_TOKEN_TYPE = "V2RayEZ-Revocation-List"
        private const val BC_PROVIDER = "BC"
        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }
}
