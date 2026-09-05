import SwiftUI

struct SettingsView: View {
    @AppStorage("killSwitchEnabled", store: UserDefaults(suiteName: "group.app.vor.ios")) private var killSwitchEnabled = true
    @AppStorage("splitTunnelEnabled", store: UserDefaults(suiteName: "group.app.vor.ios")) private var splitTunnelEnabled = true
    @AppStorage("autoCoreSwitchEnabled", store: UserDefaults(suiteName: "group.app.vor.ios")) private var autoCoreSwitchEnabled = true
    @AppStorage("autoUpdateEnabled", store: UserDefaults(suiteName: "group.app.vor.ios")) private var autoUpdateEnabled = true
    @AppStorage("startOnBootEnabled", store: UserDefaults(suiteName: "group.app.vor.ios")) private var startOnBootEnabled = false
    @AppStorage("dnsProvider", store: UserDefaults(suiteName: "group.app.vor.ios")) private var dnsProvider = "alibaba"
    @AppStorage("obfuscationLevel", store: UserDefaults(suiteName: "group.app.vor.ios")) private var obfuscationLevel = 1

    @AppStorage("licenseValidationUrl", store: UserDefaults(suiteName: "group.app.vor.ios")) private var licenseValidationUrl = ""
    @AppStorage("licenseAccountId", store: UserDefaults(suiteName: "group.app.vor.ios")) private var licenseAccountId = ""
    @AppStorage("licenseDeviceLabel", store: UserDefaults(suiteName: "group.app.vor.ios")) private var licenseDeviceLabel = "iOS device"
    @AppStorage("licensePublicKeyPem", store: UserDefaults(suiteName: "group.app.vor.ios")) private var licensePublicKeyPem = ""
    @AppStorage("licenseAllowOfflineGrace", store: UserDefaults(suiteName: "group.app.vor.ios")) private var licenseAllowOfflineGrace = true
    @AppStorage("licenseLastResult", store: UserDefaults(suiteName: "group.app.vor.ios")) private var licenseLastResult = "not_validated"
    @AppStorage("licenseLastReason", store: UserDefaults(suiteName: "group.app.vor.ios")) private var licenseLastReason = ""
    @AppStorage("licenseLastServerTime", store: UserDefaults(suiteName: "group.app.vor.ios")) private var licenseLastServerTime = ""

    @AppStorage("aiEngineEnabled", store: UserDefaults(suiteName: "group.app.vor.ios")) private var aiEngineEnabled = true
    @AppStorage("aiAutoFallbackToLocal", store: UserDefaults(suiteName: "group.app.vor.ios")) private var aiAutoFallbackToLocal = true
    @AppStorage("aiSelectedProviderId", store: UserDefaults(suiteName: "group.app.vor.ios")) private var aiSelectedProviderId = "local-v2rayez"
    @AppStorage("aiLocalModel", store: UserDefaults(suiteName: "group.app.vor.ios")) private var aiLocalModel = "v2rayez-anti-dpi-local"

    @State private var licenseSerialInput = ""
    @State private var licenseStatusText = "No serial validated"
    @State private var aiProvider = AIProviderDefinition.local
    @State private var aiSecretInput = ""
    @State private var aiStatusText = "Local fallback ready"

