import * as planck from 'planck';
import { World, Chunk } from './World';
import { CPM, GLOBALS } from '../data/globals';
import { MAT_BY_ID, isSolid } from './Materials';
import { MAT_ID } from '../data/materials';

export class CollisionManager {
  private physicsWorld: planck.World;
  private chunkBodies: Map<Chunk, planck.Body> = new Map();
  private boundaryBody: planck.Body | null = null;
  public tireSinkMult: number = 1.0;

  constructor(physicsWorld: planck.World) {
    this.physicsWorld = physicsWorld;
  }

  public initBoundaries(worldWidthM: number, worldHeightM: number): void {
    if (this.boundaryBody) {
      this.physicsWorld.destroyBody(this.boundaryBody);
    }
    this.boundaryBody = this.physicsWorld.createBody({
      type: 'static',
      position: planck.Vec2(0, 0),
    });

    // Floor and side walls
    const floorY = -1.0;
    const ceilY = worldHeightM + 20.0;
    const leftX = -2.0;
    const rightX = worldWidthM + 2.0;

    const verts = [
      planck.Vec2(leftX, ceilY),
      planck.Vec2(leftX, floorY),
      planck.Vec2(rightX, floorY),
      planck.Vec2(rightX, ceilY),
    ];
    this.boundaryBody.createFixture(planck.Chain(verts, false), {
      friction: 1.0,
      restitution: 0.0,
      filterCategoryBits: 1, // TERRAIN
      filterMaskBits: 2 | 4 | 8, // CHASSIS | WHEEL | CARGO
    });
  }

  /**
   * Evaluates collidability for a cell in the world grid.
   * Soft materials (sand, mud) only collide if settled and below eroded sink depth.
   */
  public isCollidableCell(world: World, cx: number, cy: number): boolean {
    if (cx < 0 || cx >= world.gridW || cy < 0 || cy >= world.gridH) return true;
    const idx = cy * world.gridW + cx;
    const m = world.mat[idx];
    if (m === MAT_ID.AIR || m === MAT_ID.WATER) return false;
    if (isSolid(m)) return true;

    // Granular or viscous
    const aux = world.aux[idx];
    const motion = (aux >> 4) & 3;
    if (motion > 0) return false; // Not settled

    const p = MAT_BY_ID[m];
    const sinkDepthM = p.sinkDepth_m ?? 0.06;
    const erosionCells = Math.round(sinkDepthM * CPM * this.tireSinkMult);

    // Scan upward in this column to see how deep this soft cell is
    let softDepth = 0;
    for (let testY = cy - 1; testY >= 0; testY--) {
      const testMat = world.mat[testY * world.gridW + cx];
      if (testMat === MAT_ID.AIR || testMat === MAT_ID.WATER) break;
      softDepth++;
      if (softDepth >= erosionCells) break;
    }

    return softDepth >= erosionCells;
  }

  /**
   * Rebuilds dirty collision chunks within chassis radius under frame budget.
   */
  public rebuildDirtyChunks(
    world: World,
    chassisXM: number,
    chassisYM: number,
    budgetMs: number = GLOBALS.collision.maxRebuildMs
  ): void {
    const startTime = performance.now();
    const activeRadiusM = GLOBALS.collision.radius_m;
    const hysteresisM = GLOBALS.collision.hysteresis_m;

    // 1. Remove distant chunk bodies (beyond activeRadius + hysteresis)
    for (const [chunk, body] of this.chunkBodies.entries()) {
      const chunkCenterXM = (chunk.x0 + chunk.x1) * 0.5 / CPM;
      const chunkCenterYM = (world.gridH - (chunk.y0 + chunk.y1) * 0.5) / CPM;
      const dx = chunkCenterXM - chassisXM;
      const dy = chunkCenterYM - chassisYM;
      const dist = Math.hypot(dx, dy);

      if (dist > activeRadiusM + hysteresisM) {
        this.physicsWorld.destroyBody(body);
        this.chunkBodies.delete(chunk);
      }
    }

    // 2. Find chunks within active radius that are dirty
    const candidates: Array<{ chunk: Chunk; dist: number }> = [];
    for (let i = 0; i < world.chunks.length; i++) {
      const c = world.chunks[i];
      const chunkCenterXM = (c.x0 + c.x1) * 0.5 / CPM;
      const chunkCenterYM = (world.gridH - (c.y0 + c.y1) * 0.5) / CPM;
      const dx = chunkCenterXM - chassisXM;
      const dy = chunkCenterYM - chassisYM;
      const dist = Math.hypot(dx, dy);

      if (dist <= activeRadiusM) {
        if (c.dirtyCollision || !this.chunkBodies.has(c)) {
          candidates.push({ chunk: c, dist });
        }
      }
    }

    // Sort closest to chassis first
    candidates.sort((a, b) => a.dist - b.dist);

    const maxRebuilds = GLOBALS.collision.maxChunkRebuildsPerFrame;
    let rebuildCount = 0;

    for (let i = 0; i < candidates.length; i++) {
      if (rebuildCount >= maxRebuilds) break;
      if (performance.now() - startTime > budgetMs) break;

      const c = candidates[i].chunk;
      this.rebuildChunk(world, c);
      c.dirtyCollision = false;
      rebuildCount++;
    }
  }

