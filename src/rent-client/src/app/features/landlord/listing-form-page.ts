import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, of } from 'rxjs';
import {
  LandlordService, ListingFormPayload, ListingStatus, ListingUnitPayload,
} from '../../core/api/landlord.service';
import { ApiService } from '../../core/api/api.service';
import { Amenity, LeaseTerm, ListingImage, PropertyType } from '../../core/api/api.types';
import { FieldErrors } from '../../core/auth/auth.types';
import { CultureService } from '../../core/i18n/culture.service';
import { formatTemplate } from '../../shared/format';
import { toFieldErrors } from '../auth/ui/auth-errors';
import { Icon } from '../../shared/ui/icon/icon';

const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];

/** Lista curada, como el origen: "Other" no se ofrece al crear. */
const SELECTABLE_TYPES: { value: PropertyType; key: string }[] = [
  { value: 'Apartment', key: 'filters.apartment' },
  { value: 'Condo', key: 'filters.condo' },
  { value: 'House', key: 'filters.house' },
  { value: 'Townhouse', key: 'filters.townhouse' },
  { value: 'Basement', key: 'filters.basement' },
  { value: 'Studio', key: 'filters.studio' },
  { value: 'Loft', key: 'filters.loft' },
  { value: 'Duplex', key: 'filters.duplex' },
];

const STATUSES: { value: ListingStatus; key: string }[] = [
  { value: 'Active', key: 'landlord.statusActive' },
  { value: 'Draft', key: 'landlord.statusDraft' },
  { value: 'Inactive', key: 'landlord.statusInactive' },
];

const LEASE_TERMS: { value: LeaseTerm; key: string }[] = [
  { value: 'MonthToMonth', key: 'detail.lease.monthToMonth' },
  { value: 'SixMonths', key: 'detail.lease.sixMonths' },
  { value: 'OneYear', key: 'detail.lease.oneYear' },
  { value: 'TwoYears', key: 'detail.lease.twoYears' },
  { value: 'Flexible', key: 'detail.lease.flexible' },
];

const AMENITY_CATEGORY_KEYS: Record<string, string> = {
  building: 'detail.amenityCat.building',
  unit: 'detail.amenityCat.unit',
  nearby: 'detail.amenityCat.nearby',
  other: 'detail.amenityCat.other',
};

type UnitGroup = FormGroup<ReturnType<typeof buildUnitControls>>;

function buildUnitControls(fb: FormBuilder, unit?: ListingUnitPayload) {
  return {
    id: fb.control<string | null>(unit?.id ?? null),
    bedrooms: fb.nonNullable.control(unit?.bedrooms ?? 1),
    bathrooms: fb.nonNullable.control(unit?.bathrooms ?? 1),
    sqFt: fb.control<number | null>(unit?.sqFt ?? null),
    price: fb.nonNullable.control(unit?.price ?? 0, Validators.required),
    availableDate: fb.control<string | null>(unit?.availableDate ?? null),
    availableUnits: fb.nonNullable.control(unit?.availableUnits ?? 1),
  };
}

/**
 * Port de Create.cshtml + Edit.cshtml + _ListingFormFields.cshtml en un solo componente: la
 * ruta decide el modo (`listings/create` o `listings/edit/:id`). Las filas dinamicas de
 * unidades que en el origen movia landlord-units.js aqui son un FormArray.
 *
 * Las fotos NO viajan con el form: primero se guarda el listing (JSON) y despues se sube el
 * lote (multipart). En Edit, borrar una foto o cambiar la portada pega a la API al momento,
 * como los submits con formnovalidate del origen.
 */
