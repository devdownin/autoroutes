# Docker Compose

Un seul fichier, `compose.yaml`, décrit toute la pile. Les profils choisissent ce qui démarre.

## Démarrage rapide

```bash
cp .env.example .env                    # secrets locaux ; COMPOSE_PROFILES=full par défaut
docker compose up -d --build            # simulateur → Kafka → backend → SSE → frontend
# → http://localhost:8080
```

Avec la supervision (Prometheus, Alertmanager et Grafana) : mettre `COMPOSE_PROFILES=full,monitoring` dans `.env`, ou passer
`--profile full --profile monitoring`. Grafana : http://localhost:3000 (utilisateur `admin`, mot de passe `GRAFANA_PASSWORD`) ; Alertmanager : http://localhost:9093.

![Tableau de bord Grafana](img/grafana.png)

*Tableau de bord provisionné, sur la pile en fonctionnement avec le simulateur (80 événements par seconde).*

## Profils

| Profil | Services | Usage |
|---|---|---|
| `full` | `simulator`, `kafka`, `kafka-init`, `postgres`, `backend`, `frontend-live` | Pile applicative complète. Les événements sont **simulés** (marqués `simulated: true`) |
| `monitoring` | `prometheus`, `alertmanager`, `grafana` | Métriques, 14 alertes acheminées, tableau de bord. À combiner avec `full` |
| `auth` | `keycloak` | Keycloak (OIDC) de développement, royaume `supervision` importé. Avec `SUPERVISION_PROFILE=auth`, la connexion devient obligatoire pour le backend. À combiner avec `full` |
| `demo` | `frontend` | Interface seule, flux simulé dans le navigateur, sans backend (bandeau « données simulées »). Exclusif avec `full` : même port |
| `infra` | `kafka`, `kafka-init`, `postgres` | Développer le backend ou le simulateur hors conteneur (`localhost:29092`, `localhost:5432`) |
| `tiles` | `tiles` (tâche ponctuelle) | Produire le fond de carte et le graphe routier |

`--profile` sur la ligne de commande **remplace** `COMPOSE_PROFILES` : `docker compose --profile demo up -d` ne démarre que la démonstration.

## Ports

