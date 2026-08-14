import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, of } from 'rxjs';
import { Alert, AlertFrequency, AlertsService } from '../../core/api/alerts.service';
import { ApiService } from '../../core/api/api.service';
import { PropertyType } from '../../core/api/api.types';
import { FieldErrors } from '../../core/auth/auth.types';
import { CultureService } from '../../core/i18n/culture.service';
import { formatPrice, formatTemplate } from '../../shared/format';
import { toFieldErrors } from '../auth/ui/auth-errors';
import { Icon } from '../../shared/ui/icon/icon';
import { applyPrivatePageTitle } from '../../core/seo/static-seo';

const TYPE_KEYS: Partial<Record<PropertyType, string>> = {
  Apartment: 'filters.apartment',
  Condo: 'filters.condo',
  House: 'filters.house',
  Townhouse: 'filters.townhouse',
  Basement: 'filters.basement',
  Studio: 'filters.studio',
  Loft: 'filters.loft',
  Duplex: 'filters.duplex',
};

/** El AI chat puede crear alertas con Other; el select solo ofrece los tipos curados. */
const SELECTABLE_TYPES: PropertyType[] = [
  'Apartment', 'Condo', 'House', 'Townhouse', 'Basement', 'Studio', 'Loft', 'Duplex',
];

const FREQUENCIES: { value: AlertFrequency; labelKey: string }[] = [
  { value: 'Instant', labelKey: 'renter.alertsFreqInstant' },
  { value: 'Daily', labelKey: 'renter.alertsFreqDaily' },
  { value: 'Weekly', labelKey: 'renter.alertsFreqWeekly' },
];

