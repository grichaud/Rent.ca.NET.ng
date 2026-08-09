import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subject, catchError, map, merge, of, switchMap } from 'rxjs';
import { LandlordInbox, LandlordService } from '../../core/api/landlord.service';
import { CultureService } from '../../core/i18n/culture.service';
import { formatLongDate, formatTemplate } from '../../shared/format';
import { Icon } from '../../shared/ui/icon/icon';

/**
 * Port de LandlordManage/Pages/Inbox.cshtml. El filtro vive en la URL (`?filter=unread`),
 * como en el origen, para que un enlace al inbox filtrado siga funcionando. Los contadores
 * del subtitulo van sobre el total sin filtrar; los calcula la API.
 */
@Component({
  selector: 'app-landlord-inbox-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, Icon],
  template: `
    <div class="space-y-6">
      <div class="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ 'landlord.inboxTitle' | transloco }}
          </h1>
          @if (inbox(); as data) {
            <p class="mt-1 text-sm text-slate-600 dark:text-white/70">
              {{ countLabel(data.totalCount) }} · {{ unreadLabel(data.unreadCount) }}
            </p>
          }
        </div>
        <div class="flex gap-2 text-sm">
          <a
            [routerLink]="['/', culture.culture(), 'landlord', 'inbox']"
            class="glass-button text-slate-700 dark:text-white/80"
            [class.!bg-brand-500]="!unreadOnly()"
            [class.!text-white]="!unreadOnly()"
            [attr.aria-current]="!unreadOnly() ? 'page' : null"
            >{{ 'landlord.filterAll' | transloco }}</a
          >
          <a
            [routerLink]="['/', culture.culture(), 'landlord', 'inbox']"
            [queryParams]="{ filter: 'unread' }"
            class="glass-button text-slate-700 dark:text-white/80"
            [class.!bg-brand-500]="unreadOnly()"
            [class.!text-white]="unreadOnly()"
            [attr.aria-current]="unreadOnly() ? 'page' : null"
            >{{ 'landlord.filterUnread' | transloco }}</a
          >
        </div>
      </div>

      @if (flashMessage()) {
        <div
          role="status"
          class="p-3 rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10 text-sm text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-2"
        >
          <app-icon name="check-circle" class="h-4 w-4" />
          {{ flashMessage() }}
        </div>
      }

      @if (inbox(); as data) {
        @if (data.inquiries.length === 0) {
          <div class="glass-card p-10 text-center">
            <div class="inline-flex h-16 w-16 rounded-2xl bg-cyan-500/15 items-center justify-center mb-4">
              <app-icon name="message-square" class="h-7 w-7 text-cyan-500 dark:text-cyan-300" />
            </div>
            <h2 class="font-sans font-bold tracking-tight text-2xl text-slate-900 dark:text-white">
              {{ (unreadOnly() ? 'landlord.inboxEmptyUnread' : 'landlord.inboxEmpty') | transloco }}
            </h2>
            <p class="text-slate-500 dark:text-white/60 mt-2 max-w-sm mx-auto">
              {{ 'landlord.inboxEmptyDesc' | transloco }}
            </p>
          </div>
        } @else {
          <div class="space-y-3">
            @for (inquiry of data.inquiries; track inquiry.id) {
              <article
                class="glass-card p-5"
                [class.border-l-4]="!inquiry.isRead"
                [class.border-l-brand-500]="!inquiry.isRead"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-semibold text-slate-900 dark:text-white">{{
                        inquiry.senderName
                      }}</span>
                      <a
                        [href]="'mailto:' + inquiry.senderEmail"
                        class="text-sm text-brand-600 dark:text-brand-400 hover:underline"
                        >{{ inquiry.senderEmail }}</a
                      >
                      @if (inquiry.senderPhone) {
                        <span class="text-sm text-slate-500 dark:text-white/50"
                          >· {{ inquiry.senderPhone }}</span
                        >
                      }
                      @if (!inquiry.isRead) {
                        <span
                          class="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-brand-500/20 text-brand-700 dark:text-brand-300"
                          >{{ 'landlord.inboxNew' | transloco }}</span
                        >
                      }
                    </div>
                    <div class="text-xs text-slate-500 dark:text-white/50 mt-1">
                      {{ longDate(inquiry.createdAt) }} · {{ 'landlord.inboxRe' | transloco }}
                      @if (inquiry.citySlug) {
                        <a
                          [routerLink]="['/', culture.culture(), inquiry.citySlug, inquiry.propertySlug]"
                          class="hover:underline"
                          >{{ inquiry.propertyTitle }}</a
                        >
                      } @else {
                        <span>{{ inquiry.propertyTitle }}</span>
                      }
                      @if (inquiry.moveInDate) {
                        <span class="ml-2">{{ moveInLabel(inquiry.moveInDate) }}</span>
                      }
                    </div>
                    <p class="text-slate-700 dark:text-white/80 mt-3 whitespace-pre-line">
                      {{ inquiry.message }}
                    </p>
                  </div>
                  <button
                    type="button"
                    (click)="toggle(inquiry.id)"
                    [disabled]="busy() === inquiry.id"
                    class="glass-button text-slate-700 dark:text-white/80 text-xs whitespace-nowrap flex-shrink-0 disabled:opacity-60"
                    [attr.aria-label]="toggleAria(inquiry.isRead, inquiry.senderName)"
                  >
                    {{ (inquiry.isRead ? 'landlord.inboxMarkUnread' : 'landlord.inboxMarkRead') | transloco }}
                  </button>
                </div>
              </article>
            }
          </div>
        }
      }
    </div>
  `,
})
export class LandlordInboxPage {
  protected readonly culture = inject(CultureService);
  private readonly landlord = inject(LandlordService);
  private readonly transloco = inject(TranslocoService);
  private readonly route = inject(ActivatedRoute);

