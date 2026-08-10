import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { applyStaticSeo } from '../../core/seo/static-seo';

/** Port de Features/Home/Privacy.cshtml. */
@Component({
  selector: 'app-privacy-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <section class="max-w-3xl mx-auto">
        <div class="text-center py-8">
          <h1 class="font-sans font-bold tracking-tight text-4xl text-slate-900 dark:text-white">
            {{ 'footer.privacyTitle' | transloco }}
          </h1>
        </div>
        <div class="glass-card p-8 sm:p-10">
          <!--
            El origen remata esta frase con un enlace al repositorio. Aqui no: el repositorio es
            privado y el enlace daba 404 a cualquier visitante. El texto se sirve desde
            core/i18n/translation-overrides.ts con una version que termina sola, porque el del
            origen acaba en "please see the" contando con que alguien le pegue el enlace detras.
          -->
          <p class="text-slate-600 dark:text-white/70 leading-relaxed">
            {{ 'footer.privacyText' | transloco }}
          </p>
        </div>
      </section>
    </div>
  `,
})
export class PrivacyPage {
  constructor() {
    applyStaticSeo('footer.privacyTitle', 'seo.description.privacy');
  }
}
