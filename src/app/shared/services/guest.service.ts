import { Injectable, computed, signal } from '@angular/core';

/** Lokale Gast-Identität ohne Supabase-Konto — wird nur im localStorage gespeichert. */
export interface GuestSession {
  id: string;
  name: string;
}

const STORAGE_KEY = 'pollapp.guest';

/**
 * Verwaltet anonyme Gast-Sessions ohne Supabase-Authentifizierung.
 * Session-Daten werden im localStorage gespeichert und beim Start wiederhergestellt.
 */
@Injectable({ providedIn: 'root' })
export class GuestService {
  private readonly guestSignal = signal<GuestSession | null>(this.loadFromStorage());

  readonly guest = this.guestSignal.asReadonly();
  readonly isGuest = computed(() => !!this.guestSignal());
  readonly guestName = computed(() => this.guestSignal()?.name ?? null);

  /** Startet eine neue Gast-Session mit dem angegebenen Anzeigenamen. */
  startSession(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;

    const session: GuestSession = {
      id: this.generateId(),
      name: trimmed,
    };

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
    this.guestSignal.set(session);
  }

  /** Beendet die aktive Gast-Session und entfernt sie aus dem localStorage. */
  endSession(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    this.guestSignal.set(null);
  }

  /** Liest und validiert eine gespeicherte Gast-Session aus dem localStorage. */
  private loadFromStorage(): GuestSession | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        'id' in parsed &&
        'name' in parsed &&
        typeof (parsed as GuestSession).id === 'string' &&
        typeof (parsed as GuestSession).name === 'string'
      ) {
        return parsed as GuestSession;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Erzeugt eine eindeutige Gast-ID via `crypto.randomUUID` (Fallback: timestamp + random). */
  private generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
