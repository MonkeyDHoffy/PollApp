import { Component, computed, input, output } from '@angular/core';

export interface UiTabItem {
  id: string;
  label: string;
  badge?: string | number;
}

@Component({
  selector: 'app-tabs',
  imports: [],
  templateUrl: './tabs.html',
  styleUrl: './tabs.scss',
})
export class TabsComponent {
  readonly tabs = input<UiTabItem[]>([]);
  readonly activeTabId = input('');

  readonly activeTabIdChange = output<string>();

  protected readonly resolvedActiveTabId = computed(() => {
    if (this.activeTabId()) {
      return this.activeTabId();
    }

    return this.tabs()[0]?.id ?? '';
  });

  protected selectTab(tabId: string): void {
    if (tabId === this.resolvedActiveTabId()) {
      return;
    }

    this.activeTabIdChange.emit(tabId);
  }

  protected isActive(tabId: string): boolean {
    return this.resolvedActiveTabId() === tabId;
  }
}
