import { Component, computed, input, output } from '@angular/core';

/** A single tab item definition. */
export interface UiTabItem {
  id: string;
  label: string;
  /** Optional badge value displayed next to the label. */
  badge?: string | number;
}

/**
 * Generic tab bar that emits the selected tab ID via `activeTabIdChange`.
 * The first tab is active by default when `activeTabId` is not set.
 */
@Component({
  selector: 'app-tabs',
  imports: [],
  templateUrl: './tabs.html',
  styleUrl: './tabs.scss',
})
export class TabsComponent {
  readonly tabs = input<UiTabItem[]>([]);
  readonly activeTabId = input('');

  /** Emits the newly selected tab ID. */
  readonly activeTabIdChange = output<string>();

  protected readonly resolvedActiveTabId = computed(() => {
    if (this.activeTabId()) return this.activeTabId();
    return this.tabs()[0]?.id ?? '';
  });

  /** Selects the tab with the given ID. Does nothing if already active. */
  protected selectTab(tabId: string): void {
    if (tabId === this.resolvedActiveTabId()) return;
    this.activeTabIdChange.emit(tabId);
  }

  /** Returns true when the given tab ID matches the resolved active tab. */
  protected isActive(tabId: string): boolean {
    return this.resolvedActiveTabId() === tabId;
  }
}
