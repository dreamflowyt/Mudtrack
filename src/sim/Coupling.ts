import * as planck from 'planck';
import { World } from './World';
import { ParticleSystem } from './Particles';
import { MAT_BY_ID } from './Materials';
import { MAT_ID } from '../data/materials';
import { VEHICLE_CONFIG } from '../data/vehicles';
import { GLOBALS } from '../data/globals';

export interface CouplingConfig {
  softGripMult: number;
  tireSinkMult: number;
}

export class CouplingManager {
  private config: CouplingConfig = {
    softGripMult: 1.0,
    tireSinkMult: 1.0,
  };

  private frontDigAccum: number = 0;
  private rearDigAccum: number = 0;

  public setConfig(cfg: Partial<CouplingConfig>): void {
    this.config = { ...this.config, ...cfg };
  }

  /**
   * Applies hydrodynamic and viscous drag and buoyancy to chassis, wheels, and cargo.
   */
  public applyDragAndBuoyancy(
    world: World,
    chassisBody: planck.Body,
    frontWheelBody: planck.Body,
    rearWheelBody: planck.Body,
    cargoBodies: planck.Body[]
  ): { submergedFraction: number } {
    // 1. Chassis buoyancy & drag
    const chassisSubmerged = this.applyBodyFluidForces(world, chassisBody, 1800, VEHICLE_CONFIG.water.buoyancyFactor, 2.0);

    // 2. Wheels
    this.applyBodyFluidForces(world, frontWheelBody, 80, 0.1, 0.4);
    this.applyBodyFluidForces(world, rearWheelBody, 80, 0.1, 0.4);

    // 3. Cargo crates
    for (let i = 0; i < cargoBodies.length; i++) {
      this.applyBodyFluidForces(world, cargoBodies[i], 50, 0.05, 0.8);
    }

    return { submergedFraction: chassisSubmerged };
  }

  private applyBodyFluidForces(
    world: World,
    body: planck.Body,
    _massKg: number,
    buoyancyFactor: number,
    bodyDepthZ: number
  ): number {
    const pos = body.getPosition();
    const vel = body.getLinearVelocity();
    const omega = body.getAngularVelocity();

    // Sample points in local grid around body
    const sampleCountX = 5;
    const sampleCountY = 4;
    const halfW = 1.2;
    const halfH = 0.5;

    let wetPoints = 0;
    let wetCentroidX = 0;
    let wetCentroidY = 0;

    let totalDragK = 0;
    const totalSamples = sampleCountX * sampleCountY;

    for (let iy = 0; iy < sampleCountY; iy++) {
      for (let ix = 0; ix < sampleCountX; ix++) {
        const lx = -halfW + (ix / (sampleCountX - 1)) * (halfW * 2);
        const ly = -halfH + (iy / (sampleCountY - 1)) * (halfH * 2);
        const wp = body.getWorldPoint(planck.Vec2(lx, ly));

        const cx = world.cellX(wp.x);
        const cy = world.cellY(wp.y);
        const mat = world.getCell(cx, cy).mat;

        if (mat === MAT_ID.WATER) {
          wetPoints++;
          wetCentroidX += wp.x;
          wetCentroidY += wp.y;
          totalDragK += MAT_BY_ID[MAT_ID.WATER].dragK ?? 250;
        } else if (mat === MAT_ID.MUD) {
          totalDragK += MAT_BY_ID[MAT_ID.MUD].dragK ?? 1200;
        } else if (mat === MAT_ID.SAND) {
          totalDragK += MAT_BY_ID[MAT_ID.SAND].dragK ?? 150;
        }
      }
    }

    // Apply Buoyancy
    if (wetPoints > 0) {
      const avgX = wetCentroidX / wetPoints;
      const avgY = wetCentroidY / wetPoints;
      const areaWet = (wetPoints / totalSamples) * (halfW * 2 * halfH * 2);
      const rho = 1000; // Water density kg/m3
      const fUp = rho * GLOBALS.gravity * areaWet * bodyDepthZ * buoyancyFactor;

      body.applyForce(planck.Vec2(0, fUp), planck.Vec2(avgX, avgY), true);
    }

    // Apply Fluid Drag (linear and angular)
    if (totalDragK > 0) {
      const avgDragK = totalDragK / totalSamples;
      const dragForce = planck.Vec2(-vel.x * avgDragK * 0.1, -vel.y * avgDragK * 0.1);
      body.applyForceToCenter(dragForce, true);

      const angularDragTorque = -omega * avgDragK * 0.05;
      body.applyTorque(angularDragTorque, true);
    }

    return wetPoints / totalSamples;
  }

