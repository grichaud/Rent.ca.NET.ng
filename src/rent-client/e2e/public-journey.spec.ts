import { expect, test } from '@playwright/test';

/**
 * El recorrido que hace la mayoria de los visitantes y que nunca pasa por un login: buscar una
 * ciudad, filtrar, abrir una ficha y escribir al propietario.
 *
 * La consulta anonima es intencionada (Fase 7): exigir cuenta para preguntar por un piso
 * perderia la mayoria de los contactos. Este test es el que vigila que siga siendo asi.
 */
test.describe('Recorrido publico', () => {
  test('buscar una ciudad, filtrar y abrir una ficha', async ({ page }) => {
    await page.goto('/en');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Find Your');

    await page.getByRole('search').getByRole('searchbox').fill('Toronto');
    await page.getByRole('search').getByRole('button').click();

    await expect(page).toHaveURL(/\/en\/toronto/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Rentals in Toronto');

    // OJO: `count()` NO reintenta, y aqui eso importa. El HTML servido llega con las tarjetas
    // dentro, pero al hidratar la senal de resultados arranca en `null` y la lista se vacia
    // durante un instante antes de repoblarse. Contar a pelo justo en esa ventana da 0 y el
    // fallo parece del producto. Se espera primero a que haya una tarjeta visible.
    const tarjetas = page.locator('app-property-card');
    await expect(tarjetas.first()).toBeVisible();
    const sinFiltrar = await tarjetas.count();
    expect(sinFiltrar).toBeGreaterThan(0);

    // Los filtros viven en la URL, como los formularios GET del origen: un enlace a una tabla
    // filtrada tiene que seguir sirviendo y el SSR entregarla ya filtrada.
    await page.goto('/en/toronto?types=Condo&maxPrice=4000');
    await expect(tarjetas.first()).toBeVisible();
    const filtrado = await tarjetas.count();
    expect(filtrado).toBeGreaterThan(0);
    expect(filtrado).toBeLessThanOrEqual(sinFiltrar);

    await page.locator('app-property-card a').first().click();
    await expect(page).toHaveURL(/\/en\/[a-z-]+\/[a-z0-9-]+/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('un visitante sin cuenta puede escribir al propietario', async ({ page }) => {
    await page.goto('/en/toronto');
    await page.locator('app-property-card a').first().click();

    await page.getByPlaceholder('Full Name').fill('Visitante E2E');
    await page.getByPlaceholder('Your email').fill('visitante@e2e.local');
    await page.getByPlaceholder("Hi, I'm interested in this rental...").fill(
      'Me interesa este piso, sigue disponible? Enviado desde la suite E2E.',
    );
    await page.getByRole('button', { name: 'Send inquiry' }).click();

    // El formulario se sustituye por el acuse de recibo: dejarlo a la vista invita a mandar la
    // misma consulta dos veces.
    await expect(page.getByRole('status')).toContainText('Your message has been sent');
    await expect(page.getByRole('button', { name: 'Send inquiry' })).toHaveCount(0);
  });

  test('el corazon manda al login a quien no tiene sesion', async ({ page }) => {
    await page.goto('/en/toronto');

    // Anonimo, el corazon es un ENLACE al login con returnUrl, no un boton: pulsarlo y acabar
    // en un formulario de sesion es el comportamiento correcto.
    await page.getByLabel('Save to favorites').first().click();

    await expect(page).toHaveURL(/\/en\/login\?returnUrl=/);
  });

  test('una ciudad que no existe no revienta @mobile', async ({ page }) => {
    await page.goto('/en/ciudad-que-no-existe');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('City not found');
  });

  /**
   * Paridad con el origen, comprobada el 2026-08-14 comparando las dos versiones desplegadas.
   * La ficha se habia quedado sin cosas que el origen si tiene.
   */
  test('la ficha muestra la fecha de disponibilidad legible, no el ISO', async ({ page }) => {
    await page.goto('/en/toronto/luxury-loft-liberty-village');

    const tabla = page.getByRole('table');
    await expect(tabla).toBeVisible();

    // El origen la pinta con "MMM d, yyyy". Aqui salia "2026-08-29" en crudo.
    await expect(tabla).not.toContainText(/\d{4}-\d{2}-\d{2}/);
    await expect(tabla).toContainText(/[A-Z][a-z]{2} \d{1,2}, \d{4}|Now/);
  });

  test('el formulario de contacto pide fecha de mudanza y lleva etiquetas', async ({ page }) => {
    await page.goto('/en/toronto/luxury-loft-liberty-village');

    // El campo faltaba entero aunque la API lo acepta: la bandeja del propietario recibia
    // siempre la columna vacia.
    await expect(page.locator('#inq-movein')).toBeVisible();

    // Etiquetas visibles, no solo placeholder: un placeholder desaparece al escribir.
    for (const id of ['inq-name', 'inq-email', 'inq-phone', 'inq-movein', 'inq-message']) {
      await expect(page.locator(`label[for="${id}"]`)).toBeVisible();
    }
  });

  test('la ficha ofrece crear una alerta', async ({ page }) => {
    await page.goto('/en/toronto/luxury-loft-liberty-village');

    await page.getByRole('link', { name: /Set Up an Alert/i }).click();

    // Sin sesion rebota al login, que es lo correcto: la alerta es de un inquilino.
    await expect(page).toHaveURL(/\/en\/(login|renter\/alerts)/);
  });

  test('el buscador de la home cabe en pantalla @mobile', async ({ page }) => {
    await page.goto('/en');

    const boton = page.getByRole('button', { name: 'Search rentals' });
    await expect(boton).toBeVisible();

    // Se comprueba el BOTON contra el viewport, no `scrollWidth` del documento. El fallo real
    // (2026-08-12) no movia el scroll: el formulario desbordaba y un padre lo recortaba, asi que
    // el boton quedaba fuera de pantalla con la pagina midiendo exactamente el ancho del movil.
    // Una prueba de desbordamiento del documento pasa en verde con el CTA principal invisible.
    const caja = await boton.boundingBox();
    const ancho = page.viewportSize()!.width;

    expect(caja).not.toBeNull();
    expect(caja!.x).toBeGreaterThanOrEqual(0);
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(ancho + 1);
  });
});
