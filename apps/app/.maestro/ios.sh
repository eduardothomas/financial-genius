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
maestro --device "$UDID" test .maestro/recorrido.yaml --format junit --output capturas/maestro.xml || (xcrun simctl io "$UDID" screenshot capturas/error.png; exit 1)
