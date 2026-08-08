import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { Culture, DEFAULT_CULTURE, isSupportedCulture } from './translations';

/**
 * La cultura vive en el primer segmento de la URL (/en/..., /fr/...), igual que en el origen,
 * donde la resolvia un RouteDataRequestCultureProvider.
 *
 * Se lee de la URL y no de una cookie porque la URL es lo unico que el buscador indexa: cada
 * idioma tiene que ser una direccion distinta y estable.
 */
@Injectable({ providedIn: 'root' })
export class CultureService {
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);

  private readonly _culture = signal<Culture>(DEFAULT_CULTURE);
  readonly culture = this._culture.asReadonly();

  init(): void {
    this.sync(this.router.url);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.sync(e.urlAfterRedirects));
  }

  /** La contraria a la activa, para el conmutador de idioma. */
  alternate(): Culture {
    return this._culture() === 'fr' ? 'en' : 'fr';
  }

  /** La misma URL en el otro idioma, preservando ruta y query. */
  urlInCulture(culture: Culture, url = this.router.url): string {
    const segments = url.split('/').filter(Boolean);
    if (isSupportedCulture(segments[0])) segments[0] = culture;
    else segments.unshift(culture);
    return '/' + segments.join('/');
  }

  private sync(url: string): void {
    const first = url.split('?')[0].split('/').filter(Boolean)[0];
    const culture: Culture = isSupportedCulture(first) ? first : DEFAULT_CULTURE;

    if (culture !== this._culture()) this._culture.set(culture);
    if (this.transloco.getActiveLang() !== culture) this.transloco.setActiveLang(culture);
    this.document.documentElement.lang = culture;
  }
}
