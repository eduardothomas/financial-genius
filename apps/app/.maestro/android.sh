#!/usr/bin/env bash
# Corre dentro del emulador Android (android-emulator-runner).
set -euxo pipefail
cd "$(dirname "$0")/.."
adb wait-for-device
# Espera a que el sistema termine de arrancar y cierra avisos ("no responde")
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done
sleep 20
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS || true
adb install -r android/app/build/outputs/apk/release/app-release.apk
mkdir -p capturas
status=0
maestro test .maestro/recorrido.yaml --format junit --output capturas/maestro.xml || status=$?
# Maestro guarda las capturas junto al flujo: se juntan en capturas/
cp -R .maestro/capturas/. capturas/ 2>/dev/null || true
if [ "$status" != "0" ]; then adb exec-out screencap -p > capturas/error.png; exit "$status"; fi
