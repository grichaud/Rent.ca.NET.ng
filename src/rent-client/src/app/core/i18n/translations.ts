/**
 * Traducciones del shell, copiadas literalmente de Resources/SharedResource.resx y
 * SharedResource.fr.resx del origen.
 *
 * Van embebidas en el bundle en vez de cargarse por HTTP a proposito: con SSR, un loader
 * HTTP obligaria al servidor de render a pedirse los JSON a si mismo, y una peticion lenta
 * o fallida dejaria el HTML servido con las claves sin traducir — justo lo que el SSR
 * existe para evitar. El diccionario del shell es pequeno y no justifica ese riesgo.
 */
export const TRANSLATIONS: Record<string, Record<string, unknown>> = {
  en: {
    common: {
      rent: 'Rent',
      landlords: 'Landlords',
      about: 'About',
      themeToggleTitle: 'Toggle theme',
      languageSwitcherTitle: 'Choose language',
      signIn: 'Sign In',
      signUp: 'Sign Up',
      logout: 'Logout',
    },
    navbar: {
      menu: 'Menu',
      close: 'Close menu',
    },
    footer: {
      tagline: 'Find your next home in Canada.',
      verified: 'Thousands of verified listings across all major cities.',
      quickLinks: 'Quick Links',
      about: 'About',
      faq: 'FAQ',
      privacy: 'Privacy',
      forLandlords: 'For Landlords',
      listProperty: 'List Your Property',
      pricing: 'Pricing',
      dashboard: 'Landlord Dashboard',
      copyright: '© 2026 Rent.ca. All rights reserved.',
      builtWith: 'Built with care for renters across Canada.',
      nextVersion: 'Next.js version',
      sourceOnGitHub: 'Source on GitHub',
    },
  },
  fr: {
    common: {
      rent: 'Louer',
      landlords: 'Propriétaires',
      about: 'À propos',
      themeToggleTitle: 'Changer le thème',
      languageSwitcherTitle: 'Choisir la langue',
      signIn: 'Connexion',
      signUp: "S'inscrire",
      logout: 'Déconnexion',
    },
    navbar: {
      menu: 'Menu',
      close: 'Fermer le menu',
    },
    footer: {
      tagline: 'Trouvez votre prochain chez-vous au Canada.',
      verified: 'Des milliers d’annonces vérifiées dans toutes les grandes villes.',
      quickLinks: 'Liens rapides',
      about: 'À propos',
      faq: 'FAQ',
      privacy: 'Confidentialité',
      forLandlords: 'Pour les propriétaires',
      listProperty: 'Publier votre propriété',
      pricing: 'Tarification',
      dashboard: 'Tableau de bord',
      copyright: '© 2026 Rent.ca. Tous droits réservés.',
      builtWith: 'Conçu avec soin pour les locataires du Canada.',
      nextVersion: 'Version Next.js',
      sourceOnGitHub: 'Code source sur GitHub',
    },
  },
};

export const SUPPORTED_CULTURES = ['en', 'fr'] as const;
export type Culture = (typeof SUPPORTED_CULTURES)[number];
export const DEFAULT_CULTURE: Culture = 'en';

export function isSupportedCulture(value: string | null | undefined): value is Culture {
  return !!value && (SUPPORTED_CULTURES as readonly string[]).includes(value);
}
