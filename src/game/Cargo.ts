import * as planck from 'planck';
import { CARGO_TYPES } from '../data/cargo';
import { CargoDef } from '../types';
import { Vehicle } from './Vehicle';
import { World } from '../sim/World';
import { MAT_ID } from '../data/materials';
import { eventBus } from '../core/EventBus';

export class CargoManager {
  public cargoType: string = 'bricks';
  public cargoDef: CargoDef = CARGO_TYPES.bricks;
  public crateIntegrities: number[] = [100, 100, 100, 100, 100, 100];
  public lostCrates: boolean[] = [false, false, false, false, false, false];
  private submergedTimers: number[] = [0, 0, 0, 0, 0, 0];

  constructor(cargoType: string = 'bricks') {
    this.init(cargoType);
  }

  public init(cargoType: string): void {
    this.cargoType = cargoType;
    this.cargoDef = CARGO_TYPES[cargoType] || CARGO_TYPES.bricks;
    this.crateIntegrities = [100, 100, 100, 100, 100, 100];
    this.lostCrates = [false, false, false, false, false, false];
    this.submergedTimers = [0, 0, 0, 0, 0, 0];
  }

  public handleContactImpulse(crateIndex: number, normalImpulse: number): void {
    if (crateIndex < 0 || crateIndex >= 6 || this.lostCrates[crateIndex]) return;

    if (normalImpulse > this.cargoDef.hitThresholdNs) {
      const excess = normalImpulse - this.cargoDef.hitThresholdNs;
      const damage = excess * this.cargoDef.damagePerNsOver;
      this.crateIntegrities[crateIndex] = Math.max(0, this.crateIntegrities[crateIndex] - damage);
      eventBus.emit('crate-hit', { crateIndex, damage });
    }
  }

  public update(dt: number, vehicle: Vehicle, world: World): void {
    const chassisPos = vehicle.chassisBody.getPosition();
    const crates = vehicle.cargoBodies;

    for (let i = 0; i < crates.length; i++) {
      if (this.lostCrates[i]) continue;
      const crate = crates[i];
      const pos = crate.getPosition();

      // Check distance from chassis (lost if > 8m)
      const dist = Math.hypot(pos.x - chassisPos.x, pos.y - chassisPos.y);
      if (dist > 8.0) {
        this.lostCrates[i] = true;
        this.crateIntegrities[i] = 0;
        eventBus.emit('cargo-lost', { crateIndex: i });
        continue;
      }

      // Check water soaking damage
      const cx = world.cellX(pos.x);
      const cy = world.cellY(pos.y);
      const mat = world.getCell(cx, cy).mat;

      if (mat === MAT_ID.WATER && this.cargoDef.waterDamagePerSec > 0) {
        const damage = this.cargoDef.waterDamagePerSec * dt;
        this.crateIntegrities[i] = Math.max(0, this.crateIntegrities[i] - damage);
      }
    }

    // Check total cargo failure
    if (this.getDeliveredCrateCount() === 0 && this.getMeanIntegrity() <= 0) {
      eventBus.emit('level-failed', { reason: 'All cargo destroyed' });
    }
  }

  public getMeanIntegrity(): number {
    let sum = 0;
    for (let i = 0; i < 6; i++) {
      sum += this.crateIntegrities[i];
    }
    return Math.round(sum / 6);
  }

  public getDeliveredCrateCount(): number {
    let count = 0;
    for (let i = 0; i < 6; i++) {
      if (!this.lostCrates[i] && this.crateIntegrities[i] > 0) {
        count++;
      }
    }
    return count;
  }
}