| Port | Service | Exposition |
|---|---|---|
| 8080 | Frontend (nginx : application, tuiles, relais de l'API et du SSE) | toutes interfaces |
| 8180 | Keycloak (profil `auth`) | `127.0.0.1` |
| 3000 | Grafana | `127.0.0.1` (`GRAFANA_BIND=0.0.0.0` pour l'ouvrir) |
| 8081 | API du backend, Actuator (`/actuator/health`, `/actuator/prometheus`) | `127.0.0.1` |
| 9090 | Prometheus | `127.0.0.1` |
| 9093 | Alertmanager (profil `monitoring`) | `127.0.0.1` |
| 29092 | Kafka, listener externe | `127.0.0.1` |
| 5432 | PostgreSQL | `127.0.0.1` |

Les ports se changent dans `.env` (`FRONTEND_PORT`, `BACKEND_PORT`, `KAFKA_EXTERNAL_PORT`, `POSTGRES_PORT`, `PROMETHEUS_PORT`, `ALERTMANAGER_PORT`, `GRAFANA_PORT`).
Entre conteneurs, les services se joignent par leur nom (`kafka:9092`, `postgres:5432`, `backend:8080`).

## Configuration (`.env`)

| Variable | Rôle | Défaut |
|---|---|---|
| `COMPOSE_PROFILES` | Profils démarrés par `docker compose up` | `full` |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL (**obligatoire**) | `changez-moi` |
| `GRAFANA_PASSWORD` | Mot de passe de `admin` dans Grafana (**obligatoire**) | `changez-moi` |
| `SIMULATOR_RATE` | Événements simulés par seconde | `80` |
| `VITE_BASEMAP_URL`, `VITE_MOTORWAYS_URL`, `VITE_GLYPHS_URL`, `VITE_SPRITE_URL` | Ressources cartographiques, **intégrées au frontend à la construction**. Vides = fond neutre sans libellés | tuiles locales (`/tiles/…`) |
| `SUPERVISION_PROFILE` | `auth` : connexion OIDC obligatoire (profil Spring `auth`). Vide : sans authentification | vide |
| `KEYCLOAK_ADMIN_PASSWORD`, `SUPERVISION_CLIENT_SECRET`, `KEYCLOAK_VIEWER_PASSWORD`, `KEYCLOAK_ADMIN_USER_PASSWORD` | Secrets de Keycloak et des utilisateurs de développement `viewer` et `admin` (exigés par Compose pour tous les profils) | `changez-moi` |
| `ASSIGNMENT_GRAPH_FILE` | Graphe routier (chemin dans le conteneur, ex. `/app/graph/graph-AAAAMMJJ.json`) : active la charge estimée des tronçons. Vide = inactive | vide |
| `PROTOMAPS_BUILD`, `TILES_BBOX`, `TILES_MAXZOOM`, `OSM_MODE`, `REGION_JOBS` | Profil `tiles`. `TILES_MAXZOOM` : 12 par défaut (**retenu**, 1,2 Go) ; 14 donne environ 4,9 Go. `OSM_MODE` : `single` (Geofabrik) ou `regions` (22 extraits d'OpenStreetMap France, `REGION_JOBS` téléchargements en parallèle) | voir ci-dessous |
| `ALERTMANAGER_PORT` | Port publié d'Alertmanager (profil `monitoring`) | `9093` |

Les secrets sans valeur par défaut (`POSTGRES_PASSWORD`, `GRAFANA_PASSWORD` et ceux de Keycloak) sont exigés par Compose pour **tous** les profils (l'interpolation est évaluée sur tout le fichier) :
`.env.example` fournit des valeurs de développement à changer partout ailleurs.

## Fond de carte

Sans tuiles, définir les quatre variables `VITE_*` vides dans `.env` (fond neutre). Pour produire le fond (accès Internet requis) :

```bash
# PROTOMAPS_BUILD = date AAAAMMJJ d'un build listé sur https://maps.protomaps.com/builds
echo "PROTOMAPS_BUILD=20261021" >> .env
docker compose --profile tiles run --rm tiles          # écrit cartographie/out/tiles et cartographie/out/basemaps-assets
# retirer les VITE_* vides de .env, puis reconstruire le frontend :
docker compose up -d --build frontend-live
```

Le dossier `cartographie/out/` est monté en lecture seule dans nginx : les tuiles sont servies par requêtes HTTP Range, sans serveur de tuiles.

La même tâche produit le **graphe routier** (`cartographie/out/graph/graph-AAAAMMJJ.json`). Pour activer la charge estimée des tronçons, indiquer son chemin dans le conteneur du backend, qui monte `cartographie/out/graph` en lecture seule sur `/app/graph` :

```bash
echo "ASSIGNMENT_GRAPH_FILE=/app/graph/graph-20261022.json" >> .env   # nom du fichier produit
docker compose up -d backend
```

Si Geofabrik n'est pas joignable, `OSM_MODE=regions` télécharge les 22 extraits régionaux d'OpenStreetMap France (`REGION_JOBS` en parallèle), les filtre aux autoroutes puis les supprime. Les polices et sprites viennent de GitHub Pages (`ASSETS_BASE_URL`). Le fond est produit jusqu'à **z12** (1,2 Go), niveau retenu ; `TILES_MAXZOOM=14` donne environ 4,9 Go. Mesures de la première exécution réelle : `docs/increment-4.md`, section 4.

## Durcissement et ressources

- Conteneurs applicatifs (`backend`, `simulator`, `frontend-live`, `frontend`) : système de fichiers racine en **lecture seule** (écritures dans `/tmp`), `no-new-privileges`, utilisateur non root pour le backend et le simulateur.
- Limites de mémoire : backend 1 Go (JVM à 75 %), simulateur 384 Mo, frontend 128 Mo, Kafka 1,5 Go, PostgreSQL 1 Go, Prometheus et Grafana 512 Mo, Alertmanager 128 Mo. Utilisation mesurée avec 80 événements par seconde : backend ≈ 260 Mo, Kafka ≈ 500 Mo, simulateur ≈ 140 Mo, frontend ≈ 8 Mo.
- Journaux `json-file` en rotation (3 fichiers de 10 Mo).
- Ordre de démarrage garanti par `depends_on` + health checks (Kafka, PostgreSQL, backend, Prometheus, Alertmanager, Grafana, frontend).
- Arrêt propre du backend (45 s) : le point de reprise final est écrit avant la sortie.

## Supervision

- **Prometheus** collecte `backend:8080/actuator/prometheus` toutes les 15 s (conservation 15 jours) et évalue `observability/prometheus/alerts.yml` : backend injoignable, données périmées, retard du watermark, rattrapage Kafka persistant, file de l'écrivain saturée, quarantaine > 1 %, entrée inconnue > 2 % des sorties, origine connue < 90 % ou écart de rapprochement O/D > 0,5 %, messages rejetés, point de reprise en échec ou ancien, tas JVM, clients SSE.
- **Alertmanager** reçoit les alertes de Prometheus (`alerting` dans `prometheus.yml`) : regroupement par alerte, répétition toutes les 4 h (1 h pour `critical`), et `BackendDown` inhibe les autres alertes. **Aucun récepteur externe n'est configuré** : renseigner e-mail, webhook ou chat dans `observability/alertmanager/alertmanager.yml` (récepteur `equipe`), les secrets par `url_file` / `password_file` ; `docker compose restart alertmanager`.
- **Grafana** charge sa source de données et le tableau de bord `observability/grafana/dashboards/supervision.json` par provisioning (non modifiable depuis l'interface). Ce fichier est **généré** : modifier `observability/grafana/build_dashboard.py` puis `python3 observability/grafana/build_dashboard.py`.
- Métriques ajoutées pour l'exploitation : `toll_watermark_lag_seconds`, `toll_consumer_lag`, `toll_freshness_status` (0 LIVE, 1 RATTRAPAGE, 2 PÉRIMÉ), `toll_stations_stale`, `toll_checkpoint_age_seconds`, `toll_checkpoint_bytes`, `toll_events_rejected_total{reason}`, en plus de `toll_events_total{result}`, `toll_od_total{status}`, `toll_od_origin_known_ratio`, `toll_od_reconciliation_gap_ratio`, `toll_writer_queue`, `toll_dedup_entries`, `sse_clients`.
- Vérification automatique : `scripts/verify_observability.py` contrôle les cibles, qu'Alertmanager est joint par Prometheus, les 14 règles et que chaque panneau reçoit des données (exécuté par la CI).

## Données et maintenance

```bash
docker compose ps                                   # état et santé
docker compose logs -f backend                      # journaux
docker compose restart backend                      # redémarrage : reprise depuis le point de reprise, sans double comptage
docker compose down                                 # arrêt, données conservées (volumes kafka-data, postgres-data, …)
docker compose down -v                              # arrêt ET suppression des données
docker compose exec -T postgres pg_dump -U supervision supervision > sauvegarde.sql      # sauvegarde de la base
curl -s localhost:8081/api/v1/diagnostic | python3 -m json.tool                          # retard, quarantaine, rejets
```

Après `down -v`, le backend repart sans point de reprise : il relit Kafka depuis minuit (heure de Paris).

## Limites connues

- Kafka est un nœud unique (KRaft, facteur de réplication 1) et les liaisons sont en clair : adapté au développement et à la démonstration, pas à la production telle quelle.
- **Authentification** : sans `SUPERVISION_PROFILE=auth`, le frontend et l'API sont ouverts à qui joint le port 8080 (démonstration, développement). Avec le profil, la connexion OIDC est obligatoire (voir `docs/increment-5.md`). Grafana n'est joignable que depuis la machine par défaut.
- Alertmanager (port 9093, `ALERTMANAGER_PORT`) regroupe les alertes (4 h de répétition, 1 h pour `critical`) et inhibe les autres alertes quand `BackendDown` est actif ; **aucun récepteur externe n'est configuré** : renseigner e-mail, webhook ou chat dans `observability/alertmanager/alertmanager.yml` (récepteur `equipe`, secrets via `url_file`/`password_file`).
- Les sauvegardes de volumes et la rotation des secrets ne sont pas automatisées.
- **Grafana est sous licence AGPL-3.0** (Prometheus : Apache-2.0). L'usage interne sans modification n'impose rien de particulier ; distribuer une version modifiée ou l'offrir en service à des tiers déclenche des obligations : à valider avec le service juridique avant tout autre usage. Le profil `monitoring` est optionnel.
- La chaîne `tiles` a été exécutée de bout en bout sur l'hôte (voir `docs/increment-4.md`, section 4) ; **l'image `cartographie/Dockerfile` n'a pas pu être construite** dans l'environnement de développement (limite de débit de Docker Hub, accès réseau des conteneurs de construction). Les sources ont changé selon l'accessibilité : `OSM_MODE=regions` utilise les extraits régionaux d'OpenStreetMap France quand Geofabrik n'est pas joignable.
- Les images sont construites par `docker compose --build` ; dans l'environnement de développement, `docker build` ne pouvait pas télécharger les dépendances (proxy TLS) et les images locales ont été construites à partir des artefacts. La CI exécute le build complet.
