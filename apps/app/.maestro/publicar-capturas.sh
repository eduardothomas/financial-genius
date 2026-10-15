#!/usr/bin/env bash
# Publica las capturas en la rama capturas-movil, carpeta <plataforma>/ (sin tocar la otra plataforma).
set -euo pipefail
PLAT="$1"
SRC="$(cd "$(dirname "$0")/.." && pwd)/capturas"
[ -d "$SRC" ] || { echo "Sin capturas"; exit 0; }
TMP=$(mktemp -d)
REPO="https://x-access-token:${GITHUB_TOKEN:-$GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
if git ls-remote --exit-code --heads "$REPO" capturas-movil >/dev/null 2>&1; then
  git clone -q --depth 1 -b capturas-movil "$REPO" "$TMP"
else
  git init -q -b capturas-movil "$TMP"
fi
rm -rf "$TMP/$PLAT" && mkdir -p "$TMP/$PLAT" && cp -R "$SRC/." "$TMP/$PLAT/"
cd "$TMP"
echo "$PLAT: ${GITHUB_REF_NAME} @ ${GITHUB_SHA} (${GITHUB_RUN_ID})" > "$PLAT/ORIGEN.txt"
git config user.name "github-actions"; git config user.email "github-actions@users.noreply.github.com"
git add -A && git commit -q -m "Capturas $PLAT de ${GITHUB_REF_NAME}" && git push -q "$REPO" HEAD:capturas-movil
