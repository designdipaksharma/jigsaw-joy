/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';

/**
 * Two build targets share one codebase:
 *  - default ("production"): GitHub Pages / any static host. No YouTube SDK.
 *  - "playables": injects the official YouTube Playables SDK script tag as the
 *    very first script in <head> (the SDK MUST load before any game code) and
 *    compiles out every browser-only lifecycle path (e.g. Page Visibility API).
 *
 * `base: './'` makes every asset URL relative, which satisfies the Playables
 * "relative paths only" rule and also works at https://USER.github.io/REPO/.
 */
const PLAYABLES_SDK_URL = 'https://www.youtube.com/game_api/v1';

function playablesSdk(enabled: boolean): Plugin {
  return {
    name: 'jigsaw-joy-playables-sdk',
    transformIndexHtml(html) {
      if (!enabled) return html;
      return html.replace('<!--PLAYABLES_SDK-->', `<script src="${PLAYABLES_SDK_URL}"></script>`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const playables = mode === 'playables';
  return {
    base: process.env.VITE_BASE || './',
    define: {
      __PLAYABLES_BUILD__: JSON.stringify(playables),
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    },
    plugins: [playablesSdk(playables)],
    build: {
      outDir: playables ? 'dist-playables' : 'dist',
      target: 'es2020',
      assetsInlineLimit: 0,
      sourcemap: false,
      modulePreload: { polyfill: false },
      reportCompressedSize: true,
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
