#!/usr/bin/env bash
# Abre un simulador de iPhone (iOS 26), instala la app nativa y corre el recorrido con Maestro.
set -euxo pipefail
cd "$(dirname "$0")/.."
UDID=$(xcrun simctl list devices available -j | python3 -c "
import json,sys
d=json.load(sys.stdin)['devices']
c=[(r,x) for r,v in d.items() if 'iOS-26' in r for x in v if x['name'].startswith('iPhone')]
pref=[x for r,x in c if x['name'] in ('iPhone 17 Pro','iPhone 17','iPhone 16 Pro')]
print((pref or [x for r,x in c])[0]['udid'])")
xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b
# Hora fija en la barra de estado para capturas limpias
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3 || true
APP=$(ls -d build/Build/Products/*-iphonesimulator/FinancialGenius.app | head -1)
xcrun simctl install "$UDID" "$APP"
mkdir -p capturas
touch /tmp/inicio-recorrido
export MAESTRO_DRIVER_STARTUP_TIMEOUT=240000
status=0
maestro --device "$UDID" test maestro/recorrido.yaml --format junit --output capturas/maestro.xml || status=$?
# El driver de iOS a veces no arranca a tiempo en CI: un reintento
if [ "$status" != "0" ] && [ ! -s capturas/maestro.xml ]; then status=0; maestro --device "$UDID" test maestro/recorrido.yaml --format junit --output capturas/maestro.xml || status=$?; fi
find "$PWD" "$HOME/.maestro" -type f -name '*.png' -newer /tmp/inicio-recorrido -not -path "$PWD/capturas/*" -exec cp {} capturas/ \; 2>/dev/null || true
# Modo oscuro: una captura extra de la pantalla actual
xcrun simctl ui "$UDID" appearance dark || true
sleep 2
xcrun simctl io "$UDID" screenshot capturas/8-nueva-meta-oscuro.png || true
ls -la capturas
if [ "$status" != "0" ]; then
  xcrun simctl io "$UDID" screenshot capturas/error.png || true
  grep -o 'message="[^"]*"' capturas/maestro.xml | head -5 | sed 's/^/::error title=Maestro::/' || true
  exit "$status"
fi
