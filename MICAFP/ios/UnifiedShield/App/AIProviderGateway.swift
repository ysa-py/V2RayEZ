import Foundation
import Security

struct AIProviderDefinition: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var providerType: String
    var enabled: Bool
    var baseUrl: String
    var endpoint: String
    var model: String
    var apiKeyAlias: String
    var headersJson: String
    var requestTemplate: String
    var responsePath: String
    var timeoutMs: Int

    static let local = AIProviderDefinition(
        id: "local-v2rayez",
        name: "V2RayEZ Local AI",
        providerType: "local",
        enabled: true,
        baseUrl: "local://v2rayez",
        endpoint: "",
        model: "v2rayez-anti-dpi-local",
        apiKeyAlias: "",
        headersJson: "{}",
        requestTemplate: "",
        responsePath: "text",
        timeoutMs: 30_000
    )
}

struct AIProviderResult: Codable, Equatable {
    var success: Bool
    var providerId: String
    var providerName: String
    var source: String
    var text: String
    var error: String
    var blockedOrUnreachable: Bool
}

final class AIProviderGateway {
    static let shared = AIProviderGateway()

    private let defaults = UserDefaults(suiteName: "group.app.v2rayez.ios") ?? .standard
    private let service = "com.v2rayez.universal.ai"
    private let providersKey = "aiProviders"
    private let selectedKey = "aiSelectedProviderId"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private init() {}

    var enabled: Bool { defaults.object(forKey: "aiEngineEnabled") as? Bool ?? true }
    var autoFallback: Bool { defaults.object(forKey: "aiAutoFallbackToLocal") as? Bool ?? true }

    func providers() -> [AIProviderDefinition] {
        guard let data = defaults.data(forKey: providersKey),
              let decoded = try? decoder.decode([AIProviderDefinition].self, from: data),
              !decoded.isEmpty else { return [.local] }
        return decoded
    }

    func selectedProvider() -> AIProviderDefinition {
        let selected = defaults.string(forKey: selectedKey) ?? "local-v2rayez"
        if selected == "local-aether" { return .local }
        return providers().first(where: { $0.id == selected }) ?? providers().first ?? .local
    }

    func upsertProvider(_ provider: AIProviderDefinition) {
        var all = providers().filter { $0.id != provider.id }
        all.append(provider)
        if let data = try? encoder.encode(all) {
            defaults.set(data, forKey: providersKey)
            defaults.set(provider.id, forKey: selectedKey)
        }
    }

    func saveSecret(_ secret: String, alias: String) {
        let alias = alias.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !secret.isEmpty, !alias.isEmpty else { return }
        keychainSet(secret, account: "ai.secret." + alias)
    }

    func testSelected(secretOverride: String? = nil) async -> AIProviderResult {
        let provider = selectedProvider()
        if let secretOverride, !secretOverride.isEmpty, !provider.apiKeyAlias.isEmpty {
            saveSecret(secretOverride, alias: provider.apiKeyAlias)
        }
        return await advise(prompt: "Suggest a safe V2RayEZ/iOS anti-DPI fallback for a blocked TLS connection.", provider: provider)
    }

    func adviseOnFailure(_ failure: String) async -> AIProviderResult? {
        guard enabled else { return nil }
        return await advise(prompt: "The iOS Network Extension reported: \(failure). Recommend a safe anti-DPI fallback.", provider: selectedProvider())
    }

    private func advise(prompt: String, provider: AIProviderDefinition) async -> AIProviderResult {
        if provider.providerType == "local" || provider.baseUrl.hasPrefix("local://") {
            return localFallback(provider: provider, reason: "local_ready")
        }
        do {
            return try await callExternal(provider: provider, prompt: prompt)
        } catch {
            if autoFallback {
                var local = localFallback(provider: provider, reason: "external_unreachable")
                local.error = redact("\(error)", provider: provider)
                local.blockedOrUnreachable = true
                return local
            }
            return AIProviderResult(
                success: false,
                providerId: provider.id,
                providerName: provider.name,
                source: "external",
                text: "",
                error: redact("\(error)", provider: provider),
                blockedOrUnreachable: true
            )
        }
    }

