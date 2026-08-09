import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AiChatWidget } from './features/ai-chat/ai-chat-widget';
import { Footer } from './layout/footer';
import { Header } from './layout/header';

/** Pantallas que se presentan con su propio marco (AuthShell), sin header ni footer. */
const CHROMELESS_SEGMENTS = new Set([
  'login',
  'signup',
  'forgot-password',
  'reset-password',
  'external-login-confirm',
]);

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Header, Footer, AiChatWidget],
  template: `
    @if (!chromeless()) {
      <app-header />
    }
    <!--
      El <main> va a ancho completo y es cada pantalla la que decide su contenedor.
      El origen resolvia esto con ViewData["FullBleed"] porque el hero de la home ocupa
      todo el ancho mientras el resto del contenido va centrado a max-w-7xl.
    -->
    <main class="w-full">
      <router-outlet />
    </main>
    @if (!chromeless()) {
      <app-footer />
      <!-- Igual que el origen, que solo incluye el widget en _Layout y no en el de auth:
           un formulario de acceso no es sitio para un asistente flotante. -->
      <app-ai-chat-widget />
    }
  `,
})
export class App {
  private readonly router = inject(Router);

  /**
   * Las pantallas de autenticacion se sirven sin barra de navegacion, como en el origen.
   *
   * Se decide aqui y no dentro de AuthShell porque el header y el footer los pinta este
   * componente, que envuelve al outlet. El valor se calcula ya con la URL inicial: en SSR la
   * navegacion se resuelve antes del primer render, asi que el HTML servido de `/en/login`
   * sale directamente sin header en vez de traerlo y quitarlo al hidratar.
   */
  protected readonly chromeless = signal(isChromeless(this.router.url));

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this.chromeless.set(isChromeless(event.urlAfterRedirects)));
  }
}

function isChromeless(url: string): boolean {
  const segments = url.split('?')[0].split('/').filter(Boolean);
  // El primer segmento es el idioma; la pantalla es el segundo.
  return segments.length > 1 && CHROMELESS_SEGMENTS.has(segments[1]);
}
