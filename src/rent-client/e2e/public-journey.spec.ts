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
