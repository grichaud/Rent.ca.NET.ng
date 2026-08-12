import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, of } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { CultureService } from '../../core/i18n/culture.service';
import { siteJsonLd } from '../../core/seo/json-ld';
import { SeoService } from '../../core/seo/seo.service';
import { SITE_BASE_URL } from '../../core/seo/site-url';
import { CountUpDirective } from '../../shared/count-up.directive';
import { formatTemplate } from '../../shared/format';
import { Icon } from '../../shared/ui/icon/icon';
import { PropertyCardComponent } from '../../shared/ui/property-card';

/** Gradiente de respaldo por ciudad cuando no hay foto (city-card.tsx del Next.js). */
const CITY_GRADIENTS: Record<string, string> = {
  toronto: 'from-brand-900 via-brand-800 to-purple-900',
  vancouver: 'from-cyan-900 via-teal-800 to-brand-900',
  montreal: 'from-purple-900 via-brand-900 to-indigo-900',
  calgary: 'from-amber-900 via-orange-900 to-brand-900',
  edmonton: 'from-green-900 via-teal-900 to-brand-900',
  ottawa: 'from-brand-950 via-brand-900 to-purple-900',
  winnipeg: 'from-indigo-900 via-brand-900 to-cyan-900',
  'quebec-city': 'from-purple-950 via-purple-900 to-brand-900',
  hamilton: 'from-slate-800 via-brand-900 to-teal-900',
  saskatoon: 'from-amber-950 via-brand-900 to-orange-900',
  london: 'from-brand-900 via-indigo-900 to-purple-900',
  halifax: 'from-cyan-950 via-brand-900 to-teal-900',
};

const QUICK_CITIES = ['Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa', 'Edmonton'];

