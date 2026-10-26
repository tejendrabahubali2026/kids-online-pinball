/**
 * localStorage persistence: high scores, stage progress, preferences and the
 * remembered player name.
 *
 * Every reader is defensive: corrupt, truncated or legacy data is discarded
 * instead of throwing, so the game still boots with damaged storage.
 */
import {
  HISCORE_KEY,
  HISCORE_MAX,
  MAX_SCORE,
  PLAYER_NAME_KEY,
  PLAYER_NAME_MAX,
  PREFS_KEY,
  PROGRESS_KEY,
  STAGE_COUNT,
} from './constants';
import { clamp, readLocal, writeLocal } from './util';
import { sanitizeName } from '../shared/leaderboard';

export interface HiScore {
  name: string;
  score: number;
  date: number;
}

export interface Progress {
  /** Highest unlocked stage id (1-based). Always >= 1. */
  unlocked: number;
  /** Best score per stage id. */
  best: Record<number, number>;
  /** Stage ids the player has completed. */
  completed: number[];
}

export interface Prefs {
  musicMuted: boolean;
  sfxMuted: boolean;
  reducedMotion: boolean;
  volume: number;
}

const DEFAULT_PROGRESS: Progress = { unlocked: 1, best: {}, completed: [] };
const DEFAULT_PREFS: Prefs = { musicMuted: false, sfxMuted: false, reducedMotion: false, volume: 0.8 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSafeScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return clamp(Math.floor(value), 0, MAX_SCORE);
}

// ------------------------------------------------------------------ scores

export function loadHiScores(): HiScore[] {
  const raw = readLocal(HISCORE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const list: HiScore[] = [];
    for (const item of parsed) {
      if (!isRecord(item)) continue;
      const name = sanitizeName(item.name) ?? 'PLAYER';
      const score = toSafeScore(item.score);
      const date = typeof item.date === 'number' && Number.isFinite(item.date) ? item.date : 0;
      if (score <= 0) continue;
      list.push({ name, score, date });
    }
    return list.sort((a, b) => b.score - a.score).slice(0, HISCORE_MAX);
  } catch {
    return [];
  }
}

export function saveHiScores(list: HiScore[]): void {
  const clean = list
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, HISCORE_MAX);
  writeLocal(HISCORE_KEY, JSON.stringify(clean));
}

/** Would this score enter the local top-10 table? */
export function qualifies(score: number): boolean {
  if (!Number.isFinite(score) || score <= 0) return false;
  const list = loadHiScores();
  if (list.length < HISCORE_MAX) return true;
  return score > list[list.length - 1].score;
}

/** Insert a score and return its 0-based rank (-1 when it did not make the table). */
export function insertHiScore(name: string, score: number): number {
  const safeScore = toSafeScore(score);
  if (safeScore <= 0) return -1;
  const list = loadHiScores();
  const entry: HiScore = {
    name: sanitizeName(name) ?? 'PLAYER',
    score: safeScore,
    date: Date.now(),
  };
  list.push(entry);
  const trimmed = list.sort((a, b) => b.score - a.score).slice(0, HISCORE_MAX);
  saveHiScores(trimmed);
  return trimmed.indexOf(entry);
}

export function bestScore(): number {
  const list = loadHiScores();
  return list.length > 0 ? list[0].score : 0;
}

// ---------------------------------------------------------------- progress

export function loadProgress(): Progress {
  const raw = readLocal(PROGRESS_KEY);
  if (!raw) return { ...DEFAULT_PROGRESS, best: {}, completed: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULT_PROGRESS, best: {}, completed: [] };
    const unlockedRaw = typeof parsed.unlocked === 'number' ? parsed.unlocked : 1;
    const unlocked = clamp(Math.floor(unlockedRaw), 1, STAGE_COUNT);
    const best: Record<number, number> = {};
    if (isRecord(parsed.best)) {
      for (const [key, value] of Object.entries(parsed.best)) {
        const id = Number(key);
        if (!Number.isInteger(id) || id < 1 || id > STAGE_COUNT) continue;
        const score = toSafeScore(value);
        if (score > 0) best[id] = score;
      }
    }
    const completed: number[] = [];
    if (Array.isArray(parsed.completed)) {
      for (const value of parsed.completed) {
        if (typeof value !== 'number' || !Number.isInteger(value)) continue;
        if (value < 1 || value > STAGE_COUNT) continue;
        if (!completed.includes(value)) completed.push(value);
      }
    }
    return { unlocked, best, completed: completed.sort((a, b) => a - b) };
  } catch {
    return { ...DEFAULT_PROGRESS, best: {}, completed: [] };
  }
}

export function saveProgress(progress: Progress): void {
  writeLocal(PROGRESS_KEY, JSON.stringify(progress));
}

/** Record a stage completion, unlocking the next stage. Returns new progress. */
export function completeStage(stageId: number, stageScore: number): Progress {
  const progress = loadProgress();
  const id = clamp(Math.floor(stageId), 1, STAGE_COUNT);
  const safeScore = toSafeScore(stageScore);
  if (!progress.completed.includes(id)) progress.completed.push(id);
  progress.completed.sort((a, b) => a - b);
  progress.best[id] = Math.max(progress.best[id] ?? 0, safeScore);
  progress.unlocked = clamp(Math.max(progress.unlocked, id + 1), 1, STAGE_COUNT);
  saveProgress(progress);
  return progress;
}

export function recordStageBest(stageId: number, stageScore: number): Progress {
  const progress = loadProgress();
  const id = clamp(Math.floor(stageId), 1, STAGE_COUNT);
  const safeScore = toSafeScore(stageScore);
  progress.best[id] = Math.max(progress.best[id] ?? 0, safeScore);
  saveProgress(progress);
  return progress;
}

export function isUnlocked(stageId: number, progress = loadProgress()): boolean {
  return stageId >= 1 && stageId <= progress.unlocked;
}

export function resetProgress(): Progress {
  const fresh: Progress = { ...DEFAULT_PROGRESS, best: {}, completed: [] };
  saveProgress(fresh);
  return fresh;
}

// ------------------------------------------------------------------- prefs

export function loadPrefs(): Prefs {
  const raw = readLocal(PREFS_KEY);
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULT_PREFS };
    return {
      musicMuted: parsed.musicMuted === true,
      sfxMuted: parsed.sfxMuted === true,
      reducedMotion: parsed.reducedMotion === true,
      volume:
        typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
          ? clamp(parsed.volume, 0, 1)
          : DEFAULT_PREFS.volume,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: Prefs): void {
  writeLocal(PREFS_KEY, JSON.stringify(prefs));
}

// ------------------------------------------------------------ player name

export function loadPlayerName(): string {
  const stored = readLocal(PLAYER_NAME_KEY);
  return sanitizeName(stored) ?? '';
}

export function savePlayerName(name: string): void {
  const clean = sanitizeName(name);
  if (clean) writeLocal(PLAYER_NAME_KEY, clean);
}

export { PLAYER_NAME_MAX };
