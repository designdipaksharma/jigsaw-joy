/**
 * Tiny synthesised sound effects (Web Audio). No audio files → nothing to
 * license and zero download cost. Output is gated by BOTH the platform audio
 * state (YouTube mute) and the in-game Sound setting; the in-game setting can
 * never override a platform mute.
 */
type Ctx = AudioContext;

export class Sfx {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private platformEnabled = true;
  private userEnabled = true;
  private paused = false;

  setPlatformEnabled(on: boolean): void {
    this.platformEnabled = on;
    this.sync();
  }

  setUserEnabled(on: boolean): void {
    this.userEnabled = on;
    this.sync();
  }

  get enabled(): boolean {
    return this.platformEnabled && this.userEnabled && !this.paused;
  }

  pause(): void {
    this.paused = true;
    this.sync();
  }

  resume(): void {
    this.paused = false;
    this.sync();
  }

  /** Must be called from a user gesture before the first sound. */
  unlock(): void {
    if (this.ctx || !this.enabled) {
      if (this.ctx?.state === 'suspended' && this.enabled) void this.ctx.resume().catch(() => undefined);
      return;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  private sync(): void {
    if (!this.ctx) return;
    if (this.enabled) void this.ctx.resume().catch(() => undefined);
    else void this.ctx.suspend().catch(() => undefined);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  pickup(): void {
    this.tone(520, 0.07, 'sine', 0.12, 0, 660);
  }

  drop(): void {
    this.tone(300, 0.08, 'sine', 0.08, 0, 240);
  }

  snap(): void {
    // Short "wooden" click: two quick tones.
    this.tone(880, 0.05, 'triangle', 0.22);
    this.tone(1320, 0.07, 'sine', 0.1, 0.02);
  }

  complete(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.16, i * 0.09));
    this.tone(1567.98, 0.6, 'sine', 0.06, 0.4);
  }
}
