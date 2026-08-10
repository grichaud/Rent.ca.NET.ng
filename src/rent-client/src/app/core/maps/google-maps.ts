import { DOCUMENT, Injectable, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../api/api.service';

/**
 * Carga perezosa del API de JavaScript de Google Maps.
 *
 * Se carga BAJO DEMANDA, solo cuando alguien abre un mapa. Es un script de terceros de varios
 * cientos de kilobytes: traerlo en todas las paginas para que lo use una minoria seria pagar
 * el peaje en la home, en las fichas y en el buscador, que es justo donde se mide el sitio.
 *
 * Nada de esto puede correr en el servidor: el script necesita `document` y `window`. Los
 * metodos comprueban la plataforma y en servidor no hacen nada.
 */

declare global {
  interface Window {
    google?: typeof google;
    markerClusterer?: { MarkerClusterer: new (options: object) => unknown };
    __rentcaMapsCallback?: () => void;
    /** Gancho de Google para fallos de autenticacion de la clave. Ver `onAuthFailure`. */
    gm_authFailure?: () => void;
  }
}

/** Version fijada, igual que el origen: un CDN sin version es codigo ajeno que cambia solo. */
const CLUSTERER_URL = 'https://unpkg.com/@googlemaps/markerclusterer@2.5.3/dist/index.min.js';

/**
 * Tema oscuro del mapa, portado del origen (que a su vez lo trajo del Next.js).
 *
 * Ojo: se aplica con el array `styles`, y Google lo IGNORA si el mapa tiene `mapId`. Por eso
 * ningun mapa de esta app declara `mapId`, y por eso se usan marcadores clasicos en vez de
 * `AdvancedMarkerElement`, que si lo exige. Es un paquete: o tema propio o marcadores nuevos.
 */
const DARK_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1a3a2a' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#4ade80' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1e293b' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#475569' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#334155' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c1a2e' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
];

const LIGHT_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

/** Gota de agua, el mismo trazado que el origen. */
export const PIN_PATH = 'M12 0C7.03 0 3 4.03 3 9c0 6.75 9 15 9 15s9-8.25 9-15c0-4.97-4.03-9-9-9z';

/** Centro de Canada: el respaldo cuando la ciudad no tiene coordenadas. */
export const CANADA_CENTER = { lat: 56.1304, lng: -106.3468 };

@Injectable({ providedIn: 'root' })
export class GoogleMapsLoader {
  private readonly document = inject(DOCUMENT);
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private mapsPromise: Promise<void> | null = null;
  private clustererPromise: Promise<void> | null = null;
  private apiKey: string | null | undefined;

  /** `null` significa "no configurada": el llamante debe abstenerse de pintar el mapa. */
  async getApiKey(): Promise<string | null> {
    if (this.apiKey !== undefined) return this.apiKey;
    if (!this.isBrowser) return null;

    try {
      const config = await firstValueFrom(
        this.http.get<{ mapsApiKey: string | null }>(`${this.base}/api/config`),
      );
      this.apiKey = config?.mapsApiKey ?? null;
    } catch {
      this.apiKey = null;
    }
    return this.apiKey;
  }

  /** Resuelve cuando `google.maps` esta disponible. Una sola carga aunque se pidan varias. */
  load(): Promise<void> {
    if (!this.isBrowser) return Promise.reject(new Error('maps_server_side'));
    if (this.mapsPromise) return this.mapsPromise;

    this.mapsPromise = this.getApiKey().then((key) => {
      if (!key) throw new Error('maps_key_missing');
      if (window.google?.maps) return;

      return new Promise<void>((resolve, reject) => {
        // Google llama a una funcion global cuando termina; es su unico mecanismo de aviso.
        window.__rentcaMapsCallback = () => {
          delete window.__rentcaMapsCallback;
          resolve();
        };
        const script = this.document.createElement('script');
        script.src =
          'https://maps.googleapis.com/maps/api/js?key=' +
          encodeURIComponent(key) +
          '&loading=async&callback=__rentcaMapsCallback&libraries=marker&v=weekly';
        script.async = true;
        script.defer = true;
        script.onerror = () => reject(new Error('maps_script_failed'));
        this.document.head.appendChild(script);
      });
    });

    // Si falla, se olvida la promesa: reintentar despues no deberia heredar el fallo anterior.
    this.mapsPromise.catch(() => {
      this.mapsPromise = null;
    });

    return this.mapsPromise;
  }

  /**
   * Agrupador de marcadores. Es opcional a proposito: si el CDN no responde, el mapa se pinta
   * igual con los marcadores sueltos. Un mapa sin agrupar sigue siendo util; uno que no carga,
   * no.
   */
  loadClusterer(): Promise<void> {
    if (!this.isBrowser) return Promise.reject(new Error('maps_server_side'));
    if (window.markerClusterer) return Promise.resolve();
    if (this.clustererPromise) return this.clustererPromise;

    this.clustererPromise = new Promise<void>((resolve, reject) => {
      const script = this.document.createElement('script');
      script.src = CLUSTERER_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('clusterer_failed'));
      this.document.head.appendChild(script);
    });

    return this.clustererPromise;
  }

  /**
   * Avisa cuando Google RECHAZA la clave.
   *
   * Este caso no lo cubre el `catch` de `load()`: el script se descarga con 200 y el mapa se
   * construye sin lanzar; Google falla despues, por dentro, y lo unico que hace es pintar su
   * propio cartel gris —"Oops! Something went wrong", en ingles y sin traducir— dentro de
   * nuestro layout, mas un error en consola. Es justo el escenario mas probable en un
   * despliegue nuevo: la clave existe pero esta restringida al dominio anterior
   * (`RefererNotAllowedMapError`).
   *
   * `gm_authFailure` es el unico gancho que Google ofrece para enterarse.
   */
  onAuthFailure(callback: () => void): () => void {
    if (!this.isBrowser) return () => undefined;

    const previous = window.gm_authFailure;
    window.gm_authFailure = () => {
      previous?.();
      callback();
    };
    return () => {
      window.gm_authFailure = previous;
    };
  }

  isDark(): boolean {
    return this.document.documentElement.classList.contains('dark');
  }

  currentStyles(): google.maps.MapTypeStyle[] {
    return this.isDark() ? DARK_STYLES : LIGHT_STYLES;
  }

  /**
   * Avisa cuando el sitio cambia de tema para re-pintar el mapa. Devuelve la funcion que
   * deshace la observacion: sin ella el observador sobrevive al componente.
   */
  onThemeChange(callback: () => void): () => void {
    if (!this.isBrowser || typeof MutationObserver === 'undefined') return () => undefined;

    let last = this.isDark();
    const observer = new MutationObserver(() => {
      const now = this.isDark();
      if (now !== last) {
        last = now;
        callback();
      }
    });
    observer.observe(this.document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }
}

/** Opciones comunes de los dos mapas de la app. */
export function baseMapOptions(styles: google.maps.MapTypeStyle[]): google.maps.MapOptions {
  return {
    styles,
    clickableIcons: false,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: true,
  };
}
