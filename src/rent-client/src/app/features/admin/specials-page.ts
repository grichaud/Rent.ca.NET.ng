import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Observable, Subject, catchError, merge, of, switchMap } from 'rxjs';
import { AdminService, AdminSpecialRow, AdminSpecials } from '../../core/api/admin.service';
import { formatTemplate } from '../../shared/format';
import { Icon } from '../../shared/ui/icon/icon';
import {
  AdminFlash,
  AdminPagination,
  adminErrorMessage,
  formatDay,
  fromLocalInput,
  toLocalInput,
} from './admin-ui';
import { applyPrivatePageTitle } from '../../core/seo/static-seo';

const EMPTY: AdminSpecials = {
  rows: [],
  totalRows: 0,
  pageIndex: 1,
  pageSize: 50,
  totalPages: 0,
  propertyOptions: [],
};

/**
 * Port de Admin/Pages/Specials.cshtml: los incentivos de entrada que salen como banner en la
 * ficha y como chip en las tarjetas de busqueda.
 *
 * El formulario se abre por URL (`?showForm=true`, `?editId=`), igual que los enlaces del
 * origen, para que un enlace a "editar esta promocion" siga funcionando.
 *
 * Diferencia intencionada con el origen: alli el checkbox desmarcado no viajaba en el POST y
 * su parser caia a `true`, asi que desactivar desde el formulario no funcionaba. En JSON el
 * booleano viaja de verdad y el fallo desaparece solo.
 */
