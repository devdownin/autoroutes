# Incrément 4 — Charge estimée des tronçons

> Graphe OSM → module `assignment`, couche `segments-load`, mention « estimé ».
> Critère de la roadmap : validation métier sur 3 axes. **Non évalué : voir section 5.**

## 1. Ce qui est livré

| Brique | Contenu |
|---|---|
| Graphe (`cartographie/prepare_motorways.py`) | Chaque arête porte désormais `refs` (axes normalisés, `A0007`/`A 7;E 15` → `A7`) et `link` (bretelle), en plus de l'identifiant, des nœuds, de la longueur et de la vitesse. |
| Module `assignment` | `GraphLoader` (version = empreinte SHA-256 du fichier), `RoadGraph` (grille spatiale), `StationAttachment`, `ShortestPaths` (Dijkstra multi-sources en **temps**, cache LRU de 100 000 couples), `AssignmentService` (tout-ou-rien), `AssignmentRunner` (toutes les 10 s, hors de l'écrivain unique). |
| Diffusion et API | Message SSE `segments` (`nature: ESTIMATED`, version du graphe, algorithme `all-or-nothing-fastest-v1`), rejoué aux nouveaux clients ; `GET /api/v1/segments/load` ; `graph` dans `/api/v1/diagnostic` ; jauge `toll_segments_routed_ratio`. |
| Frontend | Le message `segments` alimente le `feature-state` `load` (0 à 1, 95ᵉ centile) de la couche `segments-load` (tirets : estimation) ; seuls les tronçons dont l'intensité change sont réécrits. Panneau « Charge estimée » avec l'avertissement permanent « estimation, pas une mesure ». |
| Compose | `ASSIGNMENT_GRAPH_FILE` (chemin dans le conteneur) et montage de `cartographie/out/graph`. **Sans fichier, la fonction est inactive** : aucun message `segments`, le panneau l'indique. |

## 2. Choix et écarts avec la phase 2

- **Pas de JGraphT** : un Dijkstra de 60 lignes sur tableaux évite une dépendance (et une licence LGPL/EPL) pour un seul algorithme. L'algorithme est versionné (`all-or-nothing-fastest-v1`) ; en changer incrémente la version.
- **Rattachement multi-nœuds** : une gare est reliée à **tous** les nœuds du graphe à moins de 500 m (de son axe si possible), donc aux deux chaussées. Le chemin part du nœud le plus favorable, sans devoir deviner le sens de circulation de la gare.
- **Seuil de diffusion** : un tronçon n'est publié qu'à partir de 3 véhicules ; un tronçon emprunté par un seul flux isolé révélerait ce flux (même règle que les flux O/D).
- **Couverture** : `routedVehicles` / `unroutedVehicles` (gare non rattachée ou sans chemin) sont publiés ; `toll_segments_routed_ratio` la suit.
- Biais documentés (phase 2, 5.4) : un seul itinéraire par flux (approximatif en zone maillée), trajets sans péage invisibles, flux daté de la sortie. Ils sont rappelés dans l'interface.

## 3. Vérifications

| Vérification | Résultat |
|---|---|
| Chemin le plus **rapide** (et non le plus court) choisi ; sommes par tronçon ; seuil de 3 ; sens de chaussée respecté ; gares non rattachées comptées ; axes `A0007` = `A7` ; lecture du graphe et version par contenu | ✅ 6 tests unitaires |
| Frontières entre modules (Spring Modulith) avec le nouveau module | ✅ |
| Intégration (Kafka et PostgreSQL réels, graphe de test) : le flux Montabon → Mont-Choisy est affecté au tronçon du graphe, diagnostic de rattachement | ✅ SupervisionIT |
| Pile complète avec un graphe **de jouet** (une chaîne par axe, sans jonctions, généré pour le test et non conservé) : 662 gares rattachées, 5 sans rattachement, message `segments` reçu, panneau alimenté, aucune erreur console | ✅ (ratio d'affectation de 17 % : attendu sans jonctions entre axes) |
| `prepare_motorways.py` : axes et bretelle exportés | ✅ test unitaire |
| Frontend : écarts d'intensité, normalisation | ✅ 3 tests |

## 4. Premier jeu de données réel (octobre 2026)

La chaîne cartographique a été exécutée de bout en bout, **sans Docker** (outils installés directement : `go-pmtiles` 1.31.2 compilé avec `go install`, `tippecanoe` 2.49 et `osmium-tool` 1.16 issus des paquets Ubuntu 24.04). Geofabrik et les archives de « releases » GitHub n'étant pas joignables depuis l'environnement, trois sources de remplacement ont été utilisées ; `build.sh` les gère désormais (`OSM_MODE=regions`, polices et sprites par GitHub Pages).

| Étape | Source | Résultat |
|---|---|---|
| Fond de carte | build Protomaps du 21 octobre 2026, bbox France, z0 à 12 | `france.pmtiles`, 1,2 Go (à z14 : 4,9 Go, estimé) |
| Autoroutes OSM | 22 extraits régionaux d'OpenStreetMap France, téléchargés en parallèle (≈ 10 Mo/s au total), filtrés à `motorway` et `motorway_link`, puis supprimés | 58 282 voies distinctes (2 043 figurent dans deux régions, entières : dédoublonnées par identifiant) |
| Graphe et tronçons | `prepare_motorways.py` | **61 367 tronçons** (25 395 concédés selon la règle H21), **58 974 nœuds**, **62 213 arêtes**, 28 318 km de chaussée, graphe de 7,3 Mo |
| Tuiles des tronçons | `tippecanoe` | `motorways.pmtiles`, 14 Mo |
| Polices, sprites | GitHub Pages de `protomaps/basemaps-assets` | Noto Sans Regular, Medium, Italic (cette dernière demandée par le style) ; sprites sombres et clairs |

### Qualité du graphe

- **Connexité** : 45 composantes, dont une de 55 170 nœuds (93,5 %) ; les autres sont de petits tronçons isolés (autoroutes urbaines, portions sans raccord motorway). Le réseau est **dirigé** (une chaussée par sens) : 48 % des nœuds seulement sont dans la plus grande composante fortement connexe, ce qui n'empêche pas un chemin d'exister entre deux gares (les barrières pleine voie, sur une seule chaussée, sont hors de cette composante).
- **Rattachement des gares** (critère de la phase 2, < 500 m) : **662 gares sur 667**, distance médiane 13 m, 95ᵉ centile 104 m. Les 5 autres sont sur des **routes nationales** (N523, N159, N1029, N182) ou à 613 m (A0006, barrière) : le graphe ne contient que les `motorway`, pas les voies express classées `trunk`.

### Mesures sur la pile complète (simulateur à 80 événements/s, une heure de flux)

| Mesure | Valeur |
|---|---|
| Tronçons chargés (≥ 3 véhicules) | environ 23 900 |
| Part des véhicules O/D affectés à un chemin | **91,5 %** (le reste : gares non rattachées et couples sans chemin dirigé) |
| Durée d'un cycle d'affectation | moyenne 0,46 s, maximum 0,74 s (cycle de 10 s) |
| Chemins en cache | 3 486 couples après 3 minutes (limite 100 000) |
| Cohérence O/D (incrément 3) | écart 0 |
| Rendu | réseau, noms des autoroutes, tronçons chargés visibles ; E2E réels verts (7 scénarios dont la charge des tronçons) ; une requête 404 corrigée (police italique) |

Nouveaux indicateurs : `toll_segments_compute_seconds` (durée d'un cycle) et `toll_segments_path_cache` (chemins en cache).

## 5. Reste à faire

- **Critère de la roadmap (validation métier sur 3 axes) : non évalué.** Les charges calculées sont celles d'un trafic **simulé** : la comparaison à des comptages réels exige les événements réels (Q4) et un jeu de comptages de référence.
- **H21** (drapeau `concede`) : 25 395 tronçons sur 61 367 sont classés concédés. Revue sur les sections limites, à partir du graphe réel : A7 concédée de Pierre-Bénite (45,70 °N) à Septèmes-les-Vallons (43,40 °N, 5,31 °E), les tronçons urbains de Marseille (≥ 43,40 °N, 5,34 °E) sont non concédés ; A6 concédée à partir de 48,62 °N (Évry, 2,42 °E), la section parisienne est non concédée. Les limites sont cohérentes avec le réseau concédé ; un contrôle visuel sur la carte reste utile mais aucune exception n'est à verser.
- **Voies hors `motorway`** : les gares sur routes nationales ne sont pas rattachées, et les raccords par voies express (`trunk`) manquent au graphe. Les inclure rattacherait les 5 gares et réduirait les couples sans chemin ; c'est un choix de périmètre (licence ODbL, taille du graphe) à valider.
- **Fond de carte : z12 retenu** (1,2 Go) ; au-delà, MapLibre agrandit les tuiles. Passer à z14 (4,9 Go) reste possible avec `TILES_MAXZOOM=14`.
- **Image `cartographie/Dockerfile`** (Ubuntu 24.04 + `go install`) : non construite ici (limite de débit de Docker Hub puis accès réseau des conteneurs de construction) ; les mêmes commandes ont été exécutées avec succès sur l'hôte.
- Q10 (ODbL) : le graphe dérivé d'OSM est une base dérivée ; sa diffusion hors de l'organisation l'oblige sous ODbL.
- L'historique des charges n'est pas conservé : la charge se recalcule à partir de `od_hour` (D18). La relecture n'affiche donc pas la charge des tronçons.
