import { World, Chunk } from './World';
import { MAT_ID } from '../data/materials';
import { MAT_BY_ID, isSolid } from './Materials';
import { GLOBALS } from '../data/globals';

export class CellSim {
  public activeChunkMinX: number = 0;
  public activeChunkMaxX: number = 0;
  public activeChunkMinY: number = 0;
  public activeChunkMaxY: number = 0;

  public updateActiveRegion(camCenterXM: number, camCenterYM: number, viewHalfWidthM: number, viewHalfHeightM: number, world: World): void {
    const marginM = GLOBALS.sim.activeMarginChunks * (GLOBALS.chunk / GLOBALS.cellsPerMeter);
    const minXM = Math.max(0, camCenterXM - viewHalfWidthM - marginM);
    const maxXM = Math.min(world.widthM, camCenterXM + viewHalfWidthM + marginM);
    const minYM = Math.max(0, camCenterYM - viewHalfHeightM - marginM);
    const maxYM = Math.min(world.heightM, camCenterYM + viewHalfHeightM + marginM);

    const minCellX = world.cellX(minXM);
    const maxCellX = world.cellX(maxXM);
    // Remember grid Y is inverted
    const minCellY = world.cellY(maxYM);
    const maxCellY = world.cellY(minYM);

    this.activeChunkMinX = Math.floor(minCellX / GLOBALS.chunk);
    this.activeChunkMaxX = Math.floor(maxCellX / GLOBALS.chunk);
    this.activeChunkMinY = Math.floor(minCellY / GLOBALS.chunk);
    this.activeChunkMaxY = Math.floor(maxCellY / GLOBALS.chunk);
  }

  public step(world: World, ignoreActiveCulling: boolean = false): void {
    world.applyQueuedEdits();

    world.tick++;
    const par = world.tick & 1;
    const flip = (world.tick & 2) !== 0;
    const W = world.gridW;
    const H = world.gridH;
    const mat = world.mat;
    const aux = world.aux;
    const rng = world.rng;

    // Filter awake chunks in active region, sort lowest (highest Y) first
    const chunksToStep: Chunk[] = [];
    for (let i = 0; i < world.awakeChunks.length; i++) {
      const c = world.awakeChunks[i];
      if (
        ignoreActiveCulling ||
        (c.cx >= this.activeChunkMinX &&
          c.cx <= this.activeChunkMaxX &&
          c.cy >= this.activeChunkMinY &&
          c.cy <= this.activeChunkMaxY)
      ) {
        chunksToStep.push(c);
      }
    }

    chunksToStep.sort((a, b) => b.cy - a.cy);

    for (let ci = 0; ci < chunksToStep.length; ci++) {
      const c = chunksToStep[ci];
      let movedInChunk = false;

      for (let y = c.y1 - 1; y >= c.y0; y--) {
        const rowOffset = y * W;
        for (let i = 0; i < GLOBALS.chunk; i++) {
          const x = flip ? c.x1 - 1 - i : c.x0 + i;
          if (x < c.x0 || x >= c.x1) continue;

          const idx = rowOffset + x;
          const m = mat[idx];
          if (m === MAT_ID.AIR || isSolid(m)) continue;

          // Parity check (already handled this tick)
          if (((aux[idx] >> 3) & 1) === par) continue;

          // Motion counter decay (bits 4-5)
          const motion = (aux[idx] >> 4) & 3;
          if (motion > 0) {
            aux[idx] = (aux[idx] & ~(3 << 4)) | ((motion - 1) << 4);
          }

          // Step this cell
          if (this.stepCell(world, x, y, idx, m, par, W, H)) {
            movedInChunk = true;
          }
        }
      }

      if (movedInChunk) {
        c.idle = 0;
        c.dirtyCollision = true;
      } else {
        c.idle++;
        if (c.idle > GLOBALS.sim.sleepAfterIdleTicks) {
          world.sleepChunk(c);
        }
      }
    }
  }

