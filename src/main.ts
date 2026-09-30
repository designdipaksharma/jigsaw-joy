/**
 * Jigsaw Joy — entry point.
 * In the `playables` build the YouTube Playables SDK <script> is placed before
 * this module in index.html, so the SDK is always loaded before game code.
 */
import './styles.css';
import { App } from './game/app';

const app = new App();
app.boot().catch((err) => {
  console.error('[boot]', err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = 'Something went wrong while starting the game. Please reload.';
});
