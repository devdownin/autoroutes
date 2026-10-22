"""Vérifie la chaîne de supervision d'une pile Compose en marche (profils full + monitoring).

Contrôles : cibles Prometheus en bonne santé, Alertmanager joint par Prometheus, règles d'alerte chargées et saines, aucune alerte critique déclenchée,
tableau de bord Grafana provisionné, et CHAQUE requête de CHAQUE panneau renvoie des données (attente jusqu'à --timeout :
les taux de variation exigent quelques minutes de collecte).

Usage : GRAFANA_PASSWORD=... python3 scripts/verify_observability.py [--timeout 300]
Variables : PROMETHEUS_URL (http://localhost:9090), GRAFANA_URL (http://localhost:3000), GRAFANA_PASSWORD.
"""
import argparse
import base64
import json
import os
import sys
import time
import urllib.parse
import urllib.request

PROMETHEUS = os.environ.get("PROMETHEUS_URL", "http://localhost:9090")
GRAFANA = os.environ.get("GRAFANA_URL", "http://localhost:3000")
AUTH = "admin:" + os.environ.get("GRAFANA_PASSWORD", "changez-moi")
EXPECTED_RULES = 14


def get(url, auth=None):
    request = urllib.request.Request(url)
    if auth:
        request.add_header("Authorization", "Basic " + base64.b64encode(auth.encode()).decode())
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def failures_once():
    problems = []
    targets = get(f"{PROMETHEUS}/api/v1/targets")["data"]["activeTargets"]
    jobs = {t["labels"]["job"]: t["health"] for t in targets}
    problems += [f"cible {job} : {health}" for job, health in jobs.items() if health != "up"]
    if "backend" not in jobs:
        problems.append("cible backend absente")

    if not get(f"{PROMETHEUS}/api/v1/alertmanagers")["data"]["activeAlertmanagers"]:
        problems.append("aucun Alertmanager joint par Prometheus : les alertes ne sont pas acheminées")

    groups = get(f"{PROMETHEUS}/api/v1/rules")["data"]["groups"]
    rules = [rule for group in groups for rule in group["rules"]]
    if len(rules) != EXPECTED_RULES:
        problems.append(f"{len(rules)} règles chargées au lieu de {EXPECTED_RULES}")
    problems += [f"règle {r['name']} : {r['health']}" for r in rules if r["health"] != "ok"]
    problems += [f"alerte critique déclenchée : {r['name']}" for r in rules
                 if r["state"] == "firing" and r.get("labels", {}).get("severity") == "critical"]

    dashboard = get(f"{GRAFANA}/api/dashboards/uid/supervision-gares", AUTH)["dashboard"]
    sources = {s["uid"] for s in get(f"{GRAFANA}/api/datasources", AUTH)}
    if "prometheus" not in sources:
        problems.append("source de données Grafana « prometheus » absente")
    for panel in dashboard["panels"]:
        for target in panel["targets"]:
            result = get(f"{PROMETHEUS}/api/v1/query?query=" + urllib.parse.quote(target["expr"]))["data"]["result"]
            if not result:
                problems.append(f"panneau « {panel['title']} » : aucune donnée pour {target['expr']}")
    return problems, len(dashboard["panels"]), len(rules)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeout", type=int, default=300)
    deadline = time.monotonic() + parser.parse_args().timeout
    while True:
        try:
            problems, panels, rules = failures_once()
        except OSError as error:
            problems, panels, rules = [f"service injoignable : {error}"], 0, 0
        if not problems:
            print(f"OK : cibles saines, {rules} règles saines, {panels} panneaux alimentés")
            return 0
        if time.monotonic() >= deadline:
            print("ÉCHEC :\n  - " + "\n  - ".join(problems))
            return 1
        time.sleep(10)


if __name__ == "__main__":
    sys.exit(main())
