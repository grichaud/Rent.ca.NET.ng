import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { FieldErrors } from '../../core/auth/auth.types';
import { CultureService } from '../../core/i18n/culture.service';
import { Icon } from '../../shared/ui/icon/icon';
import { generalErrors, toFieldErrors } from './ui/auth-errors';
import { PasswordField } from './ui/password-field';

/**
 * Port de Features/Auth/Pages/ResetPassword.cshtml.
 *
 * El token se comprueba ANTES de pintar el formulario, igual que en el origen: si el enlace ya
 * caduco, mostrar los campos solo lleva al usuario a escribir una contrasena que sera
 * rechazada.
 */
@Component({
  selector: 'app-reset-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, Icon, PasswordField],
  template: `
    <div class="glass-card p-8 sm:p-10">
      @if (tokenInvalid()) {
        <div class="text-center py-2">
          <div class="mb-4 mx-auto w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
            <app-icon name="alert-circle" class="h-8 w-8 text-red-500 dark:text-red-400" />
          </div>
          <h1 class="font-sans font-bold tracking-tight text-3xl text-slate-900 dark:text-white">
            {{ 'auth.linkExpiredTitle' | transloco }}
          </h1>
          <p class="text-slate-500 dark:text-white/60 text-sm mt-2 mb-6">
            {{ 'auth.linkExpiredBody' | transloco }}
          </p>
          <a
            [routerLink]="['/', culture.culture(), 'forgot-password']"
            class="glass-button-primary inline-flex items-center gap-2 px-6 py-3"
            >{{ 'auth.requestNewLink' | transloco }}</a
          >
        </div>
      } @else if (checking()) {
        <p class="text-center text-slate-500 dark:text-white/60 py-8">…</p>
      } @else {
        <h1
          class="font-sans font-bold tracking-tight text-3xl text-slate-900 dark:text-white text-center"
        >
          {{ 'auth.resetTitle' | transloco }}
        </h1>
        <p class="text-slate-500 dark:text-white/60 text-center mt-2">
          {{ 'auth.resetForEmail' | transloco }} <strong>{{ email() }}</strong>
        </p>

        <form [formGroup]="form" (ngSubmit)="submit()" class="mt-8 space-y-4">
          @for (message of general(); track message) {
            <p role="alert" class="text-sm text-red-600 dark:text-red-400">{{ message }}</p>
          }

          <div>
            <label for="password" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
              'renter.accountNewPassword' | transloco
            }}</label>
            <app-password-field [control]="form.controls.password" controlId="password" />
            @for (message of errors()['password'] ?? []; track message) {
              <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
            }
            <p class="text-xs text-slate-500 dark:text-white/50 mt-1">
              {{ 'auth.passwordHint' | transloco }}
            </p>
          </div>

          <div>
            <label
              for="confirmPassword"
              class="block text-sm text-slate-700 dark:text-white/80 mb-1"
              >{{ 'auth.confirmNewPassword' | transloco }}</label
            >
            <app-password-field
              [control]="form.controls.confirmPassword"
              controlId="confirmPassword"
            />
            @for (message of errors()['confirmPassword'] ?? []; track message) {
              <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
            }
          </div>

          <button
            type="submit"
            [disabled]="submitting()"
            class="glass-button-primary w-full mt-2 inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <app-icon name="lock" class="h-4 w-4" />
            {{ 'auth.resetSubmit' | transloco }}
          </button>
        </form>
      }
    </div>
  `,
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  protected readonly culture = inject(CultureService);

  private readonly params = this.route.snapshot.queryParamMap;
  protected readonly email = signal(this.params.get('email') ?? '');
  private readonly token = this.params.get('token') ?? '';

  protected readonly checking = signal(true);
  protected readonly tokenInvalid = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errors = signal<FieldErrors>({});
  protected readonly general = computed(() => generalErrors(this.errors()));

  protected readonly form = this.fb.nonNullable.group({
    password: ['', Validators.required],
    confirmPassword: ['', Validators.required],
  });

  constructor() {
    if (!this.email() || !this.token) {
      this.tokenInvalid.set(true);
      this.checking.set(false);
      return;
    }

    this.auth.validateResetToken(this.email(), this.token).subscribe((valid) => {
      this.tokenInvalid.set(!valid);
      this.checking.set(false);
    });
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errors.set({});

    this.auth
      .resetPassword({ email: this.email(), token: this.token, ...this.form.getRawValue() })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          void this.router.navigate([`/${this.culture.culture()}/login`], {
            queryParams: { message: this.transloco.translate('auth.resetSuccess') },
          });
        },
        error: (error: unknown) => {
          this.submitting.set(false);

          // 410 es el enlace caducado: la pantalla cambia entera a la tarjeta de recuperacion
          // en vez de pintar un error sobre un formulario que ya no sirve de nada.
          if (isGone(error)) {
            this.tokenInvalid.set(true);
            return;
          }

          this.errors.set(toFieldErrors(error, 'Could not update the password. Please try again.'));
        },
      });
  }
}

function isGone(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: number }).status === 410;
}
