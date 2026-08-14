import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, of, switchMap } from 'rxjs';
import { AdminAi, AdminService } from '../../core/api/admin.service';
import { CultureService } from '../../core/i18n/culture.service';
import { formatStamp } from './admin-ui';
import { applyPrivatePageTitle } from '../../core/seo/static-seo';

const EMPTY: AdminAi = {
  totalConversations: 0,
  totalMessages: 0,
  estimatedTokens: 0,
  estimatedCostUsd: 0,
  toolBreakdown: [],
  last7Days: [],
  recent: [],
};

/**
 * Port de Admin/Pages/Ai.cshtml: metricas de solo lectura del asistente.
 *
 * Los tokens son una estimacion por caracteres/4, la misma regla de bolsillo del origen; el
 * coste que sale de ahi es orientativo y por eso se etiqueta como estimacion. Nada de esta
 * pantalla escribe.
 */
@Component({
  selector: 'app-admin-ai-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  template: `
    <div class="space-y-8">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ 'admin.aiTitle' | transloco }}
        </h1>
        <p class="mt-1 text-sm text-slate-600 dark:text-white/70">
          {{ 'admin.aiSubtitle' | transloco }}
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="glass-card p-5">
          <p class="text-xs uppercase tracking-wider text-slate-500 dark:text-white/50">
            {{ 'admin.aiCardConversations' | transloco }}
          </p>
          <p class="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
            {{ data().totalConversations }}
          </p>
        </div>
        <div class="glass-card p-5">
          <p class="text-xs uppercase tracking-wider text-slate-500 dark:text-white/50">
            {{ 'admin.aiCardMessages' | transloco }}
          </p>
          <p class="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
            {{ data().totalMessages }}
          </p>
        </div>
        <div class="glass-card p-5">
          <p class="text-xs uppercase tracking-wider text-slate-500 dark:text-white/50">
            {{ 'admin.aiCardTokens' | transloco }}
          </p>
          <p class="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{{ tokens() }}</p>
          <p class="mt-1 text-xs text-slate-500 dark:text-white/50">
            ~ \${{ cost() }} {{ 'admin.aiCardTokensHint' | transloco }}
          </p>
        </div>
      </div>

      <section class="glass-card p-5">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-3">
          {{ 'admin.aiToolBreakdown' | transloco }}
        </h2>
        @if (data().toolBreakdown.length === 0) {
          <p class="text-sm text-slate-500 dark:text-white/50">
            {{ 'admin.aiNoToolCalls' | transloco }}
          </p>
        } @else {
          <ul class="space-y-2 text-sm" role="list">
            @for (tool of data().toolBreakdown; track tool.name) {
              <li class="flex items-center justify-between gap-2">
                <span class="font-mono text-xs text-gray-700 dark:text-white/80">{{ tool.name }}</span>
                <span class="font-bold text-gray-900 dark:text-white">{{ tool.count }}</span>
              </li>
            }
          </ul>
        }
      </section>

      <section class="glass-card p-5">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-3">
          {{ 'admin.aiChartTitle' | transloco }}
        </h2>
        @if (maxBucket() === 0) {
          <p class="text-sm text-slate-500 dark:text-white/50">
            {{ 'admin.aiNoActivity' | transloco }}
          </p>
        } @else {
          <div class="flex items-end gap-2 h-40">
            @for (bucket of data().last7Days; track bucket.date) {
              <div class="flex-1 flex flex-col items-center justify-end gap-1">
                <div class="text-[10px] text-slate-500 dark:text-white/50">{{ bucket.count }}</div>
                <div
                  class="w-full bg-gradient-to-t from-amber-500/80 to-orange-500/80 rounded-t-md transition-all"
                  [style.height.%]="barHeight(bucket.count)"
                ></div>
                <div class="text-[10px] text-slate-500 dark:text-white/50">
                  {{ shortDay(bucket.date) }}
                </div>
              </div>
            }
          </div>
        }
      </section>

      <section class="glass-card p-5">
        <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">
            {{ 'admin.aiRecentTitle' | transloco }}
          </h2>
          <form [formGroup]="filters" (ngSubmit)="apply()" class="flex gap-2">
            <input
              type="text"
              formControlName="userEmail"
              [placeholder]="'admin.filterLandlordEmail' | transloco"
              [attr.aria-label]="'admin.aiColUser' | transloco"
              class="glass-input text-xs py-1 px-2"
            />
            <button type="submit" class="glass-button text-xs py-1 px-2">
              {{ 'admin.applyFilters' | transloco }}
            </button>
          </form>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-white/50">
              <tr>
                <th class="px-3 py-2">{{ 'admin.aiColUser' | transloco }}</th>
                <th class="px-3 py-2">{{ 'admin.aiColTitle' | transloco }}</th>
                <th class="px-3 py-2">{{ 'admin.aiColCount' | transloco }}</th>
                <th class="px-3 py-2">{{ 'admin.aiColLastMessage' | transloco }}</th>
                <th class="px-3 py-2">{{ 'admin.aiColUpdated' | transloco }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-white/5">
              @for (row of data().recent; track row.id) {
                <tr class="hover:bg-gray-50 dark:hover:bg-white/5">
                  <td class="px-3 py-2 truncate max-w-[180px]" [title]="row.userEmail ?? 'guest'">
                    {{ row.userEmail ?? 'guest' }}
                  </td>
                  <td class="px-3 py-2 truncate max-w-[180px]">{{ row.title ?? '—' }}</td>
                  <td class="px-3 py-2 font-medium">{{ row.messageCount }}</td>
                  <td
                    class="px-3 py-2 text-xs text-slate-500 dark:text-white/60 truncate max-w-[280px]"
                    [title]="row.lastMessage ?? ''"
                  >
                    {{ row.lastMessage ?? '—' }}
                  </td>
                  <td class="px-3 py-2 text-xs text-slate-500 dark:text-white/60">
                    <a [routerLink]="detailLink(row.id)" class="hover:underline">{{
                      stamp(row.updatedAt)
                    }}</a>
                  </td>
                </tr>
              }
              @if (data().recent.length === 0) {
                <tr>
                  <td colspan="5" class="px-3 py-8 text-center text-sm text-slate-500 dark:text-white/50">
                    {{ 'admin.noResults' | transloco }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
})
export class AdminAiPage {
  protected readonly culture = inject(CultureService);
  private readonly admin = inject(AdminService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly data = signal<AdminAi>(EMPTY);

  protected readonly maxBucket = computed(() =>
    this.data().last7Days.reduce((max, bucket) => Math.max(max, bucket.count), 0),
  );

  protected readonly filters = this.fb.nonNullable.group({
    userEmail: [this.route.snapshot.queryParamMap.get('userEmail') ?? ''],
  });

  constructor() {
    applyPrivatePageTitle('admin.aiTitle');
    this.route.queryParamMap
      .pipe(
        switchMap((params) =>
          this.admin.ai(params.get('userEmail')).pipe(catchError(() => of(EMPTY))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((data) => this.data.set(data));
  }

  protected apply(): void {
    const userEmail = this.filters.getRawValue().userEmail.trim();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { userEmail: userEmail || null },
    });
  }

  protected detailLink(id: string): string[] {
    return ['/', this.culture.culture(), 'admin', 'ai', id];
  }

  /** "12,345" — mismo formato N0 que el origen. */
  protected tokens(): string {
    return this.data().estimatedTokens.toLocaleString('en-CA');
  }

  /** Cuatro decimales: a esta escala el coste vive por debajo del centavo. */
  protected cost(): string {
    return this.data().estimatedCostUsd.toFixed(4);
  }

  /** Altura relativa al dia mas activo. Un dia a cero se ve como barra vacia, no desaparece. */
  protected barHeight(count: number): number {
    const max = this.maxBucket();
    return max === 0 ? 0 : Math.round((count / max) * 100);
  }

  protected stamp(value: string): string {
    return formatStamp(value);
  }

  /** "Aug 9" — la etiqueta del eje. La fecha llega sin hora, asi que se ancla a medianoche
   *  LOCAL: parseada a secas seria UTC y al oeste de Greenwich pintaria el dia anterior. */
  protected shortDay(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString(
      this.culture.culture() === 'fr' ? 'fr-CA' : 'en-CA',
      { month: 'short', day: 'numeric' },
    );
  }
}
