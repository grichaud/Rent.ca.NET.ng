import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CultureService } from '../core/i18n/culture.service';

/**
 * Marco de las pantallas de autenticacion: sin barra de navegacion, contenido centrado y el
 * logo como unica salida. Es el equivalente de `_LayoutAuth.cshtml` del origen.
 *
 * Que no haya navegacion es deliberado y viene del origen: en una pantalla de credenciales, los
 * enlaces del header solo ofrecen formas de abandonar el formulario a medias.
 */
@Component({
  selector: 'app-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
  template: `
    <div class="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div class="aurora-orb bg-brand-500/10 dark:bg-brand-500/20 w-[600px] h-[600px] -top-40 -left-40"></div>
      <div
        class="aurora-orb bg-purple-500/10 dark:bg-purple-500/20 w-[500px] h-[500px] top-1/3 -right-40"
        style="animation-delay:2s"
      ></div>
      <div
        class="aurora-orb bg-cyan-500/10 dark:bg-cyan-500/20 w-[400px] h-[400px] -bottom-40 left-1/4"
        style="animation-delay:4s"
      ></div>
    </div>

    <main class="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-16">
      <a
        [routerLink]="['/', culture.culture()]"
        class="inline-flex items-baseline mb-8"
        aria-label="Rent.ca home"
      >
        <span class="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Rent</span>
        <span
          class="text-3xl font-bold tracking-tight bg-gradient-to-r from-brand-400 to-cyan-400 bg-clip-text text-transparent"
          >.ca</span
        >
        <span
          class="ml-2 text-[10px] font-bold tracking-widest text-brand-600 dark:text-brand-400 border border-brand-500/40 rounded px-1.5 py-0.5"
          >.NET</span
        >
      </a>

      <div class="w-full max-w-md">
        <router-outlet />
      </div>
    </main>
  `,
})
export class AuthShell {
  protected readonly culture = inject(CultureService);
}
