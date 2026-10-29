import { LevelDef } from '../types';
import { Vehicle } from './Vehicle';
import { CargoManager } from './Cargo';
import { Drivetrain } from './Drivetrain';
import { eventBus } from '../core/EventBus';

export interface MissionResult {
  completed: boolean;
  stars: number;
  payout: number;
  timeSec: number;
  integrityPct: number;
  cratesDelivered: number;
  underPar: boolean;
}

export class MissionManager {
  public levelDef!: LevelDef;
  public elapsedTime: number = 0;
  public isCompleted: boolean = false;
  public isFailed: boolean = false;
  public failReason: string = '';

  public lastCheckpointXM: number = 8;
  public lastCheckpointYM: number = 20;
  public recoveryUsed: boolean = false;
  public activeHint: string | null = null;

  private visitedDepots: Set<number> = new Set();
  private depotStopTimers: Map<number, number> = new Map();

  constructor(levelDef: LevelDef) {
    this.init(levelDef);
  }

  public init(levelDef: LevelDef): void {
    this.levelDef = levelDef;
    this.elapsedTime = 0;
    this.isCompleted = false;
    this.isFailed = false;
    this.failReason = '';
    this.recoveryUsed = false;
    this.activeHint = null;
    this.visitedDepots.clear();
    this.depotStopTimers.clear();

    const startEnt = levelDef.entities.find((e) => e.type === 'start');
    this.lastCheckpointXM = startEnt?.x_m ?? 8;
    this.lastCheckpointYM = 25;
  }

  public setInitialCheckpoint(xM: number, yM: number): void {
    this.lastCheckpointXM = xM;
    this.lastCheckpointYM = yM;
  }

  public update(dt: number, vehicle: Vehicle, cargo: CargoManager, drivetrain: Drivetrain): MissionResult | null {
    if (this.isCompleted || this.isFailed) return null;

    this.elapsedTime += dt;
    const chassisPos = vehicle.chassisBody.getPosition();
    const chassisVel = vehicle.chassisBody.getLinearVelocity();
    const speed = Math.hypot(chassisVel.x, chassisVel.y);

    // 1. Fall out of world check (y < -10m)
    if (chassisPos.y < -10) {
      this.isFailed = true;
      this.failReason = 'Fell out of world';
      eventBus.emit('level-failed', { reason: this.failReason });
      return null;
    }

    // 2. Check entities (hints, depots, finish)
    this.activeHint = null;

    for (let i = 0; i < this.levelDef.entities.length; i++) {
      const ent = this.levelDef.entities[i];
      const dist = Math.abs(chassisPos.x - ent.x_m);

      // Hint signs (< 10m away)
      if (ent.type === 'hint' && ent.text && dist < 12.0) {
        this.activeHint = ent.text;
      }

      // Depots (< 4m away and stopped for 2s)
      if (ent.type === 'depot') {
        if (dist < 4.0 && speed < 0.5) {
          const currentTimer = (this.depotStopTimers.get(i) || 0) + dt;
          this.depotStopTimers.set(i, currentTimer);

          if (currentTimer >= 2.0 && !this.visitedDepots.has(i)) {
            this.visitedDepots.add(i);
            drivetrain.fuel = Math.min(drivetrain.maxFuel, drivetrain.fuel + drivetrain.maxFuel * 0.5);
            drivetrain.battery = drivetrain.maxBattery;
            this.lastCheckpointXM = ent.x_m;
            this.lastCheckpointYM = chassisPos.y + 0.5;
            eventBus.emit('depot-service', { x: ent.x_m });
          }
        } else {
          this.depotStopTimers.set(i, 0);
        }
      }

      // Finish zone (< 6m away from finish entity)
      if (ent.type === 'finish' && dist < 6.0) {
        // Must deliver >= 1 crate to win
        const delivered = cargo.getDeliveredCrateCount();
        if (delivered >= 1 && speed < 4.0) {
          return this.completeLevel(cargo);
        }
      }
    }

    return null;
  }

  private completeLevel(cargo: CargoManager): MissionResult {
    this.isCompleted = true;
    const integrityPct = cargo.getMeanIntegrity();
    const cratesDelivered = cargo.getDeliveredCrateCount();
    const underPar = this.elapsedTime <= this.levelDef.parTime_s;

    // Star calculation
    let stars = 1;
    if (integrityPct >= 80 && cratesDelivered >= 5) stars++;
    if (underPar) stars++;

    const penalty = this.recoveryUsed ? 0.15 : 0.0;
    const base = this.levelDef.basePay;
    const integrityMult = 0.4 + 0.6 * (integrityPct / 100);
    const timeMult = underPar ? 1.25 : 1.0;
    const payout = Math.round(base * integrityMult * timeMult * (1.0 - penalty));

    const result: MissionResult = {
      completed: true,
      stars,
      payout,
      timeSec: Math.round(this.elapsedTime * 10) / 10,
      integrityPct,
      cratesDelivered,
      underPar,
    };

    eventBus.emit('level-complete', { stars, payout, timeSec: result.timeSec });
    return result;
  }

  public triggerRecovery(vehicle: Vehicle, world?: any): void {
    this.recoveryUsed = true;
    let safeY = this.lastCheckpointYM;
    if (world && typeof world.getSurfaceHeightM === 'function') {
      safeY = world.getSurfaceHeightM(this.lastCheckpointXM, 2.5) + 1.4;
    }
    vehicle.respawnUpright(this.lastCheckpointXM, safeY);
  }

  public getFinishDistance(vehicle: Vehicle): number {
    const finishEnt = this.levelDef.entities.find((e) => e.type === 'finish');
    if (!finishEnt) return 0;
    const chassisXM = vehicle.chassisBody.getPosition().x;
    return Math.max(0, Math.round(finishEnt.x_m - chassisXM));
  }
}
