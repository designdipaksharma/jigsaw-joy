/** Optional, user-toggleable haptics (Playables requires a toggle). */
export function vibrate(enabled: boolean, pattern: number | number[] = 12): void {
  if (!enabled) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    /* unsupported */
  }
}

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}
