import {
  ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PropertyType } from '../../core/api/api.types';
import { CultureService } from '../../core/i18n/culture.service';
import { Icon } from '../../shared/ui/icon/icon';

export interface FilterState {
  types: PropertyType[];
  minPrice: number;
  maxPrice: number;
  bedrooms: number;
  bathrooms: number;
  petsAllowed: boolean;
  furnished: boolean;
  hasParking: boolean;
}

/** 5000 significa "sin maximo": el origen usa el mismo centinela en el slider. */
export const PRICE_CAP = 5000;

const TYPE_OPTIONS: { value: PropertyType; key: string }[] = [
  { value: 'Apartment', key: 'filters.apartment' },
  { value: 'Condo', key: 'filters.condo' },
  { value: 'House', key: 'filters.house' },
  { value: 'Townhouse', key: 'filters.townhouse' },
  { value: 'Basement', key: 'filters.basement' },
  { value: 'Studio', key: 'filters.studio' },
  { value: 'Loft', key: 'filters.loft' },
  { value: 'Duplex', key: 'filters.duplex' },
];

const PILL_CLASS =
  'px-3 py-1.5 text-sm rounded-xl border transition-all duration-200 inline-block ' +
  'bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/60 ' +
  'hover:bg-gray-200 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white/80';
const PILL_ACTIVE =
  'px-3 py-1.5 text-sm rounded-xl border transition-all duration-200 inline-block ' +
  'bg-brand-500/20 dark:bg-brand-500/30 border-brand-500/40 dark:border-brand-400/40 ' +
  'text-brand-700 dark:text-brand-300 shadow-sm shadow-brand-500/10';

