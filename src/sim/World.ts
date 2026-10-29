import { CPM, GLOBALS } from '../data/globals';
import { MAT_ID } from '../data/materials';
import { Rng } from '../core/Rng';
import { LevelEntity } from '../types';

export interface Chunk {
  cx: number;
  cy: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  idle: number;
  sleeping: boolean;
  dirtyCollision: boolean;
}

export class World {
  public readonly widthM: number;
  public readonly heightM: number;
  public readonly gridW: number;
  public readonly gridH: number;

  public mat: Uint8Array;
  public aux: Uint8Array;

  // Pristine snapshot after pre-settle
  private snapshotMat: Uint8Array | null = null;
  private snapshotAux: Uint8Array | null = null;

  public chunks: Chunk[] = [];
  public chunkCountX: number;
  public chunkCountY: number;
  public awakeChunks: Chunk[] = [];

  public tick: number = 0;
  public rng: Rng;

  public entities: LevelEntity[] = [];

  // Queued edits for deterministic simulation
  private queuedEdits: Array<{ idx: number; mat: number; aux: number }> = [];

  constructor(widthM: number, heightM: number, seed: number = 12345) {
    this.widthM = widthM;
    this.heightM = heightM;
    this.gridW = Math.floor(widthM * CPM);
    this.gridH = Math.floor(heightM * CPM);

    const totalCells = this.gridW * this.gridH;
    this.mat = new Uint8Array(totalCells);
    this.aux = new Uint8Array(totalCells);

    this.rng = new Rng(seed);

    this.chunkCountX = Math.ceil(this.gridW / GLOBALS.chunk);
    this.chunkCountY = Math.ceil(this.gridH / GLOBALS.chunk);

    this.initChunks();
  }

  private initChunks(): void {
    this.chunks = [];
    for (let cy = 0; cy < this.chunkCountY; cy++) {
      for (let cx = 0; cx < this.chunkCountX; cx++) {
        const x0 = cx * GLOBALS.chunk;
        const y0 = cy * GLOBALS.chunk;
        const x1 = Math.min(x0 + GLOBALS.chunk, this.gridW);
        const y1 = Math.min(y0 + GLOBALS.chunk, this.gridH);
        const chunk: Chunk = {
          cx,
          cy,
          x0,
          y0,
          x1,
          y1,
          idle: 0,
          sleeping: false,
          dirtyCollision: true,
        };
        this.chunks.push(chunk);
        this.awakeChunks.push(chunk);
      }
    }
  }

  public cellX(xM: number): number {
    return Math.max(0, Math.min(this.gridW - 1, Math.floor(xM * CPM)));
  }

  public cellY(yM: number): number {
    return Math.max(0, Math.min(this.gridH - 1, this.gridH - 1 - Math.floor(yM * CPM)));
  }

  public worldX(cx: number): number {
    return (cx + 0.5) / CPM;
  }

  public worldY(cy: number): number {
    return (this.gridH - 1 - cy + 0.5) / CPM;
  }

