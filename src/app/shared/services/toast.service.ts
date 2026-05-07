import { Injectable, signal } from '@angular/core';

/** Visual style of a toast notification. */
export type ToastType = 'success' | 'error' | 'info';

/** A single toast notification entry. */
export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

/**
 * Manages a queue of short-lived toast notifications.
 * Toasts auto-dismiss after a configurable duration.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private toastsSignal = signal<Toast[]>([]);

  /** Read-only signal containing the currently visible toasts. */
  readonly toasts = this.toastsSignal.asReadonly();

  /** Adds a new toast and schedules its auto-dismissal. */
  show(message: string, type: ToastType = 'info', durationMs = 3500): void {
    const id = Date.now();
    this.toastsSignal.update((list) => [...list, { id, message, type }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }

  /** Shows a success toast with the default duration. */
  success(message: string): void {
    this.show(message, 'success');
  }

  /** Shows an error toast with an extended duration. */
  error(message: string): void {
    this.show(message, 'error', 5000);
  }

  /** Removes the toast with the given ID from the queue. */
  dismiss(id: number): void {
    this.toastsSignal.update((list) => list.filter((t) => t.id !== id));
  }
}
