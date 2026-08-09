import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { SEO_TRANSLATIONS } from '../seo/seo-translations';
import { DEFAULT_CULTURE, TRANSLATIONS } from './translations';

/**
 * Sirve las traducciones desde el bundle. Ver el comentario de translations.ts.
 *
 * El grupo `seo` se fusiona desde un archivo aparte porque `translations.ts` se regenera
 * desde los `.resx` del origen y se llevaria por delante cualquier clave anadida a mano.
 * La fusion es superficial y `seo` no existe en los `.resx`, asi que no puede pisar nada.
 */
@Injectable({ providedIn: 'root' })
export class StaticTranslocoLoader implements TranslocoLoader {
  getTranslation(lang: string) {
    const base = TRANSLATIONS[lang] ?? TRANSLATIONS[DEFAULT_CULTURE];
    const seo = SEO_TRANSLATIONS[lang] ?? SEO_TRANSLATIONS[DEFAULT_CULTURE];
    return of({ ...base, seo } as Translation);
  }
}
