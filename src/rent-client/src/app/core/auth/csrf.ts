import { HttpInterceptorFn } from '@angular/common/http';
import { DOCUMENT, isPlatformServer } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { from, switchMap } from 'rxjs';

export const XSRF_COOKIE = 'XSRF-TOKEN';
export const XSRF_HEADER = 'X-XSRF-TOKEN';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function readXsrfCookie(document: Document): string | null {
  for (const part of (document.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === XSRF_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/**
 * Pide un token nuevo a la API y devuelve su valor.
 *
 * Se usa `fetch` y no `HttpClient` a proposito: inyectar `HttpClient` dentro de un interceptor
 * crea una dependencia circular (el cliente necesita la cadena de interceptores que se esta
 * construyendo). Como esto solo corre en el navegador y contra el mismo origen, `fetch` basta.
 */
export async function fetchXsrfToken(document: Document): Promise<string | null> {
  try {
    await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  } catch {
    // Sin red no hay token; la peticion saldra sin cabecera y la API la rechazara con 400,
    // que es un desenlace mejor que romper aqui con una excepcion sin contexto.
    return null;
  }
  return readXsrfCookie(document);
}

/**
 * Garantiza que toda peticion que muta estado lleve el token de antiforgery.
 *
 * Se hace a mano en vez de con `withXsrfConfiguration` porque el interceptor que trae Angular
 * ignora las URLs absolutas —y en SSR la base de la API lo es— y, sobre todo, porque no sabe
 * que el token hay que renovarlo: el de ASP.NET va ligado a la identidad, asi que el emitido
 * siendo anonimo deja de ser valido en cuanto hay sesion. Ver AuthService.refreshCsrf.
 */
export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);
  const document = inject(DOCUMENT);

  // En el servidor no hay formularios que enviar: todo lo que muta estado nace de un clic.
  if (isPlatformServer(platformId) || SAFE_METHODS.has(req.method.toUpperCase())) {
    return next(req);
  }

  const existing = readXsrfCookie(document);
  if (existing) {
    return next(req.clone({ setHeaders: { [XSRF_HEADER]: existing } }));
  }

  return from(fetchXsrfToken(document)).pipe(
    switchMap((token) =>
      next(token ? req.clone({ setHeaders: { [XSRF_HEADER]: token } }) : req),
    ),
  );
};
