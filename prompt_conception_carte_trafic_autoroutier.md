# Conception d'une application web de visualisation temps réel du trafic autoroutier français

## 1. Rôle

Agis comme un architecte logiciel senior spécialisé dans :
- Les applications cartographiques WebGL à hautes performances.
- La visualisation géospatiale de flux en temps réel.
- Java, Spring Boot et Apache Kafka.
- React, TypeScript et les interfaces de supervision.
- L'optimisation des animations graphiques dans les navigateurs.
- Les architectures open source, déployables en environnement autonome.

Ta mission est de concevoir une application web professionnelle permettant de visualiser et d'animer le trafic de véhicules sur le réseau autoroutier français à partir d'événements JSON publiés dans Kafka.

La qualité cartographique, la lisibilité et la fluidité de l'animation sont les critères prioritaires.

Ne te limite pas à une proposition conceptuelle : produis une architecture technique détaillée, justifiée et directement exploitable pour une implémentation.

## 2. Objectif fonctionnel

Développer une application web affichant une carte interactive de la France comprenant :
- Le réseau autoroutier français et ses principaux échangeurs.
- Toutes les gares présentes dans un référentiel fourni par l'utilisateur.
- Les informations disponibles pour chaque gare, notamment son identifiant, son nom, ses coordonnées GPS et ses attributs métier.
- Une visualisation animée des flux de véhicules calculés à partir des événements d'entrée et de sortie des gares.
- Des indicateurs synthétiques et détaillés sur l'activité du réseau.

Les événements proviennent de topics Kafka et sont encodés en JSON.

L'application doit fonctionner en temps réel, permettre l'exploration géographique et rester fluide même avec un volume élevé d'événements.

## 3. Contraintes technologiques

Privilégier exclusivement des composants open source.

Backend :
- Java 25 et Spring Boot 4
- Spring for Apache Kafka 4 pour la consommation des événements.
- API REST pour le chargement initial des données et les requêtes de détail.
- WebSocket avec Spring pour la diffusion des mises à jour temps réel.
- SSE peut être évalué comme alternative si le canal est strictement unidirectionnel.
- Stockage persistant uniquement lorsque nécessaire pour l'historique, les référentiels ou la reprise après incident.

Frontend :
- React.
- TypeScript en mode strict.
- Vite.
- MapLibre GL JS comme moteur cartographique principal.
- deck.gl en complément uniquement si les besoins d'animation ou les mesures de performance le justifient.
- Gestion d'état adaptée aux données temps réel.
- Tests automatisés pertinents et outillage de qualité open source.

Les licences doivent être compatibles avec une utilisation professionnelle, y compris commerciale. Vérifier les licences des dépendances, des jeux de données et des services cartographiques.

Ne pas imposer de service cartographique propriétaire, de clé API payante ou de composant propriétaire.

## 4. Exigences cartographiques

La carte constitue l'élément principal de l'application.

Concevoir une représentation cartographique professionnelle, précise et visuellement hiérarchisée.

Elle doit inclure :
- Un fond cartographique vectoriel détaillé.
- Une représentation reconnaissable de la France métropolitaine.
- Le tracé des autoroutes et de leurs échangeurs.
- Les numéros d'autoroutes et les principaux repères géographiques.
- Les gares représentées par des symboles distinctifs.
- Des libellés lisibles et adaptés au niveau de zoom.
- Une navigation fluide par zoom, déplacement et recentrage.
- Un ajustement initial de la caméra pour cadrer la France.
- Une adaptation du niveau de détail au zoom.
- Des filtres géographiques et métier.

Étudier les sources de données géographiques ouvertes permettant de disposer d'une géométrie routière exploitable.

Ne pas supposer que les seules coordonnées GPS des gares suffisent pour dessiner les autoroutes.

Définir comment construire, enrichir ou importer le réseau routier sous forme de géométries exploitables par le moteur cartographique.

Comparer les possibilités d'utilisation directe de tuiles vectorielles, de données GeoJSON et d'un serveur de tuiles auto-hébergé.

Privilégier une solution permettant de contrôler le style, la disponibilité et les performances de la carte en production.

Prévoir l'attribution des données géographiques et le respect des licences applicables.

## 5. Modèle de données des gares

La liste des gares sera fournie par l'utilisateur sous un format à préciser. voir fichier gares-peage-2025.csv et echangeurs-rrnc-2025.csv

Définir un modèle normalisé comprenant au minimum :
- Identifiant métier stable.
- Nom de la gare.
- Latitude et longitude.
- Attributs métier disponibles.
- Éventuels rattachements au réseau autoroutier.
- Métadonnées utiles à la recherche et à l'affichage.

Prévoir :
- L'import initial du référentiel.
- La validation des coordonnées.
- La détection des identifiants dupliqués.
- La gestion des gares sans coordonnées valides.
- La mise à jour du référentiel sans redéploiement du frontend.
- Le rapprochement fiable entre les identifiants des événements Kafka et ceux des gares.

