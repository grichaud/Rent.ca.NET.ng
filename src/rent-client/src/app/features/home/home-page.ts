import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { CultureService } from '../../core/i18n/culture.service';
import { Icon } from '../../shared/ui/icon/icon';

/**
 * Home de la Fase 4: existe para probar de punta a punta que el shell funciona
 * (SSR + HttpClient + proxy + tema + i18n) con datos reales de la API.
 * El hero, el carousel de ciudades y las tarjetas definitivas llegan en la Fase 5.
 */
@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    <section class="mb-12">
      <h1 class="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
        Find your next home in Canada
      </h1>
      <p class="mt-3 text-lg text-gray-600 dark:text-white/70">
        Thousands of verified listings across all major cities.
      </p>
    </section>

    @if (data(); as home) {
      <section class="mb-14">
        <h2 class="text-2xl font-semibold mb-5 text-gray-900 dark:text-white">Popular cities</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          @for (city of home.featuredCities; track city.slug) {
            <a
              [routerLink]="['/', culture.culture(), city.slug]"
              class="glass-card p-4 flex flex-col gap-1 hover:scale-[1.02] transition-transform duration-300"
            >
              <span class="font-semibold text-gray-900 dark:text-white">{{ city.name }}</span>
              <span class="text-xs text-gray-500 dark:text-white/60">{{ city.province }}</span>
            </a>
          }
        </div>
      </section>

      <section>
        <h2 class="text-2xl font-semibold mb-5 text-gray-900 dark:text-white">Latest listings</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          @for (listing of home.latestListings; track listing.id) {
            <a
              [routerLink]="['/', culture.culture(), listing.citySlug, listing.slug]"
              class="glass-card overflow-hidden flex flex-col hover:scale-[1.01] transition-transform duration-300"
            >
              @if (listing.primaryImageUrl) {
                <img
                  [src]="listing.primaryImageUrl"
                  [alt]="listing.title"
                  class="h-44 w-full object-cover"
                  loading="lazy"
                />
              }
              <div class="p-4 flex flex-col gap-2">
                <span class="font-semibold text-gray-900 dark:text-white">{{ listing.title }}</span>
                <span class="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-white/70">
                  <app-icon name="map-pin" class="h-3.5 w-3.5" />
                  {{ listing.neighbourhood ?? listing.city }}, {{ listing.province }}
                </span>
                <div class="flex items-center gap-3 text-sm text-gray-600 dark:text-white/70">
                  <span class="inline-flex items-center gap-1">
                    <app-icon name="bed" class="h-3.5 w-3.5" />{{ listing.minBedrooms }}
                  </span>
                  <span class="inline-flex items-center gap-1">
                    <app-icon name="bath" class="h-3.5 w-3.5" />{{ listing.minBathrooms }}
                  </span>
                  @if (listing.fromPrice !== null) {
                    <span class="ml-auto font-semibold text-brand-600 dark:text-brand-400">
                      &dollar;{{ listing.fromPrice }}
                    </span>
                  }
                </div>
                @if (listing.specialTitle) {
                  <span class="glass-badge self-start !text-xs">{{ listing.specialTitle }}</span>
                }
              </div>
            </a>
          }
        </div>
      </section>
    } @else {
      <p class="text-gray-500 dark:text-white/60">Loading…</p>
    }
  `,
})
export class HomePage {
  private readonly api = inject(ApiService);
  protected readonly culture = inject(CultureService);

  protected readonly data = toSignal(
    this.api.getHome().pipe(catchError(() => of(null))),
    { initialValue: null },
  );
}
