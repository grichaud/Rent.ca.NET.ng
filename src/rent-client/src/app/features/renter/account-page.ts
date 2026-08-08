import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, of } from 'rxjs';
import { RenterService } from '../../core/api/renter.service';
import { AuthService } from '../../core/auth/auth.service';
import { FieldErrors } from '../../core/auth/auth.types';
import { toFieldErrors } from '../auth/ui/auth-errors';
import { PasswordField } from '../auth/ui/password-field';
import { Icon } from '../../shared/ui/icon/icon';

/** Port de RenterPortal/Pages/Account.cshtml: perfil y cambio de contrasena. */
@Component({
  selector: 'app-renter-account-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe, Icon, PasswordField],
  template: `
    <div class="space-y-6 max-w-2xl">
      <header>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ 'renter.accountTitle' | transloco }}
        </h1>
        <p class="mt-1 text-sm text-slate-600 dark:text-white/70">
          {{ 'renter.accountSubtitle' | transloco }}
        </p>
      </header>

      @if (flashSuccess()) {
        <div
          role="status"
          class="p-3 rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10 text-sm text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-2"
        >
          <app-icon name="check-circle" class="h-4 w-4" />
          {{ flashSuccess() }}
        </div>
      }

      <section class="glass-card p-6">
        <h2 class="font-semibold text-slate-900 dark:text-white mb-1">
          {{ 'renter.accountProfile' | transloco }}
        </h2>
        <p class="text-sm text-slate-500 dark:text-white/60 mb-4">
          {{ 'renter.accountEmail' | transloco }}
          <span class="text-slate-700 dark:text-white/80">{{ profile()?.email }}</span>
        </p>

        <form [formGroup]="profileForm" (ngSubmit)="saveProfile()" class="space-y-3">
          @for (message of profileErrors()[''] ?? []; track message) {
            <p role="alert" class="block text-sm text-red-600 dark:text-red-400">{{ message }}</p>
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
            @for (message of profileErrors()['fullName'] ?? []; track message) {
              <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
            }
          </div>

          <div>
            <label for="phone" class="block text-sm text-slate-700 dark:text-white/80 mb-1">
              {{ 'renter.accountPhone' | transloco }}
              <span class="text-slate-400 dark:text-white/40 font-normal">{{
                'renter.accountPhoneOptional' | transloco
              }}</span>
            </label>
            <div class="relative">
              <span
                class="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400 dark:text-white/40"
              >
                <app-icon name="phone" class="h-4 w-4" />
              </span>
              <input
                id="phone"
                type="tel"
                formControlName="phone"
                autocomplete="tel"
                [placeholder]="'renter.accountPhonePlaceholder' | transloco"
                class="glass-input !pl-10"
              />
            </div>
            @for (message of profileErrors()['phone'] ?? []; track message) {
              <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
            }
          </div>

          <button
            type="submit"
            [disabled]="savingProfile()"
            class="glass-button-primary inline-flex items-center gap-2 disabled:opacity-60"
          >
            <app-icon name="check" class="h-4 w-4" />
            {{ 'renter.accountSaveProfile' | transloco }}
          </button>
        </form>
      </section>

      <section class="glass-card p-6">
        <h2 class="font-semibold text-slate-900 dark:text-white mb-1">
          {{ 'renter.accountPassword' | transloco }}
        </h2>

        @if (profile() && !profile()!.hasPassword) {
          <div
            class="mt-3 p-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-500/10 text-sm text-blue-700 dark:text-blue-300 inline-flex items-center gap-2"
          >
            <app-icon name="info" class="h-4 w-4" />
            {{ 'renter.accountGoogleNote' | transloco }}
          </div>
        } @else {
          <p class="text-sm text-slate-500 dark:text-white/60 mb-4">
            {{ 'renter.accountPasswordHint' | transloco }}
          </p>

          <form [formGroup]="passwordForm" (ngSubmit)="changePassword()" class="space-y-3">
            @for (message of passwordErrors()[''] ?? []; track message) {
              <p role="alert" class="block text-sm text-red-600 dark:text-red-400">{{ message }}</p>
            }

            <div>
              <label
                for="currentPassword"
                class="block text-sm text-slate-700 dark:text-white/80 mb-1"
                >{{ 'renter.accountCurrentPassword' | transloco }}</label
              >
              <app-password-field
                [control]="passwordForm.controls.currentPassword"
                controlId="currentPassword"
                autocomplete="current-password"
              />
              @for (message of passwordErrors()['currentPassword'] ?? []; track message) {
                <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
              }
            </div>

            <div>
              <label for="newPassword" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
                'renter.accountNewPassword' | transloco
              }}</label>
              <app-password-field
                [control]="passwordForm.controls.newPassword"
                controlId="newPassword"
              />
              @for (message of passwordErrors()['newPassword'] ?? []; track message) {
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
                >{{ 'renter.accountConfirmPassword' | transloco }}</label
              >
              <app-password-field
                [control]="passwordForm.controls.confirmPassword"
                controlId="confirmPassword"
              />
              @for (message of passwordErrors()['confirmPassword'] ?? []; track message) {
                <span role="alert" class="text-xs text-red-600 dark:text-red-400">{{ message }}</span>
              }
            </div>

            <button
              type="submit"
              [disabled]="changingPassword()"
              class="glass-button-primary inline-flex items-center gap-2 disabled:opacity-60"
            >
              <app-icon name="lock" class="h-4 w-4" />
              {{ 'renter.accountChangePassword' | transloco }}
            </button>
          </form>
        }
      </section>
    </div>
  `,
})
export class RenterAccountPage {
  private readonly renter = inject(RenterService);
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);

  protected readonly profile = toSignal(
    this.renter.profile().pipe(catchError(() => of(null))),
    { initialValue: null },
  );

  protected readonly profileForm = this.fb.nonNullable.group({
    fullName: ['', Validators.required],
    phone: [''],
  });

  protected readonly passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', Validators.required],
    confirmPassword: ['', Validators.required],
  });

  protected readonly profileErrors = signal<FieldErrors>({});
  protected readonly passwordErrors = signal<FieldErrors>({});
  protected readonly savingProfile = signal(false);
  protected readonly changingPassword = signal(false);

  /** Clave de renter.* que manda la API en el exito; se traduce al pintar. */
  private readonly successKey = signal<string | null>(null);
  protected readonly flashSuccess = computed(() => {
    const key = this.successKey();
    return key ? this.transloco.translate(key) : null;
  });

  constructor() {
    // El formulario existe antes que la respuesta del perfil: se rellena cuando llega.
    effect(() => {
      const profile = this.profile();
      if (profile) {
        this.profileForm.patchValue({ fullName: profile.fullName, phone: profile.phone ?? '' });
      }
    });
  }

  protected saveProfile(): void {
    if (this.profileForm.invalid || this.savingProfile()) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.savingProfile.set(true);
    this.profileErrors.set({});
    this.successKey.set(null);

    const raw = this.profileForm.getRawValue();
    this.renter
      .updateProfile({ fullName: raw.fullName, phone: raw.phone.trim() ? raw.phone : null })
      .subscribe({
        next: (response) => {
          this.savingProfile.set(false);
          this.successKey.set(response.message);
          // El header pinta el nombre desde la sesion; se recarga para que lo estrene ya.
          this.auth.loadSession().subscribe();
        },
        error: (error: unknown) => {
          this.savingProfile.set(false);
          this.profileErrors.set(this.translated(error, 'Could not save your profile.'));
        },
      });
  }

  protected changePassword(): void {
    if (this.passwordForm.invalid || this.changingPassword()) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.changingPassword.set(true);
    this.passwordErrors.set({});
    this.successKey.set(null);

    this.renter.changePassword(this.passwordForm.getRawValue()).subscribe({
      next: (response) => {
        this.changingPassword.set(false);
        this.successKey.set(response.message);
        this.passwordForm.reset();
      },
      error: (error: unknown) => {
        this.changingPassword.set(false);
        this.passwordErrors.set(this.translated(error, 'Could not change your password.'));
      },
    });
  }

  /**
   * Los errores accionables viajan como claves de traduccion (renter.accountIncorrectCurrent,
   * renter.accountGoogle); el resto (politicas de Identity) llega ya como texto. Se traduce lo
   * que resuelva y se deja pasar lo demas, como hace el formulario de consulta del detalle.
   */
  private translated(error: unknown, fallback: string): FieldErrors {
    const errors = toFieldErrors(error, fallback);
    const result: FieldErrors = {};
    for (const [field, messages] of Object.entries(errors)) {
      result[field] = messages.map((message) => {
        const translation = this.transloco.translate(message);
        return translation === message ? message : translation;
      });
    }
    return result;
  }
}
