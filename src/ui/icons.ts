/** Original line icons (24×24, stroke = currentColor). */
const s = (d: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const ICONS = {
  pause: s('<rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/>'),
  play: s('<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>'),
  back: s('<path d="M15 5l-7 7 7 7"/>'),
  soundOn: s('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  soundOff: s('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  eye: s('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: s('<path d="M2.5 12S6 5.5 12 5.5c1.6 0 3 .4 4.2 1M21.5 12S18 18.5 12 18.5c-1.6 0-3-.4-4.2-1"/><path d="M4 20L20 4"/>'),
  cards: s('<rect x="3" y="6" width="11" height="14" rx="2"/><path d="M8 4.5l9.5-1.3a2 2 0 0 1 2.2 1.7l1.6 11.3a2 2 0 0 1-1.7 2.2L17 19"/>'),
  practice: s('<path d="M4 4h6v3a2 2 0 1 0 4 0V4h6v6h-3a2 2 0 1 0 0 4h3v6h-6v-3a2 2 0 1 0-4 0v3H4z"/>'),
  settings: s('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 6.2l2.1 2.1M17.7 15.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 17.8l2.1-2.1M17.7 8.3l2.1-2.1"/>'),
  restart: s('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>'),
  home: s('<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/>'),
  close: s('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: s('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  shuffle: s('<path d="M3 7h3.5c3 0 4.5 10 8 10H21"/><path d="M3 17h3.5c1.5 0 2.5-2 3.3-4.2M14.5 7H21"/><path d="M18 4l3 3-3 3M18 14l3 3-3 3"/>'),
  lock: s('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  sparkle: s('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
};

/** Original brand mark: a puzzle-piece tucked into a card. */
export const LOGO_SVG = `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><rect x="6" y="4" width="44" height="56" rx="8" fill="#5B2A86"/><rect x="10" y="8" width="36" height="48" rx="5" fill="none" stroke="#E9B949" stroke-width="2"/><path d="M22 20h8a4.5 4.5 0 1 1 9 0h7v9a4.5 4.5 0 1 0 0 9v8H22z" fill="#E2533D" transform="translate(-2 0)"/><circle cx="52" cy="14" r="7" fill="#E9B949"/></svg>`;
