import { DOCUMENT, ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CultureService } from '../../core/i18n/culture.service';
import { applyStaticSeo } from '../../core/seo/static-seo';
import { Icon } from '../../shared/ui/icon/icon';

/**
 * Port de Features/Home/LandlordsLanding.cshtml (+ su PageModel).
 *
 * Cerraba la ultima deuda de la Fase 5: la ruta existia desde entonces apuntando a
 * `PagePlaceholder`. Se construye ahora, junto al SEO, porque es una pagina comercial PUBLICA
 * y publicarla vacia habria sido indexar un hueco — el peor de los estados posibles.
 *
 * Los datos del PageModel del origen (tarifas, testimonios, FAQ) son constantes: alli viven en
 * C# solo porque una vista Razor no puede declarar estructuras. Aqui son constantes del
 * modulo, que es lo mismo sin la indireccion.
 */

type TierVariant = 'standard' | 'promoted' | 'featured';

interface TierFeature {
  labelKey: string;
  included: boolean;
}

interface PricingTier {
  nameKey: string;
  priceKey: string;
  periodKey: string;
  bodyKey: string;
  ctaKey: string;
  badgeKey: string | null;
  variant: TierVariant;
  features: TierFeature[];
}

/** Las 8 filas de la tabla son las mismas en los tres planes; solo cambia cuantas se incluyen. */
function tierFeatures(prefix: string, includedCount: number): TierFeature[] {
  return [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    labelKey: `${prefix}F${n}`,
    included: n <= includedCount,
  }));
}

const TIERS: PricingTier[] = [
  {
    nameKey: 'Landlords_TierLimited',
    priceKey: 'Landlords_TierLimitedPrice',
    periodKey: 'Landlords_TierLimitedPeriod',
    bodyKey: 'Landlords_TierLimitedBody',
    ctaKey: 'Landlords_TierLimitedCta',
    badgeKey: null,
    variant: 'standard',
    features: tierFeatures('Landlords_TierLimited', 4),
  },
  {
    nameKey: 'Landlords_TierPromoted',
    priceKey: 'Landlords_TierPromotedPrice',
    periodKey: 'Landlords_TierPromotedPeriod',
    bodyKey: 'Landlords_TierPromotedBody',
    ctaKey: 'Landlords_TierPromotedCta',
    badgeKey: 'Landlords_TierPromotedBadge',
    variant: 'promoted',
    features: tierFeatures('Landlords_TierPromoted', 5),
  },
  {
    nameKey: 'Landlords_TierFeatured',
    priceKey: 'Landlords_TierFeaturedPrice',
    periodKey: 'Landlords_TierFeaturedPeriod',
    bodyKey: 'Landlords_TierFeaturedBody',
    ctaKey: 'Landlords_TierFeaturedCta',
    badgeKey: 'Landlords_TierFeaturedBadge',
    variant: 'featured',
    features: tierFeatures('Landlords_TierFeatured', 8),
  },
];

const CARD_CLASSES: Record<TierVariant, string> = {
  promoted: 'glass-card-premium p-8 ring-2 ring-brand-500/60 lg:scale-[1.03] z-10 shadow-2xl shadow-brand-500/20',
  featured: 'glass-card p-8 ring-1 ring-amber-400/50 dark:ring-amber-400/40 shadow-xl shadow-amber-500/10',
  standard: 'glass-card p-8',
};

const CTA_CLASSES: Record<TierVariant, string> = {
  promoted: 'glass-button-primary',
  featured:
    'inline-flex items-center justify-center gap-2 w-full rounded-2xl px-5 py-2.5 font-medium text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-xl shadow-amber-500/30 hover:shadow-2xl hover:shadow-amber-500/40 transition-all duration-300',
  standard: 'glass-button w-full justify-center',
};

const WHY_CARDS = [
  { icon: 'eye', bg: 'bg-brand-500/15 dark:bg-brand-500/25', color: 'text-brand-600 dark:text-brand-300', titleKey: 'Landlords_Why1Title', bodyKey: 'Landlords_Why1Body' },
  { icon: 'sparkles', bg: 'bg-cyan-500/15 dark:bg-cyan-500/25', color: 'text-cyan-600 dark:text-cyan-300', titleKey: 'Landlords_Why2Title', bodyKey: 'Landlords_Why2Body' },
  { icon: 'layout-dashboard', bg: 'bg-purple-500/15 dark:bg-purple-500/25', color: 'text-purple-600 dark:text-purple-300', titleKey: 'Landlords_Why3Title', bodyKey: 'Landlords_Why3Body' },
];

