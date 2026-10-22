# Dossier de cadrage — Phase 1/3

> Visualisation temps réel de l'activité des gares de péage du réseau autoroutier concédé.
> Produit à partir de `prompts/phase-1-cadrage.md`. Référentiel analysé : millésime du 01/01/2025.
> Script d'analyse reproductible : `scripts/analyse_referentiel.py`.

**Légende.** **[F]** : fait vérifié (fichiers du dépôt ou source citée). **[H]** : hypothèse, avec son impact si elle est fausse. **[D]** : décision proposée, à valider. **[Q]** : question ouverte.

---

## 1. Synthèse

1. Le référentiel décrit **1 266 points de péage**, pas des gares au sens de l'exploitation. Un regroupement automatique produit environ **667 gares logiques** (528 gares d'échangeur, 139 barrières pleine voie). Une soixantaine de cas ambigus restent à arbitrer à la main. **[F]**
2. **Aucun identifiant métier** dans le référentiel. Sans table de correspondance avec les codes de gare des événements Kafka, aucun événement ne peut être positionné. C'est le **premier bloquant**. **[F]**
3. Coordonnées en Lambert 93 (EPSG:2154). La reprojection en WGS84 est validée : toutes les gares tombent dans l'emprise de la France métropolitaine continentale (Corse et outre-mer absents, ce qui est normal pour le réseau concédé). **[F]**
4. 100 % des gares d'échangeur sont à moins de 2,1 km d'un échangeur du référentiel (médiane 346 m). Le rattachement d'une gare à son axe et à son échangeur est donc automatisable. **[F]**
5. Les exemples Kafka, la volumétrie et la présence de la gare d'entrée dans les sorties **n'ont pas été fournis**. Tout ce qui suit sur ces sujets est un **contrat provisoire** ou une **hypothèse**. **[F]**
6. Deux scénarios sont conçus en parallèle. **A** : la sortie porte la gare d'entrée, donc flux origine-destination observés et charge des tronçons estimée. **B** : elle ne la porte pas, donc activité par gare et historique seulement. Aucun appariement heuristique entrée/sortie. **[D]**
7. Géométrie routière : **OpenStreetMap** pour le fond de carte et le tracé des autoroutes, via des tuiles **PMTiles** auto-hébergées. **BD TOPO** (IGN) en alternative si l'obligation de partage à l'identique de l'ODbL pose problème. ROUTE 500 est abandonné : dernière édition en 2021. **[D]**
8. **RGPD** : aucune donnée personnelle ne sort du module d'ingestion. Le navigateur ne reçoit que des agrégats par gare. **[D]**
9. **MVP** : niveau 1 (activité par gare) + synchronisation snapshot/deltas + carte complète + simulateur + vue diagnostic. Il ne dépend que de la table de correspondance des codes de gare. **[D]**
10. Questions bloquantes, par ordre d'impact : table de correspondance des codes, gare d'entrée dans les sorties, exemples d'événements, volumétrie, données personnelles (section 9).

---

## 2. Registre faits / hypothèses / décisions

