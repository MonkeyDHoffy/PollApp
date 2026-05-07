import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent } from '../../ui/button/button';
import { HighlightCardComponent } from '../../ui/highlight-card/highlight-card';
import { SurveyListViewComponent } from '../../ui/survey-list-view/survey-list-view';
import { DropdownMenuComponent } from '../../ui/dropdown-menu/dropdown-menu';
import { GuestModalComponent } from '../../ui/guest-modal/guest-modal';
import { OnboardingModalComponent } from '../../ui/onboarding-modal/onboarding-modal';
import { CreateSurveyModalComponent } from '../../ui/create-survey-modal/create-survey-modal';
import { SurveyService } from '../../../../shared/services/survey.service';
import { Survey as AppSurvey } from '../../../../shared/models/survey.model';
import { AuthService } from '../../../../shared/services/auth.service';
import { GuestService } from '../../../../shared/services/guest.service';
import { LangService } from '../../../../shared/services/lang.service';
import { ToastService } from '../../../../shared/services/toast.service';

type SurveyStatus = 'active' | 'past' | 'all';
type CategoryFilter = string | 'all' | 'my-surveys';
type SortKey = 'newest' | 'oldest' | 'az' | 'za';
type BadgeTone = 'active' | 'expiring' | 'ended' | 'none';

/** A survey object adapted for display in the home page list and carousel. */
type HomeSurvey = {
  id: string;
  creatorId: string;
  category: string;
  title: string;
  badgeLabel: string;
  badgeTone: BadgeTone;
  status: SurveyStatus;
  tone?: 'base' | 'muted';
  description?: string;
  visibility?: 'public' | 'private';
  shareToken?: string;
  accessCode?: string;
  endsAt?: string;
  createdAt: string;
  questions: AppSurvey['questions'];
  responseCount: number;
};

const SORT_KEYS: SortKey[] = ['newest', 'oldest', 'az', 'za'];
const SURVEY_BATCH_SIZE = 40;

/**
 * Home page of the app: renders the hero section, the "ending soon" carousel, and
 * a filterable survey list. Manages the auth panel, guest mode, create-survey modal,
 * and virtual-batch pagination.
 */
