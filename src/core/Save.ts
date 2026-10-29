import { GameSaveData } from '../types';

const SAVE_KEY = 'sandhaul.save.v1';

const DEFAULT_SAVE: GameSaveData = {
  version: 1,
  coins: 0,
  upgrades: {
    engine: 0,
    tires: 0,
    battery: 0,
    fording: 0,
    tank: 0,
    winch: 0,
  },
  levels: {
    L1_farm_road: { stars: 0, bestTime: null },
  },
  settings: {
    musicVol: 0.6,
    sfxVol: 0.8,
    showDebug: false,
  },
};

export class SaveSystem {
  public static load(): GameSaveData {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1) {
          return {
            ...DEFAULT_SAVE,
            ...parsed,
            upgrades: { ...DEFAULT_SAVE.upgrades, ...(parsed.upgrades || {}) },
            levels: { ...DEFAULT_SAVE.levels, ...(parsed.levels || {}) },
            settings: { ...DEFAULT_SAVE.settings, ...(parsed.settings || {}) },
          };
        }
      }
    } catch (e) {
      console.warn('Failed to load save from localStorage', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_SAVE));
  }

  public static save(data: GameSaveData): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to write save to localStorage', e);
    }
  }

  public static reset(): GameSaveData {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {
      console.warn('Failed to clear save', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_SAVE));
  }
}