@Component({
  selector: 'app-landlord-listing-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, Icon],
  template: `
    @if (notFound()) {
      <section class="max-w-xl mx-auto glass-card p-10 text-center">
        <h1 class="font-sans font-bold tracking-tight text-3xl text-slate-900 dark:text-white">
          {{ 'detail.notFound' | transloco }}
        </h1>
        <a
          [routerLink]="['/', culture.culture(), 'landlord', 'listings']"
          class="glass-button-primary inline-block mt-6"
          >{{ 'landlord.viewListings' | transloco }}</a
        >
      </section>
    } @else {
      <section class="max-w-3xl mx-auto">
        <a
          [routerLink]="['/', culture.culture(), 'landlord', 'listings']"
          class="text-sm text-slate-500 dark:text-white/50 hover:underline"
          >&larr; {{ 'landlord.backToListings' | transloco }}</a
        >
        <h1 class="font-sans font-bold tracking-tight text-3xl text-slate-900 dark:text-white mt-2">
          {{ (isEdit() ? 'landlord.listingsEdit' : 'landlord.formCreateTitle') | transloco }}
        </h1>

        <form [formGroup]="form" (ngSubmit)="save()" class="mt-6 space-y-6">
          @for (message of errors()[''] ?? []; track message) {
            <p role="alert" class="text-sm text-red-600 dark:text-red-400">{{ message }}</p>
          }

          <!-- Titulo y estado -->
          <section class="glass-card p-6 space-y-4">
            <h2 class="font-semibold text-slate-900 dark:text-white">
              {{ 'landlord.formTitle' | transloco }}
            </h2>

            <div>
              <label for="title" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
                'landlord.formTitle' | transloco
              }}</label>
              <input
                id="title"
                formControlName="title"
                class="glass-input"
                [placeholder]="'landlord.formTitlePlaceholder' | transloco"
              />
              @for (message of errors()['title'] ?? []; track message) {
                <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
              }
            </div>

            <div>
              <label for="description" class="block text-sm text-slate-700 dark:text-white/80 mb-1">
                {{ 'landlord.formDescription' | transloco }}
                <span class="text-slate-400 dark:text-white/40 font-normal">{{
                  'landlord.formOptional' | transloco
                }}</span>
              </label>
              <textarea id="description" formControlName="description" rows="5" class="glass-input"></textarea>
              @for (message of errors()['description'] ?? []; track message) {
                <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
              }
            </div>

            <div class="grid sm:grid-cols-2 gap-3">
              <div>
                <label for="propertyType" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
                  'landlord.formType' | transloco
                }}</label>
                <select id="propertyType" formControlName="propertyType" class="glass-input">
                  @for (type of selectableTypes; track type.value) {
                    <option [value]="type.value">{{ type.key | transloco }}</option>
                  }
                </select>
              </div>
              <div>
                <label for="status" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
                  'landlord.formStatus' | transloco
                }}</label>
                <select id="status" formControlName="status" class="glass-input">
                  @for (status of statuses; track status.value) {
                    <option [value]="status.value">{{ status.key | transloco }}</option>
                  }
                </select>
                <p class="text-xs text-slate-500 dark:text-white/50 mt-1">
                  {{ 'landlord.formStatusHint' | transloco }}
                </p>
              </div>
            </div>
          </section>

          <!-- Direccion -->
          <section class="glass-card p-6 space-y-4">
            <h2 class="font-semibold text-slate-900 dark:text-white">
              {{ 'landlord.formAddress' | transloco }}
            </h2>

            <div>
              <label for="streetAddress" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
                'landlord.formAddress' | transloco
              }}</label>
              <input id="streetAddress" formControlName="streetAddress" class="glass-input" />
              @for (message of errors()['streetAddress'] ?? []; track message) {
                <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
              }
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="cityName" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
                  'landlord.formCity' | transloco
                }}</label>
                <input
                  id="cityName"
                  formControlName="cityName"
                  class="glass-input"
                  placeholder="Toronto"
                  list="landlord-cities"
                />
                <datalist id="landlord-cities">
                  @for (city of cities(); track city.slug) {
                    <option [value]="city.name"></option>
                  }
                </datalist>
                @for (message of errors()['cityName'] ?? []; track message) {
                  <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
                }
              </div>
              <div>
                <label for="province" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
                  'landlord.formProvince' | transloco
                }}</label>
                <select id="province" formControlName="province" class="glass-input">
                  <option value="" disabled>{{ 'landlord.formSelectProvince' | transloco }}</option>
                  @for (province of provinces; track province) {
                    <option [value]="province">{{ province }}</option>
                  }
                </select>
                @for (message of errors()['province'] ?? []; track message) {
                  <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
                }
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="postalCode" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
                  'landlord.formPostalCode' | transloco
                }}</label>
                <input id="postalCode" formControlName="postalCode" class="glass-input" />
                @for (message of errors()['postalCode'] ?? []; track message) {
                  <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
                }
              </div>
              <div>
                <label for="neighbourhood" class="block text-sm text-slate-700 dark:text-white/80 mb-1">
                  {{ 'landlord.formNeighbourhood' | transloco }}
                  <span class="text-slate-400 dark:text-white/40 font-normal">{{
                    'landlord.formOptional' | transloco
                  }}</span>
                </label>
                <input id="neighbourhood" formControlName="neighbourhood" class="glass-input" />
              </div>
            </div>
          </section>

          <!-- Unidades -->
          <section class="glass-card p-6 space-y-4">
            <h2 class="font-semibold text-slate-900 dark:text-white">
              {{ 'landlord.formUnits' | transloco }}
            </h2>

            <div class="space-y-3" formArrayName="units">
              @for (unit of units.controls; track unit; let i = $index) {
                <fieldset
                  [formGroupName]="i"
                  class="rounded-xl border border-gray-200 dark:border-white/10 p-4"
                >
                  <div class="flex items-center justify-between mb-3">
                    <legend
                      class="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-white/50"
                    >
                      {{ unitLegend(i) }}
                    </legend>
                    @if (units.length > 1) {
                      <button
                        type="button"
                        (click)="removeUnit(i)"
                        class="text-xs text-red-600 dark:text-red-400 hover:underline"
                      >
                        {{ 'landlord.formRemoveUnit' | transloco }}
                      </button>
                    }
                  </div>
                  <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div>
                      <label
                        [for]="'unit-' + i + '-bedrooms'"
                        class="block text-sm text-slate-700 dark:text-white/80 mb-1"
                        >{{ 'landlord.formBedrooms' | transloco }}</label
                      >
                      <input
                        [id]="'unit-' + i + '-bedrooms'"
                        formControlName="bedrooms"
                        type="number"
                        min="0"
                        max="20"
                        class="glass-input"
                      />
                    </div>
                    <div>
                      <label
                        [for]="'unit-' + i + '-bathrooms'"
                        class="block text-sm text-slate-700 dark:text-white/80 mb-1"
                        >{{ 'landlord.formBathrooms' | transloco }}</label
                      >
                      <input
                        [id]="'unit-' + i + '-bathrooms'"
                        formControlName="bathrooms"
                        type="number"
                        step="0.5"
                        min="0.5"
                        class="glass-input"
                      />
                    </div>
                    <div>
                      <label
                        [for]="'unit-' + i + '-sqft'"
                        class="block text-sm text-slate-700 dark:text-white/80 mb-1"
                        >{{ 'landlord.formSqFt' | transloco }}</label
                      >
                      <input
                        [id]="'unit-' + i + '-sqft'"
                        formControlName="sqFt"
                        type="number"
                        min="0"
                        class="glass-input"
                      />
                    </div>
                    <div>
                      <label
                        [for]="'unit-' + i + '-price'"
                        class="block text-sm text-slate-700 dark:text-white/80 mb-1"
                        >{{ 'landlord.formPrice' | transloco }}</label
                      >
                      <input
                        [id]="'unit-' + i + '-price'"
                        formControlName="price"
                        type="number"
                        step="50"
                        min="0"
                        class="glass-input"
                      />
                    </div>
                    <div>
                      <label
                        [for]="'unit-' + i + '-available'"
                        class="block text-sm text-slate-700 dark:text-white/80 mb-1"
                        >{{ 'landlord.formAvailableDate' | transloco }}</label
                      >
                      <input
                        [id]="'unit-' + i + '-available'"
                        formControlName="availableDate"
                        type="date"
                        class="glass-input"
                      />
                    </div>
                  </div>
                </fieldset>
              }
            </div>
            @for (message of unitErrors(); track message) {
              <span role="alert" class="text-xs text-red-600 dark:text-red-400 block">{{ message }}</span>
            }

            <button
              type="button"
              (click)="addUnit()"
              class="glass-button inline-flex items-center gap-2 text-sm"
            >
              <app-icon name="plus" class="h-4 w-4" />
              {{ 'landlord.formAddUnit' | transloco }}
            </button>

            <div class="grid sm:grid-cols-2 gap-3 pt-2 border-t border-gray-200 dark:border-white/10">
              <div>
                <label for="leaseTerm" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
                  'landlord.formLeaseTerm' | transloco
                }}</label>
                <select id="leaseTerm" formControlName="leaseTerm" class="glass-input">
                  @for (term of leaseTerms; track term.value) {
                    <option [value]="term.value">{{ term.key | transloco }}</option>
                  }
                </select>
              </div>
              <div class="flex gap-6 items-end pb-2">
                <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-white/80">
                  <input
                    type="checkbox"
                    formControlName="petsAllowed"
                    class="rounded border-gray-300 dark:border-white/20"
                  />
                  {{ 'landlord.formPetsAllowed' | transloco }}
                </label>
                <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-white/80">
                  <input
                    type="checkbox"
                    formControlName="furnished"
                    class="rounded border-gray-300 dark:border-white/20"
                  />
                  {{ 'landlord.formFurnished' | transloco }}
                </label>
              </div>
            </div>
          </section>

          <!-- Sobre la propiedad -->
          <section class="glass-card p-6 space-y-4">
            <h2 class="font-semibold text-slate-900 dark:text-white">
              {{ 'detail.aboutProperty' | transloco }}
            </h2>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label for="parkingType" class="block text-sm text-slate-700 dark:text-white/80 mb-1">
                  {{ 'landlord.formParkingType' | transloco }}
                  <span class="text-slate-400 dark:text-white/40 font-normal">{{
                    'landlord.formOptional' | transloco
                  }}</span>
                </label>
                <input id="parkingType" formControlName="parkingType" class="glass-input" />
                @for (message of errors()['parkingType'] ?? []; track message) {
                  <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
                }
              </div>
              <div>
                <label for="yearBuilt" class="block text-sm text-slate-700 dark:text-white/80 mb-1">
                  {{ 'landlord.formYearBuilt' | transloco }}
                  <span class="text-slate-400 dark:text-white/40 font-normal">{{
                    'landlord.formOptional' | transloco
                  }}</span>
                </label>
                <input
                  id="yearBuilt"
                  formControlName="yearBuilt"
                  type="number"
                  min="1800"
                  max="2100"
                  class="glass-input"
                />
                @for (message of errors()['yearBuilt'] ?? []; track message) {
                  <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
                }
              </div>
              <div>
                <label for="totalFloors" class="block text-sm text-slate-700 dark:text-white/80 mb-1">
                  {{ 'landlord.formTotalFloors' | transloco }}
                  <span class="text-slate-400 dark:text-white/40 font-normal">{{
                    'landlord.formOptional' | transloco
                  }}</span>
                </label>
                <input
                  id="totalFloors"
                  formControlName="totalFloors"
                  type="number"
                  min="1"
                  max="200"
                  class="glass-input"
                />
                @for (message of errors()['totalFloors'] ?? []; track message) {
                  <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
                }
              </div>
            </div>
          </section>

          <!-- Amenities -->
          @if (amenityGroups().length > 0) {
            <section class="glass-card p-6 space-y-4">
              <h2 class="font-semibold text-slate-900 dark:text-white">
                {{ 'landlord.formAmenities' | transloco }}
              </h2>
              @for (group of amenityGroups(); track group.category) {
                <fieldset>
                  <legend
                    class="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-white/50 mb-2"
                  >
                    {{ group.label }}
                  </legend>
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    @for (amenity of group.amenities; track amenity.id) {
                      <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-white/80">
                        <input
                          type="checkbox"
                          [checked]="selectedAmenities().has(amenity.id)"
                          (change)="toggleAmenity(amenity.id)"
                          class="rounded border-gray-300 dark:border-white/20"
                        />
                        {{ amenity.name }}
                      </label>
                    }
                  </div>
                </fieldset>
              }
            </section>
          }

          <!-- Fotos -->
          <section class="glass-card p-6 space-y-3">
            <h2 class="font-semibold text-slate-900 dark:text-white">
              {{ 'landlord.formPhotos' | transloco }}
            </h2>

            @if (photoWarning()) {
              <div
                role="alert"
                class="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10 text-sm text-amber-700 dark:text-amber-300 inline-flex items-center gap-2"
              >
                <app-icon name="alert-circle" class="h-4 w-4" />
                {{ photoWarning() }}
              </div>
            }

            @if (images().length > 0) {
              <div>
                <p
                  class="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-white/50 mb-2"
                >
                  {{ 'landlord.currentPhotos' | transloco }}
                </p>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  @for (image of images(); track image.id) {
                    <div class="relative group rounded-xl overflow-hidden">
                      <img
                        [src]="image.url"
                        [alt]="image.altText ?? ''"
                        class="w-full aspect-square object-cover"
                      />
                      @if (image.isPrimary) {
                        <span
                          class="absolute top-1 left-1 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-brand-500 text-white"
                          >{{ 'landlord.coverPhoto' | transloco }}</span
                        >
                      }
                      <div
                        class="absolute inset-x-0 bottom-0 flex gap-1 p-1 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                      >
                        @if (!image.isPrimary) {
                          <button
                            type="button"
                            (click)="makeCover(image)"
                            [disabled]="photoBusy()"
                            class="flex-1 text-[10px] rounded bg-white/90 hover:bg-white text-slate-900 py-1 font-medium"
                            [attr.aria-label]="t('landlord.makeCover')"
                          >
                            {{ 'landlord.makeCover' | transloco }}
                          </button>
                        }
                        <button
                          type="button"
                          (click)="deletePhoto(image)"
                          [disabled]="photoBusy()"
                          class="flex-1 text-[10px] rounded bg-red-600/90 hover:bg-red-600 text-white py-1 font-medium"
                          [attr.aria-label]="t('landlord.deletePhoto')"
                        >
                          {{ 'landlord.deletePhoto' | transloco }}
                        </button>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }

            <p class="text-xs text-slate-500 dark:text-white/50">
              {{ 'landlord.formPhotosHint' | transloco }}
            </p>
            <label for="new-images" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
              'landlord.formPhotosLabel' | transloco
            }}</label>
            <input
              id="new-images"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              (change)="onFilesSelected($event)"
              class="block w-full text-sm text-slate-700 dark:text-white/80 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-brand-500 file:text-white file:font-medium hover:file:bg-brand-600"
            />
          </section>

          <div class="flex gap-3 justify-end">
            <a
              [routerLink]="['/', culture.culture(), 'landlord', 'listings']"
              class="glass-button"
              >{{ 'common.cancel' | transloco }}</a
            >
            <button
              type="submit"
              [disabled]="saving()"
              class="glass-button-primary inline-flex items-center gap-2 disabled:opacity-60"
            >
              <app-icon name="check" class="h-4 w-4" />
              {{ 'landlord.formSave' | transloco }}
            </button>
          </div>
        </form>
      </section>
    }
  `,
})
export class LandlordListingFormPage {
  protected readonly culture = inject(CultureService);
  private readonly landlord = inject(LandlordService);
  private readonly api = inject(ApiService);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly provinces = PROVINCES;
  protected readonly selectableTypes = SELECTABLE_TYPES;
  protected readonly statuses = STATUSES;
  protected readonly leaseTerms = LEASE_TERMS;

