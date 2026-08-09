// Genera translations.ts para Angular a partir de los .resx del origen ya volcados a JSON.
// Solo se incluyen los grupos que usan las pantallas ya portadas; el resto de claves del
// origen (las que ninguna pantalla pide) se quedan fuera para no inflar el bundle.
import { readFileSync, writeFileSync } from 'node:fs';

const pad = process.argv[2];
const out = process.argv[3];

const DOTTED = new Set([
  'common', 'navbar', 'footer', 'listings', 'filters', 'detail',
  'hero', 'results', 'sort', 'cities', 'stats', 'gallery', 'map', 'validation',
  'landlordPage', 'aiChat', 'auth', 'renter', 'landlord', 'admin',
]);
const FLAT = /^(About|Faq|Landlords)_/;

function build(lang) {
  // PowerShell escribe UTF-8 con BOM y JSON.parse lo rechaza.
  const raw = JSON.parse(readFileSync(`${pad}/resx-${lang}.json`, 'utf8').replace(/^﻿/, ''));
  const tree = {};
  let n = 0;

  for (const [key, value] of Object.entries(raw)) {
    if (key.includes('.')) {
      const parts = key.split('.');
      if (!DOTTED.has(parts[0])) continue;
      let node = tree;
      for (const p of parts.slice(0, -1)) node = node[p] ??= {};
      node[parts.at(-1)] = value;
      n++;
    } else if (FLAT.test(key)) {
      tree[key] = value;
      n++;
    }
  }
  console.log(`${lang}: ${n} claves`);
  return tree;
}

const en = build('en');
const fr = build('fr');

const header = `/**
 * Traducciones de las pantallas publicas, generadas desde Resources/SharedResource.resx
 * y SharedResource.fr.resx del proyecto origen. No editar a mano: si cambia un texto,
 * cambia primero en el origen para que las dos versiones del producto no se separen.
 *
 * Van embebidas en el bundle en vez de cargarse por HTTP: con SSR, un loader HTTP obligaria
 * al servidor de render a pedirse los JSON a si mismo, y una peticion lenta o fallida
 * dejaria el HTML servido con las claves sin traducir — justo lo que el SSR evita.
 *
 * Todas las pantallas portadas hasta la Fase 10 tienen aqui su grupo. Las claves del origen
 * que ninguna pantalla usa se quedan fuera a proposito, para no cargar el bundle inicial
 * con texto muerto.
 */
`;

const body = `export const TRANSLATIONS: Record<string, Record<string, unknown>> = {
  en: ${JSON.stringify(en, null, 2).replace(/\n/g, '\n  ')},
  fr: ${JSON.stringify(fr, null, 2).replace(/\n/g, '\n  ')},
};

export const SUPPORTED_CULTURES = ['en', 'fr'] as const;
export type Culture = (typeof SUPPORTED_CULTURES)[number];
export const DEFAULT_CULTURE: Culture = 'en';

export function isSupportedCulture(value: string | null | undefined): value is Culture {
  return !!value && (SUPPORTED_CULTURES as readonly string[]).includes(value);
}
`;

writeFileSync(out, header + body, 'utf8');
console.log(`escrito: ${out}`);
