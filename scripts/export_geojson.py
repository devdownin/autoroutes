"""Export GeoJSON (WGS84) des gares logiques et des échangeurs pour le frontend.

Usage : python3 scripts/export_geojson.py [répertoire de sortie]
Entrées : referentiel/gares-logiques-proposition.csv (scripts/analyse_referentiel.py), echangeurs-rrnc-2025.csv
Produit : stations.geojson, interchanges.geojson
"""
import json
import sys
from pathlib import Path

import pandas as pd
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
KINDS = {"Ech": "ECHANGEUR", "Bpv": "PLEINE_VOIE"}


def feature(lon, lat, properties):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
            "properties": properties}


def stations(points):
    features = []
    for station_id, group in points.groupby("gareLogiqueId", sort=True):
        axes = sorted({a for a in group.axe.dropna() if a})
        features.append(feature(group.lon.mean(), group.lat.mean(), {
            "id": station_id,
            "name": min(group.nomGare.str.strip(), key=len),
            "kind": KINDS[group.typeGare.iloc[0]],
            "axes": ", ".join(axes),
            "dept": str(group.depPr.iloc[0]).zfill(2),
            "lanes": int(group.nbVoies.sum()),
        }))
    return features


def interchanges():
    e = pd.read_csv(ROOT / "echangeurs-rrnc-2025.csv", sep=";", decimal=",")
    e["lon"], e["lat"] = Transformer.from_crs(2154, 4326, always_xy=True).transform(e.x.to_numpy(), e.y.to_numpy())
    # Une bifurcation décrite une fois par axe partage les mêmes coordonnées : fusionnée pour l'affichage.
    merged = e.groupby(["x", "y"], sort=False).agg(
        lon=("lon", "first"), lat=("lat", "first"), nom=("nom", "first"), nature=("nature", "first"),
        routes=("route", lambda r: ", ".join(sorted(set(r)))))
    return [feature(r.lon, r.lat, {"name": r.nom, "nature": r.nature, "routes": r.routes}) for r in merged.itertuples()]


def write(path, features):
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False,
                               separators=(",", ":")), encoding="utf-8")
    print(f"{path} : {len(features)} entités")


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "frontend" / "public" / "demo"
    out.mkdir(parents=True, exist_ok=True)
    points = pd.read_csv(ROOT / "referentiel" / "gares-logiques-proposition.csv", sep=";", dtype={"depPr": str})
    write(out / "stations.geojson", stations(points))
    write(out / "interchanges.geojson", interchanges())


if __name__ == "__main__":
    main()
