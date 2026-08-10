import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { SEO_TRANSLATIONS } from '../seo/seo-translations';
import { TRANSLATION_OVERRIDES } from './translation-overrides';
import { DEFAULT_CULTURE, TRANSLATIONS } from './translations';

/**
 * Sirve las traducciones desde el bundle. Ver el comentario de translations.ts.
 *
 * Hay dos añadidos sobre lo generado, y no son lo mismo:
 *
 * - **`seo`** es un grupo NUEVO. `translations.ts` se regenera desde los `.resx` del origen y se
 *   llevaria por delante cualquier clave escrita a mano; como `seo` no existe en los `.resx`, no
 *   puede pisar nada.
 * - **`TRANSLATION_OVERRIDES`** si PISA claves generadas, y por eso se fusiona al final y cada
 *   entrada esta justificada en su archivo.
 */
@Injectable({ providedIn: 'root' })
export class StaticTranslocoLoader implements TranslocoLoader {
  getTranslation(lang: string) {
    const base = TRANSLATIONS[lang] ?? TRANSLATIONS[DEFAULT_CULTURE];
    const seo = SEO_TRANSLATIONS[lang] ?? SEO_TRANSLATIONS[DEFAULT_CULTURE];
    const overrides = TRANSLATION_OVERRIDES[lang] ?? TRANSLATION_OVERRIDES[DEFAULT_CULTURE] ?? {};

    const merged: Record<string, unknown> = { ...base, seo };
    for (const [key, value] of Object.entries(overrides)) {
      const previous = merged[key];
      // Un nivel de anidamiento basta para lo que hay hoy (`footer.privacyText`). Sin esta
      // fusion, sustituir `footer` entero borraria las otras ~20 claves del grupo.
      merged[key] =
        isPlainObject(value) && isPlainObject(previous) ? { ...previous, ...value } : value;
    }

    return of(merged as Translation);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
