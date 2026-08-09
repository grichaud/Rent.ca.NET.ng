/**
 * Textos de SEO en los dos idiomas.
 *
 * Viven APARTE de `translations.ts` a proposito: ese archivo se GENERA desde los `.resx` del
 * origen con `scripts/gen-translations.mjs`, asi que cualquier clave escrita alli a mano
 * desaparece en la siguiente regeneracion. Estas claves no existen en el origen —su `<head>`
 * solo tiene `<title>` y canonical— asi que no pueden venir de los `.resx` y tienen que
 * sobrevivir por su cuenta. El loader las fusiona bajo la clave `seo`.
 *
 * Los TITULOS no estan aqui: se componen con las mismas claves de contenido que usa el
 * origen en `ViewData["Title"]` (`hero.title`, `listings.rentalsIn`, `common.about`...), para
 * que las dos versiones del producto sigan diciendo lo mismo en la pestana del navegador.
 * Lo que si es nuevo son las descripciones, que el origen no tiene en absoluto.
 *
 * Los marcadores son al estilo .NET (`{0}`), igual que el resto de textos del proyecto; se
 * resuelven con `formatTemplate` de `shared/format`.
 */
export const SEO_TRANSLATIONS: Record<string, Record<string, unknown>> = {
  en: {
    // El origen concatena " - Rent.ca" literal en _Layout.cshtml; aqui es una clave para que
    // el frances no herede un sufijo ingles si algun dia deja de ser un nombre propio.
    siteName: 'Rent.ca',
    locale: 'en_CA',
    localeAlternate: 'fr_CA',
    description: {
      default:
        'Rent.ca is Canada’s rental marketplace: apartments, condos and houses for rent, with photos, floor plans and direct contact with landlords.',
      home: 'Browse thousands of apartments, condos and houses for rent across Canada. Compare prices, photos and floor plans, and contact landlords directly on Rent.ca.',
      // {0} ciudad, {1} provincia
      city: 'Apartments, condos and houses for rent in {0}, {1}. Filter by price, bedrooms and amenities, compare floor plans, and contact landlords directly on Rent.ca.',
      // {0} tipo de propiedad, {1} ciudad, {2} provincia
      listing:
        '{0} for rent in {1}, {2}. See photos, floor plans, amenities and availability, and contact the landlord directly on Rent.ca.',
      about:
        'Rent.ca connects renters with landlords across Canada. Learn who we are and how our rental marketplace works.',
      faq: 'Answers to the most common questions about renting on Rent.ca: searching, contacting landlords, alerts and listing your property.',
      privacy:
        'How Rent.ca collects, uses and protects your personal information, and the choices you have over your data.',
      landlords:
        'List your rental on Rent.ca and reach thousands of qualified renters across Canada. Compare plans, see how it works and post your property today.',
    },
  },
  fr: {
    siteName: 'Rent.ca',
    locale: 'fr_CA',
    localeAlternate: 'en_CA',
    description: {
      default:
        'Rent.ca est le marche locatif du Canada : appartements, condos et maisons à louer, avec photos, plans d’étage et contact direct avec les propriétaires.',
      home: 'Parcourez des milliers d’appartements, de condos et de maisons à louer partout au Canada. Comparez les prix, les photos et les plans d’étage, et contactez directement les propriétaires sur Rent.ca.',
      city: 'Appartements, condos et maisons à louer à {0}, {1}. Filtrez par prix, nombre de chambres et commodités, comparez les plans d’étage et contactez directement les propriétaires sur Rent.ca.',
      listing:
        '{0} à louer à {1}, {2}. Consultez les photos, les plans d’étage, les commodités et les disponibilités, et contactez directement le propriétaire sur Rent.ca.',
      about:
        'Rent.ca met en relation les locataires et les propriétaires partout au Canada. Découvrez qui nous sommes et comment fonctionne notre marche locatif.',
      faq: 'Réponses aux questions les plus fréquentes sur la location avec Rent.ca : recherche, contact avec les propriétaires, alertes et publication d’une annonce.',
      privacy:
        'Comment Rent.ca recueille, utilise et protège vos renseignements personnels, et les choix dont vous disposez concernant vos données.',
      landlords:
        'Publiez votre logement sur Rent.ca et rejoignez des milliers de locataires qualifiés partout au Canada. Comparez les forfaits, voyez comment ça marche et affichez votre propriété dès aujourd’hui.',
    },
  },
};
