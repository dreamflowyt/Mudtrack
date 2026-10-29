import { World } from './World';
import { LevelDef, TerrainFeature } from '../types';
import { MAT_ID } from '../data/materials';
import { CellSim } from './CellSim';
import { GLOBALS } from '../data/globals';

export class LevelGenerator {
  public static generate(def: LevelDef, cellSim: CellSim): World {
    const world = new World(def.size_m.w, def.size_m.h, def.seed);
    world.entities = [...def.entities];

    const gridW = world.gridW;
    const gridH = world.gridH;
    const rng = world.rng;

    // 1. Generate 1D baseline heightmap
    const heightmapM = new Float32Array(gridW);
    const baselineYM = def.terrain.baselineY_m;
    const noiseConf = def.terrain.noise;

    for (let x = 0; x < gridW; x++) {
      const xm = world.worldX(x);
      // Multi-octave sinusoidal noise
      let n = 0;
      for (let oct = 1; oct <= noiseConf.octaves; oct++) {
        const freq = (2 * Math.PI) / (noiseConf.wavelength_m / oct);
        const amp = noiseConf.amplitude_m / oct;
        n += Math.sin(xm * freq + def.seed * 0.1 * oct) * amp;
      }
      heightmapM[x] = baselineYM + n;
    }

    // 2. Apply baseline modifications from terrain features (hills, valleys, cliffs)
    for (const feat of def.features) {
      LevelGenerator.applyElevationFeature(feat, heightmapM, world);
    }

    // 3. Fill base layers (Dirt over Rock)
    const dirtThicknessM = def.terrain.layers.find((l) => l.material === 'DIRT')?.thickness_m ?? 4.0;

    for (let x = 0; x < gridW; x++) {
      const surfaceYM = heightmapM[x];
      const surfaceCellY = world.cellY(surfaceYM);
      const dirtBottomCellY = world.cellY(surfaceYM - dirtThicknessM);

      for (let y = 0; y < gridH; y++) {
        const idx = y * gridW + x;
        if (y < surfaceCellY) {
          world.mat[idx] = MAT_ID.AIR;
          world.aux[idx] = 0;
        } else if (y <= dirtBottomCellY) {
          world.mat[idx] = MAT_ID.DIRT;
          world.aux[idx] = (rng.rangeInt(0, 5) & 7);
        } else {
          world.mat[idx] = MAT_ID.ROCK;
          world.aux[idx] = (rng.rangeInt(0, 5) & 7);
        }
      }
    }

    // 4. Carve and deposit secondary features (sand patches, mud pits, rivers, tunnels, bridges)
    for (const feat of def.features) {
      LevelGenerator.applyVolumetricFeature(feat, heightmapM, world);
    }

    // 5. Pre-settle simulation (300 ticks) so all sand, mud, and water are in equilibrium
    const preSettleTicks = GLOBALS.sim.preSettleTicks;
    for (let t = 0; t < preSettleTicks; t++) {
      cellSim.step(world, true);
    }

    // 6. Capture pristine snapshot for instant retry
    world.takeSnapshot();

    return world;
  }

  private static applyElevationFeature(feat: TerrainFeature, heightmap: Float32Array, world: World): void {
    const startX = world.cellX(feat.x_m - feat.width_m * 0.5);
    const endX = world.cellX(feat.x_m + feat.width_m * 0.5);

    switch (feat.type) {
      case 'hill': {
        const h = feat.height_m ?? 6;
        for (let x = startX; x <= endX; x++) {
          if (x < 0 || x >= heightmap.length) continue;
          const xm = world.worldX(x);
          const t = (xm - (feat.x_m - feat.width_m * 0.5)) / feat.width_m;
          // Smooth bell curve
          const shape = 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
          heightmap[x] += h * shape;
        }
        break;
      }
      case 'valley': {
        const d = feat.depth_m ?? 4;
        for (let x = startX; x <= endX; x++) {
          if (x < 0 || x >= heightmap.length) continue;
          const xm = world.worldX(x);
          const t = (xm - (feat.x_m - feat.width_m * 0.5)) / feat.width_m;
          const shape = 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
          heightmap[x] -= d * shape;
        }
        break;
      }
      case 'cliff_step': {
        const h = feat.height_m ?? 8;
        for (let x = startX; x <= endX; x++) {
          if (x < 0 || x >= heightmap.length) continue;
          const xm = world.worldX(x);
          const t = Math.max(0, Math.min(1, (xm - (feat.x_m - feat.width_m * 0.5)) / feat.width_m));
          // Sigmoid step
          const step = 1 / (1 + Math.exp(-10 * (t - 0.5)));
          heightmap[x] += h * step;
        }
        break;
      }
    }
  }

