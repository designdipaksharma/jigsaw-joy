# Manual QA Checklist

Automated coverage today: 55 unit tests, plus Playwright runs (headless Chromium) that play full puzzles at 320×568, 390×844, 768×1024, 844×390, 1280×800 and 1920×1080. Those runs cover mouse drag, CDP touch drag, tray swipe, keyboard solving, pause/resume, reload/restore, practice, settings and a mock Playables SDK.

Tick each box on a real device before submitting.

## Browsers / devices
- [ ] Chrome desktop (Windows / macOS)
- [ ] Firefox desktop
- [ ] Edge desktop
- [ ] Chrome Android (phone)
- [ ] Safari iPhone
- [ ] Safari iPad
- [ ] YouTube Android app (Playables test environment)
- [ ] YouTube iOS app (Playables test environment)

## Viewports
Check each in portrait and landscape where it applies: 320, 375, 390, 430, 768, 1024, 1280, 1920 px wide. At every size:
- [ ] No horizontal scrolling. No clipped or overlapping HUD buttons.
- [ ] Board and tray are both fully visible, and tray pieces are big enough to grab.
- [ ] Rotating mid-drag or mid-puzzle keeps every piece and the timer.

## Gameplay
- [ ] Drag from the tray with a finger: the piece lifts above the finger.
- [ ] Horizontal swipe on the tray scrolls it; a vertical pull lifts a piece.
- [ ] Mouse: pressing a tray piece lifts it, and the wheel scrolls the tray.
- [ ] Near the correct spot a dashed gold outline appears; releasing snaps with a click.
- [ ] Dropping in a wrong board spot gives a wiggle and the piece stays.
- [ ] Dropping onto the tray returns the piece there.
- [ ] Loose pieces can be moved again. Placed pieces can't.
- [ ] Preview image toggle (eye button / G) works.
- [ ] The final piece plays the reveal, then the card screen shows time, best and puzzle number.
- [ ] Page scroll and pinch-zoom never trigger while dragging.

## Keyboard
- [ ] Tab reaches the board. Arrow keys cycle pieces and a focus ring shows.
- [ ] Enter lifts a piece, arrow keys move the red cell cursor, Enter places it (correct cell snaps).
- [ ] Esc cancels a lift and closes dialogs. P pauses.
- [ ] All menus work with Tab / Enter / Space. Focus stays inside modals.

## Timer and saves
- [ ] Timer starts on the first piece interaction and stops while paused.
- [ ] Reload mid-puzzle: Home shows "In progress", and Continue restores pieces and time.
- [ ] Completing the daily adds a card to the Collection. Home then shows "View today's card" and the next-puzzle note.
- [ ] Reset progress (Settings) asks for confirmation, then clears cards, bests and progress.
- [ ] With storage blocked (private mode / blocked cookies), the game still plays.

## Settings and accessibility
- [ ] Sound off → silent. Sound on → soft sounds. No audio before the first tap.
- [ ] Vibration toggle appears only on supporting devices and works.
- [ ] Reduce motion removes flights, wiggles, the card flip and sparkles.
- [ ] Screen reader (VoiceOver / TalkBack) announces the piece count left and completion.
- [ ] Text is still readable at 200% browser zoom.

## Errors
- [ ] Block `assets/art/*.svg` in DevTools → the puzzle uses the backup artwork and shows a toast.
- [ ] Throttle to Slow 3G → the loading card appears immediately and Home is usable in a few seconds.

## Playables-specific
Do these in the YouTube test environment.
- [ ] `firstFrameReady` then `gameReady` fire (SDK test tools).
- [ ] YouTube mute silences the game even with in-game Sound on.
- [ ] Backgrounding the app or opening YouTube UI triggers `onPause`: the pause menu shows and the timer is frozen.
- [ ] Cloud save persists across sessions and devices.
- [ ] No CSP violations in the console with the official test-suite CSP.
