import { CPM, GLOBALS } from '../data/globals';
import { World } from '../sim/World';

export class Camera {
  public xM: number = 0;
  public yM: number = 0;

  // View bounds in meters
  public readonly viewWidthM: number = GLOBALS.view.w / CPM; // 30 m
  public readonly viewHeightM: number = GLOBALS.view.h / CPM; // 16.875 m

  // Snapped integer cell bounds for rendering
  public minCellX: number = 0;
  public minCellY: number = 0;

  public update(targetXM: number, targetYM: number, targetVx: number, dt: number, world: World): void {
    // Lookahead in movement direction
    const lookAheadM = Math.max(-4, Math.min(6, targetVx * GLOBALS.camera.lookAheadSec));
    const targetCamX = targetXM + lookAheadM;
    const targetCamY = targetYM + (GLOBALS.camera.verticalBiasCells / CPM);

    // Smooth lerp
    const t = 1 - Math.exp(-dt / GLOBALS.camera.smooth);
    this.xM += (targetCamX - this.xM) * t;
    this.yM += (targetCamY - this.yM) * t;

    // Clamp inside world boundaries
    const halfWM = this.viewWidthM * 0.5;
    const halfHM = this.viewHeightM * 0.5;
    this.xM = Math.max(halfWM, Math.min(world.widthM - halfWM, this.xM));
    this.yM = Math.max(halfHM, Math.min(world.heightM - halfHM, this.yM));

    // Snap to whole cells
    if (GLOBALS.camera.snapToCells) {
      const snappedCellCenterXM = Math.round(this.xM * CPM) / CPM;
      const snappedCellCenterYM = Math.round(this.yM * CPM) / CPM;
      this.minCellX = Math.round(snappedCellCenterXM * CPM - GLOBALS.view.w * 0.5);
      // Remember grid Y is inverted
      const centerGridY = world.cellY(snappedCellCenterYM);
      this.minCellY = Math.round(centerGridY - GLOBALS.view.h * 0.5);
    } else {
      this.minCellX = Math.round(world.cellX(this.xM) - GLOBALS.view.w * 0.5);
      this.minCellY = Math.round(world.cellY(this.yM) - GLOBALS.view.h * 0.5);
    }
  }

  public screenToWorld(screenX: number, screenY: number, world: World): { x: number; y: number } {
    const gridX = this.minCellX + screenX;
    const gridY = this.minCellY + screenY;
    return {
      x: world.worldX(gridX),
      y: world.worldY(gridY),
    };
  }

  public worldToScreen(worldXM: number, worldYM: number, world: World): { x: number; y: number } {
    const gridX = world.cellX(worldXM);
    const gridY = world.cellY(worldYM);
    return {
      x: gridX - this.minCellX,
      y: gridY - this.minCellY,
    };
  }
}
