import Matter from 'matter-js';
import {
  BALL_SAVE_MIN_MS,
  CHARGE_TIME_MS,
  LAUNCH_MAX,
  LAUNCH_MIN,
  MAX_BALL_SPEED,
  MAX_SCORE,
  SCORE,
  SPAWN,
  STEP_MS,
  VIEW_W,
} from './constants';
import { Particles } from './particles';
import { Renderer, type BallView, type RenderState } from './renderer';
import { ScoreManager } from './scoring';
import { SoundManager, type SfxName } from '../audio/sound';
import {
  buildStage,
  clampBallSpeed,
  makeBall,
  updateMovers,
  type BuiltStage,
} from '../physics/stageBuilder';
import { Flipper } from '../physics/flippers';
import { ScreenManager, type GoalProgress } from '../ui/screens';
import { getStage, isFinalStage, STAGES } from './stages/library';
import type { Goal, StageConfig } from './stages/types';
import { sanitizeName, validateName } from '../shared/leaderboard';
import * as store from './storage';
import { describeApiFailure, fetchTopScores, submitScore } from './api';
import { clamp } from './util';

const { Body, Composite, Engine, Events, Vector } = Matter;

export type GameState =
  | 'menu'
  | 'stageSelect'
  | 'howTo'
  | 'credits'
  | 'playing'
  | 'paused'
  | 'stageComplete'
  | 'gameOver'
  | 'victory';

interface LiveBall {
  body: Matter.Body;
  trail: { x: number; y: number }[];
  launchedAt: number;
  saveUntil: number;
}

interface StageCounters {
  bumpers: number;
  targets: number;
  banks: number;
  orbits: number;
  ramps: number;
  laneSets: number;
  spinner: number;
  jackpots: number;
  locks: number;
}

interface BankReset {
  bank: string;
  at: number;
}

const NEVER = -9999;
const COLLISION_MASK_ALL = 0xffffffff;

function emptyCounters(): StageCounters {
  return { bumpers: 0, targets: 0, banks: 0, orbits: 0, ramps: 0, laneSets: 0, spinner: 0, jackpots: 0, locks: 0 };
}

export class Game {
  private renderer: Renderer;
  private sound = new SoundManager();
  private particles = new Particles();
  private ui: ScreenManager;
  private engine: Matter.Engine;
  private score = new ScoreManager();

  private built: BuiltStage | null = null;
  /** Static stage rendered behind the menus (never simulated). */
  private displayStage: BuiltStage;
  private stage: StageConfig | null = null;
  private flipL: Flipper | null = null;
  private flipR: Flipper | null = null;

  private readyBall: Matter.Body | null = null;
  private liveBalls: LiveBall[] = [];
  private charging = false;
  private chargeStart = 0;
  private charge = 0;

  private state: GameState = 'menu';
  private counters: StageCounters = emptyCounters();
  private ballsLeft = 3;
  private ballsTotal = 3;
  private respawnT = 0;
  private stageTimeLeft: number | null = null;
  private timeSec = 0;
  private animTime = 0;

  private bumperFlash: number[] = [];
  private bumperCd = new Map<string, number>();
  private targetFlash: number[] = [];
  private targetDown: boolean[] = [];
  private laneLit: boolean[] = [];
  private slingFlash: number[] = [];
  private zoneFlash: number[] = [];
  private zoneCd = new Map<string, number>();
  private bankResets: BankReset[] = [];
  private locks = 0;
  private jackpotReady = true;
  private jackpotCooldown = 0;
  private spinnerAngle = 0;
  private spinnerSpin = 0;
  private drainFlash = NEVER;
  private ballSaveUntil = 0;

  private shakeE = 0;
  private shakeX = 0;
  private shakeY = 0;
  private lastComboShown = 0;
  private hudCache = { goals: '', multiplier: -1, save: false, hint: '', timer: '' };

  private prefs = store.loadPrefs();
  private progress = store.loadProgress();
  private playerName = store.loadPlayerName();

  private leftSources = new Set<string>();
  private rightSources = new Set<string>();
  private extraBallGranted = false;
  private submitPending = false;
  private runEnded = false;
  private destroyed = false;

  private last = 0;
  private acc = 0;
  private raf = 0;

