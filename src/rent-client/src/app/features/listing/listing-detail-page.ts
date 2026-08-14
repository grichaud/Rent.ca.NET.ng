import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { combineLatest, catchError, map, of, switchMap } from 'rxjs';
import { AiContextService } from '../../core/ai/ai-context.service';
import { ApiService } from '../../core/api/api.service';
import { InquiriesService } from '../../core/api/inquiries.service';
import { Amenity, LeaseTerm, ListingDetail, PropertyType } from '../../core/api/api.types';
import { CultureService } from '../../core/i18n/culture.service';
import { breadcrumbJsonLd, listingJsonLd } from '../../core/seo/json-ld';
import { toMetaDescription } from '../../core/seo/meta-text';
import { SeoService } from '../../core/seo/seo.service';
import { SITE_BASE_URL } from '../../core/seo/site-url';
import { toFieldErrors } from '../auth/ui/auth-errors';
import { formatLongDate, formatPrice, formatTemplate } from '../../shared/format';
import { FavoriteButton } from '../../shared/ui/favorite-button';
import { Icon } from '../../shared/ui/icon/icon';
import { PropertyCardComponent } from '../../shared/ui/property-card';
import { ListingMap } from './listing-map';

type Tab = 'floorplans' | 'amenities' | 'about';

const TYPE_KEYS: Partial<Record<PropertyType, string>> = {
  Apartment: 'filters.apartment', Condo: 'filters.condo', House: 'filters.house',
  Townhouse: 'filters.townhouse', Basement: 'filters.basement', Studio: 'filters.studio',
  Loft: 'filters.loft', Duplex: 'filters.duplex',
};

const LEASE_KEYS: Record<LeaseTerm, string> = {
  MonthToMonth: 'detail.lease.monthToMonth', SixMonths: 'detail.lease.sixMonths',
  OneYear: 'detail.lease.oneYear', TwoYears: 'detail.lease.twoYears', Flexible: 'detail.lease.flexible',
};

/** Orden semantico de las categorias de amenities, igual que el origen. */
const CAT_ORDER: Record<string, number> = { building: 0, unit: 1, nearby: 2, other: 3 };
const CAT_KEYS: Record<string, string> = {
  building: 'detail.amenityCat.building', unit: 'detail.amenityCat.unit',
  nearby: 'detail.amenityCat.nearby', other: 'detail.amenityCat.other',
};

const GALLERY_GRADIENTS = [
  'from-brand-900 via-purple-900 to-slate-900',
  'from-cyan-900 via-teal-900 to-slate-900',
  'from-purple-900 via-indigo-900 to-slate-900',
  'from-blue-900 via-brand-900 to-slate-900',
  'from-teal-900 via-cyan-900 to-slate-900',
];

