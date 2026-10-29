# SANDHAUL — 2D Physics Delivery & Particle-Sim World MVP

A browser-playable 2D physics delivery game where a delivery truck traverses dynamic particle-simulated terrain (sand, mud, water, rock, dirt). Combines a custom falling-sand cellular automata engine with Planck.js 2D rigid-body vehicle mechanics, dual drivetrain (combustion engine & electric battery), grappling hook & winch, fragile cargo delivery, and a 5-level campaign with garage upgrades.

***

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX decisions have been established based on your inputs and the technical specification:

- **Audio Implementation**: Initial MVP will run **without audio** to ensure maximum performance, zero asset loading bottlenecks, and clean focus on physics/simulation polish.
- **Input Controls**: **Desktop Keyboard & Mouse** is the primary control scheme (A/D drive, Space handbrake, Mouse aim hook, LMB fire/release, RMB/Shift winch, E toggle electric), accompanied by an **on-screen responsive touch control overlay** for mobile browsers and touch devices.
- **Progression & Testing**: **Standard campaign progression** (sequential level unlocking with 3-star ratings, cash rewards, and garage upgrades) with the **F5 developer sandbox brush** active from the start for instant terrain experimentation and QA testing.
- **Renderer & Display**: Dedicated dual-pass Canvas2D pipeline running at **480 × 270 native resolution** scaled with crisp integer nearest-neighbor scaling to fit any viewport, maintaining the retro sandbox falling-sand aesthetic (Noita / Powder Toy style).

***

## 1. Overview & Core Concept

- **What It Does**: The player drives a customizable delivery truck across living, deformable terrain where sand piles and avalanches, mud oozes and traps wheels, water levels out and floods vehicle cabins, and spinning tires dig realistic ruts. When stuck, players deploy a mouse-aimed grappling hook to winch themselves out, switch to electric drive when the combustion engine stalls underwater, and balance speed against cargo integrity to earn three stars and deliver goods.
- **Target Audience / Persona**: Fans of physics puzzle driving games (*Hill Climb Racing*, *MudRunner*, *SnowRunner*) and sandbox particle simulators (*Noita*, *The Powder Toy*, *Sandspiel*).
- **Key Value**: A novel hybrid simulation combining the tactile satisfaction of pixel cellular automata with deterministic rigid-body vehicle physics, creating emergent challenges where terrain *is* the puzzle.

***

## 2. User Experience & Visual Design

### Key User Flows

1. **Title & Garage**: Players enter the retro-industrial title screen, view unlocked levels on the world map, check coins, and visit the Garage to upgrade their truck (engine torque, all-terrain tires, battery capacity, fording snorkel, fuel tank, and winch strength).
2. **Mission Briefing**: Selecting an unlocked level displays the cargo manifest (Bricks, Eggs, or Medical Supplies), cargo fragility/water sensitivity, par time, base payout, and star objectives.
3. **Driving & Terrain Navigation**:
   - Players drive across dynamic terrain using throttle and pitch control.
   - The HUD clearly displays Fuel, Battery, Cargo Integrity %, Par Timer, and Distance to Goal.
   - When entering mud or steep sand, tires dig ruts; players aim the grappling hook with the mouse and hold winch to pull through.
   - When entering rivers or flooded tunnels, water enters the air intake; the engine stalls with visual cues, prompting a switch to Electric drive (`E`) before cabin flood fills completely.
4. **Mission Result & Retry**:
   - Crossing the finish line triggers an instant calculation of stars (Delivered, Integrity ≥ 80% & Crates ≥ 5, Under Par Time) and coin payouts.
   - Failures (flooded cabin, all cargo destroyed, or vehicle fallen out of bounds) provide an instant retry (< 1 second restart from pre-settled memory snapshots).

### Visual Identity & Theme

- **Aesthetic Direction**: Sandbox pixel simulation with clean industrial utility styling. Warm, earth-toned terrain contrasted with clear blue water and a distinctive red delivery truck.
- **Palette**:
  - *Rock*: Slate greys (`#4A4E59`, `#6B707D`, `#8A8F9E`)
  - *Dirt*: Rich loam browns (`#7A5230`, `#8B6038`, `#6B4527`) with dynamic grass tufts on top surfaces (`#4C8A28`, `#6DB93A`)
  - *Sand*: Golden grains (`#E4C97A`, `#D9BC66`, `#F2DE9E`)
  - *Mud*: Dark viscous mire (`#5A3E2A`, `#4B3322`, `#3E2A1C`)
  - *Water*: Translucent azure (`#3A7BD5`, `#4A8BE0`) at 60% alpha with bright surface highlights (`#9CCBFF`)
  - *Vehicle*: Industrial crimson cab (`#C8402D`), dark charcoal tires (`#1E1E22`), steel hubs (`#9AA3AD`), and light blue cabin glass (`#BFE6FF`)
  - *UI Canvas*: Clean charcoal backdrop (`#12141A`) with warm ochre and mint telemetry accents.