  private readonly listingId = this.route.snapshot.paramMap.get('id');
  protected readonly isEdit = signal(this.listingId !== null);
  protected readonly notFound = signal(false);

  protected readonly saving = signal(false);
  protected readonly errors = signal<FieldErrors>({});
  protected readonly images = signal<ListingImage[]>([]);
  protected readonly photoBusy = signal(false);
  private readonly photoWarningKey = signal<string | null>(null);
  protected readonly photoWarning = computed(() => {
    const key = this.photoWarningKey();
    return key ? this.t(key) : null;
  });

  protected readonly selectedAmenities = signal<Set<string>>(new Set());
  private pendingFiles: File[] = [];

  protected readonly cities = toSignal(this.api.getCities().pipe(catchError(() => of([]))), {
    initialValue: [],
  });

  private readonly amenities = toSignal(
    this.landlord.amenities().pipe(catchError(() => of([] as Amenity[]))),
    { initialValue: [] as Amenity[] },
  );

  /** Grupos por categoria en el mismo orden que el origen (building/unit/nearby/other). */
  protected readonly amenityGroups = computed(() => {
    const groups = new Map<string, Amenity[]>();
    for (const amenity of this.amenities()) {
      const category = amenity.category ?? 'other';
      const list = groups.get(category) ?? [];
      list.push(amenity);
      groups.set(category, list);
    }
    return [...groups.entries()].map(([category, list]) => ({
      category,
      label: AMENITY_CATEGORY_KEYS[category]
        ? this.t(AMENITY_CATEGORY_KEYS[category])
        : category.charAt(0).toUpperCase() + category.slice(1),
      amenities: [...list].sort((a, b) => a.name.localeCompare(b.name)),
    }));
  });

