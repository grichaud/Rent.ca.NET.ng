import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LandlordService } from '../../core/api/landlord.service';
import { CultureService } from '../../core/i18n/culture.service';
import { Icon } from '../../shared/ui/icon/icon';

/**
 * Port de LandlordManage/Pages/Listings/Delete.cshtml: pantalla de confirmacion. Es un soft
 * delete — la API solo pone Status=Inactive — y por eso el boton dice "desactivar".
 */
@Component({
  selector: 'app-landlord-listing-delete-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, Icon],
  template: `
    @if (notFound()) {
      <section class="max-w-xl mx-auto glass-card p-10 text-center">
        <h1 class="font-sans font-bold tracking-tight text-3xl text-slate-900 dark:text-white">
          {{ 'detail.notFound' | transloco }}
        </h1>
        <a
          [routerLink]="['/', culture.culture(), 'landlord', 'listings']"
          class="glass-button-primary inline-block mt-6"
          >{{ 'landlord.viewListings' | transloco }}</a
        >
      </section>
    } @else if (title()) {
      <section class="max-w-xl mx-auto glass-card p-10">
        <div class="inline-flex h-12 w-12 rounded-2xl bg-red-500/15 items-center justify-center mb-4">
          <app-icon name="alert-circle" class="h-6 w-6 text-red-500 dark:text-red-400" />
        </div>
        <h1 class="font-sans font-bold tracking-tight text-3xl text-slate-900 dark:text-white">
          {{ 'landlord.deleteTitle' | transloco }}
        </h1>
        <p class="text-slate-600 dark:text-white/70 mt-3">
          <strong>{{ title() }}</strong>
        </p>
        <p class="text-slate-600 dark:text-white/70 mt-2">
          {{ 'landlord.deleteWarning' | transloco }}
        </p>
        <div class="mt-6 flex gap-3">
          <a
            [routerLink]="['/', culture.culture(), 'landlord', 'listings']"
            class="glass-button flex-1 text-center"
            >{{ 'common.cancel' | transloco }}</a
          >
          <button
            type="button"
            (click)="deactivate()"
            [disabled]="busy()"
            class="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl px-5 py-2 font-medium transition-all disabled:opacity-60"
          >
            {{ 'landlord.deactivate' | transloco }}
          </button>
        </div>
      </section>
    }
  `,
})
export class LandlordListingDeletePage {
  protected readonly culture = inject(CultureService);
  private readonly landlord = inject(LandlordService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly listingId = this.route.snapshot.paramMap.get('id')!;
  protected readonly title = signal<string | null>(null);
  protected readonly notFound = signal(false);
  protected readonly busy = signal(false);

  constructor() {
    this.landlord.listing(this.listingId).subscribe({
      next: (detail) => this.title.set(detail.title),
      error: () => this.notFound.set(true),
    });
  }

  protected deactivate(): void {
    if (this.busy()) return;
    this.busy.set(true);

    this.landlord.deactivate(this.listingId).subscribe({
      next: (response) => {
        void this.router.navigate(['/', this.culture.culture(), 'landlord', 'listings'], {
          state: { flash: response.message },
        });
      },
      error: () => this.busy.set(false),
    });
  }
}
