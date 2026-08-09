import { Routes } from '@angular/router';
import { roleGuard } from './core/auth/auth.guard';

/**
 * Las rutas se declaran una vez por cultura (`/en/...`, `/fr/...`) en lugar de usar un
 * parametro `:culture`. Un parametro capturaria cualquier primer segmento — `/toronto`
 * entraria como si fuese un idioma — y obligaria a un guard que lo valide en cada
 * navegacion. Con dos ramas explicitas el router ya solo acepta los idiomas reales.
 *
 * Cada pantalla se carga con `loadComponent`: con todo en el bundle inicial se superaba el
 * presupuesto de 500 kB, y quien entra a una ficha de alquiler no necesita descargar el
 * panel de filtros ni la home.
 *
 * Las pantallas que aun apuntan a PagePlaceholder se construyen en fases posteriores del
 * PRP; las rutas existen desde ya para que los enlaces del header y del footer no rompan.
 */
function localeRoutes(): Routes {
  return [
    {
      path: '',
      loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage),
    },
    {
      path: 'about',
      loadComponent: () => import('./features/content/about-page').then((m) => m.AboutPage),
    },
    {
      path: 'faq',
      loadComponent: () => import('./features/content/faq-page').then((m) => m.FaqPage),
    },
    {
      path: 'privacy',
      loadComponent: () => import('./features/content/privacy-page').then((m) => m.PrivacyPage),
    },
    {
      path: 'landlords',
      loadComponent: () => import('./shared/ui/page-placeholder').then((m) => m.PagePlaceholder),
      data: { title: 'For Landlords' },
    },
    // Las pantallas de autenticacion cuelgan de AuthShell, que las presenta centradas y sin
    // barra de navegacion, igual que el _LayoutAuth.cshtml del origen.
    {
      path: '',
      loadComponent: () => import('./layout/auth-shell').then((m) => m.AuthShell),
      children: [
        {
          path: 'login',
          loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
        },
        {
          path: 'signup',
          loadComponent: () => import('./features/auth/signup-page').then((m) => m.SignupPage),
        },
        {
          path: 'forgot-password',
          loadComponent: () =>
            import('./features/auth/forgot-password-page').then((m) => m.ForgotPasswordPage),
        },
        {
          path: 'reset-password',
          loadComponent: () =>
            import('./features/auth/reset-password-page').then((m) => m.ResetPasswordPage),
        },
        {
          path: 'external-login-confirm',
          loadComponent: () =>
            import('./features/auth/external-login-confirm-page').then(
              (m) => m.ExternalLoginConfirmPage,
            ),
        },
      ],
    },
    {
      path: 'landlord',
      loadComponent: () => import('./features/landlord/landlord-shell').then((m) => m.LandlordShell),
      canActivate: [roleGuard('Landlord')],
      children: [
        {
          path: '',
          loadComponent: () =>
            import('./features/landlord/dashboard-page').then((m) => m.LandlordDashboardPage),
        },
        {
          path: 'listings',
          loadComponent: () =>
            import('./features/landlord/listings-page').then((m) => m.LandlordListingsPage),
        },
        {
          path: 'listings/create',
          loadComponent: () =>
            import('./features/landlord/listing-form-page').then((m) => m.LandlordListingFormPage),
        },
        {
          path: 'listings/edit/:id',
          loadComponent: () =>
            import('./features/landlord/listing-form-page').then((m) => m.LandlordListingFormPage),
        },
        {
          path: 'listings/delete/:id',
          loadComponent: () =>
            import('./features/landlord/listing-delete-page').then((m) => m.LandlordListingDeletePage),
        },
        {
          path: 'inbox',
          loadComponent: () =>
            import('./features/landlord/inbox-page').then((m) => m.LandlordInboxPage),
        },
        {
          path: 'account',
          loadComponent: () =>
            import('./features/landlord/account-page').then((m) => m.LandlordAccountPage),
        },
      ],
    },
    {
      path: 'renter',
      loadComponent: () => import('./features/renter/renter-shell').then((m) => m.RenterShell),
      canActivate: [roleGuard('Renter')],
      children: [
        {
          path: '',
          loadComponent: () =>
            import('./features/renter/dashboard-page').then((m) => m.RenterDashboardPage),
        },
        {
          path: 'favorites',
          loadComponent: () =>
            import('./features/renter/favorites-page').then((m) => m.RenterFavoritesPage),
        },
        {
          path: 'alerts',
          loadComponent: () =>
            import('./features/renter/alerts-page').then((m) => m.RenterAlertsPage),
        },
        {
          path: 'inquiries',
          loadComponent: () =>
            import('./features/renter/inquiries-page').then((m) => m.RenterInquiriesPage),
        },
        {
          path: 'account',
          loadComponent: () =>
            import('./features/renter/account-page').then((m) => m.RenterAccountPage),
        },
      ],
    },

    // Deben ir al final: capturan cualquier segmento y taparian a las rutas de arriba.
    {
      path: ':citySlug',
      loadComponent: () => import('./features/search/city-results-page').then((m) => m.CityResultsPage),
    },
    {
      path: ':citySlug/:propertySlug',
      loadComponent: () => import('./features/listing/listing-detail-page').then((m) => m.ListingDetailPage),
    },
  ];
}

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: '/en' },
  { path: 'en', children: localeRoutes() },
  { path: 'fr', children: localeRoutes() },
  { path: '**', redirectTo: '/en' },
];
