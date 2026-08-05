import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'lo-icon',
  templateUrl: './icon.html',
  styleUrl: './icon.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Icon {
  readonly name = input.required<string>();
  readonly size = input(20);
}
