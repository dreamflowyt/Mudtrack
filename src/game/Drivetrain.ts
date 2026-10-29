import * as planck from 'planck';
import { Vehicle } from './Vehicle';
import { World } from '../sim/World';
import { VEHICLE_CONFIG } from '../data/vehicles';
import { DriveMode, EngineState, TirePressure } from '../types';
import { eventBus } from '../core/EventBus';
import { MAT_ID } from '../data/materials';
import { TIRE_PRESETS } from '../data/upgrades';

export interface DrivetrainUpgrades {
  peakTorqueMult: number;
  fuelMaxAdd: number;
  batteryMaxAdd: number;
  intakeRaise_m: number;
  floodMult: number;
  softGripMult: number;
  sinkMult: number;
}

export class Drivetrain {
  public mode: DriveMode = 'AUTO';
  public userForcedElectric: boolean = false;
  public engineState: EngineState = 'RUNNING';

  public fuel: number = VEHICLE_CONFIG.engine.fuelTank;
  public maxFuel: number = VEHICLE_CONFIG.engine.fuelTank;

  public battery: number = VEHICLE_CONFIG.electric.batteryCap;
  public maxBattery: number = VEHICLE_CONFIG.electric.batteryCap;

  public flood: number = 0; // 0 to 1
  public tirePressure: TirePressure = 'Normal';

  private smoothedThrottle: number = 0;
  private submergedIntakeTimer: number = 0;
  private dryIntakeTimer: number = 0;
  private restartingTimer: number = 0;

  public upgrades: DrivetrainUpgrades = {
    peakTorqueMult: 1.0,
    fuelMaxAdd: 0,
    batteryMaxAdd: 0,
    intakeRaise_m: 0,
    floodMult: 1.0,
    softGripMult: 1.0,
    sinkMult: 1.0,
  };

  public applyUpgrades(u: Partial<DrivetrainUpgrades>): void {
    this.upgrades = { ...this.upgrades, ...u };
    this.maxFuel = VEHICLE_CONFIG.engine.fuelTank + this.upgrades.fuelMaxAdd;
    this.maxBattery = VEHICLE_CONFIG.electric.batteryCap + this.upgrades.batteryMaxAdd;
    this.fuel = this.maxFuel;
    this.battery = this.maxBattery;
  }

