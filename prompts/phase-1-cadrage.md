# Phase 1/3 — Cadrage, données et décisions structurantes

> Visualisation temps réel de l'activité des gares de péage du réseau autoroutier concédé français.
> Phase 1 sur 3. Les phases 2 (architecture backend et temps réel) et 3 (cartographie, rendu, industrialisation) partiront du dossier produit ici, une fois validé.

## Contexte

On veut concevoir une application web de supervision qui :
- affiche une carte de la France métropolitaine avec le réseau autoroutier, ses échangeurs et les gares de péage du référentiel fourni ;
- consomme des événements JSON publiés dans Kafka (entrées et sorties en gare) ;
- montre en temps réel l'activité des gares et, si les données le permettent, des flux entre gares ;
- distingue en permanence ce qui est observé de ce qui est estimé.

Stack imposée (open source uniquement, licences compatibles avec un usage commercial) :
- Backend : Java 25, Spring Boot 4, Spring for Apache Kafka 4, REST, WebSocket (SSE à évaluer). Monolithe modulaire tant que les volumes mesurés ne justifient pas autre chose.
- Frontend : React, TypeScript strict, Vite, MapLibre GL JS ; deck.gl seulement si une mesure le justifie.
- Aucun service cartographique propriétaire, aucune clé API payante.

## Règles transverses (valables pour les 3 phases)

