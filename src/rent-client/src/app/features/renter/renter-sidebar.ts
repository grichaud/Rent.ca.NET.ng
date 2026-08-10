import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map } from 'rxjs';
import { CultureService } from '../../core/i18n/culture.service';
import { Icon } from '../../shared/ui/icon/icon';

interface SidebarLink {
  /** Segmento bajo `/renter`; vacio para el dashboard. */
  segment: string;
  icon: string;
  labelKey: string;
}

/**
 * Port de RenterPortal/Partials/_RenterSidebar.cshtml. Se pinta dos veces —columna fija en
 * desktop y drawer en movil—, por eso es un componente propio y no marcado del shell.
 *
 * El activo se calcula como en el origen: coincidencia exacta para el dashboard (su ruta es
 * el prefijo de todas las demas) y por prefijo para el resto.
 */
@Component({
  selector: 'app-renter-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, Icon],
  template: `
    <nav class="flex flex-col h-full" aria-label="Renter navigation">
      <div class="px-5 py-6 border-b border-gray-200 dark:border-white/10">
        <a [routerLink]="['/', culture.culture()]" class="flex items-center gap-2.5 group">
          <div
            class="h-8 w-8 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-lg shadow-pink-500/30 shrink-0"
          >
            <app-icon name="heart" class="h-4 w-4 text-white" fill="currentColor" />
          </div>
          <span class="min-w-0">
            <span class="flex items-center gap-1">
              <span
                class="text-base font-bold text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors"
                >Rent.ca</span
              >
              <span
                class="text-[9px] font-bold tracking-widest text-brand-600 dark:text-brand-400 border border-brand-500/40 rounded px-1 py-0.5"
                >.NET</span
              >
              <span
                class="text-[9px] font-bold tracking-widest text-red-600 dark:text-red-400 border border-red-500/40 rounded px-1 py-0.5"
                >NG</span
              >
            </span>
            <span class="block text-xs text-slate-500 dark:text-white/50">{{
              'common.myPortal' | transloco
            }}</span>
          </span>
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
                  ? 'bg-pink-500/20 text-pink-500 dark:text-pink-300 shadow-sm shadow-pink-500/10'
                  : 'text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white/90'
              "
            >
              <app-icon
                [name]="link.icon"
                class="h-4 w-4 shrink-0"
                [class]="
                  isActive(link)
                    ? 'text-pink-500 dark:text-pink-300'
                    : 'text-gray-400 dark:text-white/40'
                "
              />
              <span>{{ link.labelKey | transloco }}</span>
              @if (isActive(link)) {
                <span class="ml-auto h-1.5 w-1.5 rounded-full bg-pink-500" aria-hidden="true"></span>
              }
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
          <span>{{ 'renter.browseListings' | transloco }}</span>
        </a>
      </div>
    </nav>
  `,
})
export class RenterSidebar {
  protected readonly culture = inject(CultureService);
  private readonly router = inject(Router);

  /** El drawer movil se cierra cuando se navega desde dentro. */
  readonly navigated = output<void>();

  protected readonly links: SidebarLink[] = [
    { segment: '', icon: 'layout-dashboard', labelKey: 'renter.dashboardLink' },
    { segment: 'favorites', icon: 'heart', labelKey: 'renter.favoritesLink' },
    { segment: 'alerts', icon: 'bell', labelKey: 'renter.alertsLink' },
    { segment: 'inquiries', icon: 'message-square', labelKey: 'renter.inquiriesLink' },
    { segment: 'account', icon: 'user', labelKey: 'renter.accountLink' },
  ];

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected linkTo(segment: string): string[] {
    const parts = ['/', this.culture.culture(), 'renter'];
    return segment ? [...parts, segment] : parts;
  }

  protected isActive(link: SidebarLink): boolean {
    const path = this.currentUrl().split('?')[0];
    const root = `/${this.culture.culture()}/renter`;
    if (!link.segment) return path === root;
    return path.startsWith(`${root}/${link.segment}`);
  }
}