- **Typography & UI Math**:
  - Crisp pixelated fonts for in-game HUD (`font-mono tabular-nums`).
  - Clear, unboxed typography for level information and garage stats with zero decorative clutter.
  - Layered rendering: background sky parallax → solid terrain → background anchor trees/posts → rope → vehicle & cargo → soft & liquid terrain overlay (wheels visibly submerge in mud and sand!) → flying particles → HUD.

***

## 3. Key Product Decisions & Trade-Offs

- **Hybrid Simulation Model (Grid vs. Rigid Bodies)**:
  - *Chosen Approach*: The terrain is simulated on a 2D cellular automata grid (flat typed arrays), while vehicle chassis, wheels, and cargo crates are rigid bodies in Planck.js.
  - *Why*: True rasterized rigid bodies in cellular automata (Noita-style) are computationally expensive and prone to rotational jitter in JavaScript. A hybrid model yields 60 FPS performance on standard laptops with rock-solid Box2D wheel suspension.
- **Soft Material Collision & Erosion**:
  - *Chosen Approach*: Soft materials (sand, mud) are excluded from static rigid collision chains. Instead, wheels rest on an "eroded" surface (sunken by a material-specific `sinkDepth`) combined with real-time drag forces and dynamic wheel digging.
  - *Why*: Prevents rigid-body collision jitter while still visually and physically sinking the wheels into sand and mud.
- **Grappling Hook as Grid DDA Projectile**:
  - *Chosen Approach*: The hook is fired as a fast ballistic projectile ray-marched through the cell grid using digital differential analysis (DDA) rather than a rigid body.
  - *Why*: Eliminates high-speed tunneling through thin terrain and guarantees deterministic attachment to hookable materials (rock, wood, metal, background anchor trees).
- **Fast Snapshot Restarts**:
  - *Chosen Approach*: On level generation, the grid runs 300 pre-settle ticks and stores an immutable `Uint8Array.slice()` snapshot. Level restarts restore memory in < 5ms without regenerating from scratch.

