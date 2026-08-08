import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from './layout/footer';
import { Header } from './layout/header';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Header, Footer],
  template: `
    <app-header />
    <!--
      El <main> va a ancho completo y es cada pantalla la que decide su contenedor.
      El origen resolvia esto con ViewData["FullBleed"] porque el hero de la home ocupa
      todo el ancho mientras el resto del contenido va centrado a max-w-7xl.
    -->
    <main class="w-full">
      <router-outlet />
    </main>
    <app-footer />
  `,
})
export class App {}
