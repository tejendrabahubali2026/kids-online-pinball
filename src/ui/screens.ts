/**
 * DOM UI: start / stage-select / how-to / pause / stage-complete / game-over /
 * victory screens plus the in-game HUD, toasts and touch controls.
 *
 * All user-supplied strings (player names) are inserted with textContent —
 * never innerHTML — so a submitted name can't inject markup.
 */
import type { HiScore, Prefs, Progress } from '../game/storage';
import { formatScore } from '../game/util';
import type { LeaderboardEntry } from '../shared/leaderboard';
import type { StageConfig } from '../game/stages/types';

export type ScreenName =
  | 'start'
  | 'stages'
  | 'howto'
  | 'pause'
  | 'complete'
  | 'over'
  | 'victory';

export interface UICallbacks {
  onPlay: () => void;
  onStageSelect: () => void;
  onHowTo: () => void;
  onMenu: () => void;
  onSelectStage: (id: number) => void;
  onResetProgress: () => void;
  onResume: () => void;
  onRestartStage: () => void;
  onNextStage: () => void;
  onPlayAgain: () => void;
  onPause: () => void;
  onToggleMusic: () => void;
  onToggleSfx: () => void;
  onToggleReducedMotion: () => void;
  onSubmitScore: (name: string) => void;
  onRetryLeaderboard: () => void;
  onFlipLeft: (pressed: boolean) => void;
  onFlipRight: (pressed: boolean) => void;
  onLaunchStart: () => void;
  onLaunchRelease: () => void;
}

export interface GoalProgress {
  label: string;
  current: number;
  target: number;
  done: boolean;
  isScore?: boolean;
}

const ICONS = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z"/></svg>',
  pause:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1.2"/><rect x="14" y="4" width="4" height="16" rx="1.2"/></svg>',
  restart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 2.64-6.36"/><polyline points="3 4 3.4 9 8.4 8.6"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  music:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  sfx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l5 4V5Z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.1 1-1.1 2.2"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  trophy:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 5H5v2a3 3 0 0 0 3 3"/><path d="M16 5h3v2a3 3 0 0 1-3 3"/><path d="M12 13v4"/><path d="M8.5 21h7"/></svg>',
};