  private static applyVolumetricFeature(feat: TerrainFeature, heightmap: Float32Array, world: World): void {
    const gridW = world.gridW;
    const gridH = world.gridH;
    const rng = world.rng;

    const startX = world.cellX(feat.x_m - feat.width_m * 0.5);
    const endX = world.cellX(feat.x_m + feat.width_m * 0.5);

    switch (feat.type) {
      case 'sand_patch': {
        const depthM = feat.depth_m ?? 1.5;
        for (let x = startX; x <= endX; x++) {
          if (x < 0 || x >= gridW) continue;
          const xm = world.worldX(x);
          const t = (xm - (feat.x_m - feat.width_m * 0.5)) / feat.width_m;
          const shape = 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
          const carveDepth = depthM * shape;
          const surfaceY = world.cellY(heightmap[x]);
          const bottomY = world.cellY(heightmap[x] - carveDepth);

          for (let y = surfaceY; y <= bottomY; y++) {
            if (y >= 0 && y < gridH) {
              const idx = y * gridW + x;
              world.mat[idx] = MAT_ID.SAND;
              world.aux[idx] = (rng.rangeInt(0, 5) & 7);
            }
          }
        }
        break;
      }

      case 'mud_pit': {
        const depthM = feat.depth_m ?? 1.2;
        for (let x = startX; x <= endX; x++) {
          if (x < 0 || x >= gridW) continue;
          const xm = world.worldX(x);
          const t = (xm - (feat.x_m - feat.width_m * 0.5)) / feat.width_m;
          const shape = 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
          const pitDepth = depthM * shape;
          const surfaceY = world.cellY(heightmap[x]);
          const bottomY = world.cellY(heightmap[x] - pitDepth);

          for (let y = surfaceY; y <= bottomY; y++) {
            if (y >= 0 && y < gridH) {
              const idx = y * gridW + x;
              world.mat[idx] = MAT_ID.MUD;
              world.aux[idx] = (rng.rangeInt(0, 5) & 7);
            }
          }
        }
        break;
      }

      case 'river': {
        const depthM = feat.depth_m ?? 2.5;
        for (let x = startX; x <= endX; x++) {
          if (x < 0 || x >= gridW) continue;
          const xm = world.worldX(x);
          const t = (xm - (feat.x_m - feat.width_m * 0.5)) / feat.width_m;
          const shape = 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
          const riverDepth = depthM * shape;
          const surfaceY = world.cellY(heightmap[x]);
          const bottomY = world.cellY(heightmap[x] - riverDepth);

          // Carve river bed into solid dirt/rock, fill with water
          for (let y = surfaceY; y <= bottomY; y++) {
            if (y >= 0 && y < gridH) {
              const idx = y * gridW + x;
              world.mat[idx] = MAT_ID.WATER;
              world.aux[idx] = (rng.rangeInt(0, 2) & 7);
            }
          }
          // Reinforce channel bed with rock
          const bedY = bottomY + 1;
          if (bedY < gridH) {
            world.mat[bedY * gridW + x] = MAT_ID.ROCK;
          }
        }
        break;
      }

      case 'dune_field': {
        const heightM = feat.height_m ?? 8.0;
        for (let x = startX; x <= endX; x++) {
          if (x < 0 || x >= gridW) continue;
          const xm = world.worldX(x);
          const t = (xm - (feat.x_m - feat.width_m * 0.5)) / feat.width_m;
          // Asymmetric dune shape (gentle windward slope, sharp slip face)
          const dunePhase = (t * 3) % 1;
          const duneProfile = dunePhase < 0.75 ? dunePhase / 0.75 : (1 - dunePhase) / 0.25;
          const addHeight = heightM * Math.sin(Math.PI * t) * duneProfile;

          const baseSurfaceY = world.cellY(heightmap[x]);
          const duneTopY = world.cellY(heightmap[x] + addHeight);

          for (let y = duneTopY; y <= baseSurfaceY + 16; y++) {
            if (y >= 0 && y < gridH) {
              const idx = y * gridW + x;
              world.mat[idx] = MAT_ID.SAND;
              world.aux[idx] = (rng.rangeInt(0, 5) & 7);
            }
          }
        }
        break;
      }

      case 'flooded_tunnel': {
        // Carves a subterranean tunnel through the hill, filled with water, covered by a rock roof
        const tunnelDepthM = feat.depth_m ?? 3.0;
        const tunnelHeightCells = 24; // 1.5 m tall

        for (let x = startX; x <= endX; x++) {
          if (x < 0 || x >= gridW) continue;
          const surfaceY = world.cellY(heightmap[x]);
          const tunnelFloorY = surfaceY + Math.round(tunnelDepthM * 16);
          const tunnelRoofY = tunnelFloorY - tunnelHeightCells;

          // Roof: reinforced rock
          for (let y = surfaceY; y <= tunnelRoofY; y++) {
            if (y >= 0 && y < gridH) {
              world.mat[y * gridW + x] = MAT_ID.ROCK;
            }
          }

          // Tunnel cavity: flooded with water
          for (let y = tunnelRoofY + 1; y <= tunnelFloorY; y++) {
            if (y >= 0 && y < gridH) {
              world.mat[y * gridW + x] = MAT_ID.WATER;
            }
          }
        }
        break;
      }
    }
  }
}