  private stepCell(
    world: World,
    x: number,
    y: number,
    idx: number,
    m: number,
    par: number,
    W: number,
    H: number
  ): boolean {
    const p = MAT_BY_ID[m];
    const rng = world.rng;

    // Viscous flow reluctance
    if (p.cls === 'VISCOUS' && p.flowChance !== undefined && rng.next() > p.flowChance) {
      this.markStay(world, idx, par);
      return false;
    }

    // 1. Move straight down
    if (y + 1 < H) {
      const downIdx = idx + W;
      if (this.canEnter(world, m, downIdx)) {
        this.swap(world, idx, downIdx, par);
        return true;
      }
    } else {
      this.markStay(world, idx, par);
      return false;
    }

    // 2. Diagonal moves
    const dir = rng.bit() ? 1 : -1;
    const diagChance = p.diagChance ?? 0.8;
    if (rng.next() < diagChance) {
      // First diagonal
      const d1x = x + dir;
      if (d1x >= 0 && d1x < W && y + 1 < H) {
        const d1Idx = idx + W + dir;
        if (this.canEnter(world, m, d1Idx)) {
          this.swap(world, idx, d1Idx, par);
          return true;
        }
      }
      // Opposite diagonal
      const d2x = x - dir;
      if (d2x >= 0 && d2x < W && y + 1 < H) {
        const d2Idx = idx + W - dir;
        if (this.canEnter(world, m, d2Idx)) {
          this.swap(world, idx, d2Idx, par);
          return true;
        }
      }
    }

    // 3. Liquid horizontal spreading
    if (p.cls === 'LIQUID') {
      const dispersion = p.dispersion ?? 4;
      for (const d of [dir, -dir]) {
        let targetX = x;
        for (let k = 1; k <= dispersion; k++) {
          const testX = x + d * k;
          if (testX < 0 || testX >= W) break;
          const targetIdx = y * W + testX;
          if (!this.canEnter(world, m, targetIdx)) break;
          targetX = testX;
        }
        if (targetX !== x) {
          this.swap(world, idx, y * W + targetX, par);
          return true;
        }
      }
    }

    // 4. Sand + Water -> Mud conversion rule (§5.5)
    if (m === MAT_ID.SAND || m === MAT_ID.DIRT) {
      if (rng.next() < 0.0008) {
        const neighbors = [idx - 1, idx + 1, idx - W, idx + W];
        for (const n of neighbors) {
          if (n >= 0 && n < world.mat.length && world.mat[n] === MAT_ID.WATER) {
            world.mat[idx] = MAT_ID.MUD;
            world.aux[idx] = (world.aux[idx] & 7) | (3 << 4);
            if (rng.next() < 0.4) {
              world.mat[n] = MAT_ID.AIR;
              world.aux[n] = 0;
            }
            world.wakeChunkAtCell(x, y);
            return true;
          }
        }
      }
    }

    this.markStay(world, idx, par);
    return false;
  }

  private canEnter(world: World, myMat: number, targetIdx: number): boolean {
    const targetMat = world.mat[targetIdx];
    if (targetMat === MAT_ID.AIR) return true;

    // Density displacement: sinking through lighter liquid
    const myDensity = MAT_BY_ID[myMat].density;
    const targetDef = MAT_BY_ID[targetMat];
    if (targetDef.cls === 'LIQUID' && myDensity > targetDef.density) {
      return world.rng.next() < GLOBALS.sim.sinkChance;
    }
    return false;
  }

  private swap(world: World, idxA: number, idxB: number, par: number): void {
    const matA = world.mat[idxA];
    const auxA = world.aux[idxA];
    const matB = world.mat[idxB];
    const auxB = world.aux[idxB];

    // Swap materials
    world.mat[idxA] = matB;
    world.mat[idxB] = matA;

    // Preserve color variation (bits 0-2), set processed parity (bit 3), set motion=3 (bits 4-5)
    const newAuxA = (auxB & 7) | (par << 3) | (3 << 4);
    const newAuxB = (auxA & 7) | (par << 3) | (3 << 4);

    world.aux[idxA] = newAuxA;
    world.aux[idxB] = newAuxB;

    const xA = idxA % world.gridW;
    const yA = Math.floor(idxA / world.gridW);
    const xB = idxB % world.gridW;
    const yB = Math.floor(idxB / world.gridW);

    world.wakeChunkAtCell(xA, yA);
    world.wakeChunkAtCell(xB, yB);
  }

  private markStay(world: World, idx: number, par: number): void {
    world.aux[idx] = (world.aux[idx] & ~(1 << 3)) | (par << 3);
  }
}
