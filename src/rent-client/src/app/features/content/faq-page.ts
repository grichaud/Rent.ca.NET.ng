import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../shared/ui/icon/icon';

/**
 * Port de Features/Home/Faq.cshtml. Se conserva `<details>/<summary>` nativo en vez de un
 * acordeon con estado propio: funciona sin JavaScript, que es justo lo que interesa en una
 * pagina que se sirve renderizada desde el servidor.
 */
@Component({
  selector: 'app-faq-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, Icon],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <section class="max-w-3xl mx-auto" aria-labelledby="faq-heading">
        <div class="text-center py-8">
          <h1 id="faq-heading" class="font-sans font-bold tracking-tight text-4xl text-slate-900 dark:text-white">
            {{ 'Faq_Title' | transloco }}
          </h1>
          <p class="text-lg text-slate-600 dark:text-white/70 mt-4">{{ 'Faq_Subtitle' | transloco }}</p>
        </div>

        <div class="mt-4 space-y-3">
          @for (n of items; track n) {
            <details class="faq-item glass-card group">
              <summary class="flex items-center justify-between gap-4 cursor-pointer list-none p-5 select-none">
                <span class="font-medium text-slate-900 dark:text-white">{{ 'Faq_Q' + n | transloco }}</span>
                <app-icon
                  name="chevron-down"
                  class="faq-chevron h-4 w-4 text-slate-500 dark:text-white/60 transition-transform duration-300"
                />
              </summary>
              <div class="px-5 pb-5 text-sm text-slate-600 dark:text-white/70 leading-relaxed">
                {{ 'Faq_A' + n | transloco }}
              </div>
            </details>
          }
        </div>
      </section>
    </div>
  `,
})
export class FaqPage {
  protected readonly items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
}
