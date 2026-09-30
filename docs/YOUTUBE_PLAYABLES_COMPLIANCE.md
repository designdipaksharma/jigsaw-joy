# YouTube Playables — Compliance Notes

**Status: Prepared for YouTube Playables submission.** This game has **not** been reviewed, approved or certified by Google/YouTube. Everything below is our own mapping of the published requirements to the implementation, so it can be checked during review.

Requirements were read from Google's official documentation on **2026-09-30**:

| Source | URL |
|---|---|
| Certification overview | https://developers.google.com/youtube/gaming/playables/certification/requirements |
| Integration | https://developers.google.com/youtube/gaming/playables/certification/requirements_integration |
| Design | https://developers.google.com/youtube/gaming/playables/certification/requirements_design |
| Stability & performance | https://developers.google.com/youtube/gaming/playables/certification/requirements_stability |
| Privacy & data | https://developers.google.com/youtube/gaming/playables/certification/requirements_privacydata |
| Accessibility | https://developers.google.com/youtube/gaming/playables/certification/requirements_accessibility |
| i18n / L10n | https://developers.google.com/youtube/gaming/playables/certification/requirements_i18n_l10n |
| Monetization | https://developers.google.com/youtube/gaming/playables/certification/requirements_monetization |
| Trust & safety | https://developers.google.com/youtube/gaming/playables/certification/requirements_trustsafety |
| SDK reference | https://developers.google.com/youtube/gaming/playables/reference/sdk |
| Getting started (SDK tag) | https://developers.google.com/youtube/gaming/playables/reference/getting_started |
| Test suite (CSP) | https://developers.google.com/youtube/gaming/playables/reference/test_suite_guide |
| Official TypeScript definitions | https://www.youtube.com/playablesportal/static/youtube_ytgame_web_deploy_mpm_files/index.d.ts |

Google's docs are the authority. Re-check them right before you submit — they change (see the revision history page linked from the overview).

## How the build handles it

- `npm run build:playables` produces `dist-playables/` and `release/jigsaw-joy-playables.zip`.
- That build adds `<script src="https://www.youtube.com/game_api/v1"></script>` as the **first script** in `<head>`, before the game module.
- `__PLAYABLES_BUILD__` removes every browser-only lifecycle path from that build. `tools/package-playables.mjs` then checks the output: the SDK tag comes first, there are no absolute paths, no `visibilitychange`, no `navigator.language(s)`, filenames and file counts are legal, and size limits are met. The build fails if any check fails.
- The game only talks to the platform through `PlayablesAdapter` (`src/playables/`):
  - `ProductionPlayablesAdapter` makes the official SDK calls.
  - `DevelopmentAdapter` is for GitHub Pages and local dev (localStorage and Page Visibility).
  - `InertAdapter` keeps the Playables build playable if the SDK script fails to load.

## Requirement mapping

### Integration
| Requirement (summary) | Level | How it's met | Where |
|---|---|---|---|
| Load the SDK before any game code | MUST | The SDK tag is injected ahead of the module script, and the package check verifies the order | `vite.config.ts`, `tools/package-playables.mjs` |
| Call `firstFrameReady` once a loading/splash screen renders | MUST | The loading screen is static HTML and paints at once. `firstFrameReady()` is called right after the adapter is created | `src/game/app.ts` `boot()` |
| Call `gameReady` only when the game is interactive | MUST | Called after the home screen renders (two rAFs later). Guarded so it's sent once, always after `firstFrameReady` | `app.ts`, `production.ts` |
| Await `loadData` before `saveData` | MUST | `SaveManager.flush()` does nothing until `load()` resolves. Covered by a unit test | `src/storage/save.ts`, `tests/core.test.ts` |
| Save on material progress | MUST | Saves on piece placement/moves (1.2 s debounce), on completion (immediately), on settings changes, and on `onPause` (flush) | `session.ts`, `app.ts` |
| Work with cloud saves from earlier versions | MUST | The save has a version field `v`. `migrate()` upgrades older versions and `parseSave()` never throws or discards valid data | `save.ts` |
| Final flush save up to 64 KiB (best effort) | info | A year of daily cards serialises to less than 64 KiB (unit test). The save is compact JSON | `tests/core.test.ts` |
| Best score sent matches the best score in the save | MUST (if used) | `sendScore` sends the collected-cards count, which only goes up and comes straight from the save. It's sent at boot and after each daily completion | `app.ts` |
| Respect the platform mute (`isAudioEnabled` / `onAudioEnabledChange`) | MUST | `Sfx` output = platform audio **and** the in-game setting. The in-game toggle can never unmute a muted YouTube player | `src/audio/sfx.ts` |
| Pause everything on `onPause`; resume only on `onResume` | MUST | On `onPause`: timer stops, rAF loop is cancelled, animations finish instantly, audio is suspended, CSS animations are paused, and the pause menu opens. Nothing restarts until `onResume` **and** the player taps Resume | `app.ts` `onPlatformPause/onPlatformResume` |
| Don't use the Page Visibility API | MUST NOT | Only `DevelopmentAdapter` uses it, and it's compiled out of the Playables build (the package check verifies this) | `src/playables/index.ts` |

