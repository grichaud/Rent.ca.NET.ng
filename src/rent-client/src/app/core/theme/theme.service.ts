import { isPlatformBrowser } from '@angular/common';
import {
  DOCUMENT, Injectable, PLATFORM_ID, REQUEST, REQUEST_CONTEXT, inject, signal,
} from '@angular/core';

export type Theme = 'dark' | 'light';

const COOKIE = 'rentca-theme';
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Tema claro/oscuro con la misma semantica que el origen: la cookie `rentca-theme` manda y
 * **el default es oscuro** (solo el valor literal "light" fuerza el tema claro).
 *
 * La clave esta en resolverlo tambien en el servidor. Si la clase `dark` solo se aplicara en
 * el navegador, el HTML del SSR llegaria en claro y el usuario veria un parpadeo blanco antes
 * de hidratar. Por eso se lee la cookie del request entrante durante el render de servidor.
 *
 * Ojo con `document.cookie`: en servidor NO se puede tocar. Angular ejecuta los
 * inicializadores tambien durante la extraccion de rutas del build, donde no hay request y
 * el DOM es minimo; acceder a `document.cookie` alli lanza "NotYetImplemented" y rompe la
 * compilacion. De ahi que la lectura se bifurque por plataforma y no por "hay request o no".
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly request = inject(REQUEST, { optional: true });
  // server.ts inyecta aqui la cabecera `cookie` cruda: el REQUEST del render la trae vacia.
  private readonly requestContext = inject(REQUEST_CONTEXT, { optional: true }) as
    | { cookie?: string }
    | null;

  private readonly _theme = signal<Theme>('dark');
  readonly theme = this._theme.asReadonly();

  init(): void {
    this.apply(this.read());
  }

  toggle(): void {
    const next: Theme = this._theme() === 'dark' ? 'light' : 'dark';
    this.apply(next);

    if (isPlatformBrowser(this.platformId)) {
      // Cookie y no localStorage: es lo unico que viaja en el request y permite al SSR
      // pintar el tema correcto en la siguiente navegacion.
      this.document.cookie = `${COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
    }
  }

  private read(): Theme {
    const header = isPlatformBrowser(this.platformId)
      ? (this.document.cookie ?? '')
      : (this.requestContext?.cookie ?? this.request?.headers.get('cookie') ?? '');

    return readCookie(header, COOKIE) === 'light' ? 'light' : 'dark';
  }

  private apply(theme: Theme): void {
    this._theme.set(theme);

    // Solo se toca la clase. `color-scheme` se resuelve por CSS en styles.scss a partir de
    // esta misma clase: en el DOM del servidor los estilos inline no estan implementados y
    // asignar `style.colorScheme` lanza "NotYetImplemented", lo que aborta el render de la
    // pagina a medias (el sintoma es que desaparece el trozo que faltaba por pintar).
    this.document.documentElement.classList.toggle('dark', theme === 'dark');
  }
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}
