/**
 * SoundManager — audio files first, live synthesis as the fallback.
 *
 * Files (all optional) live in /public/sounds — see public/sounds/README.md.
 * When a file is missing or cannot be decoded, a synthesized sound is used, so
 * the game is fully playable (and audible) with zero audio assets.
 *
 * All loading/decoding is wrapped so a failure can never break startup or
 * surface as an unhandled promise rejection.
 */

export type SfxName =
  | 'flipper'
  | 'bumper'
  | 'target'
  | 'sling'
  | 'launch'
  | 'drain'
  | 'gameover'
  | 'orbit'
  | 'ramp'
  | 'spinner'
  | 'lane'
  | 'lock'
  | 'jackpot'
  | 'multiball'
  | 'stage'
  | 'extra'
  | 'save'
  | 'click';

const SFX_PATHS: Record<SfxName, string> = {
  flipper: '/sounds/flipper.wav',
  bumper: '/sounds/bumper.wav',
  target: '/sounds/target.wav',
  sling: '/sounds/sling.wav',
  launch: '/sounds/launch.wav',
  drain: '/sounds/drain.wav',
  gameover: '/sounds/gameover.wav',
  orbit: '/sounds/orbit.wav',
  ramp: '/sounds/ramp.wav',
  spinner: '/sounds/spinner.wav',
  lane: '/sounds/lane.wav',
  lock: '/sounds/lock.wav',
  jackpot: '/sounds/jackpot.wav',
  multiball: '/sounds/multiball.wav',
  stage: '/sounds/stage.wav',
  extra: '/sounds/extra.wav',
  save: '/sounds/save.wav',
  click: '/sounds/click.wav',
};

const MUSIC_PATH = '/sounds/bgm.mp3';

/** Minimum gap between two plays of the same sound (ms) — avoids machine-gun hits. */
const COOLDOWN_MS: Record<SfxName, number> = {
  flipper: 90,
  bumper: 45,
  target: 40,
  sling: 80,
  launch: 150,
  drain: 400,
  gameover: 800,
  orbit: 250,
  ramp: 250,
  spinner: 70,
  lane: 120,
  lock: 200,
  jackpot: 400,
  multiball: 600,
  stage: 600,
  extra: 600,
  save: 400,
  click: 60,
};