@Component({
  selector: 'app-listing-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, TranslocoPipe, ReactiveFormsModule, Icon, PropertyCardComponent, FavoriteButton,
    ListingMap,
  ],
  template: `
    @if (listing(); as p) {
      @if (p.id === '') {
        <section class="min-h-[70vh] flex items-center justify-center px-4">
          <div class="max-w-md w-full glass-card p-10 text-center">
            <h1 class="font-sans font-bold tracking-tight text-3xl text-slate-900 dark:text-white">
              {{ 'detail.notFound' | transloco }}
            </h1>
            <p class="text-slate-500 dark:text-white/60 mt-2">{{ 'detail.notFoundDesc' | transloco }}</p>
            <a [routerLink]="['/', culture.culture()]" class="glass-button-primary inline-block mt-6">{{
              'common.back' | transloco
            }}</a>
          </div>
        </section>
      } @else {
        <!-- Galeria a ancho completo -->
        @if (p.images.length === 0) {
          <div class="max-w-7xl mx-auto px-4 sm:px-6">
            <div class="glass-card p-10 text-center text-slate-500 dark:text-white/60">
              {{ 'gallery.noPhotos' | transloco }}
            </div>
          </div>
        } @else {
          <section class="w-full relative" role="region" [attr.aria-label]="'gallery.regionLabel' | transloco">
            <div class="h-[420px] md:h-[520px] grid grid-cols-4 grid-rows-2 gap-1">
              <button
                type="button"
                (click)="openLightbox(0)"
                [attr.class]="
                  'col-span-4 md:col-span-2 row-span-2 relative overflow-hidden group cursor-pointer border-0 p-0 md:rounded-l-2xl bg-gradient-to-br ' +
                  gradients[0]
                "
                [attr.aria-label]="'View photo 1: ' + slotAlt(p, 0)"
              >
                <img
                  [src]="p.images[0].url"
                  [alt]="slotAlt(p, 0)"
                  class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <span class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300"></span>
              </button>

              @for (slot of thumbSlots(); track $index) {
                <button
                  type="button"
                  (click)="openLightbox(slot.index)"
                  [disabled]="!slot.image"
                  [attr.class]="
                    'hidden md:block relative overflow-hidden group cursor-pointer border-0 p-0 ' +
                    slot.corner + ' bg-gradient-to-br ' + gradients[slot.index % gradients.length]
                  "
                  [attr.aria-label]="'View photo ' + (slot.index + 1) + ': ' + slotAlt(p, slot.index)"
                >
                  @if (slot.image) {
                    <img
                      [src]="slot.image.url"
                      [alt]="slotAlt(p, slot.index)"
                      loading="lazy"
                      class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <span class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300"></span>
                  }
                </button>
              }
            </div>

            <div class="absolute bottom-4 right-4 z-10">
              <button
                type="button"
                (click)="openLightbox(0)"
                class="glass-button inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-white"
              >
                <app-icon name="maximize-2" class="h-4 w-4 shrink-0" />
                {{ viewAllLabel(p.images.length) }}
              </button>
            </div>
          </section>
        }

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          <nav class="text-sm text-slate-500 dark:text-white/50 mb-4 inline-flex items-center gap-2">
            <a [routerLink]="['/', culture.culture()]" class="hover:text-brand-600 dark:hover:text-brand-400">{{
              'common.rent' | transloco
            }}</a>
            <span class="opacity-50">/</span>
            <a
              [routerLink]="['/', culture.culture(), p.citySlug]"
              class="hover:text-brand-600 dark:hover:text-brand-400"
              >{{ p.city }}</a
            >
            <span class="opacity-50">/</span>
            <span class="text-slate-700 dark:text-white/80 truncate max-w-[40ch]">{{ p.title }}</span>
          </nav>

          <!--
            El banner de promocion, con el mismo peso visual que en el origen: una promocion de
            mudanza es un argumento de venta y aqui quedaba como una nota al margen. El
            antetitulo (detail.specialOffer) estaba traducido y sin usar.
          -->
          @if (p.activeSpecial; as special) {
            <section
              class="relative overflow-hidden rounded-2xl border border-orange-300/60 dark:border-orange-500/30 bg-gradient-to-r from-amber-400/90 via-orange-500/90 to-rose-500/90 p-5 text-white shadow-lg shadow-orange-500/30 my-6"
            >
              <div class="absolute inset-0 opacity-20 mix-blend-overlay" aria-hidden="true">
                <div class="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-white/40 blur-2xl"></div>
                <div class="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-yellow-200/60 blur-2xl"></div>
              </div>
              <div class="relative flex items-start gap-4">
                <div class="shrink-0 h-10 w-10 rounded-xl bg-white/25 backdrop-blur-sm flex items-center justify-center">
                  <app-icon name="sparkles" class="h-5 w-5" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[11px] uppercase tracking-widest font-semibold text-white/85">
                    {{ 'detail.specialOffer' | transloco }}
                  </div>
                  <div class="text-lg sm:text-xl font-bold leading-tight mt-0.5">{{ special.title }}</div>
                  @if (special.description) {
                    <p class="mt-1 text-sm text-white/90 whitespace-pre-line">{{ special.description }}</p>
                  }
                </div>
              </div>
            </section>
          }

          <section class="grid lg:grid-cols-[1fr_400px] gap-8 mt-2">
            <article class="space-y-6 min-w-0">
              <header>
                <div class="flex items-start justify-between gap-3">
                  <h1 class="font-sans font-bold tracking-tight text-3xl md:text-4xl text-slate-900 dark:text-white">
                    {{ p.title }}
                  </h1>
                  <div class="flex items-center gap-2 shrink-0">
                    <app-favorite-button
                      variant="detail"
                      [propertyId]="p.id"
                      [initialFavorited]="p.isFavorited"
                    />
                    <!--
                      Compartir el anuncio: API nativa donde exista (movil) y copiar el enlace
                      donde no. Estaba traducido en los dos idiomas y sin construir.
                    -->
                    <button
                      type="button"
                      (click)="shareListing(p.title)"
                      [attr.aria-label]="shareLabel()"
                      [attr.title]="shareLabel()"
                      class="h-11 w-11 inline-flex items-center justify-center rounded-full bg-white/80 dark:bg-slate-900/60 backdrop-blur-md text-slate-700 dark:text-white/80 hover:text-brand-500 hover:scale-110 transition-all duration-200 shadow-sm border border-gray-200 dark:border-white/10"
                    >
                      <app-icon name="share-2" class="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <p class="text-slate-600 dark:text-white/60 mt-2 inline-flex items-start gap-1.5">
                  <app-icon name="map-pin" class="h-4 w-4 mt-1 shrink-0 text-brand-500" />
                  <span>{{ addressLine(p) }}</span>
                </p>
                <div class="flex flex-wrap gap-2 mt-4">
                  @if (p.tier === 'Featured') {
                    <span
                      class="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md shadow-lg shadow-amber-500/40"
                    >
                      <app-icon name="sparkles" class="h-3 w-3" /> {{ 'detail.featured' | transloco }}
                    </span>
                  } @else if (p.tier === 'Promoted') {
                    <span
                      class="inline-flex items-center gap-1 bg-gradient-to-r from-brand-500 to-cyan-500 text-white text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md"
                    >
                      <app-icon name="arrow-right" class="h-3 w-3" /> {{ 'detail.promoted' | transloco }}
                    </span>
                  }
                  <span class="glass-badge inline-flex items-center gap-1">
                    <app-icon name="home" class="h-3.5 w-3.5" />
                    {{ typeLabel(p.propertyType) }}
                  </span>
                  @if (p.petsAllowed) {
                    <span class="glass-badge inline-flex items-center gap-1">
                      <app-icon name="dog" class="h-3.5 w-3.5" /> {{ 'detail.petFriendly' | transloco }}
                    </span>
                  }
                  @if (p.furnished) {
                    <span class="glass-badge inline-flex items-center gap-1">
                      <app-icon name="sofa" class="h-3.5 w-3.5" /> {{ 'detail.furnishedLabel' | transloco }}
                    </span>
                  }
                  @if (p.isVerified) {
                    <span class="glass-badge inline-flex items-center gap-1">
                      <app-icon name="check" class="h-3.5 w-3.5" /> {{ 'detail.verified' | transloco }}
                    </span>
                  }
                </div>
              </header>

              <div class="glass-card p-2" role="tablist" [attr.aria-label]="'detail.tablistLabel' | transloco">
                <div class="flex gap-1">
                  @for (tab of tabs; track tab.id) {
                    <button
                      type="button"
                      role="tab"
                      (click)="activeTab.set(tab.id)"
                      [attr.aria-selected]="activeTab() === tab.id"
                      [attr.class]="
                        'flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-colors inline-flex items-center justify-center gap-2 ' +
                        (activeTab() === tab.id
                          ? 'bg-brand-500 text-white'
                          : 'text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white')
                      "
                    >
                      <app-icon [name]="tab.icon" class="h-4 w-4 shrink-0" />
                      {{ tab.key | transloco }}
                    </button>
                  }
                </div>
              </div>

              @switch (activeTab()) {
                @case ('floorplans') {
                  @if (p.units.length === 0) {
                    <section class="glass-card p-6 text-center text-sm text-slate-500 dark:text-white/50">
                      {{ 'detail.noFloorPlans' | transloco }}
                    </section>
                  } @else {
                    <section class="glass-card p-6">
                      <h2 class="font-semibold text-slate-900 dark:text-white mb-4">
                        {{ 'detail.availableUnits' | transloco }}
                      </h2>
                      <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                          <thead>
                            <tr class="text-left text-slate-500 dark:text-white/50 text-xs uppercase tracking-wider">
                              <th class="py-2 pr-4">{{ 'detail.unitPlan' | transloco }}</th>
                              <th class="py-2 pr-4">{{ 'detail.unitBeds' | transloco }}</th>
                              <th class="py-2 pr-4">{{ 'detail.unitBaths' | transloco }}</th>
                              <th class="py-2 pr-4">{{ 'detail.unitSqFt' | transloco }}</th>
                              <th class="py-2 pr-4">{{ 'detail.unitPrice' | transloco }}</th>
                              <th class="py-2 pr-4">{{ 'detail.unitAvailability' | transloco }}</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-gray-200 dark:divide-white/10">
                            @for (u of p.units; track u.id) {
                              <tr
                                [attr.class]="
                                  'text-slate-800 dark:text-white/90 ' + (u.availableUnits <= 0 ? 'opacity-60' : '')
                                "
                              >
                                <td class="py-3 pr-4 font-medium">{{ unitName(u.name, u.bedrooms) }}</td>
                                <td class="py-3 pr-4">
                                  {{ u.bedrooms === 0 ? ('listings.beds.studio' | transloco) : u.bedrooms }}
                                </td>
                                <td class="py-3 pr-4">{{ u.bathrooms }}</td>
                                <td class="py-3 pr-4">{{ sqFtLabel(u.sqFt) }}</td>
                                <td class="py-3 pr-4 font-semibold text-brand-600 dark:text-brand-400">
                                  {{ unitPrice(u.price, u.priceMax) }}{{ 'listings.perMonth' | transloco }}
                                </td>
                                <td class="py-3 pr-4">
                                  @if (u.availableUnits <= 0) {
                                    <span
                                      class="inline-flex items-center rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/50 px-2 py-0.5 text-xs"
                                      >{{ 'detail.unavailable' | transloco }}</span
                                    >
                                  } @else {
                                    <span class="text-slate-600 dark:text-white/60">{{
                                      availableLabel(u.availableDate)
                                    }}</span>
                                  }
                                </td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                    </section>
                  }
                }

                @case ('amenities') {
                  @if (amenityGroups().length) {
                    <section class="glass-card p-6">
                      <h2 class="font-semibold text-slate-900 dark:text-white mb-4">
                        {{ 'detail.amenities' | transloco }}
                      </h2>
                      <div class="space-y-4">
                        @for (group of amenityGroups(); track group.key) {
                          <div>
                            <div class="text-xs uppercase tracking-wider text-slate-500 dark:text-white/50 mb-2">
                              {{ catLabel(group.key) }}
                            </div>
                            <div class="flex flex-wrap gap-2">
                              @for (a of group.items; track a.id) {
                                <span class="glass-badge">{{ a.name }}</span>
                              }
                            </div>
                          </div>
                        }
                      </div>
                    </section>
                  } @else {
                    <section class="glass-card p-6 text-center text-sm text-slate-500 dark:text-white/50">
                      {{ 'detail.noAmenities' | transloco }}
                    </section>
                  }
                }

                @case ('about') {
                  <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                    @for (fact of facts(); track fact.label) {
                      <div class="glass-card p-4 flex items-center gap-3">
                        <div
                          class="h-9 w-9 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0"
                        >
                          <app-icon [name]="fact.icon" class="h-4 w-4" />
                        </div>
                        <div class="min-w-0">
                          <div class="text-xs text-slate-500 dark:text-white/50">{{ fact.label }}</div>
                          <div class="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {{ fact.value }}
                          </div>
                        </div>
                      </div>
                    }
                  </div>

                  <section class="glass-card p-6 mt-4">
                    <h2 class="font-semibold text-slate-900 dark:text-white mb-3">
                      {{ 'detail.aboutListing' | transloco }}
                    </h2>
                    <p class="text-slate-700 dark:text-white/80 whitespace-pre-line">{{ description() }}</p>
                  </section>

                  @if (p.latitude !== null && p.longitude !== null) {
                    <section class="glass-card p-6 mt-4">
                      <h2
                        class="font-semibold text-slate-900 dark:text-white mb-3 inline-flex items-center gap-2"
                      >
                        <app-icon name="map-pin" class="h-4 w-4 text-brand-500" />
                        {{ 'detail.locationLabel' | transloco }}
                      </h2>
                      <!--
                        El mapa solo se monta en el NAVEGADOR: el API de Google necesita document.
                        Hoy la guarda no llega a evitar nada —esta pestaña arranca cerrada, asi que
                        su contenido no se renderiza en servidor— pero es lo que sostiene esa
                        propiedad: sin ella, hacer que la pestaña activa viniera de la URL tumbaria
                        el render del servidor, y el fallo no se pareceria en nada a la causa.
                        No hace falta hueco de reserva: nada de esto existe antes de hidratar.
                      -->
                      @if (isBrowser) {
                        <app-listing-map [lat]="p.latitude" [lng]="p.longitude" [title]="p.title" />
                      }
                      <p class="text-xs text-slate-500 dark:text-white/50 mt-2">
                        {{ 'detail.locationApprox' | transloco }}
                      </p>
                    </section>
                  }
                }
              }
            </article>

            <aside class="lg:sticky lg:top-24 h-fit space-y-4">
              <div class="glass-card p-6">
                @if (minPrice(); as price) {
                  <div class="mb-4 pb-4 border-b border-gray-200 dark:border-white/10">
                    <div class="text-xs uppercase tracking-wider text-slate-500 dark:text-white/50">
                      {{ 'detail.fromLabel' | transloco }}
                    </div>
                    <div class="font-sans font-bold tracking-tight text-3xl text-slate-900 dark:text-white">
                      {{ price }}<span class="text-base text-slate-500 dark:text-white/50">{{
                        'listings.perMonth' | transloco
                      }}</span>
                    </div>
                  </div>
                }

                <h2 class="font-semibold text-slate-900 dark:text-white mb-3">
                  {{ 'detail.contactLandlordTitle' | transloco }}
                </h2>

                @if (inquirySent()) {
                  <div
                    role="status"
                    class="p-3 rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10 text-sm text-emerald-700 dark:text-emerald-300"
                  >
                    {{ 'detail.inquirySent' | transloco }}
                  </div>
                } @else {
                  <form class="space-y-3" [formGroup]="inquiryForm" (ngSubmit)="submitInquiry(p.id)">
                    @for (message of inquiryErrors(); track message) {
                      <p role="alert" class="text-sm text-red-600 dark:text-red-400">{{ message }}</p>
                    }
                    <!--
                      Etiquetas VISIBLES, no solo placeholder. El origen las tiene y no es
                      cosmetico: un placeholder desaparece al escribir, asi que quien vuelve a
                      revisar el formulario ya no sabe que pedia cada casilla, y los lectores de
                      pantalla no lo anuncian de forma fiable.
                    -->
                    <div>
                      <label for="inq-name" class="block text-xs font-medium text-slate-600 dark:text-white/60 mb-1">
                        {{ 'detail.formName' | transloco }} *
                      </label>
                      <input
                        id="inq-name"
                        class="glass-input"
                        formControlName="senderName"
                        [placeholder]="'detail.formName' | transloco"
                        autocomplete="name"
                        required
                      />
                    </div>
                    <div>
                      <!-- La etiqueta es auth.email ("Email"), la misma que usa el origen aqui.
                           detail.formEmail ("Your email") es el texto del marcador. -->
                      <label for="inq-email" class="block text-xs font-medium text-slate-600 dark:text-white/60 mb-1">
                        {{ 'auth.email' | transloco }} *
                      </label>
                      <input
                        id="inq-email"
                        class="glass-input"
                        type="email"
                        formControlName="senderEmail"
                        [placeholder]="'auth.emailPlaceholder' | transloco"
                        autocomplete="email"
                        required
                      />
                    </div>
                    <div>
                      <label for="inq-phone" class="block text-xs font-medium text-slate-600 dark:text-white/60 mb-1">
                        {{ 'detail.formPhone' | transloco }}
                      </label>
                      <input
                        id="inq-phone"
                        class="glass-input"
                        type="tel"
                        formControlName="senderPhone"
                        [placeholder]="'detail.formPhone' | transloco"
                        autocomplete="tel"
                      />
                    </div>
                    <!--
                      La fecha de mudanza faltaba entera. No era solo un hueco visual: la API la
                      acepta (InquiryRequest.MoveInDate) y el portal del propietario la PINTA en
                      la bandeja, asi que hasta ahora esa columna llegaba siempre vacia.
                    -->
                    <div>
                      <label for="inq-movein" class="block text-xs font-medium text-slate-600 dark:text-white/60 mb-1">
                        {{ 'detail.formMoveIn' | transloco }}
                      </label>
                      <input
                        id="inq-movein"
                        class="glass-input"
                        type="date"
                        formControlName="moveInDate"
                        [min]="today"
                      />
                    </div>
                    <div>
                      <label for="inq-message" class="block text-xs font-medium text-slate-600 dark:text-white/60 mb-1">
                        {{ 'detail.formMessage' | transloco }} *
                      </label>
                      <textarea
                        id="inq-message"
                        class="glass-input min-h-[110px]"
                        formControlName="message"
                        [placeholder]="'detail.formMessagePlaceholder' | transloco"
                        required
                      ></textarea>
                    </div>
                    <button
                      type="submit"
                      [disabled]="inquirySending()"
                      class="glass-button-primary w-full py-2.5 text-sm font-semibold disabled:opacity-60"
                    >
                      {{ 'detail.sendMessage' | transloco }}
                    </button>
                  </form>
                }

                <!--
                  El asistente ya SABE que ficha esta abierta (aiContext.setProperty en el
                  constructor), pero no habia nada que lo dijera: el boton flotante no anuncia
                  que tiene contexto. Esta es la puerta que el origen si tiene.
                  OJO: sin comillas de ningun tipo aqui dentro — un backtick en un comentario
                  cierra la plantilla en linea y el error sale a decenas de lineas de distancia.
                -->
                <button
                  type="button"
                  (click)="askAiAboutListing()"
                  class="glass-button w-full mt-3 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2"
                >
                  <app-icon name="sparkles" class="h-4 w-4" />
                  <span>{{ 'detail.askAi' | transloco }}</span>
                </button>
              </div>

              @if (p.landlord; as landlord) {
                <div class="glass-card p-6">
                  <div class="text-xs uppercase tracking-wider text-slate-500 dark:text-white/50 mb-3">
                    {{ 'detail.managedBy' | transloco }}
                  </div>
                  <div class="flex items-center gap-3">
                    <div
                      class="h-11 w-11 rounded-full bg-brand-500/15 border border-brand-400/30 flex items-center justify-center shrink-0"
                    >
                      <app-icon name="building-2" class="h-5 w-5 text-brand-600 dark:text-brand-400" />
                    </div>
                    <div class="min-w-0">
                      <p class="font-semibold text-slate-900 dark:text-white truncate">
                        {{ landlord.companyName ?? ('detail.privateLandlord' | transloco) }}
                      </p>
                      @if (landlord.isVerified) {
                        <span class="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <app-icon name="shield-check" class="h-3 w-3" />
                          {{ 'detail.verified' | transloco }}
                        </span>
                      }
                    </div>
                  </div>
                  <a
                    [routerLink]="['/', culture.culture(), p.citySlug]"
                    class="glass-button w-full inline-flex items-center justify-center gap-2 py-2.5 mt-4 text-sm"
                  >
                    {{ viewAllInLabel(p.city) }}
                  </a>
                </div>
              }

              <!--
                Alta de alerta desde la ficha, como en el origen. El parametro showForm=true abre
                el formulario ya desplegado al llegar, en vez de dejar al visitante frente a una
                lista vacia sin saber que hacer.
              -->
              <a
                [routerLink]="['/', culture.culture(), 'renter', 'alerts']"
                [queryParams]="{ showForm: true }"
                class="glass-card p-5 flex items-center gap-4 hover:border-brand-400/40 transition-colors duration-200"
              >
                <div
                  class="h-10 w-10 rounded-full bg-brand-500/15 border border-brand-400/30 flex items-center justify-center shrink-0"
                >
                  <app-icon name="bell" class="h-5 w-5 text-brand-600 dark:text-brand-400" />
                </div>
                <div class="min-w-0">
                  <p class="font-semibold text-slate-900 dark:text-white">{{ 'detail.setUpAlert' | transloco }}</p>
                  <p class="text-sm text-slate-600 dark:text-white/60">{{ 'detail.getNotified' | transloco }}</p>
                </div>
              </a>
            </aside>
          </section>

          @if (p.similarListings.length) {
            <section class="mt-16 sm:mt-24" aria-labelledby="similar-heading">
              <div class="flex items-end justify-between mb-8">
                <div>
                  <p class="text-sm font-medium text-brand-600 dark:text-brand-400 uppercase tracking-widest mb-2">
                    {{ 'detail.youMayAlsoLike' | transloco }}
                  </p>
                  <h2
                    id="similar-heading"
                    class="font-sans font-bold tracking-tight text-3xl sm:text-4xl text-slate-900 dark:text-white"
                  >
                    {{ 'detail.similarRentals' | transloco }}
                  </h2>
                </div>
                <div class="hidden sm:flex items-center gap-2">
                  <button
                    type="button"
                    (click)="scrollSimilar(-1)"
                    class="h-10 w-10 rounded-full flex items-center justify-center glass-button text-slate-600 dark:text-white"
                    aria-label="Scroll left"
                  >
                    <app-icon name="chevron-left" class="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    (click)="scrollSimilar(1)"
                    class="h-10 w-10 rounded-full flex items-center justify-center glass-button text-slate-600 dark:text-white"
                    aria-label="Scroll right"
                  >
                    <app-icon name="chevron-right" class="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div
                #similarTrack
                class="flex gap-5 overflow-x-auto scroll-smooth pb-4 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="list"
              >
                @for (card of p.similarListings; track card.id) {
                  <div role="listitem" class="snap-start min-w-[280px] sm:min-w-[320px] max-w-[320px] flex-shrink-0">
                    <app-property-card [item]="card" />
                  </div>
                }
              </div>
            </section>
          }
        </div>

        <!-- Lightbox -->
        @if (lightboxIndex() !== null) {
          <div
            class="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-4"
            role="dialog"
            aria-modal="true"
            (click)="closeLightbox()"
          >
            <button
              type="button"
              (click)="closeLightbox()"
              class="absolute top-4 right-4 h-11 w-11 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/20 text-white"
              [attr.aria-label]="'gallery.close' | transloco"
            >
              <app-icon name="x" class="h-5 w-5" />
            </button>
            <div class="relative w-full max-w-5xl aspect-video" (click)="$event.stopPropagation()">
              <img
                [src]="p.images[lightboxIndex()!].url"
                [alt]="p.images[lightboxIndex()!].altText ?? p.title"
                class="w-full h-full object-contain rounded-2xl"
              />
              <button
                type="button"
                (click)="moveLightbox(-1)"
                class="absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/20 text-white"
                [attr.aria-label]="'gallery.previous' | transloco"
              >
                <app-icon name="chevron-left" class="h-6 w-6" />
              </button>
              <button
                type="button"
                (click)="moveLightbox(1)"
                class="absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/20 text-white"
                [attr.aria-label]="'gallery.next' | transloco"
              >
                <app-icon name="chevron-right" class="h-6 w-6" />
              </button>
              <div class="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
                <span class="glass-badge text-white/80 text-xs"
                  >{{ lightboxIndex()! + 1 }} / {{ p.images.length }}</span
                >
              </div>
            </div>
          </div>
        }
      }
    } @else {
      <div class="max-w-7xl mx-auto px-4 py-12">
        <p class="text-gray-500 dark:text-white/60">{{ 'common.loading' | transloco }}</p>
      </div>
    }
  `,
})
export class ListingDetailPage {
  private readonly api = inject(ApiService);
  private readonly inquiries = inject(InquiriesService);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);
  protected readonly culture = inject(CultureService);
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly similarTrack = viewChild<ElementRef<HTMLElement>>('similarTrack');

  protected readonly inquiryForm = this.fb.nonNullable.group({
    senderName: ['', Validators.required],
    senderEmail: ['', [Validators.required, Validators.email]],
    senderPhone: [''],
    moveInDate: [''],
    message: ['', [Validators.required, Validators.minLength(10)]],
  });

  /**
   * Tope inferior del selector de fecha. La API rechaza una mudanza anterior a ayer
   * (`InquiryRequestValidator`), asi que el navegador no debe dejar elegirla siquiera: es
   * mejor no ofrecer una opcion que devolver un error despues de rellenar todo.
   */
  protected readonly today = new Date().toISOString().slice(0, 10);

  protected readonly inquirySending = signal(false);
  protected readonly inquirySent = signal(false);
  protected readonly inquiryErrors = signal<string[]>([]);

  private readonly aiContext = inject(AiContextService);
  private readonly seo = inject(SeoService);
  private readonly siteUrl = inject(SITE_BASE_URL);

  constructor() {
    // El asistente necesita saber que ficha esta abierta para poder explicarla (get_property_details).
    // Se limpia al salir: si no, el chat seguiria creyendo que el usuario mira este piso.
    effect(() => this.aiContext.setProperty(this.listing()?.id ?? null));
    inject(DestroyRef).onDestroy(() => this.aiContext.setProperty(null));

    effect(() => this.applySeo());

    // El mensaje llega escrito, como en el origen: el visitante solo tiene que pulsar enviar.
    // Se rehace si cambia de ficha o de idioma, pero NO pisa lo que el usuario haya escrito.
    effect(() => {
      const p = this.listing();
      const plantilla = this.prefillTemplate();
      if (!p || p.id === '') return;
      const control = this.inquiryForm.controls.message;
      if (control.dirty) return;
      control.setValue(formatTemplate(plantilla, p.title));
    });
  }

  /** Texto del boton de compartir; pasa a "enlace copiado" un instante tras copiar. */
  protected readonly shareCopied = signal(false);
  protected readonly shareLabel = computed(() =>
    this.transloco.translate(this.shareCopied() ? 'detail.linkCopied' : 'detail.share'),
  );

  /** Se lee como señal para que el mensaje prellenado se rehaga al cambiar de idioma. */
  private readonly prefillTemplate = computed(() => {
    this.culture.culture();
    return this.transloco.translate('detail.prefillMessage');
  });

  /**
   * Compartir: API nativa donde exista (movil), copiar el enlace donde no. Si el navegador no
   * ofrece ninguna de las dos, el boton no hace nada — igual que en el origen.
   */
  protected async shareListing(title: string): Promise<void> {
    if (!this.isBrowser) return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // El usuario cancelo el dialogo del sistema: no es un error que contar.
      }
      return;
    }
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(url);
      this.shareCopied.set(true);
      setTimeout(() => this.shareCopied.set(false), 1500);
    } catch {
      // Sin permiso de portapapeles no hay nada que hacer.
    }
  }

  /**
   * `<head>` de la ficha. Es la pagina que mas importa del sitio: es la que la gente busca y
   * la unica con datos estructurados completos.
   */
  private applySeo(): void {
    const p = this.listing();
    if (!p) return;

    const t = (key: string) => this.transloco.translate(key);

    if (p.id === '') {
      // Existe pero no describe nada: el titulo en ingles es el literal del origen. Se marca
      // noindex para que un slug caducado no siga vivo en el indice como pagina de error.
      this.seo.apply({ title: 'Listing not found', noIndex: true });
      return;
    }

    const culture = this.culture.culture();
    const description = toMetaDescription(
      this.description(),
      formatTemplate(t('seo.description.listing'), this.typeLabel(p.propertyType), p.city, p.province),
    );

    // La portada es la que la galeria pinta primero, no forzosamente la marcada como primary:
    // la tarjeta social debe ensenar la misma foto que el visitante ve al llegar.
    const cover = p.images[0]?.url ?? null;

    this.seo.apply({
      title: p.title,
      description,
      image: cover,
      type: 'article',
      jsonLd: [
        listingJsonLd(this.siteUrl, culture, p, description),
        breadcrumbJsonLd([
          { name: t('common.rent'), url: `${this.siteUrl}/${culture}` },
          { name: p.city, url: `${this.siteUrl}/${culture}/${p.citySlug}` },
          { name: p.title, url: `${this.siteUrl}/${culture}/${p.citySlug}/${p.slug}` },
        ]),
      ],
    });
  }

  protected submitInquiry(propertyId: string): void {
    if (this.inquiryForm.invalid || this.inquirySending()) {
      this.inquiryForm.markAllAsTouched();
      return;
    }

    this.inquirySending.set(true);
    this.inquiryErrors.set([]);

    const { senderName, senderEmail, senderPhone, moveInDate, message } = this.inquiryForm.getRawValue();

    this.inquiries
      .submit({
        propertyId,
        senderName,
        senderEmail,
        senderPhone: senderPhone || null,
        message,
        // Iba fijo a `null`: el campo no existia en el formulario aunque la API lo acepta y la
        // bandeja del propietario lo pinta. La columna llegaba siempre vacia.
        moveInDate: moveInDate || null,
        culture: this.culture.culture(),
      })
      .subscribe({
        next: () => {
          this.inquirySending.set(false);
          // El formulario se sustituye por el acuse de recibo, como en el origen: dejarlo a
          // la vista invita a mandar la misma consulta dos veces.
          this.inquirySent.set(true);
        },
        error: (error: unknown) => {
          this.inquirySending.set(false);
          this.inquiryErrors.set(this.toMessages(error));
        },
      });
  }

  /**
   * La API devuelve CLAVES de traduccion en el titulo de sus problemas —no sabe en que idioma
   * esta la pantalla— y mensajes literales en los errores por campo, igual que el origen. Se
   * intenta traducir cada uno y lo que no sea una clave conocida se muestra tal cual.
   */
  private toMessages(error: unknown): string[] {
    const errors = toFieldErrors(error, 'Could not send your inquiry. Please try again.');
    return Object.values(errors)
      .flat()
      .map((message) => {
        const translated = this.transloco.translate(message);
        return translated === message ? message : translated;
      });
  }

  protected readonly gradients = GALLERY_GRADIENTS;
  protected readonly activeTab = signal<Tab>('floorplans');
  protected readonly lightboxIndex = signal<number | null>(null);

  protected readonly tabs: { id: Tab; icon: string; key: string }[] = [
    { id: 'floorplans', icon: 'layout-grid', key: 'detail.floorPlans' },
    { id: 'amenities', icon: 'sparkles', key: 'detail.amenities' },
    { id: 'about', icon: 'info', key: 'detail.tabAbout' },
  ];

  private readonly params = toSignal(
    this.route.paramMap.pipe(
      map((p) => ({ citySlug: p.get('citySlug') ?? '', propertySlug: p.get('propertySlug') ?? '' })),
    ),
    { initialValue: null },
  );

  protected readonly listing = toSignal(
    toObservable(this.params).pipe(
      switchMap((p) =>
        p?.citySlug && p.propertySlug
          ? this.api.getListing(p.citySlug, p.propertySlug).pipe(catchError(() => of(NOT_FOUND)))
          : of(null),
      ),
    ),
    { initialValue: null },
  );

  protected readonly thumbSlots = computed(() => {
    const images = this.listing()?.images ?? [];
    // Siempre 4 huecos: el mosaico del origen mantiene la retícula aunque falten fotos.
    return [0, 1, 2, 3].map((i) => ({
      index: i + 1,
      image: images[i + 1] ?? null,
      corner: i === 1 ? 'rounded-tr-2xl' : i === 3 ? 'rounded-br-2xl' : '',
    }));
  });

  protected readonly minPrice = computed(() => {
    const units = this.listing()?.units ?? [];
    if (!units.length) return null;
    return formatPrice(Math.min(...units.map((u) => u.price)));
  });

  protected readonly amenityGroups = computed(() => {
    const amenities = this.listing()?.amenities ?? [];
    const groups = new Map<string, Amenity[]>();

    for (const a of amenities) {
      const key = (a.category ?? 'other').trim().toLowerCase();
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }

    return [...groups.entries()]
      .map(([key, items]) => ({ key, items }))
      .sort((a, b) => (CAT_ORDER[a.key] ?? 99) - (CAT_ORDER[b.key] ?? 99) || a.key.localeCompare(b.key));
  });

  protected readonly facts = computed(() => {
    const p = this.listing();
    if (!p) return [];

    const t = (k: string) => this.transloco.translate(k);
    const list: { icon: string; label: string; value: string }[] = [
      { icon: 'home', label: t('detail.factType'), value: this.typeLabel(p.propertyType) },
    ];
    if (p.totalUnits) list.push({ icon: 'building-2', label: t('detail.factUnits'), value: String(p.totalUnits) });
    list.push({ icon: 'map-pin', label: t('detail.factProvince'), value: p.province });
    if (p.parkingType) list.push({ icon: 'car', label: t('detail.factParking'), value: p.parkingType });
    if (p.leaseTerm) list.push({ icon: 'calendar', label: t('detail.factLeaseTerm'), value: t(LEASE_KEYS[p.leaseTerm]) });
    if (p.yearBuilt) list.push({ icon: 'building', label: t('detail.factYearBuilt'), value: String(p.yearBuilt) });
    return list;
  });

  /** En frances se prefiere DescriptionFr si existe, igual que el origen. */
  protected readonly description = computed(() => {
    const p = this.listing();
    if (!p) return '';
    return this.culture.culture() === 'fr' && p.descriptionFr ? p.descriptionFr : (p.description ?? '');
  });

  protected typeLabel(type: PropertyType): string {
    const key = TYPE_KEYS[type];
    return key ? this.transloco.translate(key) : type;
  }

  protected catLabel(key: string): string {
    const k = CAT_KEYS[key];
    return k ? this.transloco.translate(k) : key;
  }

  protected addressLine(p: ListingDetail): string {
    const parts = [p.streetAddress, p.neighbourhood, `${p.city}, ${p.province} ${p.postalCode}`].filter(Boolean);
    return parts.join(', ');
  }

  protected slotAlt(p: ListingDetail, index: number): string {
    const img = p.images[index];
    if (img?.altText) return img.altText;
    return index === 0 ? `${p.title} — main photo` : `${p.title} — photo ${index + 1}`;
  }

  protected unitName(name: string | null, bedrooms: number): string {
    if (name) return name;
    return bedrooms === 0 ? this.transloco.translate('listings.beds.studio') : `${bedrooms} BR`;
  }

  protected unitPrice(price: number, priceMax: number | null): string {
    return priceMax ? `${formatPrice(price)}-${formatPrice(priceMax).slice(1)}` : formatPrice(price);
  }

  /**
   * Fecha de disponibilidad de una unidad. El origen la pinta con
   * `AvailableDate?.ToString("MMM d, yyyy")`; aqui salia el ISO en crudo ("2026-08-29"),
   * que ademas ignoraba el idioma. `formatLongDate` ya existia y se usa igual en el portal
   * del propietario y en las consultas del inquilino.
   */
  protected availableLabel(date: string | null | undefined): string {
    return date ? formatLongDate(date, this.culture.culture()) : this.transloco.translate('detail.now');
  }

  /** Los miles tampoco pueden ir con `en-CA` fijo: en frances el separador es distinto. */
  protected sqFtLabel(sqFt: number | null | undefined): string {
    return sqFt ? sqFt.toLocaleString(this.culture.culture() === 'fr' ? 'fr-CA' : 'en-CA') : '—';
  }

  /** Abre el asistente, que ya tiene esta ficha como contexto. */
  protected askAiAboutListing(): void {
    this.aiContext.requestOpen();
  }

  protected viewAllLabel(count: number): string {
    return formatTemplate(this.transloco.translate('gallery.viewAll'), count);
  }

  protected viewAllInLabel(city: string): string {
    return formatTemplate(this.transloco.translate('detail.viewAllIn'), city);
  }

  protected openLightbox(index: number): void {
    this.lightboxIndex.set(index);
  }

  protected closeLightbox(): void {
    this.lightboxIndex.set(null);
  }

  protected moveLightbox(delta: number): void {
    const total = this.listing()?.images.length ?? 0;
    if (!total) return;
    const current = this.lightboxIndex() ?? 0;
    this.lightboxIndex.set(((current + delta) % total + total) % total);
  }

  protected scrollSimilar(direction: 1 | -1): void {
    this.similarTrack()?.nativeElement.scrollBy({ left: direction * 320, behavior: 'smooth' });
  }
}

/** id vacio = la plantilla pinta el estado "listing no encontrado". */
const NOT_FOUND = { id: '' } as ListingDetail;
