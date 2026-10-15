#!/usr/bin/env bash
# Abre un simulador de iPhone, instala la app y corre el recorrido.
set -euxo pipefail
cd "$(dirname "$0")/.."
UDID=$(xcrun simctl list devices available -j | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; print(next(x['udid'] for r,v in d.items() if 'iOS' in r for x in v if x['name'].startswith('iPhone')))")
xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b
APP=$(ls -d ios/build/Build/Products/Release-iphonesimulator/*.app | head -1)
xcrun simctl install "$UDID" "$APP"
mkdir -p capturas
touch /tmp/inicio-recorrido
export MAESTRO_DRIVER_STARTUP_TIMEOUT=240000
status=0
maestro --device "$UDID" test .maestro/recorrido.yaml --format junit --output capturas/maestro.xml || status=$?
# El driver de iOS a veces no arranca a tiempo en CI: un reintento
if [ "$status" != "0" ] && [ ! -s capturas/maestro.xml ]; then status=0; maestro --device "$UDID" test .maestro/recorrido.yaml --format junit --output capturas/maestro.xml || status=$?; fi
# Maestro guarda las capturas en su carpeta de salida: se juntan todas las nuevas en capturas/
find "$PWD" "$HOME/.maestro" -type f -name '*.png' -newer /tmp/inicio-recorrido -not -path "$PWD/capturas/*" -exec cp {} capturas/ \; 2>/dev/null || true
ls -la capturas
if [ "$status" != "0" ]; then xcrun simctl io "$UDID" screenshot capturas/error.png; exit "$status"; fi
