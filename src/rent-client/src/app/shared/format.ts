/**
 * Helpers de formato compartidos.
 *
 * Los textos vienen de los .resx del origen, que usan marcadores de posicion al estilo
 * .NET (`{0}`, `{1}`) en vez de los de Transloco. En lugar de reescribir 344 cadenas se
 * conserva el formato original y se resuelve aqui: asi los textos siguen siendo
 * comparables uno a uno con los del proyecto origen.
 */
export function formatTemplate(template: string, ...args: (string | number)[]): string {
  return template.replace(/\{(\d+)\}/g, (match, i) => {
    const value = args[Number(i)];
    return value === undefined ? match : String(value);
  });
}

/** "$1,850" — mismo formato que `"$" + v.ToString("N0")` del origen. */
export function formatPrice(value: number): string {
  return '$' + Math.round(value).toLocaleString('en-CA');
}

/**
 * Fecha larga con orden correcto por idioma — "Jul 15, 2026" (EN), "15 juill. 2026" (FR) —
 * como DateFormat.Long del origen. Una fecha sin hora ("2026-07-15") se ancla a medianoche
 * LOCAL: parseada a secas seria UTC, y al oeste de Greenwich se pintaria el dia anterior.
 */
export function formatLongDate(value: string, culture: string): string {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  return new Date(iso).toLocaleDateString(culture === 'fr' ? 'fr-CA' : 'en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
