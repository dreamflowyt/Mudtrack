/**
 * SANDHAUL - Common Types
 */

export type MaterialClass = 'EMPTY' | 'SOLID' | 'GRANULAR' | 'VISCOUS' | 'LIQUID';

export interface MaterialDef {
  id: number;
  name: string;
  cls: MaterialClass;
  density: number;
  grip?: number;
  hookable: boolean;
  sinkDepth_m?: number;
  dragK?: number;
  digRate?: number;
  flowChance?: number;
  diagChance?: number;
  dispersion?: number;
  alpha?: number;
  palette: string[];
}

export interface UpgradeTier {
  cost: number;
  peakTorqueMult?: number;
  softGripMult?: number;
  sinkMult?: number;
  capAdd?: number;
  intakeRaise_m?: number;
  floodMult?: number;
  fuelAdd?: number;
  ropeAdd_m?: number;
  tensionMult?: number;
  winchForceMult?: number;
}

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  tiers: UpgradeTier[];
}

export interface CargoDef {
  id: string;
  name: string;
  crateMassKg: number;
  hitThresholdNs: number;
  damagePerNsOver: number;
  waterDamagePerSec: number;
  buoyancyFactor: number;
  color: string;
}

export interface LevelEntity {
  type: 'start' | 'finish' | 'depot' | 'anchor' | 'hint';
  x_m: number;
  kind?: string;
  aboveGround_m?: number;
  radius_m?: number;
  text?: string;
}

export interface TerrainFeature {
  type: 'hill' | 'valley' | 'cliff_step' | 'sand_patch' | 'dune_field' | 'mud_pit' | 'river' | 'flooded_tunnel' | 'rock_outcrop' | 'boulder' | 'wood_bridge';
  x_m: number;
  width_m: number;
  height_m?: number;
  depth_m?: number;
  maxSlopeDeg?: number;
  bankSlopeDeg?: number;
}

export interface LevelDef {
  id: string;
  name: string;
  seed: number;
  size_m: { w: number; h: number };
  cargo: { type: string; count: number };
  basePay: number;
  parTime_s: number;
  start: { fuelPct: number; batteryPct: number };
  terrain: {
    baselineY_m: number;
    noise: { octaves: number; amplitude_m: number; wavelength_m: number };
    layers: Array<{ material: string; thickness_m?: number; fillToBottom?: boolean }>;
  };
  features: TerrainFeature[];
  entities: LevelEntity[];
}

export interface GameSaveData {
  version: number;
  coins: number;
  upgrades: Record<string, number>;
  levels: Record<string, { stars: number; bestTime: number | null }>;
  settings: {
    musicVol: number;
    sfxVol: number;
    showDebug: boolean;
  };
}

export type DriveMode = 'AUTO' | 'ELECTRIC' | 'NO POWER';
export type EngineState = 'RUNNING' | 'STALLED' | 'RESTARTING';
export type HookState = 'IDLE' | 'FLYING' | 'ATTACHED' | 'MISS_RETRACT' | 'COOLDOWN';
export type TirePressure = 'Low' | 'Normal' | 'High';
