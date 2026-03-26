import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { ButtonComponent } from '../../ui/button/button';
import { HighlightCardComponent } from '../../ui/highlight-card/highlight-card';
import { SurveyListViewComponent } from '../../ui/survey-list-view/survey-list-view';
import { DropdownMenuComponent } from '../../ui/dropdown-menu/dropdown-menu';

type SurveyStatus = 'active' | 'past' | 'all';
type CategoryFilter = string | 'all';

type Survey = {
  id: string;
  category: string;
  title: string;
  badgeLabel: string;
  status: SurveyStatus;
  tone?: 'base' | 'muted';
};

@Component({
  selector: 'app-home',
  imports: [ButtonComponent, HighlightCardComponent, SurveyListViewComponent, DropdownMenuComponent],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  // State signals
  protected readonly selectedStatus = signal<SurveyStatus>('all');
  protected readonly selectedCategory = signal<CategoryFilter>('all');

  // Mock survey data - später von API
  protected readonly allSurveys = signal<Survey[]>([
    {
      id: '1',
      category: 'Team activities',
      title: "Let's Plan the Next Team Event Together",
      badgeLabel: 'Ends in 1 Day',
      status: 'active',
      tone: 'base',
    },
    {
      id: '2',
      category: 'Health & Wellness',
      title: 'Fit & wellness survey!',
      badgeLabel: 'Ends in 2 Days',
      status: 'active',
      tone: 'base',
    },
    {
      id: '3',
      category: 'Gaming & Entertainment',
      title: 'Gaming habits and favorite games!',
      badgeLabel: 'Ends in 3 Days',
      status: 'active',
      tone: 'base',
    },
    {
      id: '4',
      category: 'Gaming & Entertainment',
      title: 'Gaming habits and favorite games!',
      badgeLabel: 'Ends in 3 Days',
      status: 'past',
      tone: 'muted',
    },
    {
      id: '5',
      category: 'Healthy Lifestyle',
      title: 'Healthier future: Fit & wellness survey!',
      badgeLabel: 'Ends in 2 Days',
      status: 'past',
      tone: 'muted',
    },
    {
      id: '6',
      category: 'Team activities',
      title: "Let's Plan the Next Team Event Together",
      badgeLabel: 'Ends in 1 Day',
      status: 'past',
      tone: 'muted',
    },
  ]);

  // Categories for dropdown
  protected readonly categories = [
    'Team Activities',
    'Health & Wellness',
    'Gaming & Entertainment',
    'Education & Learning',
    'Lifestyle & Preferences',
    'Technology & Innovation',
  ];

  // Computed: Ending soon surveys (erste 3 active)
  protected readonly endingSoonSurveys = computed(() =>
    this.allSurveys()
      .filter((s) => s.status === 'active')
      .slice(0, 3)
  );

  // Computed: Filtered surveys based on selected status and category
  protected readonly filteredSurveys = computed(() => {
    let filtered = this.allSurveys();

    // Filter nach Status
    if (this.selectedStatus() !== 'all') {
      filtered = filtered.filter((s) => s.status === this.selectedStatus());
    }

    // Filter nach Kategorie
    if (this.selectedCategory() !== 'all') {
      filtered = filtered.filter(
        (s) => s.category.toLowerCase() === (this.selectedCategory() as string).toLowerCase()
      );
    }

    return filtered;
  });

  // Methods for filter interaction
  protected onFilterActive(): void {
    this.selectedStatus.set(this.selectedStatus() === 'active' ? 'all' : 'active');
  }

  protected onFilterPast(): void {
    this.selectedStatus.set(this.selectedStatus() === 'past' ? 'all' : 'past');
  }

  protected onCategoryChange(category: string): void {
    this.selectedCategory.set(category === this.selectedCategory() ? 'all' : category);
  }

  protected toggleAllFilters(): void {
    this.selectedStatus.set('all');
    this.selectedCategory.set('all');
  }
}
