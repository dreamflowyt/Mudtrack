import { World } from './World';
import { MAT_ID } from '../data/materials';
import { GLOBALS } from '../data/globals';

export interface Particle {
  x: number; // world metres
  y: number; // world metres
  vx: number;
  vy: number;
  mat: number;
  life: number; // seconds remaining
  colorVar: number;
}

export interface CosmeticFx {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  radius: number;
  life: number;
  maxLife: number;
}

export class ParticleSystem {
  public particles: Particle[] = [];
  public fxList: CosmeticFx[] = [];
  private maxParticles: number = GLOBALS.sim.maxParticles;

  public spawn(x: number, y: number, vx: number, vy: number, mat: number, colorVar: number = 0): void {
    if (this.particles.length >= this.maxParticles) {
      // Evict oldest
      this.particles.shift();
    }
    this.particles.push({
      x,
      y,
      vx,
      vy,
      mat,
      life: 3.0,
      colorVar,
    });
  }

  public spawnFx(x: number, y: number, vx: number, vy: number, color: string, radius: number = 1.5, life: number = 0.5): void {
    if (this.fxList.length > 256) this.fxList.shift();
    this.fxList.push({
      x,
      y,
      vx,
      vy,
      color,
      radius,
      life,
      maxLife: life,
    });
  }

  public update(dt: number, world: World): void {
    const g = GLOBALS.gravity;

    // 1. Update flying mass particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy -= g * dt;
      const nextX = p.x + p.vx * dt;
      const nextY = p.y + p.vy * dt;
      p.life -= dt;

      // Check boundary
      if (nextX < 0 || nextX >= world.widthM || nextY < 0) {
        this.particles.splice(i, 1);
        continue;
      }

      const nextCellX = world.cellX(nextX);
      const nextCellY = world.cellY(nextY);
      const curMat = world.getCell(nextCellX, nextCellY).mat;

      // If particle hits solid or liquid, deposit at the previous free cell
      if (curMat !== MAT_ID.AIR) {
        this.depositParticle(world, p.x, p.y, p.mat, p.colorVar);
        this.particles.splice(i, 1);
        continue;
      }

      if (p.life <= 0) {
        this.depositParticle(world, nextX, nextY, p.mat, p.colorVar);
        this.particles.splice(i, 1);
        continue;
      }

      p.x = nextX;
      p.y = nextY;
    }

    // 2. Update cosmetic FX
    for (let i = this.fxList.length - 1; i >= 0; i--) {
      const fx = this.fxList[i];
      fx.x += fx.vx * dt;
      fx.y += fx.vy * dt;
      fx.vy -= (g * 0.5) * dt;
      fx.life -= dt;
      if (fx.life <= 0) {
        this.fxList.splice(i, 1);
      }
    }
  }

  private depositParticle(world: World, xM: number, yM: number, mat: number, colorVar: number): void {
    let cx = world.cellX(xM);
    let cy = world.cellY(yM);

    // If target is blocked, search upward for the nearest free AIR cell
    while (cy > 0 && world.getCell(cx, cy).mat !== MAT_ID.AIR) {
      cy--;
    }

    if (cy >= 0 && cy < world.gridH) {
      world.queueEdit(cx, cy, mat, colorVar);
    }
  }

  public clear(): void {
    this.particles = [];
    this.fxList = [];
  }
}
