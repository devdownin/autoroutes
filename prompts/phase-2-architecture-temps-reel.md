# Phase 2/3 — Architecture backend, traitement Kafka et synchronisation temps réel

> Prérequis : le **dossier de cadrage validé** de la phase 1, joint à ce prompt. Ses décisions s'imposent. Ses hypothèses restent des hypothèses : si l'une d'elles change un choix d'architecture, le signaler explicitement.

## Contexte

On veut une application web de supervision de l'activité des gares de péage du réseau autoroutier concédé français. Les entrées et sorties sont publiées en JSON dans Kafka. La phase 1 a fixé :
- le modèle de gare (points de péage et gares logiques) ;
- le contrat d'événement provisoire ;
- les niveaux de visualisation réalisables (scénario A ou B) ;
- la volumétrie cible et la latence cible ;
- les contraintes RGPD ;
- le périmètre du MVP.

Stack imposée (open source uniquement, licences compatibles avec un usage commercial) :
- Java 25, Spring Boot 4, Spring for Apache Kafka 4.
- REST pour le snapshot et les requêtes de détail ; WebSocket pour les deltas (évaluer SSE si le canal est strictement unidirectionnel).
- **Monolithe modulaire**, avec des frontières de modules explicites (par exemple Spring Modulith). Pas de découpage en services sans mesure qui le justifie.
- Persistance seulement là où elle sert : référentiel, historique, reprise après incident.
- Code idiomatique Java 21+ : records, `Optional`, injection par constructeur. Tests JUnit 5 + Mockito, Testcontainers pour Kafka et la base.

## Règles transverses