### Design
| Requirement | Level | Implementation |
|---|---|---|
| Playable at all aspect ratios (9:32 … 32:9), adjusts on resize | MUST | `computeLayout()` switches between tray-below and tray-right layouts. Unit-tested at 11 sizes, from 320×568 up to 2560×720 |
| Keep state across resizes | MUST | A resize only re-rasterises. Engine state and the timer are untouched, and free pieces are clamped back into view |
| No orientation lock | MUST NOT | None |
| Touch and mouse for all interactions | MUST | Pointer Events share one code path. Nothing relies on hover or right-click |
| Keyboard for directional input | SHOULD | Arrow keys + Enter place pieces. Menus are native buttons |
| Esc closes dialogs; never `preventDefault` on Esc | SHOULD / MUST NOT | The global handler closes modals and never calls `preventDefault` for Esc |
| Don't ignore or delay input | MUST | Input is handled synchronously and frames are drawn on the next rAF |
| Haptics need a toggle | MUST (if used) | Settings → Vibration (shown only where `navigator.vibrate` exists) |
| Crisp text and graphics at every density | MUST | Canvas uses devicePixelRatio (capped at 3). Art is vector SVG rasterised at display resolution. UI is DOM/CSS |
| No icons that mimic platform close/mute/menu near those controls | MUST NOT | The in-HUD sound button is **hidden** in the Playables build. The pause button is a plain pause glyph. There's no close or X button during gameplay |
| No in-game exit/quit button | MUST NOT | There isn't one. "Main menu" goes back to the game's home screen |
| No clickable external links | MUST NOT | None, anywhere |
| No sharing prompts | MUST NOT | None |
| No extra user agreements | MUST NOT | None |
| Tell players when there's no more content | MUST | After the daily puzzle: "You've finished today's Daily Puzzle. A new one unlocks at 00:00 UTC. Practice mode is always open." This appears on Home and on the completion screen |
| Metadata and thumbnails without logos or branding | MUST | `promo/thumb-16x9.jpg`, `thumb-1x1.jpg` and `thumb-9x16.jpg` show only original artwork cards — no logo, no YouTube marks |

### Stability & performance
| Requirement | Level | Measured |
|---|---|---|
| Initial bundle < 30 MiB (should be < 15 MiB) | MUST | About 95 KiB of HTML, JS and CSS before `gameReady` (see PERFORMANCE.md) |
| Total bundle < 250 MiB | MUST | About 1.2 MiB |
| Each file < 30 MiB (should be < 512 KiB) | MUST / SHOULD | Largest file is about 107 KiB |
| Save < 3 MiB (should be < 500 KiB) | MUST | Typically a few KiB |
| Interactive in under 5 s | SHOULD | Home is interactive after a single JS/CSS request |
| Peak JS heap ≤ 512 MB | MUST | Sprites are released on exit, and the art canvas is sized to the display. Expected well under 100 MB — **REQUIRES MANUAL VERIFICATION** on low-end devices with DevTools |
| Standards-based Web APIs; Chrome/Edge/Firefox and the YouTube Android/iOS apps | MUST | Canvas 2D, Pointer Events and Web Audio only. **REQUIRES MANUAL VERIFICATION** inside the YouTube apps |
| Relative paths only | MUST | `base: './'`. The package check rejects `src="/` and `href="/` |
| Legal filenames, ≤ 8000 files | MUST | Checked by the package script (about 40 files) |