    var body: some View {
        NavigationView {
            Form {
                // Security Section
                Section(header: Text("Security")) {
                    Toggle("Kill Switch", isOn: $killSwitchEnabled)
                    Toggle("Split Tunnel", isOn: $splitTunnelEnabled)
                    Toggle("Auto Core Switch", isOn: $autoCoreSwitchEnabled)

                    VStack(alignment: .leading) {
                        Text("Obfuscation Level")
                            .font(.subheadline)
                        Text("Higher = more resistant but slower")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        HStack {
                            Text("Low")
                                .font(.caption)
                            Slider(value: Binding(
                                get: { Double(obfuscationLevel) },
                                set: { obfuscationLevel = Int($0) }
                            ), in: 0...3, step: 1)
                            Text("Max")
                                .font(.caption)
                        }
                    }
                }

                // DNS Section
                Section(header: Text("DNS")) {
                    Picker("DNS Provider", selection: $dnsProvider) {
                        Text("Alibaba DNS (223.5.5.5)").tag("alibaba")
                        Text("Tencent DNS (119.29.29.29)").tag("tencent")
                        Text("Tencent Backup (1.12.12.12)").tag("tencent-backup")
                    }
                    .pickerStyle(.menu)

                    Text("Chinese CDN primary (Cloudflare blocked in Iran)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                // License Section
                Section(header: Text("License"), footer: Text("The serial and grace token are stored in Keychain; Settings keeps only status and metadata.")) {
                    HStack {
                        Text("Status")
                        Spacer()
                        Text(licenseStatusText)
                            .foregroundColor(licenseLastResult == "ALLOWED" ? .green : .secondary)
                            .multilineTextAlignment(.trailing)
                    }
                    if !licenseLastServerTime.isEmpty {
                        HStack {
                            Text("Last trusted server time")
                            Spacer()
                            Text(licenseLastServerTime)
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.trailing)
                        }
                    }
                    TextField("Account ID", text: $licenseAccountId)
                        .textInputAutocapitalization(.never)
                    TextField("Validation URL", text: $licenseValidationUrl)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                    TextField("Device label", text: $licenseDeviceLabel)
                    multilineField("Ed25519 public key PEM", text: $licensePublicKeyPem, lines: 5)
                        .textInputAutocapitalization(.never)
                    Toggle("Allow signed offline grace", isOn: $licenseAllowOfflineGrace)
                    SecureField("Serial number", text: $licenseSerialInput)
                        .textInputAutocapitalization(.never)
                    HStack {
                        Button("Activate") { activateLicense() }
                        Spacer()
                        Button("Validate") { validateLicense() }
                        Spacer()
                        Button("Clear", role: .destructive) { clearLicense() }
                    }
                }

                // AI Engine Section
                Section(header: Text("AI Engine"), footer: Text("New providers are stored as JSON settings; API keys are stored in Keychain by alias and are not exported with preferences.")) {
                    Toggle("Enable AI Engine", isOn: $aiEngineEnabled)
                    Toggle("Automatic local fallback", isOn: $aiAutoFallbackToLocal)
                    TextField("Selected provider ID", text: $aiSelectedProviderId)
                        .textInputAutocapitalization(.never)
                    TextField("Local model/policy", text: $aiLocalModel)
                        .textInputAutocapitalization(.never)
                    Text(aiStatusText)
                        .font(.caption)
                        .foregroundColor(.secondary)

                    TextField("Provider ID", text: $aiProvider.id)
                        .textInputAutocapitalization(.never)
                    TextField("Provider name", text: $aiProvider.name)
                    Picker("Provider type", selection: $aiProvider.providerType) {
                        Text("Local fallback").tag("local")
                        Text("OpenAI-compatible").tag("openai")
                        Text("Anthropic").tag("anthropic")
                        Text("Gemini").tag("gemini")
                        Text("Generic HTTP").tag("generic")
                    }
                    .pickerStyle(.menu)
                    Toggle("Provider enabled", isOn: $aiProvider.enabled)
                    TextField("Base URL", text: $aiProvider.baseUrl)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                    TextField("Endpoint", text: $aiProvider.endpoint)
                        .textInputAutocapitalization(.never)
                    TextField("Model", text: $aiProvider.model)
                        .textInputAutocapitalization(.never)
                    TextField("API key alias", text: $aiProvider.apiKeyAlias)
                        .textInputAutocapitalization(.never)
                    SecureField("API key / secret", text: $aiSecretInput)
                    multilineField("Headers JSON", text: $aiProvider.headersJson, lines: 4)
                        .textInputAutocapitalization(.never)
                    multilineField("Request template", text: $aiProvider.requestTemplate, lines: 5)
                        .textInputAutocapitalization(.never)
                    TextField("Response path", text: $aiProvider.responsePath)
                        .textInputAutocapitalization(.never)
                    HStack {
                        Button("Save Provider") { saveAIProvider() }
                        Spacer()
                        Button("Test") { testAIProvider() }
                    }
                }

                // General Section
                Section(header: Text("General")) {
                    Toggle("Auto Update (6h interval)", isOn: $autoUpdateEnabled)
                    Toggle("Start on Boot", isOn: $startOnBootEnabled)
                }

                // About Section
                Section(header: Text("About")) {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.0.0")
                            .foregroundColor(.secondary)
                    }
                    Text("Next-gen anti-censorship VPN for Iran")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text("No jailbreak required • Split tunnel • DPI evasion")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            .navigationTitle("Settings")
            .onAppear {
                licenseStatusText = [licenseLastResult, licenseLastReason]
                    .filter { !$0.isEmpty }
                    .joined(separator: " · ")
                aiProvider = AIProviderGateway.shared.selectedProvider()
            }
        }
    }

    private func activateLicense() {
        Task {
            let status = await LicenseManager.shared.activate(serial: licenseSerialInput)
            await MainActor.run {
                applyLicenseStatus(status)
                if status.allowed { licenseSerialInput = "" }
            }
        }
    }

    private func validateLicense() {
        Task {
            let status = await LicenseManager.shared.validate()
            await MainActor.run { applyLicenseStatus(status) }
        }
    }

    private func clearLicense() {
        let status = LicenseManager.shared.clear()
        applyLicenseStatus(status)
        licenseSerialInput = ""
    }

    private func applyLicenseStatus(_ status: LicenseStatus) {
        licenseLastResult = status.result
        licenseLastReason = status.reason
        licenseStatusText = "\(status.result) · \(status.reason)"
    }

    private func saveAIProvider() {
        var provider = aiProvider
        if provider.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            provider.id = aiSelectedProviderId
        }
        AIProviderGateway.shared.upsertProvider(provider)
        AIProviderGateway.shared.saveSecret(aiSecretInput, alias: provider.apiKeyAlias)
        aiSelectedProviderId = provider.id
        aiSecretInput = ""
        aiStatusText = "Provider saved"
    }

    private func testAIProvider() {
        saveAIProvider()
        Task {
            let result = await AIProviderGateway.shared.testSelected(secretOverride: aiSecretInput)
            await MainActor.run {
                aiStatusText = "\(result.success ? "OK" : "FAIL") · \(result.source) · \(result.text.prefix(96))"
            }
        }
    }


    /// Multi-line text input that stays compatible with the iOS 15 deployment
    /// target: `TextField(_:text:axis:)` and the range-based `lineLimit` are
    /// iOS 16+, so iOS 15 falls back to a plain (still multi-line capable)
    /// TextField with an absolute line limit.
    @ViewBuilder
    private func multilineField(_ title: String, text: Binding<String>, lines: Int) -> some View {
        if #available(iOS 16.0, *) {
            TextField(title, text: text, axis: .vertical)
                .lineLimit(2...lines)
        } else {
            TextField(title, text: text)
                .lineLimit(lines)
        }
    }

}

#Preview {
    SettingsView()
}
