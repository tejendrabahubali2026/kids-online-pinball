// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/game/game';
import type { ScoreManager } from '../src/game/scoring';

/**
 * Headless DOM smoke test: boots the real Game class with a stubbed canvas,
 * drives the menu, plays a few frames, completes a stage and ends a run.
 * Catches missing DOM elements, broken wiring and runtime exceptions.
 */

function createContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'canvas') return { width: 540, height: 960 };
      return () => undefined;
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  };
  const base: Record<string, unknown> = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: () => ({ width: 10 }),
    getImageData: () => ({ data: [] }),
  };
  return new Proxy(base, handler) as unknown as CanvasRenderingContext2D;
}

let frameCallback: FrameRequestCallback | null = null;
let clock = 0;

function pump(frames = 1, dt = 16.7): void {
  for (let i = 0; i < frames; i++) {
    const callback = frameCallback;
    frameCallback = null;
    clock += dt;
    callback?.(clock);
  }
}

interface GameInternals {
  score: ScoreManager;
  counters: { bumpers: number; locks: number; jackpots: number; banks: number };
  endRun: (reason: 'gameOver') => void;
  state: string;
}

function internals(game: Game): GameInternals {
  return game as unknown as GameInternals;
}

let game: Game | null = null;

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => createContext()) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  class Path2DStub {
    moveTo(): void {}
    lineTo(): void {}
    arc(): void {}
    rect(): void {}
    closePath(): void {}
  }
  vi.stubGlobal('Path2D', Path2DStub);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frameCallback = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frameCallback = null;
  });
});

afterEach(() => {
  game?.destroy();
  game = null;
  document.body.innerHTML = '';
});

function boot(): Game {
  document.body.innerHTML = '<div id="root"></div>';
  const container = document.getElementById('root');
  if (!container) throw new Error('missing root');
  clock = performance.now();
  localStorage.clear();
  const booted = new Game(container);
  pump(2);
  return booted;
}

describe('game boot and menus', () => {
  it('boots to the start screen without throwing', () => {
    game = boot();
    expect(document.querySelector('.spb-start')?.classList.contains('active')).toBe(true);
    expect(document.querySelector('.js-play')).toBeTruthy();
    expect(document.querySelector('.spb-canvas')).toBeTruthy();
  });

  it('shows 50 stage cards with locked stages marked and labelled', () => {
    game = boot();
    (document.querySelector('.js-stages') as HTMLButtonElement).click();
    expect(document.querySelector('.spb-stages')?.classList.contains('active')).toBe(true);
    const cards = document.querySelectorAll('.stage-card');
    expect(cards).toHaveLength(50);
    expect(document.querySelectorAll('.stage-card.locked')).toHaveLength(49);
    const first = cards[0] as HTMLButtonElement;
    expect(first.disabled).toBe(false);
    expect(cards[1].getAttribute('aria-label')).toContain('locked');
  });

  it('opens the how-to screen and returns to the menu', () => {
    game = boot();
    (document.querySelector('.js-howto') as HTMLButtonElement).click();
    expect(document.querySelector('.spb-howto')?.classList.contains('active')).toBe(true);
    const backButtons = document.querySelectorAll<HTMLButtonElement>('.spb-howto .js-back');
    backButtons[0].click();
    expect(document.querySelector('.spb-start')?.classList.contains('active')).toBe(true);
  });

  it('toggles audio and reduced-motion preferences', () => {
    game = boot();
    const music = document.querySelector('.spb-start .js-music-toggle') as HTMLButtonElement;
    music.click();
    expect(JSON.parse(localStorage.getItem('spb_prefs_v2') ?? '{}').musicMuted).toBe(true);
    const motion = document.querySelector('.spb-start .js-motion') as HTMLButtonElement;
    motion.click();
    expect(JSON.parse(localStorage.getItem('spb_prefs_v2') ?? '{}').reducedMotion).toBe(true);
  });
});

