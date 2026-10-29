import * as planck from 'planck';
import { Vehicle } from './Vehicle';
import { World } from '../sim/World';
import { VEHICLE_CONFIG } from '../data/vehicles';
import { HookState } from '../types';
import { isHookable } from '../sim/Materials';
import { MAT_ID } from '../data/materials';
import { eventBus } from '../core/EventBus';

export interface HookUpgrades {
  ropeAdd_m: number;
  tensionMult: number;
  winchForceMult: number;
}

export class HookManager {
  public state: HookState = 'IDLE';
  public projPos: { x: number; y: number } = { x: 0, y: 0 };
  public projVel: { x: number; y: number } = { x: 0, y: 0 };
  public attachPos: { x: number; y: number } = { x: 0, y: 0 };
  public ropeCurrentLength: number = 0;
  public ropeMaxLength: number = 0;
  public tensionRatio: number = 0; // 0 to 1+

  private flightTimer: number = 0;
  private cooldownTimer: number = 0;
  private overTensionTimer: number = 0;

  private anchorBody: planck.Body | null = null;
  private ropeJoint: planck.RopeJoint | null = null;

  public upgrades: HookUpgrades = {
    ropeAdd_m: 0,
    tensionMult: 1.0,
    winchForceMult: 1.0,
  };

  public applyUpgrades(u: Partial<HookUpgrades>): void {
    this.upgrades = { ...this.upgrades, ...u };
  }

  public getMountWorldPos(vehicle: Vehicle): planck.Vec2 {
    const mountLocal = planck.Vec2(
      VEHICLE_CONFIG.hook.mountLocal[0],
      VEHICLE_CONFIG.hook.mountLocal[1]
    );
    return vehicle.chassisBody.getWorldPoint(mountLocal);
  }

  public getMaxRopeLength(): number {
    return VEHICLE_CONFIG.hook.maxRope_m + this.upgrades.ropeAdd_m;
  }

  public update(
    dt: number,
    fireClicked: boolean,
    winchInHeld: boolean,
    winchOutHeld: boolean,
    aimWorld: { x: number; y: number },
    vehicle: Vehicle,
    world: World
  ): void {
    const mountPos = this.getMountWorldPos(vehicle);
    const maxRope = this.getMaxRopeLength();

    // 1. Handle Cooldown
    if (this.state === 'COOLDOWN') {
      this.cooldownTimer -= dt;
      if (this.cooldownTimer <= 0) {
        this.state = 'IDLE';
      }
      return;
    }

    // 2. Handle Miss Retract
    if (this.state === 'MISS_RETRACT') {
      this.cooldownTimer -= dt;
      if (this.cooldownTimer <= 0) {
        this.state = 'COOLDOWN';
        this.cooldownTimer = 0.5;
      }
      return;
    }

    // 3. Handle IDLE -> Fire Click
    if (this.state === 'IDLE') {
      if (fireClicked) {
        const dx = aimWorld.x - mountPos.x;
        const dy = aimWorld.y - mountPos.y;
        const angle = Math.atan2(dy, dx);
        const speed = VEHICLE_CONFIG.hook.speed;

        this.projPos = { x: mountPos.x, y: mountPos.y };
        this.projVel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
        this.flightTimer = 0;
        this.state = 'FLYING';
        eventBus.emit('hook-fire', { x: mountPos.x, y: mountPos.y, angle });
      }
      return;
    }

    // 4. Handle FLYING State
    if (this.state === 'FLYING') {
      if (fireClicked) {
        // Cancel/release
        this.retractToCooldown();
        return;
      }

      this.flightTimer += dt;
      const g = 9.81 * VEHICLE_CONFIG.hook.gravityScale;
      this.projVel.y -= g * dt;

      const nextX = this.projPos.x + this.projVel.x * dt;
      const nextY = this.projPos.y + this.projVel.y * dt;

      // Distance from mount
      const distFromMount = Math.hypot(nextX - mountPos.x, nextY - mountPos.y);
      if (distFromMount > maxRope || this.flightTimer > 0.9) {
        // Miss / max distance reached
        this.state = 'MISS_RETRACT';
        this.cooldownTimer = VEHICLE_CONFIG.hook.missRetractSec;
        eventBus.emit('hook-miss', undefined);
        return;
      }

      // Check collision along segment (DDA + anchor entities)
      const hit = this.raycastHook(this.projPos.x, this.projPos.y, nextX, nextY, world);
      if (hit) {
        if (hit.hookable) {
          // Attached!
          this.attach(hit.x, hit.y, mountPos, vehicle);
        } else {
          // Hit soft/unhookable terrain -> miss retract
          this.projPos = { x: hit.x, y: hit.y };
          this.state = 'MISS_RETRACT';
          this.cooldownTimer = VEHICLE_CONFIG.hook.missRetractSec;
          eventBus.emit('hook-miss', undefined);
        }
        return;
      }

      this.projPos = { x: nextX, y: nextY };
      return;
    }

    // 5. Handle ATTACHED State (Rope & Winch)
    if (this.state === 'ATTACHED') {
      if (fireClicked) {
        // Release hook
        this.releaseHook();
        return;
      }

      const currentDist = Math.hypot(this.attachPos.x - mountPos.x, this.attachPos.y - mountPos.y);
      this.ropeCurrentLength = currentDist;

      // Winch In (hold RMB / Shift)
      if (winchInHeld && this.ropeJoint) {
        const pullDirX = (this.attachPos.x - mountPos.x) / (currentDist || 1);
        const pullDirY = (this.attachPos.y - mountPos.y) / (currentDist || 1);
        const winchForce = VEHICLE_CONFIG.hook.winchForce * this.upgrades.winchForceMult;

        vehicle.chassisBody.applyForce(
          planck.Vec2(pullDirX * winchForce, pullDirY * winchForce),
          mountPos,
          true
        );

        // Ratchet maximum length so rope never sags back
        const newMax = Math.max(VEHICLE_CONFIG.hook.minRope_m, Math.min(this.ropeMaxLength, currentDist + 0.05));
        this.ropeMaxLength = newMax;
        this.ropeJoint.setMaxLength(newMax);
      }

      // Winch Out (hold Ctrl)
      if (winchOutHeld && this.ropeJoint) {
        const newMax = Math.min(maxRope, this.ropeMaxLength + VEHICLE_CONFIG.hook.winchSpeed * dt);
        this.ropeMaxLength = newMax;
        this.ropeJoint.setMaxLength(newMax);
      }

      // Monitor Tension and Snap threshold
      if (this.ropeJoint) {
        const reaction = this.ropeJoint.getReactionForce(60);
        const tensionN = Math.hypot(reaction.x, reaction.y);
        const breakLimit = VEHICLE_CONFIG.hook.breakTension * this.upgrades.tensionMult;
        this.tensionRatio = tensionN / breakLimit;

        if (this.tensionRatio >= 1.0) {
          this.overTensionTimer += dt;
          if (this.overTensionTimer >= 0.3) {
            // SNAP!
            eventBus.emit('rope-snap', { x: mountPos.x, y: mountPos.y });
            this.releaseHook(true);
          }
        } else {
          this.overTensionTimer = 0;
        }
      }
    }
  }

