import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, of } from 'rxjs';
import { AdminService } from '../../core/api/admin.service';
import { CultureService } from '../../core/i18n/culture.service';
import { formatTemplate } from '../../shared/format';
import { Icon } from '../../shared/ui/icon/icon';
import { applyPrivatePageTitle } from '../../core/seo/static-seo';

/**
 * Port de Admin/Pages/Index.cshtml: cuatro accesos con la cifra que justifica entrar.
 *
 * Featured y Promoted cuentan el tier ALMACENADO, no el efectivo: la tarjeta responde
 * "cuantos se vendieron", no "cuantos siguen vigentes" — eso se ve fila a fila en la tabla,
 * donde la insignia marca los caducados.
 */
@Component({
  selector: 'app-admin-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, Icon],
  template: `
    <div class="space-y-8">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ 'admin.dashboardTitle' | transloco }}
        </h1>
        <p class="mt-1 text-sm text-slate-600 dark:text-white/70">
          {{ 'admin.dashboardSubtitle' | transloco }}
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <a
          [routerLink]="link('properties')"
          class="glass-card p-5 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors group"
        >
          <div class="flex items-center justify-center h-12 w-12 rounded-2xl shrink-0 bg-amber-500/20">
            <app-icon name="building" class="h-6 w-6 text-amber-500 dark:text-amber-300" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-slate-500 dark:text-white/50">
              {{ 'admin.cardProperties' | transloco }}
            </p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ data() ? data()!.totalProperties : '—' }}
            </p>
            @if (data(); as d) {
              <p class="text-xs text-slate-500 dark:text-white/50 mt-0.5">
                {{ breakdown(d.featuredProperties, d.promotedProperties) }}
              </p>
            }
          </div>
          <app-icon
            name="arrow-right"
            class="h-4 w-4 text-gray-300 dark:text-white/30 group-hover:text-gray-500 dark:group-hover:text-white/60 transition-colors shrink-0"
          />
        </a>

        <a
          [routerLink]="link('landlords')"
          class="glass-card p-5 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors group"
        >
          <div class="flex items-center justify-center h-12 w-12 rounded-2xl shrink-0 bg-brand-500/20">
            <app-icon name="user" class="h-6 w-6 text-brand-500 dark:text-brand-300" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-slate-500 dark:text-white/50">
              {{ 'admin.cardLandlords' | transloco }}
            </p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ data() ? data()!.totalLandlords : '—' }}
            </p>
          </div>
          <app-icon
            name="arrow-right"
            class="h-4 w-4 text-gray-300 dark:text-white/30 group-hover:text-gray-500 dark:group-hover:text-white/60 transition-colors shrink-0"
          />
        </a>

        <a
          [routerLink]="link('specials')"
          class="glass-card p-5 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors group"
        >
          <div class="flex items-center justify-center h-12 w-12 rounded-2xl shrink-0 bg-orange-500/20">
            <app-icon name="sparkles" class="h-6 w-6 text-orange-500 dark:text-orange-300" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-slate-500 dark:text-white/50">
              {{ 'admin.cardActiveSpecials' | transloco }}
            </p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ data() ? data()!.activeSpecials : '—' }}
            </p>
          </div>
          <app-icon
            name="arrow-right"
            class="h-4 w-4 text-gray-300 dark:text-white/30 group-hover:text-gray-500 dark:group-hover:text-white/60 transition-colors shrink-0"
          />
        </a>

        <a
          [routerLink]="link('ai')"
          class="glass-card p-5 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors group"
        >
          <div class="flex items-center justify-center h-12 w-12 rounded-2xl shrink-0 bg-cyan-500/20">
            <app-icon name="message-square" class="h-6 w-6 text-cyan-500 dark:text-cyan-300" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-slate-500 dark:text-white/50">
              {{ 'admin.cardConversations' | transloco }}
            </p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ data() ? data()!.conversations : '—' }}
            </p>
          </div>
          <app-icon
            name="arrow-right"
            class="h-4 w-4 text-gray-300 dark:text-white/30 group-hover:text-gray-500 dark:group-hover:text-white/60 transition-colors shrink-0"
          />
        </a>
      </div>
    </div>
  `,
})
export class AdminDashboardPage {
  constructor() {
    applyPrivatePageTitle('admin.dashboardTitle');
  }

  protected readonly culture = inject(CultureService);
  private readonly admin = inject(AdminService);
  private readonly transloco = inject(TranslocoService);

  protected readonly data = toSignal(this.admin.dashboard().pipe(catchError(() => of(null))), {
    initialValue: null,
  });

  protected link(segment: string): string[] {
    return ['/', this.culture.culture(), 'admin', segment];
  }

  protected breakdown(featured: number, promoted: number): string {
    return formatTemplate(
      this.transloco.translate('admin.cardPropertiesBreakdown'),
      featured,
      promoted,
    );
  }
}
