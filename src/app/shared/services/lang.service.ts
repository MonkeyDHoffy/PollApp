import { Injectable, computed, signal } from '@angular/core';
import { Lang, TranslationKey, TRANSLATIONS } from '../i18n/translations';

const STORAGE_KEY = 'pollapp.lang';

@Injectable({ providedIn: 'root' })
export class LangService {
  readonly lang = signal<Lang>(this.loadLang());

  readonly t = computed(() => {
    const dict = TRANSLATIONS[this.lang()];
    return (key: TranslationKey): string => dict[key];
  });

  toggle(): void {
    const next: Lang = this.lang() === 'en' ? 'de' : 'en';
    this.lang.set(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, next);
    }
  }

  private loadLang(): Lang {
    if (typeof localStorage === 'undefined') return 'en';
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'de' ? 'de' : 'en';
  }
}
