import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { CultureService } from '../i18n/culture.service';
import { SUPPORTED_CULTURES } from '../i18n/translations';
import { SITE_BASE_URL, absoluteUrl } from './site-url';

/** Lo que una pantalla puede afinar sobre los valores por defecto de su ruta. */
export interface SeoPage {
  /** Sin sufijo: se le anade " - Rent.ca", igual que el `_Layout.cshtml` del origen. */
  title?: string;
  description?: string;
  /** Ruta o URL de la imagen social. Se absolutiza sola. */
  image?: string | null;
  /** `article` en las fichas; `website` en el resto. */
  type?: 'website' | 'article';
  /** Datos estructurados. Se reemplazan enteros en cada llamada. */
  jsonLd?: object[];
  /** Para las pantallas de "no encontrado": existen, pero no deben indexarse. */
  noIndex?: boolean;
}

/**
 * Primeros segmentos (despues del idioma) que NO deben indexarse: son privados o
 * transaccionales. Ojo con `landlord` (portal privado) frente a `landlords` (landing publica
 * y muy indexable): la comparacion es por segmento exacto, nunca por prefijo.
 */
const PRIVATE_SEGMENTS = new Set([
  'login', 'signup', 'forgot-password', 'reset-password', 'external-login-confirm',
  'renter', 'landlord', 'admin',
]);