  private rebuildChunk(world: World, chunk: Chunk): void {
    // Destroy existing body if present
    const existingBody = this.chunkBodies.get(chunk);
    if (existingBody) {
      this.physicsWorld.destroyBody(existingBody);
      this.chunkBodies.delete(chunk);
    }

    // Marching squares over chunk bounds with 1-cell border
    const x0 = Math.max(0, chunk.x0 - 1);
    const x1 = Math.min(world.gridW - 1, chunk.x1);
    const y0 = Math.max(0, chunk.y0 - 1);
    const y1 = Math.min(world.gridH - 1, chunk.y1);

    const segments: Array<[number, number, number, number]> = [];

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        // Sample 4 corners
        const tl = this.isCollidableCell(world, x, y) ? 1 : 0;
        const tr = this.isCollidableCell(world, x + 1, y) ? 1 : 0;
        const br = this.isCollidableCell(world, x + 1, y + 1) ? 1 : 0;
        const bl = this.isCollidableCell(world, x, y + 1) ? 1 : 0;

        const cellCase = (tl << 3) | (tr << 2) | (br << 1) | bl;
        if (cellCase === 0 || cellCase === 15) continue;

        // Midpoint coordinates (in cells)
        const top = [x + 0.5, y];
        const right = [x + 1, y + 0.5];
        const bottom = [x + 0.5, y + 1];
        const left = [x, y + 0.5];

        switch (cellCase) {
          case 1: segments.push([bottom[0], bottom[1], left[0], left[1]]); break;
          case 2: segments.push([right[0], right[1], bottom[0], bottom[1]]); break;
          case 3: segments.push([right[0], right[1], left[0], left[1]]); break;
          case 4: segments.push([top[0], top[1], right[0], right[1]]); break;
          case 5:
            segments.push([top[0], top[1], left[0], left[1]]);
            segments.push([right[0], right[1], bottom[0], bottom[1]]);
            break;
          case 6: segments.push([top[0], top[1], bottom[0], bottom[1]]); break;
          case 7: segments.push([top[0], top[1], left[0], left[1]]); break;
          case 8: segments.push([left[0], left[1], top[0], top[1]]); break;
          case 9: segments.push([bottom[0], bottom[1], top[0], top[1]]); break;
          case 10:
            segments.push([left[0], left[1], bottom[0], bottom[1]]);
            segments.push([top[0], top[1], right[0], right[1]]);
            break;
          case 11: segments.push([right[0], right[1], top[0], top[1]]); break;
          case 12: segments.push([left[0], left[1], right[0], right[1]]); break;
          case 13: segments.push([bottom[0], bottom[1], right[0], right[1]]); break;
          case 14: segments.push([left[0], left[1], bottom[0], bottom[1]]); break;
        }
      }
    }

    if (segments.length === 0) return;

    // Connect segments into polylines
    const polylines = this.chainSegments(segments);
    if (polylines.length === 0) return;

    const body = this.physicsWorld.createBody({
      type: 'static',
      position: planck.Vec2(0, 0),
    });

    for (let i = 0; i < polylines.length; i++) {
      const rawPoly = polylines[i];
      const simplified = this.douglasPeucker(rawPoly, GLOBALS.collision.simplifyEpsilonCells);
      if (simplified.length < 2) continue;

      // Convert cells to physics world meters (remember grid y is inverted!)
      const verts: planck.Vec2[] = [];
      for (let v = 0; v < simplified.length; v++) {
        const pt = simplified[v];
        const xm = pt[0] / CPM;
        const ym = (world.gridH - pt[1]) / CPM;
        // Avoid duplicate adjacent vertices in Planck
        if (verts.length === 0 || Math.hypot(verts[verts.length - 1].x - xm, verts[verts.length - 1].y - ym) > 0.02) {
          verts.push(planck.Vec2(xm, ym));
        }
      }

      if (verts.length >= 2) {
        body.createFixture(planck.Chain(verts, false), {
          friction: 1.0,
          restitution: 0.0,
          filterCategoryBits: 1, // TERRAIN
          filterMaskBits: 2 | 4 | 8, // CHASSIS | WHEEL | CARGO
        });
      }
    }

    this.chunkBodies.set(chunk, body);
  }

  private chainSegments(segments: Array<[number, number, number, number]>): Array<Array<[number, number]>> {
    const chains: Array<Array<[number, number]>> = [];
    const eps = 0.01;

    while (segments.length > 0) {
      const seg = segments.pop()!;
      const currentChain: Array<[number, number]> = [[seg[0], seg[1]], [seg[2], seg[3]]];

      let found = true;
      while (found) {
        found = false;
        const tail = currentChain[currentChain.length - 1];
        const head = currentChain[0];

        for (let i = 0; i < segments.length; i++) {
          const s = segments[i];
          if (Math.hypot(s[0] - tail[0], s[1] - tail[1]) < eps) {
            currentChain.push([s[2], s[3]]);
            segments.splice(i, 1);
            found = true;
            break;
          } else if (Math.hypot(s[2] - tail[0], s[3] - tail[1]) < eps) {
            currentChain.push([s[0], s[1]]);
            segments.splice(i, 1);
            found = true;
            break;
          } else if (Math.hypot(s[2] - head[0], s[3] - head[1]) < eps) {
            currentChain.unshift([s[0], s[1]]);
            segments.splice(i, 1);
            found = true;
            break;
          } else if (Math.hypot(s[0] - head[0], s[1] - head[1]) < eps) {
            currentChain.unshift([s[2], s[3]]);
            segments.splice(i, 1);
            found = true;
            break;
          }
        }
      }

      if (currentChain.length >= 2) {
        chains.push(currentChain);
      }
    }

    return chains;
  }

  private douglasPeucker(points: Array<[number, number]>, epsilon: number): Array<[number, number]> {
    if (points.length <= 2) return points;

    let maxDist = 0;
    let index = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const d = this.perpendicularDistance(points[i], first, last);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }

    if (maxDist > epsilon) {
      const left = this.douglasPeucker(points.slice(0, index + 1), epsilon);
      const right = this.douglasPeucker(points.slice(index), epsilon);
      return left.slice(0, left.length - 1).concat(right);
    }
    return [first, last];
  }

  private perpendicularDistance(pt: [number, number], lineStart: [number, number], lineEnd: [number, number]): number {
    const dx = lineEnd[0] - lineStart[0];
    const dy = lineEnd[1] - lineStart[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(pt[0] - lineStart[0], pt[1] - lineStart[1]);

    const num = Math.abs(dy * pt[0] - dx * pt[1] + lineEnd[0] * lineStart[1] - lineEnd[1] * lineStart[0]);
    return num / Math.sqrt(lenSq);
  }

  public clear(): void {
    for (const body of this.chunkBodies.values()) {
      this.physicsWorld.destroyBody(body);
    }
    this.chunkBodies.clear();
    if (this.boundaryBody) {
      this.physicsWorld.destroyBody(this.boundaryBody);
      this.boundaryBody = null;
    }
  }
}
