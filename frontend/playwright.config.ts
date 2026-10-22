import { defineConfig, devices } from '@playwright/test';

// E2E_BASE_URL : cible déjà déployée (ex. conteneur nginx, http://localhost:8080) ; sinon build de démo + vite preview.
const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: externalBaseUrl ?? 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        // WebGL logiciel (SwiftShader) pour les environnements CI sans GPU.
        launchOptions: {
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
          // Chromium préinstallé dont la version diffère de celle attendue par Playwright (CI, conteneurs).
          ...(process.env.CHROMIUM_PATH === undefined ? {} : { executablePath: process.env.CHROMIUM_PATH }),
        },
      },
    },
  ],
  ...(externalBaseUrl === undefined ? {
    webServer: {
      command: 'npm run build:demo && npx vite preview --mode demo --port 4173 --strictPort',
      url: 'http://localhost:4173',
      timeout: 120_000,
      reuseExistingServer: true,
    },
  } : {}),
});
