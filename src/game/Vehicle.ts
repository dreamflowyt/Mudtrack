import * as planck from 'planck';
import { VEHICLE_CONFIG } from '../data/vehicles';
import { CARGO_TYPES } from '../data/cargo';

export const COLLISION_FILTER = {
  TERRAIN: 1,
  CHASSIS: 2,
  WHEEL: 4,
  CARGO: 8,
} as const;

export class Vehicle {
  public physicsWorld: planck.World;
  public chassisBody!: planck.Body;
  public frontWheelBody!: planck.Body;
  public rearWheelBody!: planck.Body;
  public frontJoint!: planck.WheelJoint;
  public rearJoint!: planck.WheelJoint;
  public cargoBodies: planck.Body[] = [];
  public cargoType: string = 'bricks';

  constructor(physicsWorld: planck.World) {
    this.physicsWorld = physicsWorld;
  }

  public spawn(spawnXM: number, spawnYM: number, cargoType: string = 'bricks'): void {
    this.destroy();
    this.cargoType = cargoType;

    // 1. Create Chassis Body
    this.chassisBody = this.physicsWorld.createBody({
      type: 'dynamic',
      position: planck.Vec2(spawnXM, spawnYM),
      linearDamping: VEHICLE_CONFIG.chassis.linearDamping,
      angularDamping: VEHICLE_CONFIG.chassis.angularDamping,
      bullet: true,
    });

    // Compound box fixtures
    for (const b of VEHICLE_CONFIG.chassis.boxes) {
      this.chassisBody.createFixture(
        planck.Box(b.hx, b.hy, planck.Vec2(b.cx, b.cy), 0),
        {
          friction: VEHICLE_CONFIG.chassis.friction,
          restitution: VEHICLE_CONFIG.chassis.restitution,
          density: 1.0,
          filterCategoryBits: COLLISION_FILTER.CHASSIS,
          filterMaskBits: COLLISION_FILTER.TERRAIN | COLLISION_FILTER.CARGO,
        }
      );
    }

    // Set mass and center of mass explicitly
    this.chassisBody.setMassData({
      mass: VEHICLE_CONFIG.mass.chassisKg,
      center: planck.Vec2(VEHICLE_CONFIG.chassis.comLocal[0], VEHICLE_CONFIG.chassis.comLocal[1]),
      I: 2200,
    });

    // 2. Create Wheels
    const wRadius = VEHICLE_CONFIG.wheels.radius;

    // Front Wheel
    const frontPos = planck.Vec2(
      spawnXM + VEHICLE_CONFIG.wheels.front[0],
      spawnYM + VEHICLE_CONFIG.wheels.front[1]
    );
    this.frontWheelBody = this.physicsWorld.createBody({
      type: 'dynamic',
      position: frontPos,
      bullet: true,
    });
    this.frontWheelBody.createFixture(planck.Circle(wRadius), {
      friction: VEHICLE_CONFIG.wheels.grip,
      restitution: VEHICLE_CONFIG.wheels.restitution,
      density: 1.0,
      filterCategoryBits: COLLISION_FILTER.WHEEL,
      filterMaskBits: COLLISION_FILTER.TERRAIN,
    });
    this.frontWheelBody.setMassData({
      mass: VEHICLE_CONFIG.mass.wheelKg,
      center: planck.Vec2(0, 0),
      I: 12,
    });

    // Rear Wheel
    const rearPos = planck.Vec2(
      spawnXM + VEHICLE_CONFIG.wheels.rear[0],
      spawnYM + VEHICLE_CONFIG.wheels.rear[1]
    );
    this.rearWheelBody = this.physicsWorld.createBody({
      type: 'dynamic',
      position: rearPos,
      bullet: true,
    });
    this.rearWheelBody.createFixture(planck.Circle(wRadius), {
      friction: VEHICLE_CONFIG.wheels.grip,
      restitution: VEHICLE_CONFIG.wheels.restitution,
      density: 1.0,
      filterCategoryBits: COLLISION_FILTER.WHEEL,
      filterMaskBits: COLLISION_FILTER.TERRAIN,
    });
    this.rearWheelBody.setMassData({
      mass: VEHICLE_CONFIG.mass.wheelKg,
      center: planck.Vec2(0, 0),
      I: 12,
    });

    // 3. WheelJoints (Suspension + AWD Motors)
    const axis = planck.Vec2(0, 1);

    this.frontJoint = this.physicsWorld.createJoint(
      new planck.WheelJoint(
        {
          enableMotor: true,
          maxMotorTorque: VEHICLE_CONFIG.engine.peakTorque,
          motorSpeed: 0,
          frequencyHz: VEHICLE_CONFIG.wheels.suspension.frontHz,
          dampingRatio: VEHICLE_CONFIG.wheels.suspension.damping,
        },
        this.chassisBody,
        this.frontWheelBody,
        frontPos,
        axis
      )
    ) as planck.WheelJoint;

    this.rearJoint = this.physicsWorld.createJoint(
      new planck.WheelJoint(
        {
          enableMotor: true,
          maxMotorTorque: VEHICLE_CONFIG.engine.peakTorque,
          motorSpeed: 0,
          frequencyHz: VEHICLE_CONFIG.wheels.suspension.rearHz,
          dampingRatio: VEHICLE_CONFIG.wheels.suspension.damping,
        },
        this.chassisBody,
        this.rearWheelBody,
        rearPos,
        axis
      )
    ) as planck.WheelJoint;

    // 4. Cargo crates in bed
    this.spawnCargo(spawnXM, spawnYM, cargoType);
  }

