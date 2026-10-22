import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

test.describe('démonstration (flux simulé)', () => {
  test('affiche la carte, le bandeau simulé et l’activité des gares', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/');

    await expect(page.getByRole('note')).toHaveText(/DONNÉES SIMULÉES/);
    await expect(page.getByRole('status')).toHaveText('Temps réel');
    const map = page.getByRole('region', { name: 'Carte des gares de péage' });
    await expect(map).toHaveAttribute('data-ready', 'true');
    await expect.poll(async () => Number(await map.getAttribute('data-rendered-stations'))).toBeGreaterThan(600);
    await expect(page.getByText('Gares actives (15 min)').locator('..')).toContainText('/ 667');
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: 'test-results/demo-france.png' });

    expect(errors).toEqual([]);
  });

  test('recherche une gare au clavier et ouvre son détail', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Nom de gare').fill('La Boisse');
    await page.getByRole('button', { name: /La Boisse/ }).first().click();

    const detail = page.getByRole('region', { name: /Détail de la gare La Boisse/ });
    const map = page.getByRole('region', { name: 'Carte des gares de péage' });
    await expect.poll(async () => Number(await map.getAttribute('data-rendered-stations')), { timeout: 10_000 }).toBeLessThan(100);
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('table')).toContainText('Aujourd’hui');
    await page.waitForTimeout(2_500);
    await page.screenshot({ path: 'test-results/demo-gare.png' });

    // Info-bulle au survol : la gare est au centre de la carte après le cadrage.
    const box = await map.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);
    await expect(page.getByRole('tooltip')).toContainText('La Boisse');

    await detail.getByRole('button', { name: 'Fermer le détail' }).click();
    await expect(detail).toBeHidden();
  });

  test('« / » met le focus sur la recherche, qui trouve une autoroute et cadre ses gares', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('region', { name: 'Carte des gares de péage' }).waitFor();

    await page.keyboard.press('/');
    await expect(page.getByRole('searchbox')).toBeFocused();
    await page.keyboard.type('a7');
    await expect(page.getByRole('list', { name: 'Résultats de la recherche' }).getByRole('button').first()).toContainText('A7');
    await page.keyboard.press('Enter');

    // Choisir une autoroute active la couche des flux et ouvre sa section (le filtre « Axe » n'existe pas en démonstration).
    await expect(page.getByLabel('Flux origine → destination')).toBeChecked();
    await expect(page.getByRole('button', { name: /Flux O\/D/ })).toHaveAttribute('aria-expanded', 'true');
  });

  test('la section « Gares les plus actives » classe les gares et ouvre leur détail', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Gares les plus actives' }).click();
    const list = page.getByRole('list', { name: 'Gares les plus actives' });
    await expect(list.getByRole('listitem').first()).toBeVisible({ timeout: 20_000 });
    const name = (await list.getByRole('listitem').first().locator('.activity-name').textContent()) ?? '';

    await list.getByRole('listitem').first().getByRole('button').click();

    await expect(page.getByRole('region', { name: new RegExp(`Détail de la gare ${name}`) })).toBeVisible();
  });

  test('affiche les flux origine → destination à la demande', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Flux origine → destination').check();
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: 'test-results/demo-flux.png' });
    await expect(page.getByLabel('Flux origine → destination')).toBeChecked();

    // Légende contextuelle : la ligne des flux n'apparaît qu'avec la couche, et les sections s'ouvrent une à la fois.
    await page.getByRole('button', { name: 'Légende' }).click();
    await expect(page.getByText('Flux O/D observé (≥ 3 véh. sur 1 h)')).toBeVisible();
    await expect(page.getByRole('button', { name: /Flux O\/D/ })).toHaveAttribute('aria-expanded', 'false');
  });

  test('la légende ne décrit que les couches affichées', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Légende' }).click();
    await expect(page.getByText('Gare d’échangeur').last()).toBeVisible();
    await expect(page.getByText('Flux O/D observé')).toHaveCount(0);
    await expect(page.getByText('Charge de tronçon')).toHaveCount(0);
  });

  test('ne présente pas de violation d’accessibilité critique hors carte', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('status')).toBeVisible();
    const results = await new AxeBuilder({ page }).exclude('.maplibregl-canvas').analyze();
    const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('les noms d’autoroutes sont posés sur la carte : survol, sélection et masquage', async ({ page }) => {
    await page.goto('/');
    const map = page.getByRole('region', { name: 'Carte des gares de péage' });
    await expect(map).toHaveAttribute('data-ready', 'true');
    const labels = page.locator('.axis-label[data-axis]');
    await expect.poll(async () => labels.count(), { timeout: 15_000 }).toBeGreaterThan(10);

    // Survol : les gares de l'axe sont mises en évidence tant que le pointeur reste sur le nom.
    const first = labels.first();
    const axis = await first.getAttribute('data-axis');
    expect(axis).toBeTruthy();
    await first.hover();
    await expect(map).toHaveAttribute('data-active-axis', axis ?? '');
    await page.mouse.move(700, 500);
    await expect(map).toHaveAttribute('data-active-axis', '');

    // Clic : l'axe reste sélectionné (filtre « Axe » des flux) et la couche des flux s'active ; un second clic le retire.
    await first.click();
    await expect(page.getByLabel('Flux origine → destination')).toBeChecked();
    await page.mouse.move(700, 500);
    await expect(map).toHaveAttribute('data-active-axis', axis ?? '');
    await expect(page.locator('.axis-label-active').first()).toBeVisible();
    await page.locator(`.axis-label[data-axis="${axis ?? ''}"]`).first().click();
    // Le pointeur est encore sur le nom : le survol garde l'axe en évidence jusqu'à ce qu'il le quitte.
    await page.mouse.move(700, 500);
    await expect(map).toHaveAttribute('data-active-axis', '');
  });

  test('les noms d’autoroutes se masquent depuis le panneau et apparaissent dans la légende', async ({ page }) => {
    await page.goto('/');
    await expect.poll(async () => page.locator('.axis-label[data-axis]').count(), { timeout: 15_000 }).toBeGreaterThan(10);
    await page.getByRole('button', { name: 'Légende' }).click();
    await expect(page.getByText('Nom d’autoroute : survol')).toBeVisible();

    await page.getByRole('button', { name: 'Couches et gares' }).click();
    await page.getByLabel('Noms des autoroutes').uncheck();

    await expect(page.locator('.axis-label[data-axis]')).toHaveCount(0);
  });
});
