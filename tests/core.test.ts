import { describe, expect, it } from 'vitest';
import { GameTimer, MAX_ELAPSED_MS } from '../src/core/timer';
import { StateMachine, TRANSITIONS } from '../src/core/stateMachine';
import { SaveManager, defaultSave, parseSave, serializeSave } from '../src/storage/save';
import { formatDuration } from '../src/utils/format';

describe('timer', () => {
  const clock = () => {
    let t = 1000;
    return { now: () => t, advance: (ms: number) => (t += ms) };
  };

  it('counts only while running', () => {
    const c = clock();
    const tm = new GameTimer(c.now);
    c.advance(500);
    expect(tm.elapsed()).toBe(0);
    tm.start();
    c.advance(1500);
    expect(tm.elapsed()).toBe(1500);
    tm.pause();
    c.advance(10_000);
    expect(tm.elapsed()).toBe(1500);
    tm.start();
    c.advance(250);
    expect(tm.stop()).toBe(1750);
    c.advance(5000);
    expect(tm.elapsed()).toBe(1750);
  });

  it('start is idempotent and reset restores elapsed', () => {
    const c = clock();
    const tm = new GameTimer(c.now);
    tm.start();
    c.advance(100);
    tm.start();
    c.advance(100);
    expect(tm.elapsed()).toBe(200);
    tm.reset(5000);
    expect(tm.running).toBe(false);
    expect(tm.elapsed()).toBe(5000);
  });

  it('sanitises corrupt values', () => {
    expect(GameTimer.sanitize(-5)).toBe(0);
    expect(GameTimer.sanitize(NaN)).toBe(0);
    expect(GameTimer.sanitize('12')).toBe(0);
    expect(GameTimer.sanitize(1e15)).toBe(MAX_ELAPSED_MS);
  });

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(161_000)).toBe('02:41');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
  });
});

describe('state machine', () => {
  it('follows the happy path', () => {
    const sm = new StateMachine();
    expect(sm.go('LOADING')).toBe(true);
    expect(sm.go('MENU')).toBe(true);
    expect(sm.go('DAILY_PUZZLE')).toBe(true);
    expect(sm.go('PAUSED')).toBe(true);
    expect(sm.previous).toBe('DAILY_PUZZLE');
    expect(sm.go('SETTINGS')).toBe(true);
    expect(sm.previous).toBe('PAUSED');
    expect(sm.go('PAUSED')).toBe(true);
    expect(sm.previous).toBe('DAILY_PUZZLE');
    expect(sm.go('DAILY_PUZZLE')).toBe(true);
    expect(sm.go('COMPLETED')).toBe(true);
    expect(sm.go('CARD_COLLECTION')).toBe(true);
    expect(sm.go('MENU')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    const sm = new StateMachine();
    expect(sm.go('DAILY_PUZZLE')).toBe(false);
    expect(sm.state).toBe('BOOT');
    sm.go('LOADING');
    sm.go('MENU');
    expect(sm.go('PAUSED')).toBe(false);
    expect(sm.go('PRACTICE')).toBe(false);
    expect(sm.state).toBe('MENU');
  });

  it('every state can eventually reach MENU', () => {
    for (const s of Object.keys(TRANSITIONS)) {
      if (s === 'BOOT') continue;
      const seen = new Set<string>([s]);
      const queue = [s];
      while (queue.length) for (const n of TRANSITIONS[queue.shift() as keyof typeof TRANSITIONS]) if (!seen.has(n)) (seen.add(n), queue.push(n));
      expect(seen.has('MENU')).toBe(true);
    }
  });

  it('notifies listeners', () => {
    const sm = new StateMachine();
    const log: string[] = [];
    sm.onChange((to, from) => log.push(`${from}>${to}`));
    sm.go('LOADING');
    sm.go('MENU');
    expect(log).toEqual(['BOOT>LOADING', 'LOADING>MENU']);
  });
});

describe('save data', () => {
  it('parses empty / corrupt input to defaults', () => {
    expect(parseSave('')).toEqual(defaultSave());
    expect(parseSave('{not json')).toEqual(defaultSave());
    expect(parseSave('[]')).toEqual(defaultSave());
  });

  it('round-trips', () => {
    const d = defaultSave();
    d.settings.sound = false;
    d.cards['2026-10-01'] = { n: 1, a: 'moonlit-garden', t: 'Moonlit Garden', c: 'Nature', d: 'hard', ms: 161000 };
    d.best['moonlit-garden:hard'] = 161000;
    d.progress.daily = { key: '2026-10-02', d: 'medium', seed: 5, e: 1234, s: { p: [[0, 0, 0]], t: [0] } };
    expect(parseSave(serializeSave(d))).toEqual(d);
  });

  it('drops invalid entries but keeps valid ones', () => {
    const raw = JSON.stringify({
      v: 1,
      cards: { 'not-a-date': { n: 1, d: 'easy' }, '2026-10-01': { n: 1, a: 'x', t: 'X', c: 'Y', d: 'nope' }, '2026-10-02': { n: 2, a: 'x', t: 'X', c: 'Y', d: 'easy', ms: 1000 } },
      best: { a: -1, b: 500 },
      settings: { sound: 'yes' },
    });
    const s = parseSave(raw);
    expect(Object.keys(s.cards)).toEqual(['2026-10-02']);
    expect(s.best).toEqual({ b: 500 });
    expect(s.settings.sound).toBe(true);
  });

  it('migrates v0 saves', () => {
    const s = parseSave(JSON.stringify({ completed: { '2026-10-01': { n: 1, a: 'x', t: 'X', c: 'Y', d: 'easy', ms: 10 } } }));
    expect(s.v).toBe(1);
    expect(s.cards['2026-10-01'].ms).toBe(10);
  });

  it('SaveManager awaits load before saving and survives failures', async () => {
    const calls: string[] = [];
    let stored = '';
    let fail = false;
    const errors: number[] = [];
    const backend = {
      loadData: async () => {
        calls.push('load');
        return stored;
      },
      saveData: async (d: string) => {
        calls.push('save');
        if (fail) throw new Error('quota');
        stored = d;
      },
    };
    const m = new SaveManager(backend, (_e, n) => errors.push(n), 5);
    await m.flush(); // before load → ignored
    expect(calls).toEqual([]);
    await m.load();
    m.update((d) => (d.practiceSolved = 3), true);
    await m.flush();
    expect(JSON.parse(stored).practiceSolved).toBe(3);
    fail = true;
    await m.flush();
    expect(errors).toEqual([1]);
    expect(calls[0]).toBe('load');
  });

  it('a year of cards fits inside the 64 KiB final-flush budget', () => {
    const d = defaultSave();
    for (let i = 0; i < 365; i++) {
      const day = new Date(Date.UTC(2026, 9, 1) + i * 864e5).toISOString().slice(0, 10);
      d.cards[day] = { n: i + 1, a: 'cherry-spring', t: 'Cherry Blossom Spring', c: 'Seasonal', d: 'expert', ms: 3599000 };
      d.best[`art-${i % 32}:expert`] = 3599000;
    }
    expect(new TextEncoder().encode(serializeSave(d)).length).toBeLessThan(64 * 1024);
  });
});