### Privacy & data
| Requirement | Implementation |
|---|---|
| No external calls except where required | The Playables build requests only its own files and the SDK script. No analytics, fonts, CDNs or APIs |
| Clipboard only on explicit paste | The clipboard is never accessed |
| Never ask for or collect personal info | No text inputs exist at all |
| Follow the Google Privacy Policy | See PRIVACY.md |

### Accessibility (SHOULD)
The game aims for WCAG 2.1 AA:

- Semantic buttons, visible focus rings and an ARIA live region for announcements.
- Keyboard play.
- Difficulty shown with text and pip count, not just colour.
- Reduced-motion setting that follows the system by default.
- Touch targets of at least 44 px.
- AGI accessibility tags: choose honestly in the developer portal. Suggested candidates: *No time pressure* (the timer is informational only), *Keyboard controls*, *Reduced motion option*, *Playable without sound*. **REQUIRES MANUAL VERIFICATION** against the official AGI tag list.

### i18n / L10n
| Requirement | Implementation |
|---|---|
| Support English | Yes. English is the only language |
| MAY use `getLanguage` | Called at boot, but English is always used |
| MUST NOT use browser localization APIs | No `navigator.language(s)` and no `Intl`/`toLocale*` formatting. Month names are hard-coded in `src/utils/date.ts`. The package check greps for `navigator.language` |

### Monetization
There are no ads, no in-app purchases and no off-platform monetization, so there's nothing to configure.

### Trust & safety
- All artwork, sound (synthesised) and code are original. See LICENSE and README → Credits.
- Content is suitable for a general 13+ audience and isn't "made for kids".
- The title, description and thumbnails describe the game accurately.
- Dev and staging links must not be shared outside certification testing.

## Content-Security-Policy check
The official test suite's CSP includes:

- `script-src 'self' 'unsafe-inline' https://www.youtube.com/game_api/v1`
- `img-src 'self' blob: data:`
- `media-src 'self' blob:`
- `connect-src 'self' blob: data:`
- `sandbox allow-pointer-lock allow-same-origin allow-scripts` — note: no `allow-modals`

The game fits within it:

- Images are same-origin SVGs.
- Audio is Web Audio synthesis, so there are no media requests.
- It never uses `alert`, `confirm` or `prompt` — dialogs are custom.
- It uses no forms, no workers and no external fonts.

## Can't be verified until YouTube provides the environment
1. Real `ytgame` behaviour: `loadData` returning cloud data, `onPause` timing, the final flush on exit, and the audio state. This was exercised only against a **mock SDK** in automated QA.
2. Running inside the YouTube Android and iOS apps (webview input, safe areas, performance).
3. Peak memory on low-end devices inside YouTube.
4. Whether reviewers accept the in-game Sound setting in the Settings screen (it isn't near the platform controls).
5. Portal metadata: genre, AGI tags, publisher info and thumbnail requirements at submission time.

## Testing procedure
1. `npm test` — 55 unit tests (seeding, generator, engine, layout, timer, saves, state machine).
2. `npm run build:playables` — fails if any automated bundle rule is broken.
3. Serve the Playables build with `npx vite preview --outDir dist-playables`. Apply the official CSP header through Chrome DevTools → Overrides (test suite guide) and play a full puzzle with no CSP errors in the console.
4. Mock-SDK lifecycle run, as performed in QA:
   - the call order is `firstFrameReady → loadData → getLanguage → gameReady`;
   - `saveData` only happens after `loadData`;
   - `onPause` opens the pause menu and freezes the timer;
   - `onResume` doesn't restart the timer until the player chooses Resume;
   - there is no sound button in the HUD;
   - there are no `visibilitychange` listeners.
5. Submit through the Playables developer portal / interest form and use Google's own testing tools there.
