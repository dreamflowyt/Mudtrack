import { MATERIALS, MAT_ID } from '../data/materials';
import { MaterialDef } from '../types';

export { MATERIALS, MAT_ID };

export const MAT_BY_ID: MaterialDef[] = [];
for (let i = 0; i < 256; i++) {
  MAT_BY_ID[i] = MATERIALS[0]; // fallback to AIR
}
for (const m of MATERIALS) {
  MAT_BY_ID[m.id] = m;
}

export function isSolid(matId: number): boolean {
  return MAT_BY_ID[matId].cls === 'SOLID';
}

export function isLiquid(matId: number): boolean {
  return MAT_BY_ID[matId].cls === 'LIQUID';
}

export function isGranular(matId: number): boolean {
  return MAT_BY_ID[matId].cls === 'GRANULAR';
}

export function isViscous(matId: number): boolean {
  return MAT_BY_ID[matId].cls === 'VISCOUS';
}

export function isHookable(matId: number): boolean {
  return MAT_BY_ID[matId].hookable;
}
