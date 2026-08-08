import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CultureService } from '../core/i18n/culture.service';
import { ThemeService } from '../core/theme/theme.service';
import { Icon } from '../shared/ui/icon/icon';
import { BrandLogo } from './brand-logo';

@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, Icon, BrandLogo],
  template: `
    <header class="sticky top-0 z-40 glass-navbar">
      <div class="max-w-7xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
        <app-brand-logo />

        <!-- Paridad: el nav principal solo lleva los 3 links publicos. -->
        <nav class="hidden md:flex items-center gap-1 text-sm" aria-label="Main navigation">
          @for (link of navLinks; track link.path) {
            <a
              [routerLink]="['/', culture.culture(), link.path]"
              class="px-4 py-2 rounded-xl text-slate-700 dark:text-white/80 hover:text-slate-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-all duration-200 font-medium"
              >{{ link.key | transloco }}</a
            >
          }
        </nav>

        <div class="flex items-center gap-2">
          <button
            type="button"
            (click)="theme.toggle()"
            class="hidden sm:inline-flex items-center justify-center glass-button !p-2 !px-2 text-slate-600 dark:text-white/70"
            [title]="'common.themeToggleTitle' | transloco"
            aria-label="Toggle dark mode"
          >
            <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" class="h-4 w-4" />
          </button>

          <a
            [routerLink]="culture.urlInCulture(culture.alternate())"
            class="hidden sm:inline-flex glass-button items-center gap-1.5 !px-3 py-2 text-sm font-semibold text-slate-700 dark:text-white/80 hover:text-slate-900 dark:hover:text-white"
            [title]="'common.languageSwitcherTitle' | transloco"
          >
            <app-icon name="languages" class="h-3.5 w-3.5" />
            <span class="tracking-wider">{{ culture.alternate().toUpperCase() }}</span>
          </a>

          <a
            [routerLink]="['/', culture.culture(), 'login']"
            class="hidden sm:inline-flex items-center gap-2 glass-button !px-4 py-2 text-sm font-medium text-slate-700 dark:text-white"
          >
            <app-icon name="log-in" class="h-4 w-4" />
            <span>{{ 'common.signIn' | transloco }}</span>
          </a>
          <a
            [routerLink]="['/', culture.culture(), 'signup']"
            class="hidden sm:inline-flex items-center gap-2 glass-button-primary !px-4 py-2 text-sm font-medium"
          >
            <app-icon name="user-plus" class="h-4 w-4" />
            <span>{{ 'common.signUp' | transloco }}</span>
          </a>

          <button
            type="button"
            (click)="drawerOpen.set(true)"
            class="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-lg text-slate-700 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            [attr.aria-label]="'navbar.menu' | transloco"
            aria-controls="mobile-drawer"
            [attr.aria-expanded]="drawerOpen()"
          >
            <app-icon name="menu" class="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>

    <div
      id="mobile-drawer"
      class="md:hidden fixed inset-0 z-50"
      [class.pointer-events-none]="!drawerOpen()"
      [attr.aria-hidden]="!drawerOpen()"
    >
      <div
        (click)="drawerOpen.set(false)"
        class="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        [class.opacity-0]="!drawerOpen()"
      ></div>

      <aside
        class="absolute top-0 right-0 bottom-0 w-72 max-w-[85vw] bg-white/95 dark:bg-slate-950/95 backdrop-blur-2xl border-l border-gray-200 dark:border-white/10 shadow-2xl transition-transform duration-300 ease-out flex flex-col"
        [class.translate-x-full]="!drawerOpen()"
      >
        <div class="relative flex items-center justify-between p-5 border-b border-gray-200 dark:border-white/10">
          <span class="glass-highlight"></span>
          <app-brand-logo size="text-xl" />
          <button
            type="button"
            (click)="drawerOpen.set(false)"
            class="inline-flex items-center justify-center h-9 w-9 rounded-lg text-slate-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            [attr.aria-label]="'navbar.close' | transloco"
          >
            <app-icon name="x" class="h-5 w-5" />
          </button>
        </div>

        <nav class="flex flex-col gap-1 p-4" aria-label="Mobile">
          @for (link of navLinks; track link.path) {
            <a
              [routerLink]="['/', culture.culture(), link.path]"
              (click)="drawerOpen.set(false)"
              class="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-700 dark:text-white/80 hover:text-slate-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-all duration-200"
            >
              <app-icon [name]="link.icon" class="h-4 w-4 shrink-0" />
              <span class="font-medium">{{ link.key | transloco }}</span>
            </a>
          }
        </nav>

        <div class="mt-auto p-4 border-t border-gray-200 dark:border-white/10 flex flex-col gap-2">
          <div class="flex gap-2">
            <button
              type="button"
              (click)="theme.toggle()"
              class="glass-button inline-flex items-center justify-center !p-2 shrink-0"
              [title]="'common.themeToggleTitle' | transloco"
              aria-label="Toggle dark mode"
            >
              <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" class="h-4 w-4" />
            </button>
            <a
              [routerLink]="culture.urlInCulture(culture.alternate())"
              (click)="drawerOpen.set(false)"
              class="glass-button flex-1 inline-flex items-center justify-center gap-2 !px-4 py-3 text-slate-700 dark:text-white font-medium"
            >
              <app-icon name="languages" class="h-4 w-4" />
              <span>{{ culture.culture() === 'en' ? 'Français' : 'English' }}</span>
            </a>
          </div>

          <a
            [routerLink]="['/', culture.culture(), 'login']"
            (click)="drawerOpen.set(false)"
            class="glass-button w-full inline-flex items-center justify-center gap-2 !px-4 py-3 text-sm text-slate-700 dark:text-white font-medium"
          >
            <app-icon name="log-in" class="h-4 w-4" />
            <span>{{ 'common.signIn' | transloco }}</span>
          </a>
          <a
            [routerLink]="['/', culture.culture(), 'signup']"
            (click)="drawerOpen.set(false)"
            class="glass-button-primary w-full inline-flex items-center justify-center gap-2 !px-4 py-3 text-sm font-medium"
          >
            <app-icon name="user-plus" class="h-4 w-4" />
            <span>{{ 'common.signUp' | transloco }}</span>
          </a>
        </div>
      </aside>
    </div>
  `,
})
export class Header {
  protected readonly culture = inject(CultureService);
  protected readonly theme = inject(ThemeService);
  protected readonly drawerOpen = signal(false);

  protected readonly navLinks = [
    { path: '', key: 'common.rent', icon: 'home' },
    { path: 'landlords', key: 'common.landlords', icon: 'building' },
    { path: 'about', key: 'common.about', icon: 'info' },
  ];
}
