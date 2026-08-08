import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { FavoritesService } from '../../core/api/favorites.service';
import { AuthService } from '../../core/auth/auth.service';
import { CultureService } from '../../core/i18n/culture.service';
import { Icon } from './icon/icon';

/**
 * Corazon de guardar en favoritos, con las tres situaciones del origen:
 *
 * - **Renter**: boton que alterna el estado.
 * - **Anonimo**: enlace al login con `returnUrl`, para volver a donde estaba.
 * - **Landlord o Admin**: no se pinta nada. Guardar favoritos es solo de Renter, y ensenarle
 *   el corazon a un propietario lo mandaba al login estando ya identificado.
 *
 * El cambio es OPTIMISTA: el corazon se rellena antes de que conteste el servidor y se
 * revierte si la llamada falla. Esperar la respuesta hace que el clic se sienta roto, y este
 * boton vive dentro de tarjetas de una rejilla donde la latencia se nota mucho.
 */
@Component({
  selector: 'app-favorite-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, Icon],
  template: `
    @if (auth.isAuthenticated()) {
      @if (canFavorite()) {
        <button
          type="button"
          (click)="toggle($event)"
          [attr.aria-pressed]="favorited()"
          [attr.aria-label]="
            (favorited() ? 'detail.removeFromFavorites' : 'detail.saveToFavorites') | transloco
          "
          [class]="buttonClass()"
        >
          <app-icon
            name="heart"
            [class]="iconClass()"
            [fill]="favorited() ? 'currentColor' : 'none'"
          />
        </button>
      }
    } @else {
      <a
        [routerLink]="['/', culture.culture(), 'login']"
        [queryParams]="{ returnUrl: loginReturnUrl() }"
        [attr.aria-label]="'detail.saveToFavorites' | transloco"
        [class]="buttonClass()"
      >
        <app-icon name="heart" [class]="iconClass()" fill="none" />
      </a>
    }
  `,
})
export class FavoriteButton {
  private readonly favorites = inject(FavoritesService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly culture = inject(CultureService);

  readonly propertyId = input.required<string>();
  readonly initialFavorited = input<boolean>(false);
  readonly variant = input<'card' | 'detail'>('card');
  /** A donde volver tras iniciar sesion; por defecto, la pagina actual. */
  readonly returnUrl = input<string>();

  /**
   * linkedSignal y no un signal normal: la misma instancia del componente se reutiliza cuando
   * la rejilla cambia de pagina o de filtros, y con un signal suelto la tarjeta nueva heredaria
   * el corazon de la anterior.
   */
  protected readonly favorited = linkedSignal(() => this.initialFavorited());
  private readonly pending = signal(false);

  protected readonly canFavorite = computed(() => this.auth.hasRole('Renter'));

  /** Sin returnUrl explicito se vuelve a donde estaba el usuario al pulsar el corazon. */
  protected readonly loginReturnUrl = computed(() => this.returnUrl() ?? this.router.url);

  protected readonly buttonClass = computed(() =>
    this.variant() === 'detail'
      ? 'h-11 w-11 inline-flex items-center justify-center rounded-full bg-white/80 dark:bg-slate-900/60 backdrop-blur-md border border-gray-200 dark:border-white/10 shadow-sm hover:scale-110 transition-all duration-200'
      : 'h-8 w-8 rounded-full inline-flex items-center justify-center bg-black/30 hover:bg-black/50 backdrop-blur-md border border-white/20 transition-all duration-200 hover:scale-110',
  );

  protected readonly iconClass = computed(() => {
    const size = this.variant() === 'detail' ? 'h-5 w-5' : 'h-4 w-4';
    if (this.favorited()) return `${size} text-rose-500`;
    return this.variant() === 'detail'
      ? `${size} text-slate-700 dark:text-white/80`
      : `${size} text-white/80`;
  });

  protected toggle(event: Event): void {
    // La tarjeta entera es un enlace al detalle: sin esto, guardar navegaba.
    event.preventDefault();
    event.stopPropagation();

    if (this.pending()) return;

    const previous = this.favorited();
    this.favorited.set(!previous);
    this.pending.set(true);

    this.favorites.toggle(this.propertyId()).subscribe({
      next: (favorited) => {
        this.favorited.set(favorited);
        this.pending.set(false);
      },
      error: () => {
        // Se vuelve al estado real. Sin esto el corazon miente: dice guardado y no hay nada.
        this.favorited.set(previous);
        this.pending.set(false);
      },
    });
  }
}