| # | Type | Énoncé | Impact si faux / à valider par |
|---|---|---|---|
| F1 | F | CSV UTF-8, séparateur `;`, CRLF, décimales avec une virgule, 1 266 gares et 1 086 échangeurs, aucune valeur vide sur les colonnes clés | — |
| F2 | F | Coordonnées Lambert 93 ; `z` toujours à 0 | — |
| F3 | F | Aucun identifiant de gare ; la clé `route+pr+abs+cote` est unique sur les deux fichiers | — |
| F4 | F | Les DBF des shapefiles sont mal décodés (`?changeur`, fichier `.cpg` absent) | Les CSV font foi, les shapefiles sont ignorés |
| F5 | F | Le projet QGIS référence des shapefiles ROUTE 500 absents du dépôt ; le `.mxd` est au format ArcGIS, propriétaire | Fichiers inutiles pour le projet |
| F6 | F | Licence affichée sur data.gouv.fr : gares sous **ODC-By** (Open Data Commons Attribution), échangeurs sous **Licence Ouverte** | Les deux imposent l'attribution ; à revérifier sur la page en ligne avant mise en production |
| F7 | F | ROUTE 500 : dernière édition en 2021, réseau repris dans BD CARTO ; BD TOPO mise à jour chaque trimestre | — |
| H1 | H | Les événements portent un code de gare propre à l'exploitant, différent de la clé du référentiel | Si un code commun existe, la section 4.3 se simplifie |
| H2 | H | La sortie en système fermé porte la gare d'entrée (scénario A) | Si faux : scénario B, les niveaux 2 et 3 sont abandonnés |
| H3 | H | Un événement correspond à un passage de véhicule (`vehicleCount = 1` par défaut) | Si les événements sont pré-agrégés, le modèle d'agrégation change |
| H4 | H | Volumétrie provisoire : 50 / 300 / 2 000 événements par seconde (nominal / pointe / stress) | Dimensionnement de la phase 2 |
| H5 | H | Les événements peuvent contenir une plaque, un badge ou un moyen de paiement | Si faux : les contraintes RGPD s'allègent |
| H6 | H | Clé de partition Kafka = code de gare | Si faux : l'ordre par gare n'est pas garanti, ce qui reste tolérable (agrégation commutative) |
| D1 | D | Modèle à deux niveaux : point de péage / gare logique (section 4) | Métier |
| D2 | D | Gares logiques = proposition automatique + table de regroupement validée par le métier et versionnée | Métier |
| D3 | D | Aucun appariement heuristique d'une entrée et d'une sortie | — |
| D4 | D | OSM + PMTiles pour la géométrie et le fond de carte | Juridique (ODbL) |
| D5 | D | Instants stockés et transmis en UTC ; affichage en `Europe/Paris` | — |
| D6 | D | Pas de donnée personnelle au-delà du module d'ingestion | DPO |

---

## 3. Analyse du référentiel (1.1)

### 3.1 `gares-peage-2025.csv` — 1 266 lignes **[F]**

| Colonne | Contenu observé | Usage |
|---|---|---|
| `dateReferentiel` | `01/01/2025` (une seule valeur) | Version du référentiel |
| `route` | 534 valeurs. Trois formes : **code de bretelle** `DDA<4 chiffres><2 chiffres>CD` (985 lignes, ex. `01A903905CD`), **axe** `A0432` (271 lignes), **nationale** `N…` (6 lignes). Une forme atypique : `69A9007N05CD` | Partie de la clé ; rattachement indirect à l'axe |
| `pr`, `abs`, `cumul` | Point de repère, abscisse en mètres depuis ce PR, abscisse cumulée | Partie de la clé (`pr`, `abs`) |
| `depPr` | 72 départements | Filtre géographique |
| `concessionPr` | `C` (1 264) / `N` (2 : « Gares de peage de saint germain », A75) | Information |
| `x`, `y` | Lambert 93, toutes renseignées, aucun doublon | Position |
| `cote` | `D` (1 132) / `G` (134) | Partie de la clé, sens |
| `nomGare` | **813 noms** pour 1 266 lignes ; graphies hétérogènes selon l'exploitant (voir 3.3) | Libellé, regroupement |
| `typeGare` / `_lib` | `Ech` = gare d'échangeur (1 011), `Bpv` = barrière pleine voie (255) | Symbologie ; système fermé ou ouvert |
| `nbVoies` | 1 à 28 voies (maximum : Vienne) | Taille du symbole, capacité |

Répartition des points par nom : 379 noms avec 1 point, 423 avec 2, 5 avec 3, 5 avec 4, 1 avec 6 (`La Boisse`).

La fiche data.gouv.fr annonce aussi la **date de mise en service** et la **société concessionnaire**, absentes du CSV fourni. **[Q8]** Récupérer la version complète. La colonne concessionnaire permettrait de filtrer par exploitant et faciliterait la correspondance des codes.

### 3.2 `echangeurs-rrnc-2025.csv` — 1 086 lignes **[F]**

| Colonne | Contenu observé |
|---|---|
| `route` | 93 axes (`A0001`, `A0005A`, `A0007N`…) |
| `nom` | 1 007 noms ; le numéro de sortie figure souvent entre parenthèses (`Roissy (6)`) |
| `No` | Numéro de sortie, renseigné à 79 % |
| `nbBretelles` | 0 à 9, 2 valeurs vides |
| `nature` | `DIFFUSEUR` (856), `BIFURCATION` (222), `MIXTE` (8) |
| `cote` | `I` sur toutes les lignes (position indifférente) |
| `abs` | 8 valeurs négatives (abscisse avant le PR) : valides, pas une erreur |

Doublons apparents : 3 couples de coordonnées identiques. Ce sont des **bifurcations décrites une fois par axe** (Ternay A7/A46, A61/A62/A68, A34/A344). Elles sont normales et à fusionner pour l'affichage.

