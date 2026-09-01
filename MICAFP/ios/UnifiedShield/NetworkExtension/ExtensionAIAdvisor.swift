import Foundation

struct ExtensionAIAdvice {
    let source: String
    let text: String
}

final class ExtensionAIAdvisor {
    static let shared = ExtensionAIAdvisor()
    private let defaults = UserDefaults.standard

    private init() {}

    func adviseOnFailure(_ failure: String) async -> ExtensionAIAdvice? {
        guard defaults.object(forKey: "aiEngineEnabled") as? Bool ?? true else { return nil }
        // Network extensions must never block tunnel teardown/startup on external AI.
        // Full provider execution is performed in the container app; the extension emits
        // deterministic local guidance and lets the app/dashboard perform deeper analysis.
        let lower = failure.lowercased()
        let text: String
        if lower.contains("dns") {
            text = "local_fallback: force tunnel DNS, keep domestic split exclusions, and retry conservative obfuscation."
        } else if lower.contains("core") || lower.contains("start") {
            text = "local_fallback: switch Aether/Xray core profile, lower MTU, then retry Smart Connect policy."
        } else {
            text = "local_fallback: retry conservative obfuscation, then switch core while kill-switch remains enabled."
        }
        return ExtensionAIAdvice(source: "local_fallback", text: text)
    }
}
