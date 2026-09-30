import type { PlayablesAdapter } from './types';
import { ProductionPlayablesAdapter } from './production';

export type { PlayablesAdapter } from './types';

/**
 * Select the platform adapter.
 * - `playables` build: always the official SDK adapter (the SDK script tag is
 *   injected before the game bundle). The browser fallback is compiled out so
 *   no Page Visibility API code ships to YouTube.
 * - web build: the official adapter is used if a host page happens to provide
 *   `ytgame` in the Playables environment; otherwise the development adapter.
 */
export async function createAdapter(): Promise<PlayablesAdapter> {
  const sdk = typeof window !== 'undefined' ? window.ytgame : undefined;
  if (__PLAYABLES_BUILD__) {
    if (sdk) return new ProductionPlayablesAdapter(sdk);
    // SDK failed to load (e.g. offline preview). Use an inert, storage-less adapter.
    const { InertAdapter } = await import('./inert');
    return new InertAdapter();
  } else {
    if (sdk && sdk.IN_PLAYABLES_ENV) return new ProductionPlayablesAdapter(sdk);
    const { DevelopmentAdapter } = await import('./development');
    return new DevelopmentAdapter();
  }
}
