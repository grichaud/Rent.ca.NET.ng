import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

/**
 * Marcador temporal para las rutas que el shell ya enlaza pero cuyas pantallas se
 * construyen en fases posteriores. Existe para que la navegacion del header y del footer
 * no lleve a un 404 mientras tanto.
 */
@Component({
  selector: 'app-page-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="glass-card p-8">
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">{{ title() }}</h1>
      <p class="mt-2 text-gray-600 dark:text-white/70">
        Esta pantalla se construye en una fase posterior del PRP de migracion.
      </p>
    </div>
  `,
})
export class PagePlaceholder {
  private readonly route = inject(ActivatedRoute);
  protected readonly title = toSignal(
    this.route.data.pipe(map((d) => (d['title'] as string) ?? 'Pendiente')),
    { initialValue: 'Pendiente' },
  );
}
