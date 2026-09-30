/**
 * Application shell: boot sequence, platform lifecycle, state machine and
 * screen flow. Menus are light DOM; the puzzle itself is a single canvas.
 */
import { DIFFICULTIES, DIFFICULTY_ORDER, STARTER_ART, type DifficultyId } from '../core/config';
import { StateMachine, type GameState } from '../core/stateMachine';
import { PuzzleRegistry, artSlug, type DailyPuzzle } from '../daily/registry';
import { SaveManager, type ProgressRecord } from '../storage/save';
import { Sfx } from '../audio/sfx';
import { hapticsSupported } from '../audio/haptics';
import { createAdapter, type PlayablesAdapter } from '../playables';
import { PuzzleSession, type CompletionResult, type PuzzleSpec } from './session';
import { prefetchArt, resolveAsset } from './artLoader';
import { renderCard, renderCardBack, type CardInfo } from '../cards/card';
import { button, h, icon, toggle } from '../ui/dom';
import { ICONS, LOGO_SVG } from '../ui/icons';
import { formatLongDate, utcDateKey } from '../utils/date';
import { formatDuration, padNumber } from '../utils/format';
import { hashString } from '../utils/rng';

interface Modal {
  el: HTMLElement;
  close: () => void;
  restoreFocus: HTMLElement | null;
}

export class App {
  private sm = new StateMachine();
  private adapter!: PlayablesAdapter;
  private save!: SaveManager;
  private sfx = new Sfx();
  private registry!: PuzzleRegistry;
  private session: PuzzleSession | null = null;
  private modal: Modal | null = null;
  private platformPaused = false;
  private practiceDifficulty: DifficultyId = 'medium';
  private resizeRaf = 0;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private keyboardUser = false;

  private readonly el = {
    app: document.getElementById('app')!,
    loading: document.getElementById('loading')!,
    stage: document.getElementById('stage')!,
    canvas: document.getElementById('board') as HTMLCanvasElement,
    hud: document.getElementById('hud')!,
    screen: document.getElementById('screen')!,
    modalRoot: document.getElementById('modal-root')!,
    toast: document.getElementById('toast')!,
    live: document.getElementById('live')!,
  };

  // ---------------------------------------------------------------- boot
  async boot(): Promise<void> {
    this.sm.onChange((to) => {
      document.body.dataset.state = to.toLowerCase();
    });
    this.sm.go('LOADING');
    this.adapter = await createAdapter();
    // The loading screen is already painted from index.html → first frame is ready.
    this.adapter.firstFrameReady();
    this.installErrorHandlers();

    this.save = new SaveManager(this.adapter, (err, n) => {
      console.warn('[save]', err);
      this.adapter.logWarning();
      if (n === 3) this.toast('Progress could not be saved right now. You can keep playing.');
    });
    await this.save.load(); // MUST complete before any saveData call
    try {
      this.registry = new PuzzleRegistry();
    } catch (err) {
      this.fatal(err);
      return;
    }

    const st = this.save.data.settings;
    this.sfx.setUserEnabled(st.sound);
    this.sfx.setPlatformEnabled(this.adapter.isAudioEnabled());
    this.adapter.onAudioEnabledChange((on) => this.sfx.setPlatformEnabled(on));
    this.adapter.onPause(() => this.onPlatformPause());
    this.adapter.onResume(() => this.onPlatformResume());
    void this.adapter.getLanguage(); // English is the only supported language.
    this.applyMotionClass();

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => this.onResize());
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('pointerdown', () => {
      this.keyboardUser = false;
      this.sfx.unlock();
    }, { capture: true });
    document.addEventListener('keydown', () => (this.keyboardUser = true), { capture: true });