@Component({
  selector: 'app-search-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, Icon],
  template: `
    <div class="glass-sidebar p-5 flex flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <app-icon name="sliders-horizontal" class="h-4 w-4 text-gray-500 dark:text-white/60" />
          <h2 class="text-sm font-semibold text-gray-900 dark:text-white">{{ 'filters.title' | transloco }}</h2>
          @if (activeCount() > 0) {
            <span
              class="h-5 min-w-5 px-1.5 rounded-full bg-brand-500 dark:bg-brand-500/40 border border-brand-600 dark:border-brand-400/30 text-white dark:text-brand-300 text-xs font-semibold flex items-center justify-center"
              >{{ activeCount() }}</span
            >
          }
        </div>
        @if (activeCount() > 0) {
          <button
            type="button"
            (click)="clear()"
            class="text-xs text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/80 transition-colors"
          >
            {{ 'filters.clear' | transloco }}
          </button>
        }
      </div>

      <div class="flex-1 flex flex-col gap-4">
        <section>
          <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/50 mb-3">
            {{ 'filters.propertyType' | transloco }}
          </p>
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Property type">
            @for (opt of typeOptions; track opt.value) {
              <button
                type="button"
                (click)="toggleType(opt.value)"
                [attr.aria-pressed]="state().types.includes(opt.value)"
                [attr.class]="state().types.includes(opt.value) ? pillActive : pillClass"
              >
                {{ opt.key | transloco }}
              </button>
            }
          </div>
        </section>

        <hr class="border-gray-200 dark:border-white/10" />

        <section>
          <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/50 mb-3">
            {{ 'filters.priceRange' | transloco }}
          </p>
          <div class="space-y-3">
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-900 dark:text-white font-medium">{{ minLabel() }}</span>
              <span class="text-gray-900 dark:text-white font-medium">{{ maxLabel() }}</span>
            </div>
            <div class="relative h-1.5">
              <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-gray-200 dark:bg-white/10"></div>
              <div class="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-brand-500" [style.left.%]="trackLeft()" [style.right.%]="trackRight()"></div>
              <input
                type="range" min="0" [max]="cap" step="50"
                [value]="state().minPrice"
                (input)="setMin($event)"
                class="rentca-range absolute inset-0 w-full pointer-events-none appearance-none bg-transparent"
                aria-label="Minimum price"
              />
              <input
                type="range" min="0" [max]="cap" step="50"
                [value]="state().maxPrice"
                (input)="setMax($event)"
                class="rentca-range absolute inset-0 w-full pointer-events-none appearance-none bg-transparent"
                aria-label="Maximum price"
              />
            </div>
            <p class="text-xs text-gray-400 dark:text-white/40 text-center">
              {{ minLabel() }} – {{ maxLabel() }}{{ 'listings.perMonth' | transloco }}
            </p>
          </div>
        </section>

        <hr class="border-gray-200 dark:border-white/10" />

        <section>
          <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/50 mb-3">
            {{ 'filters.bedrooms' | transloco }}
          </p>
          <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Bedrooms">
            @for (opt of bedroomOptions; track opt.value) {
              <button
                type="button"
                (click)="patch({ bedrooms: opt.value })"
                [attr.aria-checked]="state().bedrooms === opt.value"
                [attr.class]="(state().bedrooms === opt.value ? pillActive : pillClass) + ' min-w-[44px] text-center'"
              >
                {{ opt.value === 0 ? ('filters.any' | transloco) : opt.label }}
              </button>
            }
          </div>
        </section>

        <hr class="border-gray-200 dark:border-white/10" />

        <section>
          <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/50 mb-3">
            {{ 'filters.bathrooms' | transloco }}
          </p>
          <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Bathrooms">
            @for (opt of bathroomOptions; track opt.value) {
              <button
                type="button"
                (click)="patch({ bathrooms: opt.value })"
                [attr.aria-checked]="state().bathrooms === opt.value"
                [attr.class]="(state().bathrooms === opt.value ? pillActive : pillClass) + ' min-w-[44px] text-center'"
              >
                {{ opt.value === 0 ? ('filters.any' | transloco) : opt.label }}
              </button>
            }
          </div>
        </section>

        <hr class="border-gray-200 dark:border-white/10" />

        <section>
          <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/50 mb-3">
            {{ 'filters.moreFilters' | transloco }}
          </p>
          <div class="space-y-2">
            @for (row of toggleRows; track row.field) {
              <button
                type="button"
                (click)="toggleFlag(row.field)"
                [attr.class]="
                  'flex items-center justify-between w-full px-3 py-2.5 rounded-xl border cursor-pointer transition-all ' +
                  (flag(row.field)
                    ? 'bg-brand-500/15 border-brand-500/30 text-brand-700 dark:text-brand-300'
                    : 'bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/60')
                "
              >
                <span class="flex items-center gap-2 text-sm font-medium">
                  <app-icon [name]="row.icon" class="h-4 w-4" />
                  {{ row.key | transloco }}
                </span>
                <span
                  [attr.class]="
                    'relative h-5 w-9 shrink-0 rounded-full border transition-colors ' +
                    (flag(row.field) ? 'bg-brand-500 border-brand-500' : 'bg-gray-200 dark:bg-white/10 border-gray-300 dark:border-white/20')
                  "
                >
                  <span
                    [attr.class]="
                      'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ' +
                      (flag(row.field) ? 'translate-x-4' : '')
                    "
                  ></span>
                </span>
              </button>
            }
          </div>
        </section>
      </div>

      <div class="pt-4 border-t border-gray-200 dark:border-white/10 flex gap-2">
        <button
          type="button"
          (click)="clear()"
          class="glass-button flex-1 py-2.5 text-sm font-medium text-center text-gray-700 dark:text-white/70"
        >
          {{ 'filters.clear' | transloco }}
        </button>
        <button type="button" (click)="apply()" class="glass-button-primary flex-1 py-2.5 text-sm font-semibold text-white">
          {{ 'filters.apply' | transloco }}
        </button>
      </div>
    </div>
  `,
})
export class SearchFilters {
  private readonly router = inject(Router);
  private readonly culture = inject(CultureService);

  readonly citySlug = input.required<string>();
  readonly initial = input.required<FilterState>();

  /** Se emite al aplicar o limpiar; el cajon de movil lo usa para cerrarse. */
  readonly applied = output<void>();

