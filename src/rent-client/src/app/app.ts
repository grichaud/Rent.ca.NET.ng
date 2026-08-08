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
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <router-outlet />
    </main>
    <app-footer />
  `,
})
export class App {}