  public update(
    dt: number,
    targetThrottle: number,
    handbrake: boolean,
    toggleModePressed: boolean,
    cycleTirePressed: boolean,
    vehicle: Vehicle,
    world: World
  ): { isAirborne: boolean; intakeUnderwater: boolean } {
    if (toggleModePressed) {
      this.userForcedElectric = !this.userForcedElectric;
    }

    if (cycleTirePressed) {
      if (this.tirePressure === 'Normal') this.tirePressure = 'Low';
      else if (this.tirePressure === 'Low') this.tirePressure = 'High';
      else this.tirePressure = 'Normal';
    }

    // 1. Throttle smoothing (rise 4/s, fall 8/s)
    const rate = Math.abs(targetThrottle) > Math.abs(this.smoothedThrottle) ? 4.0 : 8.0;
    const diff = targetThrottle - this.smoothedThrottle;
    if (Math.abs(diff) < rate * dt) {
      this.smoothedThrottle = targetThrottle;
    } else {
      this.smoothedThrottle += Math.sign(diff) * rate * dt;
    }

    // 2. Check Air Intake and Water Submersion
    const intakeLocal = planck.Vec2(
      VEHICLE_CONFIG.engine.intakeLocal[0],
      VEHICLE_CONFIG.engine.intakeLocal[1] + this.upgrades.intakeRaise_m
    );
    const intakeWorld = vehicle.chassisBody.getWorldPoint(intakeLocal);
    const intakeCellX = world.cellX(intakeWorld.x);
    const intakeCellY = world.cellY(intakeWorld.y);
    const intakeMat = world.getCell(intakeCellX, intakeCellY).mat;
    const intakeUnderwater = intakeMat === MAT_ID.WATER;

    // 3. Engine stall state machine (§8.3)
    if (intakeUnderwater) {
      this.submergedIntakeTimer += dt;
      this.dryIntakeTimer = 0;
      if (this.engineState === 'RUNNING' && this.submergedIntakeTimer >= VEHICLE_CONFIG.engine.stallAfterSec) {
        this.engineState = 'STALLED';
        eventBus.emit('engine-stall', undefined);
      }
    } else {
      this.submergedIntakeTimer = 0;
      this.dryIntakeTimer += dt;
      if (this.engineState === 'STALLED') {
        if (this.dryIntakeTimer >= VEHICLE_CONFIG.engine.restartAfterDrySec) {
          this.engineState = 'RESTARTING';
          this.restartingTimer = 0;
        }
      } else if (this.engineState === 'RESTARTING') {
        this.restartingTimer += dt;
        if (this.restartingTimer >= VEHICLE_CONFIG.engine.restartDelaySec) {
          this.engineState = 'RUNNING';
          eventBus.emit('engine-restart', undefined);
        }
      }
    }

    // 4. Cabin Flooding (§8.4)
    const sealLocal = planck.Vec2(
      VEHICLE_CONFIG.water.sealLocal[0],
      VEHICLE_CONFIG.water.sealLocal[1]
    );
    const sealWorld = vehicle.chassisBody.getWorldPoint(sealLocal);
    const sealCellX = world.cellX(sealWorld.x);
    const sealCellY = world.cellY(sealWorld.y);
    const sealMat = world.getCell(sealCellX, sealCellY).mat;
    const sealUnderwater = sealMat === MAT_ID.WATER;

    if (sealUnderwater) {
      this.flood = Math.min(1.0, this.flood + VEHICLE_CONFIG.water.floodPerSec * this.upgrades.floodMult * dt);
      if (this.flood >= 1.0) {
        eventBus.emit('flooded', undefined);
        eventBus.emit('level-failed', { reason: 'Vehicle flooded underwater' });
      }
    } else {
      this.flood = Math.max(0, this.flood - VEHICLE_CONFIG.water.drainPerSec * dt);
    }

    // 5. Determine active drive mode
    const canUseEngine = !this.userForcedElectric && this.fuel > 0 && this.engineState === 'RUNNING';
    const canUseElectric = this.battery > 0;

    if (this.userForcedElectric) {
      this.mode = canUseElectric ? 'ELECTRIC' : 'NO POWER';
    } else {
      if (canUseEngine) {
        this.mode = 'AUTO'; // using engine
      } else if (canUseElectric) {
        this.mode = 'ELECTRIC';
      } else {
        this.mode = 'NO POWER';
      }
    }

    // 6. Fuel & Battery dynamics
    const absThrottle = Math.abs(this.smoothedThrottle);

    if (this.mode === 'AUTO' && this.engineState === 'RUNNING') {
      // Fuel burn
      const burn = (VEHICLE_CONFIG.engine.burnIdle + (VEHICLE_CONFIG.engine.burnFull - VEHICLE_CONFIG.engine.burnIdle) * absThrottle) * dt;
      this.fuel = Math.max(0, this.fuel - burn);

      // Alternator charging battery
      if (absThrottle > 0.05) {
        this.battery = Math.min(this.maxBattery, this.battery + VEHICLE_CONFIG.electric.alternatorPerSec * dt);
      }
    } else if (this.mode === 'ELECTRIC') {
      // Battery drain
      const drain = (VEHICLE_CONFIG.electric.drainPerSec * absThrottle + VEHICLE_CONFIG.electric.idleDrainPerSec) * dt;
      this.battery = Math.max(0, this.battery - drain);
    } else {
      // Idle battery drain when engine stopped
      this.battery = Math.max(0, this.battery - VEHICLE_CONFIG.electric.idleDrainPerSec * dt);
    }

    // Regen braking while coasting / braking at speed
    const chassisVel = vehicle.chassisBody.getLinearVelocity();
    const speed = Math.abs(chassisVel.x);
    if ((this.smoothedThrottle === 0 || handbrake) && speed > 1.0) {
      const regen = Math.min(VEHICLE_CONFIG.electric.regenMax, VEHICLE_CONFIG.electric.regenK * speed) * dt;
      this.battery = Math.min(this.maxBattery, this.battery + regen);
    }

    // 7. Check if airborne
    const frontPos = vehicle.frontWheelBody.getPosition();
    const rearPos = vehicle.rearWheelBody.getPosition();
    const frontGround = world.getCell(world.cellX(frontPos.x), world.cellY(frontPos.y - 0.6)).mat;
    const rearGround = world.getCell(world.cellX(rearPos.x), world.cellY(rearPos.y - 0.6)).mat;
    const isAirborne = (frontGround === MAT_ID.AIR || frontGround === MAT_ID.WATER) && (rearGround === MAT_ID.AIR || rearGround === MAT_ID.WATER);

    // 8. Motor control & Air Pitch
    if (isAirborne) {
      // Pitch in air (§6.4)
      if (this.smoothedThrottle !== 0) {
        const pitchTorque = VEHICLE_CONFIG.air.pitchTorque * -this.smoothedThrottle;
        vehicle.chassisBody.applyTorque(pitchTorque, true);
      }
      vehicle.chassisBody.setAngularDamping(VEHICLE_CONFIG.air.angularDamping);
    } else {
      vehicle.chassisBody.setAngularDamping(VEHICLE_CONFIG.chassis.angularDamping);
    }

    this.applyMotorTorques(vehicle, handbrake);

    return { isAirborne, intakeUnderwater };
  }

