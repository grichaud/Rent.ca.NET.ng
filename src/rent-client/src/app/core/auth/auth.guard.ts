import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CultureService } from '../i18n/culture.service';
import { AuthService } from './auth.service';
import { Role } from './auth.types';

/**
 * Exige sesion iniciada. Al rebotar guarda la ruta pedida en `returnUrl` para devolver al
 * usuario donde queria ir, que es lo que hacia el origen con el mismo parametro.
 *
 * El guard espera a `ensureSessionLoaded` en vez de leer el signal a secas: en una navegacion
 * directa (o en SSR) la sesion todavia no se ha resuelto, y mirar el signal en ese instante
 * echaria a un usuario que si tiene cookie.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const culture = inject(CultureService);

  const user = await auth.ensureSessionLoaded();
  if (user) return true;

  return router.createUrlTree([`/${culture.culture()}/login`], {
    queryParams: { returnUrl: state.url },
  });
};

/**
 * Exige un rol. Admin entra a todas partes: es el rol mas privilegiado y en el origen ya
 * gobernaba sobre los otros dos.
 */
export function roleGuard(role: Role): CanActivateFn {
  return async (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const culture = inject(CultureService);

    const user = await auth.ensureSessionLoaded();
    if (!user) {
      return router.createUrlTree([`/${culture.culture()}/login`], {
        queryParams: { returnUrl: state.url },
      });
    }

    if (user.roles.includes(role) || user.roles.includes('Admin')) return true;

    // Ya identificado pero sin permiso: a la home, no al login. Mandarlo a iniciar sesion
    // sugiere que le falta autenticarse cuando lo que le falta es autorizacion.
    return router.createUrlTree([`/${culture.culture()}`]);
  };
}
