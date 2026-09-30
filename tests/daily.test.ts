import { describe, expect, it } from 'vitest';
import { PuzzleRegistry, parseRegistry, artSlug } from '../src/daily/registry';
import { addDays, daysBetween, formatLongDate, isDateKey, utcDateKey, weekdayOf } from '../src/utils/date';
import { hashString, mulberry32 } from '../src/utils/rng';

describe('rng + hashing', () => {
  it('hash is stable', () => {
    expect(hashString('2026-10-01')).toBe(hashString('2026-10-01'));
    expect(hashString('2026-10-01')).not.toBe(hashString('2026-10-02'));
  });
  it('mulberry32 is deterministic and in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('UTC dates', () => {
  it('uses UTC, not local time', () => {
    expect(utcDateKey(new Date('2026-10-01T23:59:59Z'))).toBe('2026-10-01');
    expect(utcDateKey(new Date('2026-10-02T00:00:00Z'))).toBe('2026-10-02');
    expect(utcDateKey(new Date('2026-10-01T23:30:00-05:00'))).toBe('2026-10-02');
  });
  it('validates keys', () => {
    expect(isDateKey('2026-02-29')).toBe(false);
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(isDateKey('2026-1-01')).toBe(false);
  });
  it('day math crosses months and DST-free', () => {
    expect(daysBetween('2026-10-01', '2026-11-01')).toBe(31);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekdayOf('2026-10-01')).toBe(4); // Thursday
    expect(formatLongDate('2026-10-27')).toBe('October 27, 2026');
  });
});

describe('daily puzzle registry', () => {
  const reg = new PuzzleRegistry();

  it('numbers puzzles from the launch date', () => {
    expect(reg.daily('2026-10-01').number).toBe(1);
    expect(reg.daily('2026-10-02').number).toBe(2);
    expect(reg.daily('2026-10-03').number).toBe(3);
    expect(reg.daily('2026-10-27').number).toBe(27);
  });

  it('is deterministic for the same date', () => {
    for (const d of ['2026-10-01', '2026-12-25', '2027-06-15', '2030-01-01']) {
      expect(reg.daily(d)).toEqual(reg.daily(d));
    }
  });

  it('pinned entries are used verbatim', () => {
    const p = reg.daily('2026-10-01');
    expect(p.id).toBe('daily-001');
    expect(p.title).toBe('Moonlit Garden');
    expect(p.preview).toBe(false);
  });

  it('dates beyond the schedule rotate deterministically with weekly difficulty', () => {
    const d = '2027-03-10';
    const p = reg.daily(d);
    expect(p.number).toBe(daysBetween('2026-10-01', d) + 1);
    expect(p.id).toBe(`daily-${String(p.number).padStart(3, '0')}`);
    expect(p.difficulty).toBe(reg.weekly[weekdayOf(d)]);
    expect(p.seed).toBe(hashString(`jigsaw-joy:daily:${d}`));
  });

  it('each rotation cycle visits every artwork exactly once', () => {
    const n = reg.puzzles.length;
    const start = addDays('2026-10-01', n); // first un-pinned cycle
    const slugs = new Set<string>();
    for (let i = 0; i < n; i++) slugs.add(artSlug(reg.daily(addDays(start, i)).art));
    expect(slugs.size).toBe(n);
  });

  it('dates before launch are a preview (#0)', () => {
    const p = reg.daily('2026-09-30');
    expect(p.number).toBe(0);
    expect(p.preview).toBe(true);
  });

  it('ships at least 30 original puzzle cards with local relative art', () => {
    expect(reg.puzzles.length).toBeGreaterThanOrEqual(30);
    for (const p of reg.puzzles) {
      expect(p.art.startsWith('assets/art/')).toBe(true);
      expect(p.art).toMatch(/^[A-Za-z0-9_\-./]+$/);
    }
    expect(reg.artCatalog().length).toBeGreaterThanOrEqual(30);
  });

  it('rejects absolute/remote art paths and duplicate ids', () => {
    const parsed = parseRegistry({
      launchDate: '2026-10-01',
      weeklyDifficulty: ['easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy'],
      puzzles: [
        { id: 'a', art: 'assets/art/x.svg' },
        { id: 'a', art: 'assets/art/y.svg' },
        { id: 'b', art: 'https://example.com/z.svg' },
        { id: 'c', art: '/assets/art/z.svg' },
      ],
    });
    expect(parsed.puzzles.map((p) => p.id)).toEqual(['a']);
  });
});
