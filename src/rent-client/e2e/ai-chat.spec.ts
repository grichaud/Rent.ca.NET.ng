import { expect, test } from '@playwright/test';

/**
 * El widget del asistente.
 *
 * Es la unica feature del proyecto que **ningun script de validacion cubre**, y no por
 * descuido: solo existe en el navegador. `validate-ai.ps1` prueba el endpoint SSE por HTTP,
 * pero el widget usa `fetch` en vez de `HttpClient` —porque es SSE sobre POST— y por tanto NO
 * pasa por los interceptores: el token CSRF se pone a mano. Ese camino solo se ejercita aqui.
 *
 * Sin `Ai:OpenRouterApiKey` el servidor responde con `NoOpOpenRouterClient`, un aviso fijo. Da
 * igual: lo que se prueba es el transporte y la interfaz, no la calidad de la respuesta, asi
 * que la suite no gasta cuota de API.
 */
test.describe('Asistente de IA', () => {
  test('el widget abre, manda un mensaje y recibe respuesta a trozos', async ({ page }) => {
    await page.goto('/en');

    await page.getByRole('button', { name: 'Chat with our AI Assistant' }).click();

    const panel = page.getByRole('dialog');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('How can I help you find your next home?');

    await panel.getByRole('textbox').fill('Show me apartments in Toronto');
    await panel.getByRole('button', { name: 'Send' }).click();

    // La respuesta llega troceada por SSE y se reensambla en el cliente. Sin clave de API el
    // servidor contesta este aviso fijo, que sirve igual de testigo: si el token CSRF no se
    // hubiera puesto a mano, el POST moriria con un 400 y no llegaria nada de nada.
    await expect(panel).toContainText('AI assistant is not configured', { timeout: 30_000 });

    // Y el mensaje del usuario sigue en el hilo, no solo la respuesta.
    await expect(panel).toContainText('Show me apartments in Toronto');
  });

  test('el hilo sobrevive a una recarga', async ({ page }) => {
    await page.goto('/en');
    await page.getByRole('button', { name: 'Chat with our AI Assistant' }).click();

    const panel = page.getByRole('dialog');
    await panel.getByRole('textbox').fill('Un mensaje que debe persistir');
    await panel.getByRole('button', { name: 'Send' }).click();
    await expect(panel).toContainText('Un mensaje que debe persistir');

    await page.reload();
    await page.getByRole('button', { name: 'Chat with our AI Assistant' }).click();

    // El hilo se recupera de `/api/ai/conversation`: la cookie de sesion del chat lo identifica
    // aunque el visitante sea anonimo.
    await expect(page.getByRole('dialog')).toContainText('Un mensaje que debe persistir', {
      timeout: 15_000,
    });
  });

  test('el widget no se renderiza en el servidor', async ({ page }) => {
    // Es interaccion pura: montarlo en SSR anadiria peso al HTML de TODAS las paginas sin que
    // el buscador saque nada de el.
    const servido = await page.request.get('/en');
    const html = await servido.text();

    expect(html).not.toContain('Rent.ca Assistant');
  });

  test('no aparece en las pantallas de autenticacion', async ({ page }) => {
    await page.goto('/en/login');

    await expect(page.getByRole('button', { name: 'Chat with our AI Assistant' })).toHaveCount(0);
  });
});
