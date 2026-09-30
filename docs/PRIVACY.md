# Privacy — Jigsaw Joy

Jigsaw Joy doesn't collect personal information. There is no account, login, email, name, age, location or payment prompt anywhere in the game. There are no text inputs at all.

## What is stored
The game keeps one small JSON "save" containing:

| Field | Purpose |
|---|---|
| `settings` | Your choices for sound effects, vibration, reduce motion and the preview image |
| `cards` | For each Daily Puzzle you solved: its date, puzzle number, artwork id and title, category, difficulty and completion time |
| `best` | Best completion time per artwork and difficulty |
| `practiceSolved` | How many practice puzzles you've finished |
| `progress` | Where the pieces are in any unfinished daily or practice puzzle, plus the elapsed time |

## Where it is stored
- **Web / GitHub Pages build:** in your browser's `localStorage` under the key `jigsaw-joy:save:v1`, on your device only. If storage is blocked, the game keeps playing and holds progress in memory until the tab closes.
- **YouTube Playables build:** through the official YouTube Playables SDK (`ytgame.game.saveData` / `loadData`). YouTube stores it with your game data under Google's privacy policy. The game also reports one number — how many daily cards you've collected — with `ytgame.engagement.sendScore`.

## What is transmitted
- **Web build:** nothing. The game downloads its own files from the host and makes no other network requests.
- **Playables build:** only the SDK calls listed above. When the game hits an error it calls `ytgame.health.logError()` / `logWarning()`; those calls carry no data from the game.

## Not included
Jigsaw Joy has no analytics, advertising, tracking pixels, cookies, fingerprinting, clipboard access, third-party fonts, CDNs or external APIs.

## Deleting your data
Go to Settings → **Reset progress** to erase cards, best times and puzzles in progress. Clearing your browser's site data for the game's URL removes everything on the web build.
