import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bestScore,
  completeStage,
  insertHiScore,
  loadHiScores,
  loadPlayerName,
  loadPrefs,
  loadProgress,
  qualifies,
  resetProgress,
  savePlayerName,
  savePrefs,
  saveHiScores,
} from '../src/game/storage';
import { HISCORE_KEY, PROGRESS_KEY } from '../src/game/constants';

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage());
});

describe('high scores', () => {
  it('returns an empty list when nothing is stored', () => {
    expect(loadHiScores()).toEqual([]);
    expect(bestScore()).toBe(0);
  });

  it('survives corrupt JSON', () => {
    localStorage.setItem(HISCORE_KEY, '{not json');
    expect(loadHiScores()).toEqual([]);
    localStorage.setItem(HISCORE_KEY, '"a string"');
    expect(loadHiScores()).toEqual([]);
  });

  it('filters invalid entries and sorts descending', () => {
    localStorage.setItem(
      HISCORE_KEY,
      JSON.stringify([
        { name: 'Low', score: 100, date: 1 },
        { name: 'High', score: 9000, date: 2 },
        { name: 'Bad', score: 'nope', date: 3 },
        null,
        { name: 'Zero', score: 0, date: 4 },
      ])
    );
    const list = loadHiScores();
    expect(list.map((entry) => entry.name)).toEqual(['High', 'Low']);
  });

  it('caps the table at ten entries', () => {
    saveHiScores(
      Array.from({ length: 25 }, (_, i) => ({ name: `P${i}`, score: 1000 - i, date: i }))
    );
    expect(loadHiScores()).toHaveLength(10);
    expect(loadHiScores()[0].score).toBe(1000);
  });

  it('qualifies only scores that beat the table', () => {
    expect(qualifies(100)).toBe(true);
    expect(qualifies(0)).toBe(false);
    saveHiScores(
      Array.from({ length: 10 }, (_, i) => ({ name: `P${i}`, score: 1000 - i * 10, date: i }))
    );
    expect(qualifies(905)).toBe(false);
    expect(qualifies(1100)).toBe(true);
  });

  it('inserts a score and reports its rank', () => {
    saveHiScores([{ name: 'Ace', score: 500, date: 1 }]);
    const rank = insertHiScore('  Nova  ', 750);
    expect(rank).toBe(0);
    expect(loadHiScores()[0]).toMatchObject({ name: 'Nova', score: 750 });
    expect(insertHiScore('Zero', 0)).toBe(-1);
  });
});

describe('progress', () => {
  it('defaults to stage 1 unlocked', () => {
    const progress = loadProgress();
    expect(progress.unlocked).toBe(1);
    expect(progress.completed).toEqual([]);
  });

  it('handles corrupt or legacy data without throwing', () => {
    localStorage.setItem(PROGRESS_KEY, 'not json');
    expect(loadProgress().unlocked).toBe(1);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ unlocked: 'many', best: [], completed: 'x' }));
    const progress = loadProgress();
    expect(progress.unlocked).toBe(1);
    expect(progress.best).toEqual({});
    expect(progress.completed).toEqual([]);
  });

  it('unlocks the next stage and records the best score', () => {
    const after = completeStage(1, 12345);
    expect(after.unlocked).toBe(2);
    expect(after.completed).toContain(1);
    expect(after.best[1]).toBe(12345);

    const again = completeStage(1, 900);
    expect(again.best[1]).toBe(12345);
  });

  it('never unlocks beyond stage 50', () => {
    const progress = completeStage(50, 5000);
    expect(progress.unlocked).toBe(50);
  });

  it('resets progress safely', () => {
    completeStage(3, 100);
    const fresh = resetProgress();
    expect(fresh.unlocked).toBe(1);
    expect(fresh.completed).toEqual([]);
  });
});

describe('preferences and player name', () => {
  it('falls back to defaults for corrupt prefs', () => {
    localStorage.setItem('spb_prefs_v2', '<<<');
    expect(loadPrefs()).toEqual({ musicMuted: false, sfxMuted: false, reducedMotion: false, volume: 0.8 });
  });

  it('round-trips preferences', () => {
    savePrefs({ musicMuted: true, sfxMuted: false, reducedMotion: true, volume: 0.5 });
    expect(loadPrefs()).toEqual({ musicMuted: true, sfxMuted: false, reducedMotion: true, volume: 0.5 });
  });

  it('sanitises the remembered player name', () => {
    savePlayerName('  Nova\u0000  ');
    expect(loadPlayerName()).toBe('Nova');
    savePlayerName('   ');
    expect(loadPlayerName()).toBe('Nova');
    expect(loadPlayerName()).toHaveLength(4);
  });
});

describe('storage failures', () => {
  it('does not throw when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(loadHiScores()).toEqual([]);
    expect(() => saveHiScores([{ name: 'A', score: 1, date: 1 }])).not.toThrow();
    expect(loadProgress().unlocked).toBe(1);
  });
});
