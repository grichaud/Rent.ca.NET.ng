import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { FieldErrors } from '../../core/auth/auth.types';
import { CultureService } from '../../core/i18n/culture.service';
import { Icon } from '../../shared/ui/icon/icon';
import { generalErrors, toFieldErrors } from './ui/auth-errors';
import { GoogleButton } from './ui/google-button';
import { PasswordField } from './ui/password-field';

/**
 * Port de Features/Auth/Pages/Login.cshtml.
 *
 * Los mensajes del retorno de Google llegan como codigo en `?authError=` y se traducen aqui.
 * En el origen el texto lo ponia el servidor en TempData, pero ahora el servidor que redirige
 * es la API y no conoce el idioma de la pantalla: mandar un codigo y traducirlo en el cliente
 * es lo unico que mantiene el mensaje en la lengua correcta.
 */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, Icon, PasswordField, GoogleButton],
  template: `
    <div class="glass-card p-8 sm:p-10">
      <h1
        class="font-sans font-bold tracking-tight text-3xl text-slate-900 dark:text-white text-center"
      >
        {{ 'auth.welcomeBack' | transloco }}
      </h1>
      <p class="text-slate-500 dark:text-white/60 text-center mt-2">
        {{ 'auth.signInDesc' | transloco }}
      </p>

      @if (externalError(); as message) {
        <div
          role="alert"
          class="mt-4 p-3 rounded-lg border border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10 text-sm text-red-700 dark:text-red-300"
        >
          {{ message }}
        </div>
      }

      @if (successMessage(); as message) {
        <div
          role="status"
          class="mt-4 p-3 rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10 text-sm text-emerald-700 dark:text-emerald-300"
        >
          {{ message }}
        </div>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" class="mt-8 space-y-4">
        @for (message of general(); track message) {
          <p role="alert" class="text-sm text-red-600 dark:text-red-400">{{ message }}</p>
        }

        <div>
          <label for="email" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
            'auth.email' | transloco
          }}</label>
          <div class="relative">
            <span
              class="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400 dark:text-white/40"
            >
              <app-icon name="mail" class="h-4 w-4" />
            </span>
            <input
              id="email"
              type="email"
              formControlName="email"
              autocomplete="email"
              [placeholder]="'auth.emailPlaceholder' | transloco"
              class="glass-input !pl-10"
            />
          </div>
          @for (message of errors()['email'] ?? []; track message) {
            <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
          }
        </div>

        <div>
          <div class="flex items-center justify-between mb-1">
            <label for="password" class="block text-sm text-slate-700 dark:text-white/80">{{
              'auth.password' | transloco
            }}</label>
            <a
              [routerLink]="['/', culture.culture(), 'forgot-password']"
              class="text-xs text-brand-600 dark:text-brand-400 hover:underline"
              >{{ 'auth.forgotPassword' | transloco }}</a
            >
          </div>
          <app-password-field
            [control]="passwordControl"
            controlId="password"
            autocomplete="current-password"
          />
          @for (message of errors()['password'] ?? []; track message) {
            <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
          }
        </div>

        <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-white/80">
          <input type="checkbox" formControlName="rememberMe" class="rounded" />
          {{ 'auth.rememberMe' | transloco }}
        </label>

        <button
          type="submit"
          [disabled]="submitting()"
          class="glass-button-primary w-full inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <app-icon name="log-in" class="h-4 w-4" />
          {{ 'auth.signInButton' | transloco }}
        </button>
      </form>

      @if (auth.googleEnabled()) {
        <app-google-button [href]="googleUrl()" />
      }

      <p class="mt-6 text-center text-sm text-slate-600 dark:text-white/70">
        {{ 'auth.dontHaveAccount' | transloco }}
        <a
          [routerLink]="['/', culture.culture(), 'signup']"
          class="text-brand-600 dark:text-brand-400 font-medium hover:underline ml-1"
          >{{ 'auth.signUpLink' | transloco }}</a
        >
      </p>
    </div>
  `,
})
export class LoginPage {
  protected readonly auth = inject(AuthService);
  protected readonly culture = inject(CultureService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    rememberMe: [false],
  });

  protected readonly passwordControl = this.form.controls.password;

  protected readonly errors = signal<FieldErrors>({});
  protected readonly general = computed(() => generalErrors(this.errors()));
  protected readonly submitting = signal(false);

  private readonly params = this.route.snapshot.queryParamMap;

  protected readonly externalError = computed(() => {
    const code = this.params.get('authError');
    if (!code) return null;
    return EXTERNAL_ERRORS[this.culture.culture()][code] ?? EXTERNAL_ERRORS[this.culture.culture()]['generic'];
  });

  /** Lo pone la pantalla de restablecer al terminar, para confirmar que ya puede entrar. */
  protected readonly successMessage = computed(() => this.params.get('message'));

  protected readonly googleUrl = computed(() =>
    this.auth.externalChallengeUrl('Google', this.culture.culture(), this.returnUrl() ?? undefined),
  );

  private returnUrl(): string | null {
    const value = this.params.get('returnUrl');
    return value?.startsWith('/') && !value.startsWith('//') ? value : null;
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errors.set({});

    this.auth.login(this.form.getRawValue()).subscribe({
      next: (response) => {
        this.submitting.set(false);
        const target = this.returnUrl() ?? `/${this.culture.culture()}${suffix(response.redirectPath)}`;
        void this.router.navigateByUrl(target);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errors.set(toFieldErrors(error, 'Invalid email or password.'));
      },
    });
  }
}

/** `/` como destino significa la home de la cultura, que ya aporta el prefijo. */
function suffix(redirectPath: string): string {
  return redirectPath === '/' ? '' : redirectPath;
}

const EXTERNAL_ERRORS: Record<string, Record<string, string>> = {
  en: {
    'google-failed': 'Google sign-in failed. Please try again.',
    'external-info-missing':
      'Could not retrieve external login info. Please click "Continue with Google" again.',
    generic: 'Sign-in failed. Please try again.',
  },
  fr: {
    'google-failed': 'La connexion Google a échoué. Veuillez réessayer.',
    'external-info-missing':
      'Impossible de récupérer les informations de connexion. Cliquez à nouveau sur « Continuer avec Google ».',
    generic: 'La connexion a échoué. Veuillez réessayer.',
  },
};