1. Classer chaque affirmation : **Fait** (vérifié dans les fichiers ou la documentation), **Hypothèse** (à confirmer, avec l'impact si elle est fausse) ou **Décision** (prise, ou à prendre par qui).
2. Ne pas inventer de schéma, de volumétrie ni de capacité. Si une donnée manque, la demander et proposer une valeur provisoire étiquetée comme telle.
3. Ne jamais présenter une position de véhicule, un trajet ou une charge de tronçon comme observés s'ils sont interpolés, affectés ou simulés.
4. Les données décrivent des **transactions de péage**, pas le trafic routier. Le réseau gratuit et la circulation entre deux gares ne sont pas mesurés.
5. Pour chaque technologie ou jeu de données retenu : rôle, licence, limites, une alternative.
6. Préférer la solution la plus simple qui satisfait les exigences mesurables.

## Données fournies (dépôt)

| Fichier | Contenu |
|---|---|
| `gares-peage-2025.csv` (+ shapefile `Gares-peage_RRNc_2025.*`) | Gares de péage du RRN concédé, référentiel au 01/01/2025 |
| `echangeurs-rrnc-2025.csv` (+ shapefile `Echangeurs_RRNc_2025.*`) | Échangeurs, diffuseurs et bifurcations du RRN concédé |
| `Projet_Carto_R500_3-0_FXX.qgs` / `.mxd` | Projets QGIS et ArcGIS qui référencent des shapefiles IGN ROUTE 500 **absents du dépôt** |

Constats déjà établis sur ces fichiers, à vérifier puis exploiter :
- CSV UTF-8, séparateur `;`, fins de ligne CRLF, décimales avec une virgule.
- Coordonnées `x`/`y` en **Lambert 93 (EPSG:2154)**, pas en WGS84. Aucune coordonnée vide.
- Gares : 1 266 lignes, **813 noms distincts**. Une ligne correspond à un **point de barrière** (voie, sens, bretelle), pas à une gare au sens de l'exploitation. Exemple : `La Boisse` = 4 barrières sur la bretelle `01A904220CD` et 2 sur `A0432` (côtés D et G).
- Gares : **aucun identifiant métier**. Clé de fait : `route + pr + abs + cote`.
- Gares : `typeGare` = `Ech` (échangeur, 1 011) ou `Bpv` (barrière pleine voie, 255). `nbVoies` est renseigné.
- Gares : `route` contient un **code de bretelle** (`01A903905CD`, 985 lignes) ou un **numéro d'axe** (`A0432`, 271 lignes). Le rattachement à une autoroute n'est donc pas direct.
- Échangeurs : 1 086 lignes, 93 routes, `nature` = diffuseur, bifurcation ou échangeur mixte. Ce sont des points, sans géométrie.
- Les deux jeux couvrent uniquement le réseau **concédé**.

## Informations à fournir par l'utilisateur

Si un élément manque, ne pas bloquer : formuler l'hypothèse de travail, son impact, et l'ajouter à la liste des questions ouvertes.

- [ ] Exemples réels d'événements Kafka (au moins 20, entrées et sorties, anonymisés), noms des topics, clé de partition, nombre de partitions.
- [ ] **Un événement de sortie contient-il la gare d'entrée** (système fermé, ticket ou badge) ?
- [ ] Table de correspondance entre les codes de gare utilisés dans les événements et le référentiel.
- [ ] Volumétrie : événements par seconde (moyenne, pointe horaire, pointe de départs en vacances), nombre d'utilisateurs simultanés.
- [ ] Latence cible entre la publication Kafka et l'affichage.
- [ ] Présence de données personnelles dans les événements (plaque, badge, moyen de paiement).
- [ ] Besoin d'historique : profondeur, granularité, relecture.

## Travail demandé

### 1.1 Analyse du référentiel
- Profil des deux CSV : colonnes, types, valeurs, anomalies, doublons stricts et doublons apparents.
- Reprojection Lambert 93 vers WGS84 : méthode et contrôle (emprise, points hors France).
- Licence des jeux de données (source probable : data.gouv.fr / DGITM). L'indiquer comme hypothèse tant qu'elle n'est pas vérifiée.

### 1.2 Modèle de gare
Proposer un modèle à deux niveaux :
- **Point de péage** : une ligne du CSV, avec un identifiant technique stable dérivé de la clé de fait.
- **Gare logique** : un regroupement de points, qui sert d'unité d'affichage et d'agrégation.

Pour ce modèle, préciser :
- la règle de regroupement (nom, proximité, rattachement à un échangeur) et ses cas ambigus, avec des exemples tirés des données ;
- le rattachement à l'axe autoroutier (jointure spatiale, table bretelle → axe) ;
- l'identifiant métier exposé et la table de correspondance avec les codes Kafka ;
- l'import, la validation (coordonnées, doublons), la gestion des rejets, la mise à jour du référentiel sans redéploiement et le versionnement par date de référentiel.

### 1.3 Contrat d'événement provisoire
Rédiger un JSON Schema marqué **PROVISOIRE**, à confronter aux exemples réels. Champs attendus :
- `eventId` ;
- code de gare ;
- type (`ENTRY` / `EXIT`) ;
- `eventTime` (instant UTC, ISO-8601) ;
- gare d'entrée sur une sortie, si disponible ;
- nombre de véhicules ;
- classe de véhicule ;
- métadonnées.

Préciser :
- les champs obligatoires et les règles de rejet ;
- la séparation entre `eventTime` et l'heure de réception ;
- le fuseau horaire et les changements d'heure ;
- le décalage d'horloge entre équipements.

### 1.4 Ce que permettent réellement les données
Établir une matrice : niveau de visualisation × condition nécessaire × statut (observé, estimé, impossible).

Niveaux :
1. Activité instantanée des gares (entrées, sorties, solde, sur des fenêtres glissantes).
2. Flux origine → destination entre gares.
3. Charge estimée des tronçons (affectation des trajets sur un graphe routier).
4. Historique et comparaison temporelle.

Traiter deux scénarios :
- **A** : la sortie porte la gare d'entrée. Les flux origine-destination sont observés ; la charge des tronçons est une estimation par affectation.
- **B** : la sortie ne porte pas la gare d'entrée. Seuls les niveaux 1 et 4 sont possibles ; le système ouvert (`Bpv`) ne donne jamais d'origine.

Interdiction : apparier une entrée et une sortie par heuristique pour fabriquer un trajet.

### 1.5 Sources de géométrie routière
- Comparer IGN BD TOPO / ROUTE 500 (statut de diffusion actuel à vérifier), OpenStreetMap (ODbL : attribution, conditions de partage à l'identique sur une base dérivée) et la géométrie du RRN publiée par l'État, si elle existe.
- Indiquer comment couvrir les autoroutes non concédées, présentes sur la carte mais sans péage.
- Recommander une source et justifier ce choix.

### 1.6 Contraintes non fonctionnelles
- **RGPD** : données personnelles éventuelles, minimisation, pseudonymisation, durée de conservation. Rien de personnel ne doit atteindre le navigateur.
- **Volumétrie** : trois scénarios paramétrés (nominal, pointe, stress) avec des valeurs provisoires étiquetées.
- **Temps réel** : latence cible de bout en bout, taille des fenêtres d'agrégation, délai maximal accepté pour un événement tardif.

### 1.7 Périmètre et roadmap
- MVP proposé : niveau 1, synchronisation snapshot/deltas, carte complète, simulateur d'événements, diagnostic de fraîcheur des données.
- Incréments suivants, chacun avec ses dépendances (données à obtenir), ses risques et son critère de sortie.

## Livrable attendu

Un **dossier de cadrage** en Markdown, dans cet ordre :
1. Synthèse en 10 lignes.
2. Registre faits / hypothèses / décisions (tableau).
3. Sections 1.1 à 1.7.
4. **Questions ouvertes bloquantes**, classées par impact sur l'architecture.

Ne pas concevoir l'architecture logicielle détaillée, l'API ni le rendu : ce sont les phases 2 et 3.
