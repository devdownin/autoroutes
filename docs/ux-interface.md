# Interface : refonte du panneau latéral et des flux O/D

Suite aux suggestions UI/UX. Six changements, tous côté frontend (aucune modification de l'API).

| # | Changement | Détail |
|---|---|---|
| 1 | **Sections repliables** | Le panneau latéral est un accordéon (`Section`) : « Couches et gares », « Flux O/D », « Charge estimée », « Légende ». Une seule section est ouverte à la fois, donc le panneau tient dans l'écran quel que soit le nombre de couches actives. Activer une couche à section propre (flux O/D, charge estimée) ouvre sa section. Les sections portent `aria-expanded` et `aria-controls`. |
| 1 | **Relecture en barre de lecture** | Elle quitte le panneau pour le pied de la carte : un bouton « Relecture » qui déploie début, durée, vitesse ; pendant la relecture, lecture/pause, vitesse, **barre d'avancement**, heure virtuelle et « Retour au direct ». |
| 2 | **Flux internes masqués par défaut** | Au niveau départements, les flux d'un département vers lui-même dominaient la liste sans être tracés. Ils sont masqués (case « Inclure les flux internes », compteur « N flux internes masqués »). La mention « observé » est portée une seule fois, par l'en-tête de section. |
| 3 | **Liste ↔ carte** | Survoler ou focaliser une ligne met en évidence son arc (plus épais, les autres s'estompent, par `feature-state`) ; cliquer cadre la carte sur les deux extrémités. Les lignes sont des boutons : tout est faisable au clavier. |
| 4 | **États vides et erreurs utiles** | Chaque vide propose l'issue adaptée : afficher les flux internes, retirer les filtres, ou passer par départements. L'erreur O/D propose « Réessayer ». L'absence d'estimation de charge explique ses deux causes possibles et renvoie à la procédure. |
| 6 | **Légende contextuelle** | Une ligne par couche affichée, avec sa nature (observé ou estimé) ; l'avertissement sur le trafic non mesuré n'apparaît qu'avec les flux ou la charge. |
| 8 | **Info-bulle au survol d'une gare** | Nom, type et axe, passages sur 15 min, dernier passage ou « données périmées », sans cliquer. Un seul événement par image d'animation ; positionnée pour ne pas sortir de la carte. |

## Vérifications

- 97 tests Vitest (dont des tests de composants : accordéon, listes, états vides, relecture, info-bulle ; et les calculs purs : légende, avancement, position de l'info-bulle, filtrage des flux internes).
- E2E de démonstration (5 scénarios, dont l'info-bulle, la légende contextuelle, l'axe-core sans violation grave) et E2E réels (5 scénarios, dont le masquage des flux internes) verts.
- Vérifié visuellement sur la pile réelle (captures) : panneau dans l'écran à 1 440 × 900, barre de relecture, mise en évidence puis cadrage d'un flux.

## Limites

- Le comportement « une section à la fois » ferme « Couches et gares » quand on ouvre les flux O/D : il faut rouvrir la section pour décocher une couche. Choix assumé en échange de la tenue en hauteur.
- Rendu jugé sans fond de carte (tuiles OSM non disponibles ici) : le contraste des arcs mis en évidence reste à revoir sur le vrai fond.
- Écrans étroits : la barre de relecture passe à la ligne ; le panneau latéral en tiroir (suggestion 11) n'est pas fait.

---

# Suite : tiroir sur petit écran, visite guidée et aide

| # | Changement | Détail |
|---|---|---|
| 11 | **Panneau en tiroir** | Sous 900 px, le panneau latéral devient un tiroir ouvert par un bouton « ☰ » de la barre du haut (`aria-expanded`, `aria-controls`). Fermé, il est retiré de l'ordre de tabulation (`visibility`). Ouverture : le focus va à la recherche ; Échap ou un clic sur le fond le ferme et rend le focus au bouton ; choisir une gare ou un flux le ferme pour montrer la carte. Retour en grand écran : il se referme. Le détail d'une gare devient une feuille bornée à 55 % de la hauteur ; les indicateurs secondaires de la barre du haut sont masqués ; `prefers-reduced-motion` supprime la glissière. |
| 12 | **Page « À propos des données »** | Bouton « ? Aide » : une boîte de dialogue native (focus piégé, Échap) qui rassemble ce qui était dispersé en notes : ce que l'on voit, observé ou estimé, le seuil de 3 véhicules, ce qui n'est pas mesuré, la fraîcheur, la relecture, les sources. Elle a une adresse partageable, **`#a-propos`**, et le bouton « précédent » la referme. |
| 12 | **Visite guidée** | Proposée à la première visite (cinq étapes : carte, fraîcheur, panneau, relecture, aide ; les étapes dont la cible n'existe pas, comme la relecture en démonstration, sont sautées). Chaque étape met en évidence son élément et place sa carte près de lui sans sortir de l'écran ; sur téléphone, l'étape du panneau ouvre le tiroir. Passer, Échap ou Terminer la mémorisent (`localStorage`, avec repli si le stockage est refusé) ; elle se relance depuis l'aide. Jamais proposée quand l'aide est ouverte par son adresse. |

## Vérifications

- 112 tests Vitest (placement de la carte de visite, mémorisation et repli du stockage, parcours, saut des cibles absentes, ouverture du tiroir par la visite, aide, bouton du tiroir).
- E2E de démonstration, réels et d'authentification verts ; nouveaux scénarios `tour.spec.ts` (parcours, mémorisation, Échap, `#a-propos`, téléphone) et `responsive.spec.ts` (tiroir : fermé par défaut, focus, Échap, fond, choix d'une gare ; pas de défilement horizontal ; axe-core ; grand écran sans bouton).
- Les scénarios existants partent d'un navigateur où la visite est déjà faite (`e2e/fixtures.ts`) ; seul `tour.spec.ts` teste la visite.
- Vérifié visuellement (captures à 1 440 × 900 et 390 × 844).

## Limites

- La visite et l'aide sont en français uniquement, comme le reste de l'interface.
- Les textes de l'aide décrivent l'état actuel du produit (seuil, fenêtres de retard, relecture sur 7 jours) : à tenir à jour avec lui.
- Tablette en paysage entre 900 et 1 100 px : le panneau reste fixe à 300 px ; non revu.

---

# Noms des autoroutes sur la carte

Étiquettes « A7 », « A6 »… posées sur la carte, qui mettent l'axe en évidence et s'accordent avec le filtre « Axe » des flux O/D.

| Élément | Choix |
|---|---|
| Source | Le référentiel des gares porte l'axe de chaque gare (`A0007`, `A0007N`, `N0159`). Les codes d'une même autoroute sont **regroupés** (A0007 et A0007N → « A7 »). Aucune tuile ni police n'est nécessaire : les étiquettes sont des éléments HTML posés sur de vraies gares de l'axe. |
| Placement | Une étiquette par axe à l'échelle du pays, davantage en zoomant (1, 2, 3, 5 puis 8 par axe), réparties le long de l'axe ; évitement des collisions en gardant les axes les mieux fournis en gares. Recalcul à chaque fin de déplacement, marqueurs conservés (pas de clignotement). |
| Survol | Les gares de l'axe reçoivent un anneau, les autres s'estompent ; l'étiquette s'illumine. |
| Clic | Applique le filtre **Axe** des flux O/D (la valeur regroupe tous les codes de l'axe), active la couche des flux et ouvre sa section ; un second clic retire le filtre. Choisir un axe dans la liste du panneau produit la même mise en évidence : liste et carte sont liées dans les deux sens. |
| Panneau | Case « Noms des autoroutes » (affichés par défaut), ligne dédiée dans la légende ; la liste « Axe » affiche « A7 » au lieu de « A0007 » ; les gares (info-bulle, détail) affichent aussi les noms usuels. |
| Accessibilité | Étiquettes `aria-hidden` (aide à la souris et au toucher) ; le clavier et les lecteurs d'écran passent par la liste « Axe » du panneau. |
| Couche native | Quand les tuiles OSM seront produites, la couche native de références (`motorways-ref`) est masquée tant que ces étiquettes sont affichées, pour éviter les doublons. |

## Vérifications

- 131 tests Vitest (regroupement des codes, libellés, répartition le long de l'axe, évitement de collision et priorité, nombre d'étiquettes selon le zoom, sélection par clic et second clic, liste « Axe » regroupée).
- E2E de démonstration (étiquettes posées, survol, sélection, masquage, légende) et E2E réel : le clic sur un nom émet bien la requête `/api/v1/od?…axis=…` et la liste « Axe » prend la valeur.
- Vérifié visuellement (captures) : étiquettes lisibles à l'échelle du pays ; survol de l'A7 : gares de l'axe cerclées, autres estompées.

## Limites

- Les étiquettes sont placées **sur des gares** et non sur le tracé : sur un axe peu pourvu en gares, le nom est approximatif. Elles seront remplacées par la couche native quand le tracé OSM existera.
- En démonstration, le clic met l'axe en évidence mais ne filtre pas les flux (le filtre est appliqué par le serveur ; le flux simulé du navigateur n'en tient pas compte).
- Les routes nationales du référentiel (N159, N523…) sont étiquetées comme les autoroutes.

---

# Recherche, fiche de gare, légende chiffrée et gares les plus actives

| Élément | Choix |
|---|---|
| Recherche | Un seul champ pour les **gares** (nom, sans accents ni casse) et les **autoroutes** (« A7 », « a 07 », « A0007 »). Axes d'abord quand le texte en désigne un, puis noms commençant par le texte, puis noms le contenant ou gares de l'axe ; 12 résultats au plus, chacun avec son axe et son département. Gare : cadrage et fiche. Autoroute : filtre « Axe » posé (jamais retiré par une seconde recherche), couche des flux activée, carte cadrée sur les gares de l'axe. |
| Clavier | `/` met le focus sur le champ (ouvre le tiroir sur petit écran), sauf pendant une saisie ou devant une fenêtre ; ↓ descend dans les résultats, ↑ remonte, Entrée ouvre le premier, Échap vide. |
| Fiche de gare | La fiche (fenêtres 5 min à aujourd'hui, courbe J / J-7) gagne les **principaux flux** de la gare (5 au plus, « Vers » / « Depuis »), lus dans la liste déjà chargée : mêmes filtres et même seuil de 3 véhicules que la section « Flux O/D », survol = arc mis en évidence, clic = carte cadrée. Sans la couche des flux, un bouton l'affiche ; au niveau départements, la fiche l'explique. |
| Légende | La charge estimée a une **échelle continue** (dégradé de la carte, repères 0 / moitié / maximum arrondis à 2 chiffres, « ≥ » pour le plafond), calculée sur les mêmes charges que la carte (95e centile, comme `diffSegmentLoads`) ; l'estimation reste signalée par ses tirets. |
| Gares les plus actives | Section « Gares les plus actives » (observé) : 8 gares au plus, classées sur 1 h, rafraîchies toutes les 10 s, avec une **courbe** des 3 dernières heures par quart d'heure (historique du serveur, rechargée toutes les minutes) ; chiffre sans courbe en démonstration et en relecture. Texte accessible : maximum et sens (hausse, baisse, stable à ±10 %). |

## Vérifications

- 160 tests Vitest dont la recherche (accents, graphies d'axe, classement, plafond), le clavier, les courbes, le classement, les flux de gare, l'échelle de légende.
- E2E de démonstration : `/` puis « a7 » + Entrée, et la section des gares les plus actives jusqu'à la fiche.

## Limites

- **Pas de répartition par classe de véhicule** dans la fiche : le flux temps réel ne la porte pas. Les principaux flux dépendent de la couche et des filtres de la section « Flux O/D » (au plus 500 flux lus par l'API).
- Pas de courbe par flux ni par autoroute : l'historique est par gare ; les « autoroutes les plus actives » avec courbe demanderaient un endpoint d'agrégation.
- En démonstration, l'historique n'existe pas : le classement n'a pas de courbes.
