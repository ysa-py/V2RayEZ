module ezsni

go 1.26.0

require github.com/skip2/go-qrcode v0.0.0-20200617195104-da1b6568686e

// Optional donor features, enabled by -tags livekit,psiphon. The default build
// keeps the explanatory stub implementations; declared here so `go mod tidy`
// can resolve the complete manifest and the tagged feature builds are supported.
require (
	github.com/Psiphon-Labs/psiphon-tunnel-core v1.0.11-0.20240424194431-3612a5a6fb4c
	github.com/livekit/server-sdk-go/v2 v2.16.0
)