  private applyMotorTorques(vehicle: Vehicle, handbrake: boolean): void {
    const fJoint = vehicle.frontJoint;
    const rJoint = vehicle.rearJoint;
    if (!fJoint || !rJoint) return;

    if (handbrake) {
      fJoint.setMotorSpeed(0);
      fJoint.setMaxMotorTorque(VEHICLE_CONFIG.brake.torque);
      rJoint.setMotorSpeed(0);
      rJoint.setMaxMotorTorque(VEHICLE_CONFIG.brake.handbrakeTorque);
      return;
    }

    if (this.mode === 'NO POWER' || this.smoothedThrottle === 0) {
      // Coasting
      fJoint.setMotorSpeed(0);
      fJoint.setMaxMotorTorque(10);
      rJoint.setMotorSpeed(0);
      rJoint.setMaxMotorTorque(10);
      return;
    }

    const isElectric = this.mode === 'ELECTRIC';
    const peakTorque = (isElectric ? VEHICLE_CONFIG.electric.peakTorque : VEHICLE_CONFIG.engine.peakTorque) * this.upgrades.peakTorqueMult;
    const maxOmega = isElectric ? VEHICLE_CONFIG.electric.maxOmega : VEHICLE_CONFIG.engine.maxOmega;

    const fOmega = vehicle.frontWheelBody.getAngularVelocity();
    const rOmega = vehicle.rearWheelBody.getAngularVelocity();
    const avgOmega = (Math.abs(fOmega) + Math.abs(rOmega)) * 0.5;

    const speedRatio = Math.min(1.0, avgOmega / maxOmega);
    const torqueAvail = peakTorque * (1.0 - 0.6 * speedRatio * speedRatio);

    // Box2D: CCW is positive, driving right is negative omega
    const desiredMotorSpeed = -this.smoothedThrottle * maxOmega;

    // Check if braking (throttle opposes wheel rotation)
    const isBraking = (this.smoothedThrottle > 0 && fOmega > 1.0) || (this.smoothedThrottle < 0 && fOmega < -1.0);

    if (isBraking) {
      fJoint.setMotorSpeed(0);
      fJoint.setMaxMotorTorque(VEHICLE_CONFIG.brake.torque);
      rJoint.setMotorSpeed(0);
      rJoint.setMaxMotorTorque(VEHICLE_CONFIG.brake.torque);
    } else {
      fJoint.setMotorSpeed(desiredMotorSpeed);
      fJoint.setMaxMotorTorque(torqueAvail);
      rJoint.setMotorSpeed(desiredMotorSpeed);
      rJoint.setMaxMotorTorque(torqueAvail);
    }
  }

  public getTireMultipliers(): { softGrip: number; hardGrip: number; sinkDepth: number } {
    const preset = TIRE_PRESETS[this.tirePressure];
    return {
      softGrip: preset.softGrip * this.upgrades.softGripMult,
      hardGrip: preset.hardGrip,
      sinkDepth: preset.sinkDepth * this.upgrades.sinkMult,
    };
  }

  public refuelFull(): void {
    this.fuel = this.maxFuel;
    this.battery = this.maxBattery;
  }
}
