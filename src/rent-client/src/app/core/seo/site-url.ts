import { isPlatformServer } from '@angular/common';
import { InjectionToken, PLATFORM_ID, REQUEST_CONTEXT, inject } from '@angular/core';

/**
 * Origen publico del sitio (`https://host`), sin barra final.
 *
 * Es lo que se escribe en `canonical`, en los `hreflang`, en `og:url` y en las URLs absolutas
 * del JSON-LD. **No es `API_BASE_URL`**: esa apunta al backend, que el navegador nunca ve. Ya
 * se pago una vez esa confusion (ver el aprendizaje de `/add-payments` en CLAUDE.md: un
 * `success_url` construido sobre el host de la pasarela aterrizaba al usuario en la API).
 *
 * De donde sale, por orden:
 *
 * 1. `SITE_BASE_URL` del entorno, si esta puesta. Equivale a `Site:CanonicalBaseUrl` del
 *    origen y sirve para fijar UN dominio canonico cuando la app responde en varios hosts
 *    (p.ej. `*.azurewebsites.net` y un dominio propio): sin ella, cada host se declararia
 *    canonico de si mismo y el buscador veria el sitio duplicado.
 * 2. El origen de la peticion, que `server.ts` deja en `REQUEST_CONTEXT`. Se pasa
 *    explicitamente, como ya se hacia con la cookie, en vez de leer el token REQUEST: asi no
 *    depende de que Angular decida propagar cabeceras.
 * 3. En el navegador, `location.origin`.
 */
export const SITE_BASE_URL = new InjectionToken<string>('SITE_BASE_URL', {
  providedIn: 'root',
  factory: () => {
    if (isPlatformServer(inject(PLATFORM_ID))) {
      const context = inject(REQUEST_CONTEXT, { optional: true }) as { origin?: string } | null;
      return trimSlash(process.env['SITE_BASE_URL'] ?? context?.origin ?? 'http://localhost:4000');
    }
    // En el navegador no se mira `process.env`: no existe en el bundle y romperia al arrancar.
    // El host que ve el visitante es justo el que el SSR uso para el canonical.
    return trimSlash(location.origin);
  },
});

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Convierte una ruta o URL relativa en absoluta contra el origen del sitio.
 *
 * Las fotos llegan de la API como `/uploads/...`. Open Graph y schema.org exigen URL
 * absolutas: una relativa la ignoran en silencio, que es el peor fallo posible aqui porque
 * la tarjeta simplemente sale sin imagen y nada lo denuncia.
 */
export function absoluteUrl(baseUrl: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return baseUrl + (pathOrUrl.startsWith('/') ? pathOrUrl : '/' + pathOrUrl);
}
