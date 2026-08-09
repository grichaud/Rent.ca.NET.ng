import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, catchError, merge, of, switchMap } from 'rxjs';
import { AdminSearchRow, AdminService } from '../../core/api/admin.service';
import { AdminFlash, adminErrorMessage, formatStamp } from './admin-ui';

/**
 * Port de Admin/Pages/Searches.cshtml: el top 20 de busquedas por uso, para limpiar erratas
 * y borrar entradas basura.
 *
 * `SearchCount` y `LastSearchedAt` no se editan: son telemetria, no contenido. El servidor
 * re-normaliza la consulta al guardar (minusculas y sin espacios sobrantes), porque una fila
 * editada a mano dejaria de casar con el upsert del tracker y se duplicaria en la siguiente
 * busqueda real.
 */
@Component({
  selector: 'app-admin-searches-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe, AdminFlash],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ 'admin.searchesTitle' | transloco }}
        </h1>
        <p class="mt-1 text-sm text-slate-600 dark:text-white/70">
          {{ 'admin.searchesSubtitle' | transloco }}
        </p>
      </div>

      <app-admin-flash [success]="flashSuccess()" [error]="flashError()" />

      <form
        [formGroup]="filters"
        (ngSubmit)="apply()"
        class="glass-card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        <input
          type="text"
          formControlName="q"
          [placeholder]="'admin.searchesFilterPlaceholder' | transloco"
          [attr.aria-label]="'admin.searchesFilterPlaceholder' | transloco"
          class="glass-input text-sm"
        />
        <button type="submit" class="glass-button-primary text-sm">
          {{ 'admin.applyFilters' | transloco }}
        </button>
      </form>

      @if (editing()) {
        <form [formGroup]="form" (ngSubmit)="submit()" class="glass-card p-5 space-y-3">
          <div class="text-base font-semibold text-gray-900 dark:text-white">
            {{ 'admin.searchesEditTitle' | transloco }}
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                for="searchQuery"
                class="block text-xs uppercase tracking-wider text-slate-500 dark:text-white/50 mb-1"
                >{{ 'admin.searchesColQuery' | transloco }}</label
              >
              <input
                id="searchQuery"
                type="text"
                formControlName="normalizedQuery"
                maxlength="200"
                required
                class="glass-input text-sm w-full"
              />
            </div>
            <div>
              <label
                for="searchCity"
                class="block text-xs uppercase tracking-wider text-slate-500 dark:text-white/50 mb-1"
                >{{ 'admin.searchesColCity' | transloco }}</label
              >
              <input
                id="searchCity"
                type="text"
                formControlName="citySlug"
                maxlength="100"
                class="glass-input text-sm w-full"
              />
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="submit"
              [disabled]="saving()"
              class="glass-button-primary text-sm disabled:opacity-60"
            >
              {{ 'admin.specialsSave' | transloco }}
            </button>
            <button type="button" (click)="closeForm()" class="glass-button text-sm">
              {{ 'common.cancel' | transloco }}
            </button>
          </div>
        </form>
      }

      <div class="overflow-x-auto glass-card">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-white/50">
            <tr>
              <th class="px-4 py-3">{{ 'admin.searchesColQuery' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.searchesColCity' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.searchesColCount' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.searchesColLastSeen' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.colActions' | transloco }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-white/5">
            @for (row of rows(); track row.id) {
              <tr>
                <td
                  class="px-4 py-3 font-mono text-xs text-gray-900 dark:text-white truncate max-w-[400px]"
                  [title]="row.normalizedQuery"
                >
                  {{ row.normalizedQuery }}
                </td>
                <td class="px-4 py-3 text-slate-600 dark:text-white/70">{{ row.citySlug || '—' }}</td>
                <td class="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                  {{ row.searchCount }}
                </td>
                <td class="px-4 py-3 text-xs text-slate-500 dark:text-white/60">
                  {{ stamp(row.lastSearchedAt) }}
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      (click)="openEdit(row)"
                      class="glass-button text-xs py-1 px-2"
                    >
                      {{ 'admin.specialsEdit' | transloco }}
                    </button>
                    <button
                      type="button"
                      (click)="remove(row)"
                      [disabled]="busy() !== null"
                      class="glass-button text-xs py-1 px-2 text-rose-600 dark:text-rose-300 disabled:opacity-60"
                    >
                      {{ 'admin.searchesDelete' | transloco }}
                    </button>
                  </div>
                </td>
              </tr>
            }
            @if (rows().length === 0) {
              <tr>
                <td colspan="5" class="px-4 py-8 text-center text-sm text-slate-500 dark:text-white/50">
                  {{ 'admin.noResults' | transloco }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <p class="text-xs text-slate-500 dark:text-white/50">
        {{ 'admin.searchesTopHint' | transloco }}
      </p>
    </div>
  `,
})
export class AdminSearchesPage {
  private readonly admin = inject(AdminService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly rows = signal<AdminSearchRow[]>([]);
  protected readonly saving = signal(false);
  protected readonly busy = signal<string | null>(null);
  protected readonly flashSuccess = signal<string | null>(null);
  protected readonly flashError = signal<string | null>(null);

  private readonly editingId = signal<string | null>(
    this.route.snapshot.queryParamMap.get('editId'),
  );
  protected readonly editing = computed(() => {
    const id = this.editingId();
    return id ? (this.rows().find((row) => row.id === id) ?? null) : null;
  });

  protected readonly filters = this.fb.nonNullable.group({
    q: [this.route.snapshot.queryParamMap.get('q') ?? ''],
  });

  protected readonly form = this.fb.nonNullable.group({
    normalizedQuery: ['', Validators.required],
    citySlug: [''],
  });

  private readonly reload$ = new Subject<void>();

  constructor() {
    merge(this.route.queryParamMap, this.reload$)
      .pipe(
        switchMap(() => {
          const params = this.route.snapshot.queryParamMap;
          this.editingId.set(params.get('editId'));
          return this.admin.searches(params.get('q')).pipe(catchError(() => of([])));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((rows) => {
        this.rows.set(rows);
        this.syncForm();
      });
  }

  /** Solo sobre formulario `pristine`: una recarga no puede borrar lo que se esta tecleando. */
  private syncForm(): void {
    if (!this.form.pristine) return;

    const row = this.editing();
    this.form.reset({
      normalizedQuery: row?.normalizedQuery ?? '',
      citySlug: row?.citySlug ?? '',
    });
  }

  protected apply(): void {
    const q = this.filters.getRawValue().q.trim();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: q || null, editId: null },
    });
  }

  protected openEdit(row: AdminSearchRow): void {
    this.form.markAsPristine();
    this.navigate({ editId: row.id });
  }

  protected closeForm(): void {
    this.form.markAsPristine();
    this.navigate({ editId: null });
  }

  protected stamp(value: string): string {
    return formatStamp(value);
  }

  protected submit(): void {
    const row = this.editing();
    if (!row || this.saving()) return;

    const raw = this.form.getRawValue();
    if (!raw.normalizedQuery.trim()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.flashSuccess.set(null);
    this.flashError.set(null);

    this.admin
      .updateSearch(row.id, {
        normalizedQuery: raw.normalizedQuery.trim(),
        citySlug: raw.citySlug.trim() || null,
      })
      .subscribe({
        next: (response) => {
          this.saving.set(false);
          this.flashSuccess.set(response.message);
          this.form.markAsPristine();
          // Cerrar el formulario navega, y esa navegacion recarga la lista con la fila ya
          // normalizada por el servidor.
          this.closeForm();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          // El 409 del indice unico (query + ciudad) llega aqui con su explicacion.
          this.flashError.set(adminErrorMessage(error, 'Could not update the entry.'));
        },
      });
  }

  protected remove(row: AdminSearchRow): void {
    if (this.busy()) return;
    this.busy.set(row.id);
    this.flashSuccess.set(null);
    this.flashError.set(null);

    this.admin.deleteSearch(row.id).subscribe({
      next: (response) => {
        this.busy.set(null);
        this.flashSuccess.set(response.message);
        // Recarga en vez de filtrar en memoria: la lista es un top-20, asi que al borrar una
        // fila entra otra que antes no cabia.
        this.reload$.next();
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.flashError.set(adminErrorMessage(error, 'Could not delete the entry.'));
      },
    });
  }

  private navigate(queryParams: Record<string, string | null>): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}