1. Classer chaque affirmation : **Fait**, **Hypothèse** (avec l'impact si elle est fausse) ou **Décision**.
2. Ne pas inventer de schéma, de volumétrie ni de capacité. Toute valeur chiffrée non mesurée est une **cible** ou une **hypothèse**.
3. Ne jamais présenter comme observé ce qui est estimé. Chaque agrégat porte sa nature (`OBSERVED` / `ESTIMATED`).
4. Les données sont des transactions de péage, pas le trafic routier.
5. Pour chaque technologie : rôle, licence, limites, une alternative.
6. Préférer la solution la plus simple qui satisfait les exigences mesurables.

## Travail demandé

### 2.1 Vue d'ensemble
- Modules et responsabilités, avec leurs dépendances autorisées : ingestion, référentiel, agrégation, diffusion, API, administration et diagnostic.
- Diagramme de composants et diagrammes de séquence (Mermaid) pour :
  - le démarrage à froid ;
  - le flux nominal d'un événement ;
  - la connexion d'un navigateur (snapshot puis deltas) ;
  - la perte de connexion du navigateur ;
  - une coupure Kafka ;
  - le redémarrage du backend ;
  - la mise à jour du référentiel.
- Distinguer explicitement trois formats : **événement Kafka**, **agrégat métier**, **message navigateur**.

### 2.2 Ingestion Kafka
- Configuration du consommateur : groupe, `isolation.level`, commit des offsets, concurrence par partition, désérialisation tolérante (`ErrorHandlingDeserializer`).
- Validation par rapport au contrat provisoire. Rejet vers un **topic de rejet** (DLT) avec la cause, sans bloquer la partition.
- Résolution du code de gare via la table de correspondance. Définir le traitement des codes inconnus : métrique, rejet ou mise en quarantaine.
- **Idempotence.** Le mode « exactly-once » de Kafka ne couvre pas l'état en mémoire ni les WebSocket. Il faut donc :
  - dédupliquer sur `eventId`, avec une fenêtre bornée en temps et en mémoire ;
  - reconstruire cette fenêtre au redémarrage ;
  - tester explicitement le cas d'un rejeu.
- Ordre : les garanties de Kafka ne valent qu'au sein d'une partition. Préciser la clé de partition attendue et ce que l'agrégation suppose (ou non) sur l'ordre.
- **Événements tardifs** : watermark par partition, délai accepté (issu de la phase 1), devenir des événements trop tardifs (correction d'historique ou rejet avec métrique).
- Signaler la contention et les allocations sur le chemin critique (par exemple la structure de l'état partagé, les structures concurrentes).

### 2.3 Calcul des indicateurs
- Fenêtres : glissantes ou par paliers (« tumbling »), tailles, alignement sur l'horloge. Stocker en UTC et afficher en heure de Paris.
- Indicateurs par gare logique : entrées, sorties, solde, cumuls journaliers, tendance, fraîcheur (dernier `eventTime`, dernière réception).
- Indicateurs globaux et par axe.
- **Scénario A uniquement** :
  - matrice origine-destination (observée) ;
  - affectation aux tronçons (**estimée**), en documentant l'algorithme, le graphe utilisé et ses limites.
- État courant : structure, taille mémoire estimée selon les scénarios de volumétrie, versionnement par numéro de séquence.
- Choix argumenté entre une agrégation dans l'application (état en mémoire et persistance périodique) et Kafka Streams. Recommander l'option la plus simple qui tient la charge cible.

### 2.4 Persistance et reprise
- Ce qui est persisté, où et pourquoi : référentiel, agrégats historiques, points de reprise de l'état, fenêtre de déduplication.
- Moteur proposé (par exemple PostgreSQL + PostGIS, avec TimescaleDB à évaluer pour les séries temporelles, en vérifiant leurs licences), schéma, rétention, purge.
- Reprise après redémarrage :
  - soit relire Kafka depuis un offset, soit repartir d'un point de reprise puis relire ;
  - temps de reprise visé ;
  - comportement visible côté navigateur pendant la reprise.

### 2.5 API REST
Spécification OpenAPI des points d'accès :
- référentiel (gares logiques, points, échangeurs) ;
- snapshot de l'état ;
- détail d'une gare ;
- séries historiques ;
- diagnostic ;
- import du référentiel (administration).

Préciser la pagination, la mise en cache (`ETag`), la compression et la versionnement de l'API.

### 2.6 Protocole temps réel
- Choix entre WebSocket et SSE, justifié.
- Messages, en JSON Schema : `snapshot`, `delta`, `heartbeat`, `freshness`, `resyncRequired`, `error`.
- Numéro de séquence global et version d'état. Détection d'un trou côté client, puis resynchronisation par snapshot.
- Regroupement des deltas à une fréquence configurable (par exemple 1 Hz). Taille maximale par message. Abonnement par emprise géographique ou par filtre, si cela réduit le volume.
- Contre-pression : client lent, file d'attente bornée, déconnexion.
- Reconnexion : délai exponentiel avec aléa, reprise par séquence si possible, snapshot sinon.
- Aucune connexion Kafka depuis le navigateur. Aucun événement brut ni donnée personnelle transmis au navigateur.

### 2.7 Sécurité et exploitation
- Configuration externalisée, secrets (Kafka SASL/TLS, base de données) hors du dépôt.
- Authentification et autorisation (OIDC, par exemple Keycloak), en indiquant ce qui est nécessaire au MVP.
- Limitation du nombre de connexions et du débit. Validation des entrées.
- Journaux structurés en JSON. Métriques Micrometer/Prometheus, techniques et métier. Contrôles de santé Actuator (vivant / prêt).
- Suivi du **retard de consommation** (« lag ») et de la fraîcheur. Alertes. Définition d'une donnée périmée et sa propagation jusqu'à l'interface.

### 2.8 Arborescence et tests backend
- Arborescence Maven ou Gradle du projet, avec les packages par module.
- Plan de tests :
  - validation du contrat ;
  - doublons et rejeu ;
  - événements tardifs ;
  - cohérence des agrégats (propriétés invariantes) ;
  - synchronisation snapshot/deltas ;
  - reprise après redémarrage ;
  - coupure Kafka (Testcontainers).
- **Générateur d'événements synthétiques** configurable (débit, pointes, doublons, retards, messages invalides), avec des événements identifiés comme simulés.

## Livrable attendu

Un **dossier d'architecture backend** en Markdown, dans cet ordre :
1. Synthèse et décisions structurantes.
2. Registre faits / hypothèses / décisions, mis à jour.
3. Sections 2.1 à 2.8.
4. Risques et questions ouvertes.

Inclure des extraits de code seulement pour les points délicats (déduplication, gestion des événements tardifs, regroupement des deltas). Le code doit être complet et compilable, sans pseudo-code.

Ne pas traiter le rendu cartographique ni l'animation : c'est la phase 3.
