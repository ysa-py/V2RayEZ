import SwiftUI

struct SettingsView: View {
    @AppStorage("killSwitchEnabled") private var killSwitchEnabled = true
    @AppStorage("splitTunnelEnabled") private var splitTunnelEnabled = true
    @AppStorage("autoCoreSwitchEnabled") private var autoCoreSwitchEnabled = true
    @AppStorage("autoUpdateEnabled") private var autoUpdateEnabled = true
    @AppStorage("startOnBootEnabled") private var startOnBootEnabled = false
    @AppStorage("dnsProvider") private var dnsProvider = "alibaba"
    @AppStorage("obfuscationLevel") private var obfuscationLevel = 1

    @AppStorage("licenseValidationUrl") private var licenseValidationUrl = ""
    @AppStorage("licenseAccountId") private var licenseAccountId = ""
    @AppStorage("licenseDeviceLabel") private var licenseDeviceLabel = "iOS device"
    @AppStorage("licensePublicKeyPem") private var licensePublicKeyPem = ""
    @AppStorage("licenseAllowOfflineGrace") private var licenseAllowOfflineGrace = true
    @AppStorage("licenseLastResult") private var licenseLastResult = "not_validated"
    @AppStorage("licenseLastReason") private var licenseLastReason = ""

    @AppStorage("aiEngineEnabled") private var aiEngineEnabled = true
    @AppStorage("aiAutoFallbackToLocal") private var aiAutoFallbackToLocal = true
    @AppStorage("aiSelectedProviderId") private var aiSelectedProviderId = "local-aether"
    @AppStorage("aiLocalModel") private var aiLocalModel = "aether-anti-dpi-local"

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
                    TextField("Account ID", text: $licenseAccountId)
                        .textInputAutocapitalization(.never)
                    TextField("Validation URL", text: $licenseValidationUrl)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                    TextField("Device label", text: $licenseDeviceLabel)
                    TextField("Ed25519 public key PEM", text: $licensePublicKeyPem, axis: .vertical)
                        .lineLimit(2...5)
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
                    TextField("Headers JSON", text: $aiProvider.headersJson, axis: .vertical)
                        .lineLimit(2...4)
                        .textInputAutocapitalization(.never)
                    TextField("Request template", text: $aiProvider.requestTemplate, axis: .vertical)
                        .lineLimit(2...5)
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
}

#Preview {
    SettingsView()
}
