import { isPlatformBrowser } from '@angular/common';
import { Directive, ElementRef, OnDestroy, PLATFORM_ID, effect, inject, input, signal } from '@angular/core';

/**
 * Port de `stats-counter.js` del origen: anima 0 -> objetivo cuando el bloque entra en
 * pantalla.
 *
 * En servidor **no** se pinta 0 sino el valor final, al reves que el origen. Un HTML que
 * dice "0 Active Listings" es lo que veria un buscador (y cualquiera con JS desactivado);
 * la animacion es un adorno del navegador, no el dato.
 */
@Directive({
  selector: '[appCountUp]',
})
export class CountUpDirective implements OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);
  private observer?: IntersectionObserver;

  readonly appCountUp = input.required<number>();
  /** 'thousands' divide entre 1000 (10000 -> "10"), igual que data-format del origen. */
  readonly format = input<'raw' | 'thousands'>('raw');

  private readonly current = signal(0);

  constructor() {
    effect(() => {
      const target = this.appCountUp();

      if (!isPlatformBrowser(this.platformId)) {
        this.el.nativeElement.textContent = this.display(target);
        return;
      }

      this.el.nativeElement.textContent = this.display(this.current());
    });

    effect((onCleanup) => {
      if (!isPlatformBrowser(this.platformId)) return;

      const target = this.appCountUp();
      this.observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          this.animate(target);
          this.observer?.disconnect();
        }
      }, { threshold: 0.3 });

      this.observer.observe(this.el.nativeElement);
      onCleanup(() => this.observer?.disconnect());
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private animate(target: number): void {
    const durationMs = 1600;
    const start = performance.now();

    const step = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      // easeOutCubic, el mismo easing que usaba el script del origen.
      const eased = 1 - Math.pow(1 - progress, 3);
      this.current.set(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  }

  private display(value: number): string {
    const n = this.format() === 'thousands' ? Math.round(value / 1000) : value;
    return n.toLocaleString('en-CA');
  }
}
