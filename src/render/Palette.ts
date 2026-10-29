import { MATERIALS, GRASS_PALETTE } from '../data/materials';

function hexToAbgr(hex: string, alpha: number = 255): number {
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (hex.length === 8) {
    // #RRGGBBAA
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = parseInt(hex.slice(6, 8), 16);
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return ((alpha << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

// Precomputed 32-bit colors for each material and its color variation index
export const MAT_COLOR_U32: number[][] = [];

for (let m = 0; m < 256; m++) {
  MAT_COLOR_U32[m] = [];
  const def = MATERIALS[m];
  if (!def || def.cls === 'EMPTY') {
    for (let v = 0; v < 8; v++) MAT_COLOR_U32[m][v] = 0;
  } else {
    const alphaByte = def.alpha !== undefined ? Math.round(def.alpha * 255) : 255;
    const pal = def.palette;
    for (let v = 0; v < 8; v++) {
      const colorHex = pal[v % pal.length];
      MAT_COLOR_U32[m][v] = hexToAbgr(colorHex, alphaByte);
    }
  }
}

// Grass colors for top layer of dirt
export const GRASS_COLOR_U32 = GRASS_PALETTE.map((c) => hexToAbgr(c, 255));
// Water surface shimmer color
export const WATER_SURFACE_U32 = hexToAbgr('#9CCBFF', 220);
