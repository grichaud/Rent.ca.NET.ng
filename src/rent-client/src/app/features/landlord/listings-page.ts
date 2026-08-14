import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LandlordService, LandlordListingRow, ListingStatus } from '../../core/api/landlord.service';
import { CultureService } from '../../core/i18n/culture.service';
import { formatPrice, formatTemplate } from '../../shared/format';
import { Icon } from '../../shared/ui/icon/icon';
import { applyPrivatePageTitle } from '../../core/seo/static-seo';

const STATUS_KEYS: Record<ListingStatus, string> = {
  Active: 'landlord.statusActive',
  Draft: 'landlord.statusDraft',
  Inactive: 'landlord.statusInactive',
  Archived: 'landlord.statusArchived',
};

const STATUS_CLASSES: Record<ListingStatus, string> = {
  Active: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  Draft: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  Inactive: 'bg-slate-500/20 text-slate-600 dark:text-slate-300',
  Archived: 'bg-slate-500/20 text-slate-600 dark:text-slate-300',
};

/**
 * Port de LandlordManage/Pages/Listings/Index.cshtml. El flash llega por el estado de la
 * navegacion (crear/editar/desactivar redirigen aqui), que es el TempData de un SPA.
 */
@Component({
  selector: 'app-landlord-listings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, Icon],
  template: `
    <div class="space-y-6">
      <div class="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ 'landlord.listingsTitle' | transloco }}
          </h1>
          @if (listings(); as rows) {
            <p class="mt-1 text-sm text-slate-600 dark:text-white/70">
              {{ countLabel(rows.length) }}
            </p>
          }
        </div>
        <a
          [routerLink]="['/', culture.culture(), 'landlord', 'listings', 'create']"
          class="glass-button-primary inline-flex items-center gap-2 text-sm"
        >
          <app-icon name="plus" class="h-4 w-4" />
          {{ 'landlord.listingsCreate' | transloco }}
        </a>
      </div>

      @if (flashSuccess()) {
        <div
          role="status"
          class="p-3 rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10 text-sm text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-2"
        >
          <app-icon name="check-circle" class="h-4 w-4" />
          {{ flashSuccess() }}
        </div>
      }

      @if (flashWarning()) {
        <div
          role="alert"
          class="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10 text-sm text-amber-700 dark:text-amber-300 inline-flex items-center gap-2"
        >
          <app-icon name="alert-circle" class="h-4 w-4" />
          {{ flashWarning() }}
        </div>
      }

      @if (listings(); as rows) {
        @if (rows.length === 0) {
          <div class="glass-card p-10 text-center">
            <div class="inline-flex h-16 w-16 rounded-2xl bg-brand-500/15 items-center justify-center mb-4">
              <app-icon name="building" class="h-7 w-7 text-brand-500 dark:text-brand-300" />
            </div>
            <h2 class="font-sans font-bold tracking-tight text-2xl text-slate-900 dark:text-white">
              {{ 'landlord.listingsEmpty' | transloco }}
            </h2>
            <p class="text-slate-500 dark:text-white/60 mt-2 max-w-sm mx-auto">
              {{ 'landlord.listingsEmptyDesc' | transloco }}
            </p>
            <a
              [routerLink]="['/', culture.culture(), 'landlord', 'listings', 'create']"
              class="glass-button-primary inline-flex items-center gap-2 mt-6"
            >
              <app-icon name="plus" class="h-4 w-4" />
              {{ 'landlord.listingsCreateFirst' | transloco }}
            </a>
          </div>
        } @else {
          <div class="grid gap-4">
            @for (row of rows; track row.id) {
              <article class="glass-card p-5 flex gap-4 items-center flex-wrap sm:flex-nowrap">
                @if (row.primaryImageUrl) {
                  <img
                    [src]="row.primaryImageUrl"
                    alt=""
                    class="w-24 h-24 rounded-xl object-cover shrink-0"
                  />
                } @else {
                  <div
                    class="w-24 h-24 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-xs text-slate-400 dark:text-white/40 shrink-0 text-center px-1"
                  >
                    {{ 'landlord.noImage' | transloco }}
                  </div>
                }

                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    @if (row.citySlug) {
                      <a
                        [routerLink]="['/', culture.culture(), row.citySlug, row.slug]"
                        class="font-semibold text-slate-900 dark:text-white hover:underline line-clamp-1"
                        >{{ row.title }}</a
                      >
                    } @else {
                      <span class="font-semibold text-slate-900 dark:text-white line-clamp-1">{{
                        row.title
                      }}</span>
                    }
                    <span
                      class="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md"
                      [class]="statusClass(row.status)"
                      >{{ statusLabel(row.status) }}</span
                    >
                  </div>
                  <p class="text-sm text-slate-500 dark:text-white/50 mt-1">
                    {{ row.cityName }}, {{ row.province }}
                    @if (row.price !== null) {
                      · {{ bedsLabel(row.bedrooms ?? 0) }} · {{ price(row.price)
                      }}{{ 'listings.perMonth' | transloco }}
                    }
                    @if (row.unitCount > 1) {
                      · {{ unitsLabel(row.unitCount) }}
                    }
                  </p>
                  <p class="text-xs text-slate-400 dark:text-white/40 mt-1">
                    {{ viewsLabel(row.viewCount) }} · {{ leadsLabel(row.leadCount) }}
                  </p>
                </div>

                <div class="flex gap-2 shrink-0">
                  <a
                    [routerLink]="['/', culture.culture(), 'landlord', 'listings', 'edit', row.id]"
                    class="glass-button text-slate-700 dark:text-white/80 text-sm"
                    [attr.aria-label]="t('landlord.listingsEdit') + ': ' + row.title"
                    >{{ 'common.edit' | transloco }}</a
                  >
                  <a
                    [routerLink]="['/', culture.culture(), 'landlord', 'listings', 'delete', row.id]"
                    class="glass-button text-red-600 dark:text-red-400 text-sm"
                    [attr.aria-label]="t('landlord.deleteTitle') + ': ' + row.title"
                    >{{ 'landlord.deactivate' | transloco }}</a
                  >
                </div>
              </article>
            }
          </div>
        }
      }
    </div>
  `,
})
export class LandlordListingsPage {
  protected readonly culture = inject(CultureService);
  private readonly landlord = inject(LandlordService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  protected readonly listings = signal<LandlordListingRow[] | null>(null);
  protected readonly flashSuccess = signal<string | null>(null);
  protected readonly flashWarning = signal<string | null>(null);

  constructor() {
    applyPrivatePageTitle('landlord.listingsTitle');
    // El TempData del SPA: crear/editar/desactivar navegan aqui con las claves en el estado.
    // Se lee getCurrentNavigation(), NO lastSuccessfulNavigation(): el router asigna esta
    // ultima DESPUES de activar el componente, asi que en el constructor todavia apunta a la
    // navegacion anterior y el flash no se pintaria nunca.
    const state = this.router.getCurrentNavigation()?.extras?.state as
      | { flash?: string; warning?: string }
      | undefined;
    if (state?.flash) this.flashSuccess.set(this.t(state.flash));
    if (state?.warning) this.flashWarning.set(this.t(state.warning));

    this.landlord.listings().subscribe({
      next: (rows) => this.listings.set(rows),
      error: () => this.listings.set([]),
    });
  }

  protected t(key: string): string {
    return this.transloco.translate(key);
  }

  protected price(value: number): string {
    return formatPrice(value);
  }

  protected statusLabel(status: ListingStatus): string {
    return this.t(STATUS_KEYS[status]);
  }

  protected statusClass(status: ListingStatus): string {
    return STATUS_CLASSES[status];
  }

  protected countLabel(count: number): string {
    return formatTemplate(this.t('landlord.listingsCount'), count);
  }

  protected bedsLabel(bedrooms: number): string {
    return formatTemplate(this.t('listings.beds.many'), bedrooms);
  }

  protected unitsLabel(count: number): string {
    return formatTemplate(this.t('landlord.unitsCount'), count);
  }

  protected viewsLabel(count: number): string {
    return formatTemplate(this.t('landlord.viewsCount'), count);
  }

  protected leadsLabel(count: number): string {
    return formatTemplate(this.t('landlord.leadsCount'), count);
  }
}
