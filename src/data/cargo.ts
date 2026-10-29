import { CargoDef } from '../types';

export const CARGO_TYPES: Record<string, CargoDef> = {
  bricks: {
    id: 'bricks',
    name: 'Brick Pallets',
    crateMassKg: 70,
    hitThresholdNs: 180,
    damagePerNsOver: 0.04,
    waterDamagePerSec: 0.0,
    buoyancyFactor: 0.0,
    color: '#B5532F',
  },
  eggs: {
    id: 'eggs',
    name: 'Egg Crates',
    crateMassKg: 25,
    hitThresholdNs: 50,
    damagePerNsOver: 0.12,
    waterDamagePerSec: 1.0,
    buoyancyFactor: 0.05,
    color: '#F2E3B3',
  },
  medical: {
    id: 'medical',
    name: 'Medical Supplies',
    crateMassKg: 30,
    hitThresholdNs: 80,
    damagePerNsOver: 0.08,
    waterDamagePerSec: 3.0,
    buoyancyFactor: 0.05,
    color: '#E8F4F8',
  },
};
