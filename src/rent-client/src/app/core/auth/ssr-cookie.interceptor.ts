import { HttpInterceptorFn } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, REQUEST, REQUEST_CONTEXT, inject } from '@angular/core';

/**
 * Reenvia la cookie del visitante en las llamadas que el servidor de render hace a la API.
 *
 * Sin esto toda pagina renderizada en servidor sale ANONIMA aunque el usuario tenga sesion: el
 * navegador manda su cookie al servidor de SSR, pero ese servidor abre una conexion nueva hacia
 * la API y no arrastra nada. El sintoma es un parpadeo —el HTML llega con el boton de "iniciar
 * sesion" y al hidratar aparece el menu de usuario— y, en rutas protegidas, un rebote al login.
 *
 * La cabecera `Cookie` es de las que el navegador prohibe fijar por codigo, de ahi que esto solo
 * pueda ocurrir en el servidor. El valor viene de `REQUEST_CONTEXT`, que server.ts rellena con
 * la cabecera cruda; el mismo camino que ya usaba el tema.
 */
export const ssrCookieInterceptor: HttpInterceptorFn = (req, next) => {
  if (isPlatformBrowser(inject(PLATFORM_ID))) return next(req);

  const requestContext = inject(REQUEST_CONTEXT, { optional: true }) as { cookie?: string } | null;
  const request = inject(REQUEST, { optional: true });

  const cookie = requestContext?.cookie ?? request?.headers.get('cookie') ?? '';
  if (!cookie) return next(req);

  return next(req.clone({ setHeaders: { Cookie: cookie } }));
};