@Component({
  selector: 'app-admin-specials-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe, Icon, AdminFlash, AdminPagination],
  template: `
    <div class="space-y-6">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ 'admin.specialsTitle' | transloco }}
          </h1>
          <p class="mt-1 text-sm text-slate-600 dark:text-white/70">
            {{ 'admin.specialsSubtitle' | transloco }}
          </p>
        </div>
        @if (!showForm()) {
          <button
            type="button"
            (click)="openCreate()"
            class="glass-button-primary text-sm inline-flex items-center gap-2"
          >
            <app-icon name="plus" class="h-4 w-4" />
            {{ 'admin.specialsNew' | transloco }}
          </button>
        }
      </div>

      <app-admin-flash [success]="flashSuccess()" [error]="flashError()" />

      @if (showForm()) {
        <form [formGroup]="form" (ngSubmit)="submit()" class="glass-card p-5 space-y-4">
          <div class="text-base font-semibold text-gray-900 dark:text-white">
            {{ (editing() ? 'admin.specialsEditTitle' : 'admin.specialsCreateTitle') | transloco }}
          </div>

          @if (editing(); as row) {
            <div class="text-xs text-slate-500 dark:text-white/60">
              {{ row.propertyCity }} — {{ row.propertyTitle }}
            </div>
          } @else {
            <div>
              <label
                for="specialProperty"
                class="block text-xs uppercase tracking-wider text-slate-500 dark:text-white/50 mb-1"
                >{{ 'admin.specialsProperty' | transloco }}</label
              >
              <select
                id="specialProperty"
                formControlName="propertyId"
                class="glass-input text-sm w-full"
                required
              >
                <option value="">{{ 'admin.specialsSelectProperty' | transloco }}</option>
                @for (option of data().propertyOptions; track option.id) {
                  <option [value]="option.id">{{ option.city }} — {{ option.title }}</option>
                }
              </select>
            </div>
          }

          <div>
            <label
              for="specialTitle"
              class="block text-xs uppercase tracking-wider text-slate-500 dark:text-white/50 mb-1"
              >{{ 'admin.specialsTitleLabel' | transloco }}</label
            >
            <input
              id="specialTitle"
              type="text"
              formControlName="title"
              maxlength="200"
              required
              class="glass-input text-sm w-full"
              placeholder="First month free!"
            />
          </div>

          <div>
            <label
              for="specialDescription"
              class="block text-xs uppercase tracking-wider text-slate-500 dark:text-white/50 mb-1"
              >{{ 'admin.specialsDescriptionLabel' | transloco }}</label
            >
            <textarea
              id="specialDescription"
              formControlName="description"
              maxlength="2000"
              rows="3"
              class="glass-input text-sm w-full"
              placeholder="Sign a 12-month lease and get the first month free."
            ></textarea>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                for="specialStart"
                class="block text-xs uppercase tracking-wider text-slate-500 dark:text-white/50 mb-1"
                >{{ 'admin.specialsStart' | transloco }}</label
              >
              <input
                id="specialStart"
                type="datetime-local"
                formControlName="startDate"
                class="glass-input text-sm w-full"
              />
            </div>
            <div>
              <label
                for="specialEnd"
                class="block text-xs uppercase tracking-wider text-slate-500 dark:text-white/50 mb-1"
                >{{ 'admin.specialsEnd' | transloco }}</label
              >
              <input
                id="specialEnd"
                type="datetime-local"
                formControlName="endDate"
                class="glass-input text-sm w-full"
              />
            </div>
          </div>

          <label class="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-white/80">
            <input type="checkbox" formControlName="isActive" class="h-4 w-4" />
            {{ 'admin.specialsActive' | transloco }}
          </label>

          <div class="flex items-center gap-2">
            <button
              type="submit"
              [disabled]="saving()"
              class="glass-button-primary text-sm disabled:opacity-60"
            >
              {{ (editing() ? 'admin.specialsSave' : 'admin.specialsCreate') | transloco }}
            </button>
            <button type="button" (click)="closeForm()" class="glass-button text-sm">
              {{ 'common.cancel' | transloco }}
            </button>
          </div>
        </form>
      }

      <div class="text-xs text-slate-500 dark:text-white/50">{{ resultsLabel() }}</div>

      <div class="overflow-x-auto glass-card">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-white/50">
            <tr>
              <th class="px-4 py-3">{{ 'admin.specialsColProperty' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.specialsColTitle' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.specialsColWindow' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.specialsColActive' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.colActions' | transloco }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-white/5">
            @for (row of data().rows; track row.id) {
              <tr>
                <td class="px-4 py-3 text-slate-700 dark:text-white/80">
                  <div class="font-medium">{{ row.propertyTitle }}</div>
                  <div class="text-xs text-slate-500 dark:text-white/50">{{ row.propertyCity }}</div>
                </td>
                <td class="px-4 py-3">
                  <div class="font-medium text-gray-900 dark:text-white">{{ row.title }}</div>
                  @if (row.description) {
                    <div class="text-xs text-slate-500 dark:text-white/60 line-clamp-1 max-w-[280px]">
                      {{ row.description }}
                    </div>
                  }
                </td>
                <td class="px-4 py-3 text-xs text-slate-500 dark:text-white/60">
                  {{ day(row.startDate) }} → {{ day(row.endDate) }}
                </td>
                <td class="px-4 py-3">
                  @if (row.isActive) {
                    <span
                      class="inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                      >{{ 'admin.specialsActive' | transloco }}</span
                    >
                  } @else {
                    <span
                      class="inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/50"
                      >{{ 'admin.specialsInactive' | transloco }}</span
                    >
                  }
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
                      (click)="deactivate(row)"
                      [disabled]="busy() !== null"
                      class="glass-button text-xs py-1 px-2 text-rose-600 dark:text-rose-300 disabled:opacity-60"
                    >
                      {{ 'admin.specialsDelete' | transloco }}
                    </button>
                  </div>
                </td>
              </tr>
            }
            @if (data().rows.length === 0) {
              <tr>
                <td colspan="5" class="px-4 py-8 text-center text-sm text-slate-500 dark:text-white/50">
                  {{ 'admin.noResults' | transloco }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <app-admin-pagination
        [pageIndex]="data().pageIndex"
        [totalPages]="data().totalPages"
        (pageChange)="goToPage($event)"
      />
    </div>
  `,
})
export class AdminSpecialsPage {
  private readonly admin = inject(AdminService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);

  protected readonly data = signal<AdminSpecials>(EMPTY);
  protected readonly saving = signal(false);
  protected readonly busy = signal<string | null>(null);
  protected readonly flashSuccess = signal<string | null>(null);
  protected readonly flashError = signal<string | null>(null);

