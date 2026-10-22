"""Génère observability/grafana/dashboards/supervision.json (tableau de bord provisionné, non modifiable depuis l'interface).

Usage : python3 observability/grafana/build_dashboard.py
Toutes les requêtes ciblent la source de données Prometheus (uid « prometheus »).
"""
import json
from pathlib import Path

DS = {"type": "prometheus", "uid": "prometheus"}
OUT = Path(__file__).parent / "dashboards" / "supervision.json"
panel_id = 0


def target(expr, legend="", ref="A"):
    return {"datasource": DS, "expr": expr, "legendFormat": legend, "refId": ref}


def base(kind, title, x, y, w, h, targets, unit=None, description=None):
    global panel_id
    panel_id += 1
    panel = {"id": panel_id, "type": kind, "title": title, "datasource": DS, "targets": targets,
             "gridPos": {"x": x, "y": y, "w": w, "h": h}, "fieldConfig": {"defaults": {}, "overrides": []}, "options": {}}
    if unit:
        panel["fieldConfig"]["defaults"]["unit"] = unit
    if description:
        panel["description"] = description
    return panel


def stat(title, expr, x, w=4, unit=None, thresholds=None, mappings=None, description=None):
    panel = base("stat", title, x, 0, w, 4, [target(expr)], unit, description)
    defaults = panel["fieldConfig"]["defaults"]
    steps = [{"color": "green", "value": None}] + [{"color": c, "value": v} for c, v in (thresholds or [])]
    defaults["thresholds"] = {"mode": "absolute", "steps": steps}
    defaults["color"] = {"mode": "thresholds"}
    if mappings:
        defaults["mappings"] = [{"type": "value", "options": {str(k): {"text": t, "color": c, "index": i}
                                                              for i, (k, t, c) in enumerate(mappings)}}]
    panel["options"] = {"colorMode": "background", "graphMode": "none", "reduceOptions": {"calcs": ["lastNotNull"]},
                        "textMode": "value"}
    return panel


def series(title, targets, x, y, w=12, h=8, unit=None, description=None, stack=False):
    panel = base("timeseries", title, x, y, w, h, targets, unit, description)
    panel["fieldConfig"]["defaults"]["custom"] = {"lineWidth": 1, "fillOpacity": 12, "showPoints": "never",
                                                  "stacking": {"mode": "normal" if stack else "none"}}
    panel["options"] = {"legend": {"displayMode": "list", "placement": "bottom"}, "tooltip": {"mode": "multi"}}
    return panel


panels = [
    stat("Fraîcheur", "toll_freshness_status", 0, mappings=[(0, "LIVE", "green"), (1, "RATTRAPAGE", "orange"), (2, "PÉRIMÉ", "red")],
         thresholds=[("orange", 1), ("red", 2)], description="État global : aucun événement traité depuis 60 s = périmé."),
    stat("Retard du watermark", "toll_watermark_lag_seconds", 4, unit="s", thresholds=[("orange", 30), ("red", 60)],
         description="Écart entre l'horloge et l'heure de l'événement le plus récent traité."),
    stat("Retard Kafka (messages)", "toll_consumer_lag", 8, unit="short", thresholds=[("orange", 1000), ("red", 5000)]),
    stat("Gares périmées", "toll_stations_stale", 12, thresholds=[("orange", 100), ("red", 400)],
         description="Gares sans passage depuis 15 minutes (relatif au watermark)."),
    stat("Clients SSE", "sse_clients", 16, thresholds=[("orange", 400), ("red", 450)]),
    stat("Alertes en cours", 'count(ALERTS{alertstate="firing"}) or vector(0)', 20, thresholds=[("orange", 1), ("red", 3)]),

    series("Événements traités (par résultat, /s)",
           [target('sum by (result) (rate(toll_events_total[1m]))', "{{result}}")], 0, 4, unit="ops", stack=True,
           description="applied : compté ; correction : en retard mais corrigé dans l'historique ; duplicate : ignoré ; quarantined : nom de gare inconnu ; too_late : au-delà de l'horizon."),
    series("Messages rejetés (par motif, /s)",
           [target('sum by (reason) (rate(toll_events_rejected_total[1m]))', "{{reason}}")], 12, 4, unit="ops",
           description="Publiés sur toll-events.rejected, sans le message brut."),
    series("Flux origine-destination (par statut, /s)",
           [target('sum by (status) (rate(toll_od_total[1m]))', "{{status}}")], 0, 12, unit="ops", stack=True,
           description="RECORDED : flux observé ; OPEN_SYSTEM : sortie en système ouvert (pas d'origine attendue) ; ENTRY_MISSING : origine absente en système fermé ; ENTRY_UNKNOWN : gare d'entrée inconnue."),
    series("Retards (watermark et consommateur)",
           [target("toll_watermark_lag_seconds", "watermark (s)"), target("toll_consumer_lag", "Kafka (messages)", "B")], 12, 12),
    series("File de l'écrivain et fenêtre de déduplication",
           [target("toll_writer_queue", "file de l'écrivain"), target("toll_dedup_entries", "identifiants dédupliqués", "B")], 0, 20),
    series("Point de reprise",
           [target("toll_checkpoint_age_seconds", "âge (s)"), target("toll_checkpoint_bytes / 1000", "taille (ko)", "B")], 12, 20,
           description="Un point de reprise toutes les 60 s ; échec = alerte PointDeReprisEnEchec."),
    series("Tas JVM",
           [target('sum(jvm_memory_used_bytes{area="heap"})', "utilisé"), target('sum(jvm_memory_max_bytes{area="heap"})', "maximum", "B")],
           0, 28, unit="bytes"),
    series("CPU du processus et connexions base",
           [target("process_cpu_usage", "CPU (0 à 1)"), target('hikaricp_connections_active{pool="HikariPool-1"}', "connexions actives", "B")], 12, 28),
    series("Couverture et rapprochement des flux O/D (%)",
           [target("100 * toll_od_origin_known_ratio", "sorties en système fermé avec origine connue"),
            target("100 * toll_od_reconciliation_gap_ratio", "écart sorties des gares / issues O/D", "B")], 0, 36, unit="percent",
           description="Fenêtre d'une heure. L'écart doit rester nul ; critère d'acceptation de la roadmap : ± 0,5 %."),
    series("Requêtes HTTP (hors métriques, /s)",
           [target('sum by (uri) (rate(http_server_requests_seconds_count{uri!~"/actuator.*"}[1m]))', "{{uri}}")], 12, 36, unit="reqps"),
]

dashboard = {
    "uid": "supervision-gares",
    "title": "Supervision des gares de péage",
    "tags": ["peage", "kafka", "supervision"],
    "timezone": "Europe/Paris",
    "refresh": "15s",
    "schemaVersion": 41,
    "version": 1,
    "time": {"from": "now-1h", "to": "now"},
    "editable": False,
    "panels": panels,
    "templating": {"list": []},
    "annotations": {"list": []},
}
OUT.write_text(json.dumps(dashboard, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"{OUT} : {len(panels)} panneaux")
