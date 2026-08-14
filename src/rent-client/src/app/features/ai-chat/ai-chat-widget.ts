import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { AiChatService, ChatMessage } from '../../core/api/ai-chat.service';
import { AiContextService } from '../../core/ai/ai-context.service';
import { CultureService } from '../../core/i18n/culture.service';
import { Icon } from '../../shared/ui/icon/icon';

/** Mensaje pintado: los del servidor tienen id; el que se esta escribiendo, todavia no. */
interface Bubble {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Port de Features/AiChat/Partials/_AiChatWidget.cshtml.
 *
 * El widget NO se monta en el servidor: el chat es interaccion pura, el hilo abierto se pide
 * al abrir el panel y renderizarlo en SSR solo añadiria peso al HTML de todas las paginas.
 */
@Component({
  selector: 'app-ai-chat-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, Icon],
  template: `
    @if (browser) {
      <button
        type="button"
        (click)="toggle()"
        class="fixed bottom-6 right-6 z-50 inline-flex items-center justify-center h-14 w-14 rounded-full bg-gradient-to-br from-brand-500/80 to-cyan-500/80 backdrop-blur-xl border border-white/20 shadow-xl shadow-brand-500/30 hover:shadow-2xl hover:shadow-brand-500/50 hover:scale-110 active:scale-95 transition-all duration-300 animate-glow focus:outline-none focus:ring-4 focus:ring-brand-500/40"
        [attr.aria-label]="'aiChat.chatButton' | transloco"
        [attr.aria-expanded]="open()"
        aria-controls="ai-chat-panel"
      >
        <app-icon name="sparkles" class="h-6 w-6 text-white" />
      </button>

      @if (open()) {
        <div
          id="ai-chat-panel"
          class="fixed z-50 flex flex-col bottom-6 right-6 w-[400px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-2rem)] glass-modal overflow-hidden max-md:inset-3 max-md:w-auto max-md:h-auto max-md:max-h-none"
          role="dialog"
          aria-labelledby="ai-chat-title"
        >
          <div class="glass-highlight"></div>

          <header
            class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-white/10 shrink-0"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span
                class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/20 border border-brand-500/30 shrink-0"
              >
                <app-icon name="sparkles" class="h-4 w-4 text-brand-400" />
              </span>
              <div class="min-w-0">
                <p
                  id="ai-chat-title"
                  class="text-sm font-semibold text-gray-900 dark:text-white leading-none truncate"
                >
                  {{ 'aiChat.title' | transloco }}
                </p>
                <p class="text-xs text-gray-500 dark:text-white/40 mt-0.5">
                  {{ (sending() ? 'aiChat.thinking' : 'aiChat.online') | transloco }}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-1 shrink-0">
              @if (bubbles().length > 0) {
                <button
                  type="button"
                  (click)="clear()"
                  class="text-xs text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                  [title]="'aiChat.clearChat' | transloco"
                >
                  {{ 'aiChat.clearChat' | transloco }}
                </button>
              }
              <button
                type="button"
                (click)="close()"
                class="h-7 w-7 rounded-lg inline-flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                [attr.aria-label]="'aiChat.close' | transloco"
              >
                <app-icon name="x" class="h-4 w-4 text-gray-500 dark:text-white/60" />
              </button>
            </div>
          </header>

          @if (bubbles().length === 0) {
            <div class="flex-1 flex flex-col items-center justify-center text-center gap-3 pb-4 px-6">
              <div
                class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/20 border border-brand-500/30"
              >
                <span class="text-2xl" role="img" aria-hidden="true">🏠</span>
              </div>
              <div>
                <p class="text-gray-800 dark:text-white/80 text-sm font-medium">
                  {{ 'aiChat.greeting' | transloco }}
                </p>
                <p class="text-gray-500 dark:text-white/40 text-xs mt-1">
                  {{ 'aiChat.greetingSub' | transloco }}
                </p>
              </div>
            </div>

            <div class="px-4 pb-3">
              <p class="text-xs text-gray-500 dark:text-white/40 mb-2">
                {{ 'aiChat.tryAsking' | transloco }}
              </p>
              <div class="flex flex-wrap gap-2">
                @for (suggestion of suggestions; track suggestion) {
                  <button
                    type="button"
                    (click)="useSuggestion(suggestion)"
                    class="glass-badge text-xs text-gray-700 dark:text-white/70 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/15 transition-colors duration-200 cursor-pointer text-left"
                  >
                    {{ suggestion | transloco }}
                  </button>
                }
              </div>
            </div>
          } @else {
            <div
              #scroller
              class="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0"
              aria-live="polite"
              aria-atomic="false"
            >
              @for (bubble of bubbles(); track bubble.id) {
                <div class="flex" [class.justify-end]="bubble.role === 'user'">
                  <div
                    class="max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words"
                    [class]="
                      bubble.role === 'user'
                        ? 'bg-brand-500/30 border border-brand-500/40 text-gray-900 dark:text-white'
                        : 'glass-base text-gray-800 dark:text-white/90'
                    "
                  >
                    {{ bubble.content }}
                  </div>
                </div>
              }
              @if (errorKey()) {
                <p role="alert" class="text-xs text-rose-600 dark:text-rose-300">
                  {{ errorKey()! | transloco }}
                </p>
              }
            </div>
          }

          <form
            (submit)="send($event)"
            class="glass-base mx-3 mb-3 flex items-end gap-2 p-2 rounded-2xl"
          >
            <textarea
              #input
              rows="1"
              maxlength="2000"
              [value]="draft()"
              (input)="onInput($event)"
              (keydown)="onKeydown($event)"
              [disabled]="sending()"
              [placeholder]="'aiChat.inputPlaceholder' | transloco"
              class="flex-1 resize-none bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 outline-none leading-relaxed py-1 px-1 max-h-24 overflow-y-auto disabled:opacity-50"
              style="min-height:24px;"
              [attr.aria-label]="'aiChat.inputPlaceholder' | transloco"
            ></textarea>
            <button
              type="submit"
              [disabled]="sending() || draft().trim().length === 0"
              class="h-8 w-8 rounded-xl inline-flex items-center justify-center shrink-0 bg-brand-500/30 hover:bg-brand-500/50 border border-brand-500/40 transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              [attr.aria-label]="'aiChat.send' | transloco"
            >
              <app-icon name="send" class="h-4 w-4 text-brand-300" />
            </button>
          </form>
        </div>
      }
    }
  `,
})
export class AiChatWidget {
  private readonly chat = inject(AiChatService);
  private readonly aiContext = inject(AiContextService);
  private readonly culture = inject(CultureService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  protected readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly suggestions = ['aiChat.suggestion1', 'aiChat.suggestion2', 'aiChat.suggestion3'];

  protected readonly open = signal(false);
  protected readonly sending = signal(false);
  protected readonly draft = signal('');
  protected readonly errorKey = signal<string | null>(null);

  private readonly history = signal<Bubble[]>([]);
  /** Texto del mensaje que se esta escribiendo ahora mismo; null cuando no hay ninguno. */
  private readonly streaming = signal<string | null>(null);

  protected readonly bubbles = computed<Bubble[]>(() => {
    const pending = this.streaming();
    return pending === null
      ? this.history()
      : [...this.history(), { id: 'streaming', role: 'assistant' as const, content: pending }];
  });

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly input = viewChild<ElementRef<HTMLTextAreaElement>>('input');

  private abort: AbortController | null = null;
  private currentUrl = this.router.url;
  private loaded = false;

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => (this.currentUrl = event.urlAfterRedirects));

