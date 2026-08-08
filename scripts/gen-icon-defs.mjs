// Convierte icon-paths.ts (strings de SVG) en icon-defs.ts (datos estructurados),
// para poder renderizar los iconos con elementos Angular reales en vez de [innerHTML],
// que no funciona sobre <svg> durante el render de servidor.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(process.argv[2], 'utf8');
const out = process.argv[3];

// Cada entrada del diccionario: nombre: "<markup>",
const entryRe = /^\s*(?:'([^']+)'|([A-Za-z][\w]*)):\s*"([^"]*)",\s*$/gm;
const elRe = /<(\w+)\s*([^>]*?)\/?>/g;
const attrRe = /([\w:-]+)='([^']*)'/g;

const defs = {};
const tags = new Set();
let m;
while ((m = entryRe.exec(src)) !== null) {
  const name = m[1] ?? m[2];
  const markup = m[3];
  const els = [];
  let e;
  elRe.lastIndex = 0;
  while ((e = elRe.exec(markup)) !== null) {
    const tag = e[1];
    tags.add(tag);
    const attrs = {};
    let a;
    attrRe.lastIndex = 0;
    while ((a = attrRe.exec(e[2])) !== null) attrs[a[1]] = a[2];
    els.push({ tag, attrs });
  }
  if (els.length) defs[name] = els;
}

const names = Object.keys(defs);
console.log(`iconos: ${names.length}`);
console.log(`tags usados: ${[...tags].sort().join(', ')}`);

const allAttrs = new Set();
for (const els of Object.values(defs)) for (const el of els) for (const k of Object.keys(el.attrs)) allAttrs.add(k);
console.log(`atributos usados: ${[...allAttrs].sort().join(', ')}`);

const body = names
  .map((n) => {
    const els = defs[n]
      .map((el) => `    { tag: '${el.tag}', attrs: ${JSON.stringify(el.attrs)} }`)
      .join(',\n');
    return `  ${/^[a-z][\w]*$/i.test(n) ? n : `'${n}'`}: [\n${els},\n  ]`;
  })
  .join(',\n');

writeFileSync(
  out,
  `/**
 * Definiciones de los iconos Lucide como datos, generado desde el IconTagHelper del origen.
 *
 * No se guardan como cadenas de markup a proposito: pintarlas con [innerHTML] sobre un
 * <svg> lanza "NotYetImplemented" en el render de servidor y, peor aun, aborta el ciclo de
 * deteccion de cambios completo, dejando sin bindings a componentes que no tienen nada que
 * ver (el sintoma tipico es un footer que aparece con todos los textos vacios).
 */
export interface IconElement {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
}

export const ICON_DEFS: Readonly<Record<string, readonly IconElement[]>> = {
${body},
};
`,
  'utf8',
);
console.log(`escrito: ${out}`);