  /**
   * Evaluates tire slip and carves ruts by removing soft cells and launching roost particles.
   */
  public applyWheelDigging(
    world: World,
    particles: ParticleSystem,
    wheelBody: planck.Body,
    isFront: boolean,
    throttle: number,
    dt: number
  ): void {
    const pos = wheelBody.getPosition();
    const vel = wheelBody.getLinearVelocity();
    const omega = wheelBody.getAngularVelocity();
    const radius = VEHICLE_CONFIG.wheels.radius;

    // Forward direction of wheel rotation (-omega * r)
    const wheelTangential = -omega * radius;
    const forwardSpeed = vel.x;
    const slip = Math.max(0, Math.min(1, Math.abs(wheelTangential - forwardSpeed) / Math.max(Math.abs(wheelTangential), 0.5)));

    if (Math.abs(omega) < 3.0 || slip < 0.35) return;

    // Sample contact points under the lower half of the wheel
    let softCount = 0;
    let dominantSoftMat: number = MAT_ID.AIR;
    const softCells: Array<{ cx: number; cy: number }> = [];

    const numSamples = 12;
    for (let i = 0; i <= numSamples; i++) {
      const angle = Math.PI + (i / numSamples) * Math.PI; // bottom semicircle
      const sampleX = pos.x + Math.cos(angle) * (radius + 0.05);
      const sampleY = pos.y + Math.sin(angle) * (radius + 0.05);

      const cx = world.cellX(sampleX);
      const cy = world.cellY(sampleY);
      const cell = world.getCell(cx, cy);

      if (cell.mat === MAT_ID.SAND || cell.mat === MAT_ID.MUD) {
        softCount++;
        dominantSoftMat = cell.mat;
        softCells.push({ cx, cy });
      }
    }

    if (softCount < 3) return;

    const digRate = dominantSoftMat === MAT_ID.MUD ? 45 : 30;
    const digAddition = digRate * slip * dt;

    if (isFront) {
      this.frontDigAccum += digAddition;
    } else {
      this.rearDigAccum += digAddition;
    }

    const currentAccum = isFront ? this.frontDigAccum : this.rearDigAccum;
    const toDig = Math.min(8, Math.floor(currentAccum));

    if (toDig > 0) {
      if (isFront) this.frontDigAccum -= toDig;
      else this.rearDigAccum -= toDig;

      const travelDir = Math.sign(throttle || -omega || 1);

      for (let k = 0; k < toDig && softCells.length > 0; k++) {
        // Remove top-most soft cell
        softCells.sort((a, b) => a.cy - b.cy);
        const cellToRemove = softCells.shift()!;
        const mat = world.mat[cellToRemove.cy * world.gridW + cellToRemove.cx];
        const aux = world.aux[cellToRemove.cy * world.gridW + cellToRemove.cx];

        world.queueEdit(cellToRemove.cx, cellToRemove.cy, MAT_ID.AIR, 0);

        // Spawn flying roost particle
        const spawnXM = world.worldX(cellToRemove.cx);
        const spawnYM = world.worldY(cellToRemove.cy) + 0.1;
        const vx = -travelDir * (2.0 + world.rng.range(0, 3.5));
        const vy = 1.5 + world.rng.range(0, 2.5);

        particles.spawn(spawnXM, spawnYM, vx, vy, mat, aux & 7);
      }
    }
  }

  /**
   * Protects against chassis/wheel tunneling into solid terrain.
   */
  public applyUnstick(world: World, chassisBody: planck.Body, frontWheelBody: planck.Body, rearWheelBody: planck.Body): void {
    const cPos = chassisBody.getPosition();
    const cx = world.cellX(cPos.x);
    const cy = world.cellY(cPos.y);
    const cell = world.getCell(cx, cy);

    if (cell.mat === MAT_ID.ROCK || cell.mat === MAT_ID.DIRT || cell.mat === MAT_ID.WOOD || cell.mat === MAT_ID.METAL) {
      const dy = 0.15;
      chassisBody.setPosition(planck.Vec2(cPos.x, cPos.y + dy));
      const fPos = frontWheelBody.getPosition();
      frontWheelBody.setPosition(planck.Vec2(fPos.x, fPos.y + dy));
      const rPos = rearWheelBody.getPosition();
      rearWheelBody.setPosition(planck.Vec2(rPos.x, rPos.y + dy));

      const cVel = chassisBody.getLinearVelocity();
      chassisBody.setLinearVelocity(planck.Vec2(cVel.x * 0.5, Math.max(0, cVel.y * 0.5)));
    }
  }
}