  public getSurfaceHeightM(xM: number, sampleRadiusM: number = 2.0): number {
    const minCX = this.cellX(xM - sampleRadiusM);
    const maxCX = this.cellX(xM + sampleRadiusM);
    let highestSurfaceYM = 0;

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = 0; cy < this.gridH; cy++) {
        const idx = cy * this.gridW + cx;
        const m = this.mat[idx];
        if (m !== MAT_ID.AIR && m !== MAT_ID.WATER) {
          const ym = this.worldY(cy);
          if (ym > highestSurfaceYM) {
            highestSurfaceYM = ym;
          }
          break;
        }
      }
    }

    return highestSurfaceYM;
  }

  public getIndex(cx: number, cy: number): number {
    return cy * this.gridW + cx;
  }

  public getChunk(cx: number, cy: number): Chunk | null {
    if (cx < 0 || cx >= this.chunkCountX || cy < 0 || cy >= this.chunkCountY) return null;
    return this.chunks[cy * this.chunkCountX + cx];
  }

  public getChunkAtCell(cellX: number, cellY: number): Chunk | null {
    const cx = Math.floor(cellX / GLOBALS.chunk);
    const cy = Math.floor(cellY / GLOBALS.chunk);
    return this.getChunk(cx, cy);
  }

  public wakeChunkAtCell(cellX: number, cellY: number): void {
    const cx = Math.floor(cellX / GLOBALS.chunk);
    const cy = Math.floor(cellY / GLOBALS.chunk);
    this.wakeChunk(cx, cy);

    // If near border, wake neighboring chunk
    const localX = cellX % GLOBALS.chunk;
    const localY = cellY % GLOBALS.chunk;
    if (localX === 0 && cx > 0) this.wakeChunk(cx - 1, cy);
    if (localX === GLOBALS.chunk - 1 && cx < this.chunkCountX - 1) this.wakeChunk(cx + 1, cy);
    if (localY === 0 && cy > 0) this.wakeChunk(cx, cy - 1);
    if (localY === GLOBALS.chunk - 1 && cy < this.chunkCountY - 1) this.wakeChunk(cx, cy + 1);
  }

  public wakeChunk(cx: number, cy: number): void {
    const chunk = this.getChunk(cx, cy);
    if (!chunk) return;
    chunk.idle = 0;
    chunk.dirtyCollision = true;
    if (chunk.sleeping) {
      chunk.sleeping = false;
      this.awakeChunks.push(chunk);
    }
  }

  public sleepChunk(chunk: Chunk): void {
    if (chunk.sleeping) return;
    chunk.sleeping = true;
    const idx = this.awakeChunks.indexOf(chunk);
    if (idx !== -1) {
      this.awakeChunks.splice(idx, 1);
    }
  }

  public setCell(cx: number, cy: number, matId: number, colorVar: number = 0): void {
    if (cx < 0 || cx >= this.gridW || cy < 0 || cy >= this.gridH) return;
    const idx = cy * this.gridW + cx;
    this.mat[idx] = matId;
    this.aux[idx] = (colorVar & 7) | (3 << 4); // motion = 3
    this.wakeChunkAtCell(cx, cy);
  }

  public queueEdit(cx: number, cy: number, matId: number, colorVar: number = 0): void {
    if (cx < 0 || cx >= this.gridW || cy < 0 || cy >= this.gridH) return;
    const idx = cy * this.gridW + cx;
    this.queuedEdits.push({ idx, mat: matId, aux: (colorVar & 7) | (3 << 4) });
  }

  public applyQueuedEdits(): void {
    if (this.queuedEdits.length === 0) return;
    for (let i = 0; i < this.queuedEdits.length; i++) {
      const edit = this.queuedEdits[i];
      this.mat[edit.idx] = edit.mat;
      this.aux[edit.idx] = edit.aux;
      const cx = edit.idx % this.gridW;
      const cy = Math.floor(edit.idx / this.gridW);
      this.wakeChunkAtCell(cx, cy);
    }
    this.queuedEdits.length = 0;
  }

  public takeSnapshot(): void {
    this.snapshotMat = new Uint8Array(this.mat);
    this.snapshotAux = new Uint8Array(this.aux);
  }

  public restoreSnapshot(): void {
    if (!this.snapshotMat || !this.snapshotAux) return;
    this.mat.set(this.snapshotMat);
    this.aux.set(this.snapshotAux);
    this.tick = 0;
    this.awakeChunks = [];
    for (const c of this.chunks) {
      c.idle = 0;
      c.sleeping = false;
      c.dirtyCollision = true;
      this.awakeChunks.push(c);
    }
  }

  public getCell(cx: number, cy: number): { mat: number; aux: number } {
    if (cx < 0 || cx >= this.gridW || cy < 0 || cy >= this.gridH) {
      return { mat: MAT_ID.ROCK, aux: 0 };
    }
    const idx = cy * this.gridW + cx;
    return { mat: this.mat[idx], aux: this.aux[idx] };
  }
}
