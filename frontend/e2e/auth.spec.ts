import { expect, test } from './fixtures';

/**
 * Connexion OIDC réelle : navigateur → nginx → backend → Keycloak.
 * Exécuté seulement avec E2E_AUTH=1 contre la pile « full,auth » (SUPERVISION_PROFILE=auth).
 * Identifiants : E2E_VIEWER_PASSWORD et E2E_ADMIN_PASSWORD (ceux de .env).
 */
test.describe('authentification OIDC (Keycloak)', () => {
  test.skip(process.env.E2E_AUTH !== '1', 'E2E_AUTH=1 requis');

  const login = async (page: import('@playwright/test').Page, username: string, password: string) => {
    await page.goto('/');
    await page.waitForURL(/\/realms\/supervision\/protocol\/openid-connect\/auth/);
    await page.getByLabel(/username/i).fill(username);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
  };

  test('sans session : API en 401, puis connexion et accès aux données', async ({ page, request }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    expect((await request.get('/api/v1/snapshot')).status()).toBe(401);
    expect((await request.get('/api/v1/stream')).status()).toBe(401);

    await login(page, 'viewer', process.env.E2E_VIEWER_PASSWORD ?? '');

    await expect(page.getByRole('status')).toHaveText('Temps réel', { timeout: 30_000 });
    await expect(page.locator('.account-name')).toHaveText('viewer');
    expect((await page.request.get('/api/v1/snapshot')).status()).toBe(200);
    const me = await (await page.request.get('/api/v1/me')).json() as { roles: string[] };
    expect(me.roles).toEqual(['VIEWER']);
    expect(errors).toEqual([]);
  });

  test('un lecteur ne peut pas administrer ; un administrateur doit présenter le jeton CSRF', async ({ page }) => {
    await login(page, 'viewer', process.env.E2E_VIEWER_PASSWORD ?? '');
    await expect(page.getByRole('status')).toHaveText('Temps réel', { timeout: 30_000 });
    expect((await page.request.post('/api/v1/admin/quarantine/replay')).status()).toBe(403);
  });

  test('administrateur : refusé sans jeton CSRF, accepté avec', async ({ page, context }) => {
    await login(page, 'admin', process.env.E2E_ADMIN_PASSWORD ?? '');
    await expect(page.getByRole('status')).toHaveText('Temps réel', { timeout: 30_000 });
    expect((await page.request.post('/api/v1/admin/quarantine/replay')).status()).toBe(403);

    // Jeton posé par le serveur dans un cookie lisible (double soumission) : lu, puis renvoyé en en-tête.
    await page.request.get('/api/v1/me');
    const token = (await context.cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value;
    expect(token).toBeDefined();
    const accepted = await page.request.post('/api/v1/admin/quarantine/replay', { headers: { 'X-XSRF-TOKEN': token ?? '' } });
    expect(accepted.status()).toBe(202);
  });

  test('la déconnexion met fin à la session côté application', async ({ page }) => {
    await login(page, 'viewer', process.env.E2E_VIEWER_PASSWORD ?? '');
    await expect(page.getByRole('status')).toHaveText('Temps réel', { timeout: 30_000 });
    const status = await page.evaluate(async () => {
      await fetch('/logout', { method: 'POST' });
      return (await fetch('/api/v1/me')).status;
    });
    expect(status).toBe(401);
  });
});
