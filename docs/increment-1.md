# Incrément 1 — MVP temps réel

> Chaîne complète : simulateur → Kafka → backend (écrivain unique, points de reprise) → SSE → frontend.
> Conforme aux dossiers des phases 2 et 3, avec les écarts listés en section 5.

## 1. Démarrer

```bash
cp .env.example .env                                    # mot de passe PostgreSQL ; variables VITE_* vides sans tuiles
docker compose --profile full up -d --build             # http://localhost:8080 (API directe : http://localhost:8081)
```

Développement local (JDK 21+ ; la cible est Java 25) :

```bash
docker compose --profile infra up -d                    # Kafka localhost:29092, PostgreSQL localhost:5432
cd backend   && DATABASE_PASSWORD=changez-moi mvn -Djava.version=21 spring-boot:run
cd simulator && mvn -Djava.version=21 spring-boot:run   # SIMULATOR_RATE=200 pour monter en charge
cd frontend  && npm run dev                             # http://localhost:5173, /api relayé vers :8080
```

## 2. Ce qui a été livré

| Brique | Contenu |
|---|---|
| **Backend** (`backend/`) | Spring Boot 4.1, 5 modules vérifiés par Spring Modulith (`referentiel`, `ingestion`, `aggregation`, `diffusion`, `api`). Les dépendances entre modules passent par deux ports : `TollEventSink` (ingestion → agrégation) et `StreamPublisher` (agrégation → diffusion). |
| Ingestion | `@KafkaListener` démarré **après** restauration du point de reprise. Positionnement initial sur les offsets du point de reprise, sinon sur **minuit à Paris** (`seekToTimestamp`). Parsing à liste d'autorisation dans les threads de consommation, puis file bornée vers l'écrivain (contre-pression). Les rejets partent sur `toll-events.rejected` **sans le message brut**. Appartenance statique au groupe. |
| Agrégation | `AggregationWriter` : écrivain unique, tics à 1 s (deltas), 10 s (O/D, fraîcheur) et 60 s (point de reprise). Le point de reprise est **cohérent** : état, offsets, fenêtre de déduplication et watermark sont capturés au même instant puis écrits hors du chemin critique. Format binaire versionné, gzip avec contrôle CRC. Point de reprise final à l'arrêt. |
| Quarantaine | Les noms inconnus sont stockés en PostgreSQL (champs autorisés seulement) et **rejoués automatiquement** après `POST /api/v1/admin/aliases`. Le rejeu ne fait pas progresser le watermark. Le diagnostic propose des suggestions (Levenshtein), jamais appliquées automatiquement. |
| Diffusion | SSE `GET /api/v1/stream` : snapshot puis deltas `epoch:seq`. Reprise par `Last-Event-ID` sur les 300 derniers deltas. File bornée par client : un client saturé reçoit `resync`. Heartbeat toutes les 15 s, limite de 500 clients, threads virtuels. |
| API | `GET /api/v1/referentiel/stations` (GeoJSON + ETag/304), `/snapshot`, `/stations/{id}`, `/od`, `/diagnostic` ; `POST /admin/aliases` (422 si la table est ambiguë ou référence une gare inconnue), `POST /admin/quarantine/replay` ; Actuator : santé (readiness = écrivain actif et rattrapage terminé), Prometheus. |
| **Simulateur** (`simulator/`) | Événements du contrat 0.1, toujours `simulated: true`. Gares pondérées par leur nombre de voies ; noms tirés de la table d'alias ; trajets selon un **modèle gravitaire** ; système ouvert pour les barrières pleine voie ; doublons (1 %), retards (1 %, jusqu'à 30 min), messages invalides (0,2 %) et noms inconnus (0,2 %) paramétrables ; graine fixe possible. |
| **Déploiement** | `backend/Dockerfile` et `simulator/Dockerfile` multi-étapes (JRE 25, utilisateur non root, couches Spring Boot, health check sans curl) ; profil Compose `full` ; frontend de production paramétrable (URL des tuiles en arguments de build). |

## 3. Vérifications

