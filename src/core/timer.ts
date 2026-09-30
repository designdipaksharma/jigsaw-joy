/**
 * Fair, pausable game timer driven by a monotonic clock (performance.now),
 * so changing the device clock cannot speed it up or rewind it.
 */
export type Clock = () => number;

const defaultClock: Clock = () =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

/** Upper bound for a restored elapsed value — protects against corrupt saves. */
export const MAX_ELAPSED_MS = 24 * 60 * 60 * 1000;

export class GameTimer {
  private accumulated = 0;
  private startedAt: number | null = null;

  constructor(private readonly clock: Clock = defaultClock) {}

  get running(): boolean {
    return this.startedAt !== null;
  }

  start(): void {
    if (this.startedAt === null) this.startedAt = this.clock();
  }

  pause(): void {
    if (this.startedAt !== null) {
      this.accumulated += Math.max(0, this.clock() - this.startedAt);
      this.startedAt = null;
    }
  }

  /** Stops permanently at the current value (used on completion). */
  stop(): number {
    this.pause();
    this.accumulated = Math.round(this.accumulated);
    return this.accumulated;
  }

  reset(elapsed = 0): void {
    this.startedAt = null;
    this.accumulated = GameTimer.sanitize(elapsed);
  }

  elapsed(): number {
    const live = this.startedAt === null ? 0 : Math.max(0, this.clock() - this.startedAt);
    return Math.min(MAX_ELAPSED_MS, this.accumulated + live);
  }

  static sanitize(ms: unknown): number {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return 0;
    return Math.min(MAX_ELAPSED_MS, Math.floor(ms));
  }
}
