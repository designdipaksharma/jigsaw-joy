/**
 * Development / plain-web adapter (GitHub Pages, local dev, any browser).
 * Mirrors the Playables lifecycle with standard browser APIs:
 *  - saves go to localStorage (falls back to memory if storage is blocked)
 *  - pause/resume come from the Page Visibility API
 * This file is never used in the `playables` build (compiled out).
 */
import type { PlayablesAdapter } from './types';

export const WEB_SAVE_KEY = 'jigsaw-joy:save:v1';

export class DevelopmentAdapter implements PlayablesAdapter {
  readonly name = 'web' as const;
  readonly inPlayables = false;
  private memory = '';

  firstFrameReady(): void {
    if (import.meta.env.DEV) console.info('[platform] firstFrameReady');
  }

  gameReady(): void {
    if (import.meta.env.DEV) console.info('[platform] gameReady');
  }

  async loadData(): Promise<string> {
    try {
      return window.localStorage.getItem(WEB_SAVE_KEY) ?? '';
    } catch {
      return this.memory;
    }
  }

  async saveData(data: string): Promise<void> {
    this.memory = data;
    try {
      window.localStorage.setItem(WEB_SAVE_KEY, data);
    } catch (err) {
      throw err instanceof Error ? err : new Error('Storage unavailable');
    }
  }

  isAudioEnabled(): boolean {
    return true;
  }

  onAudioEnabledChange(): () => void {
    return () => undefined;
  }

  onPause(cb: () => void): () => void {
    const h = () => {
      if (document.visibilityState === 'hidden') cb();
    };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }

  onResume(cb: () => void): () => void {
    const h = () => {
      if (document.visibilityState === 'visible') cb();
    };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }

  async getLanguage(): Promise<string> {
    return 'en';
  }

  async sendScore(): Promise<void> {
    /* no leaderboard outside YouTube */
  }

  logError(): void {
    /* console already shows it */
  }

  logWarning(): void {
    /* noop */
  }
}
