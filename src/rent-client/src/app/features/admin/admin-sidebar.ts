import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map } from 'rxjs';
import { CultureService } from '../../core/i18n/culture.service';
import { Icon } from '../../shared/ui/icon/icon';

interface SidebarLink {
  /** Segmento bajo `/admin`; vacio para el dashboard. */
  segment: string;
  icon: string;
  labelKey: string;
}

/**
 * Port de Admin/Partials/_AdminSidebar.cshtml. El tema del admin es ambar (el renter usa
 * rosa y el landlord brand): los tres portales comparten esqueleto y se distinguen por color.
 */
@Component({
  selector: 'app-admin-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, Icon],
  template: `
    <nav class="flex flex-col h-full" aria-label="Admin navigation">
      <div class="px-5 py-6 border-b border-gray-200 dark:border-white/10">
        <a [routerLink]="['/', culture.culture()]" class="flex items-center gap-2.5 group">
          <div
            class="h-8 w-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30 shrink-0"
          >
            <app-icon name="sparkles" class="h-4 w-4 text-white" />
          </div>
          <span
            class="text-base font-bold text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors"
            >Rent.ca</span
          >
          <span class="text-xs ml-1 mt-0.5 text-slate-500 dark:text-white/50">{{
            'admin.title' | transloco
          }}</span>
        </a>
      </div>

      <ul class="flex flex-col gap-1 p-3 flex-1" role="list">
        @for (link of links; track link.segment) {
          <li>
            <a
              [routerLink]="linkTo(link.segment)"
              [attr.aria-current]="isActive(link) ? 'page' : null"
              (click)="navigated.emit()"
              class="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
              [class]="
                isActive(link)
                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 shadow-sm shadow-amber-500/10'
                  : 'text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white/90'
              "
            >
              <app-icon
                [name]="link.icon"
                class="h-4 w-4 shrink-0"
                [class]="
                  isActive(link)
                    ? 'text-amber-500 dark:text-amber-300'
                    : 'text-gray-400 dark:text-white/40'
                "
              />
              <span>{{ link.labelKey | transloco }}</span>
            </a>
          </li>
        }
      </ul>

      <div class="p-3 border-t border-gray-200 dark:border-white/10">
        <a
          [routerLink]="['/', culture.culture()]"
          (click)="navigated.emit()"
          class="glass-button w-full inline-flex items-center justify-center gap-2 text-sm"
        >
          <app-icon name="external-link" class="h-4 w-4 shrink-0" />
          <span>{{ 'admin.backToSite' | transloco }}</span>
        </a>
      </div>
    </nav>
  `,
})
export class AdminSidebar {
  protected readonly culture = inject(CultureService);
  private readonly router = inject(Router);

  readonly navigated = output<void>();

  protected readonly links: SidebarLink[] = [
    { segment: '', icon: 'layout-dashboard', labelKey: 'admin.navDashboard' },
    { segment: 'properties', icon: 'building', labelKey: 'admin.navProperties' },
    { segment: 'landlords', icon: 'user', labelKey: 'admin.navLandlords' },
    { segment: 'specials', icon: 'sparkles', labelKey: 'admin.navSpecials' },
    { segment: 'searches', icon: 'search', labelKey: 'admin.navSearches' },
    { segment: 'ai', icon: 'message-square', labelKey: 'admin.navAi' },
    { segment: 'users', icon: 'user-plus', labelKey: 'admin.navUsers' },
  ];

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected linkTo(segment: string): string[] {
    const parts = ['/', this.culture.culture(), 'admin'];
    return segment ? [...parts, segment] : parts;
  }

  protected isActive(link: SidebarLink): boolean {
    const path = this.currentUrl().split('?')[0];
    const root = `/${this.culture.culture()}/admin`;
    if (!link.segment) return path === root;
    return path.startsWith(`${root}/${link.segment}`);
  }
}