  public spawnCargo(chassisXM: number, chassisYM: number, cargoType: string): void {
    // Clear existing cargo bodies
    for (const body of this.cargoBodies) {
      this.physicsWorld.destroyBody(body);
    }
    this.cargoBodies = [];

    const def = CARGO_TYPES[cargoType] || CARGO_TYPES.bricks;
    const crateHalf = 0.38; // 0.76 x 0.76 m crate
    const slots = VEHICLE_CONFIG.cargoSlots;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const crateBody = this.physicsWorld.createBody({
        type: 'dynamic',
        position: planck.Vec2(chassisXM + slot[0], chassisYM + slot[1]),
        linearDamping: 0.1,
        angularDamping: 0.3,
      });

      crateBody.createFixture(planck.Box(crateHalf, crateHalf), {
        friction: 0.6,
        restitution: 0.05,
        density: 1.0,
        filterCategoryBits: COLLISION_FILTER.CARGO,
        filterMaskBits: COLLISION_FILTER.TERRAIN | COLLISION_FILTER.CHASSIS | COLLISION_FILTER.CARGO,
      });

      crateBody.setMassData({
        mass: def.crateMassKg,
        center: planck.Vec2(0, 0),
        I: 5,
      });

      // Tag userData with crate index
      crateBody.setUserData({ isCrate: true, crateIndex: i });
      this.cargoBodies.push(crateBody);
    }
  }

  public respawnUpright(xM: number, yM: number): void {
    this.spawn(xM, yM, this.cargoType);
  }

  public destroy(): void {
    if (this.frontJoint) this.physicsWorld.destroyJoint(this.frontJoint);
    if (this.rearJoint) this.physicsWorld.destroyJoint(this.rearJoint);
    if (this.frontWheelBody) this.physicsWorld.destroyBody(this.frontWheelBody);
    if (this.rearWheelBody) this.physicsWorld.destroyBody(this.rearWheelBody);
    if (this.chassisBody) this.physicsWorld.destroyBody(this.chassisBody);
    for (const b of this.cargoBodies) {
      this.physicsWorld.destroyBody(b);
    }
    this.cargoBodies = [];
  }
}
