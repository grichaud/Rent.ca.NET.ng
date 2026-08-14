import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { FieldErrors } from '../../core/auth/auth.types';
import { CultureService } from '../../core/i18n/culture.service';
import { Icon } from '../../shared/ui/icon/icon';
import { generalErrors, toFieldErrors } from './ui/auth-errors';
import { applyPrivatePageTitle } from '../../core/seo/static-seo';

/** Port de Features/Auth/Pages/ForgotPassword.cshtml. */
@Component({
  selector: 'app-forgot-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, Icon],
  template: `
    <div class="glass-card p-8 sm:p-10">
      @if (submitted()) {
        <div class="text-center py-2">
          <div class="mb-4 mx-auto w-16 h-16 rounded-full bg-brand-500/20 flex items-center justify-center">
            <app-icon name="mail" class="h-8 w-8 text-brand-500 dark:text-brand-400" />
          </div>
          <h1 class="font-sans font-bold tracking-tight text-3xl text-slate-900 dark:text-white">
            {{ 'auth.checkEmailTitle' | transloco }}
          </h1>
          <p class="text-slate-500 dark:text-white/60 text-sm mt-2 mb-6">{{ checkEmailBody() }}</p>
          <a
            [routerLink]="['/', culture.culture(), 'login']"
            class="glass-button-primary inline-flex items-center gap-2 px-6 py-3"
            >{{ 'auth.backToLogin' | transloco }}</a
          >
        </div>
      } @else {
        <h1
          class="font-sans font-bold tracking-tight text-3xl text-slate-900 dark:text-white text-center"
        >
          {{ 'auth.forgotTitle' | transloco }}
        </h1>
        <p class="text-slate-500 dark:text-white/60 text-center mt-2">
          {{ 'auth.forgotDesc' | transloco }}
        </p>

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

          <button
            type="submit"
            [disabled]="submitting()"
            class="glass-button-primary w-full mt-2 inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <app-icon name="mail" class="h-4 w-4" />
            {{ 'auth.forgotSubmit' | transloco }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-slate-600 dark:text-white/70">
          <a
            [routerLink]="['/', culture.culture(), 'login']"
            class="inline-flex items-center gap-1.5 text-brand-600 dark:text-brand-400 font-medium hover:underline"
          >
            <app-icon name="chevron-left" class="h-3.5 w-3.5" />
            {{ 'auth.backToLogin' | transloco }}
          </a>
        </p>
      }
    </div>
  `,
})
export class ForgotPasswordPage {
  constructor() {
    applyPrivatePageTitle('auth.forgotTitle');
  }

  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);
  protected readonly culture = inject(CultureService);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly errors = signal<FieldErrors>({});
  protected readonly general = computed(() => generalErrors(this.errors()));
  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  private readonly sentTo = signal('');

  /**
   * El texto del origen lleva un `{0}` con el correo. Se interpola en texto plano y no como
   * HTML: el valor lo escribio el usuario, y pintarlo con innerHTML seria inyectar en la
   * pantalla lo que sea que haya tecleado.
   */
  protected readonly checkEmailBody = computed(() =>
    this.transloco
      .translate('auth.checkEmailBody')
      .replace('{0}', this.sentTo()),
  );

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const email = this.form.getRawValue().email.trim();
    this.submitting.set(true);
    this.errors.set({});

    this.auth.forgotPassword(email, this.culture.culture()).subscribe({
      next: () => {
        this.submitting.set(false);
        this.sentTo.set(email);
        this.submitted.set(true);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errors.set(toFieldErrors(error, 'Could not send the email. Please try again.'));
      },
    });
  }
}
