import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra el **servidor SSR compilado**, no contra `ng serve`.
 *
 * Es la diferencia que importa. `ng serve` monta su propio proxy de desarrollo hacia la API,
 * asi que ejercita una topologia que no existe en produccion. El agujero que estuvo abierto
 * hasta la Fase 11 —el SSR no reenviaba `/api`, y con el login, los favoritos, las consultas y
 * el chat muertos en produccion— habria pasado inadvertido en `ng serve` otra vez. Aqui el
 * navegador solo conoce el puerto 4000, igual que un visitante real.
 *
 * Por eso la suite exige `npx ng build` y `dotnet build` previos: arranca los ARTEFACTOS, no
 * los proyectos.
 */

const API_URL = 'http://localhost:5282';
const SSR_URL = 'http://localhost:4000';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',

  // Un fallo aqui casi siempre es una carrera del propio test, no del producto; el reintento
  // en CI evita rojos de humo, pero en local se ve el fallo a la primera.
  retries: process.env['CI'] ? 2 : 0,

  // Los tests comparten UNA base de datos de desarrollo: el del landlord publica un anuncio que
  // el publico podria ver a medias, y los del renter tocan la misma sesion. En serie tardan mas
  // pero no se pisan.
  workers: 1,
  fullyParallel: false,

  reporter: process.env['CI'] ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: SSR_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // El SSR tarda mas que un SPA en la primera navegacion de cada ruta: compila la pagina y
    // ademas pide los datos a la API.
    navigationTimeout: 30_000,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      // Solo los tests marcados @mobile. El origen tiene un menu lateral distinto por debajo
      // de `lg`, y ahi es donde se rompe lo que en escritorio parece bien.
      name: 'mobile',
      testMatch: /.*\.spec\.ts/,
      grep: /@mobile/,
      use: { ...devices['Pixel 7'] },
    },
  ],

  webServer: [
    {
      // El .dll de bin/Debug, como hacen los scripts de validacion: `dotnet run` recompila y
      // deja el puerto ocupado mas tiempo del que Playwright espera.
      command: 'dotnet Rent.Api.dll',
      cwd: '../Rent.Api/bin/Debug/net9.0',
      url: `${API_URL}/health`,
      env: {
        ASPNETCORE_ENVIRONMENT: 'Development',
        ASPNETCORE_URLS: API_URL,
      },
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
    {
      command: 'node dist/rent-client/server/server.mjs',
      url: `${SSR_URL}/en`,
      env: {
        PORT: '4000',
        API_BASE_URL: API_URL,
        // La cache del SSR se apaga para los E2E. No es que estorbe hoy —pasan con ella—, es
        // que los acopla al ORDEN de los ficheros: si un test anonimo cachea /en/toronto antes
        // de que el del propietario publique un anuncio, el suyo no aparece y el fallo no se
        // parece en nada a la causa. La cache tiene sus propias comprobaciones en
        // `scripts/validate-proxy.ps1`, que es donde toca probarla.
        SSR_CACHE_TTL_SECONDS: '0',
      },
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  ],
});
