"""Prépare la couche autoroutes et le graphe routier à partir d'un extrait OSM.

Entrée : GeoJSON séquentiel produit par
  osmium export motorways.osm.pbf -f geojsonseq -a type,id -o motorways.geojsonseq
Sorties :
  - segments.geojsonseq : tronçons (segmentId, ref, concede, link) pour tippecanoe ;
  - graph.json : graphe orienté (nœuds lon/lat, arêtes longueur/vitesse/axes/bretelle) pour l'affectation (phase 2, module assignment).

Usage : python3 prepare_motorways.py motorways.geojsonseq ../referentiel/gares-logiques-proposition.csv \
          ../echangeurs-rrnc-2025.csv out/
"""
import csv
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

PRECISION = 7
CONCESSION_RADIUS_M = 20_000
DEFAULT_SPEED = {"motorway": 130, "motorway_link": 70}


def key(coord):
    return round(coord[0], PRECISION), round(coord[1], PRECISION)


def haversine(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6_371_008.8 * math.asin(math.sqrt(h))


def length(coords):
    return sum(haversine(a, b) for a, b in zip(coords, coords[1:]))


def normalize_ref(ref):
    """« A 7;E 15 » → {"A7"} ; « A0007N » (référentiel RRN) → {"A7"}. Seuls les numéros d'autoroute A sont retenus."""
    refs = set()
    for part in re.split(r"[;,]", ref or ""):
        match = re.match(r"^\s*A\s*0*(\d+)", part.strip(), re.IGNORECASE)
        if match:
            refs.add(f"A{int(match.group(1))}")
    return refs


def parse_speed(value, highway):
    match = re.match(r"^\s*(\d+)", value or "")
    return int(match.group(1)) if match else DEFAULT_SPEED.get(highway, 110)


def read_ways(path):
    """Voies LineString d'un fichier GeoJSON séquentiel, ou de tous les `*.geojsonseq` d'un dossier.

    Les extraits régionaux d'OpenStreetMap se recouvrent : une voie à cheval sur deux régions figure dans les deux, entière
    (vérifié : aucune voie tronquée). Elle n'est gardée qu'une fois, par identifiant OSM.
    """
    files = sorted(Path(path).glob("*.geojsonseq")) if Path(path).is_dir() else [Path(path)]
    seen = set()
    for file in files:
        with open(file, encoding="utf-8") as stream:
            for line in stream:
                line = line.strip().lstrip("\x1e")
                if not line:
                    continue
                feature = json.loads(line)
                if feature.get("geometry", {}).get("type") != "LineString":
                    continue
                way_id = feature.get("properties", {}).get("@id")
                if way_id is not None:
                    if way_id in seen:
                        continue
                    seen.add(way_id)
                yield feature


def split_at_junctions(ways):
    """Coupe chaque voie aux sommets intérieurs où commence ou finit une autre voie (jonction de bretelle)."""
    endpoints = set()
    for way in ways:
        coords = way["geometry"]["coordinates"]
        endpoints.update((key(coords[0]), key(coords[-1])))
    for way in ways:
        coords = way["geometry"]["coordinates"]
        start = 0
        part = 0
        for i in range(1, len(coords)):
            if i == len(coords) - 1 or key(coords[i]) in endpoints:
                yield way, part, coords[start:i + 1]
                start = i
                part += 1


def load_reference_points(stations_csv, interchanges_csv):
    """Points du référentiel concédé par numéro d'autoroute (lon, lat)."""
    points = defaultdict(list)
    with open(stations_csv, encoding="utf-8") as stream:
        for row in csv.DictReader(stream, delimiter=";"):
            for ref in normalize_ref(row["axe"]):
                points[ref].append((float(row["lon"]), float(row["lat"])))
    if interchanges_csv is not None:
        from pyproj import Transformer
        to_wgs84 = Transformer.from_crs(2154, 4326, always_xy=True)
        with open(interchanges_csv, encoding="utf-8") as stream:
            for row in csv.DictReader(stream, delimiter=";"):
                lon, lat = to_wgs84.transform(float(row["x"].replace(",", ".")), float(row["y"].replace(",", ".")))
                for ref in normalize_ref(row["route"]):
                    points[ref].append((lon, lat))
    return points


def is_conceded(refs, midpoint, reference_points):
    """Approximation : tronçon d'un axe du référentiel concédé, à moins de 20 km d'un point de ce même axe."""
    return any(haversine(midpoint, p) <= CONCESSION_RADIUS_M for ref in refs for p in reference_points.get(ref, ()))


def build(ways, reference_points):
    nodes = {}
    segments = []
    edges = []
    for way, part, coords in split_at_junctions(ways):
        props = way.get("properties", {})
        highway = props.get("highway", "motorway")
        refs = normalize_ref(props.get("ref"))
        segment_id = f"w{props.get('@id', 0)}-{part}"
        midpoint = coords[len(coords) // 2]
        conceded = is_conceded(refs, midpoint, reference_points)
        segments.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {"segmentId": segment_id, "ref": props.get("ref", ""), "concede": conceded,
                           "link": highway == "motorway_link"},
        })
        a = nodes.setdefault(key(coords[0]), len(nodes))
        b = nodes.setdefault(key(coords[-1]), len(nodes))
        edge = {"id": segment_id, "from": a, "to": b, "lengthM": round(length(coords), 1),
                "speedKmh": parse_speed(props.get("maxspeed"), highway), "refs": sorted(refs), "link": highway == "motorway_link"}
        edges.append(edge)
        # Les autoroutes OSM sont tracées par chaussée (oneway implicite) ; une voie explicitement bidirectionnelle crée deux arêtes.
        if props.get("oneway") == "no":
            edges.append({**edge, "from": b, "to": a})
    node_list = [None] * len(nodes)
    for coord, index in nodes.items():
        node_list[index] = list(coord)
    return segments, {"nodes": node_list, "edges": edges}


def main(argv):
    ways_path, stations_csv, interchanges_csv, out_dir = argv[1:5]
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    segments, graph = build(list(read_ways(ways_path)), load_reference_points(stations_csv, interchanges_csv))
    with open(out / "segments.geojsonseq", "w", encoding="utf-8") as stream:
        for feature in segments:
            stream.write(json.dumps(feature, separators=(",", ":")) + "\n")
    (out / "graph.json").write_text(json.dumps(graph, separators=(",", ":")), encoding="utf-8")
    conceded = sum(f["properties"]["concede"] for f in segments)
    print(f"tronçons={len(segments)} (concédés={conceded}) nœuds={len(graph['nodes'])} arêtes={len(graph['edges'])}")


if __name__ == "__main__":
    main(sys.argv)
