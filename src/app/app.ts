import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '[class.app-native]': 'nativePlatform',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly nativePlatform = Capacitor.isNativePlatform();
}
