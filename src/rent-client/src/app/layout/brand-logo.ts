import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CultureService } from '../core/i18n/culture.service';

/**
 * "Rent.ca .NET NG" — el marcado del origen mas la pastilla de Angular.
 *
 * Las dos pastillas comparten forma y tamaño a proposito: lo que las distingue es el color
 * (azul de marca para .NET, rojo de Angular), que es lo que hace que se lean como dos
 * tecnologias y no como una etiqueta larga.
 *
 * **El mismo par de pastillas aparece en otros tres sitios** que no usan este componente:
 * `auth-shell.ts` (mas grande, sin cabecera) y las barras laterales del renter y del landlord
 * (mas pequeñas, junto a su icono). Al tocar el logo hay que tocar los cuatro o quedaran
 * distintos segun la pantalla. El panel de admin no lleva pastilla, y se queda asi.
 */
@Component({
  selector: 'app-brand-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <a
      [routerLink]="['/', culture.culture()]"
      class="inline-flex items-center select-none group"
      aria-label="Rent.ca - Home"
    >
      <span [attr.class]="size() + ' font-bold tracking-tight text-gray-900 dark:text-white'">Rent</span>
      <span
        [attr.class]="size() + ' font-bold tracking-tight bg-gradient-to-r from-brand-400 to-cyan-400 bg-clip-text text-transparent'"
        >.ca</span
      >
      <span
        class="ml-2 text-[10px] font-bold tracking-widest text-brand-600 dark:text-brand-400 border border-brand-500/40 rounded px-1.5 py-0.5"
        >.NET</span
      >
      <span
        class="ml-1 text-[10px] font-bold tracking-widest text-red-600 dark:text-red-400 border border-red-500/40 rounded px-1.5 py-0.5"
        >NG</span
      >
    </a>
  `,
})
export class BrandLogo {
  protected readonly culture = inject(CultureService);
  readonly size = input('text-2xl');
}
