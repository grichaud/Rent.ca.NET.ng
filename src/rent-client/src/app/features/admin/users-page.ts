import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, of, switchMap } from 'rxjs';
import { AdminService, AdminUserRow } from '../../core/api/admin.service';
import { AdminFlash, adminErrorMessage, formatDay } from './admin-ui';
import { applyPrivatePageTitle } from '../../core/seo/static-seo';

/** Cada rol tiene el color de su portal: admin ambar, landlord brand, renter rosa. */
const ROLE_CLASSES: Record<string, string> = {
  Admin: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  Landlord: 'bg-brand-500/20 text-brand-700 dark:text-brand-300',
};
const ROLE_FALLBACK = 'bg-pink-500/20 text-pink-700 dark:text-pink-300';

/**
 * Port de Admin/Pages/Users.cshtml: las 50 cuentas mas recientes y el interruptor del rol
 * Admin. El filtro vive en la URL (`?email=`), como el formulario GET del origen, para que
 * un enlace a la busqueda siga sirviendo.
 */
@Component({
  selector: 'app-admin-users-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe, AdminFlash],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ 'admin.usersTitle' | transloco }}
        </h1>
        <p class="mt-1 text-sm text-slate-600 dark:text-white/70">
          {{ 'admin.usersSubtitle' | transloco }}
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
          formControlName="email"
          [placeholder]="'admin.filterLandlordEmail' | transloco"
          [attr.aria-label]="'admin.colEmail' | transloco"
          class="glass-input text-sm"
        />
        <button type="submit" class="glass-button-primary text-sm">
          {{ 'admin.applyFilters' | transloco }}
        </button>
      </form>

      <div class="overflow-x-auto glass-card">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-white/50">
            <tr>
              <th class="px-4 py-3">{{ 'admin.colEmail' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.usersColName' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.usersColRoles' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.usersColCreated' | transloco }}</th>
              <th class="px-4 py-3">{{ 'admin.colActions' | transloco }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-white/5">
            @for (row of rows(); track row.id) {
              <tr>
                <td
                  class="px-4 py-3 font-medium text-gray-900 dark:text-white truncate max-w-[260px]"
                  [title]="row.email"
                >
                  {{ row.email }}
                </td>
                <td class="px-4 py-3 text-slate-600 dark:text-white/70">{{ row.fullName || '—' }}</td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-1">
                    @for (role of row.roles; track role) {
                      <span
                        class="inline-flex rounded-md px-2 py-0.5 text-xs font-medium"
                        [class]="roleClass(role)"
                        >{{ role }}</span
                      >
                    }
                  </div>
                </td>
                <td class="px-4 py-3 text-xs text-slate-500 dark:text-white/60">
                  {{ day(row.createdAt) }}
                </td>
                <td class="px-4 py-3">
                  <button
                    type="button"
                    (click)="toggleAdmin(row)"
                    [disabled]="busy() !== null"
                    class="glass-button text-xs py-1 px-2 disabled:opacity-60"
                    [class]="
                      row.isAdmin
                        ? 'text-rose-600 dark:text-rose-300'
                        : 'text-emerald-600 dark:text-emerald-300'
                    "
                  >
                    {{ (row.isAdmin ? 'admin.usersRevokeAdmin' : 'admin.usersGrantAdmin') | transloco }}
                  </button>
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
    </div>
  `,
})
export class AdminUsersPage {
  private readonly admin = inject(AdminService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly rows = signal<AdminUserRow[]>([]);
  protected readonly busy = signal<string | null>(null);
  protected readonly flashSuccess = signal<string | null>(null);
  protected readonly flashError = signal<string | null>(null);

  protected readonly filters = this.fb.nonNullable.group({
    email: [this.route.snapshot.queryParamMap.get('email') ?? ''],
  });

  constructor() {
    applyPrivatePageTitle('admin.usersTitle');
    // switchMap sobre la URL: el filtro cambia sin destruir el componente (misma ruta, otra
    // query) y una respuesta que llegue tarde no puede pisar al filtro activo.
    this.route.queryParamMap
      .pipe(
        switchMap((params) => this.admin.users(params.get('email')).pipe(catchError(() => of([])))),
        takeUntilDestroyed(),
      )
      .subscribe((rows) => this.rows.set(rows));
  }

  protected apply(): void {
    const email = this.filters.getRawValue().email.trim();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { email: email || null },
    });
  }

  protected roleClass(role: string): string {
    return ROLE_CLASSES[role] ?? ROLE_FALLBACK;
  }

  protected day(value: string): string {
    return formatDay(value);
  }

  protected toggleAdmin(row: AdminUserRow): void {
    if (this.busy()) return;
    this.busy.set(row.id);
    this.flashSuccess.set(null);
    this.flashError.set(null);

    this.admin.toggleAdmin(row.id).subscribe({
      next: (response) => {
        this.busy.set(null);
        this.flashSuccess.set(response.message);
        // Se parchea la fila en memoria en vez de recargar: la lista es un top-50 por fecha
        // de alta, asi que recargarla no aportaria nada y haria saltar la tabla.
        this.rows.set(
          this.rows().map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  isAdmin: response.isAdmin,
                  roles: response.isAdmin
                    ? [...r.roles, 'Admin'].sort()
                    : r.roles.filter((role) => role !== 'Admin'),
                }
              : r,
          ),
        );
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.flashError.set(adminErrorMessage(error, 'Could not update the role.'));
      },
    });
  }
}
