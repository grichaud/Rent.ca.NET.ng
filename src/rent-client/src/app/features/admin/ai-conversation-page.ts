import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, of, switchMap } from 'rxjs';
import { AdminAiConversation, AdminService, AiMessageRole } from '../../core/api/admin.service';
import { CultureService } from '../../core/i18n/culture.service';
import { formatStamp } from './admin-ui';

/** Cada rol con su color; Tool comparte el ambar del panel porque es maquinaria interna. */
const ROLE_CLASSES: Record<AiMessageRole, string> = {
  User: 'bg-brand-500/20 text-brand-700 dark:text-brand-300',
  Assistant: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  Tool: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  System: 'bg-slate-500/20 text-slate-700 dark:text-white/70',
};

/**
 * Port de Admin/Pages/AiConversation.cshtml: la transcripcion completa de una conversacion,
 * con los argumentos y el resultado de cada llamada a herramienta plegados en un `details`.
 *
 * Los mensajes llegan ya ordenados de mas antiguo a mas nuevo: una conversacion se lee de
 * arriba abajo.
 */
@Component({
  selector: 'app-admin-ai-conversation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe],
  template: `
    <div class="space-y-6">
      <div class="flex items-center gap-3">
        <a
          [routerLink]="backLink()"
          class="text-sm text-slate-500 dark:text-white/60 hover:underline"
          >&larr; {{ 'admin.aiBackToList' | transloco }}</a
        >
      </div>

      @if (conversation(); as c) {
        <div class="glass-card p-5">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p class="text-xs uppercase tracking-wider text-slate-500 dark:text-white/50">
                {{ 'admin.aiColUser' | transloco }}
              </p>
              <p class="font-medium text-gray-900 dark:text-white">{{ c.userEmail ?? 'guest' }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wider text-slate-500 dark:text-white/50">
                {{ 'admin.aiSession' | transloco }}
              </p>
              <p
                class="font-mono text-xs text-gray-700 dark:text-white/70 truncate"
                [title]="c.sessionId ?? ''"
              >
                {{ shortSession(c.sessionId) }}
              </p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wider text-slate-500 dark:text-white/50">
                {{ 'admin.aiCreated' | transloco }}
              </p>
              <p class="text-gray-900 dark:text-white">{{ stamp(c.createdAt) }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wider text-slate-500 dark:text-white/50">
                {{ 'admin.aiColCount' | transloco }}
              </p>
              <p class="font-bold text-gray-900 dark:text-white">{{ c.messages.length }}</p>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          @for (message of c.messages; track message.id) {
            <div class="glass-card p-4">
              <div class="flex items-center gap-2 mb-2">
                <span
                  class="inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  [class]="roleClass(message.role)"
                  >{{ message.role }}</span
                >
                @if (message.toolName) {
                  <span class="font-mono text-xs text-slate-500 dark:text-white/60">{{
                    message.toolName
                  }}</span>
                }
                <span class="ml-auto text-[10px] text-slate-400 dark:text-white/40">{{
                  stamp(message.createdAt)
                }}</span>
              </div>

              <pre class="whitespace-pre-wrap text-sm text-gray-800 dark:text-white/90 font-sans">{{
                message.content
              }}</pre>

              @if (message.toolArgsJson) {
                <details class="mt-2">
                  <summary class="text-xs text-slate-500 dark:text-white/50 cursor-pointer">
                    {{ 'admin.aiToolArgs' | transloco }}
                  </summary>
                  <pre
                    class="mt-1 text-xs bg-gray-50 dark:bg-white/5 p-2 rounded font-mono overflow-x-auto"
                    >{{ message.toolArgsJson }}</pre
                  >
                </details>
              }

              @if (message.toolResultJson) {
                <details class="mt-2">
                  <summary class="text-xs text-slate-500 dark:text-white/50 cursor-pointer">
                    {{ 'admin.aiToolResult' | transloco }}
                  </summary>
                  <pre
                    class="mt-1 text-xs bg-gray-50 dark:bg-white/5 p-2 rounded font-mono overflow-x-auto"
                    >{{ message.toolResultJson }}</pre
                  >
                </details>
              }
            </div>
          }
        </div>
      } @else if (notFound()) {
        <p class="text-slate-500 dark:text-white/60">Not found.</p>
      }
    </div>
  `,
})
export class AdminAiConversationPage {
  protected readonly culture = inject(CultureService);
  private readonly admin = inject(AdminService);
  private readonly route = inject(ActivatedRoute);

  protected readonly conversation = signal<AdminAiConversation | null>(null);
  protected readonly notFound = signal(false);

  constructor() {
    // Por paramMap y no por snapshot: navegar de una conversacion a otra reutiliza el
    // componente (misma ruta, otro :id) y con el snapshot se quedaria la primera.
    this.route.paramMap
      .pipe(
        switchMap((params) =>
          this.admin.conversation(params.get('id') ?? '').pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((data) => {
        this.conversation.set(data);
        this.notFound.set(data === null);
      });
  }

  protected backLink(): string[] {
    return ['/', this.culture.culture(), 'admin', 'ai'];
  }

  protected roleClass(role: AiMessageRole): string {
    return ROLE_CLASSES[role] ?? ROLE_CLASSES.System;
  }

  protected stamp(value: string): string {
    return formatStamp(value);
  }

  /** Los 8 primeros caracteres bastan para reconocer una sesion sin ocupar la celda entera. */
  protected shortSession(sessionId: string | null): string {
    return sessionId ? sessionId.slice(0, 8) : '—';
  }
}
