import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { XSRF_HEADER, fetchXsrfToken, readXsrfCookie } from '../auth/csrf';
import { API_BASE_URL } from './api.service';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface ActiveConversation {
  id: string;
  title: string | null;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface ChatRequestContext {
  currentPage?: string | null;
  currentCity?: string | null;
  currentPropertyId?: string | null;
}

export interface ChatSendRequest {
  conversationId: string | null;
  message: string;
  locale: string;
  context: ChatRequestContext;
}

/** Lo que el consumidor recibe mientras la respuesta se escribe. */
export type ChatStreamEvent =
  | { type: 'chunk'; content: string }
  | { type: 'done'; conversationId: string }
  | { type: 'error'; message: string };

/**
 * Cliente del asistente.
 *
 * El envio usa `fetch` y no `HttpClient` por una razon concreta: la respuesta es un flujo de
 * Server-Sent Events sobre POST. `EventSource` solo sabe hacer GET, y `HttpClient` entrega el
 * cuerpo ya completo, con lo que el texto apareceria de golpe al final en vez de escribirse.
 *
 * El precio de salirse de `HttpClient` es que los interceptores no corren, asi que el token de
 * antiforgery hay que ponerlo a mano — de ahi que se reutilicen los helpers de `csrf.ts` en
 * lugar de duplicar la lectura de la cookie.
 */
@Injectable({ providedIn: 'root' })
export class AiChatService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly document = inject(DOCUMENT);

  /** Id del hilo abierto; null hasta que el servidor confirme el primero. */
  readonly conversationId = signal<string | null>(null);

  active(): Observable<{ conversation: ActiveConversation | null }> {
    return this.http.get<{ conversation: ActiveConversation | null }>(
      `${this.base}/api/ai/conversation`,
    );
  }

  /** "Limpiar chat": el servidor no borra nada, solo asegura la cookie de sesion. */
  startNew(): Observable<{ ok: boolean }> {
    this.conversationId.set(null);
    return this.http.post<{ ok: boolean }>(`${this.base}/api/ai/conversation/new`, {});
  }

  /**
   * Envia un mensaje y va entregando la respuesta a trozos.
   *
   * `signal` permite cortar la lectura si el usuario cierra el panel a media respuesta; sin
   * eso el flujo seguiria vivo consumiendo la conexion hasta terminar.
   */
  async *send(request: ChatSendRequest, abort: AbortSignal): AsyncGenerator<ChatStreamEvent> {
    const token = readXsrfCookie(this.document) ?? (await fetchXsrfToken(this.document));

    let response: Response;
    try {
      response = await fetch(`${this.base}/api/ai/chat`, {
        method: 'POST',
        credentials: 'same-origin',
        signal: abort,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { [XSRF_HEADER]: token } : {}),
        },
        body: JSON.stringify(request),
      });
    } catch {
      yield { type: 'error', message: 'network' };
      return;
    }

    if (!response.ok || !response.body) {
      // 429 (cuota agotada) y 400 (validacion) llegan como JSON, no como flujo de eventos.
      yield { type: 'error', message: response.status === 429 ? 'rateLimit' : 'network' };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Los eventos SSE se separan por linea en blanco. Un trozo de red puede cortar por
        // cualquier sitio, asi que el resto incompleto se queda en el buffer para la vuelta
        // siguiente en vez de intentar parsearlo a medias.
        let split = buffer.indexOf('\n\n');
        while (split !== -1) {
          const raw = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const event = parseEvent(raw);
          if (event) yield event;
          split = buffer.indexOf('\n\n');
        }
      }
    } catch {
      // Abortar la lectura entra por aqui; no es un fallo que deba pintarse.
    } finally {
      reader.releaseLock();
    }
  }
}

function parseEvent(raw: string): ChatStreamEvent | null {
  let name = '';
  let data = '';

  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }

  if (!name || !data) return null;

  try {
    const payload = JSON.parse(data) as { content?: string; conversationId?: string; message?: string };
    if (name === 'message' && typeof payload.content === 'string')
      return { type: 'chunk', content: payload.content };
    if (name === 'done' && payload.conversationId)
      return { type: 'done', conversationId: payload.conversationId };
    if (name === 'error') return { type: 'error', message: 'assistant' };
  } catch {
    return null;
  }

  return null;
}
