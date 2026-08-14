import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, of, switchMap } from 'rxjs';
import { AdminPage, AdminPropertyRow, AdminService } from '../../core/api/admin.service';
import { ListingTier } from '../../core/api/api.types';
import { ListingStatus } from '../../core/api/landlord.service';
import { formatTemplate } from '../../shared/format';
import {
  AdminFlash,
  AdminPagination,
  AdminTierBadge,
  adminErrorMessage,
  formatStamp,
  fromLocalInput,
  toLocalInput,
} from './admin-ui';
import { applyPrivatePageTitle } from '../../core/seo/static-seo';

const TIERS: ListingTier[] = ['Limited', 'Promoted', 'Featured'];
const STATUSES: ListingStatus[] = ['Draft', 'Active', 'Inactive', 'Archived'];

const EMPTY_PAGE: AdminPage<AdminPropertyRow> = {
  rows: [],
  totalRows: 0,
  pageIndex: 1,
  pageSize: 50,
  totalPages: 0,
};

interface TierDraft {
  tier: ListingTier;
  expiresAt: string;
}

/**
 * Port de Admin/Pages/Properties.cshtml: promover o degradar cualquier listing, con vigencia
 * opcional que lo devuelve solo a Limited. Los cuatro filtros y la pagina viajan en la URL.
 *
 * El estado del listing (Draft/Active/...) NO se toca desde aqui: es del propietario. El
 * panel solo vende posicion.
 */
