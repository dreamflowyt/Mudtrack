export const GLOBALS = {
  cellsPerMeter: 16,
  view: { w: 480, h: 270 },
  gravity: 9.81,
  fixedDt: 1 / 60,
  velocityIterations: 8,
  positionIterations: 3,
  chunk: 32,
  sim: {
    activeMarginChunks: 3,
    sleepAfterIdleTicks: 30,
    preSettleTicks: 300,
    maxParticles: 1024,
    sinkChance: 0.6,
  },
  collision: {
    radius_m: 20,
    hysteresis_m: 4,
    simplifyEpsilonCells: 0.6,
    maxChunkRebuildsPerFrame: 6,
    maxRebuildMs: 1.5,
  },
  camera: {
    lookAheadSec: 0.5,
    smooth: 0.15,
    verticalBiasCells: -20,
    snapToCells: true,
  },
  fail: {
    fallBelow_m: -10,
  },
} as const;

export const CPM = GLOBALS.cellsPerMeter;
