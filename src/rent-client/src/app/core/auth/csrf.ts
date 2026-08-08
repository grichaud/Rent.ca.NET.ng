import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { DOCUMENT, isPlatformServer } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';

export const XSRF_COOKIE = 'XSRF-TOKEN';
export const XSRF_HEADER = 'X-XSRF-TOKEN';

/** Codigo que la API devuelve cuando el token no vale. Debe coincidir con AntiforgeryTokens. */
const ANTIFORGERY_FAILURE = 'antiforgery_invalid';

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
 * Garantiza que toda peticion que muta estado lleve un token de antiforgery VALIDO.
 *
 * Se hace a mano en vez de con `withXsrfConfiguration` porque el interceptor que trae Angular
 * ignora las URLs absolutas —y en SSR la base de la API lo es— y, sobre todo, porque no sabe
 * nada de renovar el token.
 *
 * Y hay que renovarlo mas de lo que parece: el token de ASP.NET va ligado a la identidad, asi
 * que deja de valer en cuanto la sesion cambia. `AuthService.refreshCsrf` cubre los cambios que
 * nacen aqui (entrar, registrarse, salir), pero no los que ocurren fuera: otra pestana, una
 * cookie caducada o una sesion cerrada desde otro sitio dejan una cookie que parece buena y no
 * lo es. Por eso, ante un rechazo por token invalido, se pide uno nuevo y se reintenta UNA vez;
 * sin esto el usuario ve "Invalid antiforgery token" y solo se arregla recargando a mano.
 */
export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);
  const document = inject(DOCUMENT);

  // En el servidor no hay formularios que enviar: todo lo que muta estado nace de un clic.
  if (isPlatformServer(platformId) || SAFE_METHODS.has(req.method.toUpperCase())) {
    return next(req);
  }

  const send = (token: string | null) =>
    next(token ? withToken(req, token) : req).pipe(
      catchError((error: unknown) => {
        if (!isAntiforgeryFailure(error)) return throwError(() => error);

        // Un solo reintento: si el token recien pedido tampoco vale, el problema es otro y
        // repetir en bucle solo escondera la causa real.
        return from(fetchXsrfToken(document)).pipe(
          switchMap((fresh) => (fresh ? next(withToken(req, fresh)) : throwError(() => error))),
        );
      }),
    );

  const existing = readXsrfCookie(document);
  return existing ? send(existing) : from(fetchXsrfToken(document)).pipe(switchMap(send));
};

function withToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { [XSRF_HEADER]: token } });
}

function isAntiforgeryFailure(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== 400) return false;
  return (error.error as { code?: string } | null)?.code === ANTIFORGERY_FAILURE;
}