  constructor(container: HTMLElement) {
    const canvas = document.createElement('canvas');
    canvas.className = 'spb-canvas';
    canvas.setAttribute('aria-label', 'Pinball playfield');
    canvas.setAttribute('role', 'img');
    container.appendChild(canvas);
    this.renderer = new Renderer(canvas);

    this.displayStage = buildStage(STAGES[0]);

    this.engine = Engine.create();
    this.engine.gravity.y = 0.82;
    this.engine.positionIterations = 10;
    this.engine.velocityIterations = 8;

    Events.on(this.engine, 'collisionStart', (event) => this.onCollisions(event.pairs));

    this.ui = new ScreenManager(container, {
      onPlay: () => this.handlePlay(),
      onStageSelect: () => this.toStageSelect(),
      onHowTo: () => this.toHowTo(),
      onCredits: () => this.toCredits(),
      onMenu: () => this.toMenu(),
      onSelectStage: (id) => this.startRun(id),
      onResetProgress: () => {
        this.progress = store.resetProgress();
        this.ui.showStageSelect(STAGES, this.progress);
        this.ui.toast('PROGRESS RESET');
      },
      onResume: () => this.togglePause(),
      onRestartStage: () => this.restartStage(),
      onNextStage: () => this.nextStage(),
      onPlayAgain: () => this.startRun(1),
      onPause: () => this.togglePause(),
      onToggleMusic: () => this.toggleMusic(),
      onToggleSfx: () => this.toggleSfx(),
      onToggleReducedMotion: () => this.toggleReducedMotion(),
      onSubmitScore: (name) => void this.handleSubmit(name),
      onRetryLeaderboard: () => void this.loadGlobalScores(),
      onFlipLeft: (pressed) => this.pressFlipper('left', pressed, 'touch'),
      onFlipRight: (pressed) => this.pressFlipper('right', pressed, 'touch'),
      onLaunchStart: () => this.startCharge(),
      onLaunchRelease: () => this.releaseCharge(),
    });

    this.sound.applySettings(this.prefs);
    this.ui.syncAudioButtons(this.prefs);
    this.showMenu();

    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp, { passive: false });
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    canvas.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    canvas.addEventListener('pointerup', this.onPointerUp, { passive: false });
    canvas.addEventListener('pointercancel', this.onPointerUp, { passive: false });
    canvas.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
    container.addEventListener('contextmenu', (event) => event.preventDefault());

    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.renderer.canvas.remove();
    this.ui.destroy();
    this.sound.stopMusic();
    this.cleanupStage();
    Engine.clear(this.engine);
  }

  // --------------------------------------------------------------- menus

  private showMenu(): void {
    this.state = 'menu';
    this.sound.duckMusic(false);
    this.ui.showStart({
      scores: store.loadHiScores(),
      best: store.bestScore(),
      progress: this.progress,
      prefs: this.prefs,
      continueStage: this.progress.unlocked,
    });
  }

  private toMenu(): void {
    this.cleanupStage();
    this.showMenu();
  }

  private toStageSelect(): void {
    this.state = 'stageSelect';
    this.sound.play('click');
    this.progress = store.loadProgress();
    this.ui.showStageSelect(STAGES, this.progress);
  }

  private toHowTo(): void {
    this.state = 'howTo';
    this.sound.play('click');
    this.ui.showHowTo();
  }

  private toCredits(): void {
    // Credits are a menu-only screen; never interrupt an active stage.
    if (this.state !== 'menu' && this.state !== 'howTo') return;
    this.state = 'credits';
    this.sound.play('click');
    this.ui.showCredits(this.prefs);
  }

  private handlePlay(): void {
    this.sound.init();
    this.sound.play('click');
    this.startRun(this.progress.unlocked);
  }

  /** Begin a fresh run at the given stage (run score resets). */
  startRun(stageId: number): void {
    this.sound.init();
    this.progress = store.loadProgress();
    this.score.resetRun();
    this.runEnded = false;
    this.submitPending = false;
    this.loadStage(stageId);
  }

  private restartStage(): void {
    if (!this.stage) return;
    // Keep points earned in previous stages but discard the current attempt.
    this.score.runScore = clamp(this.score.runScore - this.score.stageScore, 0, MAX_SCORE);
    this.score.resetStage();
    this.runEnded = false;
    this.submitPending = false;
    this.loadStage(this.stage.id);
  }

  private nextStage(): void {
    if (!this.stage || this.state !== 'stageComplete') return;
    const next = this.stage.id + 1;
    if (next > STAGES.length) return;
    this.loadStage(next);
  }

  private togglePause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.cancelCharge();
      this.releaseAllInputs();
      this.ui.showPause(true);
      this.ui.setHint(null);
      this.sound.duckMusic(true);
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.ui.showPause(false);
      this.refreshHint();
      this.sound.duckMusic(false);
      this.last = performance.now();
      this.acc = 0;
    }
  }

  private toggleMusic(): void {
    this.prefs = { ...this.prefs, musicMuted: !this.prefs.musicMuted };
    store.savePrefs(this.prefs);
    this.sound.setMusicMuted(this.prefs.musicMuted);
    this.ui.syncAudioButtons(this.prefs);
  }

  private toggleSfx(): void {
    this.prefs = { ...this.prefs, sfxMuted: !this.prefs.sfxMuted };
    store.savePrefs(this.prefs);
    this.sound.setSfxMuted(this.prefs.sfxMuted);
    this.ui.syncAudioButtons(this.prefs);
    if (!this.prefs.sfxMuted) this.sound.play('click');
  }

  private toggleReducedMotion(): void {
    this.prefs = { ...this.prefs, reducedMotion: !this.prefs.reducedMotion };
    store.savePrefs(this.prefs);
    this.ui.syncAudioButtons(this.prefs);
  }

  private toggleAllAudio(): void {
    const muted = !(this.prefs.musicMuted && this.prefs.sfxMuted);
    this.prefs = { ...this.prefs, musicMuted: muted, sfxMuted: muted };
    store.savePrefs(this.prefs);
    this.sound.setMusicMuted(muted);
    this.sound.setSfxMuted(muted);
    this.ui.syncAudioButtons(this.prefs);
  }

  // --------------------------------------------------------- stage cycle

  private loadStage(stageId: number): void {
    const id = clamp(Math.round(stageId), 1, STAGES.length);
    this.cleanupStage();

    const stage = getStage(id);
    const built = buildStage(stage);
    this.stage = stage;
    this.built = built;
    this.flipL = built.flippers.left;
    this.flipR = built.flippers.right;

    for (const body of built.bodies) {
      Composite.add(this.engine.world, body);
    }
    this.engine.gravity.y = stage.gravity;

    this.score.configureStage(stage.baseMultiplier, stage.maxMultiplier);
    this.score.resetStage();

    this.counters = emptyCounters();
    this.ballsLeft = stage.balls;
    this.ballsTotal = stage.balls;
    this.stageTimeLeft = stage.timeLimitSec ?? null;
    this.timeSec = 0;
    this.respawnT = 0;
    this.drainFlash = NEVER;
    this.shakeE = 0;
    this.charge = 0;
    this.locks = 0;
    this.jackpotReady = true;
    this.jackpotCooldown = 0;
    this.bumperCd.clear();
    this.zoneCd.clear();
    this.bankResets = [];
    this.leftSources.clear();
    this.rightSources.clear();
    this.lastComboShown = 0;
    this.extraBallGranted = false;

    this.bumperFlash = built.bumpers.map(() => NEVER);
    this.targetFlash = built.targets.map(() => NEVER);
    this.targetDown = built.targets.map(() => false);
    this.laneLit = built.lanes.map(() => false);
    this.slingFlash = built.slings.map(() => NEVER);
    this.zoneFlash = built.zones.map(() => NEVER);

    this.particles.clear();
    this.spawnReadyBall();

    this.state = 'playing';
    this.sound.play('click');
    this.hudCache = { goals: '', multiplier: -1, save: false, hint: '', timer: '' };
    this.ui.enterGame(stage, this.ballsLeft, store.bestScore(), this.score.runScore);
    this.ui.setObjectives(this.goalProgress());
    this.ui.setMultiplier(this.score.multiplier);
    this.ui.setBallSave(false);
    this.ui.setTimer(this.stageTimeLeft);
    this.ui.toast(stage.boss ? `BOSS STAGE ${stage.id} · ${stage.name}` : `STAGE ${stage.id} · ${stage.name}`, 2200);
    this.refreshHint();
    this.sound.startMusic();
    this.sound.duckMusic(false);
  }

  /** Remove every body, timer, effect and array belonging to the old stage. */
  private cleanupStage(): void {
    Composite.clear(this.engine.world, false, true);
    this.built = null;
    this.stage = null;
    this.flipL = null;
    this.flipR = null;
    this.readyBall = null;
    this.liveBalls = [];
    this.charging = false;
    this.charge = 0;
    this.particles.clear();
    this.bankResets = [];
    this.bumperCd.clear();
    this.zoneCd.clear();
    this.laneLit = [];
    this.targetDown = [];
    this.bumperFlash = [];
    this.targetFlash = [];
    this.slingFlash = [];
    this.zoneFlash = [];
    this.stageTimeLeft = null;
    this.respawnT = 0;
    this.leftSources.clear();
    this.rightSources.clear();
  }

  private spawnReadyBall(): void {
    if (!this.built) return;
    if (this.readyBall) return;
    const ball = makeBall(SPAWN.x, SPAWN.y);
    Body.setVelocity(ball, { x: 0, y: 0 });
    Composite.add(this.engine.world, ball);
    this.readyBall = ball;
    this.ballSaveUntil = 0;
    this.refreshHint();
  }

  private spawnLiveBall(x: number, y: number, vx: number, vy: number): void {
    if (!this.built || !this.stage) return;
    const ball = makeBall(x, y);
    Body.setVelocity(ball, { x: vx, y: vy });
    Composite.add(this.engine.world, ball);
    const now = performance.now();
    this.liveBalls.push({
      body: ball,
      trail: [],
      launchedAt: now,
      saveUntil: now + Math.max(BALL_SAVE_MIN_MS, this.stage.ballSaveMs),
    });
  }

  // -------------------------------------------------------------- launch

  private startCharge(): void {
    if (this.state !== 'playing' || !this.readyBall) return;
    if (this.charging) return;
    this.sound.init();
    this.charging = true;
    this.chargeStart = performance.now();
    this.charge = 0;
    this.ui.setHint('Release to BLAST OFF!');
  }

  private cancelCharge(): void {
    this.charging = false;
    this.charge = 0;
  }

  private releaseCharge(): void {
    if (this.state !== 'playing') {
      this.cancelCharge();
      return;
    }
    if (!this.charging || !this.readyBall || !this.built) {
      this.cancelCharge();
      return;
    }
    const power = clamp(this.charge, 0.08, 1);
    const ball = this.readyBall;
    this.readyBall = null;
    this.charging = false;

    Body.setPosition(ball, { x: SPAWN.x, y: SPAWN.y });
    Body.setVelocity(ball, { x: 0, y: -(LAUNCH_MIN + power * (LAUNCH_MAX - LAUNCH_MIN)) });
    const now = performance.now();
    const stage = this.stage;
    this.liveBalls.push({
      body: ball,
      trail: [],
      launchedAt: now,
      saveUntil: now + (stage ? Math.max(BALL_SAVE_MIN_MS, stage.ballSaveMs) : 3000),
    });
    this.ballSaveUntil = now + (stage ? Math.max(BALL_SAVE_MIN_MS, stage.ballSaveMs) : 3000);
    this.charge = 0;
    this.sound.play('launch', power);
    this.particles.burst(SPAWN.x, 930, '#ffd257', 10 + Math.round(power * 12), 5 + power * 5, 'line');
    this.shake(1.5 + power * 2.5);
    this.ui.setHint(null);
  }

  private refreshHint(): void {
    if (this.state !== 'playing') {
      this.ui.setHint(null);
    } else if (this.readyBall && !this.charging) {
      this.ui.setHint('HOLD SPACE or the LAUNCH button, then release');
    } else if (this.charging) {
      this.ui.setHint('Release to BLAST OFF!');
    } else {
      this.ui.setHint(null);
    }
  }

  // --------------------------------------------------------------- input

  private pressFlipper(side: 'left' | 'right', pressed: boolean, source: string): void {
    if (pressed && this.state !== 'playing') return;
    const set = side === 'left' ? this.leftSources : this.rightSources;
    const flipper = side === 'left' ? this.flipL : this.flipR;
    if (!flipper) return;

    if (pressed) {
      const wasEmpty = set.size === 0;
      set.add(source);
      flipper.setPressed(true);
      if (wasEmpty) {
        this.sound.init();
        this.sound.play('flipper');
      }
    } else {
      set.delete(source);
      if (set.size === 0) flipper.setPressed(false);
    }
  }

  private releaseAllInputs(): void {
    this.leftSources.clear();
    this.rightSources.clear();
    this.flipL?.setPressed(false);
    this.flipR?.setPressed(false);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const isGameKey = [
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Space',
      'KeyA',
      'KeyD',
      'KeyP',
      'KeyM',
      'KeyR',
      'Escape',
    ].includes(event.code);
    if (isGameKey && !(event.target instanceof HTMLInputElement)) event.preventDefault();
    if (event.repeat && event.code !== 'Space' && event.code !== 'ArrowDown') return;
    if (event.target instanceof HTMLInputElement) return;

    this.sound.init();

    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        if (!event.repeat) this.pressFlipper('left', true, 'kbd');
        break;
      case 'ArrowRight':
      case 'KeyD':
        if (!event.repeat) this.pressFlipper('right', true, 'kbd');
        break;
      case 'Space':
      case 'ArrowDown':
        if (event.repeat) break;
        if (this.state === 'playing') this.startCharge();
        else if (this.state === 'menu') this.handlePlay();
        break;
      case 'KeyP':
      case 'Escape':
        if (this.state === 'playing' || this.state === 'paused') this.togglePause();
        else if (this.state === 'credits') this.toMenu();
        break;
      case 'KeyM':
        this.toggleAllAudio();
        break;
      case 'KeyR':
        if (this.state === 'paused' || this.state === 'gameOver') this.restartStage();
        break;
      case 'Enter':
        if (this.state === 'menu') this.handlePlay();
        else if (this.state === 'credits') this.toMenu();
        else if (this.state === 'stageComplete') this.nextStage();
        else if (this.state === 'victory') this.startRun(1);
        else if (this.state === 'gameOver') this.startRun(1);
        break;
      default:
        break;
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.pressFlipper('left', false, 'kbd');
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.pressFlipper('right', false, 'kbd');
        break;
      case 'Space':
      case 'ArrowDown':
        this.releaseCharge();
        break;
      default:
        break;
    }
  };

  private onBlur = (): void => {
    this.releaseAllInputs();
    this.cancelCharge();
    this.refreshHint();
  };

  private onVisibility = (): void => {
    if (document.hidden) {
      this.releaseAllInputs();
      this.cancelCharge();
      if (this.state === 'playing') this.togglePause();
      this.sound.suspend();
    } else {
      this.sound.resume();
      this.last = performance.now();
      this.acc = 0;
    }
  };

  private onResize = (): void => {
    this.renderer.resize();
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (this.state !== 'playing') return;
    event.preventDefault();
    this.sound.init();
    const p = this.renderer.toVirtual(event.clientX, event.clientY);
    if (p.x < 0 || p.x > VIEW_W || p.y < 0 || p.y > 960) return;
    this.pressFlipper(p.x < VIEW_W / 2 ? 'left' : 'right', true, `ptr${event.pointerId}`);
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.pressFlipper('left', false, `ptr${event.pointerId}`);
    this.pressFlipper('right', false, `ptr${event.pointerId}`);
  };

  // --------------------------------------------------------------- loop

  private loop = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = now - this.last;
    this.last = now;
    if (dt > 100) dt = 100;
    if (dt < 0) dt = 0;

    if (this.state === 'playing') {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP_MS && steps < 3) {
        this.fixedUpdate(STEP_MS);
        this.acc -= STEP_MS;
        steps++;
      }
      if (steps === 3) this.acc = 0;
    }

    if (this.charging) {
      const ramp = clamp((now - this.chargeStart) / CHARGE_TIME_MS, 0, 1);
      this.charge = Math.max(this.charge, ramp);
    }

    this.animTime += Math.min(dt, 50) / 1000;
    if (this.state !== 'paused') this.particles.update(Math.min(dt, 50) / 1000);
    this.updateShake(dt);

    this.renderer.draw(this.view());
  };

  private updateShake(dt: number): void {
    this.shakeE *= Math.exp(-dt / 130);
    if (this.prefs.reducedMotion) {
      this.shakeX = 0;
      this.shakeY = 0;
      return;
    }
    this.shakeX = (Math.random() * 2 - 1) * this.shakeE;
    this.shakeY = (Math.random() * 2 - 1) * this.shakeE;
  }

  private shake(amount: number): void {
    this.shakeE = Math.min(16, this.shakeE + amount);
  }

  private fixedUpdate(dtMs: number): void {
    const dt = dtMs / 1000;
    if (!this.built) return;

    this.timeSec += dt;
    this.flipL?.update(dtMs);
    this.flipR?.update(dtMs);
    updateMovers(this.built.movers, this.timeSec);
    this.spinnerAngle += 0.035 + this.spinnerSpin;
    this.spinnerSpin *= 0.9;

    // Keep the ball glued to the plunger while charging.
    if (this.readyBall && this.charging) {
      Body.setPosition(this.readyBall, { x: SPAWN.x, y: SPAWN.y + this.charge * 2 });
      Body.setVelocity(this.readyBall, { x: 0, y: 0 });
    }

    Engine.update(this.engine, dtMs);

    const comboExpired = this.score.update(dtMs);
    if (comboExpired) this.ui.setCombo(0);
    if (this.score.combo !== this.lastComboShown) {
      this.lastComboShown = this.score.combo;
      this.ui.setCombo(this.score.combo);
    }

    this.guardBalls(dt);
    this.updateBankResets();
    this.updateJackpot(dt);
    this.updateCountdowns(dt);

    if (this.pendingGoals()) {
      this.completeStage();
      return;
    }

    // Mid-stage reward: clear two goals to earn an extra ball.
    if (!this.extraBallGranted && this.stage) {
      const cleared = this.stage.goals.filter((goal) => this.goalDone(goal)).length;
      if (cleared >= 2) {
        this.extraBallGranted = true;
        this.ballsLeft += 1;
        this.ballsTotal += 1;
        this.ui.setBalls(this.ballsLeft, this.ballsTotal);
        this.ui.toast('EXTRA BALL!', 1400);
        this.sound.play('extra');
        this.particles.popup(270, 720, 'EXTRA BALL!', '#39ffb2', 28);
      }
    }

    this.refreshHud();
    if (this.stageTimeLeft !== null && this.stageTimeLeft <= 0) {
      this.ui.toast("TIME'S UP!");
      this.endRun('gameOver');
    }
  }

  /**
   * Update the HUD at ~10 Hz and only when something actually changed, so the
   * DOM is not rebuilt 60 times per second.
   */
  private refreshHud(): void {
    const goalProgress = this.goalProgress();
    const goalSignature = goalProgress.map((goal) => `${goal.current}/${goal.target}`).join('|');
    if (goalSignature !== this.hudCache.goals) {
      this.hudCache.goals = goalSignature;
      this.ui.setObjectives(goalProgress);
    }

    const multiplier = this.score.multiplier;
    if (multiplier !== this.hudCache.multiplier) {
      this.hudCache.multiplier = multiplier;
      this.ui.setMultiplier(multiplier);
    }

    const saveActive = this.liveBalls.some((ball) => performance.now() < ball.saveUntil);
    if (saveActive !== this.hudCache.save) {
      this.hudCache.save = saveActive;
      this.ui.setBallSave(saveActive);
    }

    if (this.stageTimeLeft !== null) {
      const timerLabel = String(Math.max(0, Math.ceil(this.stageTimeLeft)));
      if (timerLabel !== this.hudCache.timer) {
        this.hudCache.timer = timerLabel;
        this.ui.setTimer(this.stageTimeLeft);
      }
    }

    const hint = this.readyBall ? (this.charging ? 'release' : 'ready') : '';
    if (hint !== this.hudCache.hint) {
      this.hudCache.hint = hint;
      this.refreshHint();
    }
  }

  /** Completion is only evaluated after Engine.update — never inside a collision callback. */
  private pendingGoals(): boolean {
    if (!this.stage || this.state !== 'playing') return false;
    return this.stage.goals.every((goal) => this.goalDone(goal));
  }

  private updateCountdowns(dt: number): void {
    if (this.stageTimeLeft !== null) this.stageTimeLeft = Math.max(0, this.stageTimeLeft - dt);
    if (this.respawnT > 0) {
      this.respawnT -= dt;
      if (this.respawnT <= 0 && this.state === 'playing') {
        this.spawnReadyBall();
        this.ui.toast(`BALL ${this.ballsTotal - this.ballsLeft + 1} READY!`);
        this.refreshHint();
      }
    }
  }

  private updateBankResets(): void {
    if (!this.built || this.bankResets.length === 0) return;
    const due = this.bankResets.filter((reset) => this.timeSec >= reset.at);
    if (due.length === 0) return;
    this.bankResets = this.bankResets.filter((reset) => this.timeSec < reset.at);
    for (const reset of due) {
      for (const target of this.built.targets) {
        if (target.spec.bank !== reset.bank) continue;
        this.targetDown[target.index] = false;
        target.body.collisionFilter.mask = COLLISION_MASK_ALL;
      }
    }
  }

  private updateJackpot(dt: number): void {
    if (this.jackpotCooldown > 0) {
      this.jackpotCooldown = Math.max(0, this.jackpotCooldown - dt);
      if (this.jackpotCooldown === 0) {
        this.jackpotReady = true;
        this.ui.toast('JACKPOT LIT!', 900);
      }
    }
  }

  private guardBalls(dt: number): void {
    const now = performance.now();
    for (const ball of [...this.liveBalls]) {
      const body = ball.body;
      const pos = body.position;
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
        this.removeBall(ball);
        continue;
      }
      clampBallSpeed(body, MAX_BALL_SPEED);

      // ball that dribbles back into the launch lane can be launched again
      const speed = Vector.magnitude(body.velocity);
      if (pos.x > 496 && pos.y > 828 && speed < 3) {
        if (!this.readyBall) {
          this.removeBall(ball);
          Body.setPosition(body, { x: SPAWN.x, y: SPAWN.y });
          Body.setVelocity(body, { x: 0, y: 0 });
          Composite.add(this.engine.world, body);
          this.readyBall = body;
          this.ui.toast('RE-LAUNCH!');
        } else {
          this.removeBall(ball);
        }
        continue;
      }

      // anti-stuck nudge (cradled balls on the flippers are legitimate)
      if (speed < 0.3 && pos.y < 780) {
        if (now - ball.launchedAt > 2400) {
          Body.setVelocity(body, { x: (Math.random() - 0.5) * 4, y: -6 });
          ball.launchedAt = now;
        }
      }

      if (pos.y > 1030 || pos.y < -80 || pos.x < -80 || pos.x > 620) {
        this.drainBall(ball);
        continue;
      }

      if (this.built && this.built.drain) {
        const drain = this.built.drain.bounds;
        if (pos.y > drain.min.y - 2 && pos.x > 40 && pos.x < 500) {
          this.drainBall(ball);
        }
      }
    }
    void dt;
  }

  private removeBall(ball: LiveBall): void {
    Composite.remove(this.engine.world, ball.body);
    this.liveBalls = this.liveBalls.filter((entry) => entry !== ball);
  }

  private drainBall(ball: LiveBall): void {
    if (this.state !== 'playing') return;
    const pos = { ...ball.body.position };
    const now = performance.now();
    this.drainFlash = this.timeSec;
    this.removeBall(ball);

    if (now < ball.saveUntil) {
      this.sound.play('save');
      this.ui.toast('BALL SAVED!');
      this.particles.popup(270, 640, 'BALL SAVED!', '#39ffb2', 28);
      this.particles.burst(pos.x, Math.min(pos.y, 900), '#39ffb2', 18, 7, 'star');
      this.shake(3);
      this.spawnReadyBall();
      return;
    }

    this.sound.play('drain');
    this.particles.burst(pos.x, Math.min(pos.y, 900), '#ff5a7a', 20, 8, 'line');
    this.shake(6);
    this.score.combo = 0;
    this.ui.setCombo(0);

    if (this.liveBalls.length > 0) {
      // multiball: losing one ball does not cost a life
      return;
    }

    this.ballsLeft = Math.max(0, this.ballsLeft - 1);
    this.ui.setBalls(this.ballsLeft, this.ballsTotal);

    if (this.ballsLeft <= 0) {
      this.ui.toast('GAME OVER');
      this.endRun('gameOver');
    } else {
      this.ui.toast('BALL LOST');
      this.respawnT = 1;
    }
  }

  // ------------------------------------------------------------ scoring

  private allow(key: string, cooldownSec: number): boolean {
    const last = this.bumperCd.get(key) ?? NEVER;
    if (this.timeSec - last < cooldownSec) return false;
    this.bumperCd.set(key, this.timeSec);
    return true;
  }

  private awardAt(base: number, x: number, y: number, color: string, sound?: SfxName): number {
    const result = this.score.award({ base });
    if (result.points > 0) {
      this.ui.setScore(this.score.runScore);
      this.ui.setMultiplier(this.score.multiplier);
      this.particles.popup(x, y, `+${result.points}`, color, result.points >= 5000 ? 30 : result.points >= 1000 ? 25 : 20);
      this.particles.burst(x, y, color, result.points >= 2000 ? 10 : 5, 5, 'dot');
    }
    if (sound) this.sound.play(sound, Math.min(1, result.points / 4000));
    return result.points;
  }

  private extendCombo(): void {
    const combo = this.score.extendCombo();
    if (combo === 3 || combo === 5 || combo === 8) {
      this.ui.toast(`COMBO ×${combo}!`);
      this.awardAt(SCORE.comboBonus * combo, 270, 520, '#ffd257');
      this.particles.popup(270, 480, `COMBO ×${combo}`, '#ffd257', 26);
    }
  }

  // ---------------------------------------------------------- collisions

  private onCollisions(pairs: Matter.Pair[]): void {
    if (this.state !== 'playing' || !this.built) return;
    for (const pair of pairs) {
      const { bodyA, bodyB } = pair;
      let ballBody: Matter.Body | null = null;
      let other: Matter.Body | null = null;
      if (bodyA.label === 'ball') {
        ballBody = bodyA;
        other = bodyB;
      } else if (bodyB.label === 'ball') {
        ballBody = bodyB;
        other = bodyA;
      }
      if (!ballBody || !other) continue;
      if (!this.liveBalls.some((ball) => ball.body === ballBody)) continue;
      this.handleHit(ballBody, other);
    }
  }

  private handleHit(ball: Matter.Body, other: Matter.Body): void {
    if (!this.built || !this.stage) return;
    const label = other.label;

    if (label.startsWith('bumper:')) {
      this.hitBumper(Number(label.slice(7)), ball);
      return;
    }
    if (label.startsWith('target:')) {
      this.hitTarget(Number(label.slice(7)), ball);
      return;
    }
    if (label.startsWith('lane:')) {
      this.hitLane(Number(label.slice(5)));
      return;
    }
    if (label.startsWith('zone:')) {
      this.hitZone(label, ball);
      return;
    }
    if (label.startsWith('sling:')) {
      this.hitSling(Number(label.slice(6)), ball);
      return;
    }
    if (label === 'drain') {
      const ballState = this.liveBalls.find((entry) => entry.body === ball);
      if (ballState) this.drainBall(ballState);
    }
  }

  private hitBumper(index: number, ball: Matter.Body): void {
    const built = this.built;
    if (!built || !this.stage) return;
    const bumper = built.bumpers[index];
    if (!bumper) return;
    if (!this.allow(`bumper:${index}`, 0.07)) return;

    this.bumperFlash[index] = this.timeSec;
    const spec = bumper.spec;

    if (spec.kind === 'hazard') {
      this.score.combo = 0;
      this.ui.setCombo(0);
      this.particles.burst(ball.position.x, ball.position.y, '#8d8da6', 10, 5, 'line');
      if (this.allow('hazard', 1.4)) {
        this.sound.play('drain', 0.3);
        this.ui.toast('METEOR BUMP!', 800);
        this.shake(2);
      }
      return;
    }

    // Pop bumper: kick the ball away from the bumper centre (physics, not input).
    let dir = Vector.sub(ball.position, bumper.body.position);
    if (Vector.magnitude(dir) < 0.001) dir = { x: 0, y: 1 };
    dir = Vector.normalise(dir);
    const speed = Math.max(11.5, Vector.magnitude(ball.velocity) * 1.02);
    Body.setVelocity(ball, Vector.mult(dir, Math.min(speed, MAX_BALL_SPEED)));

    this.extendCombo();
    this.counters.bumpers += 1;
    const base = spec.points ?? (spec.kind === 'jackpot' ? this.stage.jackpotValue : SCORE.bumper);
    this.awardAt(base, spec.x, spec.y - spec.r - 12, this.stage.theme.bumperA, 'bumper');
    this.particles.burst(ball.position.x, ball.position.y, this.stage.theme.bumperA, 14, 7, 'line');
    this.particles.burst(spec.x, spec.y, '#ffffff', 4, 3, 'dot');
    this.shake(3);
    if (spec.kind === 'jackpot') this.counters.jackpots += 1;
  }

  private hitTarget(index: number, ball: Matter.Body): void {
    const built = this.built;
    if (!built || !this.stage) return;
    const target = built.targets[index];
    if (!target) return;
    const spec = target.spec;
    if (this.targetDown[index] && spec.kind === 'drop') return;
    if (!this.allow(`target:${index}`, spec.kind === 'drop' ? 0.5 : 0.2)) return;

    this.targetFlash[index] = this.timeSec;
    this.extendCombo();
    this.counters.targets += 1;
    const theme = this.stage.theme;

    if (spec.kind === 'jackpot') {
      if (this.jackpotReady) {
        this.jackpotReady = false;
        this.jackpotCooldown = 2.5;
        this.counters.jackpots += 1;
        this.awardAt(this.stage.jackpotValue, spec.x, spec.y - 24, '#ffd257', 'jackpot');
        this.particles.popup(spec.x, spec.y - 54, 'JACKPOT!', '#ffd257', 32);
        this.particles.burst(spec.x, spec.y, '#ffd257', 26, 9, 'star');
        this.shake(7);
        this.ui.toast('JACKPOT!', 1300);
      } else {
        this.awardAt(1000, spec.x, spec.y - 20, theme.accent, 'target');
      }
      return;
    }

    if (spec.kind === 'skill') {
      const sinceLaunch = this.liveBalls.reduce(
        (max, ballState) => Math.max(max, performance.now() - ballState.launchedAt),
        Number.POSITIVE_INFINITY
      );
      if (sinceLaunch < 6000) {
        this.awardAt(SCORE.skillShot, spec.x, spec.y - 22, '#ffe98f', 'jackpot');
        this.particles.popup(spec.x, spec.y - 46, 'SKILL SHOT!', '#ffe98f', 28);
        this.ui.toast('SKILL SHOT +12,000', 1400);
      } else {
        this.awardAt(750, spec.x, spec.y - 20, theme.accent, 'target');
      }
      this.particles.burst(ball.position.x, ball.position.y, '#ffe98f', 14, 7, 'star');
      return;
    }

    if (spec.kind === 'drop') {
      this.targetDown[index] = true;
      target.body.collisionFilter.mask = 0;
      this.awardAt(spec.points ?? SCORE.drop, spec.x, spec.y - 16, theme.accent, 'target');
      this.particles.burst(spec.x, spec.y, theme.accent, 10, 6, 'line');
      this.shake(2);
      if (spec.bank) this.checkBank(spec.bank);
      return;
    }

    // stand-up target
    this.awardAt(spec.points ?? SCORE.standup, spec.x, spec.y - 16, theme.bumperB, 'target');
    this.particles.burst(ball.position.x, ball.position.y, theme.bumperB, 8, 5, 'dot');
    this.shake(1.5);
  }

  private checkBank(bank: string): void {
    if (!this.built || !this.stage) return;
    const members = this.built.targets.filter((target) => target.spec.bank === bank);
    if (members.length === 0) return;
    if (!members.every((target) => this.targetDown[target.index])) return;
    if (this.bankResets.some((reset) => reset.bank === bank)) return;

    this.counters.banks += 1;
    this.bankResets.push({ bank, at: this.timeSec + 2.5 });
    this.awardAt(SCORE.bankClear, 270, 600, '#ffd257', 'jackpot');
    this.particles.popup(270, 570, 'BANK CLEARED!', '#ffd257', 30);
    this.particles.burst(270, 620, '#ffd257', 24, 8, 'star');
    this.shake(5);
    this.ui.toast('TARGET BANK CLEARED!', 1400);
  }

  private hitLane(index: number): void {
    if (!this.built || !this.stage) return;
    if (!this.allow(`lane:${index}`, 0.6)) return;
    if (this.laneLit[index]) return;
    this.laneLit[index] = true;
    this.sound.play('lane');
    this.awardAt(SCORE.lane, this.built.lanes[index].spec.x, this.built.lanes[index].spec.y, '#38e8ff');
    this.extendCombo();
    if (this.laneLit.length > 0 && this.laneLit.every(Boolean)) {
      this.laneLit = this.laneLit.map(() => false);
      this.counters.laneSets += 1;
      this.awardAt(SCORE.laneSet, 270, 210, '#ffd257', 'stage');
      this.particles.popup(270, 240, 'LANES COMPLETE!', '#ffd257', 28);
      this.particles.burst(270, 210, '#ffd257', 20, 8, 'star');
      this.shake(4);
      this.ui.toast('ALL LANES LIT!', 1200);
    }
  }

  private hitZone(label: string, ball: Matter.Body): void {
    const built = this.built;
    if (!built || !this.stage) return;
    const parts = label.split(':');
    const kind = parts[1];
    const index = Number(parts[2]);
    const zone = built.zones[index];
    if (!zone) return;
    const pos = zone.spec;

    if (kind === 'orbit') {
      if (!this.allow(`zone:${index}`, 1.2)) return;
      this.counters.orbits += 1;
      this.zoneFlash[index] = this.timeSec;
      this.extendCombo();
      this.awardAt(SCORE.orbit, pos.x + 30, (pos.y ?? 0) - 20, '#38e8ff', 'orbit');
      this.particles.popup(84, 430, 'ORBIT!', '#38e8ff', 26);
      this.particles.burst(pos.x, pos.y ?? 0, '#38e8ff', 16, 7, 'star');
      this.shake(4);
      return;
    }

    if (kind === 'spinner') {
      if (!this.allow(`zone:${index}`, 0.1)) return;
      this.counters.spinner += 1;
      this.zoneFlash[index] = this.timeSec;
      this.spinnerSpin = Math.min(0.9, this.spinnerSpin + 0.35);
      this.awardAt(SCORE.spinner, pos.x + 30, (pos.y ?? 0) - 16, this.stage.theme.accent, 'spinner');
      this.particles.burst(pos.x, pos.y ?? 0, this.stage.theme.accent, 4, 4, 'line');
      return;
    }

    if (kind === 'ramp') {
      if (!this.allow(`zone:${index}`, 1.2)) return;
      this.counters.ramps += 1;
      this.zoneFlash[index] = this.timeSec;
      this.extendCombo();
      this.awardAt(SCORE.ramp, pos.x, (pos.y ?? 0) - 26, this.stage.theme.bumperB, 'ramp');
      this.particles.popup(pos.x, 150, 'RAMP!', this.stage.theme.bumperB, 26);
      this.particles.burst(pos.x, pos.y ?? 0, this.stage.theme.bumperB, 16, 7, 'star');
      this.shake(3);
      return;
    }

    if (kind === 'lock') {
      if (!this.allow(`zone:${index}`, 1.5)) return;
      const ballState = this.liveBalls.find((entry) => entry.body === ball);
      if (!ballState) return;
      this.removeBall(ballState);
      this.locks += 1;
      this.counters.locks += 1;
      this.zoneFlash[index] = this.timeSec;
      this.awardAt(SCORE.lock, pos.x, (pos.y ?? 0) - 20, '#ffd257', 'lock');
      this.particles.burst(pos.x, pos.y ?? 0, '#ffd257', 16, 7, 'star');
      this.ui.toast(`BALL LOCKED ${this.locks}/${this.stage.locksRequired}`, 1200);

      if (this.locks >= this.stage.locksRequired) {
        this.locks = 0;
        this.startMultiball();
      } else if (this.liveBalls.length === 0) {
        this.spawnReadyBall();
      }
    }
  }

  private startMultiball(): void {
    if (!this.stage) return;
    this.awardAt(SCORE.multiball, 270, 500, '#ffd257', 'multiball');
    this.ui.toast('MULTIBALL!', 1600);
    this.particles.popup(270, 470, 'MULTIBALL!', '#ffd257', 32);
    this.particles.burst(270, 520, '#ffd257', 26, 9, 'star');
    this.shake(6);
    const count = 2;
    for (let i = 0; i < count; i++) {
      this.spawnLiveBall(SPAWN.x, 880 - i * 34, 0, -32);
    }
  }

  private hitSling(index: number, ball: Matter.Body): void {
    const built = this.built;
    if (!built || !this.stage) return;
    const sling = built.slings[index];
    if (!sling) return;
    if (!this.allow(`sling:${index}`, 0.12)) return;
    const current = ball.velocity;
    Body.setVelocity(ball, {
      x: sling.kickX * 10.5 + current.x * 0.2,
      y: sling.kickY * 10.5 + current.y * 0.2,
    });
    this.slingFlash[index] = this.timeSec;
    this.extendCombo();
    this.awardAt(SCORE.sling, ball.position.x, ball.position.y - 16, '#ff8ac2', 'sling');
    this.particles.burst(ball.position.x, ball.position.y, this.stage.theme.sling, 9, 5.5, 'line');
    this.shake(2);
  }

  // ------------------------------------------------------- goals + ends

  private goalProgress(): GoalProgress[] {
    if (!this.stage) return [];
    return this.stage.goals.map((goal) => {
      const current = this.goalValue(goal);
      return {
        label: goal.label,
        current,
        target: goal.count,
        done: current >= goal.count,
        isScore: goal.kind === 'score',
      };
    });
  }

  private goalValue(goal: Goal): number {
    switch (goal.kind) {
      case 'score':
        return this.score.stageScore;
      case 'bumpers':
        return this.counters.bumpers;
      case 'targets':
        return this.counters.targets;
      case 'banks':
        return this.counters.banks;
      case 'orbits':
        return this.counters.orbits;
      case 'ramps':
        return this.counters.ramps;
      case 'lanes':
        return this.counters.laneSets;
      case 'spinner':
        return this.counters.spinner;
      case 'combos':
        return this.score.maxCombo;
      case 'jackpot':
        return this.counters.jackpots;
      case 'locks':
        return this.counters.locks;
      default:
        return 0;
    }
  }

  private goalDone(goal: Goal): boolean {
    return this.goalValue(goal) >= goal.count;
  }

  private completeStage(): void {
    if (!this.stage || this.state !== 'playing') return;
    const stage = this.stage;
    this.state = 'stageComplete';
    this.cancelCharge();
    this.releaseAllInputs();
    this.sound.play('stage');
    this.sound.duckMusic(true);
    this.particles.burst(270, 420, '#ffd257', 40, 10, 'star');
    this.particles.popup(270, 380, 'STAGE CLEAR!', '#ffe98f', 34);
    this.shake(6);

    if (stage.reward.bonus) this.score.award({ base: stage.reward.bonus });
    this.ui.setScore(this.score.runScore);

    this.progress = store.completeStage(stage.id, this.score.stageScore);
    const nextId = isFinalStage(stage.id) ? null : stage.id + 1;

    if (nextId === null) {
      this.victory();
      return;
    }

    this.ui.showStageComplete({
      stage,
      stageScore: this.score.stageScore,
      runScore: this.score.runScore,
      nextStageId: nextId,
      summary: stage.goals.map((goal) => goal.label).join(' · '),
    });
  }

  private victory(): void {
    this.state = 'victory';
    this.sound.stopMusic();
    this.sound.play('stage');
    this.recordRun();
    this.ui.showVictory({ runScore: this.score.runScore, playerName: this.playerName, prefs: this.prefs });
    void this.loadGlobalScores();
  }

  private endRun(_reason: 'gameOver'): void {
    if (this.runEnded) return;
    this.runEnded = true;
    this.state = 'gameOver';
    this.cancelCharge();
    this.releaseAllInputs();
    this.sound.play('gameover');
    this.sound.duckMusic(true);
    this.particles.burst(270, 500, '#ffd257', 30, 9, 'star');
    this.recordRun();
    this.ui.showGameOver({
      runScore: this.score.runScore,
      scores: store.loadHiScores(),
      qualifies: store.qualifies(this.score.runScore),
      stageReached: this.stage?.id ?? 1,
      prefs: this.prefs,
      playerName: this.playerName,
    });
    void this.loadGlobalScores();
  }

  /** Persist the local leaderboard entry and the per-stage best for this run. */
  private recordRun(): void {
    if (this.stage) {
      this.progress = store.recordStageBest(this.stage.id, this.score.stageScore);
    }
    const name = sanitizeName(this.playerName) ?? 'PLAYER';
    const rank = store.insertHiScore(name, this.score.runScore);
    this.ui.setLocalScores(store.loadHiScores(), rank);
  }

  // ------------------------------------------------------- leaderboard UI

  private async loadGlobalScores(): Promise<void> {
    this.ui.setGlobalStatus('Loading global scores…', { loading: true });
    const result = await fetchTopScores();
    if (result.ok) {
      this.ui.setGlobalScores(result.data);
      this.ui.setGlobalStatus(result.data.length > 0 ? '' : 'No global scores yet — be the first!');
    } else {
      this.ui.setGlobalStatus(describeApiFailure(result.reason), { error: true });
      this.ui.setGlobalScores([]);
    }
  }

  private async handleSubmit(rawName: string): Promise<void> {
    if (this.submitPending) return;
    const nameResult = validateName(rawName);
    if (!nameResult.ok) {
      this.ui.setSubmitResult(false, 'Enter a name (1–12 characters, no control characters).');
      return;
    }
    if (this.score.runScore <= 0) {
      this.ui.setSubmitResult(false, 'No score to submit yet.');
      return;
    }

    this.submitPending = true;
    this.playerName = nameResult.value;
    store.savePlayerName(this.playerName);
    this.ui.setSubmitting(true);

    const result = await submitScore(this.playerName, this.score.runScore);
    this.submitPending = false;

    if (result.ok) {
      this.ui.setSubmitResult(true, 'Score submitted to the global leaderboard!');
      this.sound.play('stage');
      void this.loadGlobalScores();
    } else if (result.reason === 'invalid') {
      this.ui.setSubmitResult(false, result.message);
    } else {
      this.ui.setSubmitResult(false, `${describeApiFailure(result.reason)} Your score is saved locally.`);
    }
  }

  // ---------------------------------------------------------------- view

  private ballViews(): BallView[] {
    const now = performance.now();
    const views: BallView[] = [];
    for (const ball of this.liveBalls) {
      views.push({
        x: ball.body.position.x,
        y: ball.body.position.y,
        angle: ball.body.angle,
        trail: ball.trail,
        saved: now < ball.saveUntil,
      });
    }
    if (this.readyBall) {
      views.push({
        x: this.readyBall.position.x,
        y: this.readyBall.position.y,
        angle: this.readyBall.angle,
        trail: [],
        saved: false,
      });
    }
    return views;
  }

  private view(): RenderState {
    const built = this.built ?? this.displayStage;
    const stage = this.stage ?? STAGES[0];

    // update trails once per rendered frame
    for (const ball of this.liveBalls) {
      ball.trail.push({ x: ball.body.position.x, y: ball.body.position.y });
      if (ball.trail.length > 12) ball.trail.shift();
    }

    return {
      time: this.animTime,
      stage,
      built,
      balls: this.ballViews(),
      flipL: built.flippers.left,
      flipR: built.flippers.right,
      charge: this.charge,
      ballReady: this.readyBall !== null,
      bumperFlash: this.bumperFlash,
      targetFlash: this.targetFlash,
      targetDown: this.targetDown,
      laneLit: this.laneLit,
      slingFlash: this.slingFlash,
      zoneFlash: this.zoneFlash,
      spinnerAngle: this.spinnerAngle,
      locks: this.locks,
      locksRequired: stage.locksRequired,
      jackpotLit: this.jackpotReady,
      drainFlash: this.drainFlash,
      ballSaveRemaining: Math.max(0, this.ballSaveUntil - performance.now()),
      shakeX: this.shakeX,
      shakeY: this.shakeY,
      reducedMotion: this.prefs.reducedMotion,
      particles: this.particles,
    };
  }
}
