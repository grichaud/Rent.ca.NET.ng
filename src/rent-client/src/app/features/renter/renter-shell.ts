import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../shared/ui/icon/icon';
import { RenterSidebar } from './renter-sidebar';

/**
 * Port de RenterPortal/_RenterLayout.cshtml: columna fija con el sidebar en desktop y, en
 * movil, una barra con el boton que abre el drawer. El drawer vive siempre en el DOM y se
 * anima con clases —igual que renter-sidebar.js en el origen—, sin tocar estilos inline,
 * que en SSR no se pueden escribir.
 */
@Component({
  selector: 'app-renter-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, TranslocoPipe, Icon, RenterSidebar],
  template: `
    <div class="grid lg:grid-cols-[16rem_1fr] min-h-[calc(100vh-4rem)]">
      <aside
        class="hidden lg:block sticky top-16 self-start h-[calc(100vh-4rem)] border-r border-gray-200 dark:border-white/10 bg-white/40 dark:bg-slate-950/40 backdrop-blur-xl"
      >
        <app-renter-sidebar />
      </aside>

      <div class="flex flex-col min-w-0">
        <div
          class="lg:hidden sticky top-16 z-30 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-white/10 bg-white/40 dark:bg-slate-950/40 backdrop-blur-xl"
        >
          <button
            type="button"
            (click)="drawerOpen.set(true)"
            class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-white/80 hover:text-slate-900 dark:hover:text-white"
            aria-controls="renter-sidebar-drawer"
            [attr.aria-expanded]="drawerOpen()"
          >
            <app-icon name="menu" class="h-5 w-5" />
            <span class="font-medium">{{ 'common.myPortal' | transloco }}</span>
          </button>
          <span class="text-xs text-slate-500 dark:text-white/50">{{
            'renter.role' | transloco
          }}</span>
        </div>

        <main class="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <router-outlet />
        </main>
      </div>
    </div>

    <div
      id="renter-sidebar-drawer"
      class="lg:hidden fixed inset-0 z-50"
      [class.pointer-events-none]="!drawerOpen()"
      [attr.aria-hidden]="!drawerOpen()"
    >
      <div
        (click)="drawerOpen.set(false)"
        class="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        [class.opacity-0]="!drawerOpen()"
        [class.opacity-100]="drawerOpen()"
      ></div>
      <aside
        class="absolute top-0 left-0 bottom-0 w-72 max-w-[85vw] bg-white/95 dark:bg-slate-950/95 backdrop-blur-2xl border-r border-gray-200 dark:border-white/10 shadow-2xl transition-transform duration-300 ease-out flex flex-col"
        [class.-translate-x-full]="!drawerOpen()"
        [class.translate-x-0]="drawerOpen()"
      >
        <div class="flex items-center justify-end p-3 border-b border-gray-200 dark:border-white/10">
          <button
            type="button"
            (click)="drawerOpen.set(false)"
            class="inline-flex items-center justify-center h-9 w-9 rounded-lg text-slate-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            [attr.aria-label]="'navbar.close' | transloco"
          >
            <app-icon name="x" class="h-5 w-5" />
          </button>
        </div>
        <div class="flex-1 overflow-y-auto">
          <app-renter-sidebar (navigated)="drawerOpen.set(false)" />
        </div>
      </aside>
    </div>
  `,
})
export class RenterShell {
  protected readonly drawerOpen = signal(false);
}
