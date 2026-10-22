# Incrément 3 — Flux origine → destination

> Flux O/D OBSERVÉS (scénario A : la sortie porte la gare d'entrée), seuil de diffusion RGPD, filtres par axe et département, lecture nationale par département.
> Critère de la roadmap (phase 3, section 10.2) : **Σ O/D = sorties − manquants (± 0,5 %)**.

## 1. Cohérence : chaque sortie a exactement une issue

Le critère n'est pas vérifié après coup par une estimation : il est **tenu par construction** et contrôlé en continu.
À l'application d'une sortie, l'écrivain unique lui attribue une issue (en véhicules) :

| Issue | Sens |
|---|---|
| `RECORDED` | gare d'entrée connue : flux observé |
| `OPEN_SYSTEM` | sortie à une barrière pleine voie : aucune origine attendue, **pas une anomalie** |
| `ENTRY_MISSING` | gare d'échangeur sans gare d'entrée : donnée manquante |
| `ENTRY_UNKNOWN` | nom de gare d'entrée absent de la table d'alias |

`recorded + openSystem + entryMissing + entryUnknown` = **sorties de toutes les gares** sur la même fenêtre (tranches de 15 min alignées). Les « manquants » du critère sont `entryMissing + entryUnknown`.
Chaque instantané O/D publié contient aussi les sorties des gares, lues dans l'état par gare (source indépendante) : `gap` est leur écart absolu, `gapRatio` l'écart relatif. Les doublons, rejets et quarantaines n'entrent dans aucun des deux côtés.

- `GET /api/v1/od/coverage` : issues, sorties des gares, écart, part des sorties en système fermé dont l'origine est connue.
- Prometheus : `toll_od_origin_known_ratio`, `toll_od_reconciliation_gap_ratio` ; alertes `OdOrigineConnueFaible` (< 90 % pendant 15 min) et `OdRapprochementEnEcart` (> 0,5 % pendant 15 min) ; panneau Grafana « Couverture et rapprochement des flux O/D ».
- Point de reprise **version 2** : il porte la couverture. Un point de reprise version 1 reste lisible ; la couverture repart alors à vide et l'écart est visible pendant l'heure qui suit la montée de version (l'alerte le mentionne).

## 2. Lecture filtrée et seuil RGPD

`GET /api/v1/od?level=STATION|DEPARTMENT&department=69,13&axis=A0007&role=ANY|ORIGIN|DESTINATION&limit=500`

1. Les **filtres s'appliquent avant** l'agrégation : `role` choisit le côté (origine, destination, ou l'un ou l'autre) auquel s'appliquent département et axe.
2. L'**agrégation** au niveau demandé (gare, ou département de la gare) additionne les cellules.
3. Le **seuil de 3 véhicules s'applique après** l'agrégation, côté serveur, et ne peut pas être abaissé (`minVehicles` < 3 est relevé à 3). Deux flux de 2 véhicules entre stations deviennent un flux de 4 au niveau départemental : le seuil porte sur ce qui est diffusé.
4. Les flux sous le seuil ne sont **jamais listés** : la réponse ne donne que leur nombre et leur volume (`masked: {flows, vehicles}`), plus `totalVehicles` et `truncated` si la limite coupe la liste.

L'historique (`/api/v1/history/od`, jusqu'à 93 jours) utilise **le même service** : mêmes niveaux, filtres, seuil. Les cellules sont lues dans `od_hour` (restreintes aux gares candidates côté SQL, puis filtrées exactement en Java), sans nouvelle table.

Limite assumée : un observateur qui interroge plusieurs fenêtres ou combinaisons de filtres peut, par différence, retrouver un flux masqué. Atténuation : fenêtres multiples de 15 minutes, plancher à 3, pas d'identifiant ni de plaque dans l'API. Une protection par différence (bruit, budget de requêtes) relève de l'incrément 5 (authentification et audit).

## 3. Lisibilité nationale

- Niveau **Départements** : un arc par couple de départements, extrémités au centre des gares du département (fournies par l'API, `nodes`). Les flux internes à un département sont listés (« interne ») mais non tracés.
- Niveau **Gares** : 60 flux les plus importants sans sélection ; **tous** les flux d'une gare sélectionnée.
- Panneau « Flux O/D » : niveau, département, axe, côté du filtre ; dix principaux flux avec la mention « observé » ; note sur les flux masqués ; lecture toutes les 10 s et **aussitôt** à chaque changement de filtre (une réponse tardive d'anciens filtres est ignorée).
- Relecture : les flux de l'heure écoulée sont rechargés tous les 15 minutes virtuelles **et** à chaque changement de filtre, avec les mêmes filtres.
- Diagnostic : part des sorties avec origine connue et sorties sans origine (système ouvert).
- Démonstration hors ligne : flux simulés dans le navigateur, sans filtres (le serveur filtre).

## 4. Vérifications

| Vérification | Résultat |
|---|---|
| Invariant sur 2 000 événements aléatoires (entrées, sorties, entrées connues, absentes, inconnues, doublons rejoués) | ✅ somme des issues = sorties des gares, exactement |
| Seuil après agrégation, filtres par côté, axe, département, troncature, gare sortie du référentiel | ✅ 5 tests `OdQueryServiceTest` |
| Point de reprise v2 (aller-retour) et lecture d'un v1 | ✅ `CheckpointCodecTest` |
| Intégration (Kafka et PostgreSQL réels) : flux filtrés direct et historique, niveau département, `gap` = 0, système ouvert compté | ✅ SupervisionIT |
| Pile complète (simulateur → Kafka → backend → nginx), 80 événements/s | ✅ `gap` = 0 sur 644 sorties (257 enregistrées, 387 en système ouvert, 0 manquante) |
| E2E réels (5 scénarios dont le flux O/D : liste, niveau département, seuil, écart ≤ 0,5 %) | ✅ |
| Supervision : 14 règles saines, 16 panneaux alimentés | ✅ |

## 5. Limites et suites

- Le simulateur produit surtout des sorties en système ouvert (60 % des sorties dans la mesure ci-dessus) et peu de flux ≥ 3 véhicules par heure : la lisibilité nationale doit être jugée sur des **données réelles** (Q4).
- Les flux O/D ne couvrent que les trajets **entre deux gares du réseau mesuré** : le trafic gratuit n'est pas observé. L'interface ne présente donc que du « observé ».
- Les centres de départements sont des moyennes de gares, pas des centroïdes administratifs : suffisant pour l'arc, à ne pas lire comme un lieu.
- Prochain incrément (4) : charge estimée des tronçons, qui réutilise la matrice O/D (Q10 et H21 restent ouvertes).
