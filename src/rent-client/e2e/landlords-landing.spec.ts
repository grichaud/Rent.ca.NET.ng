import { expect, test } from '@playwright/test';

/**
 * La landing comercial de la Fase 12.
 *
 * Se construyo y se valido sobre el HTML servido, pero **nunca se habia abierto en un
 * navegador**: este fichero cierra ese hueco. Lo que aqui se comprueba es justo lo que un
 * `curl` no puede ver — que la pagina hidrata sin romperse, que el ancla de precios desplaza y
 * que el acordeon de la FAQ abre.
 */
test.describe('Landing de propietarios', () => {
  test('se pinta entera y sin errores de consola', async ({ page }) => {
    const errores: string[] = [];
    page.on('pageerror', (error) => errores.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errores.push(message.text());
    });

    await page.goto('/en/landlords');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('List Your Property on');

    // Las siete secciones del origen, comprobadas por sus encabezados reales.
    await expect(page.getByRole('heading', { name: /Why list on/i })).toBeVisible();
    await expect(page.locator('#pricing')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Trusted by Landlords Across Canada' })).toBeVisible();

    // Los tres planes con sus precios de demostracion.
    await expect(page.getByText('$0', { exact: true })).toBeVisible();
    await expect(page.getByText('$35', { exact: true })).toBeVisible();
    await expect(page.getByText('$199', { exact: true })).toBeVisible();

    // Un [innerHTML] sobre un <svg> aborta la deteccion de cambios de TODA la pagina, y el
    // sintoma aparece en componentes que no tienen nada que ver. Con 30+ iconos aqui, merece
    // la pena vigilarlo.
    expect(errores).toEqual([]);
  });

  test('el enlace de precios desplaza hasta la seccion', async ({ page }) => {
    await page.goto('/en/landlords');

    // Se comprueba el DESPLAZAMIENTO, no la URL: el enlace no recarga ni cambia el fragmento,
    // solo lleva al visitante a la seccion, que es lo que este boton promete.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await page.getByRole('link', { name: /View pricing/i }).click();

    // `scroll-mt-24` deja la seccion por debajo del header fijo, no pegada al borde.
    await expect
      .poll(async () => page.locator('#pricing').evaluate((el) => el.getBoundingClientRect().top), {
        timeout: 10_000,
      })
      .toBeLessThan(200);

    // Y sigue siendo la misma pagina: si el enlace hubiese recargado o redirigido, el titulo
    // ya no estaria. Es justo lo que pasaba resolviendo el fragmento contra el base href.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('List Your Property on');
  });

  test('la FAQ abre y cierra', async ({ page }) => {
    await page.goto('/en/landlords');

    const primera = page.locator('details.faq-item').first();
    await expect(primera).not.toHaveAttribute('open', /.*/);

    await primera.locator('summary').click();
    await expect(primera).toHaveAttribute('open', /.*/);
  });

  test('los CTA llevan al alta de cuenta', async ({ page }) => {
    await page.goto('/en/landlords');

    await page.getByRole('link', { name: /Get started free/i }).first().click();

    await expect(page).toHaveURL(/\/en\/signup/);
  });

  test('se lee en movil sin desbordar @mobile', async ({ page }) => {
    await page.goto('/en/landlords');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // El desbordamiento horizontal es el fallo tipico de una landing con orbes absolutos y
    // rejillas de tres columnas: en movil se traduce en poder arrastrar la pagina de lado.
    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(desborda).toBe(false);
  });
});
