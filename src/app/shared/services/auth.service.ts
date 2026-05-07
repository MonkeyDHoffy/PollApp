import { Injectable, computed, inject, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { supabaseClient } from './supabase-client';
import { LangService } from './lang.service';

/**
 * Handles Supabase Magic-Link (OTP) authentication.
 * Manages session, OTP cooldown, display name, loading and error states as Signals.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly supabase = supabaseClient;
  private readonly langService = inject(LangService);

  private static readonly COOLDOWN_KEY = 'pollapp.otp.cooldown';
  private static readonly COOLDOWN_MS = 60_000;

  /** Reads the stored OTP cooldown timestamp from localStorage. */
  private static readStoredCooldown(): number | null {
    if (typeof localStorage === 'undefined') return null;
    const ts = parseInt(localStorage.getItem(AuthService.COOLDOWN_KEY) ?? '', 10);
    return !isNaN(ts) && ts > Date.now() ? ts : null;
  }

  private readonly sessionSignal = signal<Session | null>(null);
  private readonly initializedSignal = signal(false);
  private readonly loadingSignal = signal(false);
  private readonly messageSignal = signal<string | null>(null);
  private readonly errorSignal = signal<string | null>(null);
  private readonly otpCooldownUntilSignal = signal<number | null>(AuthService.readStoredCooldown());

  readonly session = this.sessionSignal.asReadonly();
  readonly initialized = this.initializedSignal.asReadonly();
  readonly user = computed<User | null>(() => this.sessionSignal()?.user ?? null);
  readonly loading = this.loadingSignal.asReadonly();
  readonly message = this.messageSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  /** The user's display name derived from metadata, falling back to the email prefix. */
  readonly displayName = computed<string | null>(() => {
    const user = this.user();
    if (!user) return null;
    const name = user.user_metadata?.['display_name'] as string | undefined;
    if (name?.trim()) return name.trim();
    return user.email?.split('@')[0] ?? null;
  });

  /** True when the user is logged in but has not yet set a display name. */
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

  /** Reads the current Supabase session and sets the `initialized` state to true. */
  async refreshSession(): Promise<void> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error) {
      this.errorSignal.set(error.message);
    } else {
      this.sessionSignal.set(data.session);
    }
    this.initializedSignal.set(true);
  }

  /** Clears error and success message signals. */
  clearNotices(): void {
    this.messageSignal.set(null);
    this.errorSignal.set(null);
  }

  /**
   * Sends a Magic Link to the given email address.
   * Blocks during an active OTP cooldown and returns `false`.
   * @returns `true` on success, `false` on error or active cooldown.
   */
  async sendMagicLink(email: string): Promise<boolean> {
    if (this.isCooldownActive()) return false;
    this.loadingSignal.set(true);
    this.clearNotices();
    try {
      await this.requestOtp(email);
      this.setOtpCooldown();
      this.messageSignal.set(this.langService.t()('magicLinkSent'));
      return true;
    } catch (error) {
      this.handleOtpError(error);
      return false;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Sets the display name in Supabase user metadata (first time only).
   * Has no effect if a name is already set.
   */
  async updateDisplayName(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = this.user()?.user_metadata?.['display_name'] as string | undefined;
    if (existing?.trim()) return;
    const { data, error } = await this.supabase.auth.updateUser({ data: { display_name: trimmed } });
    if (!error && data.user) {
      this.sessionSignal.update((s) => (s ? { ...s, user: data.user } : s));
    }
  }

  /** Signs the current user out of Supabase. */
  async signOut(): Promise<void> {
    this.loadingSignal.set(true);
    this.clearNotices();
    try {
      const { error } = await this.supabase.auth.signOut();
      if (error) throw error;
      this.messageSignal.set(this.langService.t()('signedOut'));
    } catch (error) {
      this.errorSignal.set(error instanceof Error ? error.message : 'Logout failed.');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  // ── Private: cooldown helpers ─────────────────────────────────────────────

  /**
   * Returns true if a cooldown is still active and sets the cooldown error message.
   */
  private isCooldownActive(): boolean {
    const until = this.otpCooldownUntilSignal();
    if (!until || until <= Date.now()) return false;
    const secs = Math.ceil((until - Date.now()) / 1000);
    this.errorSignal.set(this.langService.t()('magicLinkCooldown').replace('{s}', String(secs)));
    return true;
  }

  /** Fires the Supabase OTP request and throws on error. */
  private async requestOtp(email: string): Promise<void> {
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error } = await this.supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
  }

  /** Handles OTP errors, applying a cooldown on rate-limit responses. */
  private handleOtpError(error: unknown): void {
    const msg = error instanceof Error ? error.message : '';
    const isRateLimit = this.isRateLimitError(msg);
    if (isRateLimit) this.setOtpCooldown();
    this.errorSignal.set(
      isRateLimit ? this.langService.t()('magicLinkRateLimit') : msg || 'Login failed.'
    );
  }

  /** Returns true when the error message indicates a server-side rate limit. */
  private isRateLimitError(msg: string): boolean {
    const lower = msg.toLowerCase();
    return (
      lower.includes('rate') ||
      lower.includes('after') ||
      lower.includes('security purposes') ||
      lower.includes('429')
    );
  }

  /** Persists the OTP cooldown timestamp in the signal and localStorage. */
  private setOtpCooldown(): void {
    const until = Date.now() + AuthService.COOLDOWN_MS;
    this.otpCooldownUntilSignal.set(until);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AuthService.COOLDOWN_KEY, String(until));
    }
  }
}
