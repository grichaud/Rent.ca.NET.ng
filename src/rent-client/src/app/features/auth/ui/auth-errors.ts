import { HttpErrorResponse } from '@angular/common/http';
import { FieldErrors } from '../../../core/auth/auth.types';

/**
 * Traduce lo que devuelve la API a errores por campo.
 *
 * La API habla dos dialectos de error: ValidationProblemDetails (400, con `errors` por campo)
 * para los formularios, y ProblemDetails (401, 410...) con un `title` suelto para los fallos
 * que no pertenecen a ningun campo. Ambos terminan aqui en la misma forma, y lo que no encaja
 * en ninguno cae en un mensaje generico: dejar la pantalla sin decir nada ante un fallo de red
 * es peor que un mensaje impreciso.
 */
export function toFieldErrors(error: unknown, fallback: string): FieldErrors {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { errors?: FieldErrors; title?: string } | null;

    if (body?.errors && typeof body.errors === 'object') return body.errors;
    if (body?.title) return { '': [body.title] };
  }

  return { '': [fallback] };
}

/** Errores generales: los que la API devuelve sin nombre de campo. */
export function generalErrors(errors: FieldErrors): string[] {
  return errors[''] ?? [];
}
