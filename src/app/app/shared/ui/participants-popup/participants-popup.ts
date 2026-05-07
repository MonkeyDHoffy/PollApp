import { ChangeDetectionStrategy, Component, Input, inject, output } from '@angular/core';
import { SurveyParticipant } from '../../../../shared/models/survey.model';
import { LangService } from '../../../../shared/services/lang.service';

/** Popup-Liste aller Umfrage-Teilnehmer mit Anzeigename und Teilnahme-Zeitstempel. */
@Component({
  selector: 'app-participants-popup',
  templateUrl: './participants-popup.html',
  styleUrl: './participants-popup.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParticipantsPopupComponent {
  @Input({ required: true }) participants!: SurveyParticipant[];

  readonly closed = output<void>();

  protected readonly langService = inject(LangService);
  protected readonly t = this.langService.t;

  /** Returns the display name for a participant, falling back to the 'anonymous' translation. */
  protected displayName(participant: SurveyParticipant): string {
    return participant.name?.trim() || this.t()('anonymous');
  }

  protected onClose(): void {
    this.closed.emit();
  }
}
