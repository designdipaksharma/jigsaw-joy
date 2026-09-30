# Deployment

## GitHub Pages (automatic)
1. Create a new GitHub repository, for example `jigsaw-joy`.
2. Push this project to its `main` branch:
   ```bash
   git remote add origin https://github.com/USERNAME/jigsaw-joy.git
   git branch -M main
   git push -u origin main
   ```
3. On GitHub, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
4. The workflow `.github/workflows/deploy.yml` runs on every push to `main`. It checks out the code, runs `npm ci`, runs `npm test`, runs `npm run build` and deploys `dist/`. You can also start it by hand from the **Actions** tab.
5. Open `https://USERNAME.github.io/jigsaw-joy/`. GitHub Pages serves it over HTTPS automatically.

**Base path.** Vite uses `base: './'`, so every asset URL is relative. The same build works at `/REPOSITORY/`, at a custom domain root, and inside YouTube Playables — no configuration needed. You can still override it with `VITE_BASE=/something/ npm run build`.

## YouTube Playables package
```bash
npm run build:playables
```
- This writes `dist-playables/` and `release/jigsaw-joy-playables.zip`.
- The build injects the official SDK script, strips browser-only lifecycle code and validates the bundle rules.
- Upload the zip, or the folder contents, only when YouTube asks for it through the Playables developer portal.
- Don't share development or staging links publicly.

## PWA / service worker
The game ships a web app manifest (name, icons, theme colour) so it can be added to a home screen. There's **no service worker** on purpose: cached stale versions could interfere with Playables deployments and with GitHub Pages updates.

## Local
```bash
npm install
npm run dev       # http://localhost:5173
npm test
npm run build && npm run preview
```
