/**
 * Longitud a la que se recorta una meta description.
 *
 * Google corta el fragmento alrededor de los 155-160 caracteres. Pasarse no penaliza, pero la
 * frase queda cortada a mitad y el resultado se lee como texto truncado en vez de como una
 * promesa completa.
 */
const MAX_LENGTH = 160;

/**
 * Prepara un texto libre de la base de datos para servir como meta description.
 *
 * Las descripciones de los anuncios traen saltos de linea y parrafos: en un atributo `content`
 * eso se convierte en un bloque de espacios raro. Se aplasta a una linea y se corta por el
 * ultimo espacio, para no partir una palabra por la mitad.
 */
export function toMetaDescription(text: string | null | undefined, fallback: string): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return fallback;
  if (flat.length <= MAX_LENGTH) return flat;

  const cut = flat.slice(0, MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > MAX_LENGTH * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}
