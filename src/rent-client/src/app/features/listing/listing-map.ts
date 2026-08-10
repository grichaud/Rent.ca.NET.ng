import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID,
  effect, inject, input, signal, viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GoogleMapsLoader, PIN_PATH, baseMapOptions } from '../../core/maps/google-maps';
import { Icon } from '../../shared/ui/icon/icon';

/** Los mismos tres estados que el mapa de busqueda, y por la misma razon. */
type Estado = 'cargando' | 'listo' | 'error';

/**
 * Mapa de la FICHA: un solo pin sobre la direccion del anuncio. Port de `initDetailMap` de
 * `wwwroot/js/maps.js` del origen.
 *
 * Era la ultima pieza de paridad que quedaba sin registrar como deuda: se descubrio al portar
 * el mapa de busqueda.
 *
 * Comparte con `SearchMap` el cargador, el trazado del pin y las opciones base, pero NO su
 * comportamiento:
 *
 * - **`gestureHandling: 'cooperative'`**, no `'greedy'`. Este mapa vive en mitad de una pagina
 *   larga que se lee haciendo scroll; con `greedy` la rueda haria zoom al mapa en vez de bajar
 *   por la ficha, y el visitante se quedaria atrapado. El de busqueda ocupa su propia columna,
 *   asi que alli si manda el mapa. Es la misma distincion que hace el origen.
 * - **Sin agrupador de marcadores**: con un unico pin no hay nada que agrupar.
 * - **Encuadre fijo** (`zoom: 15` centrado en el piso), no `fitBounds`.
 */
@Component({
  selector: 'app-listing-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, Icon],
  template: `
    <div class="relative h-[320px] w-full">
      <div #canvas class="h-full w-full rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-800/40"></div>

      @if (estado() !== 'listo') {
        <!--
          Fondo OPACO: cuando Google rechaza la clave ya ha pintado su propio cartel gris dentro
          del lienzo, y un aviso transparente se leeria encima del suyo.
        -->
        <div
          class="absolute inset-0 z-10 flex items-center justify-center text-center p-6 rounded-xl bg-white dark:bg-slate-900 text-slate-500 dark:text-white/50"
        >
          <div>
            <app-icon name="map" class="h-8 w-8 mx-auto mb-2 opacity-60" />
            <p class="text-sm">
              {{ (estado() === 'cargando' ? 'common.loading' : 'map.couldNotLoad') | transloco }}
            </p>
          </div>
        </div>
      }
    </div>
  `,
})
export class ListingMap {
  readonly lat = input.required<number>();
  readonly lng = input.required<number>();
  readonly title = input<string>('');

  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');

  private readonly maps = inject(GoogleMapsLoader);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly estado = signal<Estado>('cargando');

  private map: google.maps.Map | null = null;
  private marker: google.maps.Marker | null = null;
  private stopWatchingTheme: (() => void) | null = null;
  private stopWatchingAuth: (() => void) | null = null;

  constructor() {
    effect(() => {
      const lat = this.lat();
      const lng = this.lng();
      const title = this.title();
      if (!this.isBrowser || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      void this.render({ lat, lng }, title);
    });

    // Google NO lanza cuando la clave esta restringida a otro dominio: el script carga con 200 y
    // el fallo llega despues por este gancho. Es el escenario mas probable de un despliegue nuevo.
    this.stopWatchingAuth = this.maps.onAuthFailure(() => this.estado.set('error'));

    inject(DestroyRef).onDestroy(() => {
      this.stopWatchingTheme?.();
      this.stopWatchingAuth?.();
      this.marker?.setMap(null);
      this.marker = null;
    });
  }

  private async render(position: google.maps.LatLngLiteral, title: string): Promise<void> {
    try {
      await this.maps.load();
    } catch {
      this.estado.set('error');
      return;
    }

    if (!this.map) {
      this.map = new google.maps.Map(this.canvas().nativeElement, {
        ...baseMapOptions(this.maps.currentStyles()),
        center: position,
        zoom: 15,
        gestureHandling: 'cooperative',
      });
      this.stopWatchingTheme = this.maps.onThemeChange(() =>
        this.map?.setOptions({ styles: this.maps.currentStyles() }),
      );
    } else {
      this.map.setCenter(position);
    }

    this.estado.set('listo');

    // Se reposiciona el pin en vez de recrearlo: si la ficha cambia de anuncio sin destruir el
    // componente, un marcador nuevo dejaria el anterior colgado en el mapa.
    if (this.marker) {
      this.marker.setPosition(position);
      this.marker.setTitle(title);
      return;
    }

    this.marker = new google.maps.Marker({
      map: this.map,
      position,
      title,
      icon: {
        // Gota en el azul de marca, igual que los marcadores del mapa de busqueda.
        path: PIN_PATH,
        fillColor: '#338dff',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 1.5,
        scale: 1.4,
        anchor: new google.maps.Point(12, 24),
      },
    });
  }
}
