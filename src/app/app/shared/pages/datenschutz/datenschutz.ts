import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Static privacy policy page. */
@Component({
  selector: 'app-datenschutz',
  imports: [RouterLink],
  templateUrl: './datenschutz.html',
  styleUrl: './datenschutz.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatenschutzComponent {}