@Component({
  selector: 'app-admin-properties-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe, AdminFlash, AdminPagination, AdminTierBadge],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ 'admin.propertiesTitle' | transloco }}
        </h1>
        <p class="mt-1 text-sm text-slate-600 dark:text-white/70">
          {{ 'admin.propertiesSubtitle' | transloco }}
        </p>
      </div>

      <app-admin-flash [success]="flashSuccess()" [error]="flashError()" />

      <form
        [formGroup]="filters"
        (ngSubmit)="apply()"
        class="glass-card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
      >
        <input
          type="text"
          formControlName="city"
          [placeholder]="'admin.filterCity' | transloco"
          [attr.aria-label]="'admin.colCity' | transloco"
          class="glass-input text-sm"
        />
        <select
          formControlName="tier"
          class="glass-input text-sm"
          [attr.aria-label]="'admin.colTier' | transloco"
        >
          <option value="">{{ 'admin.filterAnyTier' | transloco }}</option>
          @for (tier of tiers; track tier) {
            <option [value]="tier">{{ tier }}</option>
          }
        </select>
        <select
          formControlName="status"
          class="glass-input text-sm"
          [attr.aria-label]="'admin.colStatus' | transloco"
        >
          <option value="">{{ 'admin.filterAnyStatus' | transloco }}</option>
          @for (status of statuses; track status) {
            <option [value]="status">{{ status }}</option>
          }
        </select>
        <input
          type="text"
          formControlName="landlord"
          [placeholder]="'admin.filterLandlordEmail' | transloco"
          [attr.aria-label]="'admin.colLandlord' | transloco"
          class="glass-input text-sm"
        />
        <button type="submit" class="glass-button-primary text-sm">
          {{ 'admin.applyFilters' | transloco }}
        </button>
      </form>

      <div class="text-xs text-slate-500 dark:text-white/50">{{ resultsLabel() }}</div>

      <div class="overflow-x-auto glass-card">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-white/50">
            <tr>
              <th class="px-4 py-3">{{ 'admin.colTitle' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.colCity' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.colLandlord' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.colStatus' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.colTier' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.colExpires' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.colActions' | transloco }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-white/5">
            @for (row of page().rows; track row.id) {
              <tr>
                <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">{{ row.title }}</td>
                <td class="px-4 py-3 text-slate-600 dark:text-white/70">{{ row.cityName }}</td>
                <td
                  class="px-4 py-3 text-slate-600 dark:text-white/70 truncate max-w-[180px]"
                  [title]="row.landlordEmail"
                >
                  {{ row.landlordEmail }}
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white/80"
                    >{{ row.status }}</span
                  >
                </td>
                <td class="px-4 py-3">
                  <app-admin-tier-badge [tier]="row.tier" [effectiveTier]="row.effectiveTier" />
                </td>
                <td class="px-4 py-3 text-xs text-slate-500 dark:text-white/60">
                  {{ stamp(row.tierExpiresAt) }}
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <select
                      class="glass-input text-xs py-1 px-2"
                      [value]="draftTier(row)"
                      (change)="onTierChange(row.id, $event)"
                      [attr.aria-label]="tierAria(row.title)"
                    >
                      @for (tier of tiers; track tier) {
                        <option [value]="tier">{{ tier }}</option>
                      }
                    </select>
                    <input
                      type="datetime-local"
                      class="glass-input text-xs py-1 px-2"
                      [value]="draftExpires(row)"
                      (change)="onExpiresChange(row.id, $event)"
                      [attr.aria-label]="expiresAria(row.title)"
                    />
                    <button
                      type="button"
                      (click)="setTier(row)"
                      [disabled]="busy() !== null"
                      class="glass-button text-xs py-1 px-2 disabled:opacity-60"
                    >
                      {{ 'admin.applyAction' | transloco }}
                    </button>
                  </div>
                </td>
              </tr>
            }
            @if (page().rows.length === 0) {
              <tr>
                <td colspan="7" class="px-4 py-8 text-center text-sm text-slate-500 dark:text-white/50">
                  {{ 'admin.noResults' | transloco }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <app-admin-pagination
        [pageIndex]="page().pageIndex"
        [totalPages]="page().totalPages"
        (pageChange)="goToPage($event)"
      />
    </div>
  `,
})
export class AdminPropertiesPage {
  private readonly admin = inject(AdminService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);

  protected readonly tiers = TIERS;
  protected readonly statuses = STATUSES;

  protected readonly page = signal<AdminPage<AdminPropertyRow>>(EMPTY_PAGE);
  protected readonly busy = signal<string | null>(null);
  protected readonly flashSuccess = signal<string | null>(null);
  protected readonly flashError = signal<string | null>(null);

  private readonly drafts = signal<Record<string, TierDraft>>({});

  protected readonly filters = this.fb.nonNullable.group({
    city: [this.route.snapshot.queryParamMap.get('city') ?? ''],
    tier: [this.route.snapshot.queryParamMap.get('tier') ?? ''],
    status: [this.route.snapshot.queryParamMap.get('status') ?? ''],
    landlord: [this.route.snapshot.queryParamMap.get('landlord') ?? ''],
  });

  constructor() {
    applyPrivatePageTitle('admin.propertiesTitle');
    this.route.queryParamMap
      .pipe(
        switchMap((params) =>
          this.admin
            .properties({
              city: params.get('city'),
              tier: params.get('tier') as ListingTier | null,
              status: params.get('status') as ListingStatus | null,
              landlord: params.get('landlord'),
              page: Number(params.get('page')) || null,
            })
            .pipe(catchError(() => of(EMPTY_PAGE))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((page) => {
        this.page.set(page);
        this.drafts.set({});
      });
  }

  protected apply(): void {
    const raw = this.filters.getRawValue();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        city: raw.city.trim() || null,
        tier: raw.tier || null,
        status: raw.status || null,
        landlord: raw.landlord.trim() || null,
        page: null,
      },
    });
  }

  protected goToPage(page: number): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page },
      queryParamsHandling: 'merge',
    });
  }

  protected resultsLabel(): string {
    return formatTemplate(this.transloco.translate('admin.resultsCount'), this.page().totalRows);
  }

  protected stamp(value: string | null): string {
    return formatStamp(value);
  }

  protected draftTier(row: AdminPropertyRow): ListingTier {
    return this.drafts()[row.id]?.tier ?? row.tier;
  }

  protected draftExpires(row: AdminPropertyRow): string {
    return this.drafts()[row.id]?.expiresAt ?? toLocalInput(row.tierExpiresAt);
  }

  protected onTierChange(id: string, event: Event): void {
    const tier = (event.target as HTMLSelectElement).value as ListingTier;
    this.patchDraft(id, (draft) => ({ ...draft, tier }));
  }

  protected onExpiresChange(id: string, event: Event): void {
    const expiresAt = (event.target as HTMLInputElement).value;
    this.patchDraft(id, (draft) => ({ ...draft, expiresAt }));
  }

  protected tierAria(title: string): string {
    return `Tier for ${title}`;
  }

  protected expiresAria(title: string): string {
    return `Tier expiration for ${title}`;
  }

  protected setTier(row: AdminPropertyRow): void {
    if (this.busy()) return;
    this.busy.set(row.id);
    this.flashSuccess.set(null);
    this.flashError.set(null);

    const tier = this.draftTier(row);
    const expiresAt = tier === 'Limited' ? null : fromLocalInput(this.draftExpires(row));

    this.admin.setPropertyTier(row.id, { tier, expiresAt }).subscribe({
      next: (response) => {
        this.busy.set(null);
        this.flashSuccess.set(response.message);
        this.page.set({
          ...this.page(),
          rows: this.page().rows.map((r) =>
            r.id === row.id ? { ...r, tier, effectiveTier: tier, tierExpiresAt: expiresAt } : r,
          ),
        });
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.flashError.set(adminErrorMessage(error, 'Could not update the tier.'));
      },
    });
  }

  private patchDraft(id: string, update: (draft: TierDraft) => TierDraft): void {
    const row = this.page().rows.find((r) => r.id === id);
    if (!row) return;

    const current = this.drafts()[id] ?? {
      tier: row.tier,
      expiresAt: toLocalInput(row.tierExpiresAt),
    };
    this.drafts.set({ ...this.drafts(), [id]: update(current) });
  }
}
