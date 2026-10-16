#!/bin/bash
# Prueba la app nativa en tu iPhone con la API corriendo en esta Mac (misma red Wi-Fi).
# Doble clic en Finder, o: bash apps/ios/scripts/probar-en-iphone.command
# Hace: PostgreSQL + API con datos demo (usuario demo@ejemplo.test) y apunta el proyecto de Xcode a esta Mac.
# OJO: reinicia la base de datos local "fg" (datos de prueba).
set -euo pipefail
[ "$(id -u)" = "0" ] && { echo "No uses sudo: corre el script con tu usuario."; exit 1; }
cd "$(dirname "$0")/../../.."
RAIZ="$PWD"
echo "== Financial Genius: API local para el iPhone =="

command -v brew >/dev/null || { echo "Falta Homebrew: https://brew.sh"; read -r; exit 1; }
command -v node >/dev/null || brew install node@22
command -v node >/dev/null || export PATH="$(brew --prefix node@22)/bin:$PATH"
# pnpm con Homebrew (sin sudo ni npm global)
command -v pnpm >/dev/null || brew install pnpm
if ! command -v psql >/dev/null; then
  brew install postgresql@16
fi
export PATH="$(brew --prefix postgresql@16)/bin:$PATH"
brew services start postgresql@16 >/dev/null 2>&1 || true
for i in $(seq 1 30); do pg_isready -q && break; sleep 1; done
createdb fg 2>/dev/null || true

export DATABASE_URL="postgres://localhost:5432/fg" FG_DEV_USERS=1 PORT=3000
pnpm install
pnpm turbo run build --filter="./packages/*"
pnpm --filter @fg/db reset

# Nombre de esta Mac en la red local (el iPhone lo resuelve por Bonjour)
HOST="$(scutil --get LocalHostName).local"
URL="http://$HOST:3000"
PBX="apps/ios/FinancialGenius.xcodeproj/project.pbxproj"
if [ -f "$PBX" ]; then
  sed -i '' -E "s#FG_API_URL = \"?http://[^\";]*\"?;#FG_API_URL = \"$URL\";#g" "$PBX"
  echo "Proyecto de Xcode apuntando a $URL"
fi

pnpm --filter @fg/api exec tsx src/main.ts &
API=$!
trap 'kill $API 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -sf localhost:3000/v1/health >/dev/null && break; sleep 1; done
pnpm exec tsx services/api/scripts/datos-demo.ts
echo
echo "Listo. API en $URL"
echo "En Xcode: elige tu iPhone y dale Run. Entra con demo@ejemplo.test"
echo "Deja esta ventana abierta mientras pruebas (Ctrl+C para detener)."
wait $API
