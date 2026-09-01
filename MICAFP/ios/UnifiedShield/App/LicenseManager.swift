import CryptoKit
import Foundation
import Security
#if canImport(UIKit)
import UIKit
#endif

struct LicenseStatus: Codable, Equatable {
    var allowed: Bool
    var result: String
    var reason: String
    var source: String
    var expiresAt: String
    var offlineGraceUntil: String
    var remainingSeconds: Int64
    var redactedSerial: String
    var deviceIdPreview: String

    static func denied(_ reason: String) -> LicenseStatus {
        LicenseStatus(
            allowed: false,
            result: "DENIED",
            reason: reason,
            source: "local",
            expiresAt: "",
            offlineGraceUntil: "",
            remainingSeconds: 0,
            redactedSerial: LicenseManager.shared.redactedSerial(),
            deviceIdPreview: String(LicenseManager.shared.deviceId().prefix(8))
        )
    }
}

final class LicenseManager {
    static let shared = LicenseManager()

    private let defaults = UserDefaults(suiteName: "group.app.v2rayez.ios") ?? .standard
    private let service = "com.v2rayez.universal.license"
    private let serialKey = "v2rayez.license.serial"
    private let graceKey = "v2rayez.license.grace"
    private let deviceKey = "v2rayez.license.device"
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private let iso = ISO8601DateFormatter()

    private init() {}

