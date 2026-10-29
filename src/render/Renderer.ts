import * as planck from 'planck';
import { World } from '../sim/World';
import { Camera } from '../game/Camera';
import { Vehicle } from '../game/Vehicle';
import { HookManager } from '../game/Hook';
import { ParticleSystem } from '../sim/Particles';
import { GLOBALS, CPM } from '../data/globals';
import { MAT_COLOR_U32, GRASS_COLOR_U32, WATER_SURFACE_U32 } from './Palette';
import { MAT_ID } from '../data/materials';
import { isSolid } from '../sim/Materials';
import { CARGO_TYPES } from '../data/cargo';

export class Renderer {
  private lowResCanvas: HTMLCanvasElement;
  private lowResCtx: CanvasRenderingContext2D;
  private baseImageData: ImageData;
  private baseBuf: Uint32Array;
  private overlayImageData: ImageData;
  private overlayBuf: Uint32Array;

  private displayCanvas: HTMLCanvasElement;
  private displayCtx: CanvasRenderingContext2D;

  constructor(displayCanvas: HTMLCanvasElement) {
    this.displayCanvas = displayCanvas;
    this.displayCtx = displayCanvas.getContext('2d')!;

    this.lowResCanvas = document.createElement('canvas');
    this.lowResCanvas.width = GLOBALS.view.w;
    this.lowResCanvas.height = GLOBALS.view.h;
    this.lowResCtx = this.lowResCanvas.getContext('2d', { willReadFrequently: true })!;

    this.baseImageData = this.lowResCtx.createImageData(GLOBALS.view.w, GLOBALS.view.h);
    this.baseBuf = new Uint32Array(this.baseImageData.data.buffer);

    this.overlayImageData = this.lowResCtx.createImageData(GLOBALS.view.w, GLOBALS.view.h);
    this.overlayBuf = new Uint32Array(this.overlayImageData.data.buffer);
  }

