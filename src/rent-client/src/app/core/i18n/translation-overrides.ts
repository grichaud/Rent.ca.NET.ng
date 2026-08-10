/**
 * Correcciones puntuales sobre las traducciones GENERADAS.
 *
 * `translations.ts` se produce desde los `.resx` del origen, asi que **editarlo a mano no sirve
 * de nada**: la siguiente regeneracion se lleva el cambio por delante. Mismo motivo por el que
 * las claves `seo.*` viven en su propio archivo. La diferencia es que aquello AÑADE un grupo que
 * no existe en los `.resx` y esto PISA claves que si existen, asi que cada entrada tiene que
 * justificar por que el texto del origen no vale aqui.
 *
 * Hoy solo hay un motivo, y es el mismo para las dos claves: **este sitio ya no enlaza a
 * GitHub.** El repositorio es privado, asi que el enlace daba 404 a cualquier visitante — peor
 * que no tenerlo en un portfolio. Los textos del origen dan por hecho que el enlace existe:
 *
 * - `footer.privacyText` TERMINA en "For questions, please see the", porque la plantilla del
 *   origen le pega detras un enlace con la palabra "repo". Sin enlace, la frase se corta.
 * - `Faq_A10` remite a "the GitHub repository linked in the footer", que ya no esta.
 *
 * Si algun dia el repositorio se hace publico, lo coherente es borrar este archivo y devolver
 * los enlaces, no acumular parches.
 */
export const TRANSLATION_OVERRIDES: Record<string, Record<string, unknown>> = {
  en: {
    footer: {
      privacyText:
        'Rent.ca.NET is a portfolio project by Giovanni Richaud. It is not a real rental ' +
        'service — the listings are demo data. When you send an inquiry, your name, email and ' +
        "phone number are shared with that listing's landlord. Messages you send to the AI " +
        'assistant and outgoing emails are processed by third-party providers (OpenRouter, ' +
        'Resend). Nothing is sold or used for advertising.',
    },
    Faq_A10:
      'Rent.ca.NET is a portfolio project and the listings are demo data, so there is nothing ' +
      'to report as fraudulent. If you spot a bug or a mistake in the app itself, it is a ' +
      'known limitation of the demo rather than a live service issue.',
  },
  fr: {
    footer: {
      privacyText:
        "Rent.ca.NET est un projet portfolio de Giovanni Richaud. Ce n'est pas un vrai service " +
        'de location — les annonces sont des données de démonstration. Lorsque vous envoyez une ' +
        'demande, vos nom, courriel et numéro de téléphone sont transmis au propriétaire de ' +
        "l'annonce. Les messages envoyés à l'assistant IA et les courriels sortants sont " +
        'traités par des fournisseurs tiers (OpenRouter, Resend). Rien n\'est vendu ni utilisé ' +
        'à des fins publicitaires.',
    },
    Faq_A10:
      'Rent.ca.NET est un projet portfolio et les annonces sont des données de démonstration; ' +
      "il n'y a donc rien à signaler comme frauduleux. Si vous trouvez un bogue ou une erreur " +
      "dans l'application, il s'agit d'une limite connue de la démonstration et non d'un " +
      'problème de service réel.',
  },
};