  protected readonly cap = PRICE_CAP;
  protected readonly pillClass = PILL_CLASS;
  protected readonly pillActive = PILL_ACTIVE;
  protected readonly typeOptions = TYPE_OPTIONS;
  protected readonly bedroomOptions = [
    { value: 0, label: '' }, { value: 1, label: '1' }, { value: 2, label: '2' },
    { value: 3, label: '3' }, { value: 4, label: '4+' },
  ];
  protected readonly bathroomOptions = [
    { value: 0, label: '' }, { value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3+' },
  ];
  protected readonly toggleRows = [
    { field: 'petsAllowed' as const, icon: 'dog', key: 'filters.petsAllowed' },
    { field: 'furnished' as const, icon: 'sofa', key: 'filters.furnished' },
    { field: 'hasParking' as const, icon: 'car', key: 'filters.parking' },
  ];

  protected readonly state = signal<FilterState>(emptyFilters());

  constructor() {
    // El estado del panel se resincroniza cuando cambia la URL (por ejemplo al pulsar
    // atras), no solo en la primera carga.
    effect(() => this.state.set({ ...this.initial() }));
  }

  protected flag(field: 'petsAllowed' | 'furnished' | 'hasParking'): boolean {
    return this.state()[field];
  }

  protected patch(part: Partial<FilterState>): void {
    this.state.update((s) => ({ ...s, ...part }));
  }

  protected toggleType(type: PropertyType): void {
    this.state.update((s) => ({
      ...s,
      types: s.types.includes(type) ? s.types.filter((t) => t !== type) : [...s.types, type],
    }));
  }

  protected toggleFlag(field: 'petsAllowed' | 'furnished' | 'hasParking'): void {
    this.state.update((s) => ({ ...s, [field]: !s[field] }));
  }

  protected setMin(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.state.update((s) => ({ ...s, minPrice: Math.min(value, s.maxPrice) }));
  }

  protected setMax(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.state.update((s) => ({ ...s, maxPrice: Math.max(value, s.minPrice) }));
  }

  protected readonly activeCount = computed(() => {
    const s = this.state();
    let n = 0;
    if (s.types.length) n++;
    if (s.minPrice > 0) n++;
    if (s.maxPrice < PRICE_CAP) n++;
    if (s.bedrooms > 0) n++;
    if (s.bathrooms > 0) n++;
    if (s.petsAllowed) n++;
    if (s.furnished) n++;
    if (s.hasParking) n++;
    return n;
  });

  protected readonly minLabel = computed(() => '$' + this.state().minPrice.toLocaleString('en-CA'));
  protected readonly maxLabel = computed(() => {
    const max = this.state().maxPrice;
    return max >= PRICE_CAP ? '$5,000+' : '$' + max.toLocaleString('en-CA');
  });

  protected readonly trackLeft = computed(() => (this.state().minPrice / PRICE_CAP) * 100);
  protected readonly trackRight = computed(() => 100 - (this.state().maxPrice / PRICE_CAP) * 100);

  protected apply(): void {
    // Quien lo monta en el cajon de movil necesita saberlo para cerrarlo. No basta con vigilar
    // la query: aplicar SIN cambiar nada no la mueve, y el cajon se quedaria abierto.
    this.applied.emit();

    const s = this.state();
    this.router.navigate(['/', this.culture.culture(), this.citySlug()], {
      queryParams: {
        types: s.types.length ? s.types.join(',') : null,
        minPrice: s.minPrice > 0 ? s.minPrice : null,
        maxPrice: s.maxPrice < PRICE_CAP ? s.maxPrice : null,
        bedrooms: s.bedrooms > 0 ? s.bedrooms : null,
        bathrooms: s.bathrooms > 0 ? s.bathrooms : null,
        petsAllowed: s.petsAllowed ? true : null,
        furnished: s.furnished ? true : null,
        hasParking: s.hasParking ? true : null,
        page: null,
      },
      queryParamsHandling: 'merge',
    });
  }

  protected clear(): void {
    this.state.set(emptyFilters());
    this.apply();
  }
}

export function emptyFilters(): FilterState {
  return {
    types: [], minPrice: 0, maxPrice: PRICE_CAP, bedrooms: 0, bathrooms: 0,
    petsAllowed: false, furnished: false, hasParking: false,
  };
}