const midi = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private buffers = new Map<string, AudioBuffer>();

  private musicSource: AudioBufferSourceNode | null = null;
  private wantMusic = false;
  private ducked = false;

  private seqTimer: number | null = null;
  private seqStep = 0;
  private seqNextTime = 0;

  private lastPlayed = new Map<SfxName, number>();
  private musicMuted = false;
  private sfxMuted = false;
  private volume = 0.8;

  get isMusicMuted(): boolean {
    return this.musicMuted;
  }

  get isSfxMuted(): boolean {
    return this.sfxMuted;
  }

  get masterVolume(): number {
    return this.volume;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      return;
    }
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    try {
      this.ctx = new AudioCtor();
    } catch {
      this.ctx = null;
      return;
    }

    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxMuted ? 0 : 0.55;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicMuted ? 0 : 0.3;
    this.musicBus.connect(this.master);

    const len = Math.floor(this.ctx.sampleRate * 0.6);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    void this.loadAll();
  }

  private async loadAll(): Promise<void> {
    if (!this.ctx) return;
    try {
      const res = await fetch(MUSIC_PATH);
      if (!res.ok) throw new Error(`missing (${res.status})`);
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set('music', buf);
      if (this.wantMusic && !this.musicSource) this.startMusic();
    } catch {
      if (this.wantMusic) this.startSequencer();
    }

    for (const name of Object.keys(SFX_PATHS) as SfxName[]) {
      void this.loadSfx(name);
    }
  }

  private async loadSfx(name: SfxName): Promise<void> {
    if (!this.ctx) return;
    try {
      const res = await fetch(SFX_PATHS[name]);
      if (!res.ok) return;
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(name, buf);
    } catch {
      /* synthesized fallback stays active */
    }
  }

  // ------------------------------------------------------------- settings

  applySettings(settings: { musicMuted: boolean; sfxMuted: boolean; volume: number }): void {
    this.musicMuted = settings.musicMuted;
    this.sfxMuted = settings.sfxMuted;
    this.volume = settings.volume;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
    this.applyBusLevels();
  }

  setMusicMuted(muted: boolean): void {
    this.musicMuted = muted;
    this.applyBusLevels();
  }

  setSfxMuted(muted: boolean): void {
    this.sfxMuted = muted;
    this.applyBusLevels();
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  private applyBusLevels(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus?.gain.setTargetAtTime(this.sfxMuted ? 0 : 0.55, t, 0.03);
    const musicLevel = this.musicMuted ? 0 : this.ducked ? 0.06 : 0.3;
    this.musicBus?.gain.setTargetAtTime(musicLevel, t, 0.12);
  }

  /** Duck the music while paused / on overlays. */
  duckMusic(ducked: boolean): void {
    this.ducked = ducked;
    this.applyBusLevels();
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  // ---------------------------------------------------------------- music

  startMusic(): void {
    this.wantMusic = true;
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    const buf = this.buffers.get('music');
    if (buf) {
      if (this.musicSource) return;
      this.stopSequencer();
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        if (this.musicBus) src.connect(this.musicBus);
        src.start();
        this.musicSource = src;
      } catch {
        this.startSequencer();
      }
    } else {
      // Not loaded (yet) or missing → procedural loop. It is swapped for the
      // real track once the file finishes loading.
      this.startSequencer();
    }
  }

  stopMusic(): void {
    this.wantMusic = false;
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {
        /* already stopped */
      }
      this.musicSource = null;
    }
    this.stopSequencer();
  }

  private stopSequencer(): void {
    if (this.seqTimer !== null) {
      window.clearInterval(this.seqTimer);
      this.seqTimer = null;
    }
  }

  /** Cheerful synthwave loop: Am → F → C → G with hats and a snare. */
  private startSequencer(): void {
    if (!this.ctx || !this.musicBus || this.seqTimer !== null || this.musicSource) return;
    const BPM = 116;
    const stepDur = 60 / BPM / 2;
    this.seqStep = 0;
    this.seqNextTime = this.ctx.currentTime + 0.08;

    const chords = [45, 41, 48, 43];
    const bassPattern = [0, -1, 12, -1, 0, -1, 7, -1];
    const pentatonic = [0, 3, 5, 7, 10, 12, 15, 19];
    const leadPattern = [0, 2, 1, 3, 5, 3, 2, 1];

    const tick = (): void => {
      if (!this.ctx || !this.musicBus) return;
      while (this.seqNextTime < this.ctx.currentTime + 0.28) {
        const t = this.seqNextTime;
        const step = this.seqStep % 8;
        const bar = Math.floor(this.seqStep / 8) % 4;
        const root = chords[bar];

        const bassOffset = bassPattern[step];
        if (bassOffset >= 0) {
          this.tone('square', midi(root - 12 + bassOffset), t, stepDur * 0.9, 0.16, 500, this.musicBus);
        }
        if (bar % 2 === 0 || step % 2 === 0) {
          const note = root + 24 + pentatonic[leadPattern[step]];
          this.tone('triangle', midi(note), t, stepDur * 0.85, step === 0 ? 0.1 : 0.075, 4200, this.musicBus);
        }
        if (step % 2 === 1) this.noiseHit(t, 0.045, 8000, 0.045, this.musicBus);
        if (step === 4) this.noiseHit(t, 0.12, 1800, 0.09, this.musicBus);

        this.seqNextTime += stepDur;
        this.seqStep++;
      }
    };
    this.seqTimer = window.setInterval(tick, 90);
    tick();
  }

  // ------------------------------------------------------------------ sfx

  play(name: SfxName, intensity = 1): void {
    if (!this.ctx || !this.sfxBus || this.sfxMuted) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);

    const now = performance.now();
    const last = this.lastPlayed.get(name) ?? -Infinity;
    if (now - last < COOLDOWN_MS[name]) return;
    this.lastPlayed.set(name, now);

    const buf = this.buffers.get(name);
    if (buf) {
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const gain = this.ctx.createGain();
        gain.gain.value = Math.min(1, 0.45 + intensity * 0.55);
        src.connect(gain).connect(this.sfxBus);
        src.start();
      } catch {
        this.synth(name, intensity);
      }
      return;
    }
    this.synth(name, intensity);
  }

  private tone(
    type: OscillatorType,
    freq: number,
    t: number,
    dur: number,
    vol: number,
    lpf: number,
    dest: AudioNode,
    slideTo?: number
  ): void {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      }
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lpf;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(filter).connect(gain).connect(dest);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {
      /* audio graph unavailable — ignore */
    }
  }

  private noiseHit(t: number, dur: number, bpf: number, vol: number, dest: AudioNode): void {
    if (!this.ctx || !this.noiseBuf) return;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = bpf;
      filter.Q.value = 0.9;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter).connect(gain).connect(dest);
      src.start(t, Math.random() * 0.3);
      src.stop(t + dur + 0.02);
    } catch {
      /* ignore */
    }
  }

  /** Procedural fallback sounds — the game is fully audible with zero files. */
  private synth(name: SfxName, intensity: number): void {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    const bus = this.sfxBus;
    const v = Math.min(1, 0.5 + intensity * 0.5);

    switch (name) {
      case 'flipper':
        this.tone('square', 180, t, 0.07, 0.2, 1200, bus, 80);
        this.noiseHit(t, 0.03, 3200, 0.1, bus);
        break;
      case 'bumper':
        this.tone('sine', 560, t, 0.14, 0.45 * v, 3000, bus, 150);
        this.tone('square', 840, t, 0.06, 0.1, 4000, bus, 320);
        this.noiseHit(t, 0.05, 5200, 0.12, bus);
        break;
      case 'target':
        this.tone('triangle', 780, t, 0.1, 0.24, 6000, bus, 1180);
        break;
      case 'sling':
        this.noiseHit(t, 0.08, 900, 0.34, bus);
        this.tone('sine', 240, t, 0.1, 0.28, 1000, bus, 90);
        break;
      case 'launch':
        this.tone('square', 140, t, 0.3, 0.3, 2400, bus, 900);
        this.tone('sine', 90, t, 0.28, 0.25, 800, bus, 480);
        break;
      case 'drain':
        this.tone('sawtooth', 320, t, 0.45, 0.28, 1600, bus, 60);
        break;
      case 'gameover':
        [64, 60, 57, 52, 45].forEach((note, i) => {
          this.tone('triangle', midi(note), t + i * 0.17, 0.24, 0.26, 3000, bus);
          this.tone('sine', midi(note - 12), t + i * 0.17, 0.24, 0.17, 1200, bus);
        });
        break;
      case 'orbit':
        this.noiseHit(t, 0.3, 1400, 0.22, bus);
        this.tone('sine', 300, t, 0.3, 0.2, 4000, bus, 1200);
        this.tone('triangle', 660, t + 0.05, 0.24, 0.16, 5000, bus, 1320);
        break;
      case 'ramp':
        this.tone('sine', 320, t, 0.2, 0.28, 5000, bus, 1250);
        this.tone('triangle', 1240, t + 0.1, 0.22, 0.2, 6000, bus);
        break;
      case 'spinner':
        this.tone('triangle', 1100, t, 0.07, 0.16, 6000, bus, 1600);
        break;
      case 'lane':
        this.tone('triangle', 880, t, 0.12, 0.2, 6000, bus, 1320);
        break;
      case 'lock':
        this.tone('square', 260, t, 0.12, 0.2, 2000, bus, 180);
        this.tone('triangle', 1040, t + 0.08, 0.16, 0.16, 5000, bus);
        break;
      case 'jackpot':
        [72, 76, 79, 84, 88].forEach((note, i) =>
          this.tone('square', midi(note), t + i * 0.075, 0.16, 0.18, 5000, bus)
        );
        break;
      case 'multiball':
        [55, 62, 67, 74].forEach((note, i) => {
          this.tone('triangle', midi(note), t + i * 0.1, 0.22, 0.22, 4000, bus);
        });
        break;
      case 'stage': {
        const notes = [72, 76, 79, 84];
        notes.forEach((note, i) => this.tone('triangle', midi(note), t + i * 0.11, 0.3, 0.24, 6000, bus));
        break;
      }
      case 'extra':
        [79, 84, 88].forEach((note, i) => this.tone('sine', midi(note), t + i * 0.09, 0.24, 0.22, 6000, bus));
        break;
      case 'save':
        this.tone('triangle', 784, t, 0.14, 0.26, 5000, bus);
        this.tone('triangle', 1318, t + 0.09, 0.2, 0.26, 6000, bus);
        break;
      case 'click':
        this.tone('square', 1000, t, 0.035, 0.12, 5000, bus, 500);
        break;
    }
  }
}
