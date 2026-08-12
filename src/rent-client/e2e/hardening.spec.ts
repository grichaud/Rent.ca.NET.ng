import { expect, test } from '@playwright/test';

/**
 * Lo que revisa quien evalua el sitio sin pedirle permiso a nadie: cabeceras, codigos de estado
 * y la tarjeta que sale al compartir el enlace. Nada de esto se ve navegando, asi que sin una
 * prueba se pierde en el primer refactor y nadie lo nota.
 *
 * Salio de la auditoria del 2026-08-12 sobre el sitio ya publicado.
 */

test.describe('Cabeceras de seguridad', () => {
  test('la respuesta trae las cabeceras basicas', async ({ page }) => {
    const res = await page.goto('/en');
    const h = res!.headers();

    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy']).toContain('geolocation=()');
    expect(h['content-security-policy']).toBeTruthy();
  });

  test('no se anuncia el servidor', async ({ page }) => {
    const res = await page.goto('/en');

    // `X-Powered-By: Express` solo le ahorra trabajo a quien busca versiones vulnerables.
    expect(res!.headers()['x-powered-by']).toBeUndefined();
  });

  test('la CSP no bloquea nada de lo que la pagina usa', async ({ page }) => {
    const violaciones: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) {
        violaciones.push(m.text());
      }
    });

    // La home carga fuentes, fotos de Unsplash y el hero; el mapa carga la API de Google, que es
    // lo que mas facil se queda fuera de la lista.
    await page.goto('/en');
    await page.goto('/en/toronto?view=map');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    expect(violaciones).toEqual([]);
  });

  test('HSTS solo viaja sobre HTTPS', async ({ page }) => {
    const res = await page.goto('/en');

    // La suite corre en HTTP contra localhost. Mandar HSTS ahi no significa nada y ademas
    // clavaria el navegador del desarrollador a https://localhost durante un ano.
    expect(res!.headers()['strict-transport-security']).toBeUndefined();
  });
});

test.describe('Codigos de estado', () => {
  test('una ciudad inexistente responde 404, no 200', async ({ page }) => {
    const res = await page.goto('/en/ciudad-que-no-existe');

    // Servir esto con 200 es un "soft 404": para un rastreador significa "esta pagina existe y
    // esta bien". El `noindex` tapa el problema de indexacion, pero el estado seguia mintiendo.
    expect(res!.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('City not found');
  });

  test('una ciudad real sigue respondiendo 200', async ({ page }) => {
    const res = await page.goto('/en/toronto');

    expect(res!.status()).toBe(200);
  });
});

test.describe('Tarjeta social', () => {
  test('la home lleva imagen y tarjeta grande', async ({ page }) => {
    await page.goto('/en');

    // Sin `og:image` el enlace compartido en LinkedIn o WhatsApp sale como un bloque de texto
    // gris. Era el caso de la home y de todas las paginas de contenido.
    const image = page.locator('meta[property="og:image"]');
    await expect(image).toHaveCount(1);
    expect(await image.getAttribute('content')).toMatch(/^https?:\/\//);

    // `summary_large_image` sin imagen degrada a una tarjeta rota: los dos valores van juntos.
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );
  });

  test('una ficha conserva SU imagen, no la de por defecto', async ({ page }) => {
    await page.goto('/en/toronto');

    // `app-property-card`, el mismo selector que usa el recorrido publico. Y esperar a que sea
    // visible antes de pulsar: al hidratar la lista se vacia un instante.
    const tarjeta = page.locator('app-property-card a').first();
    await expect(tarjeta).toBeVisible();
    await tarjeta.click();

    await expect(page).toHaveURL(/\/en\/[a-z-]+\/[a-z0-9-]+/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(og).toBeTruthy();
    // El defecto es la foto del hero; una ficha tiene que traer la SUYA. Si esto falla, el
    // defecto esta pisando lo que cada pantalla define.
    expect(og).not.toContain('photo-1517935706615');
  });
});
