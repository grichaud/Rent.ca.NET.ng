import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID,
  effect, inject, input, signal, viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ApiService, SearchFilters } from '../../core/api/api.service';
import { MapMarker } from '../../core/api/api.types';
import { CultureService } from '../../core/i18n/culture.service';
import {
  CANADA_CENTER, GoogleMapsLoader, PIN_PATH, baseMapOptions,
} from '../../core/maps/google-maps';
import { formatPrice } from '../../shared/format';
import { Icon } from '../../shared/ui/icon/icon';

/**
 * Sin clave configurada y con el script caido se muestra el MISMO mensaje, igual que el
 * origen: para quien mira la pantalla la diferencia no existe, y distinguirlas obligaria a
 * inventar una clave de traduccion — que desapareceria al regenerar `translations.ts` desde
 * los `.resx`.
 */
type Estado = 'cargando' | 'listo' | 'error';

/**
 * Mapa de resultados de una ciudad. Port de `initSearchMap` de `wwwroot/js/maps.js`.
 *
 * Cierra la ultima deuda funcional de la Fase 5: hasta ahora la vista de mapa pintaba un hueco
 * con las dimensiones correctas para no romper el layout de dos columnas.
 *
 * El componente **solo existe en el navegador**. No se renderiza en servidor porque el API de
 * Google necesita `document`, y porque un mapa no aporta nada al buscador: lo que se indexa es
 * la lista de anuncios, que ya viaja en el HTML servido.
 */
@Component({
  selector: 'app-search-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, Icon],
  template: `
    <div class="relative h-full w-full">
      <div #canvas class="h-full w-full rounded-2xl overflow-hidden"></div>

      @if (estado() !== 'listo') {
        <!--
          Fondo OPACO a proposito. Cuando Google rechaza la clave ya ha pintado su propio
          cartel gris dentro del lienzo; un aviso transparente se leeria encima del suyo.
        -->
        <div
          class="absolute inset-0 z-10 flex items-center justify-center text-center p-8 bg-white dark:bg-slate-900 text-slate-500 dark:text-white/50"
        >
          <div>
            <app-icon name="map" class="h-10 w-10 mx-auto mb-3 opacity-60" />
            <p class="text-sm">
              {{ (estado() === 'cargando' ? 'common.loading' : 'map.couldNotLoad') | transloco }}
            </p>
          </div>
        </div>
      }
    </div>
  `,
})
export class SearchMap {
  readonly citySlug = input.required<string>();
  readonly filters = input.required<SearchFilters>();

  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');

