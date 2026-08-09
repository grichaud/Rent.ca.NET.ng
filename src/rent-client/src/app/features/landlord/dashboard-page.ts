import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, of } from 'rxjs';
import { LandlordService } from '../../core/api/landlord.service';
import { CultureService } from '../../core/i18n/culture.service';
import { formatLongDate, formatTemplate } from '../../shared/format';
import { Icon } from '../../shared/ui/icon/icon';

/** Port de LandlordManage/Pages/Dashboard.cshtml. */
@Component({
  selector: 'app-landlord-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, Icon],
  template: `
    <div class="space-y-8">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ welcome() }} 👋</h1>
        <p class="mt-1 text-sm text-slate-600 dark:text-white/70">
          {{ 'landlord.dashboardSubtitle' | transloco }}
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <a
          [routerLink]="['/', culture.culture(), 'landlord', 'listings']"
          class="glass-card p-5 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors group"
        >
          <div class="flex items-center justify-center h-12 w-12 rounded-2xl shrink-0 bg-brand-500/20">
            <app-icon name="building" class="h-6 w-6 text-brand-500 dark:text-brand-300" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-slate-500 dark:text-white/50">
              {{ 'landlord.totalListings' | transloco }}
            </p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ data() ? data()!.totalListings : '—' }}
            </p>
          </div>
          <app-icon
            name="arrow-right"
            class="h-4 w-4 text-gray-300 dark:text-white/30 group-hover:text-gray-500 dark:group-hover:text-white/60 transition-colors shrink-0"
          />
        </a>

        <div class="glass-card p-5 flex items-center gap-4">
          <div class="flex items-center justify-center h-12 w-12 rounded-2xl shrink-0 bg-purple-500/20">
            <app-icon name="eye" class="h-6 w-6 text-purple-500 dark:text-purple-300" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-slate-500 dark:text-white/50">
              {{ 'landlord.totalViews' | transloco }}
            </p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ data() ? formatCount(data()!.totalViews) : '—' }}
            </p>
          </div>
        </div>

        <a
          [routerLink]="['/', culture.culture(), 'landlord', 'inbox']"
          class="glass-card p-5 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors group"
        >
          <div class="flex items-center justify-center h-12 w-12 rounded-2xl shrink-0 bg-cyan-500/20">
            <app-icon name="message-square" class="h-6 w-6 text-cyan-500 dark:text-cyan-300" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-slate-500 dark:text-white/50">
              {{ 'landlord.totalLeads' | transloco }}
            </p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ data() ? data()!.totalInquiries : '—' }}
            </p>
          </div>
          <app-icon
            name="arrow-right"
            class="h-4 w-4 text-gray-300 dark:text-white/30 group-hover:text-gray-500 dark:group-hover:text-white/60 transition-colors shrink-0"
          />
        </a>

        <a
          [routerLink]="['/', culture.culture(), 'landlord', 'inbox']"
          [queryParams]="{ filter: 'unread' }"
          class="glass-card p-5 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors group"
        >
          <div class="flex items-center justify-center h-12 w-12 rounded-2xl shrink-0 bg-amber-500/20">
            <app-icon name="bell" class="h-6 w-6 text-amber-500 dark:text-amber-300" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-slate-500 dark:text-white/50">
              {{ 'landlord.unreadLeads' | transloco }}
            </p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ data() ? data()!.unreadInquiries : '—' }}
            </p>
          </div>
          <app-icon
            name="arrow-right"
            class="h-4 w-4 text-gray-300 dark:text-white/30 group-hover:text-gray-500 dark:group-hover:text-white/60 transition-colors shrink-0"
          />
        </a>
      </div>

      <div>
        <h2 class="text-sm font-medium mb-3 text-slate-500 dark:text-white/50">
          {{ 'landlord.recentInquiries' | transloco }}
        </h2>
        @if (data(); as d) {
          @if (d.recent.length === 0) {
            <div class="glass-card p-6 text-center text-sm text-slate-500 dark:text-white/60">
              {{ 'landlord.noRecentInquiries' | transloco }}
            </div>
          } @else {
            <div class="glass-card divide-y divide-gray-200 dark:divide-white/10 p-0 overflow-hidden">
              @for (inquiry of d.recent; track inquiry.id) {
                <a
                  [routerLink]="['/', culture.culture(), 'landlord', 'inbox']"
                  class="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  <div class="h-9 w-9 rounded-xl bg-cyan-500/15 flex items-center justify-center shrink-0">
                    <app-icon name="message-square" class="h-4 w-4 text-cyan-500 dark:text-cyan-300" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {{ inquiry.senderName }}
                    </p>
                    <p class="text-xs text-slate-500 dark:text-white/50 truncate">
                      {{ inquiry.propertyTitle }}
                    </p>
                  </div>
                  @if (!inquiry.isRead) {
                    <span
                      class="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-brand-500/20 text-brand-700 dark:text-brand-300 shrink-0"
                      >{{ 'landlord.inboxNew' | transloco }}</span
                    >
                  }
                  <span class="text-xs text-slate-400 dark:text-white/40 shrink-0 hidden sm:block">
                    {{ longDate(inquiry.createdAt) }}
                  </span>
                </a>
              }
            </div>
          }
        }
      </div>

      <div>
        <h2 class="text-sm font-medium mb-3 text-slate-500 dark:text-white/50">
          {{ 'landlord.quickActions' | transloco }}
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            [routerLink]="['/', culture.culture(), 'landlord', 'listings', 'create']"
            class="glass-card p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors group"
          >
            <div class="h-10 w-10 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
              <app-icon name="plus" class="h-5 w-5 text-brand-500 dark:text-brand-300" />
            </div>
            <div>
              <p class="text-gray-900 dark:text-white font-medium text-sm">
                {{ 'landlord.addListing' | transloco }}
              </p>
              <p class="text-xs text-slate-500 dark:text-white/50">
                {{ 'landlord.addListingDesc' | transloco }}
              </p>
            </div>
            <app-icon
              name="arrow-right"
              class="h-4 w-4 text-gray-300 dark:text-white/30 group-hover:text-gray-500 dark:group-hover:text-white/60 ml-auto transition-colors"
            />
          </a>

          <a
            [routerLink]="['/', culture.culture(), 'landlord', 'inbox']"
            class="glass-card p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors group"
          >
            <div class="h-10 w-10 rounded-xl bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0">
              <app-icon name="mail" class="h-5 w-5 text-gray-400 dark:text-white/60" />
            </div>
            <div>
              <p class="text-gray-900 dark:text-white font-medium text-sm">
                {{ 'landlord.viewInbox' | transloco }}
              </p>
              <p class="text-xs text-slate-500 dark:text-white/50">
                {{ 'landlord.viewInboxDesc' | transloco }}
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
export class LandlordDashboardPage {
  protected readonly culture = inject(CultureService);
  private readonly landlord = inject(LandlordService);
  private readonly transloco = inject(TranslocoService);

  protected readonly data = toSignal(
    this.landlord.dashboard().pipe(catchError(() => of(null))),
    { initialValue: null },
  );

  protected readonly welcome = computed(() => {
    const firstName = this.data()?.firstName;
    return firstName
      ? formatTemplate(this.transloco.translate('landlord.dashboardWelcome'), firstName)
      : this.transloco.translate('landlord.dashboardTitle');
  });

  /** "12,345" — mismo formato N0 que el origen. */
  protected formatCount(value: number): string {
    return value.toLocaleString('en-CA');
  }

  protected longDate(value: string): string {
    return formatLongDate(value, this.culture.culture());
  }
}
