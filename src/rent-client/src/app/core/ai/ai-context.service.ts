import { Injectable, signal } from '@angular/core';

/**
 * Contexto que el asistente recibe con cada mensaje: en que pagina esta el usuario, que ciudad
 * mira y, si procede, que propiedad tiene abierta.
 *
 * En el origen esto se leia de `HttpContext.Items["AiCurrentCity"]` y
 * `["AiCurrentPropertyId"]`... que **nadie escribe nunca**: las dos claves solo aparecen en el
 * widget que las lee, asi que el bloque "Current session context" del prompt jamas se rellena.
 * Aqui la pagina y la ciudad salen de la URL, y la ficha de listing publica su id al abrirse,
 * que es lo que hace util la quinta capacidad del asistente ("explica esta propiedad").
 */
@Injectable({ providedIn: 'root' })
export class AiContextService {
  /** Id de la propiedad abierta; null en cualquier otra pantalla. */
  readonly currentPropertyId = signal<string | null>(null);

  setProperty(id: string | null): void {
    this.currentPropertyId.set(id);
  }

  /**
   * Peticiones de apertura del asistente desde otras pantallas.
   *
   * El origen ofrece dos puertas de entrada al chat ademas del boton flotante: "Ask AI About
   * This Listing" en la ficha y "Chat with our AI Assistant" en la home. Ninguna existia aqui,
   * asi que la unica forma de descubrir el asistente era adivinar que el circulito de la esquina
   * hace algo — y desde la ficha, ademas, no habia nada que dijera que el chat YA sabe que
   * propiedad estas mirando.
   *
   * Es un contador y no un booleano a proposito: si fuera booleano, pedir abrir dos veces
   * seguidas (abrir, cerrar a mano, volver a pulsar) no emitiria cambio la segunda vez.
   */
  readonly openRequests = signal(0);

  requestOpen(): void {
    this.openRequests.update((n) => n + 1);
  }
}
