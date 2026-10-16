#!/usr/bin/env bash
# Corre un comando y, si falla, publica las líneas de error como anotaciones del CI
# (se leen con la API de GitHub sin descargar los logs completos).
#   anotar-errores.sh <titulo> <comando...>
set -uo pipefail
TITULO="$1"; shift
LOG=$(mktemp)
"$@" 2>&1 | tee "$LOG"
status=${PIPESTATUS[0]}
if [ "$status" != "0" ]; then
  # Errores de compilación, expectativas fallidas de Swift Testing y fallas de xcodebuild
  grep -E "error:|Expectation failed|✘|recorded an issue|FAILED|\*\* BUILD FAILED|fatal|Fatal" "$LOG" | grep -v "^warning" | awk '!seen[$0]++' | head -120 > "$LOG.err" || true
  [ -s "$LOG.err" ] || tail -60 "$LOG" > "$LOG.err"
  # Una anotación por bloque de 30 líneas (el límite es 10 por paso)
  split -l 30 "$LOG.err" "$LOG.part."
  for f in "$LOG".part.*; do
    msg=$(sed 's/%/%25/g' "$f" | sed ':a;N;$!ba;s/\n/%0A/g' | sed 's/\r//g')
    echo "::error title=${TITULO}::${msg}"
  done
fi
exit "$status"
