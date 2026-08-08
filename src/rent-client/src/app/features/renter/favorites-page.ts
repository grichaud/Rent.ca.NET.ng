import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { FavoritesService } from '../../core/api/favorites.service';
import { PropertyCard, PropertyType } from '../../core/api/api.types';
import { CultureService } from '../../core/i18n/culture.service';
import { formatPrice, formatTemplate } from '../../shared/format';
import { Icon } from '../../shared/ui/icon/icon';

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

/**
 * Port de Favorites/Pages/Index.cshtml. La tarjeta es la propia de esta pantalla, no
 * PropertyCardComponent: aqui el corazon se sustituye por el boton de quitar, igual que en
 * el origen.
 */
@Component({
  selector: 'app-renter-favorites-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, Icon],
  template: `
    <div class="space-y-6">
      <header>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ 'renter.favoritesTitle' | transloco }}
        </h1>
        <p class="mt-1 text-sm text-slate-600 dark:text-white/70">
          {{ 'renter.favoritesSubtitle' | transloco }}
        </p>
      </header>

      @if (flashSuccess()) {
        <div
          role="status"
          class="p-3 rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10 text-sm text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-2"
        >
          <app-icon name="check-circle" class="h-4 w-4" />
          {{ flashSuccess() }}
        </div>
      }

      @if (favorites(); as cards) {
        @if (cards.length === 0) {
          <div class="glass-card p-10 text-center">
            <div class="inline-flex h-16 w-16 rounded-2xl bg-pink-500/15 items-center justify-center mb-4">
              <app-icon name="heart" class="h-7 w-7 text-pink-500 dark:text-pink-300" />
            </div>
            <h2 class="font-sans font-bold tracking-tight text-2xl text-slate-900 dark:text-white">
              {{ 'renter.favoritesEmpty' | transloco }}
            </h2>
            <p class="text-slate-500 dark:text-white/60 mt-2 max-w-sm mx-auto">
              {{ 'renter.favoritesEmptyDesc' | transloco }}
            </p>
            <a
              [routerLink]="['/', culture.culture()]"
              class="glass-button-primary inline-flex items-center gap-2 mt-6"
            >
              <app-icon name="search" class="h-4 w-4" />
              {{ 'renter.browseListings' | transloco }}
            </a>
          </div>
        } @else {
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            @for (fav of cards; track fav.id) {
              <div
                class="group glass-card overflow-hidden flex flex-col p-0 hover:shadow-2xl hover:shadow-pink-500/10 transition-all duration-300"
              >
                <div
                  class="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-brand-200 via-purple-200 to-cyan-200 dark:from-brand-900/40 dark:via-purple-900/40 dark:to-cyan-900/40"
                >
                  @if (fav.primaryImageUrl) {
                    <img
                      [src]="fav.primaryImageUrl"
                      [alt]="fav.title"
                      loading="lazy"
                      class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  } @else {
                    <div class="absolute inset-0 flex items-center justify-center text-white/80">
                      <app-icon name="building" class="h-16 w-16" />
                    </div>
                  }
                  <div
                    class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 pointer-events-none"
                  ></div>

                  @if (fav.citySlug) {
                    <a
                      [routerLink]="['/', culture.culture(), fav.citySlug, fav.slug]"
                      class="absolute inset-0"
                      [attr.aria-label]="fav.title"
                    ></a>
                  }

                  <div class="absolute top-3 left-3 flex flex-wrap gap-1.5 pointer-events-none">
                    @if (fav.tier === 'Featured') {
                      <span
                        class="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md shadow-lg shadow-amber-500/40"
                      >
                        <app-icon name="sparkles" class="h-3 w-3" />
                        {{ 'detail.featured' | transloco }}
                      </span>
                    } @else if (fav.tier === 'Promoted') {
                      <span
                        class="inline-flex items-center gap-1 bg-gradient-to-r from-brand-500 to-cyan-500 text-white text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md"
                      >
                        <app-icon name="arrow-right" class="h-3 w-3" />
                        {{ 'detail.promoted' | transloco }}
                      </span>
                    }
                  </div>

                  @if (fav.isVerified) {
                    <div class="absolute top-3 right-3 pointer-events-none">
                      <span
                        class="inline-flex items-center gap-1 bg-emerald-500/90 backdrop-blur-md text-white text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md"
                      >
                        <app-icon name="check" class="h-3 w-3" />
                        {{ 'detail.verified' | transloco }}
                      </span>
                    </div>
                  }

                  <div class="absolute bottom-3 left-3 text-white pointer-events-none">
                    @if (fav.fromPrice !== null) {
                      <div class="text-[10px] uppercase tracking-wider opacity-80">
                        {{ 'detail.fromLabel' | transloco }}
                      </div>
                      <div class="font-sans font-bold tracking-tight text-2xl leading-none">
                        {{ price(fav.fromPrice)
                        }}<span class="text-xs opacity-80">{{ 'listings.perMonth' | transloco }}</span>
                      </div>
                    } @else {
                      <div class="font-sans font-bold tracking-tight text-lg leading-none">
                        {{ 'detail.contactLandlord' | transloco }}
                      </div>
                    }
                  </div>
                </div>

                <div class="p-4 flex-1 flex flex-col">
                  @if (fav.citySlug) {
                    <a
                      [routerLink]="['/', culture.culture(), fav.citySlug, fav.slug]"
                      class="font-semibold text-slate-900 dark:text-white line-clamp-1 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                      >{{ fav.title }}</a
                    >
                  } @else {
                    <span class="font-semibold text-slate-900 dark:text-white line-clamp-1">{{
                      fav.title
                    }}</span>
                  }
                  <div
                    class="mt-1 text-xs text-slate-500 dark:text-white/60 inline-flex items-center gap-1"
                  >
                    <app-icon name="map-pin" class="h-3 w-3 shrink-0" />
                    <span class="truncate">{{ location(fav) }}</span>
                  </div>
                  <div
                    class="mt-3 pt-3 border-t border-gray-200 dark:border-white/10 flex items-center gap-4 text-xs text-slate-600 dark:text-white/70"
                  >
                    <span class="inline-flex items-center gap-1">
                      <app-icon name="bed" class="h-3.5 w-3.5" /> {{ bedsLabel(fav.minBedrooms) }}
                    </span>
                    <span class="inline-flex items-center gap-1">
                      <app-icon name="bath" class="h-3.5 w-3.5" /> {{ bathsLabel(fav.minBathrooms) }}
                    </span>
                    <span
                      class="ml-auto inline-flex items-center gap-1 text-slate-500 dark:text-white/50"
                    >
                      <app-icon name="home" class="h-3.5 w-3.5" /> {{ typeLabel(fav.propertyType) }}
                    </span>
                  </div>

                  <button
                    type="button"
                    (click)="remove(fav)"
                    [disabled]="removing() === fav.id"
                    [attr.aria-label]="t('detail.removeFromFavorites') + ': ' + fav.title"
                    class="glass-button w-full inline-flex items-center justify-center gap-2 text-sm text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 mt-3 disabled:opacity-60"
                  >
                    <app-icon name="trash-2" class="h-4 w-4" />
                    {{ 'renter.removeFavorite' | transloco }}
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
export class RenterFavoritesPage {
  protected readonly culture = inject(CultureService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly transloco = inject(TranslocoService);

  protected readonly favorites = signal<PropertyCard[] | null>(null);
  protected readonly removing = signal<string | null>(null);
  protected readonly flashSuccess = signal<string | null>(null);

  constructor() {
    this.favoritesService.list().subscribe({
      next: (cards) => this.favorites.set(cards),
      error: () => this.favorites.set([]),
    });
  }

  protected t(key: string): string {
    return this.transloco.translate(key);
  }

  protected price(value: number): string {
    return formatPrice(value);
  }

  protected location(card: PropertyCard): string {
    return [card.neighbourhood, card.city, card.province].filter(Boolean).join(', ');
  }

  protected bedsLabel(minBedrooms: number): string {
    if (minBedrooms === 0) return this.t('listings.beds.studio');
    if (minBedrooms === 1) return this.t('listings.beds.one');
    return formatTemplate(this.t('listings.beds.many'), minBedrooms);
  }

  protected bathsLabel(minBathrooms: number): string {
    if (minBathrooms <= 1) return this.t('listings.baths.one');
    return formatTemplate(
      this.t('listings.baths.many'),
      Number.isInteger(minBathrooms) ? minBathrooms : minBathrooms.toFixed(1),
    );
  }

  protected typeLabel(type: PropertyType): string {
    const key = TYPE_KEYS[type];
    return key ? this.t(key) : this.t('filters.other');
  }

  protected remove(card: PropertyCard): void {
    if (this.removing()) return;
    this.removing.set(card.id);

    this.favoritesService.remove(card.id).subscribe({
      next: () => {
        this.removing.set(null);
        this.favorites.set((this.favorites() ?? []).filter((f) => f.id !== card.id));
        this.flashSuccess.set(this.t('renter.favoriteRemoved'));
      },
      error: () => this.removing.set(null),
    });
  }
}
