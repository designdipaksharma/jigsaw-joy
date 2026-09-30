/**
 * Official YouTube Playables integration. Uses ONLY documented SDK calls:
 * https://developers.google.com/youtube/gaming/playables/reference/sdk
 */
import type { PlayablesAdapter } from './types';

export class ProductionPlayablesAdapter implements PlayablesAdapter {
  readonly name = 'youtube-playables' as const;
  private firstFrameSent = false;
  private readySent = false;
  private lastErrorAt = 0;

  constructor(private readonly sdk: YtGameSdk) {}

  get inPlayables(): boolean {
    return this.sdk.IN_PLAYABLES_ENV === true;
  }

  firstFrameReady(): void {
    if (this.firstFrameSent) return;
    this.firstFrameSent = true;
    this.sdk.game.firstFrameReady();
  }

  gameReady(): void {
    // gameReady MUST follow firstFrameReady and must only be sent once.
    if (this.readySent) return;
    this.firstFrameReady();
    this.readySent = true;
    this.sdk.game.gameReady();
  }

  loadData(): Promise<string> {
    return this.sdk.game.loadData().then((d) => (typeof d === 'string' ? d : ''));
  }

  saveData(data: string): Promise<void> {
    return this.sdk.game.saveData(data);
  }

  isAudioEnabled(): boolean {
    try {
      return this.sdk.system.isAudioEnabled();
    } catch {
      return false;
    }
  }

  onAudioEnabledChange(cb: (enabled: boolean) => void): () => void {
    return this.sdk.system.onAudioEnabledChange(cb);
  }

  onPause(cb: () => void): () => void {
    return this.sdk.system.onPause(cb);
  }

  onResume(cb: () => void): () => void {
    return this.sdk.system.onResume(cb);
  }

  getLanguage(): Promise<string> {
    return this.sdk.system.getLanguage().catch(() => 'en');
  }

  sendScore(value: number): Promise<void> {
    const v = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)));
    return this.sdk.engagement.sendScore({ value: v }).catch(() => undefined);
  }

  logError(): void {
    // The SDK is rate limited; we additionally throttle to 1 per 5 s.
    const now = Date.now();
    if (now - this.lastErrorAt < 5000) return;
    this.lastErrorAt = now;
    try {
      this.sdk.health.logError();
    } catch {
      /* ignore */
    }
  }

  logWarning(): void {
    try {
      this.sdk.health.logWarning();
    } catch {
      /* ignore */
    }
  }
}
