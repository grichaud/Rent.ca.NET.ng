import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ICON_DEFS, IconElement } from './icon-defs';

/**
 * Equivalente del `<icon name="..." />` de Razor (IconTagHelper).
 *
 * Los hijos se declaran como elementos SVG del template (con prefijo `svg:`, necesario
 * porque van dentro de bloques `@for`/`@switch` y ahi se pierde el namespace inferido).
 * NO se usa [innerHTML]: sobre un <svg> lanza "NotYetImplemented" en el render de servidor
 * y aborta la deteccion de cambios de toda la pagina.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (elements().length) {
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        [attr.fill]="fill()"
        stroke="currentColor"
        [attr.stroke-width]="strokeWidth()"
        stroke-linecap="round"
        stroke-linejoin="round"
        [attr.class]="class()"
        aria-hidden="true"
      >
        @for (el of elements(); track $index) {
          @switch (el.tag) {
            @case ('path') {
              <svg:path [attr.d]="el.attrs['d']" [attr.fill]="el.attrs['fill']" />
            }
            @case ('circle') {
              <svg:circle
                [attr.cx]="el.attrs['cx']"
                [attr.cy]="el.attrs['cy']"
                [attr.r]="el.attrs['r']"
                [attr.fill]="el.attrs['fill']"
              />
            }
            @case ('line') {
              <svg:line
                [attr.x1]="el.attrs['x1']"
                [attr.x2]="el.attrs['x2']"
                [attr.y1]="el.attrs['y1']"
                [attr.y2]="el.attrs['y2']"
              />
            }
            @case ('polyline') {
              <svg:polyline [attr.points]="el.attrs['points']" />
            }
            @case ('polygon') {
              <svg:polygon [attr.points]="el.attrs['points']" />
            }
            @case ('rect') {
              <svg:rect
                [attr.x]="el.attrs['x']"
                [attr.y]="el.attrs['y']"
                [attr.width]="el.attrs['width']"
                [attr.height]="el.attrs['height']"
                [attr.rx]="el.attrs['rx']"
                [attr.ry]="el.attrs['ry']"
              />
            }
          }
        }
      </svg>
    }
  `,
  styles: [':host { display: contents; }'],
})
export class Icon {
  readonly name = input.required<string>();
  readonly class = input('h-5 w-5');
  readonly fill = input('none');
  readonly strokeWidth = input(2);

  /** Un nombre desconocido no pinta nada, igual que hacia el TagHelper del origen. */
  readonly elements = computed<readonly IconElement[]>(() => ICON_DEFS[this.name()] ?? []);
}