/** Port de Alerts/Pages/Index.cshtml: crear, pausar, reanudar y borrar alertas. */
@Component({
  selector: 'app-renter-alerts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe, Icon],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ 'renter.alertsTitle' | transloco }}
          </h1>
          <p class="mt-1 text-sm text-slate-600 dark:text-white/70">
            {{ 'renter.alertsSubtitle' | transloco }}
          </p>
        </div>
        <button
          type="button"
          (click)="toggleForm()"
          class="glass-button-primary inline-flex items-center gap-2 text-sm"
        >
          <app-icon [name]="showForm() ? 'x' : 'plus'" class="h-4 w-4" />
          {{ (showForm() ? 'renter.alertsCancel' : 'renter.alertsNewAlert') | transloco }}
        </button>
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

      @if (showForm()) {
        <section class="glass-card p-6">
          <h2 class="font-semibold text-slate-900 dark:text-white mb-4">
            {{ 'renter.alertsCreateSection' | transloco }}
          </h2>
          <form [formGroup]="form" (ngSubmit)="create()" class="grid gap-4 sm:grid-cols-2">
            @for (message of errors()[''] ?? []; track message) {
              <p role="alert" class="text-sm text-red-600 dark:text-red-400 sm:col-span-2">
                {{ message }}
              </p>
            }

            <div class="sm:col-span-2">
              <label for="alertName" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
                'renter.alertsName' | transloco
              }}</label>
              <input
                id="alertName"
                formControlName="name"
                type="text"
                maxlength="80"
                class="glass-input"
                [placeholder]="'renter.alertsNamePlaceholder' | transloco"
              />
              @for (message of errors()['name'] ?? []; track message) {
                <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
              }
            </div>

            <div>
              <label for="alertCity" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
                'renter.alertsCity' | transloco
              }}</label>
              <select id="alertCity" formControlName="city" class="glass-input" required>
                <option value="" disabled>{{ 'renter.alertsSelectCity' | transloco }}</option>
                @for (city of cities(); track city.slug) {
                  <option [value]="city.name">{{ city.name }}, {{ city.province }}</option>
                }
              </select>
              @for (message of errors()['city'] ?? []; track message) {
                <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
              }
            </div>

            <div>
              <label for="alertType" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
                'filters.propertyType' | transloco
              }}</label>
              <select id="alertType" formControlName="propertyType" class="glass-input">
                <option value="">{{ 'renter.alertsTypeAny' | transloco }}</option>
                @for (type of selectableTypes; track type) {
                  <option [value]="type">{{ typeLabel(type) }}</option>
                }
              </select>
            </div>

            <div>
              <label for="priceMin" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
                'renter.alertsMinPrice' | transloco
              }}</label>
              <input
                id="priceMin"
                formControlName="priceMin"
                type="number"
                step="50"
                min="0"
                class="glass-input"
                [placeholder]="'renter.alertsNoMin' | transloco"
              />
              @for (message of errors()['priceMin'] ?? []; track message) {
                <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
              }
            </div>

            <div>
              <label for="priceMax" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
                'renter.alertsMaxPrice' | transloco
              }}</label>
              <input
                id="priceMax"
                formControlName="priceMax"
                type="number"
                step="50"
                min="0"
                class="glass-input"
                [placeholder]="'renter.alertsNoMax' | transloco"
              />
              @for (message of errors()['priceMax'] ?? []; track message) {
                <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
              }
            </div>

            <div>
              <label for="bedroomsMin" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
                'renter.alertsBedroomsLabel' | transloco
              }}</label>
              <input
                id="bedroomsMin"
                formControlName="bedroomsMin"
                type="number"
                step="1"
                min="0"
                max="10"
                class="glass-input"
                [placeholder]="'renter.alertsTypeAny' | transloco"
              />
              @for (message of errors()['bedroomsMin'] ?? []; track message) {
                <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
              }
            </div>

            <div>
              <label
                for="bathroomsMin"
                class="block text-sm text-slate-700 dark:text-white/80 mb-1"
                >{{ 'renter.alertsBathroomsLabel' | transloco }}</label
              >
              <input
                id="bathroomsMin"
                formControlName="bathroomsMin"
                type="number"
                step="0.5"
                min="0"
                max="10"
                class="glass-input"
                [placeholder]="'renter.alertsTypeAny' | transloco"
              />
              @for (message of errors()['bathroomsMin'] ?? []; track message) {
                <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
              }
            </div>

            <!-- A ancho completo: con siete campos el select quedaria huerfano junto a una
                 celda vacia; asi forma con la frecuencia un bloque de preferencias. -->
            <div class="sm:col-span-2">
              <label for="petsAllowed" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
                'renter.alertsPetsAllowed' | transloco
              }}</label>
              <select id="petsAllowed" formControlName="petsAllowed" class="glass-input">
                <option value="">{{ 'renter.alertsTypeAny' | transloco }}</option>
                <option value="true">{{ 'renter.alertsPetsYes' | transloco }}</option>
                <option value="false">{{ 'renter.alertsPetsNo' | transloco }}</option>
              </select>
            </div>

            <div class="sm:col-span-2">
              <label for="frequency" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
                'renter.alertsFreqLabel' | transloco
              }}</label>
              <select id="frequency" formControlName="frequency" class="glass-input">
                @for (freq of frequencies; track freq.value) {
                  <option [value]="freq.value">{{ freq.labelKey | transloco }}</option>
                }
              </select>
            </div>

            <div class="sm:col-span-2 flex items-center gap-3">
              <button
                type="submit"
                [disabled]="creating()"
                class="glass-button-primary inline-flex items-center gap-2 disabled:opacity-60"
              >
                <app-icon name="check" class="h-4 w-4" />
                {{ 'renter.alertsCreate2' | transloco }}
              </button>
              <button
                type="button"
                (click)="showForm.set(false)"
                class="glass-button inline-flex items-center gap-2"
              >
                {{ 'renter.alertsCancel' | transloco }}
              </button>
            </div>
          </form>
        </section>
      }

      @if (alerts(); as rows) {
        @if (rows.length === 0) {
          <div class="glass-card p-10 text-center">
            <div class="inline-flex h-16 w-16 rounded-2xl bg-brand-500/15 items-center justify-center mb-4">
              <app-icon name="bell" class="h-7 w-7 text-brand-500 dark:text-brand-300" />
            </div>
            <h2 class="font-sans font-bold tracking-tight text-2xl text-slate-900 dark:text-white">
              {{ 'renter.alertsEmpty' | transloco }}
            </h2>
            <p class="text-slate-500 dark:text-white/60 mt-2 max-w-sm mx-auto">
              {{ 'renter.alertsEmptyDesc' | transloco }}
            </p>
            <button
              type="button"
              (click)="showForm.set(true)"
              class="glass-button-primary inline-flex items-center gap-2 mt-6"
            >
              <app-icon name="plus" class="h-4 w-4" />
              {{ 'renter.alertsCreate2' | transloco }}
            </button>
          </div>
        } @else {
          <div class="space-y-3">
            @for (alert of rows; track alert.id) {
              <div
                class="glass-card p-4 sm:p-5 flex items-center gap-4 flex-wrap"
                [class.opacity-60]="!alert.isActive"
              >
                <div
                  class="flex items-center justify-center h-12 w-12 rounded-2xl shrink-0"
                  [class]="alert.isActive ? 'bg-brand-500/20' : 'bg-slate-500/10'"
                >
                  <app-icon
                    [name]="alert.isActive ? 'bell' : 'bell-off'"
                    class="h-6 w-6"
                    [class]="
                      alert.isActive
                        ? 'text-brand-500 dark:text-brand-300'
                        : 'text-slate-400 dark:text-slate-400'
                    "
                  />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-semibold text-slate-900 dark:text-white truncate">{{
                      alert.name || alert.city
                    }}</span>
                    @if (alert.name) {
                      <span class="text-sm text-slate-500 dark:text-white/60 truncate">{{
                        alert.city
                      }}</span>
                    }
                    @if (alert.isActive) {
                      <span
                        class="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                        >{{ 'renter.alertsActive' | transloco }}</span
                      >
                    } @else {
                      <span
                        class="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-slate-500/20 text-slate-600 dark:text-slate-300"
                        >{{ 'renter.alertsPaused' | transloco }}</span
                      >
                    }
                    <span
                      class="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"
                      >{{ frequencyLabel(alert.frequency) }}</span
                    >
                  </div>
                  <p class="text-sm text-slate-500 dark:text-white/60 mt-1 truncate">
                    {{ summarize(alert) }}
                  </p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    (click)="toggle(alert)"
                    [disabled]="busy() === alert.id"
                    class="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors disabled:opacity-60"
                    [title]="t(alert.isActive ? 'renter.alertsPause' : 'renter.alertsResume')"
                    [attr.aria-label]="t(alert.isActive ? 'renter.alertsPause' : 'renter.alertsResume')"
                  >
                    <app-icon [name]="alert.isActive ? 'bell-off' : 'bell'" class="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    (click)="remove(alert)"
                    [disabled]="busy() === alert.id"
                    class="h-9 w-9 inline-flex items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors disabled:opacity-60"
                    [title]="t('renter.alertsDelete')"
                    [attr.aria-label]="t('renter.alertsDelete')"
                  >
                    <app-icon name="trash-2" class="h-4 w-4" />
                  </button>
                </div>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class RenterAlertsPage {
  protected readonly culture = inject(CultureService);
  private readonly alertsService = inject(AlertsService);
  private readonly api = inject(ApiService);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);

  protected readonly selectableTypes = SELECTABLE_TYPES;
  protected readonly frequencies = FREQUENCIES;

  protected readonly alerts = signal<Alert[] | null>(null);
  protected readonly cities = toSignal(this.api.getCities().pipe(catchError(() => of([]))), {
    initialValue: [],
  });

  /** `?showForm=true` sigue abriendo el formulario, como el enlace del origen. */
  protected readonly showForm = signal(
    this.route.snapshot.queryParamMap.get('showForm') === 'true',
  );
  protected readonly creating = signal(false);
  protected readonly busy = signal<string | null>(null);
  protected readonly errors = signal<FieldErrors>({});
  protected readonly flashSuccess = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: [''],
    city: ['', Validators.required],
    propertyType: [''],
    priceMin: [null as number | null],
    priceMax: [null as number | null],
    bedroomsMin: [null as number | null],
    bathroomsMin: [null as number | null],
    petsAllowed: [''],
    frequency: ['Instant' as AlertFrequency],
  });

  constructor() {
    applyPrivatePageTitle('renter.alertsTitle');
    this.load();
  }

  private load(): void {
    this.alertsService.list().subscribe({
      next: (rows) => this.alerts.set(rows),
      error: () => this.alerts.set([]),
    });
  }

  protected t(key: string): string {
    return this.transloco.translate(key);
  }

  protected toggleForm(): void {
    this.showForm.set(!this.showForm());
    this.errors.set({});
  }

  protected typeLabel(type: PropertyType): string {
    const key = TYPE_KEYS[type];
    return key ? this.t(key) : this.t('filters.other');
  }

  protected frequencyLabel(frequency: AlertFrequency): string {
    return this.t(FREQUENCIES.find((f) => f.value === frequency)?.labelKey ?? '');
  }

  /** Resumen de criterios, mismo orden que Summarize() en la vista del origen. */
  protected summarize(alert: Alert): string {
    const parts: string[] = [];
    const perMonth = this.t('listings.perMonth');

    if (alert.priceMin !== null || alert.priceMax !== null) {
      const min = alert.priceMin !== null ? formatPrice(alert.priceMin) : '—';
      const max = alert.priceMax !== null ? formatPrice(alert.priceMax) : '—';
      parts.push(`${min}–${max}${perMonth}`);
    }
    if (alert.bedroomsMin !== null) {
      parts.push(
        alert.bedroomsMin === 0
          ? this.t('listings.beds.studio')
          : formatTemplate(this.t('listings.beds.many'), `${alert.bedroomsMin}+`),
      );
    }
    if (alert.bathroomsMin !== null) {
      const n = Number.isInteger(alert.bathroomsMin)
        ? alert.bathroomsMin
        : alert.bathroomsMin.toFixed(1);
      parts.push(formatTemplate(this.t('listings.baths.many'), `${n}+`));
    }
    if (alert.propertyType !== null) parts.push(this.typeLabel(alert.propertyType));
    if (alert.petsAllowed === true) parts.push(this.t('renter.alertsPetFriendly'));
    else if (alert.petsAllowed === false) parts.push(this.t('renter.alertsNoPets'));

    return parts.length === 0 ? this.t('renter.alertsAnyProperty') : parts.join(' • ');
  }

  protected create(): void {
    if (this.form.invalid || this.creating()) {
      this.form.markAllAsTouched();
      return;
    }

    this.creating.set(true);
    this.errors.set({});
    this.flashSuccess.set(null);

    const raw = this.form.getRawValue();
    this.alertsService
      .create({
        name: raw.name.trim() ? raw.name : null,
        city: raw.city,
        propertyType: (raw.propertyType || null) as PropertyType | null,
        priceMin: raw.priceMin,
        priceMax: raw.priceMax,
        bedroomsMin: raw.bedroomsMin,
        bathroomsMin: raw.bathroomsMin,
        petsAllowed: raw.petsAllowed === '' ? null : raw.petsAllowed === 'true',
        frequency: raw.frequency,
        culture: this.culture.culture(),
      })
      .subscribe({
        next: (created) => {
          this.creating.set(false);
          this.showForm.set(false);
          this.form.reset({ frequency: raw.frequency });
          this.alerts.set([created, ...(this.alerts() ?? [])]);
          this.flashSuccess.set(this.t('renter.alertsFlashCreated'));
        },
        error: (error: unknown) => {
          this.creating.set(false);
          this.errors.set(toFieldErrors(error, 'Could not create the alert.'));
        },
      });
  }

  protected toggle(alert: Alert): void {
    if (this.busy()) return;
    this.busy.set(alert.id);
    this.flashSuccess.set(null);

    this.alertsService.toggle(alert.id).subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.alerts.set(
          (this.alerts() ?? []).map((a) => (a.id === updated.id ? updated : a)),
        );
        this.flashSuccess.set(
          this.t(updated.isActive ? 'renter.alertsFlashResumed' : 'renter.alertsFlashPaused'),
        );
      },
      error: () => this.busy.set(null),
    });
  }

  protected remove(alert: Alert): void {
    if (this.busy()) return;
    // confirm() nativo, como el data-confirm de form-confirm.js en el origen.
    if (!confirm(this.t('renter.alertsDeleteConfirm'))) return;

    this.busy.set(alert.id);
    this.flashSuccess.set(null);

    this.alertsService.delete(alert.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.alerts.set((this.alerts() ?? []).filter((a) => a.id !== alert.id));
        this.flashSuccess.set(this.t('renter.alertsFlashDeleted'));
      },
      error: () => this.busy.set(null),
    });
  }
}
