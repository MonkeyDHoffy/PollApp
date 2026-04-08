import { Injectable, computed, signal } from '@angular/core';
import { createClient, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly supabase: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabasePublishableKey
  );

  private readonly sessionSignal = signal<Session | null>(null);
  private readonly loadingSignal = signal(false);
  private readonly messageSignal = signal<string | null>(null);
  private readonly errorSignal = signal<string | null>(null);

  readonly session = this.sessionSignal.asReadonly();
  readonly user = computed<User | null>(() => this.sessionSignal()?.user ?? null);
  readonly loading = this.loadingSignal.asReadonly();
  readonly message = this.messageSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  constructor() {
    void this.refreshSession();

    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.sessionSignal.set(session);
    });
  }

  async refreshSession(): Promise<void> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error) {
      this.errorSignal.set(error.message);
      return;
    }

    this.sessionSignal.set(data.session);
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
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        throw error;
      }

      this.messageSignal.set('Magic Link wurde gesendet. Check deine E-Mail.');
      return true;
    } catch (error) {
      this.errorSignal.set(error instanceof Error ? error.message : 'Login fehlgeschlagen.');
      return false;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.loadingSignal.set(true);
    this.clearNotices();

    try {
      const { error } = await this.supabase.auth.signOut();
      if (error) {
        throw error;
      }

      this.messageSignal.set('Du bist ausgeloggt.');
    } catch (error) {
      this.errorSignal.set(error instanceof Error ? error.message : 'Logout fehlgeschlagen.');
    } finally {
      this.loadingSignal.set(false);
    }
  }
}