  private readonly api = inject(ApiService);
  private readonly maps = inject(GoogleMapsLoader);
  private readonly culture = inject(CultureService);
  private readonly transloco = inject(TranslocoService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly estado = signal<Estado>('cargando');

  private map: google.maps.Map | null = null;
  private infoWindow: google.maps.InfoWindow | null = null;
  private markers: google.maps.Marker[] = [];
  private clusterer: { clearMarkers?: () => void } | null = null;
  private stopWatchingTheme: (() => void) | null = null;
  private stopWatchingAuth: (() => void) | null = null;

  constructor() {
    // Un cambio de ciudad o de filtros re-dibuja los marcadores sobre el MISMO mapa: recrearlo
    // haria parpadear los mosaicos y perderia el encuadre en cada toque de un filtro.
    effect(() => {
      const citySlug = this.citySlug();
      const filters = this.filters();
      if (!this.isBrowser || !citySlug) return;
      void this.render(citySlug, filters);
    });

    // Si Google rechaza la clave (tipicamente porque esta restringida a otro dominio), el mapa
    // no lanza: se queda con el cartel gris de Google dentro de nuestra pagina. Se sustituye
    // por nuestro mensaje, que ademas esta traducido.
    this.stopWatchingAuth = this.maps.onAuthFailure(() => this.estado.set('error'));

    inject(DestroyRef).onDestroy(() => {
      this.stopWatchingTheme?.();
      this.stopWatchingAuth?.();
      this.clearMarkers();
    });
  }

  private async render(citySlug: string, filters: SearchFilters): Promise<void> {
    try {
      await this.maps.load();
    } catch {
      this.estado.set('error');
      return;
    }

    if (!this.map) {
      this.map = new google.maps.Map(this.canvas().nativeElement, {
        ...baseMapOptions(this.maps.currentStyles()),
        center: CANADA_CENTER,
        zoom: 11,
        gestureHandling: 'greedy',
      });
      this.infoWindow = new google.maps.InfoWindow({ maxWidth: 260 });
      this.stopWatchingTheme = this.maps.onThemeChange(() =>
        this.map?.setOptions({ styles: this.maps.currentStyles() }),
      );
    }

    this.estado.set('listo');

    let markers: MapMarker[] = [];
    let cityCenter = CANADA_CENTER;
    try {
      const response = await this.api.getMapMarkers(citySlug, filters).toPromise();
      markers = response?.markers ?? [];
      if (response?.cityLat != null && response?.cityLng != null) {
        cityCenter = { lat: response.cityLat, lng: response.cityLng };
      }
    } catch {
      // El mapa ya esta pintado; quedarse sin marcadores es mejor que tirar la pantalla.
      this.clearMarkers();
      this.map.setCenter(cityCenter);
      return;
    }

    this.clearMarkers();

    if (markers.length === 0) {
      this.map.setCenter(cityCenter);
      this.map.setZoom(11);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    this.markers = markers.map((marker) => {
      const position = { lat: marker.lat, lng: marker.lng };
      bounds.extend(position);

      const pin = new google.maps.Marker({
        position,
        title: marker.title,
        icon: {
          path: PIN_PATH,
          // Los destacados en cian, el resto en el azul de marca. Igual que el origen.
          fillColor: marker.tier === 'Featured' ? '#06b6d4' : '#338dff',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 1.5,
          scale: 1.4,
          anchor: new google.maps.Point(12, 24),
        },
      });

      pin.addListener('click', () => {
        this.infoWindow?.setContent(this.popupHtml(marker));
        this.infoWindow?.open({ anchor: pin, map: this.map! });
      });

      return pin;
    });

    if (markers.length === 1) {
      this.map.setCenter(this.markers[0].getPosition()!);
      this.map.setZoom(14);
    } else {
      this.map.fitBounds(bounds, 60);
    }

    try {
      await this.maps.loadClusterer();
      const factory = window.markerClusterer?.MarkerClusterer;
      if (factory) {
        this.clusterer = new factory({ map: this.map, markers: this.markers }) as {
          clearMarkers?: () => void;
        };
        return;
      }
    } catch {
      // El CDN del agrupador no respondio.
    }
    // Sin agrupador, los marcadores se pintan sueltos. Se ve peor con muchos, pero se ve.
    for (const pin of this.markers) pin.setMap(this.map);
  }

  private clearMarkers(): void {
    this.clusterer?.clearMarkers?.();
    this.clusterer = null;
    for (const pin of this.markers) pin.setMap(null);
    this.markers = [];
    this.infoWindow?.close();
  }

  /**
   * Contenido de la burbuja. Va como HTML porque es lo unico que acepta `InfoWindow`.
   *
   * Todo lo que viene de la base pasa por `escape`: el titulo de un anuncio lo escribe un
   * propietario y aqui acabaria dentro del documento de otra persona.
   */
  private popupHtml(marker: MapMarker): string {
    const escape = (value: string | null | undefined) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    // CON prefijo de idioma. El origen enlaza a `/{citySlug}/{slug}`, que en su propio sitio es
    // un 404 porque sus rutas reales son `/{culture}/...` — el mismo fallo que ya se corrigio
    // en los enlaces del asistente (Fase 11).
    const url = `/${this.culture.culture()}/${marker.citySlug}/${marker.slug}`;

    const price = marker.fromPrice !== null
      ? `${formatPrice(marker.fromPrice)}<span style="font-size:12px;color:#64748b;">${escape(
          this.transloco.translate('listings.perMonth'),
        )}</span>`
      : '';

    const beds = marker.minBedrooms === 0
      ? this.transloco.translate('listings.beds.studio')
      : `${marker.minBedrooms}+`;

    const image = marker.primaryImageUrl
      ? `<img src="${escape(marker.primaryImageUrl)}" alt="" loading="lazy"
           style="width:100%;height:112px;object-fit:cover;border-radius:6px;margin-bottom:8px;" />`
      : '';

    return `<div style="min-width:220px;max-width:240px;font-family:Inter,system-ui,sans-serif;">
      <a href="${escape(url)}" style="text-decoration:none;color:inherit;display:block;">
        ${image}
        <div style="font-weight:600;color:#0f172a;line-height:1.2;margin-bottom:4px;">${escape(marker.title)}</div>
        <div style="font-size:18px;font-weight:700;color:#142857;line-height:1.1;">${price}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">${escape(beds)} &middot; ${escape(marker.propertyType)}</div>
      </a>
    </div>`;
  }
}
