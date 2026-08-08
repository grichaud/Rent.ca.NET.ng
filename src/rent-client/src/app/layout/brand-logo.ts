import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CultureService } from '../core/i18n/culture.service';

/** "Rent.ca .NET" — mismo marcado que el origen, reutilizado en header, drawer y footer. */
@Component({
  selector: 'app-brand-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <a
      [routerLink]="['/', culture.culture()]"
      class="inline-flex items-baseline select-none group"
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
    </a>
  `,
})
export class BrandLogo {
  protected readonly culture = inject(CultureService);
  readonly size = input('text-2xl');
}
