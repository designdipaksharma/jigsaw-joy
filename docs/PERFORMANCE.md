# Performance — Jigsaw Joy

Measured on the production build (`npm run build`, Vite 8, 2026-09-30). Regenerate with `npm run build && npm run size`.

## Bundle
| What | Raw | gzip |
|---|---|---|
| JavaScript (single chunk, includes the puzzle registry) | ~73 KiB | ~24 KiB |
| Platform adapter chunk (lazy) | ~0.9 KiB | ~0.4 KiB |
| CSS | ~17 KiB | ~5 KiB |
| index.html (includes inline loading-screen CSS) | ~3 KiB | ~1.3 KiB |
| **Initial load before `gameReady`** | **~95 KiB** | **~31 KiB** |
| 32 artwork SVGs (lazy, one per puzzle) | 8–107 KiB each, ~1 MiB total | 3–11 KiB each |
| og-image.jpg, icons, manifest (not used by gameplay) | ~85 KiB | — |
| **Everything** | **~1.2 MiB, about 41 files** | ~250 KiB |

The largest files are the art SVGs: `cherry-spring.svg` (107 KiB), `fern-hollow.svg` (92 KiB) and `poppy-breeze.svg` (75 KiB). Every file is well under the Playables 512 KiB recommendation.

There are no runtime dependencies. `package.json` has only devDependencies: Vite, Vitest and TypeScript.

## Loading strategy
1. `index.html` paints a CSS-only loading card immediately. This is the "first frame", and `firstFrameReady` is sent from it.
2. One JS module and one CSS file load. The save is loaded and awaited, the home screen renders, then `gameReady` is sent.
3. Today's artwork is prefetched about 400 ms after the game becomes interactive, so tapping Play is instant.
4. Other artworks load only when their puzzle opens or their thumbnail scrolls into view (`loading="lazy"`).
5. No web fonts (system font stacks), no audio files (Web Audio synthesis), no images in the critical path.

## Runtime
- **One canvas, no per-piece DOM.** The artwork is rasterised once per layout at board-scale × DPR (capped at 3×).
- **Pre-baked sprites.** Each piece is baked into a flat sprite and a lifted sprite (shadow included) when the layout changes. A frame is only a few `drawImage` calls.
- **Static board layer.** Placed pieces are stamped into an offscreen layer, so per-frame cost doesn't grow as the puzzle fills.
- **Frames only on demand.** `requestAnimationFrame` runs only while dragging or animating. There's no idle loop, and nothing runs while paused.
- **Timer.** The display updates every 500 ms, and only while the clock runs. It uses `performance.now()`, a monotonic clock.
- **Resizes** are coalesced into one rAF. Engine state isn't rebuilt on resize.
- **Cleanup.** Leaving a puzzle removes all listeners and intervals and shrinks every cached canvas to 0×0, so the GC can reclaim its memory. The generator test builds and discards 200 puzzles.

## Optimizations performed
- Removed an early artwork that resembled a well-known album cover (a rights risk) and replaced it with *Crystal Garden*.
- Converted the OG image and promo thumbnails from PNG to JPEG: 267 KiB → 70 KiB.
- `assetsInlineLimit: 0` keeps artwork out of the JS bundle; the puzzle list is only about 6 KiB of JSON.
- The Playables build strips the development adapter entirely.
