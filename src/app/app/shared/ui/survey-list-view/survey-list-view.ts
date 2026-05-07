import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  ViewChild,
} from '@angular/core';

type ScrollDir = 'up' | 'down';

type SurveyListTone = 'base' | 'muted';

type BadgeTone = 'active' | 'expiring' | 'ended' | 'none';

type SurveyListItem = {
  id?: string;
  category: string;
  title: string;
  badgeLabel: string;
  tone?: SurveyListTone;
  badgeTone?: BadgeTone;
  responseCount?: number;
  shareToken?: string;
};

type SurveyListRow = {
  id: string;
  category: string;
  title: string;
  badgeLabel: string;
  tone: SurveyListTone;
  badgeTone: BadgeTone;
  responseCount: number;
  shareToken?: string;
};

/**
 * Paginierte Umfragenliste mit internem Scroll, Scroll-getriebenen Kartenanimationen
 * und Events für Auswahl, Share-Link und Nachladen weiterer Einträge.
 */
@Component({
  selector: 'app-survey-list-view',
  imports: [],
  templateUrl: './survey-list-view.html',
  styleUrl: './survey-list-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurveyListViewComponent implements AfterViewInit {
  readonly heading = input('Survey view in the list');
  readonly viewStateKey = input('default');
  readonly hasMore = input(false);
  readonly loadingMore = input(false);
  readonly restoreScrollTop = input(0);
  readonly items = input<SurveyListItem[]>([
    {
      category: 'Team activities',
      title: "Let's Plan the Next Team Event Together",
      badgeLabel: 'Ends in 1 Day',
      tone: 'base',
    },
    {
      category: 'Team activities',
      title: "Let's Plan the Next Team Event Together",
      badgeLabel: 'Ends in 1 Day',
      tone: 'muted',
    },
  ]);
  readonly surveySelected = output<string>();
  readonly shareLinkClicked = output<string>();
  readonly listScrolled = output<ScrollDir>();
  readonly scrollTopChanged = output<number>();
  readonly loadMoreRequested = output<void>();

  @ViewChild('listFrame') private listFrameRef?: ElementRef<HTMLDivElement>;

  private _lastFrameScrollTop = 0;
  private lastTouchClientY: number | null = null;
  private loadMoreLocked = false;
  private activeViewStateKey = 'default';
  private readonly scrollTopByKey = new Map<string, number>();

  constructor() {
    effect(() => {
      if (!this.loadingMore()) {
        this.loadMoreLocked = false;
      }
    });

    effect(() => {
      const key = this.viewStateKey();
      const frame = this.listFrameRef?.nativeElement;
      if (frame && this.activeViewStateKey !== key) {
        this.scrollTopByKey.set(this.activeViewStateKey, frame.scrollTop);
      }
      this.activeViewStateKey = key;
      this.restoreFrameScrollTop();
    });

    effect(() => {
      this.restoreScrollTop();
      this.rows();
      this.restoreFrameScrollTop();
    });
  }

  ngAfterViewInit(): void {
    this.restoreFrameScrollTop();
  }

  protected readonly rows = computed<SurveyListRow[]>(() =>
    this.items().map((item, index) => ({
      id: item.id ?? `${index}-${item.title}`,
      category: item.category,
      title: item.title,
      badgeLabel: item.badgeLabel,
      tone: item.tone ?? 'base',
      badgeTone: item.badgeTone ?? 'none',
      responseCount: item.responseCount ?? 0,
      shareToken: item.shareToken,
    }))
  );

  protected onSelect(row: SurveyListRow): void {
    if (row.tone === 'muted') {
      return;
    }

    this.surveySelected.emit(row.id);
  }

  protected onFrameScroll(e: Event): void {
    const el = e.target as HTMLElement;
    const dir: ScrollDir = el.scrollTop > this._lastFrameScrollTop ? 'down' : 'up';
    this._lastFrameScrollTop = el.scrollTop;
    this.scrollTopByKey.set(this.activeViewStateKey, el.scrollTop);
    this.listScrolled.emit(dir);
    this.scrollTopChanged.emit(el.scrollTop);

    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < 220 && this.hasMore() && !this.loadingMore() && !this.loadMoreLocked) {
      this.loadMoreLocked = true;
      this.loadMoreRequested.emit();
    }
  }

  protected onShare(row: SurveyListRow, event: MouseEvent): void {
    event.stopPropagation();
    if (row.shareToken) {
      this.shareLinkClicked.emit(row.shareToken);
    }
  }

  protected onFrameWheel(event: WheelEvent): void {
    const frame = this.listFrameRef?.nativeElement;
    if (!frame || event.deltaY === 0) return;

    const atTop = frame.scrollTop <= 0;
    const atBottom = frame.scrollTop + frame.clientHeight >= frame.scrollHeight - 1;
    const scrollingUp = event.deltaY < 0;
    const scrollingDown = event.deltaY > 0;
    const shouldHandoff = (scrollingUp && atTop) || (scrollingDown && atBottom);

    if (!shouldHandoff) return;

    event.preventDefault();
    window.scrollBy({ top: event.deltaY, behavior: 'auto' });
  }

  protected onFrameTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    this.lastTouchClientY = touch ? touch.clientY : null;
  }

  protected onFrameTouchMove(event: TouchEvent): void {
    if (event.touches.length !== 1) return;

    const frame = this.listFrameRef?.nativeElement;
    const touch = event.touches[0];
    if (!frame || !touch) return;

    if (this.lastTouchClientY == null) {
      this.lastTouchClientY = touch.clientY;
      return;
    }

    const deltaY = this.lastTouchClientY - touch.clientY;
    this.lastTouchClientY = touch.clientY;
    if (deltaY === 0) return;

    const atTop = frame.scrollTop <= 0;
    const atBottom = frame.scrollTop + frame.clientHeight >= frame.scrollHeight - 1;
    const scrollingUp = deltaY < 0;
    const scrollingDown = deltaY > 0;
    const shouldHandoff = (scrollingUp && atTop) || (scrollingDown && atBottom);

    if (!shouldHandoff) return;

    event.preventDefault();
    window.scrollBy({ top: deltaY, behavior: 'auto' });
  }

  protected onFrameTouchEnd(): void {
    this.lastTouchClientY = null;
  }

  private restoreFrameScrollTop(): void {
    const frame = this.listFrameRef?.nativeElement;
    if (!frame) return;
    const targetTop = this.scrollTopByKey.get(this.activeViewStateKey) ?? this.restoreScrollTop();
    if (Math.abs(frame.scrollTop - targetTop) <= 1) return;
    requestAnimationFrame(() => {
      const liveFrame = this.listFrameRef?.nativeElement;
      if (!liveFrame) return;
      liveFrame.scrollTop = targetTop;
      this._lastFrameScrollTop = targetTop;
    });
  }
}