| Vérification | Résultat |
|---|---|
| Tests unitaires backend (dont `ModularityTest`, codec du point de reprise, politique de fraîcheur, référentiel réel, suggestions) | ✅ 56 |
| **Tests d'intégration** Testcontainers (Kafka 4.1 et PostgreSQL 17 réels) : comptage unique malgré un doublon, quarantaine puis libération par import d'alias, rejet sans message brut, O/D enregistré, SSE snapshot → delta, reprise `Last-Event-ID` sans snapshot, snapshot si l'epoch est inconnu, ETag/304 | ✅ 3 |
| **Redémarrage** (`RestartRecoveryIT`) : 90 événements + 10 doublons, arrêt, 50 nouveaux + 5 doublons anciens, redémarrage → **exactement 140**, nouvel epoch | ✅ 1 |
| Tests du simulateur (contrat, système ouvert ou fermé, taux d'anomalies, modèle gravitaire) | ✅ 4 |
| Frontend : unitaires inchangés | ✅ 43 |
| **E2E réels** (`frontend/e2e/live.spec.ts`, `E2E_LIVE=1`) contre le profil `full` derrière nginx : plus de 600 gares dessinées, sans bandeau de simulation, indicateurs non nuls | ✅ |
| **Latence de bout en bout** (horloge du navigateur − watermark affiché, 30 échantillons) | ✅ **p50 = 1 s, p95 = 1 s** (objectif ≤ 3 s) |
| Arrêt propre puis redémarrage (local et `docker compose restart backend`) | ✅ totaux identiques (9 709 / 9 709 ; 3 605 / 3 605) |
| **Crash** (`kill -9`) entre deux points de reprise, puis redémarrage | ✅ totaux identiques (13 735 / 13 735 ; 16 417 / 16 417) ; rattrapage en **6 s** grâce à l'appartenance statique (20 à 45 s sans elle) |
| Simulation à 80 évt/s pendant plusieurs minutes | ✅ statut `LIVE`, retard du consommateur à 0, point de reprise ≈ 18 Ko |

Commandes :
- backend : `mvn -Djava.version=21 verify` (Docker requis) ;
- simulateur : `mvn -Djava.version=21 test` ;
- frontend : `npm test`, puis `E2E_LIVE=1 E2E_BASE_URL=http://localhost:8080 npx playwright test e2e/live.spec.ts`.

## 4. Défauts trouvés et corrigés pendant l'incrément

- Le CRC gzip n'était pas vérifié : un point de reprise corrompu pouvait être relu sans erreur. Le décodage lit désormais jusqu'à la fin du flux (test `rejectsCorruptedPayload`).
- L'identifiant du `@KafkaListener` servait de groupe de consommateurs (`toll-events`) : corrigé avec `idIsGroup = false`.
- Après un crash, le rattrapage attendait l'expiration de session de l'ancien membre (≈ 45 s) : réglé par l'appartenance statique (`group.instance.id`).
- L'arrêt pouvait durer 30 s quand la base était injoignable : délai de connexion Hikari réduit à 5 s.
- Spring résout les propriétés `Path` comme des ressources et refuse `../` : chemins passés en `String`.
- Les groupes de propriétés imbriqués non renseignés valaient `null` : ajout de `@DefaultValue` sur les groupes.
- Dépendance circulaire entre l'écrivain et le listener : cassée par `ResumeOffsets`.

## 5. Écarts par rapport aux dossiers

| Prévu | Réalisé | Raison |
|---|---|---|
| `ErrorHandlingDeserializer` | `StringDeserializer` seul | La désérialisation d'une chaîne n'échoue pas ; la validation se fait dans le parseur |
| Historique (`station_minute`…) vidé dans la transaction du point de reprise | Point de reprise seul | L'historique relève de l'incrément 2 (roadmap) ; le verdict `CORRECTION` est déjà compté |
| Fraîcheur par gare fondée sur l'historique | Seuil fixe de 15 min relatif au watermark | Prévu au MVP (phase 2, section 5.1) |
| Groupe de consommateurs dynamique | Appartenance statique | Reprise après crash en 6 s au lieu de 20 à 45 s |
| Chaîne cartographique exécutée | **Non exécutée** | Protomaps, Geofabrik et GitHub sont inaccessibles depuis l'environnement de développement ; le frontend `full` tourne sans fond (variables `VITE_*` vides) |

## 6. Limites connues et suites

- **Q14 répondue** : les événements portent les noms de `gares-peage-2025.csv`. `ReferentielNamesResolutionTest` vérifie que les 813 noms bruts (dont la variante avec tabulation) sont résolus vers une gare logique existante. La quarantaine ne devrait donc capter que des gares nouvelles ou des erreurs de saisie : alerter dès le premier événement en quarantaine (`toll_events_total{result="quarantined"}` > 0).
- Les fenêtres glissantes avancent avec le watermark : sans aucun événement, elles se figent, et le statut passe à `STALE` au bout de 60 s, ce qui est voulu et affiché.
- La liste `staleStations` est envoyée en entier toutes les 10 s (≈ 12 Ko quand toutes les gares sont périmées). À passer en différentiel si la bande passante compte.
- Le message `freshness: CATCHING_UP` ne suspend pas encore les impulsions côté frontend (évolution notée en phase 3, section 4.4).
- Une seule instance active (décision D10) : la disponibilité dépend du redémarrage, mesuré à 6 s (Q15).
- `docker build` de ces images n'a pas pu être exécuté ici à cause du proxy TLS de l'environnement (dépendances Maven/npm). Les images ont été construites à partir des artefacts locaux, avec la même étape finale. À valider en CI.
