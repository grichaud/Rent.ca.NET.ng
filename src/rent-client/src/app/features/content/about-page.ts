import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { applyStaticSeo } from '../../core/seo/static-seo';
import { Icon } from '../../shared/ui/icon/icon';

/** Port de Features/Home/About.cshtml. Todo el texto vive en los .resx del origen. */
@Component({
  selector: 'app-about-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, Icon],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <section class="relative overflow-hidden rounded-3xl">
        <div class="aurora-orb h-[360px] w-[360px] -top-24 -left-24 bg-brand-500"></div>
        <div class="aurora-orb h-[400px] w-[400px] -top-20 right-0 bg-cyan-400 [animation-delay:2s]"></div>

        <div class="relative max-w-3xl mx-auto text-center py-16 sm:py-24">
          <h1
            class="font-sans font-bold tracking-tight text-5xl sm:text-6xl text-slate-900 dark:text-white leading-tight"
          >
            <span class="block">{{ 'About_Title1' | transloco }}</span>
            <span
              class="block bg-gradient-to-r from-brand-500 to-cyan-500 dark:from-brand-400 dark:to-cyan-400 bg-clip-text text-transparent"
              >{{ 'About_Title2' | transloco }}</span
            >
          </h1>
          <p class="text-lg text-slate-600 dark:text-white/70 mt-6 max-w-2xl mx-auto">
            {{ 'About_Subtitle' | transloco }}
          </p>
        </div>
      </section>

      <section class="mt-12 max-w-4xl mx-auto">
        <div class="glass-card p-8 sm:p-10">
          <h2 class="font-sans font-bold tracking-tight text-2xl sm:text-3xl text-slate-900 dark:text-white">
            {{ 'About_MissionTitle' | transloco }}
          </h2>
          <p class="text-base text-slate-600 dark:text-white/70 mt-4 leading-relaxed">
            {{ 'About_MissionBody' | transloco }}
          </p>
        </div>
      </section>

      <section class="mt-12 max-w-4xl mx-auto">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
          @for (card of cards; track card.titleKey) {
            <div class="glass-card p-6">
              <div [attr.class]="'inline-flex items-center justify-center h-12 w-12 rounded-2xl mb-4 ' + card.bg">
                <app-icon [name]="card.icon" [class]="'h-6 w-6 ' + card.color" />
              </div>
              <h3 class="font-semibold text-lg text-slate-900 dark:text-white">{{ card.titleKey | transloco }}</h3>
              <p class="text-sm text-slate-600 dark:text-white/60 mt-2 leading-relaxed">
                {{ card.bodyKey | transloco }}
              </p>
            </div>
          }
        </div>
      </section>
    </div>
  `,
})
export class AboutPage {
  constructor() {
    // El titulo reusa la misma clave que `ViewData["Title"]` en el origen (`common.about`).
    applyStaticSeo('common.about', 'seo.description.about');
  }

  protected readonly cards = [
    {
      icon: 'building-2', bg: 'bg-brand-500/15 dark:bg-brand-500/25', color: 'text-brand-600 dark:text-brand-300',
      titleKey: 'About_Card1Title', bodyKey: 'About_Card1Body',
    },
    {
      icon: 'sparkles', bg: 'bg-cyan-500/15 dark:bg-cyan-500/25', color: 'text-cyan-600 dark:text-cyan-300',
      titleKey: 'About_Card2Title', bodyKey: 'About_Card2Body',
    },
    {
      icon: 'map', bg: 'bg-purple-500/15 dark:bg-purple-500/25', color: 'text-purple-600 dark:text-purple-300',
      titleKey: 'About_Card3Title', bodyKey: 'About_Card3Body',
    },
    {
      icon: 'users', bg: 'bg-emerald-500/15 dark:bg-emerald-500/25', color: 'text-emerald-600 dark:text-emerald-300',
      titleKey: 'About_Card4Title', bodyKey: 'About_Card4Body',
    },
  ];
}