function fmt(n: number): string {
  return formatScore(n);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function scoreRows(list: { name: string; score: number }[], highlight = -1, emptyText = 'No scores yet.'): HTMLLIElement[] {
  if (list.length === 0) {
    const li = el('li', 'empty', emptyText);
    return [li];
  }
  return list.map((entry, index) => {
    const li = el('li', index === highlight ? 'hl' : '');
    li.append(
      el('span', 'rank', String(index + 1)),
      el('span', 'name', entry.name),
      el('span', 'pts', fmt(entry.score))
    );
    return li;
  });
}

export class ScreenManager {
  private root: HTMLDivElement;
  private screens: Record<ScreenName, HTMLDivElement>;
  private active: ScreenName | null = null;

  private hud: HTMLDivElement;
  private scoreEl: HTMLDivElement;
  private bestEl: HTMLDivElement;
  private ballsEl: HTMLDivElement;
  private comboEl: HTMLDivElement;
  private multEl: HTMLDivElement;
  private stageEl: HTMLDivElement;
  private objectiveEl: HTMLDivElement;
  private timerEl: HTMLDivElement;
  private saveEl: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private musicBtn: HTMLButtonElement;
  private sfxBtn: HTMLButtonElement;

  private startTable: HTMLUListElement;
  private stageGrid: HTMLDivElement;
  private stageProgressLine: HTMLDivElement;

  private finalScoreEl: HTMLDivElement;
  private finalLabelEl: HTMLDivElement;
  private newBestEl: HTMLDivElement;
  private nameInput: HTMLInputElement;
  private submitBtn: HTMLButtonElement;
  private submitStatus: HTMLDivElement;
  private localTable: HTMLUListElement;
  private globalTable: HTMLUListElement;
  private globalStatus: HTMLDivElement;
  private retryBtn: HTMLButtonElement;

  private completeTitle: HTMLHeadingElement;
  private completeScore: HTMLDivElement;
  private completeSummary: HTMLDivElement;
  private completeNext: HTMLButtonElement;
  private victoryScore: HTMLDivElement;
  private victoryInput: HTMLInputElement;
  private victorySubmit: HTMLButtonElement;
  private victoryStatus: HTMLDivElement;
  private victoryGlobal: HTMLUListElement;


  private toastTimer = 0;
  private countRaf = 0;
  private lastScore = 0;
  private submitted = false;

  constructor(container: HTMLElement, private readonly cb: UICallbacks) {
    this.root = el('div', 'spb-ui');
    this.root.innerHTML = `
      <div class="spb-hud" aria-live="polite">
        <div class="hud-block hud-left">
          <div class="hud-label">SCORE</div>
          <div class="hud-score">0</div>
          <div class="hud-best">BEST 0</div>
        </div>
        <div class="hud-center">
          <div class="hud-stage"></div>
          <div class="hud-objectives"></div>
          <div class="hud-timer"></div>
        </div>
        <div class="hud-block hud-right">
          <div class="hud-mult">×1</div>
          <div class="hud-balls" aria-label="Balls remaining"></div>
          <div class="hud-buttons">
            <button class="icon-btn js-pause" aria-label="Pause (P or Escape)">${ICONS.pause}</button>
            <button class="icon-btn js-music" aria-label="Toggle music">${ICONS.music}</button>
            <button class="icon-btn js-sfx" aria-label="Toggle sound effects">${ICONS.sfx}</button>
          </div>
        </div>
        <div class="hud-combo"></div>
        <div class="hud-save">BALL SAVE</div>
      </div>
      <div class="spb-toast" role="status"></div>
      <div class="spb-hint"></div>

      <div class="spb-screen spb-start">
        <div class="orb orb-a"></div>
        <div class="orb orb-b"></div>
        <div class="panel start-panel">
          <div class="kicker">A KID-FRIENDLY COSMIC ARCADE · 50 STAGES</div>
          <h1 class="title"><span>SPACE</span><span class="title-mid">PINBALL</span><span class="title-blast">BLAST</span></h1>
          <div class="start-actions">
            <button class="btn btn-primary js-play">${ICONS.play}<span>PLAY</span></button>
            <button class="btn btn-ghost js-stages">${ICONS.grid}<span>STAGE SELECT</span></button>
            <button class="btn btn-ghost js-howto">${ICONS.help}<span>HOW TO PLAY</span></button>
          </div>
          <div class="audio-row">
            <button class="btn btn-small js-music-toggle">${ICONS.music}<span>MUSIC ON</span></button>
            <button class="btn btn-small js-sfx-toggle">${ICONS.sfx}<span>SFX ON</span></button>
            <button class="btn btn-small js-motion">REDUCED MOTION: OFF</button>
          </div>
          <div class="controls">
            <div class="ctl"><span class="keys"><kbd>◀</kbd><kbd>A</kbd></span><span>Left flipper</span></div>
            <div class="ctl"><span class="keys"><kbd>▶</kbd><kbd>D</kbd></span><span>Right flipper</span></div>
            <div class="ctl"><span class="keys"><kbd class="wide">SPACE</kbd></span><span>Hold to charge, release to launch</span></div>
            <div class="ctl"><span class="keys"><kbd>P</kbd><kbd>ESC</kbd></span><span>Pause</span></div>
            <div class="ctl touch"><span class="keys"><kbd class="wide">TOUCH</kbd></span><span>On-screen flipper + launch buttons</span></div>
          </div>
          <div class="hs">
            <div class="hs-title">${ICONS.trophy}<span>LOCAL TOP SPACE PILOTS</span></div>
            <ul class="hs-list js-start-table"></ul>
          </div>
        </div>
      </div>

      <div class="spb-screen spb-stages">
        <div class="panel wide-panel">
          <div class="panel-head">
            <h2 class="h-big">STAGE SELECT</h2>
            <button class="btn btn-ghost btn-small js-back">BACK</button>
          </div>
          <div class="stage-progress"></div>
          <div class="stage-grid js-stage-grid"></div>
          <button class="btn btn-danger btn-small js-reset">RESET PROGRESS</button>
        </div>
      </div>

      <div class="spb-screen spb-howto">
        <div class="panel">
          <h2 class="h-big">HOW TO PLAY</h2>
          <ul class="howto-list">
            <li><b>Left flipper</b><span>← / A / touch left button</span></li>
            <li><b>Right flipper</b><span>→ / D / touch right button</span></li>
            <li><b>Launch</b><span>Hold SPACE / ↓ / LAUNCH, release to fire</span></li>
            <li><b>Pause</b><span>P / ESC / pause button</span></li>
            <li><b>Restart stage</b><span>R on pause or game over</span></li>
            <li><b>Mute</b><span>M toggles all audio</span></li>
          </ul>
          <p class="note">Hit bumpers, light all the top lanes, drop target banks, ride orbits and ramps, then finish the stage goals before your balls run out. Each stage unlocks the next one. Your score for the global leaderboard is your whole-run total.</p>
          <div class="audio-row">
            <button class="btn btn-small js-music-toggle">${ICONS.music}<span>MUSIC ON</span></button>
            <button class="btn btn-small js-sfx-toggle">${ICONS.sfx}<span>SFX ON</span></button>
            <button class="btn btn-small js-motion">REDUCED MOTION: OFF</button>
          </div>
          <button class="btn btn-primary js-back">BACK</button>
        </div>
      </div>

      <div class="spb-screen spb-pause">
        <div class="panel">
          <h2 class="h-big">PAUSED</h2>
          <button class="btn btn-primary js-resume">${ICONS.play}<span>RESUME</span></button>
          <button class="btn btn-ghost js-restart">${ICONS.restart}<span>RESTART STAGE</span></button>
          <button class="btn btn-ghost js-quit">${ICONS.home}<span>STAGE SELECT</span></button>
          <div class="audio-row">
            <button class="btn btn-small js-music-toggle">${ICONS.music}<span>MUSIC ON</span></button>
            <button class="btn btn-small js-sfx-toggle">${ICONS.sfx}<span>SFX ON</span></button>
            <button class="btn btn-small js-motion">REDUCED MOTION: OFF</button>
          </div>
          <div class="note">P / ESC to resume · R to restart</div>
        </div>
      </div>

      <div class="spb-screen spb-complete">
        <div class="panel">
          <div class="kicker">STAGE CLEARED</div>
          <h2 class="h-big h-good js-complete-title">STAGE COMPLETE</h2>
          <div class="final-label">STAGE SCORE</div>
          <div class="final-score js-complete-score">0</div>
          <div class="complete-summary js-complete-summary"></div>
          <button class="btn btn-primary js-next">${ICONS.play}<span>NEXT STAGE</span></button>
          <button class="btn btn-ghost js-stage-retry">${ICONS.restart}<span>REPLAY STAGE</span></button>
          <button class="btn btn-ghost js-quit">${ICONS.grid}<span>STAGE SELECT</span></button>
        </div>
      </div>

      <div class="spb-screen spb-over">
        <div class="panel wide-panel">
          <h2 class="h-big h-danger js-final-label">GAME OVER</h2>
          <div class="final-label">RUN TOTAL</div>
          <div class="final-score js-final">0</div>
          <div class="new-best js-newbest">★ NEW LOCAL HIGH SCORE ★</div>
          <div class="name-row js-namerow">
            <label class="sr-only" for="spb-name">Player name</label>
            <input id="spb-name" class="name-input js-name" maxlength="12" placeholder="YOUR NAME" autocomplete="off" spellcheck="false" />
            <button class="btn btn-small js-save">SUBMIT TO GLOBAL</button>
          </div>
          <div class="submit-status js-submit-status" role="status"></div>
          <div class="boards">
            <div class="board">
              <div class="hs-title">LOCAL TOP 10</div>
              <ul class="hs-list js-local-table"></ul>
            </div>
            <div class="board">
              <div class="hs-title">GLOBAL TOP 10 <span class="chip">CLOUDFLARE D1</span></div>
              <div class="global-status js-global-status">Loading…</div>
              <ul class="hs-list js-global-table"></ul>
              <button class="btn btn-small btn-ghost js-retry">RETRY</button>
            </div>
          </div>
          <div class="over-actions">
            <button class="btn btn-primary js-again">${ICONS.restart}<span>PLAY AGAIN</span></button>
            <button class="btn btn-ghost js-quit">${ICONS.grid}<span>STAGE SELECT</span></button>
          </div>
        </div>
      </div>

      <div class="spb-screen spb-victory">
        <div class="panel">
          <div class="kicker">ALL 50 STAGES CLEARED</div>
          <h2 class="h-big h-good">YOU WIN!</h2>
          <div class="victory-copy">The galaxy is safe, Space Pilot. Supernova Finale is beaten!</div>
          <div class="final-label">FINAL RUN TOTAL</div>
          <div class="final-score js-victory-score">0</div>
          <div class="name-row js-victory-namerow">
            <label class="sr-only" for="spb-victory-name">Player name</label>
            <input id="spb-victory-name" class="name-input js-victory-name" maxlength="12" placeholder="YOUR NAME" autocomplete="off" spellcheck="false" />
            <button class="btn btn-small js-victory-save">SUBMIT TO GLOBAL</button>
          </div>
          <div class="submit-status js-victory-status" role="status"></div>
          <div class="hs-title">GLOBAL TOP 10</div>
          <ul class="hs-list js-victory-global"></ul>
          <button class="btn btn-small btn-ghost js-victory-retry">RETRY LEADERBOARD</button>
          <button class="btn btn-primary js-again">${ICONS.play}<span>PLAY AGAIN</span></button>
          <button class="btn btn-ghost js-quit">${ICONS.grid}<span>STAGE SELECT</span></button>
        </div>
      </div>

      <div class="spb-touch">
        <button class="touch-btn touch-flip js-touch-left" aria-label="Left flipper">◀</button>
        <div class="touch-mid">
          <button class="touch-btn touch-launch js-touch-launch" aria-label="Launch ball">LAUNCH</button>
          <button class="touch-btn touch-pause js-pause" aria-label="Pause">II</button>
        </div>
        <button class="touch-btn touch-flip js-touch-right" aria-label="Right flipper">▶</button>
      </div>
    `;
    container.appendChild(this.root);

    const q = <T extends HTMLElement>(selector: string): T => {
      const node = this.root.querySelector<T>(selector);
      if (!node) throw new Error(`UI element missing: ${selector}`);
      return node;
    };

    this.hud = q('.spb-hud');
    this.scoreEl = q('.hud-score');
    this.bestEl = q('.hud-best');
    this.ballsEl = q('.hud-balls');
    this.comboEl = q('.hud-combo');
    this.multEl = q('.hud-mult');
    this.stageEl = q('.hud-stage');
    this.objectiveEl = q('.hud-objectives');
    this.timerEl = q('.hud-timer');
    this.saveEl = q('.hud-save');
    this.toastEl = q('.spb-toast');
    this.hintEl = q('.spb-hint');
    this.musicBtn = q('.hud-buttons .js-music');
    this.sfxBtn = q('.hud-buttons .js-sfx');

    this.screens = {
      start: q('.spb-start'),
      stages: q('.spb-stages'),
      howto: q('.spb-howto'),
      pause: q('.spb-pause'),
      complete: q('.spb-complete'),
      over: q('.spb-over'),
      victory: q('.spb-victory'),
    };

    this.startTable = q('.js-start-table');
    this.stageGrid = q('.js-stage-grid');
    this.stageProgressLine = q('.stage-progress');

    this.finalLabelEl = q('.js-final-label');
    this.finalScoreEl = q('.js-final');
    this.newBestEl = q('.js-newbest');
    this.nameInput = q('.js-name');
    this.submitBtn = q('.js-save');
    this.submitStatus = q('.js-submit-status');
    this.localTable = q('.js-local-table');
    this.globalTable = q('.js-global-table');
    this.globalStatus = q('.js-global-status');
    this.retryBtn = q('.js-retry');

    this.completeTitle = q('.js-complete-title');
    this.completeScore = q('.js-complete-score');
    this.completeSummary = q('.js-complete-summary');
    this.completeNext = q('.js-next');
    this.victoryScore = q('.js-victory-score');
    this.victoryInput = q('.js-victory-name');
    this.victorySubmit = q('.js-victory-save');
    this.victoryStatus = q('.js-victory-status');
    this.victoryGlobal = q('.js-victory-global');


    this.bindEvents();
    this.setBalls(3);
    this.syncAudioButtons({ musicMuted: false, sfxMuted: false, reducedMotion: false, volume: 0.8 });
  }

  private bindEvents(): void {
    const on = (selector: string, handler: () => void): void => {
      for (const node of this.root.querySelectorAll<HTMLElement>(selector)) {
        node.addEventListener('click', (event) => {
          event.preventDefault();
          handler();
        });
      }
    };

    on('.js-play', this.cb.onPlay);
    on('.js-stages', this.cb.onStageSelect);
    on('.js-howto', this.cb.onHowTo);
    on('.js-back', this.cb.onMenu);
    on('.js-resume', this.cb.onResume);
    on('.js-restart', this.cb.onRestartStage);
    on('.js-stage-retry', this.cb.onRestartStage);
    on('.js-next', this.cb.onNextStage);
    on('.js-quit', this.cb.onStageSelect);
    on('.js-again', this.cb.onPlayAgain);
    on('.js-music-toggle', this.cb.onToggleMusic);
    on('.js-sfx-toggle', this.cb.onToggleSfx);
    on('.js-motion', this.cb.onToggleReducedMotion);
    on('.js-retry', this.cb.onRetryLeaderboard);
    on('.js-victory-retry', this.cb.onRetryLeaderboard);

    for (const btn of this.root.querySelectorAll<HTMLButtonElement>('.js-pause')) {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        this.cb.onPause();
      });
    }
    this.musicBtn.addEventListener('click', this.cb.onToggleMusic);
    this.sfxBtn.addEventListener('click', this.cb.onToggleSfx);

    q(this.root, '.js-reset').addEventListener('click', () => {
      const confirmed = window.confirm('Reset all stage progress and unlocked stages? Local high scores are kept.');
      if (confirmed) this.cb.onResetProgress();
    });

    const submit = (): void => {
      if (this.submitted) return;
      this.cb.onSubmitScore(this.nameInput.value);
    };
    this.submitBtn.addEventListener('click', submit);
    this.nameInput.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') submit();
    });

    const victorySubmit = (): void => {
      if (this.submitted) return;
      this.cb.onSubmitScore(this.victoryInput.value);
    };
    this.victorySubmit.addEventListener('click', victorySubmit);
    this.victoryInput.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') victorySubmit();
    });

    // Touch controls (pointer events cover mouse + touch + pen).
    const bindHold = (button: HTMLElement, onDown: () => void, onUp: () => void): void => {
      let active = false;
      const down = (event: PointerEvent): void => {
        event.preventDefault();
        if (active) return;
        active = true;
        button.classList.add('down');
        try {
          button.setPointerCapture(event.pointerId);
        } catch {
          /* pointer capture is best-effort */
        }
        onDown();
      };
      const up = (event: PointerEvent): void => {
        if (!active) return;
        active = false;
        event.preventDefault();
        button.classList.remove('down');
        onUp();
      };
      button.addEventListener('pointerdown', down);
      button.addEventListener('pointerup', up);
      button.addEventListener('pointercancel', up);
      button.addEventListener('lostpointercapture', up);
      button.addEventListener('contextmenu', (event) => event.preventDefault());
    };

    bindHold(
      this.root.querySelector<HTMLElement>('.js-touch-left') ?? this.root,
      () => this.cb.onFlipLeft(true),
      () => this.cb.onFlipLeft(false)
    );
    bindHold(
      this.root.querySelector<HTMLElement>('.js-touch-right') ?? this.root,
      () => this.cb.onFlipRight(true),
      () => this.cb.onFlipRight(false)
    );
    bindHold(
      this.root.querySelector<HTMLElement>('.js-touch-launch') ?? this.root,
      () => this.cb.onLaunchStart(),
      () => this.cb.onLaunchRelease()
    );
  }

  // ------------------------------------------------------------- screens

  private showScreen(name: ScreenName | null): void {
    for (const [key, screen] of Object.entries(this.screens)) {
      screen.classList.toggle('active', key === name);
    }
    this.active = name;
    this.root.classList.toggle('in-game', name === null);
    this.hud.classList.toggle('in-game', name === null);
  }

  get activeScreen(): ScreenName | null {
    return this.active;
  }

  showStart(data: {
    scores: HiScore[];
    best: number;
    progress: Progress;
    prefs: Prefs;
    continueStage: number;
  }): void {
    this.startTable.replaceChildren(...scoreRows(data.scores, -1, 'No scores yet — be the first Space Pilot!'));
    this.bestEl.textContent = `BEST ${fmt(data.best)}`;
    const playLabel = this.root.querySelector<HTMLElement>('.js-play span');
    if (playLabel) playLabel.textContent = data.continueStage > 1 ? `PLAY STAGE ${data.continueStage}` : 'PLAY';
    this.syncAudioButtons(data.prefs);
    this.setHint(null);
    this.showScreen('start');
  }

  showStageSelect(stages: StageConfig[], progress: Progress): void {
    this.stageProgressLine.textContent = `${progress.completed.length} / ${stages.length} stages cleared · highest unlocked: ${progress.unlocked}`;
    const buttons: HTMLButtonElement[] = [];
    for (const stage of stages) {
      const unlocked = stage.id <= progress.unlocked;
      const completed = progress.completed.includes(stage.id);
      const button = el('button', `stage-card${unlocked ? '' : ' locked'}${completed ? ' cleared' : ''}`);
      button.type = 'button';
      button.disabled = !unlocked;
      button.setAttribute(
        'aria-label',
        unlocked ? `Stage ${stage.id}: ${stage.name}${completed ? ' (cleared)' : ''}` : `Stage ${stage.id} locked`
      );
      const top = el('span', 'stage-card-top');
      top.append(el('span', 'stage-num', String(stage.id).padStart(2, '0')));
      if (stage.boss) top.append(el('span', 'stage-boss', 'BOSS'));
      if (completed) top.append(el('span', 'stage-check', '✓'));
      const name = el('span', 'stage-name', unlocked ? stage.name : 'Locked');
      const meta = el('span', 'stage-meta');
      if (!unlocked) {
        meta.innerHTML = ICONS.lock;
      } else {
        const best = progress.best[stage.id] ?? 0;
        meta.textContent = best > 0 ? `BEST ${fmt(best)}` : stage.tagline;
      }
      button.append(top, name, meta);
      if (unlocked) button.addEventListener('click', () => this.cb.onSelectStage(stage.id));
      buttons.push(button);
    }
    this.stageGrid.replaceChildren(...buttons);
    this.showScreen('stages');
  }

  showHowTo(): void {
    this.showScreen('howto');
  }

  enterGame(stage: StageConfig, balls: number, best: number, runScore: number): void {
    this.stageEl.textContent = `STAGE ${stage.id} · ${stage.name}${stage.boss ? ' · BOSS' : ''}`;
    this.bestEl.textContent = `BEST ${fmt(best)}`;
    this.setBalls(balls);
    this.setScore(runScore, true);
    this.setCombo(0);
    this.setMultiplier(1);
    this.setBallSave(false);
    this.setTimer(null);
    this.showScreen(null);
  }

  showPause(visible: boolean): void {
    this.showScreen(visible ? 'pause' : null);
  }

  showStageComplete(data: {
    stage: StageConfig;
    stageScore: number;
    runScore: number;
    nextStageId: number | null;
    summary: string;
  }): void {
    this.completeTitle.textContent = data.nextStageId ? `STAGE ${data.stage.id} COMPLETE` : 'FINAL STAGE COMPLETE';
    this.completeScore.textContent = fmt(data.stageScore);
    this.completeSummary.textContent = `${data.summary} · Run total ${fmt(data.runScore)}`;
    this.completeNext.classList.toggle('hidden', data.nextStageId === null);
    this.completeNext.querySelector('span')!.textContent = data.nextStageId ? `NEXT: STAGE ${data.nextStageId}` : 'FINISH';
    this.showScreen('complete');
  }

  showGameOver(data: {
    runScore: number;
    scores: HiScore[];
    qualifies: boolean;
    stageReached: number;
    prefs: Prefs;
    playerName: string;
  }): void {
    this.finalLabelEl.textContent = 'GAME OVER';
    this.finalScoreEl.textContent = fmt(data.runScore);
    this.newBestEl.classList.toggle('show', data.qualifies);
    this.localTable.replaceChildren(...scoreRows(data.scores, -1, 'No scores yet.'));
    this.resetSubmissionState(data.playerName);
    this.syncAudioButtons(data.prefs);
    this.showScreen('over');
    this.countUp(this.finalScoreEl, data.runScore);
  }

  showVictory(data: { runScore: number; playerName: string; prefs: Prefs }): void {
    this.victoryScore.textContent = fmt(data.runScore);
    this.victoryGlobal.replaceChildren();
    this.victoryStatus.textContent = '';
    this.victorySubmit.disabled = false;
    this.victoryInput.value = data.playerName;
    this.submitted = false;
    this.syncAudioButtons(data.prefs);
    this.showScreen('victory');
  }

  private resetSubmissionState(playerName: string): void {
    this.submitted = false;
    this.nameInput.value = playerName;
    this.nameInput.disabled = false;
    this.submitBtn.disabled = false;
    this.submitBtn.textContent = 'SUBMIT TO GLOBAL';
    this.submitStatus.textContent = '';
    this.submitStatus.className = 'submit-status js-submit-status';
  }

  /** Mark the submission as pending (prevents duplicate clicks). */
  setSubmitting(pending: boolean): void {
    if (pending) this.submitted = true;
    this.submitBtn.disabled = pending || this.submitted;
    this.victorySubmit.disabled = pending || this.submitted;
    if (pending) {
      this.submitStatus.textContent = 'Submitting score…';
      this.submitStatus.className = 'submit-status js-submit-status pending';
      this.victoryStatus.textContent = 'Submitting score…';
      this.victoryStatus.className = 'submit-status js-victory-status pending';
    }
  }

  setSubmitResult(ok: boolean, message: string): void {
    if (ok) {
      this.submitBtn.textContent = 'SUBMITTED';
      this.victorySubmit.textContent = 'SUBMITTED';
      this.submitStatus.textContent = message;
      this.submitStatus.className = 'submit-status js-submit-status ok';
      this.victoryStatus.textContent = message;
      this.victoryStatus.className = 'submit-status js-victory-status ok';
    } else {
      this.submitted = false;
      this.submitBtn.disabled = false;
      this.victorySubmit.disabled = false;
      this.submitStatus.textContent = message;
      this.submitStatus.className = 'submit-status js-submit-status error';
      this.victoryStatus.textContent = message;
      this.victoryStatus.className = 'submit-status js-victory-status error';
    }
  }

  setLocalScores(scores: HiScore[], highlight = -1): void {
    this.localTable.replaceChildren(...scoreRows(scores, highlight));
  }

  setGlobalStatus(text: string, options: { loading?: boolean; error?: boolean } = {}): void {
    this.globalStatus.textContent = text;
    this.globalStatus.className = `global-status js-global-status${options.loading ? ' loading' : ''}${
      options.error ? ' error' : ''
    }`;
    this.retryBtn.classList.toggle('show', options.error === true);
  }

  setGlobalScores(entries: LeaderboardEntry[]): void {
    this.globalTable.replaceChildren(...scoreRows(entries, -1, 'No global scores yet — be the first!'));
    this.victoryGlobal.replaceChildren(...scoreRows(entries, -1, 'No global scores yet.'));
  }

  // --------------------------------------------------------------- HUD

  setScore(score: number, silent = false): void {
    this.scoreEl.textContent = fmt(score);
    if (!silent && score > this.lastScore) {
      this.scoreEl.classList.remove('pop');
      void this.scoreEl.offsetWidth;
      this.scoreEl.classList.add('pop');
    }
    this.lastScore = score;
  }

  setBalls(left: number, total = 3): void {
    this.ballsEl.replaceChildren();
    const count = Math.max(1, Math.min(6, total));
    for (let i = 0; i < count; i++) {
      const pip = el('span', `ball-pip${i < left ? '' : ' spent'}`);
      this.ballsEl.appendChild(pip);
    }
    this.ballsEl.setAttribute('aria-label', `${left} balls remaining`);
  }

  setMultiplier(multiplier: number): void {
    this.multEl.textContent = `×${Math.max(1, Math.round(multiplier))}`;
  }

  setObjectives(goals: GoalProgress[]): void {
    const items = goals.map((goal) => {
      const row = el('div', `hud-goal${goal.done ? ' done' : ''}`);
      const label = el('span', 'hud-goal-label', goal.label);
      const value = el(
        'span',
        'hud-goal-value',
        goal.isScore ? fmt(goal.current) : `${Math.min(goal.current, goal.target)}/${goal.target}`
      );
      row.append(label, value);
      return row;
    });
    this.objectiveEl.replaceChildren(...items);
  }

  setCombo(combo: number): void {
    if (combo >= 2) {
      this.comboEl.textContent = `COMBO ×${combo}`;
      this.comboEl.classList.add('show');
      this.comboEl.classList.remove('pop');
      void this.comboEl.offsetWidth;
      this.comboEl.classList.add('pop');
    } else {
      this.comboEl.classList.remove('show');
    }
  }

  setBallSave(active: boolean): void {
    this.saveEl.classList.toggle('show', active);
  }

  setTimer(secondsLeft: number | null): void {
    if (secondsLeft === null) {
      this.timerEl.textContent = '';
      this.timerEl.classList.remove('show', 'urgent');
      return;
    }
    const whole = Math.max(0, Math.ceil(secondsLeft));
    this.timerEl.textContent = `${whole}s`;
    this.timerEl.classList.add('show');
    this.timerEl.classList.toggle('urgent', whole <= 10);
  }

  toast(text: string, ms = 1500): void {
    window.clearTimeout(this.toastTimer);
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  setHint(text: string | null): void {
    if (text) {
      this.hintEl.textContent = text;
      this.hintEl.classList.add('show');
    } else {
      this.hintEl.classList.remove('show');
    }
  }

  syncAudioButtons(prefs: Prefs): void {
    for (const btn of this.root.querySelectorAll<HTMLElement>('.js-music-toggle, .hud-buttons .js-music')) {
      btn.classList.toggle('muted', prefs.musicMuted);
      const label = btn.querySelector('span');
      if (label) label.textContent = prefs.musicMuted ? 'MUSIC OFF' : 'MUSIC ON';
      btn.setAttribute('aria-pressed', String(!prefs.musicMuted));
    }
    for (const btn of this.root.querySelectorAll<HTMLElement>('.js-sfx-toggle, .hud-buttons .js-sfx')) {
      btn.classList.toggle('muted', prefs.sfxMuted);
      const label = btn.querySelector('span');
      if (label) label.textContent = prefs.sfxMuted ? 'SFX OFF' : 'SFX ON';
      btn.setAttribute('aria-pressed', String(!prefs.sfxMuted));
    }
    for (const btn of this.root.querySelectorAll<HTMLElement>('.js-motion')) {
      btn.textContent = `REDUCED MOTION: ${prefs.reducedMotion ? 'ON' : 'OFF'}`;
      btn.setAttribute('aria-pressed', String(prefs.reducedMotion));
    }
  }

  private countUp(target: HTMLDivElement, value: number): void {
    cancelAnimationFrame(this.countRaf);
    const start = performance.now();
    const duration = Math.min(1200, 300 + Math.min(value, 500000) * 0.02);
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      target.textContent = fmt(Math.round(value * eased));
      if (t < 1) this.countRaf = requestAnimationFrame(tick);
    };
    this.countRaf = requestAnimationFrame(tick);
  }

  destroy(): void {
    cancelAnimationFrame(this.countRaf);
    window.clearTimeout(this.toastTimer);
    this.root.remove();
  }
}

/** Small helper so `q` works with a root element. */
function q<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`UI element missing: ${selector}`);
  return node;
}
