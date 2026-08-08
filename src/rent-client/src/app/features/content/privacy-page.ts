import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

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
          <p class="text-slate-600 dark:text-white/70 leading-relaxed">
            {{ 'footer.privacyText' | transloco }}
            <a
              href="https://github.com/grichaud/Rent.ca.NET"
              target="_blank"
              rel="noopener"
              class="text-brand-600 dark:text-brand-400 underline"
              >{{ 'footer.privacyRepo' | transloco }}</a
            >.
          </p>
        </div>
      </section>
    </div>
  `,
})
export class PrivacyPage {}