## 6. Intégration Kafka

Les événements sont publiés dans un ou plusieurs topics Kafka.

Ne pas inventer leur schéma définitif. Définir un contrat d'événement provisoire, clairement identifié comme tel, à valider à partir d'exemples réels.

Le contrat devra prendre en compte, selon les informations disponibles :
- Identifiant unique de l'événement.
- Identifiant de la gare.
- Type d'événement : entrée ou sortie.
- Horodatage métier.
- Nombre de véhicules représentés par l'événement, si disponible.
- Métadonnées éventuelles.

Préciser comment gérer les événements tardifs, les doublons, les erreurs de parsing, les messages invalides et les reprises de consommation.

Distinguer l'heure de l'événement de l'heure de réception.

Éviter qu'un événement rejoué ou consommé plusieurs fois ne double artificiellement les volumes.

Définir une stratégie de partitionnement et de traitement compatible avec l'ordre des événements, en tenant compte des garanties réelles de Kafka.

Documenter le comportement en cas de coupure Kafka, de redémarrage du backend ou de perte temporaire de connexion du navigateur.

## 7. Calcul des flux de véhicules

Définir précisément les indicateurs calculables à partir des événements disponibles :
- Entrées par gare sur une fenêtre temporelle.
- Sorties par gare sur une fenêtre temporelle.
- Volumes cumulés.
- Évolution temporelle.
- Différence entre entrées et sorties.
- Flux entre gares lorsque leur relation peut être établie de manière fiable.

Distinguer clairement les mesures observées des estimations.

Ne jamais présenter une position de véhicule comme réelle si elle est seulement interpolée ou simulée.

Étudier plusieurs niveaux de visualisation :
1. Activité instantanée des gares.
2. Flux directionnels entre gares ou groupes de gares.
3. Intensité estimée sur les tronçons autoroutiers.
4. Évolution historique et comparaison temporelle.

Préciser quelles données supplémentaires sont nécessaires pour calculer des flux entre gares ou affecter ces flux aux tronçons routiers.

Ne pas attribuer arbitrairement un trajet à un véhicule uniquement parce qu'une entrée et une sortie ont été observées.

## 8. Conception de l'animation

L'animation est une fonctionnalité centrale et doit être conçue comme un véritable moteur de visualisation temps réel.

Étudier des représentations complémentaires :
- Pulsations discrètes sur les gares actives.
- Cercles proportionnels aux volumes.
- Lignes directionnelles entre points reliés.
- Flux animés le long des géométries routières lorsque le trajet est connu ou estimé.
- Variation de couleur ou d'épaisseur selon l'intensité.
- Agrégation visuelle à petite échelle.
- Détails progressifs lors du zoom.

L'animation doit être élégante, informative et non décorative.

Éviter les marqueurs qui clignotent de manière permanente, les effets excessifs, la surcharge visuelle et les déplacements de véhicules fictifs non justifiés par les données.

Séparer strictement :
- L'ingestion des événements.
- L'état métier courant.
- La préparation des données géographiques.
- La boucle d'animation graphique.
- Le rendu WebGL.

Ne pas déclencher un rendu complet React à chaque événement Kafka.

Étudier l'utilisation de sources et de couches MapLibre mises à jour par lots, de buffers optimisés et, si nécessaire, de couches deck.gl accélérées par GPU.

La progression des animations doit être indépendante du nombre de messages reçus et du rythme de rendu du navigateur.

Prévoir un comportement dégradé sur les machines moins puissantes et respecter les préférences de réduction des animations.

## 9. Architecture temps réel backend/frontend

Proposer une architecture dans laquelle :
- Le backend consomme Kafka de manière asynchrone.
- Les événements sont validés et agrégés.
- Un état courant est maintenu ou reconstruit.
- Le frontend obtient un snapshot initial cohérent.
- Les mises à jour suivantes sont diffusées sous forme de deltas.
- Le frontend applique les deltas sans recharger toute la carte.

Définir un protocole de synchronisation comprenant :
- Un numéro de séquence ou une version d'état.
- La détection des messages manquants.
- La resynchronisation par snapshot.
- La gestion des reconnexions.
- Le regroupement des mises à jour à une fréquence configurable.
- La limitation de la taille des messages.
- La propagation de l'état de fraîcheur des données.

Préciser les différences entre les événements Kafka, les agrégats métier et les messages transmis aux navigateurs.

Éviter d'ouvrir une connexion Kafka directement depuis le navigateur.

## 10. Interface utilisateur

Concevoir une interface de supervision moderne, professionnelle et centrée sur la carte.

L'écran principal doit comprendre :
- Une carte occupant l'essentiel de l'espace disponible.
- Un bandeau d'indicateurs globaux.
- Un panneau de recherche et de filtres.
- Une légende explicite.
- Un panneau de détail de gare au clic.
- Des indicateurs d'entrées, de sorties et d'activité.
- L'heure de dernière mise à jour.
- L'état de connexion au flux temps réel.
- Des commandes de visibilité des couches.
- Des contrôles de lecture, pause et vitesse de lecture pour le mode historique, si celui-ci est implémenté.

