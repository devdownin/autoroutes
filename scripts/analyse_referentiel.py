"""Analyse du référentiel RRNc 2025 et proposition de regroupement en gares logiques.

Usage : python3 scripts/analyse_referentiel.py
Dépendances : pandas, numpy, pyproj
Produit : referentiel/gares-logiques-proposition.csv, referentiel/gares-logiques-a-arbitrer.csv,
          referentiel/alias-gares.csv (table nom → gare logique utilisée par le backend)
"""
import re
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "referentiel"
SPREAD_MAX_M = 1000
NEIGHBOUR_MAX_M = 500
LINK_MAX_M = 1000


def read(name):
    return pd.read_csv(ROOT / name, sep=";", decimal=",")


def base_name(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\bsainte\b", "ste", re.sub(r"\bsaint\b", "st", s))
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\b(entree|sortie|sens ?[12]|bpv|barriere|gares? de peage de|peage)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def spread(points):
    p = points[["x", "y"]].to_numpy()
    return max((np.hypot(*(a - b)) for a in p for b in p), default=0.0)


def nearest(src, dst):
    d = np.hypot(src.x.to_numpy()[:, None] - dst.x.to_numpy(), src.y.to_numpy()[:, None] - dst.y.to_numpy())
    return d.argmin(axis=1), d.min(axis=1)


def main():
    gares = read("gares-peage-2025.csv")
    echangeurs = read("echangeurs-rrnc-2025.csv")
    to_wgs84 = Transformer.from_crs(2154, 4326, always_xy=True)
    for df in (gares, echangeurs):
        df["lon"], df["lat"] = to_wgs84.transform(df.x.to_numpy(), df.y.to_numpy())

    assert not gares.duplicated(["route", "pr", "abs", "cote"]).any(), "clé de fait non unique"
    gares["pointId"] = "PP-" + gares.route + "-" + gares.pr.astype(str) + "-" + gares["abs"].astype(str) + "-" + gares.cote
    gares["cle"] = gares.typeGare + "|" + gares.nomGare.map(base_name)

    groups = gares.groupby("cle")
    spreads = groups.apply(spread, include_groups=False)
    centres = groups[["x", "y"]].mean()
    centres["type"] = [k.split("|")[0] for k in centres.index]

    pairs = []
    for _, sub in centres.groupby("type"):
        idx, d = sub.index.to_numpy(), np.hypot(sub.x.to_numpy()[:, None] - sub.x.to_numpy(), sub.y.to_numpy()[:, None] - sub.y.to_numpy())
        pairs += [(idx[i], idx[j], round(d[i, j])) for i, j in zip(*np.where(np.triu(d < NEIGHBOUR_MAX_M, 1)))]

    diffuseurs = echangeurs[echangeurs.nature != "BIFURCATION"].reset_index(drop=True)
    i, d = nearest(gares, diffuseurs)
    is_ech = gares.typeGare == "Ech"
    gares["echangeurNom"] = np.where(is_ech, diffuseurs.nom.to_numpy()[i], "")
    gares["echangeurRoute"] = np.where(is_ech, diffuseurs.route.to_numpy()[i], "")
    gares["distEchangeurM"] = np.where(is_ech, d.round(), np.nan)
    gares["axe"] = np.where(gares.route.str.match(r"^[AN]\d"), gares.route, gares.echangeurRoute)

    ids = {k: f"GL-{k.split('|')[0].upper()}-{n:04d}" for n, k in enumerate(sorted(groups.groups))}
    gares["gareLogiqueId"] = gares.cle.map(ids)
    gares["aArbitrer"] = (
        gares.cle.map(spreads).gt(SPREAD_MAX_M)
        | gares.cle.isin({k for p in pairs for k in p[:2]})
        | (is_ech & gares.distEchangeurM.gt(LINK_MAX_M))
    )

    OUT.mkdir(exist_ok=True)
    cols = ["pointId", "gareLogiqueId", "nomGare", "typeGare", "axe", "echangeurNom", "distEchangeurM",
            "nbVoies", "depPr", "lon", "lat", "aArbitrer"]
    gares[cols].sort_values(["gareLogiqueId", "pointId"]).to_csv(OUT / "gares-logiques-proposition.csv", sep=";", index=False)
    pd.DataFrame(pairs, columns=["cleA", "cleB", "distanceM"]).to_csv(OUT / "gares-logiques-a-arbitrer.csv", sep=";", index=False)
    aliases = gares.assign(name=gares.nomGare.str.strip())[["name", "gareLogiqueId"]].drop_duplicates()
    aliases = aliases.rename(columns={"gareLogiqueId": "stationId"}).sort_values("name")
    aliases.to_csv(OUT / "alias-gares.csv", sep=";", index=False)

    print(f"points={len(gares)} noms={gares.nomGare.nunique()} gares logiques={len(ids)} "
          f"(Ech={gares[is_ech].cle.nunique()}, Bpv={gares[~is_ech].cle.nunique()})")
    print(f"emprise lon=[{gares.lon.min():.3f}, {gares.lon.max():.3f}] lat=[{gares.lat.min():.3f}, {gares.lat.max():.3f}]")
    print(f"groupes étendus > {SPREAD_MAX_M} m : {spreads[spreads > SPREAD_MAX_M].round().to_dict()}")
    print(f"paires de gares logiques < {NEIGHBOUR_MAX_M} m : {len(pairs)}")
    print("distance gare Ech -> diffuseur (m) :", gares[is_ech].distEchangeurM.describe(percentiles=[.5, .9, .99]).round().to_dict())
    print(f"points à arbitrer : {gares.aArbitrer.sum()}")
    print(f"alias : {len(aliases)}")


if __name__ == "__main__":
    main()
