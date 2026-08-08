import { HttpClient } from '@angular/common/http';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Observable, catchError, firstValueFrom, map, of, tap } from 'rxjs';
import { API_BASE_URL } from '../api/api.service';
import { fetchXsrfToken } from './csrf';
import {
  AuthResponse, CurrentUser, ExternalPending, ExternalPendingResponse, LoginPayload, MeResponse,
  ResetPasswordPayload, Role, SignupPayload,
} from './auth.types';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly _user = signal<CurrentUser | null>(null);
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  private readonly _externalProviders = signal<string[]>([]);
  /** Solo se ofrece Google si el servidor tiene credenciales; si no, el boton llevaria a error. */
  readonly googleEnabled = computed(() => this._externalProviders().includes('Google'));

  /** Iniciales para el avatar del header cuando el usuario no tiene foto. */
  readonly initials = computed(() => {
    const name = this._user()?.fullName?.trim();
    if (!name) return this._user()?.email?.[0]?.toUpperCase() ?? '?';
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  });

  hasRole(role: Role): boolean {
    return this._user()?.roles.includes(role) ?? false;
  }

  /**
   * Carga la sesion. Corre tambien durante el render de servidor —el interceptor de SSR le
   * presta la cookie del visitante—, de forma que el HTML servido ya sale con el usuario
   * correcto en vez de pintarse anonimo y corregirse al hidratar.
   */
  loadSession(): Observable<CurrentUser | null> {
    return this.http.get<MeResponse>(`${this.base}/api/auth/me`).pipe(
      tap((response) => this._externalProviders.set(response.externalProviders ?? [])),
      map((response) => response.user),
      catchError(() => of(null)),
      tap((user) => this._user.set(user)),
    );
  }

  login(payload: LoginPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/api/auth/login`, payload)
      .pipe(tap((response) => this.adoptSession(response)));
  }

  signup(payload: SignupPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/api/auth/signup`, payload)
      .pipe(tap((response) => this.adoptSession(response)));
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.base}/api/auth/logout`, {}).pipe(
      tap(() => {
        this._user.set(null);
        void this.refreshCsrf();
      }),
    );
  }

  forgotPassword(email: string, culture: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.base}/api/auth/forgot-password`, { email, culture });
  }

  validateResetToken(email: string, token: string): Observable<boolean> {
    const params = `email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
    return this.http
      .get<{ valid: boolean }>(`${this.base}/api/auth/reset-password/validate?${params}`)
      .pipe(map((r) => r.valid), catchError(() => of(false)));
  }

  resetPassword(payload: ResetPasswordPayload): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/api/auth/reset-password`, payload);
  }

  externalPending(): Observable<ExternalPending | null> {
    return this.http
      .get<ExternalPendingResponse>(`${this.base}/api/auth/external/pending`)
      .pipe(map((r) => r.pending), catchError(() => of(null)));
  }

  externalConfirm(fullName: string, role: Role, culture: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(
        `${this.base}/api/auth/external/confirm?culture=${culture}`, { fullName, role })
      .pipe(tap((response) => this.adoptSession(response)));
  }

  /**
   * URL a la que hay que navegar —con el navegador entero, no por XHR— para arrancar el flujo
   * de Google. Es una redireccion del servidor al proveedor: una peticion de fondo acabaria
   * bloqueada por CORS y ademas perderia las cookies de correlacion que ASP.NET deja por el
   * camino.
   */
  externalChallengeUrl(provider: string, culture: string, returnUrl?: string): string {
    let url = `/api/auth/external/challenge?provider=${encodeURIComponent(provider)}&culture=${culture}`;
    if (returnUrl) url += `&returnUrl=${encodeURIComponent(returnUrl)}`;
    return url;
  }

  /**
   * Pide un token de antiforgery nuevo. Obligatorio despues de cada cambio de sesion: el token
   * de ASP.NET va ligado a la identidad, asi que el que se emitio siendo anonimo deja de valer
   * en cuanto hay usuario, y la siguiente peticion moriria con un 400 desconcertante.
   */
  async refreshCsrf(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    // Se borra la cookie vieja primero: si el navegador se queda con ella, el interceptor la
    // dara por buena y volvera a mandar el token caducado.
    this.document.cookie = 'XSRF-TOKEN=; path=/; max-age=0; SameSite=Lax';
    await fetchXsrfToken(this.document);
  }

  private adoptSession(response: AuthResponse): void {
    this._user.set(response.user);
    void this.refreshCsrf();
  }

  /** Utilidad para los guards, que necesitan esperar a que la sesion este resuelta. */
  async ensureSessionLoaded(): Promise<CurrentUser | null> {
    if (this._user() !== null) return this._user();
    return await firstValueFrom(this.loadSession());
  }
}
