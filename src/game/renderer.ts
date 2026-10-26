/**
 * Canvas renderer. Draws whatever the current stage + game state contain —
 * there is no stage-specific drawing code here, only element shapes.
 */
import type { StageConfig, StageTheme } from './stages/types';
import { ARC, PLAYFIELD_BOTTOM, type BuiltStage } from '../physics/stageBuilder';
import type { Flipper } from '../physics/flippers';
import { VIEW_H, VIEW_W } from './constants';
import { clamp, mulberry32 } from './util';

const NEVER = -9999;

export interface BallView {
  x: number;
  y: number;
  angle: number;
  trail: { x: number; y: number }[];
  saved: boolean;
}

export interface RenderState {
  time: number;
  stage: StageConfig;
  built: BuiltStage;
  balls: BallView[];
  flipL: Flipper;
  flipR: Flipper;
  charge: number; // 0..1 launch power
  ballReady: boolean;
  bumperFlash: number[];
  targetFlash: number[];
  targetDown: boolean[];
  laneLit: boolean[];
  slingFlash: number[];
  zoneFlash: number[];
  spinnerAngle: number;
  locks: number;
  locksRequired: number;
  jackpotLit: boolean;
  drainFlash: number;
  ballSaveRemaining: number;
  shakeX: number;
  shakeY: number;
  reducedMotion: boolean;
  particles: {
    draw(ctx: CanvasRenderingContext2D): void;
    drawPopups(ctx: CanvasRenderingContext2D): void;
  };
}

interface Twinkle {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
  hue: string;
}

function starPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  ro: number,
  ri: number,
  rot: number
): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = rot + (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private bgTheme = '';
  private twinkles: Twinkle[] = [];
  private tablePath: Path2D | null = null;
  scale = 1;
  offX = 0;
  offY = 0;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;
  private theme: StageTheme | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not supported in this browser');
    this.ctx = ctx;
    this.resize();
  }

  /** Swap the stage theme (rebuilds the cached background). */
  setTheme(theme: StageTheme): void {
    if (this.theme?.id === theme.id) return;
    this.theme = theme;
    this.bgTheme = '';
    this.buildTwinkles();
    this.buildBackground();
  }

  private buildTwinkles(): void {
    const rnd = mulberry32(1337 + (this.theme ? this.theme.id.length * 97 : 0));
    const hues = ['#ffffff', this.theme?.accent ?? '#9fd8ff', '#ffd9a0', '#e7b6ff'];
    this.twinkles = [];
    for (let i = 0; i < 110; i++) {
      this.twinkles.push({
        x: 14 + rnd() * (VIEW_W - 28),
        y: 40 + rnd() * (VIEW_H - 60),
        r: 0.5 + rnd() * 1.5,
        phase: rnd() * Math.PI * 2,
        speed: 0.6 + rnd() * 2.4,
        hue: hues[Math.floor(rnd() * hues.length)],
      });
    }
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    this.cssW = parent ? parent.clientWidth : window.innerWidth;
    this.cssH = parent ? parent.clientHeight : window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(this.cssW * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.cssH * this.dpr));
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.scale = Math.min(this.cssW / VIEW_W, this.cssH / VIEW_H);
    this.offX = (this.cssW - VIEW_W * this.scale) / 2;
    this.offY = (this.cssH - VIEW_H * this.scale) / 2;
    this.buildBackground();
  }

  /** Convert client (page) coordinates to virtual playfield coordinates. */
  toVirtual(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.offX) / this.scale,
      y: (clientY - rect.top - this.offY) / this.scale,
    };
  }

  // ------------------------------------------------------------- background

  private buildBackground(): void {
    if (!this.theme) return;
    const theme = this.theme;
    const cacheKey = `${theme.id}:${this.canvas.width}x${this.canvas.height}:${this.dpr}`;
    if (this.bg && this.bgTheme === cacheKey) return;
    this.bgTheme = cacheKey;

    const w = Math.max(1, this.canvas.width);
    const h = Math.max(1, this.canvas.height);
    const bg = document.createElement('canvas');
    bg.width = w;
    bg.height = h;
    const c = bg.getContext('2d');
    if (!c) return;

    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, theme.bgTop);
    g.addColorStop(0.55, theme.bgBottom);
    g.addColorStop(1, '#020106');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);

    const rnd = mulberry32(42);
    const nebs = [
      { x: 0.22, y: 0.24, r: 0.5, col: theme.glowA },
      { x: 0.85, y: 0.6, r: 0.45, col: theme.glowB },
      { x: 0.5, y: 0.9, r: 0.55, col: theme.glowB },
      { x: 0.75, y: 0.1, r: 0.35, col: theme.glowA },
    ];
    c.globalCompositeOperation = 'screen';
    for (const n of nebs) {
      const rg = c.createRadialGradient(n.x * w, n.y * h, 0, n.x * w, n.y * h, n.r * Math.min(w, h));
      rg.addColorStop(0, n.col);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg;
      c.fillRect(0, 0, w, h);
    }

    for (let i = 0; i < 200; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = rnd() * 1.4 + 0.2;
      c.globalAlpha = 0.25 + rnd() * 0.6;
      c.fillStyle = rnd() > 0.85 ? theme.accent : '#ffffff';
      c.beginPath();
      c.arc(x, y, r * this.dpr * 0.75, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    this.bg = bg;
  }

  private getTablePath(): Path2D {
    if (this.tablePath) return this.tablePath;
    const p = new Path2D();
    p.moveTo(9, PLAYFIELD_BOTTOM + 2);
    p.lineTo(9, 302);
    p.arc(ARC.cx, ARC.cy, ARC.r, Math.PI, Math.PI * 2, false);
    p.lineTo(531, 302);
    p.lineTo(531, PLAYFIELD_BOTTOM + 2);
    p.closePath();
    this.tablePath = p;
    return p;
  }

  // ------------------------------------------------------------------ draw

  draw(v: RenderState): void {
    const ctx = this.ctx;
    const theme = v.stage.theme;
    this.setTheme(theme);
    this.buildBackground();

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (this.bg) ctx.drawImage(this.bg, 0, 0, this.cssW, this.cssH);
    else {
      ctx.fillStyle = theme.bgBottom;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }

    const shake = v.reducedMotion ? 0 : 1;
    ctx.save();
    ctx.translate(this.offX + v.shakeX * this.scale * shake, this.offY + v.shakeY * this.scale * shake);
    ctx.scale(this.scale, this.scale);

    const path = this.getTablePath();
    const felt = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    felt.addColorStop(0, this.feltColor(theme, 0.94));
    felt.addColorStop(0.5, this.feltColor(theme, 0.97));
    felt.addColorStop(1, this.feltColor(theme, 0.95));
    ctx.fillStyle = felt;
    ctx.fill(path);

    ctx.save();
    ctx.strokeStyle = theme.accentSoft;
    ctx.lineWidth = 3;
    ctx.shadowColor = theme.wall;
    ctx.shadowBlur = 16;
    ctx.stroke(path);
    ctx.restore();

    // twinkling in-table stars
    ctx.save();
    ctx.clip(path);
    for (const t of this.twinkles) {
      const a = 0.22 + 0.5 * (0.5 + 0.5 * Math.sin(v.time * t.speed + t.phase));
      ctx.globalAlpha = a;
      ctx.fillStyle = t.hue;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    this.drawWalls(ctx, v);
    this.drawLaneCues(ctx, v);
    this.drawLanes(ctx, v);
    this.drawZones(ctx, v);
    this.drawBumpers(ctx, v);
    this.drawTargets(ctx, v);
    this.drawPosts(ctx, v);
    this.drawMovers(ctx, v);
    this.drawFlipper(ctx, v.flipL, v.time);
    this.drawFlipper(ctx, v.flipR, v.time);
    this.drawPlunger(ctx, v);
    this.drawBalls(ctx, v);

    v.particles.draw(ctx);
    v.particles.drawPopups(ctx);

    const drainAge = v.time - v.drainFlash;
    if (drainAge < 0.6) {
      const a = (1 - drainAge / 0.6) * 0.45;
      const rg = ctx.createRadialGradient(270, 480, 200, 270, 480, 620);
      rg.addColorStop(0, 'rgba(255,60,90,0)');
      rg.addColorStop(1, `rgba(255,60,90,${a})`);
      ctx.fillStyle = rg;
      ctx.fillRect(-30, -30, VIEW_W + 60, VIEW_H + 60);
    }

    ctx.restore();
  }

  /** Tinted playfield felt derived from the theme background. */
  private feltColor(theme: StageTheme, alpha: number): string {
    const rgb = this.hexToRgb(theme.bgTop);
    const r = Math.round(rgb.r * 0.75 + 12);
    const g = Math.round(rgb.g * 0.75 + 10);
    const b = Math.round(rgb.b * 0.8 + 26);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const value = hex.replace('#', '');
    const full =
      value.length === 3
        ? value
            .split('')
            .map((c) => c + c)
            .join('')
        : value;
    const num = Number.parseInt(full, 16);
    if (!Number.isFinite(num)) return { r: 10, g: 8, b: 30 };
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  // ---------------------------------------------------------------- pieces

  private drawWalls(ctx: CanvasRenderingContext2D, v: RenderState): void {
    const theme = v.stage.theme;
    for (const s of v.built.walls) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      roundRect(ctx, -s.w / 2, -s.h / 2, s.w, s.h, Math.min(7, s.h / 2));
      ctx.fillStyle = theme.wallFill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.wall;
      ctx.stroke();
      ctx.restore();
    }

    for (let i = 0; i < v.built.slings.length; i++) {
      const sling = v.built.slings[i];
      const flashAge = v.time - (v.slingFlash[i] ?? NEVER);
      const glow = flashAge < 0.25 ? 1 - flashAge / 0.25 : 0;
      const pulse = v.reducedMotion ? 0.3 : 0.5 + 0.5 * Math.sin(v.time * 4 + i * 2);
      ctx.save();
      ctx.translate(sling.seg.x, sling.seg.y);
      ctx.rotate(sling.seg.angle);
      roundRect(ctx, -sling.seg.w / 2, -sling.seg.h / 2, sling.seg.w, sling.seg.h, 8);
      ctx.fillStyle = 'rgba(60,10,40,0.9)';
      ctx.fill();
      ctx.lineWidth = 2.5 + glow * 2;
      ctx.shadowColor = theme.sling;
      ctx.shadowBlur = 8 + glow * 22 + pulse * 4;
      ctx.strokeStyle = glow > 0 ? '#ffd6ec' : theme.sling;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(255,255,255,${0.2 + glow * 0.6})`;
      const chevrons = Math.max(1, Math.floor(sling.seg.w / 26));
      for (let k = 0; k < chevrons; k++) {
        const x = -sling.seg.w / 2 + 16 + k * 26;
        ctx.beginPath();
        ctx.moveTo(x - 5, 5);
        ctx.lineTo(x, -5);
        ctx.lineTo(x + 5, 5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawPosts(ctx: CanvasRenderingContext2D, v: RenderState): void {
    const theme = v.stage.theme;
    for (const post of v.built.posts) {
      ctx.beginPath();
      ctx.arc(post.x, post.y, post.r, 0, Math.PI * 2);
      ctx.fillStyle = theme.wallFill;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = post.accent ? theme.sling : theme.accent;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(post.x - 2.5, post.y - 2.5, Math.min(2.5, post.r / 3), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fill();
    }
  }

  private drawLanes(ctx: CanvasRenderingContext2D, v: RenderState): void {
    const theme = v.stage.theme;
    for (let i = 0; i < v.built.lanes.length; i++) {
      const lane = v.built.lanes[i];
      const lit = v.laneLit[i] === true;
      const w = lane.spec.w;
      const h = lane.spec.h;
      ctx.save();
      ctx.translate(lane.spec.x, lane.spec.y);
      ctx.rotate(lane.spec.angle);
      roundRect(ctx, -w / 2, -h / 2, w, h, 12);
      ctx.fillStyle = lit ? theme.accent : 'rgba(10,10,30,0.55)';
      ctx.globalAlpha = lit ? 0.85 : 0.6;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.strokeStyle = lit ? '#ffffff' : theme.wall;
      ctx.shadowColor = theme.accent;
      ctx.shadowBlur = lit ? 16 : 5;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = lit ? '#08111c' : theme.accent;
      ctx.font = '800 17px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lane.spec.label, 0, 1);
      ctx.restore();
    }
  }

  private drawZones(ctx: CanvasRenderingContext2D, v: RenderState): void {
    const theme = v.stage.theme;
    for (let i = 0; i < v.built.zones.length; i++) {
      const zone = v.built.zones[i];
      const spec = zone.spec;
      const age = v.time - (v.zoneFlash[i] ?? NEVER);
      const glow = age < 0.5 ? 1 - age / 0.5 : 0;
      const r = spec.r ?? 16;

      if (spec.kind === 'orbit') {
        for (let k = 0; k < 3; k++) {
          const y = spec.y - 46 + k * 46;
          const pulse = v.reducedMotion ? 0.45 : 0.35 + 0.3 * Math.sin(v.time * 3 - k * 0.8);
          ctx.save();
          ctx.translate(spec.x, y);
          ctx.rotate(Math.PI / 4);
          const a = Math.min(1, pulse + glow * 0.8);
          ctx.fillStyle = theme.accent;
          ctx.globalAlpha = a * 0.85;
          ctx.shadowColor = theme.accent;
          ctx.shadowBlur = 6 + glow * 18;
          const size = 6 + glow * 3;
          ctx.fillRect(-size / 2, -size / 2, size, size);
          ctx.restore();
        }
        continue;
      }

      if (spec.kind === 'ramp') {
        ctx.save();
        ctx.translate(spec.x, spec.y);
        ctx.rotate(v.reducedMotion ? 0 : v.time * 1.4);
        ctx.strokeStyle = theme.bumperB;
        ctx.globalAlpha = 0.55 + glow * 0.45;
        ctx.shadowColor = theme.bumperB;
        ctx.shadowBlur = 8 + glow * 20;
        for (let ring = 0; ring < 2; ring++) {
          ctx.lineWidth = 2.5 - ring * 0.8;
          ctx.beginPath();
          ctx.arc(0, 0, 16 - ring * 5 + glow * 4, ring, ring + Math.PI * 1.5);
          ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        continue;
      }

      if (spec.kind === 'spinner') {
        ctx.save();
        ctx.translate(spec.x, spec.y);
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = theme.accentSoft;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.rotate(v.spinnerAngle);
        ctx.fillStyle = glow > 0 ? '#ffffff' : theme.accent;
        ctx.shadowColor = theme.accent;
        ctx.shadowBlur = 10 + glow * 20;
        roundRect(ctx, -r, -3, r * 2, 6, 3);
        ctx.fill();
        ctx.restore();
        continue;
      }

      // lock zone
      const lockX = spec.x;
      const lockY = spec.y;
      const w = spec.w ?? 84;
      const h = spec.h ?? 20;
      ctx.save();
      ctx.translate(lockX, lockY);
      roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
      ctx.fillStyle = `rgba(255,210,87,${0.12 + glow * 0.4})`;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.accent;
      ctx.setLineDash([7, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = theme.accent;
      ctx.font = '800 11px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`LOCK ${v.locks}/${v.locksRequired}`, 0, 0);
      ctx.restore();
    }
  }

  private drawBumpers(ctx: CanvasRenderingContext2D, v: RenderState): void {
    const theme = v.stage.theme;
    for (let i = 0; i < v.built.bumpers.length; i++) {
      const bumper = v.built.bumpers[i];
      const spec = bumper.spec;
      const age = v.time - (v.bumperFlash[i] ?? NEVER);
      const hit = age < 0.3 ? 1 - age / 0.3 : 0;
      const breathe = v.reducedMotion ? 1 : 1 + Math.sin(v.time * 2 + i * 2.1) * 0.015;

      if (spec.kind === 'hazard') {
        ctx.save();
        ctx.translate(spec.x, spec.y);
        ctx.beginPath();
        ctx.arc(0, 0, spec.r, 0, Math.PI * 2);
        ctx.fillStyle = '#2b2b3a';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#6d6d84';
        ctx.stroke();
        ctx.fillStyle = '#191926';
        ctx.beginPath();
        ctx.arc(-spec.r * 0.3, -spec.r * 0.2, spec.r * 0.26, 0, Math.PI * 2);
        ctx.arc(spec.r * 0.32, spec.r * 0.15, spec.r * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }

      const base = spec.kind === 'jackpot' ? theme.accent : theme.bumperA;
      const dark = spec.kind === 'jackpot' ? '#7a5404' : theme.bumperDark;
      ctx.save();
      ctx.translate(spec.x, spec.y);
      ctx.scale((1 + hit * 0.2) * breathe, (1 - hit * 0.12) * breathe);

      ctx.beginPath();
      ctx.arc(0, 0, spec.r + 4 + hit * 6, 0, Math.PI * 2);
      ctx.strokeStyle = theme.bumperB;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = theme.bumperB;
      ctx.shadowBlur = 14 + hit * 26;
      ctx.globalAlpha = 0.65 + hit * 0.35;
      ctx.stroke();
      ctx.globalAlpha = 1;

      const g = ctx.createRadialGradient(-spec.r * 0.38, -spec.r * 0.42, spec.r * 0.15, 0, 0, spec.r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.2, base);
      g.addColorStop(1, dark);
      ctx.beginPath();
      ctx.arc(0, 0, spec.r, 0, Math.PI * 2);
      ctx.shadowColor = base;
      ctx.shadowBlur = 18 + hit * 24;
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowBlur = 0;

      // ring detail so bumpers read as pop bumpers, not planets
      ctx.beginPath();
      ctx.arc(0, 0, spec.r * 0.52, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(255,255,255,${0.45 + hit * 0.4})`;
      ctx.stroke();
      if (spec.kind === 'jackpot') {
        ctx.fillStyle = '#3a2a02';
        ctx.font = `800 ${Math.round(spec.r * 0.6)}px Orbitron, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', 0, 1);
      }
      ctx.restore();
    }
  }

  private drawTargets(ctx: CanvasRenderingContext2D, v: RenderState): void {
    const theme = v.stage.theme;
    for (let i = 0; i < v.built.targets.length; i++) {
      const target = v.built.targets[i];
      const spec = target.spec;
      const down = v.targetDown[i] === true;
      const age = v.time - (v.targetFlash[i] ?? NEVER);
      const hit = age < 0.35 ? 1 - age / 0.35 : 0;

      ctx.save();
      ctx.translate(spec.x, spec.y);
      ctx.rotate(spec.angle);

      if (spec.kind === 'drop') {
        if (down) {
          roundRect(ctx, -spec.w / 2, -spec.h / 2, spec.w, spec.h, 4);
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.16)';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          roundRect(ctx, -spec.w / 2, -spec.h / 2, spec.w, spec.h, 5);
          ctx.fillStyle = hit > 0 ? '#ffffff' : theme.accent;
          ctx.globalAlpha = 0.9;
          ctx.shadowColor = theme.accent;
          ctx.shadowBlur = 12 + hit * 20;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.shadowBlur = 0;
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }

      const r = Math.max(spec.w, spec.h) / 2;
      if (spec.kind === 'skill') {
        starPath(ctx, 0, 0, r + 4, (r + 4) * 0.45, v.reducedMotion ? 0 : Math.sin(v.time) * 0.15);
        ctx.fillStyle = hit > 0 ? '#ffffff' : theme.accent;
        ctx.shadowColor = theme.accent;
        ctx.shadowBlur = 12 + hit * 22;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff8dd';
        ctx.stroke();
      } else if (spec.kind === 'jackpot') {
        ctx.rotate(v.reducedMotion ? 0 : Math.sin(v.time * 1.6) * 0.12);
        const pulse = v.jackpotLit ? 1 : 0.45;
        ctx.globalAlpha = pulse;
        starPath(ctx, 0, 0, r + 6, (r + 6) * 0.5, Math.PI / 4);
        ctx.fillStyle = hit > 0 ? '#ffffff' : '#ffcf3d';
        ctx.shadowColor = '#ffcf3d';
        ctx.shadowBlur = 16 + hit * 26;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff4c2';
        ctx.stroke();
        ctx.fillStyle = '#402c00';
        ctx.font = '800 13px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('JP', 0, 1);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, r + hit * 3, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.4, hit > 0 ? '#ffffff' : theme.bumperB);
        g.addColorStop(1, theme.bumperDark);
        ctx.fillStyle = g;
        ctx.shadowColor = theme.bumperB;
        ctx.shadowBlur = 10 + hit * 22;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.35 + hit * 0.5})`;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawMovers(ctx: CanvasRenderingContext2D, v: RenderState): void {
    const theme = v.stage.theme;
    for (const mover of v.built.movers) {
      const pos = mover.body.position;
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(mover.spec.angle);
      roundRect(ctx, -mover.spec.w / 2, -mover.spec.h / 2, mover.spec.w, mover.spec.h, 6);
      ctx.fillStyle = 'rgba(30,22,70,0.95)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = theme.sling;
      ctx.shadowColor = theme.sling;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      const stripes = Math.max(1, Math.floor(mover.spec.w / 20));
      for (let i = 0; i < stripes; i++) {
        const x = -mover.spec.w / 2 + 8 + i * 20;
        ctx.fillRect(x, -mover.spec.h / 2 + 3, 8, mover.spec.h - 6);
      }
      ctx.restore();
    }
  }

  private drawLaneCues(ctx: CanvasRenderingContext2D, v: RenderState): void {
    const active = v.ballReady;
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const speed = active ? 170 : 60;
      const span = 320;
      const y = 880 - ((v.time * speed + i * 80) % span);
      const a = active ? 0.85 : 0.3;
      ctx.fillStyle = `rgba(56,232,255,${a * (1 - i * 0.16)})`;
      ctx.beginPath();
      ctx.moveTo(505, y + 10);
      ctx.lineTo(513, y);
      ctx.lineTo(521, y + 10);
      ctx.lineTo(521, y + 5);
      ctx.lineTo(513, y - 5);
      ctx.lineTo(505, y + 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    if (v.ballReady || v.charge > 0) {
      const mx = 534;
      const mw = 13;
      const my = 660;
      const mh = 250;
      ctx.save();
      roundRect(ctx, mx, my, mw, mh, 6);
      ctx.fillStyle = 'rgba(10,10,30,0.85)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = v.stage.theme.accentSoft;
      ctx.stroke();
      const fillH = mh * clamp(v.charge, 0, 1);
      const g = ctx.createLinearGradient(0, my + mh, 0, my);
      g.addColorStop(0, '#39ffb2');
      g.addColorStop(0.55, '#ffd257');
      g.addColorStop(1, '#ff4f6b');
      ctx.fillStyle = g;
      ctx.shadowColor = '#ffd257';
      ctx.shadowBlur = v.charge > 0.97 ? 16 : 6;
      roundRect(ctx, mx + 2, my + mh - fillH, mw - 4, Math.max(4, fillH - 2), 4);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawFlipper(ctx: CanvasRenderingContext2D, f: Flipper, time: number): void {
    const verts = f.body.vertices;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    const tip = f.tip();
    const grad = ctx.createLinearGradient(f.pivot.x, f.pivot.y, tip.x, tip.y);
    grad.addColorStop(0, '#0c5c40');
    grad.addColorStop(1, '#12a474');
    ctx.fillStyle = grad;
    ctx.shadowColor = '#39ffb2';
    ctx.shadowBlur = 10 + f.flipAnim * 14;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#39ffb2';
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#eafffb';
    ctx.globalAlpha = 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(f.pivot.x, f.pivot.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#0b3325';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#39ffb2';
    ctx.stroke();

    if (f.flipAnim > 0.05 && f.flipAnim < 0.98) {
      const a0 = f.side === 'left' ? 0.56 : Math.PI - 0.56;
      const a1 = Math.atan2(tip.y - f.pivot.y, tip.x - f.pivot.x);
      ctx.beginPath();
      ctx.arc(f.pivot.x, f.pivot.y, 80, Math.min(a0, a1), Math.max(a0, a1));
      ctx.arc(f.pivot.x, f.pivot.y, 30, Math.max(a0, a1), Math.min(a0, a1), true);
      ctx.closePath();
      ctx.fillStyle = `rgba(57,255,178,${0.1 + 0.06 * Math.sin(time * 30)})`;
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPlunger(ctx: CanvasRenderingContext2D, v: RenderState): void {
    const cx = 513;
    const c = v.ballReady ? clamp(v.charge, 0, 1) : 0;
    const plateY = 928 + c * 10;
    const theme = v.stage.theme;

    ctx.save();
    roundRect(ctx, 500, 946, 26, 8, 3);
    ctx.fillStyle = '#241d55';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = theme.accent;
    ctx.stroke();

    ctx.beginPath();
    const coils = 5;
    const yTop = plateY + 2;
    const y0 = 946;
    ctx.moveTo(cx, yTop);
    for (let i = 0; i < coils * 2; i++) {
      const t = (i + 1) / (coils * 2);
      const y = yTop + (y0 - yTop) * t;
      const x = cx + (i % 2 === 0 ? 9 : -9);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(cx, y0);
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = c > 0.9 ? '#ffd257' : theme.accent;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 6 + c * 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    roundRect(ctx, 501, plateY - 3, 24, 5, 2);
    ctx.fillStyle = '#2e2670';
    ctx.fill();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  private drawBalls(ctx: CanvasRenderingContext2D, v: RenderState): void {
    for (const ball of v.balls) {
      const n = ball.trail.length;
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / n;
        const p = ball.trail[i];
        ctx.beginPath();
        ctx.globalAlpha = t * 0.2;
        ctx.fillStyle = '#7fd8ff';
        ctx.arc(p.x, p.y, 4 + t * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 14, 0, Math.PI * 2);
      ctx.shadowColor = ball.saved ? 'rgba(57,255,178,0.95)' : 'rgba(160,220,255,0.9)';
      ctx.shadowBlur = ball.saved ? 22 : 16;
      ctx.fillStyle = ball.saved ? 'rgba(57,255,178,0.4)' : 'rgba(140,210,255,0.35)';
      ctx.fill();

      const g = ctx.createRadialGradient(ball.x - 4, ball.y - 5, 1, ball.x, ball.y, 12);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, '#dfeaff');
      g.addColorStop(0.8, '#7d92c9');
      g.addColorStop(1, '#3d4a78');
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 11, 0, Math.PI * 2);
      ctx.shadowBlur = 8;
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(ball.x + Math.cos(ball.angle) * 5, ball.y + Math.sin(ball.angle) * 5, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