    this.sm.go('MENU');
    this.showHome();
    this.el.loading.remove();
    // gameReady only once the home screen is interactive.
    requestAnimationFrame(() => requestAnimationFrame(() => this.adapter.gameReady()));
    // Warm today's artwork in the background.
    setTimeout(() => prefetchArt(this.today().art), 400);
    // Keep the best score on YouTube in sync with the save.
    const cards = Object.keys(this.save.data.cards).length;
    if (cards > 0) void this.adapter.sendScore(cards);
  }

  private fatal(err: unknown): void {
    console.error(err);
    this.adapter?.logError();
    this.el.loading.replaceChildren(h('p', { class: 'fatal' }, 'Something went wrong while starting the game. Please reload.'));
  }

  private installErrorHandlers(): void {
    window.addEventListener('error', () => this.adapter.logError());
    window.addEventListener('unhandledrejection', () => this.adapter.logError());
  }

  // ---------------------------------------------------------------- helpers
  private reducedMotion(): boolean {
    const pref = this.save?.data.settings.reducedMotion;
    if (typeof pref === 'boolean') return pref;
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private applyMotionClass(): void {
    document.body.classList.toggle('reduce-motion', this.reducedMotion());
  }

  private today(): DailyPuzzle {
    return this.registry.daily(utcDateKey());
  }

  announce(msg: string): void {
    this.el.live.textContent = '';
    // Re-set on next frame so repeated messages are still announced.
    requestAnimationFrame(() => (this.el.live.textContent = msg));
  }

  toast(msg: string): void {
    const t = this.el.toast;
    t.textContent = msg;
    t.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
  }

  private setScreen(content: HTMLElement | null, focusSel = 'h1'): void {
    const s = this.el.screen;
    if (!content) {
      s.replaceChildren();
      s.hidden = true;
      return;
    }
    s.hidden = false;
    s.replaceChildren(content);
    s.scrollTop = 0;
    const target = content.querySelector<HTMLElement>(focusSel);
    if (target) {
      if (!target.hasAttribute('tabindex') && /^H[1-6]$/.test(target.tagName)) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  }

  private go(state: GameState): boolean {
    return this.sm.go(state);
  }

  private endSession(): void {
    this.session?.destroy();
    this.session = null;
  }

  private onResize(): void {
    if (this.resizeRaf) return;
    this.resizeRaf = requestAnimationFrame(() => {
      this.resizeRaf = 0;
      this.session?.resize();
    });
  }

  // ---------------------------------------------------------------- platform lifecycle
  private onPlatformPause(): void {
    this.platformPaused = true;
    document.body.classList.add('platform-paused');
    this.sfx.pause();
    const s = this.sm.state;
    if ((s === 'DAILY_PUZZLE' || s === 'PRACTICE') && this.session && !this.session.isFinished) {
      this.session.pause();
      if (this.go('PAUSED')) this.showPause();
    } else {
      this.session?.pause();
    }
    void this.save.flush();
  }

  private onPlatformResume(): void {
    if (!this.platformPaused) return;
    this.platformPaused = false;
    document.body.classList.remove('platform-paused');
    this.sfx.resume();
    // The player resumes the puzzle from the pause menu when ready.
  }

  // ---------------------------------------------------------------- keyboard
  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      // Never preventDefault on Escape (Playables requirement).
      if (this.modal) {
        this.modal.close();
        return;
      }
      const s = this.sm.state;
      if (s === 'SETTINGS') this.leaveSettings();
      else if (s === 'CARD_COLLECTION' || s === 'PRACTICE_SELECT') this.toHome();
      return;
    }
    if (this.modal && e.key === 'Tab') this.trapFocus(e);
    const s = this.sm.state;
    if ((s === 'DAILY_PUZZLE' || s === 'PRACTICE') && !this.modal && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'p') this.pauseGame();
      else if (k === 'g') this.setGhost(!this.save.data.settings.ghost);
    }
  }

  private trapFocus(e: KeyboardEvent): void {
    const nodes = this.modal!.el.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  private openModal(content: HTMLElement, onClose: () => void, labelledBy: string): Modal {
    this.closeModal(false);
    const backdrop = h('div', { class: 'modal-backdrop' });
    const dialog = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': labelledBy }, content);
    backdrop.append(dialog);
    const modal: Modal = {
      el: dialog,
      restoreFocus: document.activeElement as HTMLElement | null,
      close: () => {
        this.closeModal(true);
        onClose();
      },
    };
    this.modal = modal;
    this.el.modalRoot.replaceChildren(backdrop);
    this.el.app.classList.add('has-modal');
    // Keyboard users land on the primary action; pointer users get a quiet focus on the dialog.
    const f = this.keyboardUser ? dialog.querySelector<HTMLElement>('.btn-primary, button') : null;
    if (f) f.focus({ preventScroll: true });
    else {
      dialog.setAttribute('tabindex', '-1');
      dialog.focus({ preventScroll: true });
    }
    return modal;
  }

  private closeModal(restore: boolean): void {
    if (!this.modal) return;
    const m = this.modal;
    this.modal = null;
    this.el.modalRoot.replaceChildren();
    this.el.app.classList.remove('has-modal');
    if (restore && m.restoreFocus && document.contains(m.restoreFocus)) m.restoreFocus.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- HOME
  private toHome(): void {
    this.closeModal(false);
    this.endSession();
    if (this.sm.state !== 'MENU' && !this.go('MENU')) return;
    this.showHome();
  }

  private showHome(): void {
    const today = this.today();
    const data = this.save.data;
    const card = data.cards[today.dateKey];
    const progress = data.progress.daily && data.progress.daily.key === today.dateKey ? data.progress.daily : undefined;
    const pieces = today.rows * today.columns;
    let status = 'Not started yet';
    let cta = 'Play today’s puzzle';
    if (card) {
      status = `✓ Collected in ${formatDuration(card.ms)}`;
      cta = 'View today’s card';
    } else if (progress) {
      const placed = progress.s.p.filter((p) => p[0] === 2).length;
      status = `In progress · ${placed}/${pieces} placed · ${formatDuration(progress.e)}`;
      cta = 'Continue puzzle';
    }
    const cardsCount = Object.keys(data.cards).length;
    const play = button(cta, () => this.startDaily(), { cls: 'btn-primary btn-xl', icon: card ? ICONS.cards : ICONS.play });
    const view = h(
      'div',
      { class: 'screen home' },
      h(
        'header',
        { class: 'brand' },
        h('span', { class: 'brand-mark', html: LOGO_SVG }),
        h('div', { class: 'brand-text' }, h('h1', { class: 'brand-name' }, 'Jigsaw Joy'), h('p', { class: 'brand-sub' }, 'DAILY PUZZLE')),
      ),
      h(
        'section',
        { class: 'home-today', 'aria-label': 'Today’s puzzle' },
        renderCardBack({
          number: today.number,
          dateKey: today.dateKey,
          difficulty: today.difficulty,
          pieces,
          category: today.category,
          status,
          preview: today.preview,
        }),
        h(
          'div',
          { class: 'home-actions' },
          play,
          card
            ? h('p', { class: 'note done-note' }, 'That’s today’s puzzle done! A fresh Daily Puzzle unlocks at 00:00 UTC. Practice mode is always open.')
            : today.preview
              ? h('p', { class: 'note' }, `Preview puzzle — Daily Puzzle #001 arrives ${formatLongDate(this.registry.launchDate)}.`)
              : h('p', { class: 'note' }, 'One new puzzle every day. Solve it to collect its art card.'),
          h(
            'div',
            { class: 'home-grid' },
            button('Practice', () => this.showPracticeSelect(), { cls: 'btn-tile', icon: ICONS.practice }),
            button(`Collection (${cardsCount})`, () => this.showCollection(), { cls: 'btn-tile', icon: ICONS.cards, aria: `Collection, ${cardsCount} cards` }),
            button('Settings', () => this.openSettings(), { cls: 'btn-tile', icon: ICONS.settings }),
          ),
        ),
      ),
    );
    this.setScreen(view, 'h1');
  }

  // ---------------------------------------------------------------- PUZZLES
  private sessionContext() {
    return {
      canvas: this.el.canvas,
      hud: this.el.hud,
      save: this.save,
      sfx: this.sfx,
      reducedMotion: () => this.reducedMotion(),
      haptics: () => this.save.data.settings.haptics,
      ghost: () => this.save.data.settings.ghost,
      setGhost: (on: boolean) => this.setGhost(on),
      // Playables forbids in-game controls that mimic the platform mute button;
      // the in-game Sound setting remains in Settings.
      soundToggleVisible: !this.adapter.inPlayables && !__PLAYABLES_BUILD__,
      soundOn: () => this.save.data.settings.sound,
      toggleSound: () => this.setSound(!this.save.data.settings.sound),
      announce: (m: string) => this.announce(m),
      toast: (m: string) => this.toast(m),
      requestPause: () => this.pauseGame(),
      onComplete: (r: CompletionResult) => this.onComplete(r),
    };
  }

  private setGhost(on: boolean): void {
    this.save.update((d) => (d.settings.ghost = on));
    this.session?.setGhost(on);
    this.announce(on ? 'Preview image shown on the board.' : 'Preview image hidden.');
  }

  private setSound(on: boolean): void {
    this.save.update((d) => (d.settings.sound = on));
    this.sfx.setUserEnabled(on);
    if (on) this.sfx.unlock();
    this.session?.refreshSoundButton();
  }

  private dailySpec(p: DailyPuzzle): PuzzleSpec {
    return {
      mode: 'daily',
      key: p.dateKey,
      slug: artSlug(p.art),
      title: p.title,
      category: p.category,
      art: p.art,
      accent: p.accent,
      difficulty: p.difficulty,
      rows: p.rows,
      cols: p.columns,
      seed: p.seed,
      number: p.number,
      dateKey: p.dateKey,
    };
  }

  private startDaily(): void {
    const today = this.today();
    const spec = this.dailySpec(today);
    const card = this.save.data.cards[today.dateKey];
    if (card) {
      if (this.go('COMPLETED')) this.showCompletion({ spec, ms: card.ms, best: this.save.data.best[`${spec.slug}:${spec.difficulty}`] ?? card.ms, newBest: false }, true);
      return;
    }
    if (!this.go('DAILY_PUZZLE')) return;
    this.launch(spec, this.save.data.progress.daily);
  }

  private launch(spec: PuzzleSpec, restore?: ProgressRecord): void {
    this.endSession();
    this.setScreen(null);
    this.session = new PuzzleSession(spec, this.sessionContext());
    void this.session.start(restore).then(() => {
      if (this.keyboardUser) this.session?.focus();
      const pieces = spec.rows * spec.cols;
      this.announce(`${spec.mode === 'daily' ? 'Daily puzzle' : 'Practice puzzle'} started: ${pieces} pieces. Drag pieces from the tray onto the board. Keyboard: arrow keys choose a piece, Enter picks it up.`);
      if (this.platformPaused) this.onPlatformPause();
    });
  }

  private pauseGame(): void {
    const s = this.sm.state;
    if ((s !== 'DAILY_PUZZLE' && s !== 'PRACTICE') || !this.session || this.session.isFinished) return;
    this.session.pause();
    if (this.go('PAUSED')) this.showPause();
  }

  private resumeGame(): void {
    const back = this.sm.previous;
    if (!back || !this.session) return;
    this.closeModal(false);
    if (!this.go(back)) return;
    this.session.resume();
    if (this.keyboardUser) this.session.focus();
  }

  private showPause(): void {
    const s = this.session!;
    const content = h(
      'div',
      { class: 'pause' },
      h('h2', { id: 'pause-title' }, 'Paused'),
      h('p', { class: 'pause-time' }, `Time ${formatDuration(s.timer.elapsed())} · the timer is stopped`),
      button('Resume', () => this.resumeGame(), { cls: 'btn-primary btn-xl', icon: ICONS.play }),
      button('Restart puzzle', () => this.confirm('Restart this puzzle?', 'All pieces go back to the tray and the timer resets.', 'Restart', () => {
        this.resumeGame();
        this.session?.restart();
      }, () => this.showPause()), { icon: ICONS.restart }),
      button('Settings', () => {
        this.closeModal(false);
        this.openSettings();
      }, { icon: ICONS.settings }),
      button('Main menu', () => {
        this.closeModal(false);
        this.toHome();
      }, { icon: ICONS.home }),
      h('p', { class: 'note small' }, 'Your progress is saved automatically.'),
    );
    this.openModal(content, () => this.resumeGame(), 'pause-title');
  }

  private onComplete(r: CompletionResult): void {
    if (!this.go('COMPLETED')) return;
    if (r.spec.mode === 'daily') void this.adapter.sendScore(Object.keys(this.save.data.cards).length);
    this.showCompletion(r, false);
  }

  private cardInfoFrom(spec: PuzzleSpec, ms: number): CardInfo {
    return {
      kind: spec.mode,
      number: spec.number,
      title: spec.title,
      category: spec.category,
      dateKey: spec.dateKey,
      ms,
      difficulty: spec.difficulty,
      art: resolveAsset(spec.art),
      accent: spec.accent,
    };
  }

  private showCompletion(r: CompletionResult, revisit: boolean): void {
    const card = renderCard(this.cardInfoFrom(r.spec, r.ms), 'lg');
    const sparkles = this.reducedMotion() ? null : h('div', { class: 'sparkles', 'aria-hidden': 'true' }, ...Array.from({ length: 10 }, (_, i) => h('span', { style: `--i:${i}` })));
    const daily = r.spec.mode === 'daily';
    const view = h(
      'div',
      { class: 'screen completion' },
      h('h1', { class: 'completion-title' }, revisit ? 'Today’s card' : 'Puzzle complete!'),
      h('div', { class: 'card-stage' }, sparkles, card),
      h(
        'dl',
        { class: 'stats' },
        h('div', {}, h('dt', {}, 'Time'), h('dd', {}, formatDuration(r.ms))),
        h('div', {}, h('dt', {}, 'Best'), h('dd', {}, formatDuration(r.best), r.newBest && !revisit ? h('span', { class: 'badge' }, 'New best') : null)),
        h('div', {}, h('dt', {}, daily ? 'Puzzle' : 'Mode'), h('dd', {}, daily ? (r.spec.number > 0 ? `#${padNumber(r.spec.number)}` : 'Preview') : 'Practice')),
      ),
      daily ? h('p', { class: 'note done-note' }, 'You’ve finished today’s Daily Puzzle. A new one unlocks at 00:00 UTC. Practice mode is always open.') : null,
      h(
        'div',
        { class: 'completion-actions' },
        button(daily ? 'Practice' : 'Play again', () => this.showPracticeSelect(), { cls: 'btn-primary', icon: ICONS.practice }),
        button('Collection', () => this.showCollection(), { icon: ICONS.cards }),
        button('Home', () => this.toHome(), { icon: ICONS.home }),
      ),
    );
    this.endSession();
    this.setScreen(view, 'h1');
  }

  // ---------------------------------------------------------------- PRACTICE
  private practiceArts() {
    const unlocked = new Set<string>(STARTER_ART);
    for (const c of Object.values(this.save.data.cards)) if (c.a) unlocked.add(c.a);
    const catalog = this.registry.artCatalog();
    return { available: catalog.filter((a) => unlocked.has(a.slug)), lockedCount: catalog.filter((a) => !unlocked.has(a.slug)).length };
  }

  private showPracticeSelect(): void {
    this.closeModal(false);
    this.endSession();
    const s = this.sm.state;
    if (s !== 'PRACTICE_SELECT' && !this.go('PRACTICE_SELECT')) {
      if (!(this.go('MENU') && this.go('PRACTICE_SELECT'))) return;
    }
    const { available, lockedCount } = this.practiceArts();
    const resume = this.save.data.progress.practice;
    const resumeArt = resume ? this.registry.art(resume.key) : undefined;
    const grid = h('div', { class: 'art-grid', role: 'list' });
    const renderGrid = () => {
      grid.replaceChildren(
        ...available.map((a) => {
          const best = this.save.data.best[`${a.slug}:${this.practiceDifficulty}`];
          const b = h(
            'button',
            { type: 'button', class: 'art-tile', role: 'listitem', 'aria-label': `${a.title}, ${a.category}${best ? `, best ${formatDuration(best)}` : ''}`, style: `--accent:${a.accent}` },
            h('span', { class: 'art-thumb' }, h('img', { src: resolveAsset(a.art), alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' })),
            h('span', { class: 'art-name' }, a.title),
            h('span', { class: 'art-meta' }, best ? `Best ${formatDuration(best)}` : a.category),
          );
          b.addEventListener('click', () => this.startPractice(a.slug, this.practiceDifficulty));
          return b;
        }),
      );
    };
    const seg = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Difficulty' });
    const renderSeg = () => {
      seg.replaceChildren(
        ...DIFFICULTY_ORDER.map((id) => {
          const d = DIFFICULTIES[id];
          const on = id === this.practiceDifficulty;
          const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(on), class: on ? 'seg on' : 'seg', tabindex: on ? '0' : '-1' }, h('span', {}, d.label), h('small', {}, `${d.rows * d.cols} pcs`));
          b.addEventListener('click', () => {
            this.practiceDifficulty = id;
            renderSeg();
            renderGrid();
            (seg.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus();
          });
          b.addEventListener('keydown', (e) => {
            const i = DIFFICULTY_ORDER.indexOf(this.practiceDifficulty);
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              this.practiceDifficulty = DIFFICULTY_ORDER[(i + 1) % 4];
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              this.practiceDifficulty = DIFFICULTY_ORDER[(i + 3) % 4];
            } else return;
            renderSeg();
            renderGrid();
            (seg.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus();
          });
          return b;
        }),
      );
    };
    renderSeg();
    renderGrid();
    const view = h(
      'div',
      { class: 'screen list-screen' },
      this.topBar('Practice', () => this.toHome()),
      h('p', { class: 'lead' }, 'Relax with any artwork you’ve unlocked. Practice never affects your Daily Puzzle.'),
      resume && resumeArt
        ? h('div', { class: 'resume-banner' }, h('span', {}, `Unfinished: ${resumeArt.title} · ${DIFFICULTIES[resume.d].label}`), button('Continue', () => this.startPractice(resume.key, resume.d), { cls: 'btn-primary btn-sm', icon: ICONS.play }))
        : null,
      h('h2', { class: 'section-title' }, 'Difficulty'),
      seg,
      h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'Artwork'), button('Surprise me', () => {
        const pick = available[Math.floor(Math.random() * available.length)];
        this.startPractice(pick.slug, this.practiceDifficulty, true);
      }, { cls: 'btn-sm', icon: ICONS.shuffle })),
      grid,
      lockedCount > 0 ? h('p', { class: 'note' }, icon(ICONS.lock, 'icon inline'), ` ${lockedCount} more artworks join Practice as you collect Daily cards.`) : h('p', { class: 'note' }, 'You’ve unlocked every artwork. Wonderful!'),
    );
    this.setScreen(view, 'h1');
  }

  private startPractice(slug: string, difficulty: DifficultyId, fresh = false): void {
    const art = this.registry.art(slug);
    if (!art) return;
    const d = DIFFICULTIES[difficulty];
    const saved = this.save.data.progress.practice;
    const resume = !fresh && saved && saved.key === slug && saved.d === difficulty ? saved : undefined;
    const seed = resume ? resume.seed : hashString(`practice:${slug}:${difficulty}:${Date.now()}:${Math.random()}`);
    const spec: PuzzleSpec = {
      mode: 'practice',
      key: slug,
      slug,
      title: art.title,
      category: art.category,
      art: art.art,
      accent: art.accent,
      difficulty,
      rows: d.rows,
      cols: d.cols,
      seed,
      number: 0,
    };
    if (this.sm.state === 'COMPLETED' || this.sm.state === 'CARD_COLLECTION') {
      if (!this.go('PRACTICE_SELECT')) return;
    }
    if (!this.go('PRACTICE')) return;
    this.launch(spec, resume);
  }

  // ---------------------------------------------------------------- COLLECTION
  private showCollection(): void {
    this.endSession();
    if (this.sm.state !== 'CARD_COLLECTION') {
      if (this.sm.state !== 'MENU' && this.sm.state !== 'COMPLETED') this.go('MENU');
      if (!this.go('CARD_COLLECTION')) return;
    }
    const entries = Object.entries(this.save.data.cards).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    const body = entries.length
      ? h(
          'div',
          { class: 'card-grid', role: 'list' },
          ...entries.map(([dateKey, c]) => {
            const art = this.registry.art(c.a);
            const info: CardInfo = {
              kind: 'daily',
              number: c.n,
              title: c.t,
              category: c.c,
              dateKey,
              ms: c.ms,
              difficulty: c.d,
              art: resolveAsset(art?.art ?? `assets/art/${c.a}.svg`),
              accent: art?.accent ?? '#5b2a86',
            };
            const b = h('button', { type: 'button', class: 'card-btn', role: 'listitem', 'aria-label': `Open ${c.t}, card ${c.n > 0 ? '#' + padNumber(c.n) : 'preview'}` }, renderCard(info, 'sm'));
            b.addEventListener('click', () => this.showCardDetail(info));
            return b;
          }),
        )
      : h('div', { class: 'empty' }, h('div', { class: 'empty-card', 'aria-hidden': 'true', html: LOGO_SVG }), h('p', {}, 'Your collection is empty.'), h('p', { class: 'note' }, 'Solve today’s Daily Puzzle to collect your first art card.'), button('Play today’s puzzle', () => {
          this.go('MENU');
          this.startDaily();
        }, { cls: 'btn-primary', icon: ICONS.play }));
    const view = h(
      'div',
      { class: 'screen list-screen' },
      this.topBar('Collection', () => this.toHome()),
      h('p', { class: 'lead' }, `${entries.length} ${entries.length === 1 ? 'card' : 'cards'} collected · ${this.save.data.practiceSolved} practice puzzles solved`),
      body,
    );
    this.setScreen(view, 'h1');
  }

  private showCardDetail(info: CardInfo): void {
    const content = h(
      'div',
      { class: 'card-detail' },
      h('h2', { id: 'card-detail-title', class: 'sr-only' }, info.title),
      renderCard(info, 'lg'),
      button('Close', () => this.modal?.close(), { cls: 'btn-primary', icon: ICONS.close }),
    );
    this.openModal(content, () => undefined, 'card-detail-title');
  }

  // ---------------------------------------------------------------- SETTINGS
  private openSettings(): void {
    if (!this.go('SETTINGS')) return;
    const st = this.save.data.settings;
    const inPlayables = this.adapter.inPlayables || __PLAYABLES_BUILD__;
    const view = h(
      'div',
      { class: 'screen list-screen settings' },
      this.topBar('Settings', () => this.leaveSettings()),
      h(
        'section',
        { class: 'settings-group', 'aria-label': 'Preferences' },
        toggle('Sound effects', inPlayables ? 'Soft pickup, snap and completion sounds. YouTube’s mute always takes priority.' : 'Soft pickup, snap and completion sounds.', st.sound, (v) => this.setSound(v)),
        hapticsSupported() ? toggle('Vibration', 'A tiny buzz when a piece locks into place.', st.haptics, (v) => this.save.update((d) => (d.settings.haptics = v))) : null,
        toggle('Reduce motion', 'Removes piece flights, wiggles and the card reveal animation.', this.reducedMotion(), (v) => {
          this.save.update((d) => (d.settings.reducedMotion = v));
          this.applyMotionClass();
        }),
        toggle('Preview image', 'Show a faint copy of the artwork on the board (toggle anytime with G).', st.ghost, (v) => this.setGhost(v)),
      ),
      h(
        'section',
        { class: 'settings-group' },
        h('h2', { class: 'section-title' }, 'How to play'),
        h(
          'ul',
          { class: 'help' },
          h('li', {}, 'Drag a piece from the tray onto the board. It locks in when it’s close to its home.'),
          h('li', {}, 'Scroll the tray by swiping along it (or with the mouse wheel).'),
          h('li', {}, 'Drop a piece back on the tray to put it away.'),
          h('li', {}, h('strong', {}, 'Keyboard: '), 'Tab to the board, arrow keys pick a piece, Enter lifts it, arrows choose a cell, Enter places it, Esc cancels. P pauses, G toggles the preview image.'),
        ),
      ),
      h(
        'section',
        { class: 'settings-group' },
        h('h2', { class: 'section-title' }, 'Progress'),
        h('p', { class: 'note' }, inPlayables ? 'Progress is saved with your YouTube account’s game save.' : 'Progress is saved only in this browser on this device.'),
        button('Reset progress', () => this.confirm('Reset all progress?', 'This removes every collected card, best time and puzzle in progress. Settings are kept. This cannot be undone.', 'Reset everything', () => {
          void this.save.reset().then(() => this.toast('Progress reset.'));
          this.leaveSettings();
        }), { cls: 'btn-danger', icon: ICONS.restart }),
      ),
      h(
        'section',
        { class: 'settings-group about' },
        h('h2', { class: 'section-title' }, 'About'),
        h('p', {}, `Jigsaw Joy v${__APP_VERSION__}. Original artwork, sound and code.`),
        h('p', { class: 'note' }, 'No account, no ads, no tracking. Nothing you do here is sent anywhere except your own game save.'),
      ),
    );
    this.setScreen(view, 'h1');
  }

  private leaveSettings(): void {
    if (this.sm.state !== 'SETTINGS') return;
    const back = this.sm.previous;
    if (back === 'PAUSED') {
      if (!this.go('PAUSED')) return;
      this.setScreen(null);
      this.showPause();
    } else {
      this.go('MENU');
      this.showHome();
    }
  }

  // ---------------------------------------------------------------- shared UI
  private topBar(title: string, onBack: () => void): HTMLElement {
    return h('div', { class: 'topbar' }, button('', onBack, { cls: 'btn-icon', icon: ICONS.back, aria: 'Back' }), h('h1', { class: 'topbar-title' }, title));
  }

  private confirm(title: string, body: string, okLabel: string, onOk: () => void, onCancel: () => void = () => undefined): void {
    const content = h(
      'div',
      { class: 'confirm' },
      h('h2', { id: 'confirm-title' }, title),
      h('p', {}, body),
      h(
        'div',
        { class: 'confirm-actions' },
        button('Cancel', () => this.modal?.close(), { cls: 'btn-primary' }),
        button(okLabel, () => {
          this.closeModal(false);
          onOk();
        }, { cls: 'btn-danger' }),
      ),
    );
    this.openModal(content, onCancel, 'confirm-title');
  }
}

