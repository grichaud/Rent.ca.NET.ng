import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../../shared/ui/icon/icon';

/**
 * Campo de contrasena con el conmutador de "ver/ocultar" del origen.
 *
 * Alli el conmutador lo movia un script suelto (wwwroot/js/auth-password.js) que buscaba
 * atributos `data-password-*` por el DOM; aqui el estado vive en el componente, que es lo que
 * permite que la pantalla siga funcionando igual tras hidratar sin depender de ese barrido.
 */
@Component({
  selector: 'app-password-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe, Icon],
  template: `
    <div class="relative">
      <span
        class="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400 dark:text-white/40"
      >
        <app-icon name="lock" class="h-4 w-4" />
      </span>
      <input
        [id]="controlId()"
        [formControl]="control()"
        [type]="visible() ? 'text' : 'password'"
        [autocomplete]="autocomplete()"
        [placeholder]="'auth.passwordPlaceholder' | transloco"
        class="glass-input !pl-10 !pr-10"
      />
      <button
        type="button"
        (click)="visible.set(!visible())"
        [attr.aria-label]="(visible() ? 'auth.hidePassword' : 'auth.showPassword') | transloco"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/80"
      >
        <app-icon [name]="visible() ? 'eye-off' : 'eye'" class="h-4 w-4" />
      </button>
    </div>
  `,
})
export class PasswordField {
  readonly control = input.required<FormControl<string>>();
  readonly controlId = input.required<string>();
  readonly autocomplete = input<'current-password' | 'new-password'>('new-password');

  protected readonly visible = signal(false);
}
