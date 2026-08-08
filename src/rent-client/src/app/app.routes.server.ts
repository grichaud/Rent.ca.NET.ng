import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * El scaffold de Angular deja `RenderMode.Prerender` para todo. Aqui no sirve por tres
 * motivos:
 *
 * 1. `/:citySlug/:propertySlug` es dinamico: no hay forma de enumerar los slugs en build,
 *    y un listing nuevo no aparecerian hasta el siguiente despliegue.
 * 2. El prerender ocurre sin request, asi que no puede leer la cookie `rentca-theme` y
 *    el HTML saldria siempre en el tema por defecto.
 * 3. Los precios y la disponibilidad cambian; congelarlos en build seria servir datos viejos.
 *
 * Con `Server` cada peticion se renderiza en el momento, que es justo lo que necesita un
 * marketplace para que Google indexe el contenido real.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
