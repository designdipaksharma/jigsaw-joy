# Game Design — Jigsaw Joy

## Pillars
1. **Calm.** No lives, no fail state, no countdowns. The timer is a personal record, not pressure.
2. **Daily ritual.** One shared puzzle per UTC day, identical for every player.
3. **Collectible reward.** Every solved Daily Puzzle becomes a numbered art card in your Collection.
4. **Honest.** No ads, purchases, loot boxes, streak guilt or fake scarcity.

## Core loop
Open → today's face-down card (number, date, difficulty, piece count, theme) → Play → drag pieces from the tray onto the board → pieces lock in when close → the last piece triggers the reveal → the card flips in → it goes into your Collection.

## Puzzle mechanics
- **Tray + board.** Loose pieces wait in a scrollable tray (below the board in portrait, to the right in landscape). This keeps pieces large and one-finger friendly on phones, where scattering 36 pieces around a board doesn't work.
- **Snapping.** A piece locks when its top-left is within 26% (mouse) or 34% (touch) of the smaller piece dimension from its home. It flies in over 140 ms with a click sound and optional vibration.
- **Proximity hint.** Within about 1.9× the snap distance, a dashed gold outline shows the target slot.
- **Wrong spot.** A piece dropped on the board but not near its home gives a short wiggle and stays where you left it, so you can build regions.
- **Touch lift.** On touch devices the dragged piece floats above your finger so it's never hidden.
- **Tray gestures.** Swiping along the tray scrolls it. Pulling a piece across it lifts the piece. The mouse lifts on press, and the wheel scrolls.
- **Preview image (G).** An optional faint copy of the art on the board, for relaxed play.
- **No rotation.** We decided against it: on small touch screens it adds fiddly controls without adding enjoyment.
- **Keyboard play.** Arrow keys pick a piece, Enter lifts it, arrow keys pick a board cell, Enter places it, Esc cancels.

## Difficulty
| Id | Grid | Pieces | Pips |
|---|---|---|---|
| easy | 3×3 | 9 | 1 |
| medium | 4×4 | 16 | 2 |
| hard | 5×5 | 25 | 3 |
| expert | 6×6 | 36 | 4 |

Change the grids in `src/core/config.ts`. The generator accepts any grid from 2×2 to 10×10.

**Weekly schedule (UTC)**, used for dates past the pinned list:

| Day | Difficulty |
|---|---|
| Sun | Expert |
| Mon | Easy |
| Tue | Medium |
| Wed | Medium |
| Thu | Hard |
| Fri | Medium |
| Sat | Hard |

## Puzzle generation
`generatePuzzle({width, height, rows, cols, seed})` is pure and deterministic:

- Each internal edge is generated **once** in world coordinates as 4 cubic Béziers (neck + head), with random tab direction, offset, size, neck width and lean.
- Neighbouring pieces traverse the same edge in opposite directions, so the shapes always interlock exactly.
- Border edges are straight.
- Tab height is 20% (±10%) of the smaller piece dimension. That keeps pieces chunky — no slivers, no overlapping tabs.

## Daily system
- `dateKey = YYYY-MM-DD` in **UTC**, and `puzzleNumber = daysSince(launchDate) + 1`. Launch is 2026-10-01 (#001).
- If `puzzles.json` pins the date, that entry is used as-is.
- Otherwise each 32-day cycle uses a seeded shuffle of the catalogue. The difficulty comes from the weekday and the seed is `hash("jigsaw-joy:daily:" + date)`.
- Dates before launch show a clearly labelled **Preview puzzle (#000)**.
- There's no server. A refresh can't change the puzzle.

## Content pipeline
`src/daily/puzzles.json`:
```json
{
  "id": "daily-001",
  "date": "2026-10-01",
  "title": "Moonlit Garden",
  "category": "Nature",
  "difficulty": "hard",
  "rows": 5,
  "columns": 5,
  "art": "assets/art/moonlit-garden.svg",
  "seed": 1000,
  "accent": "#6b4a8c"
}
```
To add puzzles:

1. Drop an original SVG (4:5, ideally 800×1000) into `public/assets/art/`. You can also add a scene to `tools/generate-art.mjs` and run `npm run art`.
2. Add an entry with a unique `id`. `date` is optional: pin it, or leave it out and it joins the rotation.
3. Run `npm test`. It validates art paths, the number of entries and determinism.

Art paths must be **relative** (no leading `/`, no URLs). The registry rejects anything else, because Playables requires relative paths.

## Modes
- **Daily Puzzle.** One per day. Progress auto-saves and resumes. Once solved, Home shows "View today's card" and explains that the next puzzle unlocks at 00:00 UTC.
- **Practice.** Any unlocked artwork at any difficulty, with a fresh random layout. Six artworks are unlocked from the start; every collected daily card unlocks its artwork. Practice never touches daily progress. One unfinished practice puzzle is remembered.
- **Collection.** A grid of collected cards, newest first. Tap a card to see it larger.

## State machine
```
BOOT → LOADING → MENU
MENU → DAILY_PUZZLE | PRACTICE_SELECT | CARD_COLLECTION | SETTINGS | COMPLETED(view card)
DAILY_PUZZLE / PRACTICE → PAUSED | COMPLETED | MENU
PAUSED → (back to puzzle) | SETTINGS | MENU | PRACTICE_SELECT
SETTINGS → MENU | PAUSED
COMPLETED → MENU | CARD_COLLECTION | PRACTICE_SELECT | PRACTICE | DAILY_PUZZLE
CARD_COLLECTION → MENU | PRACTICE_SELECT
PRACTICE_SELECT → PRACTICE | MENU
```
`PRACTICE_SELECT` was added to the requested list so the artwork picker is its own clear state. Any transition not listed here is rejected.

## Timer fairness
- The timer starts at your first interaction with a piece, not while the board is still loading.
- It stops on pause, on platform pause and on completion.
- It survives resizes and reloads (saved with progress).
- It uses `performance.now()`, so changing the device clock doesn't affect it.
- Restored values are sanity-clamped to 24 h. There's no competitive leaderboard, so there's no anti-cheat.

## Visual identity
The style is a premium puzzle magazine meets collectible art cards.

| Role | Colour |
|---|---|
| Background | cream `#FBF6EE` |
| Primary | plum `#5B2A86` / `#3D2358` |
| Accent | coral `#E2533D` |
| Highlight | gold `#E9B949` |
| Text | charcoal `#2A2530` |

Typography: a system serif for display (card titles) and system sans for UI. The brand mark and every illustration are original.
