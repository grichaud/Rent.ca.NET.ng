import { effect, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { CultureService } from '../i18n/culture.service';
import { SeoService } from './seo.service';

/**
 * `<head>` de una pagina de contenido, que no depende de datos de la API.
 *
 * Se llama desde el inicializador de un campo o desde el constructor del componente, donde hay
 * contexto de inyeccion.
 *
 * El efecto LEE la cultura activa aunque no la use en el cuerpo: asi el `<head>` se rehace si
 * el idioma cambia sin que el componente se reconstruya. Hoy el conmutador navega a la otra
 * URL y si lo reconstruye, pero de esta forma la correccion no depende de ese detalle.
 */
export function applyStaticSeo(
  titleKey: string,
  descriptionKey: string,
  jsonLd: () => object[] = () => [],
): void {
  const seo = inject(SeoService);
  const transloco = inject(TranslocoService);
  const culture = inject(CultureService);

  effect(() => {
    culture.culture();
    seo.apply({
      title: transloco.translate(titleKey),
      description: transloco.translate(descriptionKey),
      jsonLd: jsonLd(),
    });
  });
}
