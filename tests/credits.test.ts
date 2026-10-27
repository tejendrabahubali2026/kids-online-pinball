// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CREDIT_SEGMENTS, CREDIT_TEXT, DEVELOPER_EMAIL, DEVELOPER_WEBSITE } from '../src/game/credit';
import { Game } from '../src/game/game';
import type { ScoreManager } from '../src/game/scoring';

/**
 * The developer credit is a hard requirement: the exact mandated string must
 * appear verbatim on the start screen, the credits screen, the gameplay footer,
 * the game-over screen and the victory screen, with the e-mail and website
 * clickable and rendered as plain text (no injected markup).
 */

/** The mandated string, typed out independently of the implementation. */
const MANDATED =
  'Dev- Tejendra Bahubali | Email - tejendrabahubali@outlook.com | Website - https://tejendrabahubali2026.pagezapp.cc.cd/';

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
  endRun: (reason: 'gameOver') => void;
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

function creditText(selector: string): string {
  const node = document.querySelector(selector);
  expect(node, `missing credit element: ${selector}`).toBeTruthy();
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('credit data', () => {
  it('exposes the mandated string verbatim', () => {
    expect(CREDIT_TEXT).toBe(MANDATED);
  });

  it('keeps segments ordered so joining them rebuilds the string', () => {
    expect(CREDIT_SEGMENTS.map((segment) => segment.text).join('')).toBe(MANDATED);
    expect(DEVELOPER_EMAIL).toBe('tejendrabahubali@outlook.com');
    expect(DEVELOPER_WEBSITE).toBe('https://tejendrabahubali2026.pagezapp.cc.cd/');
  });
});

describe('credit rendering', () => {
  it('shows the full credit on the start screen', () => {
    game = boot();
    expect(document.querySelector('.spb-start')?.classList.contains('active')).toBe(true);
    expect(creditText('.spb-start .js-start-credit')).toBe(MANDATED);
  });

  it('links the e-mail and website on the start screen', () => {
    game = boot();
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.spb-start .js-start-credit a'));
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe(`mailto:${DEVELOPER_EMAIL}`);
    expect(links[0].textContent).toBe(DEVELOPER_EMAIL);
    expect(links[1].getAttribute('href')).toBe(DEVELOPER_WEBSITE);
    expect(links[1].textContent).toBe(DEVELOPER_WEBSITE);
    // External link must not hand over window.opener.
    expect(links[1].rel).toContain('noopener');
    expect(links[1].target).toBe('_blank');
  });

  it('opens a credits screen from the start menu with the credit large and centred', () => {
    game = boot();
    (document.querySelector('.js-credits') as HTMLButtonElement).click();
    pump(2);
    expect(document.querySelector('.spb-credits')?.classList.contains('active')).toBe(true);
    expect(document.querySelector('.spb-start')?.classList.contains('active')).toBe(false);

    const hero = document.querySelector('.spb-credits .js-credit-hero');
    expect(hero?.textContent).toBe(MANDATED);
    expect(document.querySelector('.spb-credits .credit-hero')?.textContent).toContain('Tejendra Bahubali');
    expect(
      document.querySelector('.spb-credits .credit-hero-line a[href^="https"]')?.getAttribute('href')
    ).toBe(DEVELOPER_WEBSITE);
    expect(document.querySelector('.spb-credits .credit-list')?.textContent).toContain('Tejendra Bahubali');

    // Back to the menu.
    (document.querySelector('.spb-credits .js-back') as HTMLButtonElement).click();
    pump(2);
    expect(document.querySelector('.spb-start')?.classList.contains('active')).toBe(true);
  });

  it('closes the credits screen with Escape', () => {
    game = boot();
    (document.querySelector('.js-credits') as HTMLButtonElement).click();
    pump(2);
    expect(document.querySelector('.spb-credits')?.classList.contains('active')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    pump(2);
    expect(document.querySelector('.spb-start')?.classList.contains('active')).toBe(true);
    expect(document.querySelector('.spb-credits')?.classList.contains('active')).toBe(false);
  });

  it('never opens the credits screen mid-game', () => {
    game = boot();
    (document.querySelector('.js-play') as HTMLButtonElement).click();
    pump(2);
    // The credits button is only on the menu, so force the callback path.
    const internals = game as unknown as { toCredits: () => void };
    internals.toCredits();
    pump(2);
    expect(document.querySelector('.spb-credits')?.classList.contains('active')).toBe(false);
    expect(document.querySelector('.spb-hud')?.classList.contains('in-game')).toBe(true);
  });

  it('keeps a subtle credit footer during gameplay only', () => {
    game = boot();
    const rail = document.querySelector('.spb-credit-rail');
    expect(rail?.textContent).toBe(MANDATED);
    expect(rail?.classList.contains('in-game')).toBe(false);

    (document.querySelector('.js-play') as HTMLButtonElement).click();
    pump(3);
    expect(rail?.classList.contains('in-game')).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', bubbles: true }));
    pump(2);
    expect(rail?.classList.contains('in-game')).toBe(false);
  });

  it('shows the credit on the game-over screen', async () => {
    game = boot();
    (document.querySelector('.js-play') as HTMLButtonElement).click();
    pump(3);
    (game as unknown as GameInternals).endRun('gameOver');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.querySelector('.spb-over')?.classList.contains('active')).toBe(true);
    expect(creditText('.spb-over .js-over-credit')).toBe(MANDATED);
    expect(document.querySelector('.spb-over .js-over-credit a[href^="https"]')?.getAttribute('href')).toBe(
      DEVELOPER_WEBSITE
    );
  });

  it('shows the credit on the victory screen', () => {
    game = boot();
    localStorage.setItem('spb_progress_v2', JSON.stringify({ unlocked: 50, best: {}, completed: [] }));
    (game as unknown as GameInternals).score.stageScore = 0;
    (document.querySelector('.js-stages') as HTMLButtonElement).click();
    document.querySelectorAll<HTMLButtonElement>('.stage-card')[49].click();
    pump(3);
    const data = game as unknown as GameInternals & {
      counters: { locks: number; jackpots: number; banks: number };
    };
    data.counters.locks = 10;
    data.counters.jackpots = 10;
    data.counters.banks = 10;
    data.score.stageScore = 900_000;
    pump(3);
    expect(document.querySelector('.spb-victory')?.classList.contains('active')).toBe(true);
    expect(creditText('.spb-victory .js-victory-credit')).toBe(MANDATED);
  });

  it('renders the credit as text, not markup', () => {
    game = boot();
    const node = document.querySelector('.spb-start .js-start-credit');
    expect(node?.querySelector('script')).toBeNull();
    // Adding a name containing markup must not alter the credit line either.
    expect(node?.children).toHaveLength(2); // the two anchors only
  });
});