  /** Id que se esta editando; null en alta. Lo manda la URL. */
  private readonly editingId = signal<string | null>(
    this.route.snapshot.queryParamMap.get('editId'),
  );
  private readonly creating = signal(
    this.route.snapshot.queryParamMap.get('showForm') === 'true',
  );

  protected readonly editing = computed(() => {
    const id = this.editingId();
    return id ? (this.data().rows.find((row) => row.id === id) ?? null) : null;
  });
  protected readonly showForm = computed(() => this.creating() || this.editingId() !== null);

  protected readonly form = this.fb.nonNullable.group({
    propertyId: [''],
    title: ['', Validators.required],
    description: [''],
    startDate: [''],
    endDate: [''],
    isActive: [true],
  });

  private readonly reload$ = new Subject<void>();

  constructor() {
    applyPrivatePageTitle('admin.specialsTitle');
    merge(this.route.queryParamMap, this.reload$)
      .pipe(
        switchMap(() => {
          const params = this.route.snapshot.queryParamMap;
          this.editingId.set(params.get('editId'));
          this.creating.set(params.get('showForm') === 'true');
          return this.admin
            .specials(Number(params.get('page')) || null)
            .pipe(catchError(() => of(EMPTY)));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((data) => {
        this.data.set(data);
        this.syncForm();
      });
  }

  /**
   * Vuelca la fila en edicion al formulario. Solo si esta `pristine`: una recarga de la lista
   * mientras se escribe no puede borrar lo tecleado.
   */
  private syncForm(): void {
    if (!this.form.pristine) return;

    const row = this.editing();
    this.form.reset({
      propertyId: '',
      title: row?.title ?? '',
      description: row?.description ?? '',
      startDate: toLocalInput(row?.startDate),
      endDate: toLocalInput(row?.endDate),
      isActive: row ? row.isActive : true,
    });
  }

  protected openCreate(): void {
    this.form.reset({ propertyId: '', title: '', description: '', startDate: '', endDate: '', isActive: true });
    this.navigate({ showForm: 'true', editId: null });
  }

  protected openEdit(row: AdminSpecialRow): void {
    this.form.markAsPristine();
    this.navigate({ showForm: null, editId: row.id });
  }

  protected closeForm(): void {
    this.form.markAsPristine();
    this.navigate({ showForm: null, editId: null });
  }

  protected goToPage(page: number): void {
    this.navigate({ page: page === 1 ? null : String(page) });
  }

  protected resultsLabel(): string {
    return formatTemplate(this.transloco.translate('admin.resultsCount'), this.data().totalRows);
  }

  protected day(value: string | null): string {
    return formatDay(value);
  }

  protected submit(): void {
    if (this.saving()) return;

    const raw = this.form.getRawValue();
    const row = this.editing();
    const payload = {
      title: raw.title.trim(),
      description: raw.description.trim() || null,
      startDate: fromLocalInput(raw.startDate),
      endDate: fromLocalInput(raw.endDate),
      isActive: raw.isActive,
    };

    if (!payload.title || (!row && !raw.propertyId)) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.flashSuccess.set(null);
    this.flashError.set(null);

    const request: Observable<{ message: string }> = row
      ? this.admin.updateSpecial(row.id, payload)
      : this.admin.createSpecial({ ...payload, propertyId: raw.propertyId });

    request.subscribe({
      next: (response) => {
        this.saving.set(false);
        this.flashSuccess.set(response.message);
        this.form.markAsPristine();
        // Cerrar el formulario ya provoca una navegacion, y esa navegacion recarga la lista.
        this.closeForm();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.flashError.set(adminErrorMessage(error, 'Could not save the special.'));
      },
    });
  }

  /** Desactiva (soft-delete). El borrado duro existe en la API pero no se ofrece aqui, igual
   *  que en el origen: una promocion caducada suele querer conservarse como historico. */
  protected deactivate(row: AdminSpecialRow): void {
    if (this.busy()) return;
    this.busy.set(row.id);
    this.flashSuccess.set(null);
    this.flashError.set(null);

    this.admin.deleteSpecial(row.id).subscribe({
      next: (response) => {
        this.busy.set(null);
        this.flashSuccess.set(response.message);
        this.reload$.next();
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.flashError.set(adminErrorMessage(error, 'Could not deactivate the special.'));
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