    func activate(serial: String) async -> LicenseStatus {
        let value = serial.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return persist(.denied("empty_license")) }
        keychainSet(value, account: serialKey)
        let status = await validate(forceServer: true)
        if !status.allowed && ["bad_signature", "license_not_configured"].contains(status.reason) {
            keychainDelete(account: serialKey)
        }
        return status
    }

    func validate(forceServer: Bool = false) async -> LicenseStatus {
        guard let serial = keychainGet(account: serialKey), !serial.isEmpty else {
            return persist(.denied("license_missing"))
        }
        let local = verifyLicense(serial: serial)
        guard local.allowed else { return persist(local) }

        let endpoint = validationEndpoint()
        if endpoint.isEmpty {
            let offline = offlineDecision(serial: serial, local: local)
            return persist(offline)
        }

        do {
            let online = try await validateOnline(endpoint: endpoint, serial: serial)
            return persist(online)
        } catch {
            if !forceServer && defaults.bool(forKey: "licenseAllowOfflineGrace") {
                var offline = offlineDecision(serial: serial, local: local)
                if offline.allowed { offline.reason = "server_unreachable_using_grace" }
                return persist(offline)
            }
            return persist(LicenseStatus(
                allowed: false,
                result: "DENIED",
                reason: "server_unreachable",
                source: "server",
                expiresAt: local.expiresAt,
                offlineGraceUntil: "",
                remainingSeconds: 0,
                redactedSerial: redact(serial),
                deviceIdPreview: String(deviceId().prefix(8))
            ))
        }
    }

    func enforce() async -> LicenseStatus {
        await validate(forceServer: false)
    }

    func clear() -> LicenseStatus {
        keychainDelete(account: serialKey)
        keychainDelete(account: graceKey)
        return persist(.denied("serial_cleared"))
    }

    func redactedSerial() -> String {
        redact(keychainGet(account: serialKey) ?? "")
    }

    func deviceId() -> String {
        if let existing = keychainGet(account: deviceKey), !existing.isEmpty { return existing }
        let created = UUID().uuidString.lowercased()
        keychainSet(created, account: deviceKey)
        return created
    }

    private func verifyLicense(serial: String) -> LicenseStatus {
        do {
            let payload = try verifyCompactToken(serial, expectedType: "V2RayEZ-License")
            guard (payload["schema"] as? String) == "v2rayez.license.v1" else { return .denied("unexpected_license_schema") }
            guard (payload["status"] as? String ?? "ACTIVE") == "ACTIVE" else { return .denied("license_not_active") }
            let account = (payload["accountId"] as? String) ?? ""
            let configured = defaults.string(forKey: "licenseAccountId")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !configured.isEmpty && configured != account { return .denied("account_mismatch") }
            if let notBefore = payload["notBefore"] as? String,
               let date = iso.date(from: notBefore), date > Date() {
                return .denied("license_not_yet_valid")
            }
            guard let expiresAt = payload["expiresAt"] as? String,
                  let expiry = iso.date(from: expiresAt) else { return .denied("invalid_expiry") }
            let remaining = Int64(expiry.timeIntervalSinceNow)
            guard remaining > 0 else { return status(false, "license_expired", "signed_serial", expiresAt, "", 0, serial) }
            return status(true, "signed_serial_valid", "signed_serial", expiresAt, "", remaining, serial)
        } catch LicenseError.notConfigured {
            return .denied("license_not_configured")
        } catch {
            return .denied("bad_signature")
        }
    }

    private func offlineDecision(serial: String, local: LicenseStatus) -> LicenseStatus {
        guard defaults.bool(forKey: "licenseAllowOfflineGrace") else {
            return status(false, "online_validation_or_grace_token_required", local.source, local.expiresAt, "", 0, serial)
        }
        guard let grace = keychainGet(account: graceKey), !grace.isEmpty else {
            return status(false, "online_validation_or_grace_token_required", local.source, local.expiresAt, "", 0, serial)
        }
        do {
            let payload = try verifyCompactToken(grace, expectedType: "V2RayEZ-License-Grace")
            guard (payload["schema"] as? String) == "v2rayez.license.grace.v1" else { return .denied("offline_grace_schema") }
            guard (payload["status"] as? String ?? "ACTIVE") == "ACTIVE" else { return .denied("offline_grace_inactive") }
            let account = defaults.string(forKey: "licenseAccountId")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !account.isEmpty && (payload["accountId"] as? String) != account { return .denied("offline_grace_account_mismatch") }
            if (payload["deviceIdHash"] as? String) != hashDeviceId(deviceId()) { return .denied("offline_grace_device_mismatch") }
            guard let graceUntil = payload["graceUntil"] as? String,
                  let graceDate = iso.date(from: graceUntil) else { return .denied("offline_grace_invalid_expiry") }
            guard graceDate > Date() else { return status(false, "offline_grace_expired", "offline_grace", local.expiresAt, graceUntil, 0, serial) }
            let remaining = Int64(min(graceDate.timeIntervalSinceNow, TimeInterval(local.remainingSeconds)))
            return status(true, "offline_grace_valid", "offline_grace", local.expiresAt, graceUntil, remaining, serial)
        } catch LicenseError.notConfigured {
            return .denied("license_not_configured")
        } catch {
            return status(false, "offline_grace_invalid", "offline_grace", local.expiresAt, "", 0, serial)
        }
    }

    private func validateOnline(endpoint: String, serial: String) async throws -> LicenseStatus {
        guard let url = URL(string: endpoint) else { throw LicenseError.invalidUrl }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue("application/json", forHTTPHeaderField: "Accept")
        let body: [String: Any] = [
            "licenseKey": serial,
            "deviceId": deviceId(),
            "accountId": defaults.string(forKey: "licenseAccountId") ?? "",
            "platform": "ios",
            "appVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0",
            "deviceLabel": defaults.string(forKey: "licenseDeviceLabel") ?? UIDeviceName.current
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw LicenseError.invalidResponse }
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard (200..<300).contains(http.statusCode), (json["success"] as? Bool) == true else {
            throw LicenseError.serverDenied((json["reason"] as? String) ?? "license_denied")
        }
        if let grace = json["graceToken"] as? String, !grace.isEmpty {
            keychainSet(grace, account: graceKey)
        }
        let expiresAt = (json["expiresAt"] as? String) ?? ""
        let graceUntil = (json["offlineGraceUntil"] as? String) ?? ""
        let remaining = (json["remainingSeconds"] as? NSNumber)?.int64Value ?? 0
        return status(true, (json["reason"] as? String) ?? "valid", "server", expiresAt, graceUntil, remaining, serial)
    }

    private func verifyCompactToken(_ token: String, expectedType: String) throws -> [String: Any] {
        let parts = token.split(separator: ".").map(String.init)
        guard parts.count == 3, parts.allSatisfy({ !$0.isEmpty }) else { throw LicenseError.invalidFormat }
        let headerData = try base64UrlDecode(parts[0])
        let payloadData = try base64UrlDecode(parts[1])
        let signature = try base64UrlDecode(parts[2])
        guard let header = try JSONSerialization.jsonObject(with: headerData) as? [String: Any],
              let payload = try JSONSerialization.jsonObject(with: payloadData) as? [String: Any] else {
            throw LicenseError.invalidJson
        }
        guard (header["alg"] as? String) == "EdDSA" else { throw LicenseError.badSignature }
        guard (header["typ"] as? String) == expectedType else { throw LicenseError.badSignature }
        let key = try publicKeyData()
        let publicKey = try Curve25519.Signing.PublicKey(rawRepresentation: key)
        let signingInput = Data("\(parts[0]).\(parts[1])".utf8)
        guard publicKey.isValidSignature(signature, for: signingInput) else { throw LicenseError.badSignature }
        return payload
    }

    private func publicKeyData() throws -> Data {
        let raw = defaults.string(forKey: "licensePublicKeyPem") ?? ProcessInfo.processInfo.environment["V2RAYEZ_LICENSE_PUBLIC_KEY_PEM"] ?? ""
        guard !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw LicenseError.notConfigured }
        let body = raw
            .replacingOccurrences(of: "\\n", with: "\n")
            .components(separatedBy: .newlines)
            .filter { !$0.hasPrefix("-----") }
            .joined()
            .replacingOccurrences(of: " ", with: "")
        guard let der = Data(base64Encoded: body) else { throw LicenseError.badSignature }
        if der.count == 32 { return der }
        guard der.count > 32 else { throw LicenseError.badSignature }
        return Data(der.suffix(32))
    }

    private func validationEndpoint() -> String {
        let raw = defaults.string(forKey: "licenseValidationUrl")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !raw.isEmpty else { return "" }
        let base = raw.hasSuffix("/") ? String(raw.dropLast()) : raw
        if base.hasSuffix("/api/licenses/validate") { return base }
        return base + "/api/licenses/validate"
    }

    private func hashDeviceId(_ value: String) -> String {
        let salt = ProcessInfo.processInfo.environment["V2RAYEZ_LICENSE_DEVICE_HASH_SALT"] ?? "v2rayez-client-device-binding-v1"
        let data = Data("v2rayez-device\0\(salt)\0\(value.trimmingCharacters(in: .whitespacesAndNewlines))".utf8)
        return Data(SHA256.hash(data: data)).base64UrlNoPadding()
    }

    @discardableResult
    private func persist(_ status: LicenseStatus) -> LicenseStatus {
        defaults.set(status.result, forKey: "licenseLastResult")
        defaults.set(status.reason, forKey: "licenseLastReason")
        defaults.set(status.expiresAt, forKey: "licenseExpiresAt")
        defaults.set(status.offlineGraceUntil, forKey: "licenseOfflineGraceUntil")
        return status
    }

    private func status(_ allowed: Bool, _ reason: String, _ source: String, _ expiresAt: String, _ graceUntil: String, _ remaining: Int64, _ serial: String) -> LicenseStatus {
        LicenseStatus(
            allowed: allowed,
            result: allowed ? "ALLOWED" : "DENIED",
            reason: reason,
            source: source,
            expiresAt: expiresAt,
            offlineGraceUntil: graceUntil,
            remainingSeconds: max(0, remaining),
            redactedSerial: redact(serial),
            deviceIdPreview: String(deviceId().prefix(8))
        )
    }

    private func redact(_ value: String) -> String {
        guard !value.isEmpty else { return "" }
        if value.count <= 16 { return String(value.prefix(4)) + "…" + String(value.suffix(4)) }
        return String(value.prefix(10)) + "…" + String(value.suffix(8))
    }

    private func base64UrlDecode(_ value: String) throws -> Data {
        var base64 = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64 += "=" }
        guard let data = Data(base64Encoded: base64) else { throw LicenseError.invalidBase64 }
        return data
    }

    private func keychainSet(_ value: String, account: String) {
        keychainDelete(account: account)
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String: Data(value.utf8)
        ]
        applyKeychainAccessGroup(&query)
        SecItemAdd(query as CFDictionary, nil)
    }

    private func keychainGet(account: String) -> String? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        applyKeychainAccessGroup(&query)
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func keychainDelete(account: String) {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        applyKeychainAccessGroup(&query)
        SecItemDelete(query as CFDictionary)
    }

    private func applyKeychainAccessGroup(_ query: inout [String: Any]) {
        guard let group = Bundle.main.object(forInfoDictionaryKey: "V2RayEZKeychainAccessGroup") as? String,
              !group.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !group.contains("$(") else { return }
        query[kSecAttrAccessGroup as String] = group
    }
}

private enum LicenseError: Error {
    case invalidFormat
    case invalidBase64
    case invalidJson
    case badSignature
    case notConfigured
    case invalidUrl
    case invalidResponse
    case serverDenied(String)
}

private enum UIDeviceName {
    static var current: String {
        #if canImport(UIKit)
        return UIDevice.current.name
        #else
        return "Apple device"
        #endif
    }
}

private extension Data {
    func base64UrlNoPadding() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
