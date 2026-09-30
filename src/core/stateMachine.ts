/** Explicit game state machine. Invalid transitions are rejected. */
export type GameState =
  | 'BOOT'
  | 'LOADING'
  | 'MENU'
  | 'DAILY_PUZZLE'
  | 'PRACTICE_SELECT'
  | 'PRACTICE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CARD_COLLECTION'
  | 'SETTINGS';

export const TRANSITIONS: Record<GameState, readonly GameState[]> = {
  BOOT: ['LOADING'],
  LOADING: ['MENU'],
  MENU: ['DAILY_PUZZLE', 'PRACTICE_SELECT', 'CARD_COLLECTION', 'SETTINGS', 'COMPLETED'],
  DAILY_PUZZLE: ['PAUSED', 'COMPLETED', 'MENU'],
  PRACTICE_SELECT: ['PRACTICE', 'MENU'],
  PRACTICE: ['PAUSED', 'COMPLETED', 'MENU', 'PRACTICE_SELECT'],
  PAUSED: ['DAILY_PUZZLE', 'PRACTICE', 'SETTINGS', 'MENU', 'PRACTICE_SELECT'],
  COMPLETED: ['MENU', 'CARD_COLLECTION', 'PRACTICE_SELECT', 'PRACTICE', 'DAILY_PUZZLE'],
  CARD_COLLECTION: ['MENU', 'PRACTICE_SELECT'],
  SETTINGS: ['MENU', 'PAUSED'],
};

export type StateListener = (to: GameState, from: GameState) => void;

export class StateMachine {
  private current: GameState = 'BOOT';
  private listeners = new Set<StateListener>();
  /** State to return to from PAUSED / SETTINGS. */
  private stack: GameState[] = [];

  get state(): GameState {
    return this.current;
  }

  get previous(): GameState | undefined {
    return this.stack[this.stack.length - 1];
  }

  can(to: GameState): boolean {
    return TRANSITIONS[this.current].includes(to);
  }

  /** Returns true when the transition happened. */
  go(to: GameState): boolean {
    if (!this.can(to)) {
      if (import.meta.env?.DEV) console.warn(`[state] rejected ${this.current} → ${to}`);
      return false;
    }
    const from = this.current;
    if (this.stack[this.stack.length - 1] === to) this.stack.pop(); // returning
    else if (to === 'PAUSED' || to === 'SETTINGS') this.stack.push(from); // overlay opened
    else this.stack = []; // moved elsewhere
    this.current = to;
    this.listeners.forEach((l) => l(to, from));
    return true;
  }

  onChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
