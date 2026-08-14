import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, of } from 'rxjs';
import { RenterService } from '../../core/api/renter.service';
import { CultureService } from '../../core/i18n/culture.service';
import { formatLongDate, formatTemplate } from '../../shared/format';
import { Icon } from '../../shared/ui/icon/icon';
import { applyPrivatePageTitle } from '../../core/seo/static-seo';

/** Port de RenterPortal/Pages/Inquiries.cshtml: las consultas que el renter ha enviado. */
@Component({
  selector: 'app-renter-inquiries-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, Icon],
  template: `
    <div class="space-y-6">
      <header>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ 'renter.inquiriesTitle' | transloco }}
        </h1>
        <p class="mt-1 text-sm text-slate-600 dark:text-white/70">
          {{ 'renter.inquiriesSubtitle' | transloco }}
        </p>
      </header>

      @if (inquiries(); as rows) {
        @if (rows.length === 0) {
          <div class="glass-card p-10 text-center">
            <div class="inline-flex h-16 w-16 rounded-2xl bg-cyan-500/15 items-center justify-center mb-4">
              <app-icon name="message-square" class="h-7 w-7 text-cyan-500 dark:text-cyan-300" />
            </div>
            <h2 class="font-sans font-bold tracking-tight text-2xl text-slate-900 dark:text-white">
              {{ 'renter.inquiriesNoneSent' | transloco }}
            </h2>
            <p class="text-slate-500 dark:text-white/60 mt-2 max-w-sm mx-auto">
              {{ 'renter.inquiriesEmptyDesc' | transloco }}
            </p>
            <a
              [routerLink]="['/', culture.culture()]"
              class="glass-button-primary inline-flex items-center gap-2 mt-6"
            >
              <app-icon name="search" class="h-4 w-4" />
              {{ 'renter.browseListings' | transloco }}
            </a>
          </div>
        } @else {
          <div class="space-y-3">
            @for (inquiry of rows; track inquiry.id) {
              <article class="glass-card p-5">
                <div class="flex items-start justify-between gap-3 flex-wrap">
                  <div class="min-w-0">
                    @if (inquiry.citySlug) {
                      <a
                        [routerLink]="['/', culture.culture(), inquiry.citySlug, inquiry.propertySlug]"
                        class="font-semibold text-slate-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                      >
                        {{ inquiry.propertyTitle }}
                      </a>
                    } @else {
                      <span class="font-semibold text-slate-900 dark:text-white">{{
                        inquiry.propertyTitle
                      }}</span>
                    }
                    <div
                      class="text-xs text-slate-500 dark:text-white/60 mt-0.5 inline-flex items-center gap-1"
                    >
                      <app-icon name="map-pin" class="h-3 w-3" />
                      {{ inquiry.propertyCity }}
                    </div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    @if (inquiry.isRead) {
                      <span
                        class="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1"
                      >
                        <app-icon name="check" class="h-3 w-3" />
                        {{ 'renter.inquiryViewed' | transloco }}
                      </span>
                    } @else {
                      <span
                        class="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-slate-500/20 text-slate-600 dark:text-slate-300"
                      >
                        {{ 'renter.inquiryPending' | transloco }}
                      </span>
                    }
                    <div
                      class="text-xs text-slate-500 dark:text-white/50 inline-flex items-center gap-1.5"
                    >
                      <app-icon name="calendar" class="h-3.5 w-3.5" />
                      {{ sentLabel(inquiry.createdAt) }}
                    </div>
                  </div>
                </div>

                @if (inquiry.moveInDate) {
                  <div
                    class="mt-2 text-xs text-slate-600 dark:text-white/70 inline-flex items-center gap-1.5"
                  >
                    <app-icon name="home" class="h-3.5 w-3.5" />
                    {{ moveInLabel(inquiry.moveInDate) }}
                  </div>
                }

                <p class="mt-3 text-sm text-slate-700 dark:text-white/80 line-clamp-3">
                  {{ inquiry.message }}
                </p>
              </article>
            }
          </div>
        }
      }
    </div>
  `,
})
export class RenterInquiriesPage {
  constructor() {
    applyPrivatePageTitle('renter.inquiriesTitle');
  }

  protected readonly culture = inject(CultureService);
  private readonly renter = inject(RenterService);
  private readonly transloco = inject(TranslocoService);

  protected readonly inquiries = toSignal(
    this.renter.inquiries().pipe(catchError(() => of([]))),
    { initialValue: null },
  );

  protected sentLabel(createdAt: string): string {
    return formatTemplate(
      this.transloco.translate('renter.inquiriesSentLabel'),
      formatLongDate(createdAt, this.culture.culture()),
    );
  }

  protected moveInLabel(moveInDate: string): string {
    return formatTemplate(
      this.transloco.translate('renter.inquiriesMoveIn'),
      formatLongDate(moveInDate, this.culture.culture()),
    );
  }
}
