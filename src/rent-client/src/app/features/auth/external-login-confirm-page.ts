import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { FieldErrors, Role } from '../../core/auth/auth.types';
import { CultureService } from '../../core/i18n/culture.service';
import { Icon } from '../../shared/ui/icon/icon';
import { generalErrors, toFieldErrors } from './ui/auth-errors';

/**
 * Port de Features/Auth/Pages/ExternalLoginConfirm.cshtml: ultimo paso del alta con Google,
 * donde el usuario elige rol.
 *
 * El correo se muestra deshabilitado y NO se envia: lo afirma el proveedor y el servidor lo lee
 * de la cookie externa. Aceptarlo del formulario permitiria darse de alta con la direccion de
 * otra persona.
 */
@Component({
  selector: 'app-external-login-confirm-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe, Icon],
  template: `
    <div class="glass-card p-8 sm:p-10">
      <h1
        class="font-sans font-bold tracking-tight text-3xl text-slate-900 dark:text-white text-center"
      >
        {{ 'auth.externalConfirmTitle2' | transloco }}
      </h1>
      <p class="text-slate-500 dark:text-white/60 text-center mt-2">
        {{ 'auth.externalConfirmDesc2' | transloco }}
      </p>

      <form [formGroup]="form" (ngSubmit)="submit()" class="mt-8 space-y-4">
        @for (message of general(); track message) {
          <p role="alert" class="text-sm text-red-600 dark:text-red-400">{{ message }}</p>
        }

        <div>
          <label for="confirmEmail" class="block text-sm text-slate-700 dark:text-white/80 mb-1">{{
            'auth.email' | transloco
          }}</label>
          <div class="relative">
            <span
              class="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400 dark:text-white/40"
            >
              <app-icon name="mail" class="h-4 w-4" />
            </span>
            <input
              id="confirmEmail"
              [value]="email()"
              class="glass-input !pl-10 opacity-70 cursor-not-allowed"
              disabled
            />
          </div>
          <p class="text-xs text-slate-500 dark:text-white/50 mt-1">{{ verifiedBy() }}</p>
        </div>

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
            <input id="fullName" formControlName="fullName" autocomplete="name" class="glass-input !pl-10" />
          </div>
          @for (message of errors()['fullName'] ?? []; track message) {
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
        </fieldset>

        <button
          type="submit"
          [disabled]="submitting()"
          class="glass-button-primary w-full mt-2 inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <app-icon name="check" class="h-4 w-4" />
          {{ 'auth.externalConfirmFinish' | transloco }}
        </button>
      </form>
    </div>
  `,
})
export class ExternalLoginConfirmPage {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);
  private readonly culture = inject(CultureService);

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

  protected readonly email = signal('');
  private readonly provider = signal('');
  protected readonly errors = signal<FieldErrors>({});
  protected readonly general = computed(() => generalErrors(this.errors()));
  protected readonly submitting = signal(false);

  protected readonly verifiedBy = computed(() =>
    this.transloco.translate('auth.externalConfirmVerifiedBy').replace('{0}', this.provider()),
  );

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', Validators.required],
    role: ['Renter' as Role, Validators.required],
  });

  constructor() {
    // Los datos viven en la cookie externa, que caduca a los 30 minutos. Si ya no esta, no hay
    // nada que confirmar: se vuelve al login con el motivo.
    this.auth.externalPending().subscribe((pending) => {
      if (!pending) {
        void this.router.navigate([`/${this.culture.culture()}/login`], {
          queryParams: { authError: 'external-info-missing' },
        });
        return;
      }

      this.email.set(pending.email);
      this.provider.set(pending.provider);
      this.form.controls.fullName.setValue(pending.suggestedFullName);
    });
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const { fullName, role } = this.form.getRawValue();
    this.submitting.set(true);
    this.errors.set({});

    this.auth.externalConfirm(fullName, role, this.culture.culture()).subscribe({
      next: (response) => {
        this.submitting.set(false);
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        const target =
          returnUrl?.startsWith('/') && !returnUrl.startsWith('//')
            ? returnUrl
            : `/${this.culture.culture()}${response.redirectPath}`;
        void this.router.navigateByUrl(target);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errors.set(toFieldErrors(error, 'Could not finish the sign-up. Please try again.'));
      },
    });
  }
}
