import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  ApplicationConfig,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  inject,
} from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { routes } from './app.routes';
import { CultureService } from './core/i18n/culture.service';
import { StaticTranslocoLoader } from './core/i18n/transloco-loader';
import { SUPPORTED_CULTURES, DEFAULT_CULTURE } from './core/i18n/translations';
import { ThemeService } from './core/theme/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideClientHydration(withEventReplay()),

    // withFetch es lo que permite que el transfer cache funcione: la respuesta que obtiene
    // el SSR viaja al cliente en el HTML y no se vuelve a pedir al hidratar.
    provideHttpClient(withFetch()),

    provideTransloco({
      config: {
        availableLangs: [...SUPPORTED_CULTURES],
        defaultLang: DEFAULT_CULTURE,
        fallbackLang: DEFAULT_CULTURE,
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: StaticTranslocoLoader,
    }),

    // El tema debe quedar resuelto antes del primer render, tambien en servidor, o el
    // usuario ve un parpadeo claro antes de que hidrate.
    provideAppInitializer(() => {
      inject(ThemeService).init();
      inject(CultureService).init();
    }),
  ],
};
