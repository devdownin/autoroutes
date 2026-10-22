#!/usr/bin/env bash
# Charge le jeu de performance SYNTHÉTIQUE dans le PostgreSQL du profil Compose « infra » puis mesure les requêtes de l'API.
# Usage (racine du dépôt, backend démarré sur :8080) : scripts/perf_history.sh
set -euo pipefail
cd "$(dirname "$0")/.."
STATION=${STATION:-$(cut -d';' -f2 referentiel/gares-logiques-proposition.csv | tail -n +2 | sort -u | head -1)}
{
  echo "create temporary table perf_station (station_id text primary key);"
  echo "insert into perf_station values"
  cut -d';' -f2 referentiel/gares-logiques-proposition.csv | tail -n +2 | sort -u | sed "s/.*/('&')/" | paste -sd, -
  echo ";"
  cat scripts/perf_history.sql
} | docker compose --profile infra exec -T postgres psql -v ON_ERROR_STOP=1 -q -U supervision -d supervision

measure() {
  curl -s -o /dev/null --compressed -w "%{http_code} %{time_total}s %{size_download}o  $1\n" "http://localhost:8080$1"
}
NOW=$(date -u +%Y-%m-%dT%H:00:00Z)
for _ in 1 2 3; do
  measure "/api/v1/stations/$STATION/history?from=$(date -u -d '400 days ago' +%Y-%m-%dT%H:00:00Z)&to=$NOW&step=PT15M"
  measure "/api/v1/stations/$STATION/history?from=$(date -u -d '1095 days ago' +%Y-%m-%dT%H:00:00Z)&to=$NOW&step=PT1H"
  measure "/api/v1/history/network?from=$(date -u -d '30 days ago' +%Y-%m-%dT%H:00:00Z)&to=$NOW&step=PT1H"
done
