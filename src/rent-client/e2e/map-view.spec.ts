import { expect, test } from '@playwright/test';

/**
 * La vista de mapa de la pagina de ciudad.
 *
 * En local NO hay clave de Google configurada, y eso es justo lo que hace valiosa a esta
 * suite: comprueba que la pantalla **degrada bien**. Un mapa que no puede cargar no debe
 * tumbar la vista ni dejar un hueco mudo — la lista de la derecha sigue siendo utilizable y el
 * panel dice lo que pasa. Es el estado en el que estara cualquiera que clone el repo.
 *
 * Que el mapa se pinte de verdad con clave puesta se comprueba contra produccion, en
 * `scripts/verify-production.ps1`: exige una clave real y llamadas a Google que no tienen
 * sitio en una suite de pruebas.
 */
test.describe('Vista de mapa', () => {
  test('el conmutador de vista lleva al mapa y lo deja en la URL', async ({ page }) => {
    await page.goto('/en/toronto');

    await page.getByRole('button', { name: /map/i }).click();

    await expect(page).toHaveURL(/view=map/);
    await expect(page.locator('app-search-map')).toBeVisible();
  });

  test('la lista sigue al lado del mapa', async ({ page }) => {
    // El valor de esta vista es comparar: mapa a la izquierda, tarjetas a la derecha. Si el
    // mapa se comiera la fila entera, la vista dejaria de servir para lo que existe.
    await page.goto('/en/toronto?view=map');

    await expect(page.locator('app-search-map')).toBeVisible();
    await expect(page.locator('app-property-card').first()).toBeVisible();
  });

  test('sin clave configurada lo dice en vez de quedarse en blanco', async ({ page }) => {
    await page.goto('/en/toronto?view=map');

    await expect(page.locator('app-search-map')).toContainText('Map could not be loaded', {
      timeout: 15_000,
    });
  });

  test('el mapa NO se renderiza en el servidor', async ({ page }) => {
    // Necesita `document` y no aporta nada al buscador: lo que se indexa es la lista, que si
    // viaja en el HTML servido.
    const servido = await page.request.get('/en/toronto?view=map');
    const html = await servido.text();

    expect(html).not.toContain('maps.googleapis.com');
    // Pero el hueco si esta, para que el layout de dos columnas no salte al hidratar.
    expect(html).toContain('app-property-card');
  });

  test('los filtros viajan del listado al mapa', async ({ page }) => {
    // Mapa y lista tienen que enseñar el mismo conjunto; si divergieran, cambiar de vista
    // pareceria perder pisos.
    // Se espera a que haya tarjeta ANTES de contar: `count()` no reintenta y, al hidratar, la
    // lista se vacia un instante antes de repoblarse. Es la misma trampa que en public-journey.
    const tarjetas = page.locator('app-property-card');

    await page.goto('/en/toronto?types=Condo&maxPrice=4000');
    await expect(tarjetas.first()).toBeVisible();
    const enLista = await tarjetas.count();
    expect(enLista).toBeGreaterThan(0);

    await page.goto('/en/toronto?types=Condo&maxPrice=4000&view=map');
    await expect(tarjetas.first()).toBeVisible();

    expect(await tarjetas.count()).toBe(enLista);
  });
});
