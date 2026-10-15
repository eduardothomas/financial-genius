#!/usr/bin/env bash
# Corre dentro del emulador Android (android-emulator-runner).
set -euxo pipefail
cd "$(dirname "$0")/.."
adb wait-for-device
adb install -r android/app/build/outputs/apk/release/app-release.apk
mkdir -p capturas
maestro test .maestro/recorrido.yaml --format junit --output capturas/maestro.xml || (adb exec-out screencap -p > capturas/error.png; exit 1)
