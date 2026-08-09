import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { PropertyCard as PropertyCardModel, PropertyType } from '../../core/api/api.types';
import { CultureService } from '../../core/i18n/culture.service';
import { formatPrice, formatTemplate } from '../format';
import { FavoriteButton } from './favorite-button';
import { Icon } from './icon/icon';

/** Port de Features/Search/Partials/_PropertyCard.cshtml, con sus dos variantes. */
@Component({
  selector: 'app-property-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, NgTemplateOutlet, FavoriteButton],
  template: `
    @if (variant() === 'list') {
      <article
        class="glass-card flex flex-col sm:flex-row overflow-hidden hover:scale-[1.01] transition-all duration-300 hover:shadow-2xl hover:shadow-brand-500/10 p-0"
      >
        <a [routerLink]="detailLink()" class="relative w-full sm:w-72 h-48 sm:h-auto shrink-0 overflow-hidden">
          @if (item().primaryImageUrl) {
            <img
              [src]="item().primaryImageUrl"
              [alt]="item().title"
              loading="lazy"
              class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 hover:scale-105"
            />
          } @else {
            <div
              class="absolute inset-0 bg-gradient-to-br from-brand-500/20 via-purple-500/15 to-cyan-500/20 flex items-center justify-center"
            >
              <div
                class="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center"
              >
                <app-icon name="map-pin" class="h-7 w-7 text-white/40" />
              </div>
            </div>
          }
          <div class="absolute inset-0 bg-gradient-to-r from-transparent to-black/20" aria-hidden="true"></div>
        </a>

        <div class="flex flex-col flex-1 p-5 gap-3">
          <div class="flex items-start justify-between gap-3">
            <div class="flex flex-wrap gap-1.5">
              <ng-container *ngTemplateOutlet="tierBadge" />
              @if (item().isVerified) {
                <span
                  class="inline-flex items-center gap-1 bg-emerald-500/90 text-white text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md"
                >
                  <app-icon name="check" class="h-3 w-3" />
                  {{ t('detail.verified') }}
                </span>
              }
            </div>
            <app-favorite-button
              class="shrink-0"
              [propertyId]="item().id"
              [initialFavorited]="item().isFavorited"
            />
          </div>

          <div>
            <p class="text-xl font-bold text-gray-900 dark:text-white">{{ priceLabel() }}</p>
            <a [routerLink]="detailLink()">
              <h3
                class="mt-1 text-base font-medium text-gray-700 dark:text-white/90 hover:text-gray-900 dark:hover:text-white transition-colors line-clamp-1"
              >
                {{ item().title }}
              </h3>
            </a>
          </div>

          <p class="flex items-center gap-1.5 text-sm text-gray-500 dark:text-white/60">
            <app-icon name="map-pin" class="h-3.5 w-3.5 text-gray-400 dark:text-white/40 shrink-0" />
            {{ locationLabel() }}
          </p>

          <div class="flex items-center gap-3 text-sm text-gray-600 dark:text-white/70">
            <span class="inline-flex items-center gap-1"
              ><app-icon name="bed" class="h-3.5 w-3.5" />{{ bedsLabel() }}</span
            >
            <span class="text-gray-300 dark:text-white/20">·</span>
            <span class="inline-flex items-center gap-1"
              ><app-icon name="bath" class="h-3.5 w-3.5" />{{ bathsLabel() }}</span
            >
            <span class="text-gray-300 dark:text-white/20">·</span>
            <span class="inline-flex items-center gap-1"
              ><app-icon name="home" class="h-3.5 w-3.5" />{{ typeLabel() }}</span
            >
          </div>

          @if (item().petsAllowed || item().furnished) {
            <div class="flex flex-wrap gap-1.5 mt-auto">
              <ng-container *ngTemplateOutlet="perks" />
            </div>
          }
        </div>
      </article>
    } @else {
      <article
        class="glass-card flex flex-col overflow-hidden p-0 hover:scale-[1.02] transition-all duration-300 hover:shadow-2xl hover:shadow-brand-500/10"
      >
        <!--
          El envoltorio existe para que el corazon NO cuelgue del enlace de la tarjeta.
          Estando dentro era un <a> dentro de otro <a> —HTML invalido— y, para un visitante
          anonimo, pulsarlo abria la ficha en vez de llevarlo al login: el enlace de fuera se
          comia el clic. Con sesion no se notaba, porque ahi el corazon es un <button> que
          detiene la propagacion a mano.
        -->
        <div class="relative">
        <a [routerLink]="detailLink()" class="relative aspect-[4/3] overflow-hidden block group">
          @if (item().primaryImageUrl) {
            <img
              [src]="item().primaryImageUrl"
              [alt]="item().title"
              loading="lazy"
              class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          } @else {
            <div
              class="absolute inset-0 bg-gradient-to-br from-brand-500/20 via-purple-500/15 to-cyan-500/20 flex items-center justify-center"
            >
              <app-icon name="map-pin" class="h-7 w-7 text-white/40" />
            </div>
          }
          <div
            class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"
            aria-hidden="true"
          ></div>

          <div class="absolute top-3 left-3 flex flex-col gap-1.5 items-start">
            <div class="flex flex-wrap gap-1.5">
              <ng-container *ngTemplateOutlet="tierBadge" />
            </div>
            @if (item().specialTitle) {
              <span
                class="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-rose-500 text-white text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md shadow-md shadow-orange-500/40 max-w-[200px]"
              >
                <app-icon name="sparkles" class="h-3 w-3 shrink-0" />
                <span class="truncate">{{ specialChip() }}</span>
              </span>
            }
          </div>

        </a>

          <div class="absolute top-3 right-3 flex flex-col gap-1.5 items-end">
            <app-favorite-button [propertyId]="item().id" [initialFavorited]="item().isFavorited" />
            @if (item().isVerified) {
              <span
                class="inline-flex items-center gap-1 bg-emerald-500/90 backdrop-blur-md text-white text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md"
              >
                <app-icon name="check" class="h-3 w-3" />
                {{ t('detail.verified') }}
              </span>
            }
          </div>
        </div>

        <div class="flex flex-col gap-2.5 p-4">
          <div>
            <p class="text-lg font-bold text-gray-900 dark:text-white leading-tight">{{ priceLabel() }}</p>
            <a [routerLink]="detailLink()">
              <h3
                class="mt-0.5 text-sm font-medium text-gray-700 dark:text-white/80 hover:text-gray-900 dark:hover:text-white transition-colors line-clamp-1"
              >
                {{ item().title }}
              </h3>
            </a>
          </div>

          <p class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/60">
            <app-icon name="map-pin" class="h-3 w-3 text-gray-400 dark:text-white/40 shrink-0" />
            <span class="truncate">{{ locationLabel() }}</span>
          </p>

          <div class="flex items-center gap-2 text-xs text-gray-600 dark:text-white/70">
            <span class="inline-flex items-center gap-1"><app-icon name="bed" class="h-3 w-3" />{{ bedsLabel() }}</span>
            <span class="text-gray-300 dark:text-white/20">·</span>
            <span class="inline-flex items-center gap-1"><app-icon name="bath" class="h-3 w-3" />{{ bathsLabel() }}</span>
            <span class="text-gray-300 dark:text-white/20">·</span>
            <span class="inline-flex items-center gap-1"><app-icon name="home" class="h-3 w-3" />{{ typeLabel() }}</span>
          </div>

          @if (item().petsAllowed || item().furnished) {
            <div class="flex flex-wrap gap-1.5 pt-1 border-t border-gray-200 dark:border-white/10">
              <ng-container *ngTemplateOutlet="perks" />
            </div>
          }
        </div>
      </article>
    }

    <ng-template #tierBadge>
      @if (item().tier === 'Featured') {
        <span
          class="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md shadow-lg shadow-amber-500/40"
        >
          <app-icon name="sparkles" class="h-3 w-3" />
          {{ t('detail.featured') }}
        </span>
      } @else if (item().tier === 'Promoted') {
        <span
          class="inline-flex items-center gap-1 bg-gradient-to-r from-brand-500 to-cyan-500 text-white text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md"
        >
          <app-icon name="arrow-right" class="h-3 w-3" />
          {{ t('detail.promoted') }}
        </span>
      }
    </ng-template>

    <ng-template #perks>
      @if (item().petsAllowed) {
        <span class="glass-badge text-xs text-gray-500 dark:text-white/60 inline-flex items-center gap-1 py-0.5"
          ><app-icon name="dog" class="h-3 w-3" />{{ t('filters.petsAllowed') }}</span
        >
      }
      @if (item().furnished) {
        <span class="glass-badge text-xs text-gray-500 dark:text-white/60 inline-flex items-center gap-1 py-0.5"
          ><app-icon name="sofa" class="h-3 w-3" />{{ t('filters.furnished') }}</span
        >
      }
    </ng-template>
  `,
})
export class PropertyCardComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly cultureService = inject(CultureService);

  readonly item = input.required<PropertyCardModel>();
  readonly variant = input<'grid' | 'list'>('grid');

  protected t(key: string): string {
    return this.transloco.translate(key);
  }

  protected readonly detailLink = computed(() => [
    '/',
    this.cultureService.culture(),
    this.item().citySlug,
    this.item().slug,
  ]);

  protected readonly priceLabel = computed(() => {
    const { fromPrice, toPrice } = this.item();
    if (fromPrice === null) return this.t('detail.contactLandlord');

    const perMonth = this.t('listings.perMonth');
    if (toPrice !== null && toPrice > fromPrice) {
      return `${formatPrice(fromPrice)} – ${formatPrice(toPrice)}${perMonth}`;
    }
    return `${formatPrice(fromPrice)}${perMonth}`;
  });

  protected readonly bedsLabel = computed(() => {
    const { minBedrooms, maxBedrooms } = this.item();
    if (minBedrooms === 0 && !maxBedrooms) return this.t('listings.beds.studio');
    if (maxBedrooms && maxBedrooms > minBedrooms) {
      return formatTemplate(this.t('listings.beds.many'), `${minBedrooms}–${maxBedrooms}`);
    }
    return minBedrooms === 1
      ? this.t('listings.beds.one')
      : formatTemplate(this.t('listings.beds.many'), minBedrooms);
  });

  protected readonly bathsLabel = computed(() => {
    const n = this.item().minBathrooms;
    if (n <= 1) return this.t('listings.baths.one');
    return formatTemplate(this.t('listings.baths.many'), Number.isInteger(n) ? n : n.toFixed(1));
  });

  protected readonly locationLabel = computed(() => {
    const { neighbourhood, city, province } = this.item();
    return [neighbourhood, city, province].filter(Boolean).join(', ');
  });

  protected readonly typeLabel = computed(() => {
    const key = TYPE_KEYS[this.item().propertyType];
    return key ? this.t(key) : this.item().propertyType;
  });

  /** El chip de promocion se trunca a 40 caracteres, igual que _RentSpecialChip.cshtml. */
  protected readonly specialChip = computed(() => {
    const title = this.item().specialTitle ?? '';
    return title.length > 40 ? title.slice(0, 40) + '…' : title;
  });
}

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