  protected readonly form = this.fb.nonNullable.group({
    title: ['', Validators.required],
    description: [''],
    propertyType: ['Apartment' as PropertyType],
    status: ['Active' as ListingStatus],
    streetAddress: ['', Validators.required],
    cityName: ['', Validators.required],
    province: ['', Validators.required],
    postalCode: ['', Validators.required],
    neighbourhood: [''],
    petsAllowed: [false],
    furnished: [false],
    leaseTerm: ['OneYear' as LeaseTerm],
    parkingType: [''],
    yearBuilt: [null as number | null],
    totalFloors: [null as number | null],
    units: this.fb.array<UnitGroup>([]),
  });

  constructor() {
    if (this.listingId) {
      this.landlord.listing(this.listingId).subscribe({
        next: (detail) => {
          this.form.patchValue({
            title: detail.title,
            description: detail.description ?? '',
            propertyType: detail.propertyType,
            status: detail.status,
            streetAddress: detail.streetAddress,
            cityName: detail.cityName,
            province: detail.province,
            postalCode: detail.postalCode,
            neighbourhood: detail.neighbourhood ?? '',
            petsAllowed: detail.petsAllowed,
            furnished: detail.furnished,
            leaseTerm: detail.leaseTerm ?? 'OneYear',
            parkingType: detail.parkingType ?? '',
            yearBuilt: detail.yearBuilt,
            totalFloors: detail.totalFloors,
          });
          for (const unit of detail.units.length > 0 ? detail.units : [undefined]) {
            this.units.push(this.fb.group(buildUnitControls(this.fb, unit)));
          }
          this.selectedAmenities.set(new Set(detail.amenityIds));
          this.images.set(detail.images);
        },
        error: () => this.notFound.set(true),
      });
    } else {
      // Como el OnGet de Create: una unidad, disponible en +30 dias. La fecha se compone en
      // LOCAL: toISOString() es UTC y por la tarde-noche ya marca el dia siguiente (y en SSR
      // usaria el reloj del servidor, cambiando el valor al hidratar).
      const inThirtyDays = new Date();
      inThirtyDays.setDate(inThirtyDays.getDate() + 30);
      const localDate = [
        inThirtyDays.getFullYear(),
        String(inThirtyDays.getMonth() + 1).padStart(2, '0'),
        String(inThirtyDays.getDate()).padStart(2, '0'),
      ].join('-');
      this.units.push(this.fb.group(buildUnitControls(this.fb, {
        id: null,
        bedrooms: 1,
        bathrooms: 1,
        sqFt: null,
        price: 0,
        availableDate: localDate,
        availableUnits: 1,
      })));
    }
  }