@Component({
  selector: 'app-home',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    HighlightCardComponent,
    SurveyListViewComponent,
    DropdownMenuComponent,
    GuestModalComponent,
    OnboardingModalComponent,
    CreateSurveyModalComponent,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly surveyService = inject(SurveyService);
  private readonly authService = inject(AuthService);
  protected readonly guestService = inject(GuestService);
  protected readonly langService = inject(LangService);
  private readonly toastService = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly t = this.langService.t;

  // ── Auth & Guest ─────────────────────────────────────────────────────────

  protected readonly authInitialized = computed(() => this.authService.initialized());
  protected readonly authUser = computed(() => this.authService.user());
  protected readonly authDisplayName = computed(() => this.authService.displayName());
  protected readonly authLoading = computed(() => this.authService.loading());
  protected readonly authError = computed(() => this.authService.error());
  protected readonly authMessage = computed(() => this.authService.message());
  protected readonly needsDisplayName = computed(() => this.authService.needsDisplayName());

  protected readonly canViewSurveys = computed(
    () => !!this.authUser() || this.guestService.isGuest()
  );
  protected readonly canCreateSurvey = computed(() => !!this.authUser());
  protected readonly isGuestMode = computed(
    () => this.guestService.isGuest() && !this.authUser()
  );

  // ── Survey data ───────────────────────────────────────────────────────────

  protected readonly surveysLoading = computed(
    () => this.surveyService.loading() && this.allSurveys().length === 0
  );
  protected readonly schemaNotice = computed(() => this.surveyService.schemaNotice());

  protected readonly allSurveys = computed<HomeSurvey[]>(() =>
    (this.canViewSurveys() ? this.surveyService.allSurveys() : []).map((s) =>
      this.mapSurveyToHomeSurvey(s)
    )
  );

  protected readonly mySurveys = computed(() => {
    const userId = this.authUser()?.id;
    if (!userId) return [] as HomeSurvey[];
    return this.allSurveys().filter((s) => s.creatorId === userId);
  });

  protected readonly publicSurveys = computed(() => {
    const userId = this.authUser()?.id;
    return this.allSurveys().filter(
      (s) => s.tone === 'base' || (userId !== undefined && s.creatorId === userId)
    );
  });

  // ── Filters & Sort ────────────────────────────────────────────────────────

  protected readonly selectedStatus = signal<SurveyStatus>('all');
  protected readonly selectedCategory = signal<CategoryFilter>('all');
  protected readonly selectedSortKey = signal<SortKey>('newest');
  protected readonly searchQuery = signal('');
  protected readonly visibleSurveyCount = signal(SURVEY_BATCH_SIZE);
  protected readonly listRestoreScrollTop = signal(0);
  protected readonly loadingMoreSurveys = signal(false);
  private readonly visibleCountByViewKey = signal<Record<string, number>>({});
  private readonly scrollTopByViewKey = signal<Record<string, number>>({});
  private activeListViewKey = '';

  protected readonly sortOptionLabels = computed(() => [
    this.t()('newestFirst'),
    this.t()('oldestFirst'),
    'A → Z',
    'Z → A',
  ]);

  protected readonly selectedSortLabel = computed(
    () => this.sortOptionLabels()[SORT_KEYS.indexOf(this.selectedSortKey())]
  );

  protected readonly filterCategoryOptions = computed<string[]>(() => {
    const base: string[] = [this.t()('all'), ...this.categories];
    if (this.authUser()) return [...base, this.t()('mySurveys')];
    return base;
  });

  protected readonly selectedCategoryLabel = computed(() => {
    const cat = this.selectedCategory();
    if (cat === 'all') return this.t()('all');
    if (cat === 'my-surveys') return this.t()('mySurveys');
    return cat;
  });

  protected readonly endingSoonSurveys = computed(() =>
    this.publicSurveys()
      .filter((s) => s.status === 'active')
      .sort((a, b) => this.compareByEndDate(a.endsAt, b.endsAt))
  );

  protected readonly filteredSurveys = computed(() =>
    this.applySortToSurveys(this.applyFiltersToSurveys())
  );

  protected readonly visibleSurveys = computed(() =>
    this.filteredSurveys().slice(0, this.visibleSurveyCount())
  );

  protected readonly hasMoreSurveys = computed(
    () => this.visibleSurveyCount() < this.filteredSurveys().length
  );

  protected readonly listViewKey = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    return `${this.selectedStatus()}|${this.selectedCategory()}|${this.selectedSortKey()}|${query}`;
  });

  protected readonly categories = [
    'Team Activities',
    'Health & Wellness',
    'Gaming & Entertainment',
    'Education & Learning',
    'Lifestyle & Preferences',
    'Technology & Innovation',
    'Other',
  ];

  // ── Toolbar collapse (mobile) ─────────────────────────────────────────────

  protected readonly toolbarCollapsed = signal(false);
  private _lastPageScrollY = 0;
  private toolbarManualExpanded = false;

  @HostListener('window:scroll')
  protected onWindowScroll(): void {
    if (window.innerWidth >= 768) return;
    if (this.toolbarManualExpanded) {
      this._lastPageScrollY = window.scrollY;
      return;
    }

    const y = window.scrollY;
    if (y > this._lastPageScrollY + 10 && y > 300) {
      this.toolbarCollapsed.set(true);
    }
    this._lastPageScrollY = y;
  }

  protected onListScrolled(dir: 'up' | 'down'): void {
    if (window.innerWidth >= 768) return;
    if (this.toolbarManualExpanded) return;
    if (dir === 'down') this.toolbarCollapsed.set(true);
  }

  protected onListScrollTopChanged(scrollTop: number): void {
    const key = this.listViewKey();
    this.listRestoreScrollTop.set(scrollTop);
    this.scrollTopByViewKey.update((state) => ({
      ...state,
      [key]: scrollTop,
    }));
  }

  /** Loads the next batch of surveys into the visible list. */
  protected loadMoreSurveys(): void {
    if (this.loadingMoreSurveys() || !this.hasMoreSurveys()) return;
    this.loadingMoreSurveys.set(true);
    requestAnimationFrame(() => this.applyNextBatch());
  }

  private applyNextBatch(): void {
    const nextCount = Math.min(
      this.visibleSurveyCount() + SURVEY_BATCH_SIZE,
      this.filteredSurveys().length
    );
    this.visibleSurveyCount.set(nextCount);
    const key = this.listViewKey();
    this.visibleCountByViewKey.update((state) => ({ ...state, [key]: nextCount }));
    this.loadingMoreSurveys.set(false);
  }

  protected toggleToolbar(): void {
    const willCollapse = !this.toolbarCollapsed();
    this.toolbarCollapsed.set(willCollapse);
    this.toolbarManualExpanded = !willCollapse;
    if (!willCollapse) {
      // Scroll sticky header into view so expanded content is fully visible
      this.stickyHeaderRef?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // ── Modal state ───────────────────────────────────────────────────────────

  protected readonly createSurveyOpen = signal(false);
  protected readonly editSurveyId = signal<string | null>(null);
  protected readonly activeSurveyData = signal<HomeSurvey | null>(null);

  /** Tracks query-param driven edit/duplicate workflows to avoid re-triggering. */
  private readonly pendingEditFromQuery = signal<string | null>(
    this.route.snapshot.queryParamMap.get('edit')
  );
  private readonly pendingDuplicateFromQuery = signal<string | null>(
    this.route.snapshot.queryParamMap.get('duplicate')
  );
  private readonly editOpenedFromQuery = signal(false);
  private readonly duplicateOpenedFromQuery = signal(false);

  protected readonly guestModalOpen = signal(false);

  // ── Auth panel (sign-in dropdown) ─────────────────────────────────────────

  protected readonly authPanelOpen = signal(false);
  protected readonly authPanelEmailTouched = signal(false);

  // ── Name editing ──────────────────────────────────────────────────────────

  protected readonly editingDisplayName = signal(false);
  protected readonly displayNameEditValue = signal('');
  protected readonly displayNameSaving = signal(false);

  // ── Forms ─────────────────────────────────────────────────────────────────

  protected readonly authEmailControl = this.fb.nonNullable.control('', [
    Validators.required,
    Validators.email,
  ]);
  protected readonly authForm = this.fb.group({ email: this.authEmailControl });

  // ── ViewChildren & parallax ───────────────────────────────────────────────

  @ViewChild('stickyHeader') private stickyHeaderRef?: ElementRef<HTMLDivElement>;
  @ViewChild('carouselTrack') carouselTrackRef?: ElementRef<HTMLDivElement>;
  @ViewChild('heroVisuals') heroVisualsRef?: ElementRef<HTMLElement>;
  @ViewChild('nameEditInput') private nameEditInputRef?: ElementRef<HTMLInputElement>;

  private heroTargetX = 0;
  private heroTargetY = 0;
  private heroCurrX = 0;
  private heroCurrY = 0;
  private heroRafId?: number;

  // ── Constructor ───────────────────────────────────────────────────────────

  constructor() {
    effect(() => this.handleEditQueryParam());
    effect(() => this.handleDuplicateQueryParam());
    effect(() => this.restoreListViewState());
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  @HostListener('document:keydown.escape')
  protected onEscapeKey(): void {
    if (this.editingDisplayName()) { this.cancelEditName(); return; }
    if (this.authPanelOpen()) { this.closeAuthPanel(); return; }
    if (this.guestModalOpen()) { this.guestModalOpen.set(false); return; }
  }

  // ── Filter handlers ───────────────────────────────────────────────────────

  /** Toggles the 'active' status filter on/off. */
  protected onFilterActive(): void {
    this.selectedStatus.set(this.selectedStatus() === 'active' ? 'all' : 'active');
  }

  /** Toggles the 'past' status filter on/off. */
  protected onFilterPast(): void {
    this.selectedStatus.set(this.selectedStatus() === 'past' ? 'all' : 'past');
  }

  /** Updates the selected category based on the chosen dropdown label. */
  protected onCategoryChange(label: string): void {
    const t = this.t();
    if (label === t('all')) { this.selectedCategory.set('all'); return; }
    if (label === t('mySurveys')) { this.selectedCategory.set('my-surveys'); return; }
    this.selectedCategory.set(label === this.selectedCategoryLabel() ? 'all' : label);
  }

  /** Updates the active sort key from the chosen label. */
  protected onSortChange(label: string): void {
    const idx = this.sortOptionLabels().indexOf(label);
    if (idx >= 0) this.selectedSortKey.set(SORT_KEYS[idx]);
  }

  // ── Auth handlers ─────────────────────────────────────────────────────────

  protected openAuthPanel(): void {
    this.authService.clearNotices();
    this.authEmailControl.reset('');
    this.authPanelEmailTouched.set(false);
    this.authPanelOpen.set(true);
  }

  protected closeAuthPanel(): void {
    this.authPanelOpen.set(false);
  }

  /** Sends a magic link to the entered email address. */
  protected async sendMagicLink(): Promise<void> {
    this.authPanelEmailTouched.set(true);
    this.authEmailControl.markAsTouched();
    if (this.authEmailControl.invalid) return;
    const ok = await this.authService.sendMagicLink(this.authEmailControl.value.trim());
    if (ok) {
      this.toastService.success(this.t()('magicLinkSent'));
    } else {
      const err = this.authError();
      if (err) this.toastService.error(err);
    }
  }

  protected async signOut(): Promise<void> {
    await this.authService.signOut();
  }

  protected onAuthInputChange(): void {
    if (this.authError()) this.authService.clearNotices();
  }

  // ── Display name editing ──────────────────────────────────────────────────

  protected startEditName(): void {
    this.displayNameEditValue.set(this.authDisplayName() ?? '');
    this.editingDisplayName.set(true);
    setTimeout(() => this.nameEditInputRef?.nativeElement?.focus(), 0);
  }

  protected cancelEditName(): void {
    this.editingDisplayName.set(false);
  }

  /** Saves a changed display name. Exits edit mode if the name is unchanged. */
  protected async saveDisplayName(): Promise<void> {
    const val = this.displayNameEditValue().trim();
    if (!val || val === this.authDisplayName()) { this.cancelEditName(); return; }
    this.displayNameSaving.set(true);
    await this.authService.updateDisplayName(val);
    this.displayNameSaving.set(false);
    this.editingDisplayName.set(false);
    this.toastService.success(this.t()('nameSaved'));
  }

  // ── Guest mode ────────────────────────────────────────────────────────────

  protected openGuestModal(): void {
    this.guestModalOpen.set(true);
  }

  protected endGuestMode(): void {
    this.guestService.endSession();
  }

  protected endGuestModeAndSignIn(): void {
    this.guestService.endSession();
    this.openAuthPanel();
  }

  // ── Create / Edit modal ───────────────────────────────────────────────────

  protected openCreateSurveyModal(): void {
    if (!this.canCreateSurvey()) return;
    this.editSurveyId.set(null);
    this.activeSurveyData.set(null);
    this.createSurveyOpen.set(true);
  }

  protected openEditSurveyModal(surveyId: string): void {
    const survey = this.mySurveys().find((s) => s.id === surveyId);
    if (!survey) return;
    this.editSurveyId.set(surveyId);
    this.activeSurveyData.set(survey);
    this.createSurveyOpen.set(true);
  }

  protected openDuplicateSurveyModal(surveyId: string): void {
    const survey = this.allSurveys().find((s) => s.id === surveyId);
    if (!survey) return;
    this.editSurveyId.set(null);
    this.activeSurveyData.set({ ...survey, title: `${survey.title} (Copy)` });
    this.createSurveyOpen.set(true);
  }

  protected onCreateSurveyModalClosed(): void {
    this.editSurveyId.set(null);
    this.activeSurveyData.set(null);
    this.createSurveyOpen.set(false);
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  protected openSurvey(surveyId: string): void {
    void this.router.navigate(['/survey', surveyId]);
  }

  /** Copies the share link of a survey card to the clipboard. */
  protected async onShareLinkClicked(shareToken: string): Promise<void> {
    const link = `${window.location.origin}/join/${shareToken}`;
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(link);
      this.toastService.success(this.t()('shareLinkCopied'));
    } catch {
      this.toastService.error(this.t()('shareLinkFailed'));
    }
  }

  // ── Carousel ──────────────────────────────────────────────────────────────

  protected carouselScroll(dir: -1 | 1): void {
    const el = this.carouselTrackRef?.nativeElement;
    if (!el) return;
    const item = el.querySelector('.surveys__carousel-item') as HTMLElement | null;
    const itemWidth = item ? item.offsetWidth + 24 : 340;
    el.scrollBy({ left: dir * itemWidth * 2, behavior: 'smooth' });
  }

  // ── Hero parallax ─────────────────────────────────────────────────────────

  protected onHeroMouseMove(event: MouseEvent): void {
    this.updateHeroTarget(event.clientX, event.clientY);
  }

  protected onHeroMouseLeave(): void {
    this.heroTargetX = 0;
    this.heroTargetY = 0;
    this.scheduleHeroLerp();
  }

  protected onHeroTouchMove(event: TouchEvent): void {
    const touch = event.touches[0];
    if (touch) this.updateHeroTarget(touch.clientX, touch.clientY);
  }

  protected onHeroTouchEnd(): void {
    this.heroTargetX = 0;
    this.heroTargetY = 0;
    this.scheduleHeroLerp();
  }

  ngOnDestroy(): void {
    if (this.heroRafId != null) cancelAnimationFrame(this.heroRafId);
  }

  private restoreListViewState(): void {
    const key = this.listViewKey();
    if (this.activeListViewKey && this.activeListViewKey !== key) {
      this.persistCurrentViewState(this.activeListViewKey);
    }
    this.activeListViewKey = key;
    this.visibleSurveyCount.set(this.visibleCountByViewKey()[key] ?? SURVEY_BATCH_SIZE);
    this.listRestoreScrollTop.set(this.scrollTopByViewKey()[key] ?? 0);
  }

  private persistCurrentViewState(previousKey: string): void {
    this.scrollTopByViewKey.update((state) => ({
      ...state,
      [previousKey]: this.listRestoreScrollTop(),
    }));
    this.visibleCountByViewKey.update((state) => ({
      ...state,
      [previousKey]: this.visibleSurveyCount(),
    }));
  }

  // ── Private: query-param handlers ─────────────────────────────────────────

  private handleEditQueryParam(): void {
    if (this.editOpenedFromQuery()) return;
    const targetId = this.pendingEditFromQuery();
    if (!targetId) return;
    const survey = this.mySurveys().find((s) => s.id === targetId);
    if (!survey) return;
    this.openEditSurveyModal(survey.id);
    this.editOpenedFromQuery.set(true);
    this.pendingEditFromQuery.set(null);
    void this.clearQueryParam('edit');
  }

  private handleDuplicateQueryParam(): void {
    if (this.duplicateOpenedFromQuery()) return;
    const targetId = this.pendingDuplicateFromQuery();
    if (!targetId) return;
    const survey = this.allSurveys().find((s) => s.id === targetId);
    if (!survey) return;
    this.openDuplicateSurveyModal(survey.id);
    this.duplicateOpenedFromQuery.set(true);
    this.pendingDuplicateFromQuery.set(null);
    void this.clearQueryParam('duplicate');
  }

  private clearQueryParam(key: string): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [key]: null },
      queryParamsHandling: 'merge',
    });
  }

  // ── Private: hero parallax lerp ───────────────────────────────────────────

  private updateHeroTarget(clientX: number, clientY: number): void {
    const el = this.heroVisualsRef?.nativeElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    this.heroTargetX = ((clientX - rect.left) / rect.width - 0.5) * 2;
    this.heroTargetY = ((clientY - rect.top) / rect.height - 0.5) * 2;
    this.scheduleHeroLerp();
  }

  private scheduleHeroLerp(): void {
    if (this.heroRafId != null) return;
    this.heroRafId = requestAnimationFrame(() => this.heroLerpTick());
  }

  private heroLerpTick(): void {
    const ease = 0.072;
    this.heroCurrX += (this.heroTargetX - this.heroCurrX) * ease;
    this.heroCurrY += (this.heroTargetY - this.heroCurrY) * ease;
    const el = this.heroVisualsRef?.nativeElement;
    if (el) {
      el.style.setProperty('--px', this.heroCurrX.toFixed(4));
      el.style.setProperty('--py', this.heroCurrY.toFixed(4));
    }
    const stillMoving =
      Math.abs(this.heroTargetX - this.heroCurrX) > 0.0008 ||
      Math.abs(this.heroTargetY - this.heroCurrY) > 0.0008;
    this.heroRafId = stillMoving ? requestAnimationFrame(() => this.heroLerpTick()) : undefined;
  }

  // ── Private: filter & sort helpers ────────────────────────────────────────

  private applyFiltersToSurveys(): HomeSurvey[] {
    const category = this.selectedCategory();
    const isMySurveys = category === 'my-surveys';
    let list = this.resolveBaseList(isMySurveys);
    if (this.selectedStatus() !== 'all') list = list.filter((s) => s.status === this.selectedStatus());
    if (!isMySurveys && category !== 'all') list = list.filter((s) => s.category.toLowerCase() === (category as string).toLowerCase());
    const query = this.searchQuery().toLowerCase().trim();
    return query ? list.filter((s) => s.title.toLowerCase().includes(query)) : list;
  }

  private resolveBaseList(isMySurveys: boolean): HomeSurvey[] {
    if (!isMySurveys) return this.publicSurveys();
    const userId = this.authUser()?.id;
    return userId ? this.allSurveys().filter((s) => s.creatorId === userId) : [];
  }

  private applySortToSurveys(list: HomeSurvey[]): HomeSurvey[] {
    const key = this.selectedSortKey();
    return [...list].sort((a, b) => {
      if (key === 'az') return a.title.localeCompare(b.title);
      if (key === 'za') return b.title.localeCompare(a.title);
      if (key === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  private compareByEndDate(a?: string, b?: string): number {
    const aTime = a ? new Date(a).getTime() : Infinity;
    const bTime = b ? new Date(b).getTime() : Infinity;
    return aTime - bTime;
  }

  // ── Private: survey mapping ───────────────────────────────────────────────

  private mapSurveyToHomeSurvey(survey: AppSurvey): HomeSurvey {
    const { isPast, daysLeft, validDate, endsAtDate } = this.computeDateMeta(survey.endsAt);
    const isActive = survey.status === 'published' && !isPast;
    return {
      id: survey.id, creatorId: survey.creatorId, category: survey.category,
      title: survey.title, description: survey.description,
      badgeLabel: this.toBadgeLabel(validDate ? endsAtDate : null),
      badgeTone: this.resolveBadgeTone(isPast, daysLeft, validDate),
      status: isActive ? 'active' : 'past', tone: isActive ? 'base' : 'muted',
      visibility: survey.visibility, shareToken: survey.shareToken, accessCode: survey.accessCode,
      endsAt: survey.endsAt, createdAt: survey.createdAt, questions: survey.questions,
      responseCount: survey.totalResponses,
    };
  }

  private computeDateMeta(endsAtStr: string) {
    const now = new Date();
    const endsAtDate = new Date(endsAtStr);
    const validDate = !Number.isNaN(endsAtDate.getTime());
    const isPast = validDate && endsAtDate.getTime() < now.getTime();
    const daysLeft = validDate
      ? Math.ceil((endsAtDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    return { isPast, daysLeft, validDate, endsAtDate };
  }

  private resolveBadgeTone(isPast: boolean, daysLeft: number | null, validDate: boolean): BadgeTone {
    if (isPast) return 'ended';
    if (daysLeft !== null && daysLeft <= 3) return 'expiring';
    if (validDate) return 'active';
    return 'none';
  }

  private toBadgeLabel(endDate: Date | null): string {
    if (!endDate) return this.t()('noEndDate');
    const now = new Date();
    const delta = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return delta < 0 ? this.buildEndedLabel(Math.abs(delta)) : this.buildEndsInLabel(delta);
  }

  private buildEndedLabel(daysAgo: number): string {
    return this.langService.lang() === 'de'
      ? `Vor ${daysAgo} Tag${daysAgo === 1 ? '' : 'en'} beendet`
      : `Ended ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`;
  }

  private buildEndsInLabel(daysLeft: number): string {
    return this.langService.lang() === 'de'
      ? `Endet in ${daysLeft} Tag${daysLeft === 1 ? '' : 'en'}`
      : `Ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
  }
}