### 3.3 Anomalies et points d'attention

| Constat | Conséquence |
|---|---|
| Les noms mêlent sens et rôle (`Entrée`, `Sortie`, `Sens 1/2`, `S1/S2`, `vers Espagne`, `depuis Toulouse`, `BPV`, `Nord/Sud`) | Le regroupement ne peut pas reposer sur l'égalité des noms |
| 3 paires de noms ne diffèrent que par la casse ou les accents | Normaliser avant de comparer |
| `Orange Nord` est étendu sur 2,3 km, `Salon Nord` sur 3,4 km | Probablement deux gares distinctes portant le même nom : à arbitrer |
| La Boisse : 4 points sur la bretelle `01A904220CD` + 2 sur `A0432` (côtés D/G), et voisine de « La Cotière » (barrière pleine voie) | Une même ville peut avoir une gare d'échangeur et une barrière pleine voie, qui sont des gares logiques distinctes |
| 6 barrières pleine voie à plus de 10 km de tout échangeur (Saint-Christophe A28, Arles A54, Saint-Germain A75) | Normal pour une barrière en section courante ; le rattachement passe par l'axe |
| Réseau concédé seulement | Les autoroutes non concédées (A86, A75 hors viaduc…) viennent de la source géométrique |

### 3.4 Reprojection **[F]**

