import CryptoKit
import Foundation
import Security

struct ExtensionLicenseStatus {
    let allowed: Bool
    let reason: String
    let remainingSeconds: Int64
}

final class ExtensionLicenseGate {
    static let shared = ExtensionLicenseGate()

    private let defaults = UserDefaults(suiteName: "group.app.v2rayez.ios") ?? .standard
    private let service = "com.v2rayez.universal.license"
    private let serialKey = "v2rayez.license.serial"
    private let graceKey = "v2rayez.license.grace"
    private let deviceKey = "v2rayez.license.device"
    private let iso = ISO8601DateFormatter()

    private init() {}

    func enforce() async -> ExtensionLicenseStatus {
        guard let serial = keychainGet(account: serialKey), !serial.isEmpty else {
            return deny("license_missing")
        }
        do {
            let payload = try verifyCompactToken(serial, expectedType: "V2RayEZ-License")
            guard (payload["status"] as? String ?? "ACTIVE") == "ACTIVE" else { return deny("license_not_active") }
            let configuredAccount = defaults.string(forKey: "licenseAccountId")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !configuredAccount.isEmpty && (payload["accountId"] as? String) != configuredAccount {
                return deny("account_mismatch")
            }
            guard let expiresAt = payload["expiresAt"] as? String,
                  let expiry = iso.date(from: expiresAt) else { return deny("invalid_expiry") }
            let remaining = Int64(expiry.timeIntervalSinceNow)
            guard remaining > 0 else { return deny("license_expired") }

            if let online = await onlineValidate(serial: serial) {
                return online
            }
            if let grace = offlineGrace(localRemaining: remaining) {
                return grace
            }
            let validationUrl = defaults.string(forKey: "licenseValidationUrl")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if validationUrl.isEmpty {
                return ExtensionLicenseStatus(allowed: true, reason: "signed_serial_valid", remainingSeconds: remaining)
            }
            return deny("server_unreachable")
        } catch LicenseGateError.notConfigured {
            return deny("license_not_configured")
        } catch {
            return deny("bad_signature")
        }
    }

    private func onlineValidate(serial: String) async -> ExtensionLicenseStatus? {
        let endpoint = validationEndpoint()
        guard !endpoint.isEmpty, let url = URL(string: endpoint) else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue("application/json", forHTTPHeaderField: "Accept")
        var body: [String: Any] = [
            "licenseKey": serial,
            "deviceId": deviceId(),
            "accountId": defaults.string(forKey: "licenseAccountId") ?? "",
            "platform": "ios",
            "deviceLabel": defaults.string(forKey: "licenseDeviceLabel") ?? "iOS device"
        ]
        if let lastServerTime = defaults.string(forKey: "licenseLastServerTime"), !lastServerTime.isEmpty {
            body["clientLastServerTime"] = lastServerTime
        }
        guard let bodyData = try? JSONSerialization.data(withJSONObject: body) else { return nil }
        request.httpBody = bodyData
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse,
              (200..<300).contains(http.statusCode),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              (json["success"] as? Bool) == true else { return nil }
        if let serverTime = json["serverTime"] as? String, !serverTime.isEmpty {
            defaults.set(serverTime, forKey: "licenseLastServerTime")
        }
        if let grace = json["graceToken"] as? String, !grace.isEmpty {
            keychainSet(grace, account: graceKey)
        }
        let remaining = (json["remainingSeconds"] as? NSNumber)?.int64Value ?? 0
        return ExtensionLicenseStatus(allowed: true, reason: (json["reason"] as? String) ?? "valid", remainingSeconds: remaining)
    }

    private func offlineGrace(localRemaining: Int64) -> ExtensionLicenseStatus? {
        guard defaults.bool(forKey: "licenseAllowOfflineGrace"),
              let token = keychainGet(account: graceKey), !token.isEmpty else { return nil }
        guard let payload = try? verifyCompactToken(token, expectedType: "V2RayEZ-License-Grace") else { return nil }
        guard (payload["status"] as? String ?? "ACTIVE") == "ACTIVE" else { return nil }
        guard (payload["deviceIdHash"] as? String) == hashDeviceId(deviceId()) else { return nil }
        if let graceServerTime = payload["serverTime"] as? String,
           let graceServerDate = iso.date(from: graceServerTime),
           let lastServerTime = defaults.string(forKey: "licenseLastServerTime"),
           let lastServerDate = iso.date(from: lastServerTime),
           graceServerDate.addingTimeInterval(300) < lastServerDate {
            return nil
        }
        guard let graceUntil = payload["graceUntil"] as? String,
              let graceDate = iso.date(from: graceUntil), graceDate > Date() else { return nil }
        return ExtensionLicenseStatus(
            allowed: true,
            reason: "offline_grace_valid",
            remainingSeconds: min(Int64(graceDate.timeIntervalSinceNow), localRemaining)
        )
    }

