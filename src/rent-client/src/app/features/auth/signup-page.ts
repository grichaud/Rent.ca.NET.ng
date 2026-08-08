import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { FieldErrors, Role } from '../../core/auth/auth.types';
import { CultureService } from '../../core/i18n/culture.service';
import { Icon } from '../../shared/ui/icon/icon';
import { generalErrors, toFieldErrors } from './ui/auth-errors';
import { GoogleButton } from './ui/google-button';
import { PasswordField } from './ui/password-field';

/** Port de Features/Auth/Pages/Signup.cshtml. */
@Component({
  selector: 'app-signup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, Icon, PasswordField, GoogleButton],
  template: `
    <div class="glass-card p-8 sm:p-10">
      <h1
        class="font-sans font-bold tracking-tight text-3xl text-slate-900 dark:text-white text-center"
      >
        {{ 'auth.createAccount' | transloco }}
      </h1>
      <p class="text-slate-500 dark:text-white/60 text-center mt-2">
        {{ 'auth.signupQuick' | transloco }}
      </p>

      <form [formGroup]="form" (ngSubmit)="submit()" class="mt-8 space-y-4">
        @for (message of general(); track message) {
          <p role="alert" class="text-sm text-red-600 dark:text-red-400">{{ message }}</p>
        }

        <div>
          <label for="fullName" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
            'auth.fullName' | transloco
          }}</label>
          <div class="relative">
            <span
              class="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400 dark:text-white/40"
            >
              <app-icon name="user" class="h-4 w-4" />
            </span>
            <input
              id="fullName"
              formControlName="fullName"
              autocomplete="name"
              [placeholder]="'auth.fullNamePlaceholder' | transloco"
              class="glass-input !pl-10"
            />
          </div>
          @for (message of errors()['fullName'] ?? []; track message) {
            <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
          }
        </div>

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
          <label for="password" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
            'auth.password' | transloco
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
          <label for="confirmPassword" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
            'auth.confirmPassword' | transloco
          }}</label>
          <app-password-field
            [control]="form.controls.confirmPassword"
            controlId="confirmPassword"
          />
          @for (message of errors()['confirmPassword'] ?? []; track message) {
            <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
          }
        </div>

        <fieldset class="pt-2">
          <legend class="block text-sm text-slate-700 dark:text-white/80 mb-2">
            {{ 'auth.iAmA' | transloco }}
          </legend>
          <div class="grid grid-cols-2 gap-3">
            @for (option of roleOptions; track option.value) {
              <label
                class="glass-base p-4 flex flex-col items-start cursor-pointer transition-colors"
                [class.border-brand-500]="form.controls.role.value === option.value"
                [class.bg-brand-50]="form.controls.role.value === option.value"
                [class.dark:bg-brand-500/20]="form.controls.role.value === option.value"
              >
                <input type="radio" formControlName="role" [value]="option.value" class="sr-only" />
                <app-icon [name]="option.icon" class="h-5 w-5 text-brand-500 mb-2" />
                <span class="font-semibold text-slate-900 dark:text-white">{{
                  option.labelKey | transloco
                }}</span>
                <span class="text-xs text-slate-500 dark:text-white/60 mt-1">{{
                  option.descriptionKey | transloco
                }}</span>
              </label>
            }
          </div>
          @for (message of errors()['role'] ?? []; track message) {
            <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
          }
        </fieldset>

        <button
          type="submit"
          [disabled]="submitting()"
          class="glass-button-primary w-full mt-2 inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <app-icon name="user-plus" class="h-4 w-4" />
          {{ 'auth.signUpButton' | transloco }}
        </button>
      </form>

      @if (auth.googleEnabled()) {
        <app-google-button [href]="googleUrl()" />
      }

      <p class="mt-6 text-center text-sm text-slate-600 dark:text-white/70">
        {{ 'auth.haveAccount' | transloco }}
        <a
          [routerLink]="['/', culture.culture(), 'login']"
          class="text-brand-600 dark:text-brand-400 font-medium hover:underline ml-1"
          >{{ 'auth.signInLink' | transloco }}</a
        >
      </p>
    </div>
  `,
})
export class SignupPage {
  protected readonly auth = inject(AuthService);
  protected readonly culture = inject(CultureService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly roleOptions = [
    {
      value: 'Renter' as Role,
      icon: 'home',
      labelKey: 'auth.renterRole',
      descriptionKey: 'auth.renterCardLooking',
    },
    {
      value: 'Landlord' as Role,
      icon: 'building',
      labelKey: 'auth.landlordRole',
      descriptionKey: 'auth.landlordCardPosting',
    },
  ];

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    confirmPassword: ['', Validators.required],
    role: ['Renter' as Role, Validators.required],
  });

  protected readonly errors = signal<FieldErrors>({});
  protected readonly general = computed(() => generalErrors(this.errors()));
  protected readonly submitting = signal(false);

  protected readonly googleUrl = computed(() =>
    this.auth.externalChallengeUrl('Google', this.culture.culture()),
  );

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errors.set({});

    this.auth
      .signup({ ...this.form.getRawValue(), culture: this.culture.culture() })
      .subscribe({
        next: (response) => {
          this.submitting.set(false);
          void this.router.navigateByUrl(`/${this.culture.culture()}${response.redirectPath}`);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.errors.set(toFieldErrors(error, 'Could not create the account. Please try again.'));
        },
      });
  }
}
