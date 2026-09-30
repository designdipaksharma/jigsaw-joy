/**
 * Used only by the `playables` build if the SDK script could not load.
 * Keeps the game playable (progress lives in memory for the session) without
 * touching browser lifecycle APIs that Playables disallows.
 */
import type { PlayablesAdapter } from './types';

export class InertAdapter implements PlayablesAdapter {
  readonly name = 'web' as const;
  readonly inPlayables = false;
  private data = '';
  firstFrameReady(): void {}
  gameReady(): void {}
  async loadData(): Promise<string> {
    return this.data;
  }
  async saveData(data: string): Promise<void> {
    this.data = data;
  }
  isAudioEnabled(): boolean {
    return true;
  }
  onAudioEnabledChange(): () => void {
    return () => undefined;
  }
  onPause(): () => void {
    return () => undefined;
  }
  onResume(): () => void {
    return () => undefined;
  }
  async getLanguage(): Promise<string> {
    return 'en';
  }
  async sendScore(): Promise<void> {}
  logError(): void {}
  logWarning(): void {}
}
