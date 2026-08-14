import { expect, test } from '@playwright/test';
import { signUp, uniqueEmail } from './helpers';

/**
 * El recorrido del propietario: darse de alta, publicar un anuncio y verlo vivo en la web
 * publica.
 *
 * El cierre del circulo —abrir la ficha publica del anuncio recien creado— es lo que da valor
 * al test: comprueba de una vez el formulario, el slug generado, el guardado de las unidades y
 * que la busqueda por ciudad lo encuentra.
 */
test.describe('Portal del propietario', () => {
  test('crear un anuncio y verlo publicado', async ({ page }) => {
    const email = uniqueEmail('landlord');
    await signUp(page, 'Landlord', email);

    const titulo = `Piso E2E ${Date.now()}`;

    await page.goto('/en/landlord/listings/create');

    await page.locator('#title').fill(titulo);
    await page.locator('#description').fill(
      'Anuncio creado por la suite E2E para comprobar el circuito completo de publicacion.',
    );
    await page.locator('#streetAddress').fill('123 E2E Street');
    await page.locator('#cityName').fill('Toronto');
    await page.locator('#province').selectOption('ON');
    await page.locator('#postalCode').fill('M5V 1A1');

    // La primera unidad ya viene en el formulario; solo hay que rellenar precio y habitaciones.
    const unidad = page.locator('fieldset').first();
    await unidad.locator('[formcontrolname="bedrooms"]').fill('2');
    await unidad.locator('[formcontrolname="bathrooms"]').fill('1');
    await unidad.locator('[formcontrolname="price"]').fill('2450');

    await page.getByRole('button', { name: 'Save listing' }).click();

    // Al guardar se vuelve a la lista con el mensaje en el estado de la navegacion. Ojo Angular
    // 22: se lee con getCurrentNavigation() en el constructor, no con lastSuccessfulNavigation().
    await expect(page).toHaveURL(/\/en\/landlord\/listings$/);
    await expect(page.getByText(titulo)).toBeVisible();

    // Y ahora lo que de verdad importa: que exista para el publico.
    await page.goto('/en/toronto');
    await expect(page.getByText(titulo).first()).toBeVisible();

    await page.getByText(titulo).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(titulo);
    // El precio sale dos veces: el "desde" de la barra lateral y la fila de la unidad.
    await expect(page.getByText('$2,450').first()).toBeVisible();
  });

  test('una consulta anonima aterriza en la bandeja del propietario', async ({ page, browser }) => {
    const email = uniqueEmail('landlord-inbox');
    await signUp(page, 'Landlord', email);

    const titulo = `Piso con bandeja ${Date.now()}`;

    await page.goto('/en/landlord/listings/create');
    await page.locator('#title').fill(titulo);
    await page.locator('#streetAddress').fill('456 Inbox Street');
    await page.locator('#cityName').fill('Toronto');
    await page.locator('#province').selectOption('ON');
    await page.locator('#postalCode').fill('M5V 1A2');
    const unidad = page.locator('fieldset').first();
    await unidad.locator('[formcontrolname="bedrooms"]').fill('1');
    await unidad.locator('[formcontrolname="bathrooms"]').fill('1');
    await unidad.locator('[formcontrolname="price"]').fill('1900');
    await page.getByRole('button', { name: 'Save listing' }).click();
    await expect(page).toHaveURL(/\/en\/landlord\/listings$/);

    // En una pestana limpia, sin sesion: es el caso real de quien pregunta por un piso.
    const anonimo = await browser.newContext();
    const visitante = await anonimo.newPage();
    await visitante.goto('/en/toronto');
    await visitante.getByText(titulo).first().click();
    await visitante.getByPlaceholder('Full Name').fill('Interesado E2E');
    await visitante.getByPlaceholder('you@example.com').fill('interesado@e2e.local');
    await visitante.getByPlaceholder("Hi, I'm interested in this rental...").fill(
      'Buenas, me interesa este piso y querria verlo esta semana.',
    );
    await visitante.getByRole('button', { name: 'Send Message' }).click();
    await expect(visitante.getByRole('status')).toContainText('Your message has been sent');
    await anonimo.close();

    await page.goto('/en/landlord/inbox');
    await expect(page.getByText('Interesado E2E')).toBeVisible();
  });

  test('un propietario no entra al portal del inquilino', async ({ page }) => {
    const email = uniqueEmail('landlord-rol');
    await signUp(page, 'Landlord', email);

    await page.goto('/en/renter/favorites');

    await expect(page).not.toHaveURL(/\/en\/renter\/favorites$/);
  });
});