    private func callExternal(provider: AIProviderDefinition, prompt: String) async throws -> AIProviderResult {
        guard var components = URLComponents(string: provider.baseUrl.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            throw AIProviderError.invalidUrl
        }
        let endpoint = provider.endpoint.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if !endpoint.isEmpty {
            components.path = (components.path as NSString).appendingPathComponent(endpoint)
        }
        guard let url = components.url else { throw AIProviderError.invalidUrl }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = TimeInterval(max(2, min(120, provider.timeoutMs / 1000)))
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue("application/json", forHTTPHeaderField: "Accept")
        let apiKey = secret(alias: provider.apiKeyAlias)
        if !apiKey.isEmpty {
            if provider.providerType == "anthropic" {
                request.addValue(apiKey, forHTTPHeaderField: "x-api-key")
                request.addValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
            } else {
                request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
            }
        }
        if let headersData = provider.headersJson.data(using: .utf8),
           let headers = try? JSONSerialization.jsonObject(with: headersData) as? [String: String] {
            for (key, value) in headers {
                request.addValue(render(value, provider: provider, prompt: prompt, apiKey: apiKey), forHTTPHeaderField: key)
            }
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody(provider: provider, prompt: prompt, apiKey: apiKey))
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw AIProviderError.httpFailure
        }
        let text = extractText(data: data, path: provider.responsePath)
        return AIProviderResult(
            success: !text.isEmpty,
            providerId: provider.id,
            providerName: provider.name,
            source: "external",
            text: text,
            error: "",
            blockedOrUnreachable: false
        )
    }

    private func requestBody(provider: AIProviderDefinition, prompt: String, apiKey: String) -> Any {
        if !provider.requestTemplate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let rendered = render(provider.requestTemplate, provider: provider, prompt: prompt, apiKey: apiKey)
            if let data = rendered.data(using: .utf8),
               let object = try? JSONSerialization.jsonObject(with: data) {
                return object
            }
        }
        if provider.providerType == "anthropic" {
            return ["model": provider.model, "max_tokens": 512, "messages": [["role": "user", "content": prompt]]]
        }
        if provider.providerType == "gemini" {
            return ["contents": [["parts": [["text": prompt]]]]]
        }
        return [
            "model": provider.model,
            "messages": [
                ["role": "system", "content": "Return concise anti-DPI tuning guidance."],
                ["role": "user", "content": prompt]
            ]
        ]
    }

    private func render(_ template: String, provider: AIProviderDefinition, prompt: String, apiKey: String) -> String {
        let promptJson = (try? JSONEncoder().encode(prompt))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "\"\""
        return template
            .replacingOccurrences(of: "${model}", with: provider.model)
            .replacingOccurrences(of: "${prompt}", with: prompt)
            .replacingOccurrences(of: "${prompt_json}", with: promptJson)
            .replacingOccurrences(of: "${api_key}", with: apiKey)
    }

    private func extractText(data: Data, path configuredPath: String) -> String {
        guard let object = try? JSONSerialization.jsonObject(with: data) else {
            return String(data: data, encoding: .utf8) ?? ""
        }
        let paths = [configuredPath, "choices.0.message.content", "choices.0.text", "content.0.text", "candidates.0.content.parts.0.text", "text", "response", "message"]
        for path in paths where !path.isEmpty {
            if let value = valueAtPath(object, path: path), !value.isEmpty { return value }
        }
        return ""
    }

    private func valueAtPath(_ object: Any, path: String) -> String? {
        var current: Any = object
        for part in path.split(separator: ".").map(String.init) {
            if let dict = current as? [String: Any], let next = dict[part] {
                current = next
            } else if let array = current as? [Any], let index = Int(part), array.indices.contains(index) {
                current = array[index]
            } else {
                return nil
            }
        }
        if let string = current as? String { return string }
        return String(describing: current)
    }

    private func localFallback(provider: AIProviderDefinition, reason: String) -> AIProviderResult {
        AIProviderResult(
            success: true,
            providerId: provider.id,
            providerName: provider.name,
            source: "local_fallback",
            text: "\(reason): retry conservative obfuscation, then switch core through V2RayEZ Smart Connect policy.",
            error: "",
            blockedOrUnreachable: false
        )
    }

    private func secret(alias: String) -> String {
        guard !alias.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return "" }
        return keychainGet(account: "ai.secret." + alias) ?? ""
    }

    private func redact(_ value: String, provider: AIProviderDefinition) -> String {
        let apiKey = secret(alias: provider.apiKeyAlias)
        guard !apiKey.isEmpty else { return value }
        return value.replacingOccurrences(of: apiKey, with: "[redacted]")
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

private enum AIProviderError: Error {
    case invalidUrl
    case httpFailure
}
