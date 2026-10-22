import { test as base, expect } from '@playwright/test';

/**
 * Les scénarios partent d'un navigateur vierge : sans cela, la visite guidée de première visite recouvrirait l'écran.
 * Seul tour.spec.ts, qui teste la visite, utilise le test de base.
 */
export const test = base.extend({
  page: async ({ page }, run) => {
    // Script en chaîne : le code des tests n'a pas les types du navigateur. Stockage indisponible : on ignore, la visite serait proposée.
    await page.addInitScript({ content: "try { localStorage.setItem('supervision.tour.v1', 'done'); } catch (e) { /* ignoré */ }" });
    await run(page);
  },
});

export { expect };
