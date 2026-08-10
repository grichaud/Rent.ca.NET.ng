import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CultureService } from '../core/i18n/culture.service';
import { BrandLogo } from './brand-logo';

@Component({
  selector: 'app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, BrandLogo],
  template: `
    <footer
      class="glass-base mx-4 mb-4 rounded-3xl border-gray-200 dark:border-white/10 bg-white/80 dark:bg-black/20 mt-24"
      role="contentinfo"
    >
      <div class="mx-auto max-w-7xl px-6 py-12">
        <div class="grid grid-cols-1 gap-10 sm:grid-cols-3">
          <div class="flex flex-col gap-4">
            <app-brand-logo />
            <p class="text-sm leading-relaxed text-gray-600 dark:text-white/70">
              {{ 'footer.tagline' | transloco }}
              <br />
              {{ 'footer.verified' | transloco }}
            </p>
          </div>

          <div>
            <h3 class="text-sm font-semibold uppercase tracking-wider mb-4 text-gray-500 dark:text-white/60">
              {{ 'footer.quickLinks' | transloco }}
            </h3>
            <ul class="flex flex-col gap-2" role="list">
              <li>
                <a [routerLink]="['/', culture.culture(), 'about']" [attr.class]="linkClass">{{ 'footer.about' | transloco }}</a>
              </li>
              <li>
                <a [routerLink]="['/', culture.culture(), 'faq']" [attr.class]="linkClass">{{ 'footer.faq' | transloco }}</a>
              </li>
              <li>
                <a [routerLink]="['/', culture.culture(), 'privacy']" [attr.class]="linkClass">{{ 'footer.privacy' | transloco }}</a>
              </li>
              <li>
                <a
                  [href]="'https://rent-ca.vercel.app/' + culture.culture()"
                  target="_blank"
                  rel="noopener"
                  [attr.class]="linkClass"
                  >Next.js version</a
                >
              </li>
            </ul>
          </div>

          <div>
            <h3 class="text-sm font-semibold uppercase tracking-wider mb-4 text-gray-500 dark:text-white/60">
              {{ 'footer.forLandlords' | transloco }}
            </h3>
            <ul class="flex flex-col gap-2" role="list">
              <li>
                <a [routerLink]="['/', culture.culture(), 'landlords']" [attr.class]="linkClass">{{ 'footer.listProperty' | transloco }}</a>
              </li>
              <li>
                <a
                  [routerLink]="['/', culture.culture(), 'landlords']"
                  fragment="pricing"
                  [attr.class]="linkClass"
                  >{{ 'footer.pricing' | transloco }}</a
                >
              </li>
              <li>
                <a [routerLink]="['/', culture.culture(), 'landlord']" [attr.class]="linkClass">{{ 'footer.dashboard' | transloco }}</a>
              </li>
            </ul>
          </div>
        </div>

        <div
          class="mt-10 border-t pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-gray-200 dark:border-white/15"
        >
          <p class="text-sm text-gray-500 dark:text-white/60">{{ 'footer.copyright' | transloco }}</p>
          <p class="text-xs text-gray-500 dark:text-white/60">{{ 'footer.builtWith' | transloco }}</p>
        </div>
      </div>
    </footer>
  `,
})
export class Footer {
  protected readonly culture = inject(CultureService);
  protected readonly linkClass =
    'text-sm text-gray-600 dark:text-white/70 hover:text-gray-900 dark:hover:text-white transition-colors duration-200';
}
