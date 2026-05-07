import { Injectable, computed, signal } from '@angular/core';
import { Lang, TranslationKey, TRANSLATIONS } from '../i18n/translations';

const STORAGE_KEY = 'pollapp.lang';

/**
 * Verwaltet die aktive UI-Sprache (EN / DE) und stellt die Übersetzungsfunktion bereit.
 * Die Sprachwahl wird im localStorage persistiert.
 */
@Injectable({ providedIn: 'root' })
export class LangService {
  readonly lang = signal<Lang>(this.loadLang());

  /** Computed-Funktion `t()(key)` gibt den übersetzten String für den aktuellen Key zurück. */
  readonly t = computed(() => {
    const dict = TRANSLATIONS[this.lang()];
    return (key: TranslationKey): string => dict[key];
  });

  /** Wechselt zwischen EN und DE und speichert die Wahl im localStorage. */
  toggle(): void {
    const next: Lang = this.lang() === 'en' ? 'de' : 'en';
    this.lang.set(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, next);
    }
  }

  /** Liest die gespeicherte Spracheinstellung aus dem localStorage (Fallback: 'en'). */
  private loadLang(): Lang {
    if (typeof localStorage === 'undefined') return 'en';
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'de' ? 'de' : 'en';
  }
}
