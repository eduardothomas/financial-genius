#!/usr/bin/env bash
# Publica apps/ios/capturas en la rama capturas-movil, carpeta ios-nativo/ (sin tocar las demás). Reintenta si hay carrera.
set -euo pipefail
PLAT="ios-nativo"
SRC="$(cd "$(dirname "$0")/.." && pwd)/capturas"
[ -d "$SRC" ] || { echo "Sin capturas"; exit 0; }
REPO="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
for intento in 1 2 3; do
  TMP=$(mktemp -d)
  if git ls-remote --exit-code --heads "$REPO" capturas-movil >/dev/null 2>&1; then
    git clone -q --depth 1 -b capturas-movil "$REPO" "$TMP"
  else
    git init -q -b capturas-movil "$TMP"
  fi
  rm -rf "${TMP:?}/$PLAT" && mkdir -p "$TMP/$PLAT" && cp -R "$SRC/." "$TMP/$PLAT/"
  echo "$PLAT: ${GITHUB_REF_NAME} @ ${GITHUB_SHA} (${GITHUB_RUN_ID})" > "$TMP/$PLAT/ORIGEN.txt"
  (
    cd "$TMP"
    git config user.name "github-actions"; git config user.email "github-actions@users.noreply.github.com"
    git add -A && git commit -q -m "Capturas $PLAT de ${GITHUB_REF_NAME}" && git push -q "$REPO" HEAD:capturas-movil
  ) && exit 0
  echo "Otra corrida publicó primero; reintento ($intento)"; sleep $((intento * 5))
done
echo "::warning::No se pudieron publicar las capturas"