  protected readonly unreadOnly = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('filter') === 'unread')),
    { initialValue: this.route.snapshot.queryParamMap.get('filter') === 'unread' },
  );

  protected readonly inbox = signal<LandlordInbox | null>(null);
  protected readonly busy = signal<string | null>(null);
  private readonly flashKey = signal<string | null>(null);
  protected readonly flashMessage = computed(() => {
    const key = this.flashKey();
    return key ? this.transloco.translate(key) : null;
  });

  private readonly reload$ = new Subject<void>();

  constructor() {
    // Una sola carga en vuelo: el filtro puede cambiar sin destruir el componente (misma
    // ruta, query distinta) y el toggle tambien recarga. Con switchMap, la peticion vieja
    // se cancela y una respuesta fuera de orden no puede pisar el filtro activo.
    merge(this.route.queryParamMap, this.reload$)
      .pipe(
        switchMap(() =>
          this.landlord.inbox(this.unreadOnly() ? 'unread' : undefined).pipe(
            catchError(() => of({ totalCount: 0, unreadCount: 0, inquiries: [] })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((data) => this.inbox.set(data));
  }

  protected toggle(inquiryId: string): void {
    if (this.busy()) return;
    this.busy.set(inquiryId);
    this.flashKey.set(null);

    this.landlord.toggleInquiry(inquiryId).subscribe({
      next: (response) => {
        this.busy.set(null);
        this.flashKey.set(response.message);
        // Se recarga la lista: con el filtro de no leidas activo, la consulta marcada
        // desaparece de la vista y los contadores cambian — igual que el redirect del origen.
        this.reload$.next();
      },
      error: () => this.busy.set(null),
    });
  }

  protected t(key: string): string {
    return this.transloco.translate(key);
  }

  protected longDate(value: string): string {
    return formatLongDate(value, this.culture.culture());
  }

  protected countLabel(count: number): string {
    return formatTemplate(this.t('landlord.inboxCount'), count);
  }

  protected unreadLabel(count: number): string {
    return formatTemplate(this.t('landlord.inboxUnreadCount'), count);
  }

  protected moveInLabel(moveInDate: string): string {
    return formatTemplate(
      this.t('landlord.inboxMoveIn'),
      formatLongDate(moveInDate, this.culture.culture()),
    );
  }

  protected toggleAria(isRead: boolean, senderName: string): string {
    return formatTemplate(
      this.t(isRead ? 'landlord.markUnreadFor' : 'landlord.markReadFor'),
      senderName,
    );
  }
}
