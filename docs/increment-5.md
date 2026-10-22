# Incrément 5 — Industrialisation

> OIDC Keycloak, Prometheus/Grafana (livrés à l'incrément Compose), régression visuelle, banc de performance, durcissement.
> Critère de la roadmap : section 11 (phase 3) entièrement vérifiée. **Non atteint : voir section 5.**

## 1. Authentification OIDC (Keycloak)

| Élément | Choix |
|---|---|
| Activation | `SUPERVISION_PROFILE=auth` (profil Spring `auth`) ; **sans lui, comportement inchangé** : aucune authentification (démonstration et développement, Q12). Deux chaînes de sécurité exclusives, testées séparément. |
| Connexion | Flux « code d'autorisation » avec PKCE, côté serveur (`spring-boot-starter-security-oauth2-client`), session serveur. Les points de terminaison sont explicites (le navigateur joint `localhost:8180`, le backend `keycloak:8080`) : pas de découverte au démarrage. |
| Rôles | `VIEWER` (toute l'API de lecture) et `ADMIN` (+ `/api/v1/admin/**`). Les rôles de royaume Keycloak sortent dans la revendication `roles` du jeton d'identité (mappeur du royaume importé) puis deviennent `ROLE_*`. Tout chemin hors `/api/**` est refusé. |
| API | **401** sans session, jamais une redirection : le client décide. Le frontend interroge `GET /api/v1/me` avant toute donnée et lance la connexion sur 401 ; un flux coupé plus de 15 s déclenche la même vérification (session expirée). |
| CSRF | Actif **uniquement** sur `/api/v1/admin/**` (cookie lisible, renvoyé en `X-XSRF-TOKEN`). Les lectures n'en ont pas besoin. |
| Cookie de session | `HttpOnly`, **`SameSite=Lax`** et non `Strict` comme prévu en phase 2 : le retour de Keycloak est une navigation inter-sites qui doit emporter le cookie, sans quoi la connexion échoue. `Lax` suffit pour `EventSource` (même site). |
| Audit et budget | Journal `AUDIT` (utilisateur, route, filtres, statut) sur les flux O/D et l'administration, sans plaque ni identifiant de véhicule. **Budget de 120 requêtes O/D par minute et par utilisateur** (par adresse sans authentification), 429 + `Retry-After` au-delà : il freine le recoupement de flux masqués par interrogations successives (limite signalée à l'incrément 3). |
| Compose | Profil `auth` : Keycloak 26 (Apache-2.0) en mode développement, royaume `auth/realm-supervision.json` importé (secrets par variables d'environnement), utilisateurs `viewer` et `admin`. |
| nginx | Relaie `/oauth2`, `/login`, `/logout` avec l'hôte, le port et le protocole publics (l'URL de retour OIDC en dépend). |

## 2. Banc de performance du flux SSE

`scripts/bench_sse.py` (bibliothèque standard) ouvre N clients sur `/api/v1/stream` et mesure, par `delta`, le retard entre l'heure de données (watermark) et l'arrivée.

Mesure sur ce poste de développement (pile Compose complète, simulateur à 80 événements/s, nginx devant le backend) :

| Clients | Durée | Deltas reçus | Retard p50 / p95 / p99 / max | Resynchronisations | Refusés | Backend |
|---|---|---|---|---|---|---|
| 400 | 60 s | 23 737 | 0,23 / 0,42 / 0,77 / 1,18 s | 0 | 0 | 5 à 10 % d'un cœur, 350 à 550 Mo |

**Ce n'est pas une mesure de référence** : machine partagée, clients et serveur sur le même hôte. Le critère de latence de la roadmap (p95 ≤ 3 s) est tenu avec une marge d'un ordre de grandeur. La limite de 500 clients (`maxClients`) n'a pas été testée au-delà de 400.

## 3. Durcissement

- Déjà en place (incréments précédents) : conteneurs en lecture seule, `no-new-privileges`, utilisateur non root, limites mémoire, journaux en rotation, CSP et en-têtes dans nginx, ports internes liés à `127.0.0.1`.
- Ajouté : authentification et rôles, CSRF d'administration, audit, budget des requêtes O/D, secrets Keycloak par variables.
- Le CSP existant (`default-src 'self'`, pas d'`unsafe-eval`) est inchangé : la connexion est une navigation, pas un appel inter-origines.

## 4. Vérifications

| Vérification | Résultat |
|---|---|
| Sécurité (contexte minimal) : 401 sans session, lecteur/administrateur, CSRF limité à l'administration, tout hors API refusé, budget par utilisateur, traduction des rôles Keycloak ; chaîne ouverte inchangée | ✅ 7 tests |
| Intégration complète (Kafka, PostgreSQL) avec la sécurité désactivée | ✅ 7 tests |
| **Keycloak réel**, navigateur → nginx → backend → Keycloak : 401 sans session, connexion, accès aux données (état « Temps réel »), lecteur refusé (403), administrateur refusé sans jeton CSRF puis accepté (202), déconnexion | ✅ 4 scénarios (`e2e/auth.spec.ts`, job CI `e2e-auth`) |
| Régression : E2E réels sans authentification | ✅ 5 scénarios |
| Frontend : vérification de session (401, session valide, sans authentification, erreur) | ✅ 4 tests |
| Banc SSE à 400 clients | ✅ voir section 2 |

Défauts trouvés pendant la mise en place : le royaume importé n'avait pas d'e-mail ni de nom (Keycloak 26 impose la complétion du profil) ; la dernière requête d'API refusée était rejouée après la connexion (retour forcé vers l'application) ; le jeton CSRF en cookie était refusé par le brouillage XOR (gestionnaire simple) ; les variables d'authentification, exigées par Compose pour tous les profils, manquaient au `.env` du job E2E existant.

## 5. Non atteint ou à faire

- **Keycloak de production** : le profil `auth` est un Keycloak de développement (base H2 éphémère, HTTP, royaume réimporté à chaque démarrage). La production demande HTTPS, une base externe, un nom d'hôte public et la rotation des secrets. Les mots de passe `changez-moi` sont des valeurs de développement.
- **Déconnexion locale seulement** : elle ferme la session de l'application, pas celle de Keycloak (la connexion suivante peut être silencieuse). La déconnexion fédérée demande la découverte OIDC ou le point `end_session` explicite.
- **Sessions en mémoire** et budget de requêtes **par instance** : avec plusieurs instances du backend, il faudra une session partagée (ou un routage collant) et un budget partagé. Le backend est aujourd'hui une instance unique (écrivain unique).
- **Régression visuelle : non faite.** Les captures WebGL en rendu logiciel ne sont pas reproductibles d'un environnement à l'autre (polices, rastérisation) : des références comparées en CI échoueraient sans cause réelle. À reprendre avec des références produites dans l'image de CI elle-même, une fois le fond de carte réel disponible.
- **Fluidité d'affichage sur le poste de référence (Q20)** et **volumétrie réelle (Q4)** : toujours ouvertes ; le critère 7.3 (bascule éventuelle vers deck.gl) n'a donc pas été évalué.
- **Rendu du réseau et des tronçons** : dépend des tuiles OSM, bloquées ici (Q21) ; voir `docs/increment-4.md`.
- Section 11 : deux critères restent ouverts (fluidité sur le poste de référence, et la validation de la charge estimée sur 3 axes de l'incrément 4).