    private func verifyCompactToken(_ token: String, expectedType: String) throws -> [String: Any] {
        let parts = token.split(separator: ".").map(String.init)
        guard parts.count == 3, parts.allSatisfy({ !$0.isEmpty }) else { throw LicenseGateError.invalidFormat }
        let headerData = try base64UrlDecode(parts[0])
        let payloadData = try base64UrlDecode(parts[1])
        let signature = try base64UrlDecode(parts[2])
        guard let header = try JSONSerialization.jsonObject(with: headerData) as? [String: Any],
              let payload = try JSONSerialization.jsonObject(with: payloadData) as? [String: Any] else {
            throw LicenseGateError.invalidJson
        }
        guard (header["alg"] as? String) == "EdDSA", (header["typ"] as? String) == expectedType else {
            throw LicenseGateError.badSignature
        }
        let key = try publicKeyData()
        let publicKey = try Curve25519.Signing.PublicKey(rawRepresentation: key)
        let signingInput = Data("\(parts[0]).\(parts[1])".utf8)
        guard publicKey.isValidSignature(signature, for: signingInput) else { throw LicenseGateError.badSignature }
        return payload
    }

    private func publicKeyData() throws -> Data {
        let raw = defaults.string(forKey: "licensePublicKeyPem") ?? ProcessInfo.processInfo.environment["V2RAYEZ_LICENSE_PUBLIC_KEY_PEM"] ?? ""
        guard !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw LicenseGateError.notConfigured }
        let body = raw
            .replacingOccurrences(of: "\\n", with: "\n")
            .components(separatedBy: .newlines)
            .filter { !$0.hasPrefix("-----") }
            .joined()
            .replacingOccurrences(of: " ", with: "")
        guard let der = Data(base64Encoded: body) else { throw LicenseGateError.badSignature }
        if der.count == 32 { return der }
        guard der.count > 32 else { throw LicenseGateError.badSignature }
        return Data(der.suffix(32))
    }

    private func validationEndpoint() -> String {
        let raw = defaults.string(forKey: "licenseValidationUrl")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !raw.isEmpty else { return "" }
        let base = raw.hasSuffix("/") ? String(raw.dropLast()) : raw
        return base.hasSuffix("/api/licenses/validate") ? base : base + "/api/licenses/validate"
    }

    private func deviceId() -> String {
        if let existing = keychainGet(account: deviceKey), !existing.isEmpty { return existing }
        let created = UUID().uuidString.lowercased()
        keychainSet(created, account: deviceKey)
        return created
    }

    private func hashDeviceId(_ value: String) -> String {
        let salt = ProcessInfo.processInfo.environment["V2RAYEZ_LICENSE_DEVICE_HASH_SALT"] ?? "v2rayez-client-device-binding-v1"
        let data = Data("v2rayez-device\0\(salt)\0\(value.trimmingCharacters(in: .whitespacesAndNewlines))".utf8)
        return Data(SHA256.hash(data: data)).base64UrlNoPadding()
    }

    private func deny(_ reason: String) -> ExtensionLicenseStatus {
        defaults.set("DENIED", forKey: "licenseLastResult")
        defaults.set(reason, forKey: "licenseLastReason")
        return ExtensionLicenseStatus(allowed: false, reason: reason, remainingSeconds: 0)
    }

    private func base64UrlDecode(_ value: String) throws -> Data {
        var base64 = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64 += "=" }
        guard let data = Data(base64Encoded: base64) else { throw LicenseGateError.invalidBase64 }
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

private enum LicenseGateError: Error {
    case invalidFormat
    case invalidBase64
    case invalidJson
    case badSignature
    case notConfigured
}

private extension Data {
    func base64UrlNoPadding() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
