import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ListingTier } from '../../core/api/api.types';

/**
 * Insignia de tier de las tablas de propietarios y propiedades. Cuando el tier vendido ya no
 * es el efectivo (la vigencia caduco) se marca al lado: en la tabla hay que ver que se
 * compro y que esta activo ahora mismo.
 */
@Component({
  selector: 'app-admin-tier-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    @switch (effectiveTier()) {
      @case ('Featured') {
        <span
          class="inline-flex rounded-md px-2 py-0.5 text-xs font-bold bg-gradient-to-r from-amber-400 to-orange-500 text-white"
          >FEATURED</span
        >
      }
      @case ('Promoted') {
        <span
          class="inline-flex rounded-md px-2 py-0.5 text-xs font-bold bg-gradient-to-r from-brand-500 to-cyan-500 text-white"
          >PROMOTED</span
        >
      }
      @default {
        <span class="inline-flex rounded-md px-2 py-0.5 text-xs text-slate-500 dark:text-white/60"
          >Limited</span
        >
      }
    }
    @if (expired()) {
      <span class="ml-1 text-[10px] text-rose-500" [title]="'admin.expiredTooltip' | transloco"
        >({{ tier() }} expired)</span
      >
    }
  `,
})
export class AdminTierBadge {
  readonly tier = input.required<ListingTier>();
  readonly effectiveTier = input.required<ListingTier>();

  protected readonly expired = computed(() => this.tier() !== this.effectiveTier());
}

/** Paginacion simple (sin elipsis), como la del origen: solo aparece si hay mas de una pagina. */
@Component({
  selector: 'app-admin-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (totalPages() > 1) {
      <div class="flex items-center justify-center gap-2 text-sm">
        @for (page of pages(); track page) {
          <button
            type="button"
            (click)="pageChange.emit(page)"
            class="px-3 py-1 rounded-md"
            [class]="
              page === pageIndex()
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300'
                : 'text-slate-500 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10'
            "
            [attr.aria-current]="page === pageIndex() ? 'page' : null"
          >
            {{ page }}
          </button>
        }
      </div>
    }
  `,
})
export class AdminPagination {
  readonly pageIndex = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly pageChange = output<number>();

  protected readonly pages = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1),
  );
}

/** Aviso de exito/error del panel. El texto llega ya resuelto de la API, sin traducir. */
@Component({
  selector: 'app-admin-flash',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (success()) {
      <div
        role="status"
        class="glass-card p-3 text-sm text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
      >
        {{ success() }}
      </div>
    }
    @if (error()) {
      <div
        role="alert"
        class="glass-card p-3 text-sm text-rose-700 dark:text-rose-300 border border-rose-500/30"
      >
        {{ error() }}
      </div>
    }
  `,
})
export class AdminFlash {
  readonly success = input<string | null>(null);
  readonly error = input<string | null>(null);
}

// ---- Formato de fechas del panel -----------------------------------------------------
//
// El panel usa sellos tecnicos (`yyyy-MM-dd HH:mm`), no la fecha larga localizada del resto
// de la app: un administrador compara vigencias y ordena filas, no lee prosa. Todo se pinta
// en hora LOCAL y los `datetime-local` se leen tambien como local — el origen renderiza el
// input en UTC pero lo re-interpreta como local al postear, y esa mitad del viaje pierde el
// desfase. Aqui las dos direcciones usan el mismo huso.

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** `yyyy-MM-dd HH:mm` en local, o guion si no hay valor. */
export function formatStamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatDay(iso)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * `yyyy-MM-dd HH:mm:ss` en local, o guion si no hay valor.
 *
 * Los mensajes de una conversacion con el asistente llegan seguidos: sin los segundos, la
 * pregunta y su respuesta muestran la misma hora y no se ve cuanto tardo. El origen los pinta
 * aqui y solo aqui.
 */
export function formatStampWithSeconds(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatStamp(iso)}:${pad(date.getSeconds())}`;
}

/** `yyyy-MM-dd` en local, o guion si no hay valor. */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Instante ISO -> valor de un `<input type="datetime-local">`. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Valor de un `<input type="datetime-local">` -> instante ISO. Sin sufijo de zona, el
 *  parser lo interpreta como hora local, que es justo lo que el usuario tecleo. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Mensaje de error de la API, en texto plano.
 *
 * Los endpoints de admin hablan tres dialectos: ValidationProblemDetails (`errors` por campo),
 * ProblemDetails (`title` suelto) y el `{ message }` de los 404. El panel no tiene errores por
 * campo — muestra una sola linea roja — asi que los tres se aplanan aqui.
 */
export function adminErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as
      | { title?: string; message?: string; errors?: Record<string, string[]> }
      | null;

    if (body?.errors && typeof body.errors === 'object') {
      const flat = Object.values(body.errors).flat().filter(Boolean);
      if (flat.length > 0) return flat.join(' ');
    }
    if (body?.title) return body.title;
    if (body?.message) return body.message;
  }

  return fallback;
}