***

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                          SANDHAUL APP                                  │
│                                                                        │
│   ┌───────────────┐   ┌────────────────┐   ┌───────────────────────┐   │
│   │  Title / Map  │◄─►│ Garage / Shop  │◄─►│ Level Playback (Game) │   │
│   └───────────────┘   └────────────────┘   └───────────┬───────────┘   │
│                                                        │               │
│               ┌────────────────────────────────────────┴───────────┐   │
│               ▼                                                    ▼   │
│     ┌──────────────────┐                                 ┌─────────┴─┐ │
│     │ Cellular Grid    │                                 │ Planck.js │ │
│     │ (Falling Sand)   │                                 │ (Physics) │ │
│     ├──────────────────┤                                 ├───────────┤ │
│     │ • mat/aux arrays │◄─────── Coupling Engine ───────►│ • Chassis │ │
│     │ • 32x32 Chunks   │  - Marching Squares chains      │ • Wheels  │ │
│     │ • Water/Mud/Sand │  - Drag & buoyancy forces       │ • Cargo   │ │
│     │ • Digging Roost  │  - Material friction injection  │ • Rope    │ │
│     └──────────────────┘  - Depth erosion & unstick      └───────────┘ │
│                                                                        │
│               ┌────────────────────────────────────────┐               │
│               │ Dual-Pass Canvas2D (480x270 Scaled)    │               │
│               │ Base Solids -> Vehicle -> Soft Overlay │               │
│               └────────────────────────────────────────┘               │
└────────────────────────────────────────────────────────────────────────┘
```

### Core Data Models & Modules

1. **`src/sim/Materials.ts`**:
   - Material definitions: `AIR (0)`, `ROCK (1)`, `DIRT (2)`, `SAND (3)`, `MUD (4)`, `WATER (5)`, `WOOD (6)`, `METAL (7)`.
   - Physics properties: density, grip coefficient, sink depth, drag constant, dig rate, hookable flag.
2. **`src/sim/World.ts` & `src/sim/CellSim.ts`**:
   - Flat `Uint8Array` storage for `mat` and `aux` (colour variation, motion counter, processed parity bit).
   - Chunk grid (32×32 cells) with sleep/awake tracking and active view margin culling.
   - Cellular automata tick: gravity fall, diagonal slide, liquid lateral dispersion, density displacement, and sand+water→mud mixing.
3. **`src/sim/Coupling.ts` & `src/sim/Collision.ts`**:
   - Marching squares extraction with Douglas-Peucker simplification for Planck Chain fixtures.
   - Throttled rebuild queue (max 6 dirty chunks / 1.5ms per frame) prioritized by proximity to chassis.
   - Multisampling around wheels/chassis for water buoyancy, viscous drag, and tire contact friction.
   - Wheel digging: removes soft cells on wheel slip and spawns flying roost particles.
4. **`src/game/Vehicle.ts` & `src/game/Drivetrain.ts`**:
   - Planck rigid body setup with chassis compound fixtures, spring/damper wheel joints, and 6 cargo crates.
   - Drivetrain state machine: Auto/Electric modes, fuel burn, battery drain, engine water intake stall, and cabin flooding failure.
   - Air pitch control when wheels are airborne.
5. **`src/game/Hook.ts`**:
   - Ballistic launch, DDA grid collision against hookable cells & background anchor trees.
   - Planck `RopeJoint` creation, winch in (with distance ratcheting) and winch out, tension monitoring with rope snap limit.
6. **`src/game/Cargo.ts`**:
   - Crate impact force calculation from Planck contact impulses.
   - Water sensitivity and crate loss detection (> 8m from truck).
7. **`src/sim/LevelGen.ts` & Level Definitions (`src/data/levels/*.json`)**:
   - Seeded procedural level generation implementing all 5 specified levels:
     - **Level 1 (Farm Road)**: 300m, Bricks, rolling hills, introductory sand patch.
     - **Level 2 (Mud Season)**: 450m, Eggs, mud pits, anchor trees, winch practice.
     - **Level 3 (Ford Crossing)**: 500m, Bricks, shallow and deep rivers, battery crossing, steep finish.
     - **Level 4 (Dune Sea)**: 600m, Eggs, towering sand dunes, avalanches, momentum challenges.
     - **Level 5 (Mountain Pass)**: 800m, Medical supplies, flooded tunnel shortcut vs steep high rock pass.
8. **`src/render/Renderer.ts` & `src/render/Hud.ts`**:
   - 480 × 270 native pixel buffer scaled up to screen dimensions with aspect preservation.
   - Sky gradient with parallax clouds, terrain rendering (solids base + transparent liquids/soft overlay), vehicle sprite draw with rotation, rope rendering, particle effects, and in-game HUD.
9. **`src/core/Save.ts`**:
   - LocalStorage persistence for unlocked levels, star achievements, best times, collected coins, and purchased truck upgrades.
10. **Developer Sandbox Tool (`F5`)**:
    - Interactive brush tool enabling on-the-fly placement and erasing of sand, mud, water, and rock to inspect physical reactions.

***

## 5. Execution Steps

1. **Install Planck.js (`planck`)**: Add and verify the 2D physics library.
2. **Build Core & Simulation**:
   - Implement data structures (`globals`, `materials`, `vehicles`, `cargo`, `upgrades`).
   - Implement cellular automata engine (`World`, `CellSim`, `Particles`, `Materials`).
   - Implement Marching Squares polyline generator and Planck collision adapter.
3. **Build Vehicle & Coupling**:
   - Implement chassis, wheels, suspension, cargo crates, and hook projectile / rope joint.
   - Implement coupling logic: multisampled buoyancy, fluid drag, contact friction, wheel digging, and unstick safeguards.
4. **Build Game Systems & Levels**:
   - Implement engine stall, cabin flood, battery charging, winch ratcheting, and cargo damage.
   - Implement LevelGen recipe parser and author all 5 levels.
5. **Build Renderer, HUD, Touch Controls & Menus**:
   - Implement dual-pass Canvas2D renderer with integer scaling and low-res pixel styling.
   - Implement HUD, touch control overlay, Title screen, World Map, Briefing modal, Result modal, and Garage screen.
   - Implement F5 sandbox brush tool.
6. **Compile & Verification**:
   - Verify TypeScript compilation and runtime loop stability.
   - Test level progression, vehicle handling, winch recovery, and water fording.
