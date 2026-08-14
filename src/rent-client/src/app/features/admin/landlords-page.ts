import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, of, switchMap } from 'rxjs';
import { AdminLandlordRow, AdminPage, AdminService } from '../../core/api/admin.service';
import { ListingTier } from '../../core/api/api.types';
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

const EMPTY_PAGE: AdminPage<AdminLandlordRow> = {
  rows: [],
  totalRows: 0,
  pageIndex: 1,
  pageSize: 50,
  totalPages: 0,
};

/** Lo que el administrador tiene tecleado en la fila, antes de pulsar Apply. */
interface TierDraft {
  tier: ListingTier;
  expiresAt: string;
}

/**
 * Port de Admin/Pages/Landlords.cshtml: tier a nivel de propietario, que tine de halo a todos
 * sus listings. Los filtros y la pagina viven en la URL, como los formularios GET del origen.
 *
 * El tier del propietario NO se propaga a sus propiedades: son dos ventas distintas y la
 * pantalla de propiedades tiene su propio control.
 */
@Component({
  selector: 'app-admin-landlords-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    AdminFlash,
    AdminPagination,
    AdminTierBadge,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ 'admin.landlordsTitle' | transloco }}
        </h1>
        <p class="mt-1 text-sm text-slate-600 dark:text-white/70">
          {{ 'admin.landlordsSubtitle' | transloco }}
        </p>
      </div>

      <app-admin-flash [success]="flashSuccess()" [error]="flashError()" />

      <form
        [formGroup]="filters"
        (ngSubmit)="apply()"
        class="glass-card p-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        <input
          type="text"
          formControlName="email"
          [placeholder]="'admin.filterLandlordEmail' | transloco"
          [attr.aria-label]="'admin.colEmail' | transloco"
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
        <button type="submit" class="glass-button-primary text-sm">
          {{ 'admin.applyFilters' | transloco }}
        </button>
      </form>

      <div class="text-xs text-slate-500 dark:text-white/50">{{ resultsLabel() }}</div>

      <div class="overflow-x-auto glass-card">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-white/50">
            <tr>
              <th class="px-4 py-3">{{ 'admin.colEmail' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.colCompany' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.colListings' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.colTier' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.colExpires' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.colActions' | transloco }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-white/5">
            @for (row of page().rows; track row.id) {
              <tr>
                <td
                  class="px-4 py-3 font-medium text-gray-900 dark:text-white truncate max-w-[220px]"
                  [title]="row.email"
                >
                  {{ row.email }}
                </td>
                <td class="px-4 py-3 text-slate-600 dark:text-white/70">
                  {{ row.companyName || '—' }}
                </td>
                <td class="px-4 py-3 text-slate-600 dark:text-white/70">{{ row.listingsCount }}</td>
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
                      [attr.aria-label]="tierAria(row.email)"
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
                      [attr.aria-label]="expiresAria(row.email)"
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
                <td colspan="6" class="px-4 py-8 text-center text-sm text-slate-500 dark:text-white/50">
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
export class AdminLandlordsPage {
  private readonly admin = inject(AdminService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);

  protected readonly tiers = TIERS;

  protected readonly page = signal<AdminPage<AdminLandlordRow>>(EMPTY_PAGE);
  protected readonly busy = signal<string | null>(null);
  protected readonly flashSuccess = signal<string | null>(null);
  protected readonly flashError = signal<string | null>(null);

  /** Borradores por fila: el select y la fecha son editables antes de confirmar con Apply. */
  private readonly drafts = signal<Record<string, TierDraft>>({});

  protected readonly filters = this.fb.nonNullable.group({
    email: [this.route.snapshot.queryParamMap.get('email') ?? ''],
    tier: [this.route.snapshot.queryParamMap.get('tier') ?? ''],
  });

  constructor() {
    applyPrivatePageTitle('admin.landlordsTitle');
    this.route.queryParamMap
      .pipe(
        switchMap((params) =>
          this.admin
            .landlords({
              email: params.get('email'),
              tier: params.get('tier') as ListingTier | null,
              page: Number(params.get('page')) || null,
            })
            .pipe(catchError(() => of(EMPTY_PAGE))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((page) => {
        this.page.set(page);
        // Los borradores se rehacen con cada carga: si no, una fila de la pagina 2 heredaria
        // lo tecleado en la misma posicion de la pagina 1.
        this.drafts.set({});
      });
  }

  protected apply(): void {
    const raw = this.filters.getRawValue();
    this.router.navigate([], {
      relativeTo: this.route,
      // La pagina se resetea al filtrar: quedarse en la 3 de un resultado de 1 pagina
      // mostraria una tabla vacia sin explicacion.
      queryParams: { email: raw.email.trim() || null, tier: raw.tier || null, page: null },
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

  protected draftTier(row: AdminLandlordRow): ListingTier {
    return this.drafts()[row.id]?.tier ?? row.tier;
  }

  protected draftExpires(row: AdminLandlordRow): string {
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

  protected tierAria(email: string): string {
    return `Tier for ${email}`;
  }

  protected expiresAria(email: string): string {
    return `Tier expiration for ${email}`;
  }

  protected setTier(row: AdminLandlordRow): void {
    if (this.busy()) return;
    this.busy.set(row.id);
    this.flashSuccess.set(null);
    this.flashError.set(null);

    const tier = this.draftTier(row);
    const expiresAt = tier === 'Limited' ? null : fromLocalInput(this.draftExpires(row));

    this.admin.setLandlordTier(row.id, { tier, expiresAt }).subscribe({
      next: (response) => {
        this.busy.set(null);
        this.flashSuccess.set(response.message);
        // Se parchea la fila con lo que se acaba de guardar. Recargar reordenaria la tabla
        // (el orden es por tier) y la fila editada saltaria a otra posicion mientras se lee.
        this.page.set({
          ...this.page(),
          rows: this.page().rows.map((r) =>
            r.id === row.id
              ? { ...r, tier, effectiveTier: tier, tierExpiresAt: expiresAt }
              : r,
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