    // El scroll sigue al ultimo mensaje mientras se escribe.
    effect(() => {
      this.bubbles();
      queueMicrotask(() => {
        const element = this.scroller()?.nativeElement;
        if (element) element.scrollTop = element.scrollHeight;
      });
    });

    // Otras pantallas pueden pedir que el chat se abra ("Ask AI About This Listing" en la ficha,
    // "Chat with our AI Assistant" en la home). Se ignora el valor inicial: el efecto corre una
    // vez al crearse y sin esto el widget arrancaria abierto en cada carga.
    let atendidas = this.aiContext.openRequests();
    effect(() => {
      const pedidas = this.aiContext.openRequests();
      if (pedidas === atendidas) return;
      atendidas = pedidas;
      if (!this.open()) this.toggle();
    });
  }

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);

    // El hilo vivo se pide una sola vez y solo al abrir: cargarlo al arrancar la app costaria
    // una peticion en cada pagina a la mayoria de visitantes, que nunca abren el chat.
    if (next && !this.loaded) {
      this.loaded = true;
      this.chat.active().subscribe({
        next: ({ conversation }) => {
          if (!conversation) return;
          this.chat.conversationId.set(conversation.id);
          this.history.set(
            conversation.messages.map((m: ChatMessage) => ({
              id: m.id,
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.content,
            })),
          );
        },
        error: () => {
          // Sin hilo previo el chat arranca vacio, que es un estado valido.
        },
      });
    }
  }

  protected close(): void {
    this.open.set(false);
    // Cortar la lectura en curso: el panel cerrado no puede pintar lo que llegue despues.
    this.abort?.abort();
    this.abort = null;
    this.sending.set(false);
    this.streaming.set(null);
  }

  protected clear(): void {
    this.abort?.abort();
    this.abort = null;
    this.sending.set(false);
    this.streaming.set(null);
    this.history.set([]);
    this.errorKey.set(null);
    this.chat.startNew().subscribe({ error: () => undefined });
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  /** Enter envia; Shift+Enter hace salto de linea, como en el origen. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.dispatch();
    }
  }

  protected useSuggestion(key: string): void {
    this.draft.set(this.transloco.translate(key));
    this.input()?.nativeElement.focus();
  }

  protected send(event: Event): void {
    event.preventDefault();
    void this.dispatch();
  }

  private async dispatch(): Promise<void> {
    const message = this.draft().trim();
    if (!message || this.sending()) return;

    this.draft.set('');
    this.errorKey.set(null);
    this.sending.set(true);
    this.history.set([
      ...this.history(),
      { id: `local-${this.history().length}`, role: 'user', content: message },
    ]);
    this.streaming.set('');

    this.abort = new AbortController();
    let text = '';

    const stream = this.chat.send(
      {
        conversationId: this.chat.conversationId(),
        message,
        locale: this.culture.culture(),
        context: {
          currentPage: this.currentUrl,
          currentCity: this.cityFromUrl(),
          currentPropertyId: this.aiContext.currentPropertyId(),
        },
      },
      this.abort.signal,
    );

    for await (const event of stream) {
      if (event.type === 'chunk') {
        text += event.content;
        this.streaming.set(text);
      } else if (event.type === 'done') {
        this.chat.conversationId.set(event.conversationId);
      } else {
        // Todos los fallos comparten `common.error`, incluida la cuota agotada. Distinguirlos
        // pedia una clave nueva, y `translations.ts` se GENERA desde los .resx del origen:
        // cualquier clave añadida a mano desaparece en la siguiente regeneracion.
        this.errorKey.set('common.error');
      }
    }

    // El texto acumulado pasa a ser un mensaje mas del historial.
    if (text) {
      this.history.set([
        ...this.history(),
        { id: `assistant-${this.history().length}`, role: 'assistant', content: text },
      ]);
    }
    this.streaming.set(null);
    this.sending.set(false);
    this.abort = null;
  }

  /**
   * Ciudad de la URL: `/en/toronto` y `/en/toronto/mi-piso` la llevan en el segundo segmento.
   * Se descartan los segmentos que son secciones (portales, contenido), no ciudades.
   */
  private cityFromUrl(): string | null {
    const segments = this.currentUrl.split('?')[0].split('/').filter(Boolean);
    if (segments.length < 2) return null;

    const candidate = segments[1];
    const reserved = new Set([
      'renter', 'landlord', 'admin', 'login', 'signup', 'forgot-password',
      'reset-password', 'external-login-confirm', 'about', 'faq', 'privacy', 'landlords',
    ]);
    return reserved.has(candidate) ? null : candidate;
  }
}
