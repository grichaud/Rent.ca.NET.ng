import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { DEFAULT_CULTURE, TRANSLATIONS } from './translations';

/** Sirve las traducciones desde el bundle. Ver el comentario de translations.ts. */
@Injectable({ providedIn: 'root' })
export class StaticTranslocoLoader implements TranslocoLoader {
  getTranslation(lang: string) {
    return of((TRANSLATIONS[lang] ?? TRANSLATIONS[DEFAULT_CULTURE]) as Translation);
  }
}
