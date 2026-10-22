import { expect, test } from './fixtures';

/**
 * Bout en bout réel : simulateur → Kafka → backend → SSE → navigateur.
 * Exécuté seulement avec E2E_LIVE=1 contre un frontend de production relié au backend (compose --profile full).
 */
test.describe('flux réel (backend + simulateur)', () => {
  test.skip(process.env.E2E_LIVE !== '1', 'E2E_LIVE=1 requis');

  test('affiche les données du backend sans bandeau de simulation', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');

    await expect(page.getByText(/DONNÉES SIMULÉES/)).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('Temps réel', { timeout: 20_000 });
    const map = page.getByRole('region', { name: 'Carte des gares de péage' });
    await expect.poll(async () => Number(await map.getAttribute('data-rendered-stations'))).toBeGreaterThan(600);
    await expect.poll(async () => Number((await page.getByText('Entrées 1 h').locator('..').innerText()).replace(/\D/g, '')))
      .toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/live-france.png' });
    expect(errors).toEqual([]);
  });

  test('latence de bout en bout ≤ 3 s au 95e centile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText('Temps réel', { timeout: 20_000 });
    const samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(500);
      const shown = (await page.getByText('Données à').locator('..').innerText()).match(/(\d{2}):(\d{2}):(\d{2})/);
      if (shown !== null) {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
        const displayed = new Date(now);
        displayed.setHours(Number(shown[1]), Number(shown[2]), Number(shown[3]), 0);
        samples.push((now.getTime() - displayed.getTime()) / 1_000);
      }
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)] ?? Number.POSITIVE_INFINITY;
    console.log(`latence (now − watermark affiché) : p50=${samples[Math.floor(samples.length / 2)]} s, p95=${p95} s`);
    expect(p95).toBeLessThanOrEqual(3);
  });

  test('relit l’historique puis revient au direct', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText('Temps réel', { timeout: 20_000 });
    const start = new Date(Date.now() - 2 * 3_600_000);
    const local = new Date(start.getTime() - start.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    await page.getByRole('button', { name: /Relecture/ }).click();
    await page.getByLabel('Début de relecture').fill(local);
    await page.getByLabel('Durée de relecture').selectOption('30');
    await page.getByLabel('Vitesse de relecture').selectOption('300');
    await page.getByRole('button', { name: 'Lancer la relecture' }).click();

    const banner = page.getByText(/RELECTURE — données historiques observées/);
    await expect(banner).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Relecture ×300');
    const first = await banner.innerText();
    await page.waitForTimeout(2_000);
    expect(await banner.innerText()).not.toEqual(first);
    await page.screenshot({ path: 'test-results/replay.png' });

    await page.getByRole('button', { name: 'Retour au direct' }).click();
    await expect(banner).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('Temps réel', { timeout: 20_000 });
  });

  test('compare aujourd’hui et J-7 dans le détail d’une gare', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Nom de gare').fill('Ablis');
    await page.getByRole('button', { name: 'Ablis' }).first().click();
    const chart = page.getByRole('img', { name: /Passages par quart d’heure/ });
    await expect(chart).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/J-7 même heure/)).toBeVisible();
  });

  test('flux O/D : filtres, seuil de 3 véhicules et cohérence avec les sorties des gares', async ({ page, request }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText('Temps réel', { timeout: 20_000 });
    await page.getByLabel('Flux origine → destination').check();

    const top = page.getByRole('list', { name: 'Principaux flux' }).getByRole('listitem');
    await expect(top.first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('region', { name: 'Panneau des flux O/D' })).toContainText('observé');

    // Flux internes (même département) masqués par défaut, affichés à la demande.
    await page.getByLabel('Niveau des flux').selectOption('DEPARTMENT');
    await expect(page.getByText('(interne)')).toHaveCount(0);
    await page.getByLabel(/Inclure les flux internes/).check();
    await expect(top.first()).toContainText('Département', { timeout: 30_000 });
    await expect(page.getByText('(interne)').first()).toBeVisible();

    const coverage = await (await request.get('/api/v1/od/coverage')).json() as { gapRatio: number; coverage: { recorded: number } };
    expect(coverage.coverage.recorded).toBeGreaterThan(0);
    expect(coverage.gapRatio).toBeLessThanOrEqual(0.005);

    const flows = await (await request.get('/api/v1/od?limit=2000')).json() as { minVehicles: number; flows: { vehicles: number }[] };
    expect(flows.minVehicles).toBeGreaterThanOrEqual(3);
    expect(flows.flows.every((f) => f.vehicles >= 3)).toBe(true);
    await page.screenshot({ path: 'test-results/live-od.png' });
    expect(errors).toEqual([]);
  });

  test('charge estimée des tronçons : étiquetée « estimation », alimentée par le flux', async ({ page }) => {
    test.skip(process.env.E2E_SEGMENTS !== '1', 'E2E_SEGMENTS=1 requis (backend démarré avec ASSIGNMENT_GRAPH_FILE)');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText('Temps réel', { timeout: 20_000 });
    await page.getByLabel('Charge des tronçons (estimée)').check();

    const panel = page.getByRole('region', { name: 'Charge estimée des tronçons' });
    await expect(panel).toContainText('Estimation');
    await expect(panel).toContainText('pas une mesure');
    await expect(panel.getByTestId('segments-info')).toContainText('tronçons', { timeout: 90_000 });
    expect(errors).toEqual([]);
  });

  test('clic sur le nom d’une autoroute : filtre « Axe » appliqué côté serveur', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText('Temps réel', { timeout: 20_000 });
    const labels = page.locator('.axis-label[data-axis]');
    await expect.poll(async () => labels.count(), { timeout: 15_000 }).toBeGreaterThan(10);
    const axis = await labels.first().getAttribute('data-axis');

    const request = page.waitForRequest((r) => r.url().includes('/api/v1/od?') && r.url().includes(`axis=${encodeURIComponent(axis ?? '')}`));
    await labels.first().click();
    await request;

    await expect(page.getByLabel('Axe')).toHaveValue(axis ?? '');
    await expect(page.getByLabel('Flux origine → destination')).toBeChecked();
  });
});
