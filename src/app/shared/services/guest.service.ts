import { Injectable, computed, signal } from '@angular/core';

/** Local guest identity without a Supabase account — stored only in localStorage. */
export interface GuestSession {
  id: string;
  name: string;
}

const STORAGE_KEY = 'pollapp.guest';

/**
 * Manages anonymous guest sessions without Supabase authentication.
 * Session data is stored in localStorage and restored on startup.
 */
@Injectable({ providedIn: 'root' })
export class GuestService {
  private readonly guestSignal = signal<GuestSession | null>(this.loadFromStorage());

  readonly guest = this.guestSignal.asReadonly();
  readonly isGuest = computed(() => !!this.guestSignal());
  readonly guestName = computed(() => this.guestSignal()?.name ?? null);

  /** Starts a new guest session with the given display name. */
  startSession(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const session: GuestSession = { id: this.generateId(), name: trimmed };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
    this.guestSignal.set(session);
  }

  /** Ends the active guest session and removes it from localStorage. */
  endSession(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    this.guestSignal.set(null);
  }

  /** Reads and validates a stored guest session from localStorage. */
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

  /** Generates a unique guest ID via `crypto.randomUUID` (fallback: timestamp + random). */
  private generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