const STEPS = [
  { num: '1', icon: 'user-plus', titleKey: 'Landlords_Step1Title', bodyKey: 'Landlords_Step1Body' },
  { num: '2', icon: 'file-plus', titleKey: 'Landlords_Step2Title', bodyKey: 'Landlords_Step2Body' },
  { num: '3', icon: 'message-square', titleKey: 'Landlords_Step3Title', bodyKey: 'Landlords_Step3Body' },
];

const TESTIMONIALS = [
  { quoteKey: 'Landlords_T1Quote', authorKey: 'Landlords_T1Author', companyKey: 'Landlords_T1Company', avatar: 'J' },
  { quoteKey: 'Landlords_T2Quote', authorKey: 'Landlords_T2Author', companyKey: 'Landlords_T2Company', avatar: 'P' },
  { quoteKey: 'Landlords_T3Quote', authorKey: 'Landlords_T3Author', companyKey: 'Landlords_T3Company', avatar: 'M' },
];

const FAQ_ITEMS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Las cifras del hero son literales en el origen; se formatean por cultura, como alli. */
const HERO_STATS = [
  { value: 10000, suffix: '+', labelKey: 'Landlords_StatListings' },
  { value: 200, suffix: '+', labelKey: 'Landlords_StatCities' },
  { value: 50000, suffix: '+', labelKey: 'Landlords_StatVisitors' },
];