  private raycastHook(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    world: World
  ): { x: number; y: number; hookable: boolean } | null {
    // 1. Check anchor entities first (priority if closer)
    for (const ent of world.entities) {
      if (ent.type === 'anchor') {
        const radius = ent.radius_m ?? 0.6;
        const groundYM = world.worldY(world.cellY(ent.x_m));
        const entYM = groundYM + (ent.aboveGround_m ?? 2.0);

        // Segment vs circle test
        const dist = this.distPointToSegment(ent.x_m, entYM, x0, y0, x1, y1);
        if (dist <= radius) {
          return { x: ent.x_m, y: entYM, hookable: true };
        }
      }
    }

    // 2. March segment through grid cells with DDA
    const c0x = world.cellX(x0);
    const c0y = world.cellY(y0);
    const c1x = world.cellX(x1);
    const c1y = world.cellY(y1);

    const dx = Math.abs(c1x - c0x);
    const dy = Math.abs(c1y - c0y);
    const sx = c0x < c1x ? 1 : -1;
    const sy = c0y < c1y ? 1 : -1;
    let err = dx - dy;

    let cx = c0x;
    let cy = c0y;

    while (true) {
      if (cx >= 0 && cx < world.gridW && cy >= 0 && cy < world.gridH) {
        const m = world.getCell(cx, cy).mat;
        if (m !== MAT_ID.AIR) {
          const hitX = world.worldX(cx);
          const hitY = world.worldY(cy);
          return { x: hitX, y: hitY, hookable: isHookable(m) };
        }
      }

      if (cx === c1x && cy === c1y) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }

    return null;
  }

  private distPointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  private attach(x: number, y: number, mountPos: planck.Vec2, vehicle: Vehicle): void {
    this.attachPos = { x, y };
    this.state = 'ATTACHED';
    this.overTensionTimer = 0;

    const currentDist = Math.hypot(x - mountPos.x, y - mountPos.y);
    this.ropeMaxLength = Math.max(VEHICLE_CONFIG.hook.minRope_m, currentDist);
    this.ropeCurrentLength = currentDist;

    // Create anchor body in physics world
    if (this.anchorBody) vehicle.physicsWorld.destroyBody(this.anchorBody);
    this.anchorBody = vehicle.physicsWorld.createBody({
      type: 'static',
      position: planck.Vec2(x, y),
    });

    const mountLocal = planck.Vec2(
      VEHICLE_CONFIG.hook.mountLocal[0],
      VEHICLE_CONFIG.hook.mountLocal[1]
    );

    if (this.ropeJoint) vehicle.physicsWorld.destroyJoint(this.ropeJoint);
    this.ropeJoint = vehicle.physicsWorld.createJoint(
      new planck.RopeJoint(
        {
          maxLength: this.ropeMaxLength,
          localAnchorA: planck.Vec2(0, 0),
          localAnchorB: mountLocal,
          collideConnected: false,
        } as any,
        this.anchorBody,
        vehicle.chassisBody
      )
    ) as planck.RopeJoint;

    eventBus.emit('hook-attach', { x, y });
  }

  public releaseHook(isSnap: boolean = false): void {
    if (this.ropeJoint && this.anchorBody) {
      this.anchorBody.getWorld().destroyJoint(this.ropeJoint);
      this.anchorBody.getWorld().destroyBody(this.anchorBody);
      this.ropeJoint = null;
      this.anchorBody = null;
    }
    this.state = 'COOLDOWN';
    this.cooldownTimer = isSnap ? 1.5 : 0.5;
    this.tensionRatio = 0;
  }

  private retractToCooldown(): void {
    this.state = 'COOLDOWN';
    this.cooldownTimer = 0.5;
  }

  public reset(): void {
    if (this.ropeJoint && this.anchorBody) {
      this.anchorBody.getWorld().destroyJoint(this.ropeJoint);
      this.anchorBody.getWorld().destroyBody(this.anchorBody);
    }
    this.ropeJoint = null;
    this.anchorBody = null;
    this.state = 'IDLE';
    this.tensionRatio = 0;
  }
}