/**
 * Capa de `<head>` para el SSR.
 *
 * Es la razon de ser de esta migracion: el origen sirve HTML completo pero su `<head>` solo
 * tiene `<title>` y `canonical` — ni descripcion, ni Open Graph, ni `hreflang`, siendo un
 * sitio bilingue cuyo unico conmutador de idioma es un formulario POST que ningun rastreador
 * puede seguir. Un SSR que no emite esto no aporta nada sobre la version Razor.
 *
 * Como se reparte el trabajo:
 *
 * - `init()` corre en cada `NavigationEnd` y deja la ruta con valores por defecto correctos
 *   (canonical, alternates, robots y una descripcion generica). Asi ninguna pantalla puede
 *   quedarse sin `<head>` por olvido.
 * - Cada pantalla publica llama despues a `apply()` con lo suyo. El orden esta garantizado:
 *   `NavigationEnd` se emite durante la navegacion y los efectos de los componentes se
 *   vacian en la deteccion de cambios posterior, asi que la pantalla siempre pisa al defecto
 *   y nunca al reves.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly titleService = inject(Title);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly culture = inject(CultureService);
  private readonly baseUrl = inject(SITE_BASE_URL);

  private currentUrl = '/';

  init(): void {
    // Los dos idiomas se cargan por adelantado porque este servicio traduce de forma
    // SINCRONA: `translate()` devuelve la clave cruda si el idioma aun no esta cargado, y el
    // sintoma seria un `<title>seo.siteName</title>` servido al buscador. Es gratis: las
    // traducciones ya viven en el bundle y el loader las entrega con `of()`, sin red.
    for (const culture of SUPPORTED_CULTURES) this.transloco.load(culture).subscribe();

    this.applyRouteDefaults(this.router.url);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.applyRouteDefaults(e.urlAfterRedirects));
  }

  /** Lo que llama cada pantalla cuando ya sabe de que va la pagina. */
  apply(page: SeoPage): void {
    const t = (key: string) => this.transloco.translate(key);
    const siteName = t('seo.siteName');
    const title = page.title ? `${page.title} - ${siteName}` : siteName;
    const description = page.description ?? t('seo.description.default');
    const url = this.canonicalUrl(this.currentUrl);

    this.titleService.setTitle(title);
    this.setMeta('name', 'description', description);

    // Open Graph. `og:title` lleva el titulo COMPLETO (con sufijo) porque las tarjetas
    // sociales se leen sueltas, fuera del contexto del sitio.
    this.setMeta('property', 'og:type', page.type ?? 'website');
    this.setMeta('property', 'og:site_name', siteName);
    this.setMeta('property', 'og:title', title);
    this.setMeta('property', 'og:description', description);
    this.setMeta('property', 'og:url', url);
    this.setMeta('property', 'og:locale', t('seo.locale'));
    this.setMeta('property', 'og:locale:alternate', t('seo.localeAlternate'));

    this.setMeta('name', 'twitter:title', title);
    this.setMeta('name', 'twitter:description', description);

    const image = page.image ? absoluteUrl(this.baseUrl, page.image) : null;
    if (image) {
      this.setMeta('property', 'og:image', image);
      this.setMeta('name', 'twitter:image', image);
      // `summary_large_image` sin imagen degrada a una tarjeta rota, asi que el tipo de
      // tarjeta depende de que haya foto.
      this.setMeta('name', 'twitter:card', 'summary_large_image');
    } else {
      this.removeMeta('property', 'og:image');
      this.removeMeta('name', 'twitter:image');
      this.setMeta('name', 'twitter:card', 'summary');
    }

    if (page.noIndex) this.setMeta('name', 'robots', 'noindex, follow');

    this.setJsonLd(page.jsonLd ?? []);
  }

  /**
   * Canonical de una URL de la app: origen + ruta en minusculas y **sin query**, igual que el
   * origen. Las combinaciones de filtros (`?beds=2&maxPrice=...`) son infinitas y todas
   * muestran el mismo catalogo: indexarlas por separado diluye la ciudad en cientos de
   * duplicados.
   */
  canonicalUrl(url: string): string {
    return this.baseUrl + url.split('?')[0].split('#')[0].toLowerCase();
  }

  private applyRouteDefaults(url: string): void {
    this.currentUrl = url;

    const path = url.split('?')[0].split('#')[0];
    const segments = path.split('/').filter(Boolean);
    const isPrivate = PRIVATE_SEGMENTS.has(segments[1] ?? '');

    this.setLink('canonical', this.canonicalUrl(path));
    this.setAlternates(path, isPrivate);

    // El `noindex` se decide aqui y no en la pantalla: una pantalla privada que se olvide de
    // llamar a `apply()` seguiria protegida. Las publicas lo limpian por omision.
    if (isPrivate) this.setMeta('name', 'robots', 'noindex, nofollow');
    else this.removeMeta('name', 'robots');

    // Defecto util mientras la pantalla carga sus datos: en SSR el HTML no se serializa hasta
    // que la app estabiliza, asi que esto solo se ve si una pantalla no llama a `apply()`.
    this.apply({});
  }

  /**
   * `hreflang` entre `/en/...` y `/fr/...` mas `x-default`.
   *
   * Es el mayor agujero del origen: sus dos idiomas son URLs distintas y estables, pero nada
   * en el HTML las relaciona, asi que el buscador las trata como dos sitios sin parentesco y
   * puede servir la version inglesa a un usuario francofono.
   */
  private setAlternates(path: string, isPrivate: boolean): void {
    this.removeLinks('alternate');
    if (isPrivate) return;

    for (const culture of SUPPORTED_CULTURES) {
      this.appendLink('alternate', this.canonicalUrl(this.culture.urlInCulture(culture, path)), culture);
    }
    this.appendLink('alternate', this.canonicalUrl(this.culture.urlInCulture('en', path)), 'x-default');
  }

  private setMeta(attr: 'name' | 'property', key: string, content: string): void {
    this.meta.updateTag({ [attr]: key, content }, `${attr}='${key}'`);
  }

  private removeMeta(attr: 'name' | 'property', key: string): void {
    this.meta.removeTag(`${attr}='${key}'`);
  }

  private setLink(rel: string, href: string): void {
    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', rel);
      head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  private appendLink(rel: string, href: string, hreflang: string): void {
    const link = this.document.createElement('link');
    link.setAttribute('rel', rel);
    link.setAttribute('hreflang', hreflang);
    link.setAttribute('href', href);
    this.document.head.appendChild(link);
  }

  private removeLinks(rel: string): void {
    // El favicon del index.html tambien es rel="alternate"; solo se quitan los que llevan
    // hreflang, que son los que gestiona este servicio.
    for (const link of Array.from(
      this.document.head.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"][hreflang]`),
    )) {
      link.remove();
    }
  }

  /**
   * Datos estructurados.
   *
   * Se borran y se reescriben enteros en cada navegacion: al ir de una ficha a otra, dejar el
   * bloque anterior describiria un piso que ya no esta en pantalla.
   */
  private setJsonLd(blocks: object[]): void {
    for (const script of Array.from(
      this.document.head.querySelectorAll('script[type="application/ld+json"]'),
    )) {
      script.remove();
    }

    for (const block of blocks) {
      const script = this.document.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      // `</script>` dentro de un texto de la BD cerraria la etiqueta antes de tiempo y el
      // resto del JSON se interpretaria como HTML.
      script.textContent = JSON.stringify(block).replace(/</g, '\\u003c');
      this.document.head.appendChild(script);
    }
  }
}
