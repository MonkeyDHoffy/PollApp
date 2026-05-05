import { Injectable, computed, inject, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { supabaseClient } from './supabase-client';
import { LangService } from './lang.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly supabase = supabaseClient;
  private readonly langService = inject(LangService);

  private readonly sessionSignal = signal<Session | null>(null);
  private readonly initializedSignal = signal(false);
  private readonly loadingSignal = signal(false);
  private readonly messageSignal = signal<string | null>(null);
  private readonly errorSignal = signal<string | null>(null);

  readonly session = this.sessionSignal.asReadonly();
  readonly initialized = this.initializedSignal.asReadonly();
  readonly user = computed<User | null>(() => this.sessionSignal()?.user ?? null);
  readonly loading = this.loadingSignal.asReadonly();
  readonly message = this.messageSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  readonly displayName = computed<string | null>(() => {
    const user = this.user();
    if (!user) return null;
    const name = user.user_metadata?.['display_name'] as string | undefined;
    if (name?.trim()) return name.trim();
    return user.email?.split('@')[0] ?? null;
  });

  // True when the user is logged in but has never set a display name
  readonly needsDisplayName = computed<boolean>(() => {
    if (!this.user()) return false;
    const name = this.user()?.user_metadata?.['display_name'] as string | undefined;
    return !name?.trim();
  });

  constructor() {
    void this.refreshSession();

    this.supabase.auth.onAuthStateChange((event, session) => {
      this.sessionSignal.set(session);

      if (event === 'SIGNED_IN' && session?.user) {
        this.errorSignal.set(null);
        this.messageSignal.set(null);
      }
    });
  }

  async refreshSession(): Promise<void> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error) {
      this.errorSignal.set(error.message);
    } else {
      this.sessionSignal.set(data.session);
    }
    this.initializedSignal.set(true);
  }

  clearNotices(): void {
    this.messageSignal.set(null);
    this.errorSignal.set(null);
  }

  async sendMagicLink(email: string): Promise<boolean> {
    this.loadingSignal.set(true);
    this.clearNotices();

    try {
      const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;

      const { error } = await this.supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) throw error;

      this.messageSignal.set(this.langService.t()('magicLinkSent'));
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      const isRateLimit =
        msg.toLowerCase().includes('rate') ||
        msg.toLowerCase().includes('after') ||
        msg.toLowerCase().includes('security purposes') ||
        msg.toLowerCase().includes('429');
      this.errorSignal.set(
        isRateLimit ? this.langService.t()('magicLinkRateLimit') : msg || 'Login fehlgeschlagen.'
      );
      return false;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async updateDisplayName(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = this.user()?.user_metadata?.['display_name'] as string | undefined;
    if (existing?.trim()) return;
    const { data, error } = await this.supabase.auth.updateUser({
      data: { display_name: trimmed },
    });
    if (!error && data.user) {
      this.sessionSignal.update((s) =>
        s ? { ...s, user: data.user } : s
      );
    }
  }

  async signOut(): Promise<void> {
    this.loadingSignal.set(true);
    this.clearNotices();

    try {
      const { error } = await this.supabase.auth.signOut();
      if (error) throw error;
      this.messageSignal.set(this.langService.t()('signedOut'));
    } catch (error) {
      this.errorSignal.set(error instanceof Error ? error.message : 'Logout fehlgeschlagen.');
    } finally {
      this.loadingSignal.set(false);
    }
  }
}