describe('gameplay wiring', () => {
  it('starts a run, launches the ball and runs frames without errors', () => {
    const errors: ErrorEvent[] = [];
    const onError = (event: ErrorEvent): void => {
      errors.push(event);
    };
    window.addEventListener('error', onError);
    game = boot();
    (document.querySelector('.js-play') as HTMLButtonElement).click();
    pump(3);
    expect(document.querySelector('.spb-hud')?.classList.contains('in-game')).toBe(true);
    expect(document.querySelector('.hud-stage')?.textContent).toContain('STAGE 1');

    // Hold space to charge then release to launch.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    pump(30);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
    pump(90);

    // Both flippers, including simultaneous input.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true }));
    pump(20);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', bubbles: true }));
    pump(20);

    // Pause and resume.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', bubbles: true }));
    pump(2);
    expect(document.querySelector('.spb-pause')?.classList.contains('active')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', bubbles: true }));
    pump(2);

    expect(errors).toHaveLength(0);
    window.removeEventListener('error', onError);
  });

  it('supports the on-screen touch controls', () => {
    game = boot();
    (document.querySelector('.js-play') as HTMLButtonElement).click();
    pump(2);
    const left = document.querySelector('.js-touch-left') as HTMLElement;
    const right = document.querySelector('.js-touch-right') as HTMLElement;
    const launch = document.querySelector('.js-touch-launch') as HTMLElement;
    left.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    right.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    pump(10);
    left.dispatchEvent(new Event('pointerup', { bubbles: true }));
    right.dispatchEvent(new Event('pointerup', { bubbles: true }));
    launch.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    pump(20);
    launch.dispatchEvent(new Event('pointerup', { bubbles: true }));
    pump(10);
    expect(document.querySelector('.spb-canvas')).toBeTruthy();
  });

  it('completes a stage, unlocks the next one and advances', () => {
    game = boot();
    (document.querySelector('.js-play') as HTMLButtonElement).click();
    pump(3);
    const data = internals(game);
    data.counters.bumpers = 50;
    data.score.stageScore = 50_000;
    pump(3);
    expect(document.querySelector('.spb-complete')?.classList.contains('active')).toBe(true);
    const progress = JSON.parse(localStorage.getItem('spb_progress_v2') ?? '{}');
    expect(progress.unlocked).toBe(2);
    expect(progress.completed).toContain(1);

    (document.querySelector('.js-next') as HTMLButtonElement).click();
    pump(2);
    expect(document.querySelector('.hud-stage')?.textContent).toContain('STAGE 2');
  });

  it('soaks for 700 frames with random input without throwing', () => {
    game = boot();
    (document.querySelector('.js-play') as HTMLButtonElement).click();
    pump(2);
    const codes = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'];
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 700; i++) {
      if (i % 23 === 0) {
        const code = codes[Math.floor(random() * codes.length)];
        window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      }
      if (i % 37 === 0) {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', bubbles: true }));
      }
      if (i === 10) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      }
      if (i === 40) {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
      }
      pump(1);
      const scoreText = document.querySelector('.hud-score')?.textContent ?? '0';
      expect(scoreText).not.toContain('NaN');
    }
    expect(document.querySelector('.spb-canvas')).toBeTruthy();
  });

  it('reaches the victory screen on stage 50 and offers a global submit', () => {
    game = boot();
    localStorage.setItem('spb_progress_v2', JSON.stringify({ unlocked: 50, best: {}, completed: [] }));
    (document.querySelector('.js-stages') as HTMLButtonElement).click();
    const cards = document.querySelectorAll<HTMLButtonElement>('.stage-card');
    cards[49].click();
    pump(3);
    expect(document.querySelector('.hud-stage')?.textContent).toContain('STAGE 50');
    const data = internals(game);
    data.counters.locks = 10;
    data.counters.jackpots = 10;
    data.counters.banks = 10;
    data.score.stageScore = 1_000_000;
    pump(3);
    expect(document.querySelector('.spb-victory')?.classList.contains('active')).toBe(true);
    expect(document.querySelector('.js-victory-save')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('spb_progress_v2') ?? '{}').completed).toContain(50);
  });

  it('ends a run, saves locally and degrades to offline leaderboard', async () => {
    game = boot();
    (document.querySelector('.js-play') as HTMLButtonElement).click();
    pump(3);
    internals(game).endRun('gameOver');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.querySelector('.spb-over')?.classList.contains('active')).toBe(true);
    expect(document.querySelectorAll('.js-local-table li')).toHaveLength(1);
    // Without the server endpoint the API call fails — the UI must show a fallback.
    const status = document.querySelector('.js-global-status');
    expect(status?.textContent).not.toBe('Loading…');
    expect(status?.textContent?.toLowerCase()).toMatch(/offline|unavailable|timed out|not valid/);
  });
});
