#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/.android-signing"
mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"
STORE="$OUT_DIR/v2rayez-gui-release.jks"
PROPS="$OUT_DIR/signing.properties"
ALIAS="${ANDROID_KEY_ALIAS:-v2rayezgui}"
if [[ -f "$STORE" ]]; then
  echo "Keystore already exists: $STORE"
  exit 0
fi
STORE_PW="${ANDROID_KEYSTORE_PASSWORD:-$(openssl rand -base64 24)}"
KEY_PW="${ANDROID_KEY_PASSWORD:-$STORE_PW}"
keytool -genkeypair -v \
  -keystore "$STORE" \
  -storetype PKCS12 \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 -validity 10950 \
  -storepass "$STORE_PW" -keypass "$KEY_PW" \
  -dname "CN=V2RayEZ GUI Release, OU=V2RayEZ, O=V2RayEZ, L=Stockholm, ST=Stockholm, C=SE"
cat > "$PROPS" <<EOF
storeFile=.android-signing/v2rayez-gui-release.jks
storePassword=$STORE_PW
keyAlias=$ALIAS
keyPassword=$KEY_PW
EOF
chmod 600 "$STORE" "$PROPS"
echo "Created $STORE"
echo "Build: cd $ROOT && ./gradlew :app:assembleRelease"
