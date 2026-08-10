import { APIRequestContext, expect, test } from '@playwright/test';

/**
 * La vista de mapa de la pagina de ciudad.
 *
 * Normalmente en local NO hay clave de Google configurada, y eso es lo que hace valiosa a esta
 * suite: comprueba que la pantalla **degrada bien**. Un mapa que no puede cargar no debe
 * tumbar la vista ni dejar un hueco mudo — la lista de la derecha sigue siendo utilizable y el
 * panel dice lo que pasa. Es el estado en el que estara cualquiera que clone el repo.
 *
 * Que el mapa se pinte de verdad con clave puesta se comprueba contra produccion, en
 * `scripts/verify-production.ps1`: exige una clave real y llamadas a Google que no tienen
 * sitio en una suite de pruebas.
 */

/**
 * Las pruebas de degradacion solo tienen sentido **sin** clave, y si hay una la API la publica
 * en `/api/config`. Se pregunta en vez de darlo por hecho: si alguien arranca la API con
 * `Maps__GoogleApiKey` —cosa que se hace para ver los mapas en desarrollo— el mapa carga de
 * verdad, el mensaje no aparece nunca y estas dos pruebas fallarian por un motivo que no tiene
 * nada que ver con el producto. Ya paso el 2026-08-10.
 */
async function hayClaveDeMaps(request: APIRequestContext): Promise<boolean> {
  const config = await request.get('/api/config');
  const body = (await config.json()) as { mapsApiKey: string | null };
  return Boolean(body?.mapsApiKey);
}
test.describe('Contador de resultados', () => {
  test('sustituye el marcador en vez de imprimirlo', async ({ page }) => {
    // Salio en una captura de produccion: "8 {0} rentals in Toronto". Ningun test lo veia
    // porque todos comprobaban el numero o el nombre de la ciudad por separado.
    await page.goto('/en/toronto');

    const texto = await page.getByText(/rentals in/).first().textContent();
    expect(texto).not.toContain('{0}');
    expect(texto).toMatch(/\d+\s*rentals in/);
  });

  test('en frances usa su propia frase', async ({ page }) => {
    await page.goto('/fr/toronto');

    const texto = await page.getByText(/locations/).first().textContent();
    expect(texto).not.toContain('{0}');
    expect(texto).toMatch(/\d+\s*locations/);
  });
});

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

  test('sin clave configurada lo dice en vez de quedarse en blanco', async ({ page, request }) => {
    test.skip(await hayClaveDeMaps(request), 'hay clave: el mapa carga y no hay degradacion que ver');

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

/**
 * El mapa de la FICHA (`rentca-detail-map` en el origen): un solo pin sobre la direccion del
 * anuncio, dentro de la pestaña "About".
 *
 * Vale lo mismo que arriba sobre la clave: aqui se comprueba que la seccion aparece donde toca y
 * que degrada diciendo lo que pasa. Que Google pinte el mapa depende de que la clave autorice el
 * dominio, y eso solo se ve contra produccion.
 */
test.describe('Mapa de la ficha', () => {
  test('la pestaña About muestra la ubicacion con su mapa', async ({ page }) => {
    await page.goto('/en/toronto');

    // `click()` no espera a que termine la navegacion: sin la asercion de URL, lo que se leyera
    // despues seria todavia de la pagina de la ciudad.
    await page.locator('app-property-card a').first().click();
    await expect(page).toHaveURL(/\/en\/[a-z-]+\/[a-z0-9-]+/);

    await page.getByRole('tab', { name: 'About' }).click();

    await expect(page.getByRole('heading', { name: 'Location' })).toBeVisible();
    await expect(page.locator('app-listing-map')).toBeVisible();
    // El aviso de que la ubicacion es aproximada no es decorativo: es lo que evita que alguien
    // lea el pin como la puerta del piso.
    await expect(page.getByText('Approximate location')).toBeVisible();
  });

  test('sin mapa utilizable lo dice en vez de dejar un hueco mudo', async ({ page, request }) => {
    test.skip(await hayClaveDeMaps(request), 'hay clave: el mapa carga y no hay degradacion que ver');

    await page.goto('/en/toronto');
    await page.locator('app-property-card a').first().click();
    await expect(page).toHaveURL(/\/en\/[a-z-]+\/[a-z0-9-]+/);

    await page.getByRole('tab', { name: 'About' }).click();

    await expect(page.locator('app-listing-map')).toContainText('Map could not be loaded', {
      timeout: 15_000,
    });
  });

  test('el mapa de la ficha NO se renderiza en el servidor', async ({ page }) => {
    const servido = await page.request.get('/en/toronto');
    const html = await servido.text();
    const enlace = html.match(/href="(\/en\/toronto\/[a-z0-9-]+)"/)?.[1];
    expect(enlace).toBeTruthy();

    const ficha = await page.request.get(enlace!);
    const fichaHtml = await ficha.text();

    // Ni el script de Google ni el componente: la pestaña arranca cerrada, asi que su contenido
    // no llega al HTML servido. Lo que el buscador necesita —titulo, precio y direccion— si esta.
    expect(fichaHtml).not.toContain('maps.googleapis.com');
    expect(fichaHtml).not.toContain('app-listing-map');
    expect(fichaHtml).toContain('Toronto');
  });
});