- Transformation : `EPSG:2154 → EPSG:4326` avec PROJ (via pyproj pour l'analyse ; côté Java, **GeoTools** sous LGPL ou **proj4j** sous Apache-2.0).
- Emprise obtenue pour les gares : longitude de −1,750 à 7,602, latitude de 42,523 à 50,821. Aucun point hors de la France continentale.
- Contrôles à l'import :
  - point dans l'emprise Lambert 93 (`x` entre 100 000 et 1 300 000, `y` entre 6 000 000 et 7 200 000) ;
  - point à moins de 50 m du tracé autoroutier, une fois la géométrie disponible (phase 3) ;
  - distance à l'échangeur le plus proche inférieure à 2,5 km pour un point `Ech`.

### 3.5 Licences des données **[F]**, à revérifier en ligne

| Jeu | Licence affichée | Obligation |
|---|---|---|
| Gares de péage RRNc | ODC-By | Attribution « Ministère de la Transition écologique » |
| Échangeurs RRNc | Licence Ouverte (Etalab) | Attribution et date de mise à jour |
| OSM | ODbL 1.0 | Attribution « © OpenStreetMap contributors » ; partage à l'identique d'une base dérivée **diffusée** |
| BD TOPO | Licence Ouverte 2.0 | Attribution IGN |

---

## 4. Modèle de gare (1.2)

### 4.1 Deux niveaux **[D]**

```
GareLogique (unité d'affichage et d'agrégation)
 ├─ id                 : "GL-" + identifiant stable (ex. "GL-ECH-LA-BOISSE")
 ├─ nom                : libellé nettoyé ("La Boisse")
 ├─ type               : ECHANGEUR | PLEINE_VOIE
 ├─ systeme            : FERME | OUVERT | INCONNU   (déduit de la correspondance des codes)
 ├─ axes               : ["A0432", "A0042"]
 ├─ echangeurId        : échangeur de rattachement (null pour une barrière pleine voie)
 ├─ departement, concessionnaire
 ├─ position           : centroïde WGS84 des points
 ├─ nbVoiesTotal
 ├─ codesExploitant    : ["ASF-1234", …]   (table de correspondance, voir 4.3)
 └─ points[]           : PointPeage

PointPeage (une ligne du CSV)
 ├─ id                 : "PP-" + route + "-" + pr + "-" + abs + "-" + cote  (ex. "PP-01A904220CD-4-650-D")
 ├─ route, pr, abs, cumul, cote, depPr
 ├─ positionL93 (x, y) / positionWgs84 (lon, lat)
 ├─ nomSource          : nomGare brut
 ├─ typeGare, nbVoies
 └─ referentielVersion : "2025-01-01"
```

- L'identifiant d'un point est **dérivé de la clé de fait**, qui est unique **[F3]**. Il est stable tant que l'IGN ou la DGITM ne réétalonne pas les PR. En cas de réétalonnage, une table de reprise ancien ID → nouvel ID est produite à l'import (section 4.4).
- L'identifiant d'une gare logique est **attribué une fois** puis conservé dans la table de regroupement. Il ne doit jamais être recalculé depuis le nom.

### 4.2 Règle de regroupement **[D]**, proposition automatique puis validation

1. Séparer par `typeGare` : une gare d'échangeur et une barrière pleine voie ne sont jamais fusionnées.
2. Normaliser le nom : retirer accents et casse ; `saint` devient `st` ; supprimer `entrée`, `sortie`, `sens 1/2`, `bpv`, `barrière`, `gare de péage`.
3. Grouper par nom normalisé, puis vérifier que l'étendue du groupe est inférieure à 1 km. Au-delà, le groupe part en revue manuelle.
4. Détecter les groupes distincts de même type dont les centres sont à moins de 500 m. Ce sont des candidats à la fusion, en revue manuelle.

Résultats mesurés sur le référentiel 2025 **[F]** :

| Méthode | Gares logiques | Remarque |
|---|---|---|
| Nom brut | 813 | Trop de gares : Entrée et Sortie sont séparées |
| Nom normalisé + type (règle ci-dessus) | **667** (528 Ech, 139 Bpv) | 2 groupes à plus de 1 km, **59 paires** de candidats à la fusion à moins de 500 m |
| Proximité seule, par type, seuil 500 m | 618 | 172 groupes mélangent plusieurs noms |
| Proximité seule, seuil 1 km | 599 | Fusionne des gares voisines distinctes |

Exemples à arbitrer :
- `Benesse vers Bordeaux` / `vers Espagne` (49 m) : un seul site, les deux sens ;
- `Dozulé Nord` / `Sud` (412 m) ;
- `Antibes Est` / `Sophia` (100 m) ;
- `Ancenis Nord` / `Sud` (364 m) ;
- `Grans` / `Salon Sud`.

La réponse dépend de la façon dont l'exploitant code ces gares. **La table de correspondance (4.3) tranche** : si deux points portent le même code exploitant, ils appartiennent à la même gare logique.

**Livrable de mise en œuvre** : `referentiel/gares-logiques.csv` (colonnes `pointId;gareLogiqueId;nomGareLogique;validePar;dateValidation`), versionné et relu par le métier.

La proposition automatique est déjà générée par `scripts/analyse_referentiel.py` :
- `referentiel/gares-logiques-proposition.csv` : 1 266 points → 667 gares logiques, dont **161 points marqués `aArbitrer`** ;
- `referentiel/gares-logiques-a-arbitrer.csv` : 59 paires de gares voisines.

Les identifiants `GL-ECH-0000` qu'elle contient sont **provisoires**. Ils deviennent définitifs à la validation, puis ne sont plus recalculés.

### 4.3 Rattachement **[F]** / **[D]**

- **Gare → échangeur** : échangeur `DIFFUSEUR` ou `MIXTE` le plus proche. Mesuré sur les gares d'échangeur : médiane 348 m, 99e centile 2 001 m, maximum 7 207 m. Rattachement automatique sous 1 km ; au-delà, revue manuelle (environ 1 à 2 % des points). Parmi les gares d'échangeur, 15 ont pour plus proche voisin une **bifurcation** : il faut donc exclure les bifurcations du calcul.
- **Gare → axe** :
  - barrière pleine voie : la colonne `route` donne l'axe directement dans 96 % des cas ;
  - gare d'échangeur : le code de bretelle ne contient pas l'axe ; on utilise l'axe de l'échangeur de rattachement.
- **Gare → codes Kafka** : table `referentiel/correspondance-codes.csv` (`codeExploitant;exploitant;pointId|gareLogiqueId;dateDebut;dateFin`).
  - Source attendue : les sociétés concessionnaires ou l'équipe propriétaire du flux Kafka. **[Q1]**
  - **Aucun rapprochement automatique par nom n'est accepté pour la production** : un faux positif place des passages sur une mauvaise gare sans que personne le voie. Un rapprochement par nom peut au mieux servir à pré-remplir la table, avec validation humaine.

### 4.4 Cycle de vie du référentiel **[D]**

- **Import** : point d'accès d'administration (`POST /admin/referentiel`, en multipart) ou fichier déposé dans un répertoire surveillé.
  - Validation : schéma, coordonnées (3.4), unicité de la clé, cohérence avec la table de regroupement.
  - Le résultat est un **rapport d'import** : acceptés, rejetés avec motif, avertissements.
- **Rejets** : un point sans coordonnées valides est importé avec `position = null` et le statut `NON_POSITIONNE`. Il est visible dans la vue diagnostic et absent de la carte. Ses événements sont tout de même comptés dans les indicateurs globaux.
- **Versionnement** : chaque import crée une version (`dateReferentiel` + empreinte du fichier). La bascule est atomique.
  - Le frontend récupère le référentiel par l'API, avec un `ETag`. Aucun redéploiement n'est nécessaire.
  - Un message `referentielChanged` sur le canal temps réel (phase 2) déclenche le rechargement côté navigateur.
- **Diff entre versions** : points ajoutés, supprimés ou déplacés de plus de 50 m. Les identifiants de gares logiques sont conservés.

---

## 5. Contrat d'événement provisoire (1.3)

> ⚠️ **PROVISOIRE** : aucun exemple réel n'a été fourni. Ce contrat sert à développer le simulateur et le parseur. Il **doit** être confronté à au moins 20 messages réels avant la phase 2 d'implémentation. Le parseur sera configurable par mapping de champs pour absorber les écarts.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:autoroutes:toll-event:0.1-draft",
  "title": "TollEvent (PROVISOIRE)",
  "type": "object",
  "required": ["eventId", "stationCode", "type", "eventTime"],
  "additionalProperties": true,
  "properties": {
    "eventId":        { "type": "string", "minLength": 1, "maxLength": 128,
                        "description": "Identifiant unique et stable entre deux rejeux. Clé de déduplication." },
    "stationCode":    { "type": "string", "minLength": 1, "maxLength": 64,
                        "description": "Code de gare de l'exploitant. Résolu par la table de correspondance." },
    "operator":       { "type": "string", "description": "Société concessionnaire, si le code n'est pas unique au niveau national." },
    "laneId":         { "type": "string", "description": "Voie de péage, optionnelle." },
    "type":           { "enum": ["ENTRY", "EXIT"] },
    "eventTime":      { "type": "string", "format": "date-time",
                        "description": "Instant du passage, ISO-8601 avec décalage ou Z. Heure métier." },
    "entryStationCode": { "type": ["string", "null"],
                        "description": "Sur une sortie en système fermé : gare d'entrée. Conditionne le scénario A." },
    "entryTime":      { "type": ["string", "null"], "format": "date-time" },
    "vehicleCount":   { "type": "integer", "minimum": 1, "maximum": 1000, "default": 1 },
    "vehicleClass":   { "enum": ["1", "2", "3", "4", "5", null],
                        "description": "Classe tarifaire 1 à 5." },
    "paymentMode":    { "enum": ["CASH", "CARD", "TAG", "FREE_FLOW", "OTHER", null],
                        "description": "Catégorie seulement, jamais l'identifiant du moyen de paiement." },
    "simulated":      { "type": "boolean", "default": false },
    "meta":           { "type": "object", "description": "Champs libres. Ignorés par l'agrégation, filtrés avant tout stockage." }
  }
}
```

**Règles de rejet** (envoi vers le topic de rejet, avec motif) :
- JSON invalide ;
- champ obligatoire absent ;
- `type` inconnu ;
- `eventTime` illisible ;
- `eventTime` plus de 5 minutes dans le futur (horloge de l'équipement en avance) ;
- `vehicleCount` hors bornes.

Un `stationCode` **inconnu** n'est pas rejeté. L'événement est mis en **quarantaine** (compté, visible dans le diagnostic, rejoué quand la table de correspondance est mise à jour), car c'est l'erreur la plus probable au démarrage.

**Temps** **[D]** :
- `eventTime` = heure métier, qui pilote toutes les fenêtres d'agrégation.
- `receivedAt` = horodatage de réception côté consommateur (timestamp Kafka du record et horloge du backend). Il sert au calcul de fraîcheur et de retard, jamais à l'agrégation.
- Stockage et transport **en UTC** (`Instant`). L'affichage et les découpages calendaires (jour, heure) se font en `Europe/Paris` avec gestion des changements d'heure : la journée du changement d'heure dure 23 h ou 25 h, et les séries horaires doivent l'afficher sans trou ni doublon.
- Un horodatage **sans décalage horaire** est interprété en `Europe/Paris`. L'heure ambiguë du passage à l'heure d'hiver est résolue sur le premier passage, avec une métrique. **[H]** À confirmer avec les exemples.
- Dérive des horloges d'équipement : mesurée par gare (`receivedAt − eventTime`, médiane glissante) et affichée dans le diagnostic. Au-delà de 2 minutes, une alerte est levée.

---

## 6. Ce que permettent réellement les données (1.4)

| Niveau | Condition nécessaire | Scénario A (sortie avec gare d'entrée) | Scénario B (sans) |
|---|---|---|---|
| 1. Activité instantanée par gare : entrées, sorties, solde, fenêtres glissantes | Table de correspondance des codes | **Observé** | **Observé** |
| 2. Flux origine → destination entre gares | `entryStationCode` sur les sorties | **Observé** (système fermé uniquement) | **Impossible** |
| 3. Charge des tronçons | Niveau 2 + graphe routier + règle d'affectation (plus court chemin) | **Estimé** (affectation) | **Impossible** |
| 4. Historique et comparaisons | Persistance des agrégats | **Observé** | **Observé** |

Précisions :
- **Système ouvert** (barrières pleine voie, péage forfaitaire) : un seul passage, sans origine. Il alimente le niveau 1, jamais le niveau 2. Une sortie sans entrée correspondante n'est **pas** une anomalie en système ouvert.
- **Flux libre** (A79, A13/A14 et autres sections sans barrière) : les portiques produisent des événements qui ne correspondent à aucun point du référentiel. **[Q9]** Ces événements existent-ils dans le flux ?
- **Solde entrées − sorties** : utile par gare et par fenêtre, mais il ne mesure pas le nombre de véhicules présents sur le réseau. Les trajets ouverts, les durées de trajet et les sorties sur un autre réseau le faussent. Il faut l'afficher comme « solde », jamais comme « véhicules présents ».
- **Niveau 3 (scénario A)** : affecter chaque couple origine-destination au plus court chemin du graphe autoroutier donne une charge **estimée**. Le lien est pratiquement certain sur un axe sans alternative et approximatif sur un maillage (Île-de-France, Lyon). Il faut l'étiqueter « estimé » et documenter l'algorithme. Un trajet origine-destination est imputé à la fenêtre de **sortie**, ce qui introduit un décalage égal à la durée du trajet.
- **Interdit [D3]** : apparier une entrée et une sortie par proximité temporelle ou statistique pour fabriquer un trajet en scénario B.

---

## 7. Sources de géométrie routière (1.5)

| Critère | OpenStreetMap | BD TOPO (IGN) | ROUTE 500 / BD CARTO | RRN de l'État |
|---|---|---|---|---|
| Licence | ODbL : attribution ; partage à l'identique d'une base dérivée diffusée | Licence Ouverte 2.0 : attribution | Licence Ouverte | Licence Ouverte (à vérifier) |
| Fraîcheur | Continue | Trimestrielle **[F7]** | ROUTE 500 arrêté en 2021 **[F7]** | Variable |
| Autoroutes + numéros | Oui (`highway=motorway`, `ref`) | Oui | Oui | Axes RRN seulement |
| Fond de carte complet (villes, relief, toponymes) | **Oui**, avec chaîne de tuiles existante (Protomaps, OpenMapTiles) | Partiel ; à styliser entièrement | Non | Non |
| Effort d'intégration | Faible (PMTiles prêtes à l'emploi, styles MapLibre) | Élevé (volumes importants, chaîne de tuiles à construire) | — | — |

**Recommandation [D4]** :
- **Fond de carte** : un extrait France des tuiles **Protomaps** au format PMTiles (données OSM ; code sous BSD-3 ; style sous CC0), auto-hébergé, servi statiquement par requêtes HTTP Range. Aucune clé API, aucune dépendance à un tiers.
- **Couche autoroutes métier** : extraite d'OSM (`highway=motorway|motorway_link` + `ref`), généralisée par niveau de zoom, produite en tuiles vectorielles dédiées. Ce choix permet de styler les autoroutes indépendamment du fond et d'y attacher les identifiants de tronçon nécessaires au niveau 3.
- **Autoroutes non concédées** : présentes dans OSM, avec un attribut `concede = false` obtenu par jointure spatiale avec les points du référentiel (un axe sans aucun point de péage ni échangeur RRNc est non concédé). Elles sont affichées sans activité.
- **ODbL** : afficher l'attribution suffit pour des tuiles servies, qui sont des « produced works ». Le partage à l'identique ne s'applique qu'à une **base dérivée diffusée** : si le graphe de tronçons OSM enrichi est distribué hors de l'organisation, il doit l'être sous ODbL. **[Q10]** Validation juridique. Si l'ODbL est inacceptable, basculer la couche autoroutes vers **BD TOPO** en gardant OSM pour le fond. L'architecture (couche métier séparée du fond) rend cette bascule possible.

---

## 8. Contraintes non fonctionnelles (1.6)

### 8.1 RGPD **[D6]**

- **Hypothèse [H5]** : une transaction peut contenir une plaque (lecture automatique), un numéro de badge, un numéro de carte tronqué, des données de flux libre.
- Règles :
  1. Le parseur ne **lit que** les champs du contrat (liste d'autorisation). Tout autre champ est ignoré : il n'est ni journalisé ni stocké.
  2. Le topic de rejet et les journaux ne contiennent **jamais** le message brut. On y conserve `eventId`, partition, offset, motif et un extrait limité aux champs autorisés.
  3. Aucune donnée individuelle n'est persistée. Seuls des **agrégats** (gare × fenêtre, couple origine-destination × fenêtre) sont stockés, avec un **seuil de diffusion**.
  4. Le navigateur ne reçoit que des agrégats.
  5. Durée de conservation des agrégats : proposée à 13 mois (comparaison d'une année sur l'autre). **[Q5]** À valider avec le DPO.
  6. La fenêtre de déduplication (`eventId`) est un identifiant technique, conservé 24 h au plus.
- **Seuil de diffusion** : une cellule origine-destination de moins de 3 véhicules sur une fenêtre de 5 minutes la nuit peut permettre une réidentification par recoupement. Ces cellules sont masquées ou regroupées dans le niveau 2. **[D]**, paramétrable.

### 8.2 Volumétrie **[H4]**, valeurs provisoires à remplacer par des mesures

| Paramètre | Nominal | Pointe | Stress (test) |
|---|---|---|---|
| Événements par seconde | 50 | 300 | 2 000 |
| Gares logiques / points | 667 / 1 266 | 667 / 1 266 | 2 000 / 4 000 |
| Navigateurs connectés | 10 | 50 | 500 |
| Tronçons (niveau 3) | 5 000 | 5 000 | 20 000 |
| Historique | 13 mois à 1 min | — | 3 ans |

Ordres de grandeur dérivés, en scénario nominal :
- **État courant** : 667 gares × 1 440 minutes × 4 compteurs × 8 octets ≈ **30 Mo** pour 24 h glissantes en mémoire. Négligeable.
- **Origine-destination** : au plus 667² ≈ 445 000 couples, mais la matrice est creuse. On ne stocke que les couples observés, par fenêtre de 15 minutes.
- **Historique** : 667 × 525 600 minutes par an ≈ 350 millions de lignes par an à la minute. Il faut donc des agrégats multi-résolution (minute sur 7 jours, 15 minutes sur 13 mois, heure au-delà). À décider en phase 2.

### 8.3 Temps réel **[D]**, valeurs cibles

| Paramètre | Cible |
|---|---|
| Latence de bout en bout (publication Kafka → affichage) | **≤ 3 s** au 95e centile (fréquence d'envoi des deltas 1 Hz + rendu) |
| Fenêtres d'agrégation | 1 min (base), avec dérivées glissantes de 5 min, 15 min, 1 h et cumul du jour |
| Retard accepté pour un événement tardif (mise à jour de l'état courant) | 10 min |
| Événement plus tardif | Corrige l'**historique** (agrégats persistés), pas l'affichage temps réel ; métrique `late_events` |
| Donnée périmée | Gare sans événement depuis plus de N fois son intervalle habituel (N = 5, calculé par gare et par tranche horaire), ou retard du consommateur supérieur à 60 s : affichage en état « périmé » |

---

## 9. Périmètre et roadmap (1.7)

| Incrément | Contenu | Dépendances | Risques | Critère de sortie |
|---|---|---|---|---|
| **0. Socle données** | Import du référentiel, regroupement en gares logiques, rattachement aux échangeurs, reprojection, rapport d'import ; extraction OSM + PMTiles | Validation métier des cas ambigus | Regroupement contesté | 100 % des points positionnés ou justifiés ; table validée |
| **1. MVP** | Ingestion Kafka avec le contrat provisoire, déduplication, quarantaine ; niveau 1 ; snapshot + deltas ; carte complète ; simulateur ; vue diagnostic | **Q1** (correspondance des codes), **Q3** (exemples réels) | Écart entre le contrat et le réel ; codes inconnus | Démonstration de bout en bout sur données simulées, puis réelles ; latence ≤ 3 s au 95e centile |
| **2. Historique** | Agrégats persistés multi-résolution, séries, comparaison J/J-7, relecture | Q5 (rétention) | Volume ; corrections tardives | Requête sur 13 mois en moins de 1 s |
| **3. Flux origine-destination** (scénario A) | Matrice origine-destination, flèches entre gares, seuil de diffusion | **Q2** = oui | Faible couverture si beaucoup de gares en système ouvert | Totaux origine-destination cohérents avec les sorties en système fermé (± 0,5 %) |
| **4. Charge des tronçons** (scénario A) | Graphe routier, affectation au plus court chemin, rendu estimé | Incrément 3 ; Q10 (ODbL) | Affectation discutable sur les zones maillées | Validation par le métier sur 3 axes de référence |
| **5. Industrialisation** | Authentification OIDC, supervision, durcissement, tests de charge | Q4 (volumétrie réelle) | — | Critères de performance de la phase 3 atteints |

---

## 10. Questions ouvertes bloquantes

Classées par impact sur l'architecture.

| # | Question | Bloque | Valeur provisoire retenue |
|---|---|---|---|
| **Q1** | Table de correspondance codes de gare Kafka ↔ référentiel : qui la fournit, sous quel format, mise à jour comment ? | Tout positionnement d'événement (MVP) | Code = `pointId` dans le simulateur |
| **Q2** | La sortie en système fermé porte-t-elle la gare d'entrée (et l'heure d'entrée) ? | Niveaux 2 et 3, scénario A ou B | Les deux scénarios sont conçus ; MVP sur le niveau 1 seulement |
| **Q3** | Au moins 20 exemples réels anonymisés ; noms des topics, clé de partition, nombre de partitions, format (JSON brut ou Schema Registry), garanties côté producteur (idempotence, transactions) | Parseur, déduplication, ordre | Contrat de la section 5 ; clé = `stationCode` |
| **Q4** | Volumétrie réelle : événements par seconde moyens et en pointe (vendredi des départs, samedi « noir ») ; nombre d'utilisateurs simultanés | Dimensionnement, choix de rendu | Section 8.2 |
| **Q5** | Données personnelles présentes dans les événements ? Durée de conservation validée par le DPO ? | Persistance, journaux, rejets | Liste d'autorisation, 13 mois d'agrégats |
| **Q6** | Un événement = un véhicule, ou des événements pré-agrégés ? | Modèle d'agrégation | 1 événement = `vehicleCount` véhicules, 1 par défaut |
| **Q7** | Format de `eventTime` (fuseau, précision) et fiabilité des horloges des équipements | Fenêtres, événements tardifs | ISO-8601 ; sans décalage → `Europe/Paris` |
| **Q8** | Version complète du jeu « gares » avec concessionnaire et date de mise en service | Correspondance des codes, filtres | CSV actuel |
| **Q9** | Le flux contient-il des événements de flux libre (portiques sans gare) ? | Référentiel, carte | Non |
| **Q10** | Validation juridique de l'ODbL pour la couche autoroutes dérivée d'OSM | Choix entre OSM et BD TOPO pour la couche métier | OSM |
| Q11 | Mode historique et relecture attendus au MVP ? | Périmètre de l'incrément 1 | Non, prévu à l'incrément 2 |
| Q12 | Authentification requise dès la démonstration ? | Incrément 1 | Non, prévue à l'incrément 5 |

---

## Sources

- [Gares de péage du réseau routier national concédé — data.gouv.fr](https://www.data.gouv.fr/datasets/gares-de-peage-du-reseau-routier-national-concede)
- [Échangeurs du réseau routier national concédé — data.gouv.fr](https://www.data.gouv.fr/datasets/echangeurs-du-reseau-routier-national-concede)
- [ROUTE 500 — catalogue Open Data (dernière édition 2021)](https://catalogue.open-datara.fr/geonetwork/srv/api/records/10640d90-3a41-4110-8f05-7915919b393c)
- [ROUTE 500 — transport.data.gouv.fr](https://transport.data.gouv.fr/datasets/route-500-r)
- [BD TOPO — documentation IGN](https://geoservices.ign.fr/documentation/donnees/vecteur/bdtopo)
- [BD TOPO — évolutions de l'édition de décembre 2025](https://cartes.gouv.fr/aide/fr/partenaires/ign/generalites-ign/actualites/2026-01-bdtopo-evolutions/)
- [Protomaps — FAQ (licences, auto-hébergement)](https://protomaps.com/faq)
- [Protomaps — téléchargement des fonds de carte](https://docs.protomaps.com/basemaps/downloads)
