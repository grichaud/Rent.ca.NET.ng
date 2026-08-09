/**
 * Espera a que el catalogo este sembrado antes de dejar correr un solo test.
 *
 * `webServer` da por arrancada la API en cuanto `/health` responde, pero el sembrado sigue
 * varios segundos despues: es la trampa que ya se pago en los scripts de validacion, donde
 * preguntar antes de tiempo devolvia 504 a traves del proxy. Sin esta espera el primer test
 * abre una home sin anuncios y falla por un motivo que no tiene nada que ver con el.
 */
async function globalSetup(): Promise<void> {
  const url = 'http://localhost:4000/api/home';
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const body = (await response.json()) as { latestListings?: unknown[] };
        if ((body.latestListings?.length ?? 0) > 0) return;
      }
    } catch {
      // La API o el SSR todavia no aceptan conexiones.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(
    'El catalogo sigue vacio tras 90 s. Comprueba que la base RentCaNetNg existe y esta sembrada.',
  );
}

export default globalSetup;
