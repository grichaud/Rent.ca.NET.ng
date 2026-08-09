import { expect, test } from '@playwright/test';
import { PASSWORD, signUp, uniqueEmail } from './helpers';

/**
 * Alta de un inquilino, guardar un favorito y recuperarlo en su portal.
 *
 * Aqui es donde se habria visto el agujero del proxy: el corazon llama a `/api/favorites` desde
 * el NAVEGADOR, y hasta la Fase 11 esa llamada caia en el renderer y volvia como HTML. Ningun
 * script lo veia porque todos hablan con la API directamente.
 */
test.describe('Portal del inquilino', () => {
  test('alta, favorito y su reflejo en el portal', async ({ page }) => {
    const email = uniqueEmail('renter');
    await signUp(page, 'Renter', email);

    // Se guarda desde la FICHA y no desde la rejilla para poder quedarse con el titulo exacto
    // del piso: es lo que despues identifica la tarjeta en la lista de favoritos.
    await page.goto('/en/toronto');
    await page.locator('app-property-card a').first().click();

    // Hay que esperar a estar EN la ficha antes de leer el titulo. `click()` no espera a que
    // la navegacion termine, y sin esto el h1 que se lee es el de la pagina de ciudad
    // ("Rentals in Toronto"): despues se busca ese texto en favoritos y no aparece nunca, con
    // toda la pinta de que el favorito no se hubiera guardado.
    await expect(page).toHaveURL(/\/en\/[a-z0-9-]+\/[a-z0-9-]+/);

    const titulo = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
    expect(titulo).not.toBe('');
    expect(titulo).not.toContain('Rentals in');

    // Con sesion de Renter el corazon ya es un boton que alterna, no un enlace al login.
    //
    // Se acota a la cabecera del anuncio: la ficha pinta SIETE corazones —el suyo y el de cada
    // piso similar del carrusel—, y sin acotar el selector no sabe cual pulsar.
    const cabecera = page.locator('article header').first();

    // Hay que ESPERAR a que el servidor conteste antes de navegar. El corazon es optimista: se
    // rellena al instante y manda el POST despues, asi que ver el icono relleno no significa
    // que la peticion haya salido siquiera. Navegando acto seguido, el navegador la CANCELA en
    // vuelo y el favorito no llega a guardarse — un falso rojo que parece un fallo del portal.
    const guardado = page.waitForResponse(
      (r) => r.url().includes('/api/favorites/') && r.request().method() === 'POST' && r.ok(),
    );
    await cabecera.getByRole('button', { name: 'Save to favorites' }).click();
    await guardado;

    await expect(cabecera.getByRole('button', { name: 'Remove from favorites' })).toBeVisible();

    // La lista de favoritos tiene marcado propio, no reutiliza app-property-card; cada tarjeta
    // se identifica por el aria-label de su enlace, que es el titulo del piso.
    await page.goto('/en/renter/favorites');
    await expect(page.getByLabel(titulo).first()).toBeVisible();

    // Y sobrevive a una recarga. Esto es lo que de verdad se prueba: el corazon es OPTIMISTA
    // —se rellena antes de que conteste el servidor—, asi que verlo relleno no demuestra que
    // la llamada llegara. Que el piso siga aqui tras recargar, si.
    await page.reload();
    await expect(page.getByLabel(titulo).first()).toBeVisible();
  });

  test('la sesion sobrevive a una recarga y el SSR la respeta', async ({ page }) => {
    const email = uniqueEmail('renter-sesion');
    await signUp(page, 'Renter', email);

    await page.goto('/en');
    await page.reload();

    // El HTML servido ya sale con el usuario dentro: si el SSR no prestara la cookie del
    // visitante a sus llamadas, la pagina llegaria anonima y el header parpadearia al hidratar.
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
    await expect(page.getByText('E2E Renter').first()).toBeVisible();

    // Y el nombre viene ya en el HTML servido, no puesto al hidratar. Es la comprobacion que
    // ningun test de navegador hace por si solo: el DOM que ve Playwright ya esta hidratado.
    const servido = await page.request.get('/en', { headers: { 'Accept-Language': 'en' } });
    expect(await servido.text()).toContain('E2E Renter');
  });

  test('un inquilino no entra al panel de administracion', async ({ page }) => {
    const email = uniqueEmail('renter-rol');
    await signUp(page, 'Renter', email);

    await page.goto('/en/admin');

    // El guard del cliente es UX; quien manda es RequireRole(Admin) en la API. En cualquier
    // caso el inquilino no debe acabar viendo el panel.
    await expect(page).not.toHaveURL(/\/en\/admin$/);
  });

  test('el portal se navega en movil con el cajon lateral @mobile', async ({ page }) => {
    const email = uniqueEmail('renter-movil');
    await signUp(page, 'Renter', email);

    await page.goto('/en/renter');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('Inicio de sesion', () => {
  test('una cuenta recien creada puede volver a entrar', async ({ page }) => {
    const email = uniqueEmail('renter-login');
    await signUp(page, 'Renter', email);

    // Se cierra sesion desde el header, que es como lo hace una persona: no hay ruta /logout,
    // es un POST a la API desde el boton.
    await page.goto('/en');
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByRole('button', { name: 'Logout' })).toHaveCount(0);

    await page.goto('/en/login');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/en\/renter/);
  });
});