  protected get units(): FormArray<UnitGroup> {
    return this.form.controls.units;
  }

  protected t(key: string): string {
    return this.transloco.translate(key);
  }

  protected unitLegend(index: number): string {
    return formatTemplate(this.t('landlord.formUnitN'), index + 1);
  }

  /** Errores de las unidades (claves `units[i].campo` o `units`): se pintan juntos bajo la lista. */
  protected unitErrors(): string[] {
    return Object.entries(this.errors())
      .filter(([field]) => field.startsWith('units'))
      .flatMap(([, messages]) => messages);
  }

  protected addUnit(): void {
    this.units.push(this.fb.group(buildUnitControls(this.fb)));
  }

  protected removeUnit(index: number): void {
    if (this.units.length > 1) this.units.removeAt(index);
  }

  protected toggleAmenity(id: string): void {
    const next = new Set(this.selectedAmenities());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedAmenities.set(next);
  }

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.pendingFiles = input.files ? [...input.files] : [];
  }

  protected makeCover(image: ListingImage): void {
    if (!this.listingId || this.photoBusy()) return;
    this.photoBusy.set(true);
    this.landlord.setCover(this.listingId, image.id).subscribe({
      next: (response) => {
        this.photoBusy.set(false);
        this.images.set(response.images);
      },
      error: () => this.photoBusy.set(false),
    });
  }

  protected deletePhoto(image: ListingImage): void {
    if (!this.listingId || this.photoBusy()) return;
    this.photoBusy.set(true);
    this.landlord.deletePhoto(this.listingId, image.id).subscribe({
      next: (response) => {
        this.photoBusy.set(false);
        this.images.set(response.images);
      },
      error: () => this.photoBusy.set(false),
    });
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errors.set({});
    this.photoWarningKey.set(null);

    const payload = this.buildPayload();

    if (this.listingId) {
      this.landlord.update(this.listingId, payload).subscribe({
        next: (response) => this.uploadThenLeave(this.listingId!, response.message),
        error: (error: unknown) => this.onSaveError(error),
      });
    } else {
      this.landlord.create(payload).subscribe({
        next: (response) => this.uploadThenLeave(response.id, response.message),
        error: (error: unknown) => this.onSaveError(error),
      });
    }
  }

  /**
   * Tras guardar el listing se sube el lote de fotos pendientes y solo entonces se vuelve a
   * la lista, llevando el flash (y el warning de fotos si lo hubo) en el estado de la
   * navegacion. Si la subida entera falla, el listing ya esta guardado: se avisa como
   * warning, no como error del formulario.
   */
  private uploadThenLeave(id: string, flash: string): void {
    if (this.pendingFiles.length === 0) {
      this.leave(flash, null);
      return;
    }

    this.landlord.uploadPhotos(id, this.pendingFiles).subscribe({
      next: (response) => this.leave(flash, response.warning),
      error: () => this.leave(flash, 'landlord.imageRejected'),
    });
  }

  private leave(flash: string, warning: string | null): void {
    this.saving.set(false);
    void this.router.navigate(['/', this.culture.culture(), 'landlord', 'listings'], {
      state: warning ? { flash, warning } : { flash },
    });
  }

  private onSaveError(error: unknown): void {
    this.saving.set(false);
    this.errors.set(toFieldErrors(error, 'Could not save the listing.'));
  }

  private buildPayload(): ListingFormPayload {
    const raw = this.form.getRawValue();
    return {
      title: raw.title,
      description: raw.description.trim() ? raw.description : null,
      propertyType: raw.propertyType,
      status: raw.status,
      streetAddress: raw.streetAddress,
      cityName: raw.cityName,
      province: raw.province,
      postalCode: raw.postalCode,
      neighbourhood: raw.neighbourhood.trim() ? raw.neighbourhood : null,
      petsAllowed: raw.petsAllowed,
      furnished: raw.furnished,
      leaseTerm: raw.leaseTerm,
      parkingType: raw.parkingType.trim() ? raw.parkingType : null,
      yearBuilt: raw.yearBuilt,
      totalFloors: raw.totalFloors,
      amenityIds: [...this.selectedAmenities()],
      units: raw.units.map((unit) => ({
        id: unit.id,
        bedrooms: Number(unit.bedrooms),
        bathrooms: Number(unit.bathrooms),
        sqFt: unit.sqFt !== null && `${unit.sqFt}` !== '' ? Number(unit.sqFt) : null,
        price: Number(unit.price),
        availableDate: unit.availableDate || null,
        availableUnits: Number(unit.availableUnits),
      })),
    };
  }
}
