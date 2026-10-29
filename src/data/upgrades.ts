import { UpgradeDef } from '../types';

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'engine',
    name: 'Engine Tune',
    desc: 'Increases combustion engine peak torque output',
    tiers: [
      { cost: 250, peakTorqueMult: 1.12 },
      { cost: 600, peakTorqueMult: 1.25 },
      { cost: 1200, peakTorqueMult: 1.40 },
    ],
  },
  {
    id: 'tires',
    name: 'All-Terrain Tires',
    desc: 'Improves traction on mud/sand and reduces sink depth',
    tiers: [
      { cost: 200, softGripMult: 1.10, sinkMult: 0.92 },
      { cost: 500, softGripMult: 1.20, sinkMult: 0.85 },
      { cost: 1000, softGripMult: 1.30, sinkMult: 0.78 },
    ],
  },
  {
    id: 'battery',
    name: 'Battery Pack',
    desc: 'Expands battery storage capacity for electric driving',
    tiers: [
      { cost: 200, capAdd: 30 },
      { cost: 500, capAdd: 60 },
      { cost: 1000, capAdd: 100 },
    ],
  },
  {
    id: 'fording',
    name: 'Fording Kit (Snorkel & Seals)',
    desc: 'Raises air intake and reinforces cabin water seals',
    tiers: [
      { cost: 300, intakeRaise_m: 0.45, floodMult: 0.85 },
      { cost: 700, intakeRaise_m: 0.85, floodMult: 0.70 },
      { cost: 1300, intakeRaise_m: 1.25, floodMult: 0.55 },
    ],
  },
  {
    id: 'tank',
    name: 'Fuel Tank',
    desc: 'Expands fuel reservoir volume for longer hauls',
    tiers: [
      { cost: 150, fuelAdd: 10 },
      { cost: 350, fuelAdd: 20 },
      { cost: 700, fuelAdd: 35 },
    ],
  },
  {
    id: 'winch',
    name: 'Winch & Reinforced Cable',
    desc: 'Longer cable reach, higher break tension, and stronger winch pull',
    tiers: [
      { cost: 250, ropeAdd_m: 4, tensionMult: 1.20, winchForceMult: 1.15 },
      { cost: 600, ropeAdd_m: 8, tensionMult: 1.40, winchForceMult: 1.30 },
      { cost: 1100, ropeAdd_m: 12, tensionMult: 1.60, winchForceMult: 1.45 },
    ],
  },
];

export const TIRE_PRESETS = {
  Low: { softGrip: 1.20, hardGrip: 0.90, sinkDepth: 0.80 },
  Normal: { softGrip: 1.00, hardGrip: 1.00, sinkDepth: 1.00 },
  High: { softGrip: 0.85, hardGrip: 1.05, sinkDepth: 1.15 },
} as const;
