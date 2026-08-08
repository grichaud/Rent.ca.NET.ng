import { Routes } from '@angular/router';
import { HomePage } from './features/home/home-page';
import { CityResultsPage } from './features/search/city-results-page';
import { PagePlaceholder } from './shared/ui/page-placeholder';

/**
 * Las rutas se declaran una vez por cultura (`/en/...`, `/fr/...`) en lugar de usar un
 * parametro `:culture`. Un parametro capturaria cualquier primer segmento — `/toronto`
 * entraria como si fuese un idioma — y obligaria a un guard que lo valide en cada
 * navegacion. Con dos ramas explicitas el router ya solo acepta los idiomas reales.
 *
 * Las pantallas marcadas con PagePlaceholder se construyen en fases posteriores del PRP;
 * las rutas existen desde ya para que los enlaces del header y del footer no rompan.
 */
function localeRoutes(): Routes {
  return [
    { path: '', component: HomePage },
    { path: 'about', component: PagePlaceholder, data: { title: 'About' } },
    { path: 'faq', component: PagePlaceholder, data: { title: 'FAQ' } },
    { path: 'privacy', component: PagePlaceholder, data: { title: 'Privacy' } },
    { path: 'landlords', component: PagePlaceholder, data: { title: 'For Landlords' } },
    { path: 'login', component: PagePlaceholder, data: { title: 'Sign In' } },
    { path: 'signup', component: PagePlaceholder, data: { title: 'Sign Up' } },
    { path: 'landlord', component: PagePlaceholder, data: { title: 'Landlord Dashboard' } },

    // Deben ir al final: capturan cualquier segmento y taparian a las rutas de arriba.
    { path: ':citySlug', component: CityResultsPage },
    { path: ':citySlug/:propertySlug', component: PagePlaceholder, data: { title: 'Listing detail' } },
  ];
}

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: '/en' },
  { path: 'en', children: localeRoutes() },
  { path: 'fr', children: localeRoutes() },
  { path: '**', redirectTo: '/en' },
];