Prévoir au minimum :
- Une vue France entière.
- Une vue régionale.
- Une vue détaillée d'une gare.
- Un mode de diagnostic des événements et de leur fraîcheur.

L'interface doit être responsive, mais la priorité est donnée à une expérience desktop de qualité.

Proposer une direction artistique précise : palette, hiérarchie visuelle, symboles, typographie, épaisseur des routes, contrastes, couleurs des flux et règles de densité selon le zoom.

## 11. Performance et volumétrie

Ne pas affirmer de capacité maximale sans mesure.

Définir des scénarios de charge paramétrables portant sur :
- Le nombre de gares.
- Le nombre d'événements par seconde.
- Le nombre de tronçons routiers.
- Le nombre de connexions simultanées.
- Le volume de données transmis aux navigateurs.
- La durée de conservation des historiques.

Proposer des objectifs de performance mesurables pour :
- Le chargement initial de la carte.
- Le temps entre réception Kafka et affichage.
- La fluidité de l'animation.
- La consommation CPU et mémoire.
- La reconnexion et la resynchronisation.
- La stabilité sous charge.

Établir un plan de profilage permettant de décider objectivement si MapLibre seul suffit ou si deck.gl est nécessaire.

Éviter le transfert intégral des événements bruts vers tous les navigateurs lorsque des agrégats ou des deltas suffisent.

## 12. Sécurité et exploitation

Prévoir :
- La configuration externalisée des connexions Kafka.
- La gestion sécurisée des secrets.
- L'authentification et l'autorisation si nécessaires.
- La validation des messages entrants.
- La limitation des connexions et des débits.
- Des journaux structurés.
- Des métriques techniques et métier.
- Des contrôles de santé.
- La surveillance du retard de consommation Kafka.
- La gestion explicite des données périmées.

Proposer une solution de déploiement conteneurisée et reproductible.

Évaluer Docker Compose pour le développement et les environnements de démonstration.

Ne pas introduire de dépendance propriétaire obligatoire.

## 13. Tests et validation

Définir les vérifications nécessaires :
- Validation du contrat JSON.
- Traitement des doublons et des événements tardifs.
- Cohérence des agrégats.
- Synchronisation snapshot/deltas.
- Reconnexion et reprise après incident.
- Exactitude des positions des gares.
- Qualité du rendu du réseau routier.
- Fluidité des animations sous charge.
- Compatibilité avec différentes résolutions.
- Accessibilité des contrôles et lisibilité des couleurs.

Définir des jeux de données synthétiques permettant de tester le système sans dépendre d'un flux de production.

Prévoir une démonstration reproductible avec Kafka, un jeu de gares et des événements simulés clairement identifiés.

## 14. Livrables attendus

Produire les livrables suivants dans cet ordre :

1. Synthèse des choix architecturaux et justification du moteur cartographique.
2. Comparatif argumenté des solutions frontend open source.
3. Architecture globale et diagrammes de séquence.
4. Architecture détaillée du traitement Kafka et du calcul des flux.
5. Modèles de données et contrats JSON provisoires.
6. Stratégie de représentation géographique du réseau autoroutier.
7. Spécification du moteur d'animation.
8. Maquette fonctionnelle de l'interface et règles graphiques.
9. API REST et protocole WebSocket détaillés.
10. Arborescence des projets backend et frontend.
11. Stratégie de stockage, reprise et resynchronisation.
12. Plan de performance et critères d'acceptation.
13. Plan de validation et de tests.
14. Proposition de déploiement Docker Compose.
15. Roadmap d'implémentation par incréments, avec les risques et dépendances de chaque étape.

Pour chaque technologie, indiquer le rôle, la licence open source, les avantages, les limites et les alternatives pertinentes.

Séparer explicitement les faits connus, les hypothèses et les décisions restant à prendre.

Ne pas produire une architecture inutilement complexe. Privilégier un monolithe modulaire Spring Boot tant que les volumes mesurés ne justifient pas une séparation en services.

## 15. Critères de réussite

La solution sera considérée comme satisfaisante si :
- Le réseau autoroutier français est géographiquement crédible et lisible.
- Toutes les gares du référentiel sont correctement positionnées.
- Les événements Kafka mettent à jour la visualisation sans rechargement complet.
- Les animations restent fluides sous la charge cible.
- Les flux affichés sont cohérents avec les données réellement disponibles.
- Les données observées sont distinguées des estimations.
- Le système se resynchronise après une interruption.
- La solution est exploitable sans dépendance logicielle propriétaire.
- Le code et la configuration sont reproductibles.
- Les licences et les sources cartographiques sont documentées.

Commence par l'architecture et les décisions structurantes. N'implémente pas prématurément avant d'avoir explicité les hypothèses critiques, le modèle de flux et les contraintes de performance.
