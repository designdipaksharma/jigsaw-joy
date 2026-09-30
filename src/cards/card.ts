/**
 * Collectible "Puzzle Card" — the game's signature object.
 * Pure DOM + CSS so it stays crisp at every size and costs no extra assets.
 */
import { DIFFICULTIES, type DifficultyId } from '../core/config';
import { formatLongDate, formatShortDate } from '../utils/date';
import { formatDuration, padNumber, spokenDuration } from '../utils/format';
import { h } from '../ui/dom';

export interface CardInfo {
  kind: 'daily' | 'practice';
  number: number;
  title: string;
  category: string;
  dateKey?: string;
  ms: number;
  difficulty: DifficultyId;
  art: string;
  accent: string;
}

export function pips(difficulty: DifficultyId): HTMLElement {
  const d = DIFFICULTIES[difficulty];
  const wrap = h('span', { class: 'pips', 'aria-hidden': 'true' });
  for (let i = 0; i < 4; i++) wrap.append(h('span', { class: i < d.pips ? 'pip on' : 'pip' }));
  return wrap;
}

export function difficultyBadge(difficulty: DifficultyId): HTMLElement {
  const d = DIFFICULTIES[difficulty];
  return h('span', { class: `diff diff-${d.id}` }, pips(difficulty), h('span', {}, d.label));
}

export function cardHeading(info: Pick<CardInfo, 'kind' | 'number'>): string {
  if (info.kind === 'practice') return 'PRACTICE CARD';
  return info.number > 0 ? `DAILY CARD #${padNumber(info.number)}` : 'PREVIEW CARD';
}

export function renderCard(info: CardInfo, size: 'lg' | 'sm' = 'lg'): HTMLElement {
  const heading = cardHeading(info);
  const d = DIFFICULTIES[info.difficulty];
  const label = `${heading}. ${info.title}. ${info.category}. ${info.dateKey ? formatLongDate(info.dateKey) + '. ' : ''}Completed in ${spokenDuration(info.ms)}. ${d.label} difficulty.`;
  const img = h('img', { src: info.art, alt: '', loading: size === 'sm' ? 'lazy' : 'eager', decoding: 'async', draggable: 'false' });
  img.addEventListener('error', () => img.closest('.card-art')?.classList.add('art-missing'), { once: true });
  const card = h(
    'article',
    { class: `pcard pcard-${size}`, style: `--accent:${info.accent}`, 'aria-label': label },
    h('div', { class: 'pcard-top' }, h('span', { class: 'pcard-num' }, heading), h('span', { class: 'pcard-cat' }, info.category)),
    h('div', { class: 'card-art' }, img),
    h('h3', { class: 'pcard-title' }, info.title),
    h(
      'div',
      { class: 'pcard-meta' },
      h('span', { class: 'pcard-date' }, info.dateKey ? (size === 'sm' ? formatShortDate(info.dateKey) : formatLongDate(info.dateKey)) : 'Practice'),
      h('span', { class: 'pcard-time' }, `⏱ ${formatDuration(info.ms)}`),
    ),
    h('div', { class: 'pcard-foot' }, difficultyBadge(info.difficulty)),
  );
  return card;
}

/** Face-down card for today's puzzle on the home screen. */
export function renderCardBack(opts: { number: number; dateKey: string; difficulty: DifficultyId; pieces: number; category: string; status: string; preview: boolean }): HTMLElement {
  return h(
    'div',
    { class: 'pcard pcard-back' },
    h('div', { class: 'back-pattern', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'back-inner' },
      h('div', { class: 'back-kicker' }, opts.preview ? 'PREVIEW PUZZLE' : 'TODAY’S PUZZLE'),
      h('div', { class: 'back-num' }, opts.preview ? '#000' : `#${padNumber(opts.number)}`),
      h('div', { class: 'back-date' }, formatLongDate(opts.dateKey)),
      h('div', { class: 'back-row' }, difficultyBadge(opts.difficulty), h('span', { class: 'back-pieces' }, `${opts.pieces} pieces`)),
      h('div', { class: 'back-theme' }, `Theme: ${opts.category}`),
      h('div', { class: 'back-status' }, opts.status),
    ),
  );
}
