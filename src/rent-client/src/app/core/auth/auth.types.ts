export type Role = 'Renter' | 'Landlord' | 'Admin';

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  roles: Role[];
}

/** `/api/auth/me` siempre devuelve un objeto; el usuario dentro puede ser null. */
export interface MeResponse {
  user: CurrentUser | null;
  /** Proveedores externos configurados en el servidor, p.ej. `['Google']`. */
  externalProviders: string[];
}

export interface AuthResponse {
  user: CurrentUser;
  /** Ruta SIN prefijo de idioma: `/landlord`, `/renter`, `/`. */
  redirectPath: string;
}

export interface ExternalPending {
  email: string;
  provider: string;
  suggestedFullName: string;
}

export interface ExternalPendingResponse {
  pending: ExternalPending | null;
}

export interface LoginPayload {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface SignupPayload {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: Role;
  culture: string;
}

export interface ResetPasswordPayload {
  email: string;
  token: string;
  password: string;
  confirmPassword: string;
}

/**
 * Errores de un formulario tal y como los devuelve la API (ValidationProblemDetails). La clave
 * es el nombre del control en camelCase; la clave vacia agrupa los errores generales.
 */
export type FieldErrors = Record<string, string[]>;