  public resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.displayCanvas.getBoundingClientRect();
    this.displayCanvas.width = rect.width * dpr;
    this.displayCanvas.height = rect.height * dpr;
    this.displayCtx.imageSmoothingEnabled = false;
  }

  public render(
    world: World,
    camera: Camera,
    vehicle: Vehicle,
    hook: HookManager,
    particles: ParticleSystem,
    aimWorldPos: { x: number; y: number },
    showWireframe: boolean = false
  ): void {
    const ctx = this.lowResCtx;
    const viewW = GLOBALS.view.w;
    const viewH = GLOBALS.view.h;

    // Clear low-res canvas
    ctx.clearRect(0, 0, viewW, viewH);

    // 1. Sky & Parallax background
    this.renderSky(ctx, camera);

    // 2. Prepare Base (Solids) & Overlay (Soft/Liquids) buffers
    this.baseBuf.fill(0);
    this.overlayBuf.fill(0);

    const minX = camera.minCellX;
    const minY = camera.minCellY;
    const gridW = world.gridW;
    const gridH = world.gridH;
    const mat = world.mat;
    const aux = world.aux;
    const tick = world.tick;

    for (let py = 0; py < viewH; py++) {
      const gy = minY + py;
      if (gy < 0 || gy >= gridH) continue;
      const rowOffset = gy * gridW;
      const bufRowOffset = py * viewW;

      for (let px = 0; px < viewW; px++) {
        const gx = minX + px;
        if (gx < 0 || gx >= gridW) continue;

        const idx = rowOffset + gx;
        const m = mat[idx];
        if (m === MAT_ID.AIR) continue;

        const cellAux = aux[idx];
        const v = cellAux & 7;
        const bufIdx = bufRowOffset + px;

        if (isSolid(m)) {
          // Check for grass tufts: DIRT cell with AIR above
          if (m === MAT_ID.DIRT && gy > 0 && mat[idx - gridW] === MAT_ID.AIR) {
            this.baseBuf[bufIdx] = GRASS_COLOR_U32[(gx + v) % 3];
          } else {
            this.baseBuf[bufIdx] = MAT_COLOR_U32[m][v];
          }
        } else {
          // Soft or Liquid cells
          if (m === MAT_ID.WATER) {
            // Water surface highlight with shimmer
            if (gy > 0 && mat[idx - gridW] === MAT_ID.AIR) {
              const shimmer = ((gx + (tick >> 3)) & 3) === 0;
              this.overlayBuf[bufIdx] = shimmer ? WATER_SURFACE_U32 : MAT_COLOR_U32[m][v];
            } else {
              this.overlayBuf[bufIdx] = MAT_COLOR_U32[m][v];
            }
          } else {
            // Sand or Mud
            this.overlayBuf[bufIdx] = MAT_COLOR_U32[m][v];
          }
        }
      }
    }

    // 3. Draw Solid Base Terrain
    ctx.putImageData(this.baseImageData, 0, 0);

    // 4. Draw Background Entities (Anchors, Depots, Hints, Finish Flag)
    this.renderEntities(ctx, world, camera);

    // 5. Draw Rope & Hook
    this.renderRopeAndHook(ctx, hook, vehicle, camera, world);

    // 6. Draw Vehicle Chassis, Wheels, and Cargo
    this.renderVehicle(ctx, vehicle, camera, world);

    // 7. Draw Soft & Liquid Overlay Terrain (draws OVER vehicle so wheels sink into mud/sand!)
    // We draw overlayImageData with source-over compositing
    this.drawOverlayToCanvas(ctx);

    // 8. Draw Flying Mass Particles & Cosmetic FX
    this.renderParticles(ctx, particles, camera, world);

    // 9. Draw Hook Aim Reticle when IDLE
    if (hook.state === 'IDLE') {
      this.renderAimReticle(ctx, hook, vehicle, aimWorldPos, camera, world);
    }

    // 10. Optional Wireframe overlay (F4)
    if (showWireframe) {
      this.renderDebugWireframe(ctx, vehicle, camera, world);
    }

    // 11. Scale Low-Res Canvas to Display Canvas with crisp pixelated smoothing
    const dispW = this.displayCanvas.width;
    const dispH = this.displayCanvas.height;
    this.displayCtx.imageSmoothingEnabled = false;
    this.displayCtx.clearRect(0, 0, dispW, dispH);

    // Maintain 16:9 aspect ratio letterboxed
    const scale = Math.min(dispW / viewW, dispH / viewH);
    const renderW = Math.floor(viewW * scale);
    const renderH = Math.floor(viewH * scale);
    const offsetX = Math.floor((dispW - renderW) * 0.5);
    const offsetY = Math.floor((dispH - renderH) * 0.5);

    this.displayCtx.drawImage(
      this.lowResCanvas,
      0,
      0,
      viewW,
      viewH,
      offsetX,
      offsetY,
      renderW,
      renderH
    );
  }

  private renderSky(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const w = GLOBALS.view.w;
    const h = GLOBALS.view.h;

    // Gradient sky
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#58b2db');
    grad.addColorStop(0.7, '#a9def5');
    grad.addColorStop(1, '#d5f2fc');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Parallax pixel clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    const camX = camera.xM * CPM;
    const cloudOffsets = [
      { y: 25, speed: 0.15, width: 60, height: 14 },
      { y: 55, speed: 0.25, width: 80, height: 18 },
      { y: 85, speed: 0.08, width: 50, height: 10 },
    ];

    for (let c = 0; c < cloudOffsets.length; c++) {
      const cl = cloudOffsets[c];
      const cx = (w * 2 + (cl.y * 30 - camX * cl.speed)) % (w + 120) - 60;
      ctx.fillRect(Math.round(cx), cl.y, cl.width, cl.height);
      ctx.fillRect(Math.round(cx + 10), cl.y - 6, cl.width - 20, 6);
    }
  }

  private drawOverlayToCanvas(ctx: CanvasRenderingContext2D): void {
    // Render overlay ImageData to a temporary canvas or direct putImageData
    // Since putImageData replaces pixels completely (ignoring alpha blending in Canvas2D),
    // we use an offscreen canvas to drawImage with real alpha compositing for water!
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = GLOBALS.view.w;
    tempCanvas.height = GLOBALS.view.h;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(this.overlayImageData, 0, 0);

    ctx.drawImage(tempCanvas, 0, 0);
  }

  private renderEntities(ctx: CanvasRenderingContext2D, world: World, camera: Camera): void {
    for (const ent of world.entities) {
      const pt = camera.worldToScreen(ent.x_m, world.worldY(world.cellY(ent.x_m)), world);

      if (ent.type === 'anchor') {
        const h = Math.round((ent.aboveGround_m ?? 2.0) * CPM);
        const r = Math.round((ent.radius_m ?? 0.6) * CPM);

        if (ent.kind === 'tree') {
          // Trunk
          ctx.fillStyle = '#4a2f1c';
          ctx.fillRect(pt.x - 3, pt.y - h, 6, h);
          // Foliage hookable dome
          ctx.fillStyle = '#2d5a27';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y - h, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#3e7a36';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y - h - 3, r * 0.7, 0, Math.PI * 2);
          ctx.fill();
        } else if (ent.kind === 'spire') {
          // Rock spire
          ctx.fillStyle = '#525763';
          ctx.beginPath();
          ctx.moveTo(pt.x - 6, pt.y);
          ctx.lineTo(pt.x, pt.y - h - 8);
          ctx.lineTo(pt.x + 6, pt.y);
          ctx.closePath();
          ctx.fill();
        } else {
          // Metal post
          ctx.fillStyle = '#6b7280';
          ctx.fillRect(pt.x - 2, pt.y - h, 4, h);
          ctx.fillStyle = '#9ca3af';
          ctx.fillRect(pt.x - 4, pt.y - h - 4, 8, 4);
        }
      } else if (ent.type === 'depot') {
        // Service Depot building
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(pt.x - 20, pt.y - 30, 40, 30);
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(pt.x - 22, pt.y - 34, 44, 5);
        ctx.fillStyle = '#38bdf8';
        ctx.font = '8px monospace';
        ctx.fillText('DEPOT', pt.x - 14, pt.y - 18);
        // Fuel pump
        ctx.fillStyle = '#e11d48';
        ctx.fillRect(pt.x + 8, pt.y - 14, 8, 14);
      } else if (ent.type === 'finish') {
        // Checkered finish banner
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(pt.x - 2, pt.y - 45, 4, 45);
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.moveTo(pt.x + 2, pt.y - 45);
        ctx.lineTo(pt.x + 24, pt.y - 35);
        ctx.lineTo(pt.x + 2, pt.y - 25);
        ctx.closePath();
        ctx.fill();
      } else if (ent.type === 'hint') {
        // Wooden signpost
        ctx.fillStyle = '#78350f';
        ctx.fillRect(pt.x - 2, pt.y - 18, 4, 18);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(pt.x - 12, pt.y - 28, 24, 12);
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(pt.x - 10, pt.y - 26, 20, 8);
      }
    }
  }

  private renderVehicle(ctx: CanvasRenderingContext2D, vehicle: Vehicle, camera: Camera, world: World): void {
    const chassis = vehicle.chassisBody;
    const cPos = chassis.getPosition();
    const cAngle = chassis.getAngle();
    const pt = camera.worldToScreen(cPos.x, cPos.y, world);

    ctx.save();
    ctx.translate(Math.round(pt.x), Math.round(pt.y));
    ctx.rotate(-cAngle);

    // 1. Truck Chassis / Cab
    // Cab Body (Red/Crimson)
    ctx.fillStyle = '#C8402D';
    ctx.strokeStyle = '#1B1B1F';
    ctx.lineWidth = 1;

    // Bed walls & Floor (0.0 cx, 0.0 cy, hx 2.4 = 4.8m = ~77px)
    ctx.fillRect(-38, -5, 76, 10);
    ctx.strokeRect(-38, -5, 76, 10);

    // Cab (1.35 cx, 0.75 cy, hx 0.75, hy 0.45)
    ctx.fillRect(10, -22, 24, 18);
    ctx.strokeRect(10, -22, 24, 18);

    // Hood (2.0 cx, 0.5 cy, hx 0.4, hy 0.2)
    ctx.fillRect(24, -14, 14, 10);
    ctx.strokeRect(24, -14, 14, 10);

    // Cab Window Glass (#BFE6FF)
    ctx.fillStyle = '#BFE6FF';
    ctx.fillRect(14, -20, 16, 10);

    // Bed rear gate
    ctx.fillStyle = '#8E2B1E';
    ctx.fillRect(-38, -18, 3, 14);

    // Headlight
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(36, -11, 2, 5);

    ctx.restore();

    // 2. Wheels
    this.renderWheel(ctx, vehicle.frontWheelBody, camera, world);
    this.renderWheel(ctx, vehicle.rearWheelBody, camera, world);

    // 3. Cargo Crates
    const cDef = CARGO_TYPES[vehicle.cargoType] || CARGO_TYPES.bricks;
    for (const crate of vehicle.cargoBodies) {
      const crPos = crate.getPosition();
      const crAngle = crate.getAngle();
      const crPt = camera.worldToScreen(crPos.x, crPos.y, world);

      ctx.save();
      ctx.translate(Math.round(crPt.x), Math.round(crPt.y));
      ctx.rotate(-crAngle);

      const size = Math.round(0.76 * CPM); // ~12px
      const half = size * 0.5;

      ctx.fillStyle = cDef.color;
      ctx.fillRect(-half, -half, size, size);
      ctx.strokeStyle = '#27272a';
      ctx.strokeRect(-half, -half, size, size);

      // Distinct crate badge
      if (vehicle.cargoType === 'eggs') {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (vehicle.cargoType === 'medical') {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-3, -1, 6, 2);
        ctx.fillRect(-1, -3, 2, 6);
      } else {
        // Brick stripes
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(-half + 2, -1, size - 4, 1.5);
      }

      ctx.restore();
    }
  }

  private renderWheel(ctx: CanvasRenderingContext2D, wheel: planck.Body, camera: Camera, world: World): void {
    const pos = wheel.getPosition();
    const angle = wheel.getAngle();
    const pt = camera.worldToScreen(pos.x, pos.y, world);
    const r = Math.round(0.52 * CPM); // ~8px

    ctx.save();
    ctx.translate(Math.round(pt.x), Math.round(pt.y));
    ctx.rotate(-angle);

    // Tire tread
    ctx.fillStyle = '#1E1E22';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#09090b';
    ctx.stroke();

    // Steel Hub
    ctx.fillStyle = '#9AA3AD';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // 4 visible spokes so wheel rotation reads cleanly
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-r + 1, 0); ctx.lineTo(r - 1, 0);
    ctx.moveTo(0, -r + 1); ctx.lineTo(0, r - 1);
    ctx.stroke();

    ctx.restore();
  }

  private renderRopeAndHook(ctx: CanvasRenderingContext2D, hook: HookManager, vehicle: Vehicle, camera: Camera, world: World): void {
    if (hook.state === 'IDLE' || hook.state === 'COOLDOWN') return;

    const mountWorld = hook.getMountWorldPos(vehicle);
    const mPt = camera.worldToScreen(mountWorld.x, mountWorld.y, world);

    let endWorld = hook.projPos;
    if (hook.state === 'ATTACHED') {
      endWorld = hook.attachPos;
    }
    const ePt = camera.worldToScreen(endWorld.x, endWorld.y, world);

    // Tension-based rope color (turns amber then red)
    let ropeColor = '#cbd5e1';
    if (hook.tensionRatio > 0.8) ropeColor = '#ef4444';
    else if (hook.tensionRatio > 0.5) ropeColor = '#f59e0b';

    ctx.strokeStyle = ropeColor;
    ctx.lineWidth = 1;

    // Slight sag when slack
    ctx.beginPath();
    ctx.moveTo(Math.round(mPt.x), Math.round(mPt.y));
    const midX = (mPt.x + ePt.x) * 0.5;
    const sag = hook.state === 'ATTACHED' && hook.tensionRatio < 0.2 ? 3 : 0;
    const midY = (mPt.y + ePt.y) * 0.5 + sag;
    ctx.quadraticCurveTo(midX, midY, Math.round(ePt.x), Math.round(ePt.y));
    ctx.stroke();

    // 5x5 Hook Sprite
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(Math.round(ePt.x) - 2, Math.round(ePt.y) - 2, 5, 5);
    ctx.fillStyle = '#475569';
    ctx.fillRect(Math.round(ePt.x) - 1, Math.round(ePt.y) - 1, 3, 3);
  }

  private renderAimReticle(
    ctx: CanvasRenderingContext2D,
    hook: HookManager,
    vehicle: Vehicle,
    aimWorld: { x: number; y: number },
    camera: Camera,
    world: World
  ): void {
    const mountWorld = hook.getMountWorldPos(vehicle);
    const mPt = camera.worldToScreen(mountWorld.x, mountWorld.y, world);
    const aPt = camera.worldToScreen(aimWorld.x, aimWorld.y, world);

    // Dotted aim line
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(mPt.x), Math.round(mPt.y));
    ctx.lineTo(Math.round(aPt.x), Math.round(aPt.y));
    ctx.stroke();

    // Aim crosshair
    ctx.strokeStyle = '#38bdf8';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(aPt.x, aPt.y, 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  private renderParticles(ctx: CanvasRenderingContext2D, particles: ParticleSystem, camera: Camera, world: World): void {
    // Flying mass cells
    for (const p of particles.particles) {
      const pt = camera.worldToScreen(p.x, p.y, world);
      const pal = MAT_COLOR_U32[p.mat] || MAT_COLOR_U32[MAT_ID.SAND];
      const color = pal[p.colorVar % pal.length];
      const r = color & 0xff;
      const g = (color >> 8) & 0xff;
      const b = (color >> 16) & 0xff;

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), 1.5, 1.5);
    }

    // Cosmetic FX
    for (const fx of particles.fxList) {
      const pt = camera.worldToScreen(fx.x, fx.y, world);
      ctx.fillStyle = fx.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, fx.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderDebugWireframe(ctx: CanvasRenderingContext2D, vehicle: Vehicle, camera: Camera, world: World): void {
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1;
    const cPos = vehicle.chassisBody.getPosition();
    const cPt = camera.worldToScreen(cPos.x, cPos.y, world);
    ctx.strokeRect(cPt.x - 20, cPt.y - 10, 40, 20);
  }
}

