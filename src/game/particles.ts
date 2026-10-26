/**
 * Lightweight particle + floating-text systems for juicy feedback.
 * Pooled, zero-allocation in the hot path after warm-up.
 */

export interface Spark {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  size: number;
  color: string;
  drag: number;
  gravity: number;
  shape: 'dot' | 'line' | 'star';
}

export interface Popup {
  alive: boolean;
  x: number;
  y: number;
  vy: number;
  life: number;
  ttl: number;
  text: string;
  color: string;
  size: number;
}

const MAX_SPARKS = 420;
const MAX_POPUPS = 24;

export class Particles {
  sparks: Spark[] = [];
  popups: Popup[] = [];

  constructor() {
    for (let i = 0; i < MAX_SPARKS; i++) {
      this.sparks.push({
        alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, ttl: 1,
        size: 2, color: '#fff', drag: 0.98, gravity: 0, shape: 'dot',
      });
    }
    for (let i = 0; i < MAX_POPUPS; i++) {
      this.popups.push({ alive: false, x: 0, y: 0, vy: 0, life: 0, ttl: 1, text: '', color: '#fff', size: 20 });
    }
  }

  private nextSpark(): Spark {
    for (const s of this.sparks) if (!s.alive) return s;
    return this.sparks[0]; // recycle oldest slot when full
  }

  /** Radial spark burst (bumper hits, slings, drain). */
  burst(x: number, y: number, color: string, count = 14, speed = 7, shape: Spark['shape'] = 'line'): void {
    for (let i = 0; i < count; i++) {
      const s = this.nextSpark();
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.85);
      s.alive = true;
      s.x = x; s.y = y;
      s.vx = Math.cos(a) * v;
      s.vy = Math.sin(a) * v;
      s.ttl = 0.35 + Math.random() * 0.45;
      s.life = s.ttl;
      s.size = 1.5 + Math.random() * 2.4;
      s.color = color;
      s.drag = 0.94;
      s.gravity = 9;
      s.shape = shape;
    }
  }

  /** Slow floating shimmer (idle bumper ambience). */
  shimmer(x: number, y: number, color: string, count = 3): void {
    for (let i = 0; i < count; i++) {
      const s = this.nextSpark();
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 10;
      s.alive = true;
      s.x = x + Math.cos(a) * r;
      s.y = y + Math.sin(a) * r;
      s.vx = Math.cos(a) * 0.3;
      s.vy = -0.4 - Math.random() * 0.5;
      s.ttl = 0.6 + Math.random() * 0.5;
      s.life = s.ttl;
      s.size = 1 + Math.random() * 1.6;
      s.color = color;
      s.drag = 1;
      s.gravity = 0;
      s.shape = 'dot';
    }
  }

  popup(x: number, y: number, text: string, color = '#ffffff', size = 22): void {
    let p: Popup | undefined;
    for (const q of this.popups) if (!q.alive) { p = q; break; }
    if (!p) p = this.popups[0];
    p.alive = true;
    p.x = x; p.y = y;
    p.vy = -46;
    p.ttl = 0.95;
    p.life = p.ttl;
    p.text = text;
    p.color = color;
    p.size = size;
  }

  update(dt: number): void {
    for (const s of this.sparks) {
      if (!s.alive) continue;
      s.life -= dt;
      if (s.life <= 0) { s.alive = false; continue; }
      s.vx *= s.drag;
      s.vy = s.vy * s.drag + s.gravity * dt;
      s.x += s.vx * dt * 60 * 0.55;
      s.y += s.vy * dt * 60 * 0.55;
    }
    for (const p of this.popups) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.y += p.vy * dt;
      p.vy *= 0.96;
    }
  }

  /** Draw sparks with additive glow. */
  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.sparks) {
      if (!s.alive) continue;
      const t = s.life / s.ttl;
      ctx.globalAlpha = t;
      ctx.fillStyle = s.color;
      ctx.strokeStyle = s.color;
      if (s.shape === 'line') {
        ctx.lineWidth = s.size * 0.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 2.2, s.y - s.vy * 2.2);
        ctx.stroke();
      } else if (s.shape === 'star') {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.life * 6);
        const r = s.size * (0.6 + t);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * r * 2.2, Math.sin(a) * r * 2.2);
        }
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * t, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawPopups(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.popups) {
      if (!p.alive) continue;
      const t = p.life / p.ttl;
      const pop = t > 0.85 ? 1 + (t - 0.85) * 4 : 1; // pop-in
      ctx.globalAlpha = Math.min(1, t * 2.2);
      ctx.font = `800 ${p.size * pop}px Orbitron, sans-serif`;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }

  clear(): void {
    for (const s of this.sparks) s.alive = false;
    for (const p of this.popups) p.alive = false;
  }
}
