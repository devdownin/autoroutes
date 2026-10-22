# Phase 3/3 — Cartographie, moteur d'animation, interface et industrialisation

> Prérequis : le **dossier de cadrage** (phase 1) et le **dossier d'architecture backend** (phase 2), validés et joints à ce prompt. Le protocole temps réel et les formats de messages de la phase 2 s'imposent.

## Contexte

On veut une application web de supervision de l'activité des gares de péage du réseau autoroutier concédé français. La carte est l'élément principal. La qualité cartographique, la lisibilité et la fluidité de l'animation sont les critères prioritaires.

Stack imposée (open source uniquement, licences compatibles avec un usage commercial, aucune clé API payante) :
- React, TypeScript strict, Vite.
- MapLibre GL JS comme moteur cartographique ; deck.gl seulement si le plan de profilage le justifie.
- Outillage de qualité et de tests open source.

## Règles transverses

1. Classer chaque affirmation : **Fait**, **Hypothèse** (avec l'impact si elle est fausse) ou **Décision**.
2. Pas de capacité affirmée sans mesure : poser des **objectifs** et le protocole qui les vérifie.
3. Ne jamais animer une position de véhicule fictive. Un flux estimé doit être visuellement distinct d'un flux observé, et la légende doit l'indiquer.
4. Les données sont des transactions de péage, pas le trafic routier. L'interface doit le rendre compréhensible.
5. Pour chaque technologie ou jeu de données : rôle, licence, limites, une alternative.
6. Préférer la solution la plus simple qui satisfait les exigences mesurables.

## Travail demandé

### 3.1 Chaîne de données cartographiques
- **Fond de carte** vectoriel auto-hébergé. Comparer :
  - **PMTiles** (Protomaps) : un fichier statique servi par requêtes HTTP Range, sans serveur de tuiles ;
  - **OpenMapTiles + Martin ou tileserver-gl** ;
  - **GeoJSON direct** pour les couches métier.

  Recommander un choix pour le fond et un autre pour les couches métier.
- **Réseau autoroutier** à partir de la source retenue en phase 1 :
  - extraction et filtrage ;
  - fusion des tronçons ;
  - numéros d'autoroute ;
  - distinction entre concédé et non concédé ;
  - simplification selon le niveau de zoom ;
  - production des tuiles (par exemple tippecanoe ou planetiler).

  La chaîne doit être reproductible par script.
- **Gares et échangeurs** :
  - reprojection de Lambert 93 vers WGS84 ;
  - gares logiques aux zooms faibles, points de péage aux zooms forts ;
  - rattachement au tracé, avec contrôle de l'écart entre la position d'une gare et l'axe.
- Héberger soi-même les polices (glyphs) et les icônes (sprites), sans CDN tiers.
- Attributions : OSM / ODbL, IGN / Etalab, données RRNc. Afficher et documenter chaque obligation de licence.

### 3.2 Architecture frontend
- Comparatif argumenté : MapLibre seul ou MapLibre + deck.gl. Pour la gestion d'état temps réel, comparer par exemple Zustand avec une logique hors React à un store maison.
- Séparation stricte en 5 couches :
  1. réception WebSocket et application des deltas, dans un Web Worker si la mesure le justifie ;
  2. état métier courant ;
  3. préparation des données géographiques (tableaux typés, mises à jour par lots) ;
  4. boucle d'animation (`requestAnimationFrame`, horloge propre) ;
  5. rendu WebGL.
- React ne gère que l'interface (panneaux, filtres, légende), **jamais un rendu par événement**. Les sources MapLibre sont mises à jour par lots, avec `setData` ou `updateData` et `feature-state`, à une fréquence plafonnée.
- Côté client, détecter les trous de séquence, déclencher la resynchronisation et afficher l'état de connexion, conformément au protocole de la phase 2.

### 3.3 Moteur d'animation
- Représentations, en indiquant pour chacune le zoom concerné, la donnée qui la pilote et son statut (observé ou estimé) :
  - halo bref et amorti sur une gare quand un lot d'activité arrive, sans clignotement permanent ;
  - cercles proportionnels au volume sur la fenêtre, avec une échelle en racine carrée ;
  - flèches directionnelles entre gares (scénario A) ;
  - particules ou tirets animés le long du tracé, **seulement pour une charge de tronçon estimée** (scénario A), visuellement marqués comme estimation ;
  - épaisseur ou couleur des tronçons selon l'intensité ;
  - agrégation visuelle aux zooms faibles.
- Le temps d'animation doit être indépendant du rythme des messages et de la fréquence d'images : interpoler entre deux états agrégés, dans une durée bornée.
- Mode dégradé :
  - détection du manque de performance (budget par image) ;
  - réduction des effets ;
  - respect de `prefers-reduced-motion` ;
  - option pour couper l'animation.

### 3.4 Interface et direction artistique
- Maquette fonctionnelle (wireframes ASCII ou SVG) :
  - carte occupant l'essentiel de l'écran ;
  - bandeau d'indicateurs globaux ;
  - recherche et filtres (géographiques et métier) ;
  - légende ;
  - panneau de détail d'une gare ;
  - heure de dernière mise à jour ;
  - état du flux temps réel ;
  - visibilité des couches ;
  - contrôles de lecture, pause et vitesse si le mode historique est retenu.
- Vues à prévoir : France entière (cadrage initial), vue régionale, détail d'une gare, **diagnostic** (fraîcheur, retard, rejets, codes inconnus).
- Direction artistique :
  - palette (thème sombre recommandé pour la supervision, à justifier) ;
  - hiérarchie visuelle et épaisseur des routes par zoom ;
  - symboles distincts pour les gares d'échangeur, les barrières pleine voie et les échangeurs ;
  - typographie ;
  - règles de densité des libellés par zoom ;
  - **palettes accessibles aux daltoniens** et contrastes WCAG AA.
- Priorité au poste de travail. Comportement responsive au minimum lisible.

### 3.5 Performance
- Scénarios de charge paramétrés : nombre de gares, débit de deltas, nombre de tronçons, nombre de connexions, volume transmis, profondeur d'historique.
- Objectifs mesurables :
  - temps jusqu'à la première carte interactive ;
  - latence de bout en bout, de Kafka à l'écran ;
  - images par seconde au 5e centile ;
  - temps CPU par image ;
  - mémoire stable sur 8 h ;
  - temps de resynchronisation.
- **Plan de profilage**, sur un poste de référence défini : mesures, outils et seuils qui décident objectivement de passer à deck.gl.

### 3.6 Tests et validation
- Unitaires : application des deltas, détection des trous, calculs d'échelles.
- Composants React.
- Bout en bout avec Playwright : connexion, perte de réseau, resynchronisation, filtres.
- Régression visuelle de la carte.
- Accessibilité automatisée et manuelle.
- Exactitude des positions : comparaison avec le référentiel reprojeté, tolérance chiffrée.
- Démonstration reproductible : Kafka, référentiel et générateur d'événements de la phase 2, avec un bandeau « données simulées » visible.

### 3.7 Déploiement
- Docker Compose pour le développement et la démonstration :
  - Kafka en mode KRaft ;
  - base de données ;
  - backend ;
  - frontend servi par un serveur statique ;
  - tuiles ;
  - générateur d'événements ;
  - Prometheus et Grafana en option.
- Images reproductibles (versions figées), build multi-étapes, configuration par variables d'environnement, aucun secret dans le dépôt.
- Notes de passage en production : reverse proxy, TLS, cache des tuiles.

### 3.8 Arborescence et roadmap
- Arborescence du projet frontend et du dépôt global (monorepo ou dépôts séparés : décider).
- Roadmap par incréments, du MVP aux niveaux 2, 3 et 4 selon le scénario retenu. Pour chaque incrément : contenu, dépendances, risques, critères d'acceptation.

## Livrable attendu

Un **dossier de conception frontend et d'industrialisation** en Markdown, dans cet ordre :
1. Synthèse et décisions structurantes.
2. Registre faits / hypothèses / décisions, mis à jour.
3. Sections 3.1 à 3.8.
4. Critères d'acceptation globaux du projet :
   - réseau crédible et lisible ;
   - gares correctement positionnées ;
   - mise à jour sans rechargement ;
   - fluidité sous la charge cible ;
   - flux cohérents avec les données ;
   - distinction entre observé et estimé ;
   - resynchronisation après une coupure ;
   - aucune dépendance propriétaire ;
   - reproductibilité ;
   - licences documentées.

Inclure du code seulement pour les points délicats (boucle d'animation, application des deltas, style MapLibre des couches métier). Le code doit être complet et typé strictement.
