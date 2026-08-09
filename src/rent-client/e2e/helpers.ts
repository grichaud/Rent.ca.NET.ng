import { Page, expect } from '@playwright/test';

/**
 * Utilidades compartidas por las suites E2E.
 *
 * Los tests corren contra la base de DESARROLLO, igual que los scripts `validate-*.ps1`: cada
 * uno se crea su propia cuenta con un correo unico en vez de reutilizar una fija. Compartir
 * cuenta entre tests los acopla —el favorito de uno aparece en la lista del otro— y ademas
 * impide volver a correr la suite sin limpiar la base a mano.
 */

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@e2e.local`;
}

export const PASSWORD = 'Password123!';

/** Da de alta una cuenta por la interfaz y espera al portal que le corresponde. */
export async function signUp(page: Page, role: 'Renter' | 'Landlord', email: string): Promise<void> {
  await page.goto('/en/signup');

  await page.locator('#fullName').fill(`E2E ${role}`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#confirmPassword').fill(PASSWORD);

  // El radio real es `sr-only` (invisible para Playwright): se pulsa la tarjeta que lo envuelve,
  // que es exactamente lo que hace una persona.
  if (role === 'Landlord') {
    await page.locator('label').filter({ hasText: 'Landlord' }).first().click();
  }

  await page.getByRole('button', { name: 'Create account' }).click();

  // El alta redirige al portal segun el rol; esperar la URL evita que el test siga adelante
  // mientras la sesion aun se esta estableciendo.
  await expect(page).toHaveURL(new RegExp(`/en/${role.toLowerCase()}`));
}

/** Slug de una ciudad del catalogo sembrado, tal y como lo genera la home. */
export function citySlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}
