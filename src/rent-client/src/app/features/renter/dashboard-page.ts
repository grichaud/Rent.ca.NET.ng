import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, of } from 'rxjs';
import { RenterService } from '../../core/api/renter.service';
import { CultureService } from '../../core/i18n/culture.service';
import { formatTemplate } from '../../shared/format';
import { Icon } from '../../shared/ui/icon/icon';

interface StatCard {
  segment: string;
  icon: string;
  iconWrap: string;
  iconColor: string;
  labelKey: string;
  value: (d: { savedProperties: number; activeAlerts: number; inquiriesSent: number }) => number;
}

/** Port de RenterPortal/Pages/Dashboard.cshtml. */
@Component({
  selector: 'app-renter-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, Icon],
  template: `
    <div class="space-y-8">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ welcome() }} 👋</h1>
        <p class="mt-1 text-sm text-slate-600 dark:text-white/70">
          {{ 'renter.dashboardSubtitle' | transloco }}
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        @for (card of statCards; track card.segment) {
          <a
            [routerLink]="['/', culture.culture(), 'renter', card.segment]"
            class="glass-card p-5 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors group"
          >
            <div
              class="flex items-center justify-center h-12 w-12 rounded-2xl shrink-0"
              [class]="card.iconWrap"
            >
              <app-icon [name]="card.icon" class="h-6 w-6" [class]="card.iconColor" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-slate-500 dark:text-white/50">{{ card.labelKey | transloco }}</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ data() ? card.value(data()!) : '—' }}
              </p>
            </div>
            <app-icon
              name="arrow-right"
              class="h-4 w-4 text-gray-300 dark:text-white/30 group-hover:text-gray-500 dark:group-hover:text-white/60 transition-colors shrink-0"
            />
          </a>
        }
      </div>

      <div>
        <h2 class="text-sm font-medium mb-3 text-slate-500 dark:text-white/50">
          {{ 'renter.quickActions' | transloco }}
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            [routerLink]="['/', culture.culture()]"
            class="glass-card p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors group"
          >
            <div
              class="h-10 w-10 rounded-xl bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0"
            >
              <app-icon name="search" class="h-5 w-5 text-gray-400 dark:text-white/60" />
            </div>
            <div>
              <p class="text-gray-900 dark:text-white font-medium text-sm">
                {{ 'renter.browseListings' | transloco }}
              </p>
              <p class="text-xs text-slate-500 dark:text-white/50">
                {{ 'renter.findYourNextHome' | transloco }}
              </p>
            </div>
            <app-icon
              name="arrow-right"
              class="h-4 w-4 text-gray-300 dark:text-white/30 group-hover:text-gray-500 dark:group-hover:text-white/60 ml-auto transition-colors"
            />
          </a>

          <a
            [routerLink]="['/', culture.culture(), 'renter', 'alerts']"
            class="glass-card p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors group"
          >
            <div class="h-10 w-10 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
              <app-icon name="bell" class="h-5 w-5 text-brand-500 dark:text-brand-300" />
            </div>
            <div>
              <p class="text-gray-900 dark:text-white font-medium text-sm">
                {{ 'detail.setAlert' | transloco }}
              </p>
              <p class="text-xs text-slate-500 dark:text-white/50">
                {{ 'renter.getNotifiedNew' | transloco }}
              </p>
            </div>
            <app-icon
              name="arrow-right"
              class="h-4 w-4 text-gray-300 dark:text-white/30 group-hover:text-gray-500 dark:group-hover:text-white/60 ml-auto transition-colors"
            />
          </a>
        </div>
      </div>
    </div>
  `,
})
export class RenterDashboardPage {
  protected readonly culture = inject(CultureService);
  private readonly renter = inject(RenterService);
  private readonly transloco = inject(TranslocoService);

  protected readonly data = toSignal(
    this.renter.dashboard().pipe(catchError(() => of(null))),
    { initialValue: null },
  );

  protected readonly welcome = computed(() => {
    const firstName = this.data()?.firstName;
    return firstName
      ? formatTemplate(this.transloco.translate('renter.dashboardWelcome'), firstName)
      : this.transloco.translate('renter.dashboardWelcomeNoName');
  });

  protected readonly statCards: StatCard[] = [
    {
      segment: 'favorites',
      icon: 'heart',
      iconWrap: 'bg-pink-500/20',
      iconColor: 'text-pink-500 dark:text-pink-300',
      labelKey: 'renter.savedProperties',
      value: (d) => d.savedProperties,
    },
    {
      segment: 'alerts',
      icon: 'bell',
      iconWrap: 'bg-brand-500/20',
      iconColor: 'text-brand-500 dark:text-brand-300',
      labelKey: 'renter.activeAlerts',
      value: (d) => d.activeAlerts,
    },
    {
      segment: 'inquiries',
      icon: 'message-square',
      iconWrap: 'bg-cyan-500/20',
      iconColor: 'text-cyan-500 dark:text-cyan-300',
      labelKey: 'renter.inquiriesSent',
      value: (d) => d.inquiriesSent,
    },
  ];
}
