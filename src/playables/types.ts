/**
 * Platform abstraction. The game only talks to this interface.
 *  - ProductionPlayablesAdapter → official YouTube Playables SDK (`ytgame`).
 *  - DevelopmentAdapter         → plain browsers / GitHub Pages / local dev.
 */
export interface PlayablesAdapter {
  readonly name: 'youtube-playables' | 'web';
  /** True only inside the real YouTube Playables environment. */
  readonly inPlayables: boolean;
  firstFrameReady(): void;
  gameReady(): void;
  loadData(): Promise<string>;
  saveData(data: string): Promise<void>;
  /** Platform audio permission (YouTube mute state). */
  isAudioEnabled(): boolean;
  onAudioEnabledChange(cb: (enabled: boolean) => void): () => void;
  onPause(cb: () => void): () => void;
  onResume(cb: () => void): () => void;
  getLanguage(): Promise<string>;
  sendScore(value: number): Promise<void>;
  logError(): void;
  logWarning(): void;
}
