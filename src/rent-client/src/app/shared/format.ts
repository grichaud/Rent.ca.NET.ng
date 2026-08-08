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
