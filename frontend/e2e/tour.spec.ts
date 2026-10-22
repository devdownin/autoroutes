import { expect, test } from '@playwright/test';

/** Visite guidée et aide, depuis un navigateur vierge. */
test.describe('visite guidée et aide', () => {
  test('est proposée à la première visite, parcourue, puis plus jamais', async ({ page }) => {
    await page.goto('/');
    const tour = page.getByRole('dialog', { name: 'Visite guidée' });
    await expect(tour).toBeVisible({ timeout: 10_000 });
    // 4 étapes en démonstration, 5 avec la barre de relecture : on avance jusqu'à la dernière.
    await expect(tour).toContainText('Étape 1 sur');
    await expect(tour).toContainText('La carte des gares');
    await tour.getByRole('button', { name: 'Suivant' }).click();
    await expect(tour).toContainText('La fraîcheur des données');
    for (let i = 0; i < 5 && (await tour.getByRole('button', { name: 'Terminer' }).count()) === 0; i++) {
      await tour.getByRole('button', { name: 'Suivant' }).click();
    }
    await expect(tour).toContainText('Besoin d’un rappel ?');
    await tour.getByRole('button', { name: 'Terminer' }).click();
    await expect(tour).toBeHidden();

    await page.reload();
    await page.waitForTimeout(2_500);
    await expect(page.getByRole('dialog', { name: 'Visite guidée' })).toBeHidden();
  });

  test('peut être passée avec Échap, et reste mémorisée', async ({ page }) => {
    await page.goto('/');
    const tour = page.getByRole('dialog', { name: 'Visite guidée' });
    await expect(tour).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press('Escape');

    await expect(tour).toBeHidden();
    await page.reload();
    await page.waitForTimeout(2_500);
    await expect(tour).toBeHidden();
  });

  test('l’aide explique les données, a une adresse partageable et relance la visite', async ({ page }) => {
    await page.addInitScript({ content: "localStorage.setItem('supervision.tour.v1', 'done');" });
    await page.goto('/');
    await page.getByRole('button', { name: 'Aide et à propos des données' }).click();

    const about = page.getByRole('dialog', { name: 'À propos des données' });
    await expect(about).toBeVisible();
    await expect(about).toContainText('3 véhicules sur l’heure');
    await expect(about).toContainText('Ce qui n’est pas mesuré');
    expect(page.url()).toContain('#a-propos');

    await page.keyboard.press('Escape');
    await expect(about).toBeHidden();
    await expect.poll(() => page.url()).not.toContain('#a-propos');

    await page.getByRole('button', { name: 'Aide et à propos des données' }).click();
    await about.getByRole('button', { name: 'Revoir la visite guidée' }).click();
    await expect(page.getByRole('dialog', { name: 'Visite guidée' })).toBeVisible();
  });

  test('l’adresse #a-propos ouvre l’aide directement, sans visite guidée', async ({ page }) => {
    await page.goto('/#a-propos');

    await expect(page.getByRole('dialog', { name: 'À propos des données' })).toBeVisible();
    await page.waitForTimeout(2_500);
    await expect(page.getByRole('dialog', { name: 'Visite guidée' })).toBeHidden();
  });

  test('sur téléphone, la visite ouvre le tiroir pour montrer le panneau et reste dans l’écran', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const tour = page.getByRole('dialog', { name: 'Visite guidée' });
    await expect(tour).toBeVisible({ timeout: 10_000 });

    await tour.getByRole('button', { name: 'Suivant' }).click();
    await tour.getByRole('button', { name: 'Suivant' }).click();
    await expect(tour).toContainText('Couches, flux et légende');
    await expect(page.locator('#side-panel')).toBeVisible();
    await page.waitForTimeout(500);

    const box = await tour.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? -1)).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? -1)).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(844);

    await tour.getByRole('button', { name: 'Passer' }).click();
    await expect(page.locator('#side-panel')).toBeHidden();
  });
});