@Component({
  selector: 'app-landlords-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, Icon],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <!-- 1. Hero -->
      <section class="relative overflow-hidden rounded-3xl">
        <div class="aurora-orb h-[360px] w-[360px] -top-24 -left-24 bg-brand-500"></div>
        <div class="aurora-orb h-[400px] w-[400px] -top-20 right-0 bg-cyan-400 [animation-delay:2s]"></div>

        <div class="relative max-w-4xl mx-auto text-center py-16 sm:py-24">
          <div class="glass-badge mx-auto mb-6 inline-flex">
            <app-icon name="building-2" class="h-3.5 w-3.5 text-brand-600 dark:text-brand-300" />
            <span class="text-xs font-medium text-slate-700 dark:text-white/80">{{ 'Landlords_HeroBadge' | transloco }}</span>
          </div>
          <h1
            class="font-sans font-bold tracking-tight text-5xl sm:text-6xl md:text-7xl text-slate-900 dark:text-white leading-[1.05]"
          >
            <span class="block">{{ 'Landlords_HeroTitle1' | transloco }}</span>
            <span
              class="block bg-gradient-to-r from-brand-500 to-cyan-500 dark:from-brand-400 dark:to-cyan-400 bg-clip-text text-transparent"
              >{{ 'Landlords_HeroTitle2' | transloco }}</span
            >
          </h1>
          <p class="text-lg sm:text-xl text-slate-600 dark:text-white/70 mt-6 max-w-2xl mx-auto">
            {{ 'Landlords_HeroSubtitle' | transloco }}
          </p>
          <div class="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a [routerLink]="signupLink()" class="glass-button-primary inline-flex items-center gap-2">
              <span>{{ 'Landlords_GetStartedFree' | transloco }}</span>
              <app-icon name="arrow-right" class="h-4 w-4" />
            </a>
            <!--
              El href lleva la RUTA COMPLETA, no solo el fragmento.

              Un href="#pricing" pelado no vale aqui: con un elemento base en el head -y esta
              app tiene base href="/"- el navegador resuelve los enlaces de solo fragmento
              contra la BASE, no contra la pagina actual. El enlace acababa en /#pricing, que
              redirige a /en, y el boton de precios sacaba al visitante de la pagina.

              routerLink con fragment tampoco desplaza: cuando solo cambia el fragmento de la
              ruta ya activa, el desplazamiento por ancla de Angular no llega a dispararse. De
              ahi el manejador explicito. Sin JavaScript el href sigue funcionando solo.

              (Cuidado al comentar dentro de esta plantilla: la delimitan comillas invertidas,
              asi que una sola dentro del comentario rompe la compilacion.)
            -->
            <a [href]="pricingHref()" (click)="scrollToPricing($event)" class="glass-button">{{
              'Landlords_ViewPricing' | transloco
            }}</a>
          </div>

          <div class="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            @for (stat of heroStats; track stat.labelKey) {
              <div class="glass-card p-5 text-center">
                <div class="text-3xl font-bold text-slate-900 dark:text-white">
                  {{ formatCount(stat.value) }}{{ stat.suffix }}
                </div>
                <div class="text-sm text-slate-600 dark:text-white/60 mt-1">{{ stat.labelKey | transloco }}</div>
              </div>
            }
          </div>
        </div>
      </section>

      <!-- 2. Por que publicar en Rent.ca -->
      <section class="mt-24" aria-labelledby="landlords-why-heading">
        <h2
          id="landlords-why-heading"
          class="font-sans font-bold tracking-tight text-3xl sm:text-4xl text-slate-900 dark:text-white text-center"
        >
          {{ 'Landlords_WhyTitle' | transloco }}
        </h2>
        <div class="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6">
          @for (card of whyCards; track card.titleKey) {
            <div class="glass-card p-6">
              <div [attr.class]="'inline-flex items-center justify-center h-12 w-12 rounded-2xl mb-4 ' + card.bg">
                <app-icon [name]="card.icon" [class]="'h-6 w-6 ' + card.color" />
              </div>
              <h3 class="font-semibold text-lg text-slate-900 dark:text-white">{{ card.titleKey | transloco }}</h3>
              <p class="text-sm text-slate-600 dark:text-white/60 mt-2 leading-relaxed">{{ card.bodyKey | transloco }}</p>
            </div>
          }
        </div>
      </section>

      <!-- 3. Como funciona -->
      <section class="mt-24" aria-labelledby="landlords-how-heading">
        <div class="text-center max-w-2xl mx-auto">
          <span class="glass-badge inline-flex">
            <app-icon name="check-circle" class="h-3.5 w-3.5 text-brand-600 dark:text-brand-300" />
            <span class="text-xs font-medium text-slate-700 dark:text-white/80">{{ 'Landlords_HowEyebrow' | transloco }}</span>
          </span>
          <h2
            id="landlords-how-heading"
            class="mt-4 font-sans font-bold tracking-tight text-3xl sm:text-4xl text-slate-900 dark:text-white"
          >
            {{ 'Landlords_HowTitle' | transloco }}
          </h2>
          <p class="mt-3 text-slate-600 dark:text-white/70">{{ 'Landlords_HowSubtitle' | transloco }}</p>
        </div>
        <div class="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6">
          @for (step of steps; track step.num) {
            <div class="relative glass-card p-6">
              <div class="flex items-start gap-4">
                <div
                  class="text-5xl font-bold bg-gradient-to-br from-brand-500 to-cyan-500 bg-clip-text text-transparent leading-none shrink-0"
                >
                  {{ step.num }}
                </div>
                <div class="flex-1">
                  <app-icon [name]="step.icon" class="h-6 w-6 text-brand-500 dark:text-brand-300 mb-2" />
                  <h3 class="font-semibold text-lg text-slate-900 dark:text-white">{{ step.titleKey | transloco }}</h3>
                  <p class="text-sm text-slate-600 dark:text-white/60 mt-2 leading-relaxed">
                    {{ step.bodyKey | transloco }}
                  </p>
                </div>
              </div>
            </div>
          }
        </div>
      </section>

      <!-- 4. Tarifas -->
      <section id="pricing" class="mt-24 scroll-mt-24" aria-labelledby="landlords-pricing-heading">
        <div class="text-center max-w-2xl mx-auto">
          <span class="glass-badge inline-flex">
            <app-icon name="tag" class="h-3.5 w-3.5 text-brand-600 dark:text-brand-300" />
            <span class="text-xs font-medium text-slate-700 dark:text-white/80">{{
              'Landlords_PricingEyebrow' | transloco
            }}</span>
          </span>
          <h2
            id="landlords-pricing-heading"
            class="mt-4 font-sans font-bold tracking-tight text-3xl sm:text-4xl text-slate-900 dark:text-white"
          >
            {{ 'Landlords_PricingTitle' | transloco }}
          </h2>
          <p class="mt-3 text-slate-600 dark:text-white/70">{{ 'Landlords_PricingSubtitle' | transloco }}</p>
        </div>
        <div class="mt-14 grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          @for (tier of tiers; track tier.nameKey) {
            <div [attr.class]="cardClass(tier.variant) + ' relative flex flex-col'">
              @if (tier.badgeKey) {
                @if (tier.variant === 'featured') {
                  <span
                    class="absolute -top-3 right-6 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-amber-950 bg-gradient-to-r from-amber-300 to-yellow-400 shadow-lg shadow-amber-500/40"
                  >
                    <app-icon name="crown" class="h-3.5 w-3.5" />
                    <span>{{ tier.badgeKey | transloco }}</span>
                  </span>
                } @else {
                  <span
                    class="absolute -top-3 right-6 inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-cyan-500 shadow-lg shadow-brand-500/40"
                  >
                    {{ tier.badgeKey | transloco }}
                  </span>
                }
              }
              <div>
                <h3 class="font-semibold text-xl text-slate-900 dark:text-white">{{ tier.nameKey | transloco }}</h3>
                <div class="mt-4 flex items-baseline gap-2">
                  <span class="text-4xl font-bold text-slate-900 dark:text-white">{{ tier.priceKey | transloco }}</span>
                  <span class="text-sm text-slate-500 dark:text-white/60">{{ tier.periodKey | transloco }}</span>
                </div>
                <p class="mt-3 text-sm text-slate-600 dark:text-white/60">{{ tier.bodyKey | transloco }}</p>
              </div>

              <ul class="mt-6 space-y-3 flex-1">
                @for (feat of tier.features; track feat.labelKey) {
                  <li
                    [attr.class]="
                      'flex items-start gap-3 text-sm ' +
                      (feat.included
                        ? 'text-slate-700 dark:text-white/80'
                        : 'text-slate-400 dark:text-white/35 line-through')
                    "
                  >
                    <span
                      [attr.class]="
                        'mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full shrink-0 ' +
                        (feat.included
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          : 'bg-slate-300/40 dark:bg-white/10 text-slate-400 dark:text-white/40')
                      "
                    >
                      <app-icon [name]="feat.included ? 'check' : 'x'" class="h-3 w-3" [strokeWidth]="3" />
                    </span>
                    <span>{{ feat.labelKey | transloco }}</span>
                  </li>
                }
              </ul>

              <a
                [routerLink]="signupLink()"
                [attr.class]="ctaClass(tier.variant) + ' mt-8 inline-flex items-center justify-center gap-2'"
              >
                <span>{{ tier.ctaKey | transloco }}</span>
                <app-icon name="arrow-right" class="h-4 w-4" />
              </a>
            </div>
          }
        </div>
        <p class="mt-10 text-center text-sm text-slate-500 dark:text-white/55">{{ 'Landlords_PricingFooter' | transloco }}</p>
        <p class="mt-2 text-center text-sm text-slate-500 dark:text-white/55">
          {{ 'Landlords_PricingDemoNote' | transloco }}
        </p>
      </section>

      <!-- 5. Testimonios -->
      <section class="mt-24" aria-labelledby="landlords-testimonials-heading">
        <div class="text-center max-w-2xl mx-auto">
          <span class="glass-badge inline-flex">
            <app-icon name="star" class="h-3.5 w-3.5 text-amber-500" fill="currentColor" />
            <span class="text-xs font-medium text-slate-700 dark:text-white/80">{{
              'Landlords_TestimonialsEyebrow' | transloco
            }}</span>
          </span>
          <h2
            id="landlords-testimonials-heading"
            class="mt-4 font-sans font-bold tracking-tight text-3xl sm:text-4xl text-slate-900 dark:text-white"
          >
            {{ 'Landlords_TestimonialsTitle' | transloco }}
          </h2>
          <p class="mt-3 text-slate-600 dark:text-white/70">{{ 'Landlords_TestimonialsSubtitle' | transloco }}</p>
        </div>
        <div class="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          @for (item of testimonials; track item.quoteKey) {
            <div class="glass-card p-6 flex flex-col">
              <div class="flex items-center gap-0.5 text-amber-500" role="img" [attr.aria-label]="'Landlords_StarRating' | transloco">
                @for (star of stars; track $index) {
                  <app-icon name="star" class="h-4 w-4" fill="currentColor" [strokeWidth]="0" />
                }
              </div>
              <blockquote class="mt-4 text-slate-700 dark:text-white/80 text-sm leading-relaxed flex-1">
                &ldquo;{{ item.quoteKey | transloco }}&rdquo;
              </blockquote>
              <div class="mt-6 flex items-center gap-3">
                <div
                  class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-cyan-500 text-white font-semibold text-sm shrink-0"
                >
                  {{ item.avatar }}
                </div>
                <div>
                  <div class="font-semibold text-slate-900 dark:text-white text-sm">{{ item.authorKey | transloco }}</div>
                  <div class="text-xs text-slate-500 dark:text-white/55">{{ item.companyKey | transloco }}</div>
                </div>
              </div>
            </div>
          }
        </div>
      </section>

      <!-- 6. FAQ -->
      <section class="mt-24" aria-labelledby="landlords-faq-heading">
        <div class="text-center max-w-2xl mx-auto">
          <span class="glass-badge inline-flex">
            <app-icon name="info" class="h-3.5 w-3.5 text-brand-600 dark:text-brand-300" />
            <span class="text-xs font-medium text-slate-700 dark:text-white/80">{{ 'Landlords_FaqEyebrow' | transloco }}</span>
          </span>
          <h2
            id="landlords-faq-heading"
            class="mt-4 font-sans font-bold tracking-tight text-3xl sm:text-4xl text-slate-900 dark:text-white"
          >
            {{ 'Landlords_FaqTitle' | transloco }}
          </h2>
          <p class="mt-3 text-slate-600 dark:text-white/70">{{ 'Landlords_FaqSubtitle' | transloco }}</p>
        </div>
        <div class="mt-10 max-w-3xl mx-auto space-y-3">
          @for (n of faqItems; track n) {
            <details class="faq-item glass-card group">
              <summary class="flex items-center justify-between gap-4 cursor-pointer list-none p-5 select-none">
                <span class="font-medium text-slate-900 dark:text-white">{{ 'Landlords_FaqQ' + n | transloco }}</span>
                <app-icon
                  name="chevron-down"
                  class="faq-chevron h-4 w-4 text-slate-500 dark:text-white/60 transition-transform duration-300"
                />
              </summary>
              <div class="px-5 pb-5 text-sm text-slate-600 dark:text-white/70 leading-relaxed">
                {{ 'Landlords_FaqA' + n | transloco }}
              </div>
            </details>
          }
        </div>
      </section>

      <!-- 7. CTA final -->
      <section class="mt-24 mb-8">
        <div class="relative overflow-hidden glass-card-premium p-10 sm:p-14 text-center">
          <div class="aurora-orb h-[300px] w-[300px] -top-20 -left-20 bg-brand-500"></div>
          <div class="aurora-orb h-[300px] w-[300px] -bottom-20 -right-20 bg-cyan-400 [animation-delay:1.5s]"></div>
          <div class="relative">
            <h2 class="font-sans font-bold tracking-tight text-3xl sm:text-4xl text-slate-900 dark:text-white">
              {{ 'Landlords_FinalTitle' | transloco }}
            </h2>
            <p class="mt-4 text-slate-600 dark:text-white/70 max-w-2xl mx-auto">{{ 'Landlords_FinalBody' | transloco }}</p>
            <a [routerLink]="signupLink()" class="glass-button-primary inline-flex items-center gap-2 mt-8">
              <span>{{ 'Landlords_GetStartedFree' | transloco }}</span>
              <app-icon name="arrow-right" class="h-4 w-4" />
            </a>
            <div class="mt-6 inline-flex items-center gap-2 text-sm text-slate-500 dark:text-white/55">
              <app-icon name="check" class="h-4 w-4 text-emerald-500" [strokeWidth]="3" />
              <span>{{ 'Landlords_FinalNoCard' | transloco }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  `,
})
export class LandlordsPage {
  private readonly culture = inject(CultureService);
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);

  protected readonly tiers = TIERS;
  protected readonly whyCards = WHY_CARDS;
  protected readonly steps = STEPS;
  protected readonly testimonials = TESTIMONIALS;
  protected readonly faqItems = FAQ_ITEMS;
  protected readonly heroStats = HERO_STATS;
  protected readonly stars = [0, 1, 2, 3, 4];

  protected readonly signupLink = computed(() => ['/', this.culture.culture(), 'signup']);
  protected readonly pricingHref = computed(() => `/${this.culture.culture()}/landlords#pricing`);

  /** Desplaza sin recargar. `scroll-mt-24` deja la seccion por debajo del header fijo. */
  protected scrollToPricing(event: Event): void {
    event.preventDefault();
    this.document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  constructor() {
    // El titulo reusa `common.landlords`, la misma clave del `ViewData["Title"]` del origen.
    //
    // Se emite el FAQ como datos estructurados, pero NO las tarifas: los precios son de
    // demostracion ("no payments are processed" dice la propia pagina). Declarar un `Offer`
    // de 35 $ que nadie puede pagar seria afirmarle al buscador algo que el sitio no cumple.
    applyStaticSeo('common.landlords', 'seo.description.landlords', () => [
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ_ITEMS.map((n) => ({
          '@type': 'Question',
          name: this.transloco.translate(`Landlords_FaqQ${n}`),
          acceptedAnswer: { '@type': 'Answer', text: this.transloco.translate(`Landlords_FaqA${n}`) },
        })),
      },
    ]);
  }

  /** `N0` de la cultura activa, como el `10000.ToString("N0")` del origen. */
  protected formatCount(value: number): string {
    return value.toLocaleString(this.culture.culture() === 'fr' ? 'fr-CA' : 'en-CA');
  }

  protected cardClass(variant: TierVariant): string {
    return CARD_CLASSES[variant];
  }

  protected ctaClass(variant: TierVariant): string {
    return CTA_CLASSES[variant];
  }
}
