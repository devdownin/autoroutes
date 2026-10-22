#!/usr/bin/env bash
# Chaîne cartographique reproductible : fond PMTiles, polices et sprites, couche autoroutes et graphe routier.
# Usage (depuis la racine du dépôt) :
#   docker build -t autoroutes-cartographie cartographie
#   docker run --rm -v "$PWD:/repo" -e PROTOMAPS_BUILD=AAAAMMJJ autoroutes-cartographie
set -euo pipefail

REPO=${REPO:-/repo}
OUT=${OUT:-$REPO/cartographie/out}
WORK=${WORK:-$REPO/cartographie/work}
BBOX=${BBOX:--5.5,41.2,10.0,51.3}
BASEMAP_MAXZOOM=${BASEMAP_MAXZOOM:-14}
PROTOMAPS_BUILD=${PROTOMAPS_BUILD:?PROTOMAPS_BUILD requis : date AAAAMMJJ d’un build listé sur https://maps.protomaps.com/builds}
# Source OSM : « single » = un extrait de la France (Geofabrik) ; « regions » = les 22 extraits régionaux d'OpenStreetMap France,
# téléchargés en parallèle, filtrés aux autoroutes puis supprimés (utile quand Geofabrik n'est pas joignable, et peu gourmand en disque).
OSM_MODE=${OSM_MODE:-single}
GEOFABRIK_URL=${GEOFABRIK_URL:-https://download.geofabrik.de/europe/france-latest.osm.pbf}
OSM_REGIONS_URL=${OSM_REGIONS_URL:-https://download.openstreetmap.fr/extracts/europe/france}
OSM_REGIONS=${OSM_REGIONS:-alsace aquitaine auvergne basse_normandie bourgogne bretagne centre champagne_ardenne corse franche_comte haute_normandie ile_de_france languedoc_roussillon limousin lorraine midi_pyrenees nord_pas_de_calais pays_de_la_loire picardie poitou_charentes provence_alpes_cote_d_azur rhone_alpes}
REGION_JOBS=${REGION_JOBS:-8}
# Polices et sprites : GitHub Pages du dépôt protomaps/basemaps-assets (aucun accès à l'API GitHub requis).
ASSETS_BASE_URL=${ASSETS_BASE_URL:-https://protomaps.github.io/basemaps-assets}

mkdir -p "$OUT/tiles" "$OUT/basemaps-assets" "$OUT/graph" "$WORK"

echo "== 1/4 Fond de carte : extrait France du build Protomaps $PROTOMAPS_BUILD (z0–$BASEMAP_MAXZOOM)"
pmtiles extract "https://build.protomaps.com/$PROTOMAPS_BUILD.pmtiles" "$OUT/tiles/france.pmtiles" \
  --bbox="$BBOX" --maxzoom="$BASEMAP_MAXZOOM"

echo "== 2/4 Polices et sprites auto-hébergés"
rm -rf "$OUT/basemaps-assets/fonts" "$OUT/basemaps-assets/sprites"
mkdir -p "$OUT/basemaps-assets/sprites/v4"
# Italic : demandée par le style Protomaps (étiquettes d'eau, notamment) ; sans elle, chaque page génère un 404.
for font in "Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic"; do
  mkdir -p "$OUT/basemaps-assets/fonts/$font"
  encoded=${font// /%20}
  # 256 plages de 256 glyphes (0-255 … 65280-65535), téléchargées en parallèle (l'expansion se fait dans le sous-shell de xargs).
  # shellcheck disable=SC2016
  seq 0 256 65280 | xargs -P 16 -I{} sh -c \
    'curl -fsS --retry 3 -o "$1/fonts/$2/$3-$(($3 + 255)).pbf" "$4/fonts/$5/$3-$(($3 + 255)).pbf"' _ "$OUT/basemaps-assets" "$font" {} "$ASSETS_BASE_URL" "$encoded"
done
for sprite in dark dark@2x light light@2x; do
  for ext in json png; do
    curl -fsS --retry 3 -o "$OUT/basemaps-assets/sprites/v4/$sprite.$ext" "$ASSETS_BASE_URL/sprites/v4/$sprite.$ext"
  done
done

echo "== 3/4 Autoroutes OSM (motorway + motorway_link), mode $OSM_MODE"
if [ "$OSM_MODE" = "regions" ]; then
  mkdir -p "$WORK/regions"
  fetch_region() {
    region=$1
    [ -s "$WORK/regions/$region.motorways.osm.pbf" ] && return 0
    until curl -fsS -C - -o "$WORK/regions/$region.osm.pbf" "$OSM_REGIONS_URL/$region.osm.pbf"; do sleep 3; done
    osmium tags-filter "$WORK/regions/$region.osm.pbf" w/highway=motorway,motorway_link -o "$WORK/regions/$region.motorways.osm.pbf" --overwrite
    rm -f "$WORK/regions/$region.osm.pbf"
    echo "  $region : ok"
  }
  export -f fetch_region
  export WORK OSM_REGIONS_URL
  # shellcheck disable=SC2086
  printf '%s\n' $OSM_REGIONS | xargs -P "$REGION_JOBS" -I{} bash -c 'fetch_region {}'
  # Chaque région est exportée séparément ; prepare_motorways.py lit le dossier et dédoublonne les voies à cheval sur deux régions
  # (« osmium merge » échoue sur ces objets en double).
  rm -rf "$WORK/export" && mkdir -p "$WORK/export"
  for file in "$WORK"/regions/*.motorways.osm.pbf; do
    osmium export "$file" -f geojsonseq -a type,id --geometry-types=linestring -o "$WORK/export/$(basename "$file" .motorways.osm.pbf).geojsonseq" --overwrite
  done
  MOTORWAYS_INPUT="$WORK/export"
else
  curl -fsSL -z "$WORK/france.osm.pbf" -o "$WORK/france.osm.pbf" "$GEOFABRIK_URL"
  osmium tags-filter "$WORK/france.osm.pbf" w/highway=motorway,motorway_link -o "$WORK/motorways.osm.pbf" --overwrite
  osmium export "$WORK/motorways.osm.pbf" -f geojsonseq -a type,id --geometry-types=linestring \
    -o "$WORK/motorways.geojsonseq" --overwrite
  MOTORWAYS_INPUT="$WORK/motorways.geojsonseq"
fi
python3 "$REPO/cartographie/prepare_motorways.py" "$MOTORWAYS_INPUT" \
  "$REPO/referentiel/gares-logiques-proposition.csv" "$REPO/echangeurs-rrnc-2025.csv" "$WORK"
cp "$WORK/graph.json" "$OUT/graph/graph-$(date +%Y%m%d).json"

echo "== 4/4 Tuiles vectorielles des tronçons"
tippecanoe -o "$OUT/tiles/motorways.pmtiles" -l motorways --force \
  --minimum-zoom=4 --maximum-zoom=14 --simplification=4 \
  --no-feature-limit --no-tile-size-limit --attribution="© OpenStreetMap contributors (ODbL)" \
  "$WORK/segments.geojsonseq"

ls -lh "$OUT/tiles" "$OUT/graph"