@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, Icon, PropertyCardComponent, CountUpDirective],
  template: `
    <!-- Hero a ancho completo -->
    <section
      class="relative overflow-hidden min-h-[90vh] flex flex-col items-center justify-center px-4 py-24"
      [attr.aria-label]="('hero.title' | transloco) + ' ' + ('hero.titleHighlight' | transloco)"
    >
      <div class="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1517935706615-2717063c2225?w=1920&h=1080&fit=crop&q=80"
          alt=""
          class="absolute inset-0 w-full h-full object-cover"
          loading="eager"
          fetchpriority="high"
        />
        <div class="absolute inset-0 bg-white/40 dark:bg-slate-950/60"></div>
        <div class="absolute inset-0 mesh-background opacity-40 dark:opacity-60"></div>
      </div>

      <div aria-hidden="true" class="pointer-events-none absolute inset-0 z-[1]">
        <div
          class="absolute -top-[10%] -left-[5%] h-[600px] w-[600px] rounded-full bg-brand-500/10 dark:bg-brand-500/15 blur-[120px] animate-pulse-slow"
        ></div>
        <div
          class="absolute -top-[5%] -right-[10%] h-[500px] w-[500px] rounded-full bg-purple-500/10 dark:bg-purple-500/15 blur-[100px] animate-pulse-slow [animation-delay:2s]"
        ></div>
        <div
          class="absolute bottom-[5%] left-[30%] h-[400px] w-[400px] rounded-full bg-cyan-500/10 dark:bg-cyan-500/15 blur-[80px] animate-pulse-slow [animation-delay:4s]"
        ></div>
      </div>

      <div
        aria-hidden="true"
        class="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-gray-50 dark:from-slate-950 to-transparent pointer-events-none z-[2]"
      ></div>

      <div class="relative z-10 w-full max-w-4xl mx-auto px-4 py-16 sm:py-24 text-center">
        <div class="glass-badge mx-auto mb-8 inline-flex">
          <app-icon name="sparkles" class="h-3.5 w-3.5 text-brand-600 dark:text-brand-300" />
          <span class="text-xs font-medium text-slate-700 dark:text-white/80">{{ 'hero.badge' | transloco }}</span>
        </div>

        <h1
          class="font-sans font-bold tracking-tight text-5xl sm:text-6xl md:text-7xl leading-[1.05] text-slate-900 dark:text-white"
        >
          {{ 'hero.title' | transloco }}
          <span
            class="bg-gradient-to-r from-brand-500 to-cyan-500 dark:from-brand-400 dark:to-cyan-400 bg-clip-text text-transparent"
            >{{ 'hero.titleHighlight' | transloco }}</span
          >
        </h1>
        <p class="text-lg sm:text-xl text-slate-600 dark:text-white/70 mt-6 max-w-2xl mx-auto">
          {{ 'hero.subtitle' | transloco }}
        </p>

        <form
          (submit)="onSearch($event)"
          class="mt-10 max-w-2xl mx-auto glass-base flex items-center gap-3 px-6 py-4 focus-within:border-brand-500/40 dark:focus-within:border-white/40 transition-all duration-300 shadow-2xl shadow-black/10 dark:shadow-black/30"
          role="search"
        >
          <app-icon name="search" class="h-5 w-5 shrink-0 text-gray-400 dark:text-white/40" />
          <!-- min-w-0 en el campo: un item flex no baja de su ancho intrinseco por defecto, y
               el placeholder es largo. Sin esa clase el campo se niega a encoger y empuja al
               boton de buscar fuera de pantalla en cualquier telefono (terminaba en 434px). -->
          <input
            #cityInput
            type="search"
            name="q"
            required
            autocomplete="off"
            [placeholder]="'hero.searchPlaceholder' | transloco"
            [attr.aria-label]="'hero.searchPlaceholder' | transloco"
            class="flex-1 min-w-0 bg-transparent border-0 outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 text-base focus:ring-0 px-4 py-1"
          />
          <button
            type="submit"
            class="glass-button-primary !px-5 !py-2.5 text-sm font-semibold shrink-0"
            aria-label="Search rentals"
          >
            <span>{{ 'common.search' | transloco }}</span>
          </button>
        </form>

        <nav class="mt-10 flex flex-wrap justify-center gap-2" aria-label="Popular cities">
          @for (name of quickCities; track name) {
            <a
              [routerLink]="['/', culture.culture(), slugify(name)]"
              class="glass-badge text-slate-600 hover:text-slate-900 hover:bg-gray-200/50 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/20 transition-all duration-200"
              >{{ name }}</a
            >
          }
        </nav>
      </div>
    </section>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-24">
      @if (data(); as home) {
        <section aria-labelledby="popular-cities-heading">
          <div class="mb-10 flex items-end justify-between">
            <div>
              <p class="text-sm font-medium text-brand-400 uppercase tracking-widest mb-2">
                {{ 'cities.sectionLabel' | transloco }}
              </p>
              <h2
                id="popular-cities-heading"
                class="font-sans font-bold tracking-tight text-3xl sm:text-4xl text-slate-900 dark:text-white"
              >
                {{ 'cities.sectionTitle' | transloco }}
              </h2>
            </div>
            <p class="hidden sm:block text-slate-400 dark:text-white/50 text-sm">{{ citiesAvailable() }}</p>
          </div>

          <div class="grid gap-8 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            @for (city of home.featuredCities; track city.slug) {
              <a [routerLink]="['/', culture.culture(), city.slug]" class="group flex flex-col items-center gap-3">
                <div class="relative">
                  <div
                    aria-hidden="true"
                    class="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 blur-md bg-gradient-to-br from-brand-500/50 to-cyan-500/50 -m-1 transition-opacity"
                  ></div>
                  <div
                    class="relative h-[120px] w-[120px] rounded-full border-2 border-gray-200 dark:border-white/20 group-hover:border-brand-400 dark:group-hover:border-brand-500/50 transition-all duration-300 group-hover:scale-105 shadow-xl overflow-hidden"
                  >
                    @if (city.imageUrl) {
                      <img [src]="city.imageUrl" [alt]="city.name" loading="lazy" class="h-full w-full object-cover" />
                    } @else {
                      <div
                        [attr.class]="'h-full w-full bg-gradient-to-br ' + gradientFor(city.slug) + ' flex items-center justify-center'"
                      >
                        <span class="text-4xl font-bold text-white/80 select-none">{{ city.name.charAt(0) }}</span>
                      </div>
                    }
                    <div
                      aria-hidden="true"
                      class="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none"
                    ></div>
                  </div>
                </div>
                <div class="text-center">
                  <p
                    class="font-semibold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors"
                  >
                    {{ city.name }}
                  </p>
                  <p class="text-sm text-slate-400 dark:text-white/50">{{ city.province }}</p>
                </div>
              </a>
            }
          </div>
        </section>

        @if (home.latestListings.length) {
          <section aria-labelledby="new-listings-heading">
            <div class="flex items-end justify-between mb-8">
              <div>
                <p class="text-sm font-medium text-brand-400 uppercase tracking-widest mb-2">
                  {{ 'listings.justAdded' | transloco }}
                </p>
                <h2
                  id="new-listings-heading"
                  class="font-sans font-bold tracking-tight text-3xl sm:text-4xl text-slate-900 dark:text-white"
                >
                  {{ 'listings.newListings' | transloco }}
                </h2>
              </div>
              <!-- "canada" es el agregado nacional que ya soporta la API. -->
              <a
                [routerLink]="['/', culture.culture(), 'canada']"
                class="glass-button !px-4 py-2 text-sm font-medium text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1.5"
              >
                <span>{{ 'common.viewAll' | transloco }}</span>
                <app-icon name="arrow-right" class="h-4 w-4" />
              </a>
            </div>

            <div class="relative">
              <button
                type="button"
                (click)="scrollTrack(-1)"
                class="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 h-10 w-10 rounded-full hidden sm:flex items-center justify-center bg-black/40 hover:bg-black/60 border border-white/20 backdrop-blur-md text-white transition-colors"
                aria-label="Scroll left"
              >
                <app-icon name="chevron-left" class="h-5 w-5" />
              </button>

              <div
                #track
                class="flex gap-5 overflow-x-auto scroll-smooth pb-4 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="list"
                aria-label="New rental listings"
              >
                @for (listing of home.latestListings; track listing.id) {
                  <div role="listitem" class="snap-start w-[300px] sm:w-[320px] flex-shrink-0">
                    <app-property-card [item]="listing" />
                  </div>
                }
              </div>

              <button
                type="button"
                (click)="scrollTrack(1)"
                class="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 h-10 w-10 rounded-full hidden sm:flex items-center justify-center bg-black/40 hover:bg-black/60 border border-white/20 backdrop-blur-md text-white transition-colors"
                aria-label="Scroll right"
              >
                <app-icon name="chevron-right" class="h-5 w-5" />
              </button>
            </div>
          </section>
        }
      }

      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" class="sr-only">{{ 'stats.title' | transloco }}</h2>
        <div class="grid gap-6 grid-cols-1 sm:grid-cols-3">
          @for (stat of stats; track stat.labelKey) {
            <div class="glass-card-premium p-8 flex flex-col items-center text-center gap-4">
              <span class="glass-highlight"></span>
              <div
                class="h-14 w-14 rounded-2xl flex items-center justify-center bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10"
              >
                <app-icon [name]="stat.icon" [class]="'h-7 w-7 ' + stat.iconColor" />
              </div>
              <div>
                <p class="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white tabular-nums">
                  <span [appCountUp]="stat.target" [format]="stat.format">0</span
                  ><span [attr.class]="'ml-0.5 ' + stat.iconColor">{{ stat.suffix }}</span>
                </p>
                <p class="mt-1 text-lg font-semibold text-slate-700 dark:text-white/90">{{ stat.labelKey | transloco }}</p>
                <p class="mt-1 text-sm text-slate-400 dark:text-white/40">{{ stat.descKey | transloco }}</p>
              </div>
            </div>
          }
        </div>
      </section>

      <section>
        <div class="glass-card-premium p-10 sm:p-14 text-center">
          <span class="glass-highlight"></span>
          <app-icon name="building" class="h-10 w-10 mx-auto text-brand-500 mb-4" />
          <h2 class="font-sans font-bold tracking-tight text-3xl sm:text-4xl text-slate-900 dark:text-white">
            {{ 'landlordPage.title' | transloco }}
            <span
              class="bg-gradient-to-r from-brand-500 to-cyan-500 dark:from-brand-400 dark:to-cyan-400 bg-clip-text text-transparent"
              >{{ 'landlordPage.titleHighlight' | transloco }}</span
            >
          </h2>
          <p class="text-slate-600 dark:text-white/70 mt-3 max-w-xl mx-auto">{{ 'landlordPage.subtitle' | transloco }}</p>
          <a
            [routerLink]="['/', culture.culture(), 'landlords']"
            class="glass-button-primary inline-flex items-center gap-2 mt-8"
          >
            <span>{{ 'landlordPage.getStarted' | transloco }}</span>
            <app-icon name="user-plus" class="h-4 w-4" />
          </a>
        </div>
      </section>
    </div>
  `,
})
export class HomePage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  protected readonly culture = inject(CultureService);

  private readonly seo = inject(SeoService);
  private readonly siteUrl = inject(SITE_BASE_URL);

  constructor() {
    // No usa `applyStaticSeo` porque el titulo del origen se compone de DOS claves
    // (`hero.title` + `hero.titleHighlight` = "Find Your Next Home"), y ese helper solo sabe
    // de una.
    //
    // La identidad del sitio (WebSite + Organization) se declara SOLO aqui: repetirla en cada
    // pagina no anade informacion, solo peso al HTML de todas ellas.
    effect(() => {
      const culture = this.culture.culture();
      const t = (key: string) => this.transloco.translate(key);

      this.seo.apply({
        title: `${t('hero.title')} ${t('hero.titleHighlight')}`,
        description: t('seo.description.home'),
        jsonLd: siteJsonLd(this.siteUrl, culture, t('seo.siteName')),
      });
    });
  }

  private readonly cityInput = viewChild<ElementRef<HTMLInputElement>>('cityInput');
  private readonly track = viewChild<ElementRef<HTMLElement>>('track');

  protected readonly quickCities = QUICK_CITIES;

  protected readonly stats = [
    {
      icon: 'building-2', iconColor: 'text-brand-400', target: 10000, format: 'thousands' as const,
      suffix: 'K+', labelKey: 'stats.activeListings', descKey: 'stats.activeListingsDesc',
    },
    {
      icon: 'map-pin', iconColor: 'text-cyan-400', target: 200, format: 'raw' as const,
      suffix: '+', labelKey: 'stats.citiesCovered', descKey: 'stats.citiesCoveredDesc',
    },
    {
      icon: 'users', iconColor: 'text-purple-400', target: 50000, format: 'thousands' as const,
      suffix: 'K+', labelKey: 'stats.happyRenters', descKey: 'stats.happyRentersDesc',
    },
  ];

  protected readonly data = toSignal(
    this.api.getHome().pipe(catchError(() => of(null))),
    { initialValue: null },
  );

  protected readonly citiesAvailable = computed(() =>
    formatTemplate(this.transloco.translate('cities.available'), this.data()?.featuredCities.length ?? 0),
  );

  protected gradientFor(slug: string): string {
    return CITY_GRADIENTS[slug] ?? 'from-brand-900 to-purple-900';
  }

  /** Mismo slugify que el script del origen: sin acentos y separado por guiones. */
  protected slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  protected onSearch(event: Event): void {
    event.preventDefault();
    const slug = this.slugify(this.cityInput()?.nativeElement.value.trim() ?? '');
    if (slug) this.router.navigate(['/', this.culture.culture(), slug]);
  }

  protected scrollTrack(direction: 1 | -1): void {
    this.track()?.nativeElement.scrollBy({ left: direction * 320, behavior: 'smooth' });
  }
}
