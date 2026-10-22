/** Identité courante (`GET /api/v1/me`). Sans authentification configurée côté serveur : `authenticated` est faux et l'accès est libre. */
export interface Me {
  readonly authenticated: boolean;
  readonly name: string | null;
  readonly roles: readonly string[];
}

/** Point d'entrée de la connexion OIDC (Spring Security) ; le serveur répond 401 à l'API, jamais une redirection. */
export const LOGIN_URL = '/oauth2/authorization/keycloak';

export type SessionResult =
  | { readonly kind: 'ready'; readonly me: Me }
  | { readonly kind: 'login' };

export async function checkSession(fetchFn: typeof fetch = fetch, signal?: AbortSignal): Promise<SessionResult> {
  const response = await fetchFn('/api/v1/me', signal === undefined ? {} : { signal });
  if (response.status === 401) {
    return { kind: 'login' };
  }
  if (!response.ok) {
    throw new Error(`Session indisponible (${response.status})`);
  }
  return { kind: 'ready', me: (await response.json()) as Me };
}
