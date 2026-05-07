import { Injectable, computed, signal } from '@angular/core';
import { Lang, TranslationKey, TRANSLATIONS } from '../i18n/translations';

const STORAGE_KEY = 'pollapp.lang';

/**
 * Manages the active UI language (EN / DE) and provides the translation function.
 * The language choice is persisted in localStorage.
 */
@Injectable({ providedIn: 'root' })
export class LangService {
  readonly lang = signal<Lang>(this.loadLang());

  /** Computed function `t()(key)` returns the translated string for the current key. */
  readonly t = computed(() => {
    const dict = TRANSLATIONS[this.lang()];
    return (key: TranslationKey): string => dict[key];
  });

  /** Toggles between EN and DE and persists the choice in localStorage. */
  toggle(): void {
    const next: Lang = this.lang() === 'en' ? 'de' : 'en';
    this.lang.set(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, next);
    }
  }

  /** Reads the stored language preference from localStorage (fallback: 'en'). */
  private loadLang(): Lang {
    if (typeof localStorage === 'undefined') return 'en';
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'de' ? 'de' : 'en';
  }
}
