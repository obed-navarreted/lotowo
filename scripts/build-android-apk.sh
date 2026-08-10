#!/usr/bin/env bash
set -euo pipefail

export ANDROID_SDK_ROOT=/data/tools/android-sdk
export ANDROID_HOME=/data/tools/android-sdk
export JAVA_HOME=/usr/lib/jvm/java-21-amazon-corretto
export PATH="$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH"

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$PROJECT_DIR"
npm run build
# Las dependencias nativas se sincronizan explícitamente con `npm run android:sync`.
# Para un APK cotidiano basta copiar los assets web; volver a sincronizar todos
# los plugins obliga a Gradle a reevaluar trabajo nativo que no cambió.
npx cap copy android
cd android
./gradlew --no-daemon --build-cache assembleDebug

printf '\nAPK generado en:\n%s\n' "$PROJECT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
