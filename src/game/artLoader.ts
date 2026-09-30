/**
 * Loads puzzle artwork lazily (only the puzzle being opened). If the file
 * cannot be loaded, a generated fallback artwork is used so the puzzle is
 * still playable and the game never crashes.
 */
import { ART_HEIGHT, ART_WIDTH } from '../core/config';
import { hashString, mulberry32 } from '../utils/rng';

export interface ArtResult {
  source: CanvasImageSource;
  fallback: boolean;
}

const cache = new Map<string, Promise<HTMLImageElement>>();

export function resolveAsset(path: string): string {
  return new URL(path, document.baseURI).href;
}

function loadImage(url: string, timeoutMs: number): Promise<HTMLImageElement> {
  const cached = cache.get(url);
  if (cached) return cached;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    const timer = setTimeout(() => reject(new Error(`Timed out loading ${url}`)), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      if (!img.naturalWidth) reject(new Error('Empty image'));
      else resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`Failed to load ${url}`));
    };
    img.src = url;
  });
  cache.set(url, p);
  p.catch(() => cache.delete(url));
  return p;
}

export async function loadArt(path: string, seed: number, timeoutMs = 10_000): Promise<ArtResult> {
  try {
    const img = await loadImage(resolveAsset(path), timeoutMs);
    return { source: img, fallback: false };
  } catch {
    return { source: fallbackArt(seed), fallback: true };
  }
}

/** Warm the cache without blocking. */
export function prefetchArt(path: string): void {
  void loadImage(resolveAsset(path), 15_000).catch(() => undefined);
}

/** Procedural backup artwork (colourful, distinct regions so it is solvable). */
export function fallbackArt(seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = ART_WIDTH;
  c.height = ART_HEIGHT;
  const g = c.getContext('2d')!;
  const rng = mulberry32(hashString(`fallback:${seed}`));
  const pal = ['#5B2A86', '#E2533D', '#E9B949', '#2A9D8F', '#3A7CA5', '#F4A261', '#FBF6EE'];
  const grad = g.createLinearGradient(0, 0, 0, ART_HEIGHT);
  grad.addColorStop(0, '#F7E9D7');
  grad.addColorStop(1, '#E7D3F2');
  g.fillStyle = grad;
  g.fillRect(0, 0, ART_WIDTH, ART_HEIGHT);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = pal[Math.floor(rng() * pal.length)];
    g.globalAlpha = 0.55 + rng() * 0.45;
    g.beginPath();
    g.arc(rng() * ART_WIDTH, rng() * ART_HEIGHT, 20 + rng() * 110, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  return c;
}
