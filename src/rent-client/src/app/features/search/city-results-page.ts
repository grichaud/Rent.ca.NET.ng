import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, RESPONSE_INIT, computed, effect, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, combineLatest, map, of, switchMap } from 'rxjs';
import { ApiService, SearchFilters as ApiFilters } from '../../core/api/api.service';
import { PropertyType, SearchResponse, SearchSort } from '../../core/api/api.types';
import { CultureService } from '../../core/i18n/culture.service';
import { breadcrumbJsonLd, cityJsonLd } from '../../core/seo/json-ld';
import { SeoService } from '../../core/seo/seo.service';
import { SITE_BASE_URL } from '../../core/seo/site-url';
import { formatTemplate } from '../../shared/format';
import { Icon } from '../../shared/ui/icon/icon';
import { PropertyCardComponent } from '../../shared/ui/property-card';
import { SearchMap } from './search-map';
import { FilterState, PRICE_CAP, SearchFilters, emptyFilters } from './search-filters';

type ViewMode = 'grid' | 'list' | 'map';

const CITY_NOT_FOUND: SearchResponse = {
  city: null, properties: [], totalCount: 0, page: 1, pageSize: 24, totalPages: 0,
};

@Component({
  selector: 'app-city-results-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, Icon, PropertyCardComponent, SearchFilters, SearchMap],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      @if (result(); as res) {
        @if (!res.city) {
          <section class="max-w-xl mx-auto glass-card p-10 text-center">
            <h1 class="font-sans font-bold tracking-tight text-3xl text-slate-900 dark:text-white">City not found</h1>
            <p class="text-slate-500 dark:text-white/60 mt-2">We couldn’t find a city with that name.</p>
            <a [routerLink]="['/', culture.culture()]" class="glass-button-primary inline-block mt-6">{{
              'common.back' | transloco
            }}</a>
          </section>
        } @else {
          <header class="mb-6">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {{ 'listings.rentalsIn' | transloco }}
              <span
                class="bg-gradient-to-r from-brand-500 to-cyan-500 dark:from-brand-400 dark:to-cyan-400 bg-clip-text text-transparent"
                >{{ res.city.name }}</span
              >
            </h1>
            <p class="text-sm text-gray-500 dark:text-white/50 mb-4">{{ findInLabel(res.city.name) }}</p>
          </header>

          <div class="lg:grid lg:grid-cols-[288px_1fr] lg:gap-6 items-start">
            <aside class="hidden lg:block">
              <app-search-filters [citySlug]="citySlug()" [initial]="filters()" />
            </aside>

            <div class="flex flex-col gap-4 min-w-0">
              <!-- Controles de resultados -->
              <div
                class="glass-base flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3"
                aria-label="Search results controls"
              >
                <!--
                  El texto se parte por el marcador {0} en vez de imprimir la cadena cruda al
                  lado del numero. Pintarlos por separado dejaba un "8 {0} rentals in Toronto"
                  literal en pantalla, y ademas solo funcionaba en ingles: en frances el
                  marcador va en el mismo sitio pero la frase es otra.
                -->
                <p class="text-sm text-gray-600 dark:text-white/70">
                  {{ resultsLabel().before
                  }}<span class="font-semibold text-base text-gray-900 dark:text-white">{{
                    res.totalCount
                  }}</span
                  >{{ resultsLabel().after }}
                  <span class="font-medium text-gray-900 dark:text-white">{{ res.city.name }}</span>
                </p>

                <div class="flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap sm:flex-shrink-0">
                  <select
                    [value]="sort()"
                    (change)="onSortChange($event)"
                    [attr.aria-label]="'filters.sortBy' | transloco"
                    class="glass-button h-9 min-w-[140px] sm:min-w-[160px] text-sm text-gray-700 dark:text-white/80 border-gray-200 dark:border-white/20 cursor-pointer pr-8"
                  >
                    @for (opt of sortOptions; track opt.value) {
                      <option [value]="opt.value" [selected]="opt.value === sort()">{{ opt.key | transloco }}</option>
                    }
                  </select>

                  <div class="glass-base flex items-center p-1 gap-0.5" role="group" aria-label="Switch view mode">
                    @for (v of viewOptions; track v.value) {
                      <button
                        type="button"
                        (click)="setView(v.value)"
                        [attr.aria-label]="v.key | transloco"
                        [attr.aria-pressed]="view() === v.value"
                        [attr.class]="
                          'h-7 w-7 rounded-lg flex items-center justify-center transition-all duration-200 ' +
                          (view() === v.value
                            ? 'bg-brand-500/20 dark:bg-brand-500/30 text-brand-700 dark:text-brand-300 shadow-sm border border-brand-500/30'
                            : 'text-gray-600 dark:text-white/50 hover:text-gray-800 dark:hover:text-white/80 hover:bg-gray-200 dark:hover:bg-white/10')
                        "
                      >
                        <app-icon [name]="v.icon" class="h-3.5 w-3.5" />
                      </button>
                    }
                  </div>
                </div>
              </div>

              @if (res.properties.length === 0) {
                <div class="glass-card p-10 text-center text-slate-600 dark:text-white/70">
                  {{ 'results.empty' | transloco }}
                  <button type="button" (click)="clearFilters()" class="text-brand-600 dark:text-brand-400 underline">
                    {{ 'filters.clear' | transloco }}
                  </button>
                </div>
              } @else if (view() === 'map') {
                <div class="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
                  <!--
                    El mapa solo se monta en el NAVEGADOR: el API de Google necesita document,
                    y al buscador no le aporta nada — lo que indexa es la lista de anuncios,
                    que ya viaja en el HTML servido. En servidor queda el hueco con las mismas
                    dimensiones para que el layout de dos columnas no salte al hidratar.
                  -->
                  @if (isBrowser) {
                    <div class="glass-card p-0 overflow-hidden h-[55vh] lg:h-[800px]">
                      <app-search-map [citySlug]="citySlug()" [filters]="mapFilters()" />
                    </div>
                  } @else {
                    <div class="glass-card h-[55vh] lg:h-[800px]"></div>
                  }
                  <div class="space-y-4 lg:overflow-y-auto lg:max-h-[800px] pr-1">
                    @for (p of res.properties; track p.id) {
                      <app-property-card [item]="p" variant="list" />
                    }
                  </div>
                </div>
              } @else {
                <div [attr.class]="view() === 'list' ? 'grid grid-cols-1 gap-4' : 'grid sm:grid-cols-2 xl:grid-cols-3 gap-5'">
                  @for (p of res.properties; track p.id) {
                    <app-property-card [item]="p" [variant]="view() === 'list' ? 'list' : 'grid'" />
                  }
                </div>
              }
            </div>
          </div>
        }
      } @else {
        <p class="text-gray-500 dark:text-white/60">{{ 'common.loading' | transloco }}</p>
      }
    </div>
  `,
})
export class CityResultsPage {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly seo = inject(SeoService);
  private readonly siteUrl = inject(SITE_BASE_URL);
  /** Solo existe durante el render del servidor; en el navegador es null. Ver `applySeo()`. */
  private readonly responseInit = inject(RESPONSE_INIT, { optional: true });
  protected readonly culture = inject(CultureService);
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Los mismos filtros que la rejilla. El mapa y la lista tienen que enseñar EL MISMO conjunto:
   * si divergieran, cambiar de vista pareceria perder pisos.
   */
  protected readonly mapFilters = computed<ApiFilters>(() => this.apiFilters());

  /**
   * El contador de resultados, partido por su marcador para poder resaltar el numero.
   *
   * Depende de la cultura activa para rehacerse al cambiar de idioma: en frances la frase es
   * "{0} locations à", no una traduccion palabra por palabra de la inglesa.
   */
  protected readonly resultsLabel = computed(() => {
    this.culture.culture();
    const [before, after = ''] = this.transloco.translate('listings.resultsCount').split('{0}');
    return { before, after };
  });

  constructor() {
    effect(() => this.applySeo());
  }

  /**
   * `<head>` de la pagina de ciudad.
   *
   * El canonical que pone el servicio ya viene SIN query, asi que las combinaciones de filtros
   * apuntan todas a la ciudad limpia. Es deliberado: `?maxPrice=4000&types=Condo` y sus
   * infinitas variantes ensenan el mismo catalogo y competirian entre si por la misma
   * busqueda.
   */
  private applySeo(): void {
    const res = this.result();
    if (!res) return;

    const t = (key: string) => this.transloco.translate(key);

    if (!res.city) {
      // Mismo literal que pinta la plantilla, y sin indexar: una ciudad inexistente no debe
      // dejar rastro en el buscador.
      this.seo.apply({ title: 'City not found', noIndex: true });

      // Y ademas el ESTADO tiene que decir 404. Hasta ahora se servia esta pantalla con un 200:
      // un "soft 404", que para un rastreador significa "esta pagina existe y esta bien", y para
      // cualquiera que mire codigos de estado es sencillamente falso. `noindex` tapa el problema
      // de indexacion pero no arregla la mentira.
      //
      // `responseInit` es null en el navegador (solo existe durante el render del servidor),
      // asi que la comprobacion no sobra.
      if (this.responseInit) this.responseInit.status = 404;
      return;
    }

    const culture = this.culture.culture();
    const city = res.city;

    this.seo.apply({
      title: `${t('listings.rentalsIn')} ${city.name}`,
      description: formatTemplate(t('seo.description.city'), city.name, city.province),
      image: city.imageUrl,
      jsonLd: [
        cityJsonLd(this.siteUrl, culture, city, res.properties),
        breadcrumbJsonLd([
          { name: t('common.rent'), url: `${this.siteUrl}/${culture}` },
          { name: city.name, url: `${this.siteUrl}/${culture}/${city.slug}` },
        ]),
      ],
    });
  }

  protected readonly sortOptions: { value: SearchSort; key: string }[] = [
    { value: 'Newest', key: 'sort.newest' },
    { value: 'PriceAsc', key: 'sort.priceAsc' },
    { value: 'PriceDesc', key: 'sort.priceDesc' },
    { value: 'Popular', key: 'sort.popular' },
  ];

  protected readonly viewOptions: { value: ViewMode; icon: string; key: string }[] = [
    { value: 'grid', icon: 'grid-3x3', key: 'filters.viewGrid' },
    { value: 'list', icon: 'list', key: 'filters.viewList' },
    { value: 'map', icon: 'map', key: 'filters.viewMap' },
  ];

  private readonly params = toSignal(
    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(
      map(([p, q]) => ({ citySlug: p.get('citySlug') ?? '', query: q })),
    ),
    { initialValue: null },
  );

  protected readonly citySlug = computed(() => this.params()?.citySlug ?? '');
  protected readonly view = computed<ViewMode>(() => {
    const raw = this.params()?.query.get('view');
    return raw === 'list' || raw === 'map' ? raw : 'grid';
  });
  protected readonly sort = computed<SearchSort>(() => {
    const raw = this.params()?.query.get('sort');
    return (['Newest', 'PriceAsc', 'PriceDesc', 'Popular'] as const).includes(raw as SearchSort)
      ? (raw as SearchSort)
      : 'Newest';
  });

  protected readonly filters = computed<FilterState>(() => {
    const q = this.params()?.query;
    if (!q) return emptyFilters();

    return {
      types: (q.get('types') ?? '').split(',').filter(Boolean) as PropertyType[],
      minPrice: Number(q.get('minPrice') ?? 0),
      maxPrice: Number(q.get('maxPrice') ?? PRICE_CAP),
      bedrooms: Number(q.get('bedrooms') ?? 0),
      bathrooms: Number(q.get('bathrooms') ?? 0),
      petsAllowed: q.get('petsAllowed') === 'true',
      furnished: q.get('furnished') === 'true',
      hasParking: q.get('hasParking') === 'true',
    };
  });

  private readonly apiFilters = computed<ApiFilters>(() => {
    const f = this.filters();
    return {
      types: f.types.length ? f.types : null,
      minPrice: f.minPrice > 0 ? f.minPrice : null,
      maxPrice: f.maxPrice < PRICE_CAP ? f.maxPrice : null,
      bedrooms: f.bedrooms > 0 ? f.bedrooms : null,
      bathrooms: f.bathrooms > 0 ? f.bathrooms : null,
      petsAllowed: f.petsAllowed,
      furnished: f.furnished,
      hasParking: f.hasParking,
      sort: this.sort(),
    };
  });

  private readonly request = computed(() => ({ citySlug: this.citySlug(), filters: this.apiFilters() }));

  protected readonly result = toSignal(
    toObservable(this.request).pipe(
      switchMap((req) =>
        req.citySlug
          ? this.api.search(req.citySlug, req.filters).pipe(
              // Un 404 de la API es "esa ciudad no existe", no "sigo cargando". Devolver
              // null dejaria la pagina en el estado de carga para siempre; se devuelve una
              // respuesta vacia con city=null, que es lo que la plantilla ya distingue.
              catchError(() => of(CITY_NOT_FOUND)),
            )
          : of(null),
      ),
    ),
    { initialValue: null },
  );

  protected findInLabel(cityName: string): string {
    return formatTemplate(this.transloco.translate('listings.findIn'), cityName);
  }

  protected onSortChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as SearchSort;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sort: value === 'Newest' ? null : value },
      queryParamsHandling: 'merge',
    });
  }

  protected setView(view: ViewMode): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: view === 'grid' ? null : view },
      queryParamsHandling: 'merge',
    });
  }

  protected clearFilters(): void {
    this.router.navigate(['/', this.culture.culture(), this.citySlug()]);
  }
}
