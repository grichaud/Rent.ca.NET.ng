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
}
