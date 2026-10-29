# SANDHAUL — MVP Developer Spec

> **Working title (placeholder).** A browser-playable 2D physics delivery game set in a **falling-sand / particle-simulation world**.
> Spec v0.1 · Target: desktop browsers · Stack: TypeScript + Vite + Planck.js + Canvas2D

---

## 0. How to read this document

- §1–3: what we are building and how much of it (MVP).
- §4–9: core technical spec (world, cell simulation, vehicle, terrain coupling, game systems, controls).
- §10–14: game flow, levels, art, UI, code architecture.
- §15–18: QA, milestones, risks, backlog. **Appendix A** holds all config JSON.
- **Every number is a starting value to be tuned.** Keep gameplay numbers in `/src/data/*.json`; never hard-code them.
- Priority tags: **[MUST]** = MVP blocker · **[SHOULD]** = include if time allows · **[COULD]** = nice to have.
- Planck.js API names follow its public docs; verify against the installed version.

---

## 1. Concept

**Pitch:** Drive a delivery truck across a world made of sand, mud, water and rock, where every pixel is simulated. Dig yourself into a mud pit with a spinning wheel, winch yourself out with a grappling hook, switch to battery to cross a river underwater, and get fragile cargo to the finish in one piece.

**Design pillars**
1. **The ground is alive.** Sand piles and slides, mud oozes, water fills holes, wheels dig ruts. The terrain *is* the puzzle.
2. **Deliver under pressure.** Cargo condition, fuel, battery charge and time all tick at once.
3. **Tools over reflexes.** Read the terrain, then pick the tool: momentum, tire pressure, hook + winch, electric mode.
4. **One more try.** Levels last 1–4 minutes, restart takes under 1 s, every level has 3 clear star goals.

**References:** Hill Climb Racing (driving feel) · Noita / The Powder Toy / Sandspiel (pixel-sim look) · MudRunner / SnowRunner (traction puzzles) · Death Stranding (delivery tension).

---

## 2. MVP scope and key decisions

| Area | [MUST] | [SHOULD] | Post-MVP |
|---|---|---|---|
| World | Cell sim: sand, mud, water + static rock, dirt, wood, metal | Sand+water→mud rule, grass rendering | Fire, explosions, ice, snow, rain |
| Vehicle | 1 truck (data-driven, more later), engine + electric drive, suspension | Tire-pressure presets, flip recovery | More vehicles, damage model |
| Tools | Grappling hook + winch, rope snap | Hook on cargo | Rope wrapping, towing NPCs |
| Systems | Fuel, battery, engine stall underwater, cabin flooding, cargo damage | Depots (checkpoint + refuel) | Weather, day/night |
| Meta | 5 levels, 3 stars each, coins, 6 upgrades × 3 tiers, save/load | Seeded "daily" level | Leaderboards, ghosts, multiplayer |
| Platform | Keyboard + mouse, 60 fps on a low-end laptop | Gamepad | Mobile touch |

**Playtest gate (MVP success criteria)**
- New player finishes Level 1 in under 2 min with no instructions.
- At least 70% of testers immediately retry a failed level.
- Hook and underwater driving are understood from in-world hints alone.
- Stable 60 fps, no soft-locks (player can always recover or restart).

**Key architecture decisions (and why)**
1. **Hybrid model.** Terrain = cell grid (custom). Vehicle, wheels, cargo = rigid bodies (Planck.js). We do *not* rasterize the vehicle into the grid (Noita-style); too costly for MVP.
2. **Soft materials (sand, mud) have no direct collision.** The vehicle collides with an *eroded* surface (it sits slightly inside soft material) plus a force model (drag, grip, digging). See §7.
3. **Hook is a custom projectile** (grid DDA ray-march), not a physics body: deterministic, no tunneling.
4. **Flat typed arrays** for the whole level (no sparse chunk storage). Chunks only track sleep/wake and dirty state.
5. **Anchors (trees, posts) live in the background plane.** They are hookable entities with no collision, so they never block the road.

---

## 3. Tech stack and performance

| Concern | Choice |
|---|---|
| Language / build | TypeScript (strict) + Vite, static output |
| Rigid bodies | `planck` (Planck.js, Box2D port) |
| Cell simulation | Custom, typed arrays, no library |
| Rendering | Canvas2D: `ImageData` for cells + `drawImage` for sprites on a low-res canvas, scaled up. No WebGL in MVP |
| Audio | Web Audio API (or Howler.js) |
| Tests | Vitest |
| Persistence | `localStorage`, key `sandhaul.save.v1` |
| Hosting | Any static host (itch.io, GitHub Pages, Netlify) |

**Rules**
- Target: 60 fps in current Chrome on a low-end laptop (~8 GB RAM, integrated GPU).
- **Determinism:** fixed timestep 1/60 s, seeded xorshift32 RNG, never call `Math.random()` inside simulation code.
- No game framework. The renderer and grid are custom, so Phaser etc. add little.

**Frame budget (16.6 ms)**

| Subsystem | Budget |
|---|---|
| Cell simulation | ≤ 3.0 ms |
| Planck step | ≤ 2.5 ms |
| Collision rebuild (throttled) | ≤ 1.5 ms |
| Terrain coupling (sampling, digging) | ≤ 1.0 ms |
| Rendering | ≤ 4.0 ms |
| Game logic + HUD | ≤ 1.5 ms |
| **Headroom** | **≥ 3 ms** |

Fallbacks if over budget (adaptive quality, trigger when frame time > 20 ms for 2 s): shrink the active sim region, run the cell sim at 30 Hz on alternating chunk checkerboards, cap particles.

---

## 4. World, units, resolution

| Constant | Value | Notes |
|---|---|---|
| `CELLS_PER_METER` | 16 | 1 cell = 6.25 cm. Single constant; everything derives from it |
| View | 480 × 270 cells | = 30 m × 16.9 m on screen |
| Display | Integer scale (×2…×6) to fit the window, letterboxed | CSS `image-rendering: pixelated`, `imageSmoothingEnabled = false` |
| Physics units | meters, kg, seconds, **y-up** | gravity 9.81 m/s² |
| Grid | **y-down**, origin top-left | |
| Max level | 800 m × 96 m = 12,800 × 1,536 cells | ≈ 19.7 M cells |
| Chunk | 32 × 32 cells (2 m) | sleep/wake, collision rebuild, dirty tracking |
| Timestep | Fixed 1/60 s; Planck 8 velocity / 3 position iterations | |

```ts
const CPM = 16;
// level origin = bottom-left, physics y-up; grid y-down
cellX = Math.floor(x_m * CPM);
cellY = gridH - 1 - Math.floor(y_m * CPM);
x_m   = (cellX + 0.5) / CPM;
y_m   = (gridH - 1 - cellY + 0.5) / CPM;
```

**Memory:** two flat arrays per level: `mat: Uint8Array(W*H)` and `aux: Uint8Array(W*H)` → about 40 MB at max size.

**`aux` bit layout (per cell)**

| Bits | Meaning |
|---|---|
| 0–2 | Colour variation index (0–7); travels with the cell when it moves |
| 3 | "Processed this tick" parity flag |
| 4–5 | Motion counter (set to 3 on move, decays by 1 per scan; 0 = settled) |
| 6–7 | Wetness 0–3 **[SHOULD]** |

---

## 5. Cell simulation (falling sand)

### 5.1 Materials

Material IDs are `Uint8`. Full parameters live in `materials.json` (Appendix A).

| ID | Name | Class | Density | Grip μ | Sink depth (m) | Drag K | Hookable |
|---|---|---|---|---|---|---|---|
| 0 | AIR | EMPTY | 1 | – | – | 0 | – |
| 1 | ROCK | SOLID | 2600 | 0.95 | 0 | 0 | yes |
| 2 | DIRT | SOLID | 1800 | 0.85 | 0 | 0 | no |
| 3 | SAND | GRANULAR | 1600 | 0.60 | 0.06 | 150 | no |
| 4 | MUD | VISCOUS | 1900 | 0.20 | 0.45 | 1200 | no |
| 5 | WATER | LIQUID | 1000 | – | – | 250 | no |
| 6 | WOOD | SOLID | 700 | 0.70 | 0 | 0 | yes |
| 7 | METAL | SOLID | 7800 | 0.60 | 0 | 0 | yes |

- SOLID cells never move in MVP (no destruction).
- **Displacement order by density:** MUD > SAND > WATER > AIR. Heavier cells sink through lighter liquids.

### 5.2 Tick algorithm **[MUST]**

Runs once per fixed step. Scan awake chunks bottom → top; alternate horizontal scan direction every tick to avoid directional bias.

```ts
function stepCells(w: World) {
  w.tick++;
  const par = w.tick & 1;
  const flip = (w.tick & 2) !== 0;                 // alternate scan direction
  for (const c of w.awakeChunks /* lowest chunks first */) {
    let moved = false;
    for (let y = c.y1 - 1; y >= c.y0; y--) {       // grid y-down: bottom of screen = high y
      for (let i = 0; i < CH; i++) {
        const x = flip ? c.x1 - 1 - i : c.x0 + i;
        const idx = y * W + x;
        const m = w.mat[idx];
        if (m === AIR || CLS[m] === SOLID) continue;
        if (((w.aux[idx] >> 3) & 1) === par) continue;   // already handled this tick
        decayMotion(idx);
        if (stepCell(w, x, y, idx, m, par)) moved = true;
      }
    }
    c.idle = moved ? 0 : c.idle + 1;
    if (c.idle > SLEEP_AFTER) w.sleep(c);          // 30 ticks
  }
}
```

`stepCell` rules:

```ts
function stepCell(w, x, y, idx, m, par): boolean {
  const p = P[m];
  if (p.cls === VISCOUS && w.rng.next() > p.flowChance) return stay(idx, par);
  if (tryMove(w, idx, idx + W, m, par)) return true;                    // 1. straight down
  const dir = w.rng.bit() ? 1 : -1;
  if (w.rng.next() < p.diagChance) {                                    // 2. diagonals
    if (tryMove(w, idx, idx + W + dir, m, par)) return true;
    if (tryMove(w, idx, idx + W - dir, m, par)) return true;
  }
  if (p.cls === LIQUID) {                                               // 3. liquids spread sideways
    for (const d of [dir, -dir]) {
      let tx = x;
      for (let k = 1; k <= p.dispersion; k++) {
        if (!canEnter(w, m, y * W + x + d * k)) break;
        tx = x + d * k;
      }
      if (tx !== x) { swap(w, idx, y * W + tx, par); return true; }
    }
  }
  return stay(idx, par);
}
```

- `tryMove` swaps the two cells (carrying `aux` colour bits), sets motion counter = 3 on the mover, sets the "processed" parity bit on **both** swapped cells, and wakes the affected chunks.
- `canEnter(m, target)`: target is AIR, **or** target is LIQUID with lower density than `m` and `rng < sinkChance` (0.6).
- Diagonal moves are allowed only if the target cell is enterable (no extra corner rules needed for MVP).

**Per-material behaviour (from `materials.json`)**

| Material | flowChance | diagChance | dispersion | Feel |
|---|---|---|---|---|
| SAND | 1.0 | 0.90 | – | Piles at roughly 40°, flows quickly |
| MUD | 0.10 | 0.03 | – | Sits in lumps, oozes slowly |
| WATER | 1.0 | 1.0 | 5 | Levels out, fills holes |

### 5.3 Sleeping and waking **[MUST]**
- A chunk sleeps after 30 idle ticks. Any cell change wakes its chunk, plus the neighbour chunk if the change is within 1 cell of a shared edge.
- **Active region:** only chunks within the camera view + 3 chunks (6 m) are simulated; others stay frozen.
- **Pre-settle:** on level load, run 300 ticks of simulation behind the loading screen so all sand/water/mud starts at rest.
- **Fast restart:** keep a pristine copy of `mat`/`aux` after pre-settle; restart = `TypedArray.set()` copy + vehicle respawn (target < 1 s).

### 5.4 Flying cells ("particles") **[MUST]**
Pool of 1,024 entries (structure-of-arrays): `x, y, vx, vy, mat, life`. Used by wheel digging (§7.5).
- Integrate with gravity each tick. On entering a non-AIR cell, deposit the cell in the last free position (search upward if needed); mass is conserved.
- If `life` expires (3 s) or the particle leaves the active region, deposit it at the nearest free cell below.
- Separate **cosmetic** pool (dust, splash, bubbles; no mass, 1 px, short life) [SHOULD].

### 5.5 Extra rules **[SHOULD]**
- SAND or DIRT-adjacent-to-WATER → MUD: probability 0.0008 per tick per water neighbour; consumes the water cell with probability 0.4. Produces muddy shorelines.
- Wetness bits darken wet sand when rendered. **[COULD]**

### 5.6 Sandbox brush (dev tool) **[MUST for dev builds]**
Key `F5`: paint any material with the mouse (number keys pick material, wheel changes radius). Needed for tuning and QA; likely to ship later as a toy mode.

---

## 6. Vehicle and drivetrain

### 6.1 Rigid bodies (Planck.js) **[MUST]**
- **Chassis:** one dynamic body with compound box fixtures (frame, cab, hood, bed walls). Set mass explicitly (`setMassData`); centre of mass slightly low (`[0, -0.1]`).
- **Wheels:** 2 circle bodies (radius 0.52 m), each attached with a `WheelJoint` (axis `(0,1)`, spring + damper). Both wheels are motorised (AWD).
- **Cargo:** 6 dynamic box bodies (0.8 × 0.8 m) loaded into the bed at level start.
- **Local-space points (not bodies):** hook mount, engine air intake, cabin seal point.
- **Collision categories:** `TERRAIN=1, CHASSIS=2, WHEEL=4, CARGO=8`.
  Wheels ↔ terrain only · chassis ↔ terrain + cargo · cargo ↔ terrain + chassis + cargo.
- Flag wheels as `bullet` if tunneling shows up at speed.

All dimensions, masses and limits: `vehicles.json` (Appendix A).

### 6.2 Drive model

```
throttle ∈ [-1, 1]           D/→ = +1 (right), A/← = -1, smoothed: rise 4/s, fall 8/s
speedRatio  = clamp(|ωwheel| / ωmax, 0, 1)
torqueAvail = peakTorque * (1 - 0.6 * speedRatio²) * upgradeMult
motorSpeed  = -throttle * ωmax        // Box2D: +ω is CCW, so driving right = negative
joint.setMotorSpeed(motorSpeed)
joint.setMaxMotorTorque(torqueAvail)
```

- **Braking:** if throttle opposes wheel rotation, set motor speed 0 and max torque = `brakeTorque` (1800 N·m).
- **Handbrake (Space):** rear wheel motor speed 0, torque 2500 N·m.
- **Coasting:** motors off; wheel angular damping gives light rolling resistance.
- No gearbox in MVP.

### 6.3 Drive modes

| Mode | Available when | Peak torque (per wheel) | Max wheel ω |
|---|---|---|---|
| ENGINE | fuel > 0 and engine state = RUNNING | 3000 N·m | 31 rad/s (≈ 16 m/s) |
| ELECTRIC | battery > 0 | 1500 N·m | 13 rad/s (≈ 6.8 m/s) |

- **AUTO (default):** use ENGINE when available, else ELECTRIC. Switch is instant; HUD flashes the mode label.
- Player can force ELECTRIC with `E` (saves fuel; useful before entering water).
- If neither is available the truck coasts; show "NO POWER".

### 6.4 Air control **[MUST]**
When no wheel touches terrain: A/D apply pitch torque ±1200 N·m to the chassis and angular damping rises to 0.6.

### 6.5 Recovery **[MUST]**
- **Flipped detection:** chassis angle beyond ±100° and speed < 1 m/s for 2 s → HUD prompt "Hold R to recover".
- **Recover (hold R 1 s):** teleport upright at last depot/start, cargo re-seated, payout −15%.
- **Unstick (automatic):** see §7.6.

---

## 7. Terrain ↔ vehicle coupling (main technical risk)

Rigid bodies never live inside the grid and the grid never contains bodies. They interact through five channels: (1) collision geometry, (2) per-material friction, (3) drag/buoyancy forces, (4) digging, (5) draw order.

### 7.1 Collision mask **[MUST]**
Each cell is "collidable" by these rules:
- **SOLID** → always.
- **GRANULAR / VISCOUS** → only if **settled** (motion counter = 0) **and** deeper than `sinkDepth` below the top of its contiguous column run (*erosion*).
- **LIQUID / AIR** → never.

Erosion: scan each column top-down; at the first soft cell after a non-soft cell, mark the first `N = round(sinkDepth_m × CPM × tireSinkMult)` cells of that run as non-collidable.
Effect: wheels rest *inside* the soft layer: about 1 cell on sand, about 7 cells (0.45 m) on mud. If the layer is thinner than `sinkDepth`, wheels simply rest on the solid underneath.

### 7.2 Mask → Planck geometry **[MUST]**
1. Per 32×32 chunk (with 1-cell overlap so seams match), run **marching squares** on the mask and trace polylines.
2. Simplify (Douglas–Peucker, ε = 0.6 cell); optional 1-pass Chaikin smoothing on slopes **[SHOULD]**.
3. Convert to metres, create `Chain` fixtures on one static body per chunk (friction 1, restitution 0; real friction is overridden in §7.3).
4. Only keep bodies for chunks within **20 m** of the chassis (create/destroy with 4 m hysteresis).
5. **Rebuild queue:** a chunk is dirty when its mask hash changes. Sort by distance to chassis; budget ≤ 6 chunks and ≤ 1.5 ms per frame; chunks under the vehicle first.
6. Add a static chain for the level floor and side walls.

### 7.3 Per-material friction **[MUST]**
In Planck's `pre-solve` for wheel/chassis ↔ terrain contacts:
- Sample cells within 3 cells of the contact point; pick the dominant material (ties → lowest grip).
- `contact.setFriction(material.grip × wheelGrip × tireMult)`; cache per contact for 4 steps.

Resulting feel (truck weight ≈ 22 kN): rock ≈ climbs ~40°, sand ≈ climbs ~30° with momentum, mud ≈ almost no climbing.

### 7.4 Drag and buoyancy **[MUST]**
Each step, sample points in/around each body: wheel = 21 points in the disc, chassis = precomputed 0.25 m grid inside the hull (~60 points), crate = 5 points. Transform to world, look up cells, count per material.

- **Drag:** `F = −Σ dragK_m × area_m × v`, where `area_m = (count_m / N) × bodyArea`. Add angular drag `τ = −0.5 × dragCoeff × ω`.
- **Buoyancy (LIQUID only):** `F_up = ρ × g × area_wet × bodyDepthZ × buoyancyFactor`, applied at the centroid of wet sample points (this tilts the vehicle naturally).
  `bodyDepthZ = 2.0 m`; truck `buoyancyFactor = 0.08` (sinks slowly), a future amphibious vehicle uses ~0.14 (floats).
- Apply with `applyForce(force, point, true)`.

### 7.5 Wheel digging **[MUST]**
Per wheel, per step:
- `slip = clamp((|ω|·r − |v_forward|) / max(|ω|·r, 0.5), 0, 1)`
- Trigger when: ≥ 3 soft cells in the contact ring, `slip > 0.35`, `|ω| > 3 rad/s`.
- `digBudget += digRate[material] × slip × dt` (SAND 30 cells/s, MUD 45 cells/s). For every whole unit: remove the topmost soft cell in the lower half of the wheel disc (radius r + 0.05 m) and spawn a flying cell:
  `vx = −travelDir × U(2, 5) m/s`, `vy = U(1.5, 4) m/s`.
- Max 8 cells per wheel per step. The surface lowers, the wheel sinks, ruts form, and getting **stuck emerges naturally**; the hook is the answer.

### 7.6 Stuck-in-solid recovery **[MUST]**
Each step, test wheel centres and chassis hull corners against the mask. If any is inside a collidable cell, raise the body in 1-cell steps (max 1 m) and damp velocity ×0.5. Log an event for QA. (Protects against tunneling when terrain changes under the vehicle.)

### 7.7 Draw order **[MUST]**
Back → front: sky/parallax → **solid cells** → anchors/background decor → rope → **vehicle + cargo** → **soft & liquid cells (overlay)** → particles → HUD.
Soft/liquid cells draw *over* the vehicle, so wheels visibly sink into sand and mud and the truck is seen through water (water alpha ≈ 0.6).

---

## 8. Game systems

### 8.1 Fuel
- Burn per second while engine RUNNING: `idle + (full − idle) × |throttle|` (0.01 → 0.25 units/s).
- Tank 40 units (upgradable). At 0: engine stops ("OUT OF FUEL"); electric still works.

### 8.2 Battery
- Capacity 100 units (upgradable).
- **Drain:** `4.0 × |throttle|` per second in ELECTRIC mode, 0.15/s baseline when the engine is off.
- **Charge:** alternator +1.2/s while engine RUNNING and throttle > 0.05; **regen** while braking/coasting at speed: `min(3.0, 0.35 × |v|)` per second.
- At 0 the electric drive is unavailable.

### 8.3 Engine stall and restart **[MUST]**
State machine: `RUNNING → (intake point in WATER ≥ 0.3 s) → STALLED → (intake dry ≥ 1.0 s) → RESTARTING (0.8 s) → RUNNING`.
While STALLED, AUTO mode switches to ELECTRIC if battery remains. Sound and HUD cue on each transition.
Intake point is at local `[2.0, 0.75]` (hood top), so the truck fords about 0.9 m on engine power; the fording upgrade raises it.

### 8.4 Cabin flooding **[MUST]**
- While the seal point (local `[1.3, 0.85]`) is in WATER: `flood += 0.06 /s` (× upgrade multiplier); otherwise `flood −= 0.03 /s`.
- `flood ≥ 1.0` → electronics short, **level failed** ("Vehicle flooded").
- HUD flood bar appears only while `flood > 0`.
- This caps underwater time (~16 s at base) and makes battery crossings a timing decision, not a free pass.

### 8.5 Grappling hook and winch **[MUST]**

**State machine:** `IDLE → FLYING → ATTACHED` or `FLYING → MISS_RETRACT → COOLDOWN → IDLE`; release from `FLYING/ATTACHED → COOLDOWN`.

- **Aim:** angle from the hook mount (local `[1.7, 1.2]`) to the mouse cursor in world space; 360° allowed. Draw an aim line + range arc while IDLE.
- **Launch:** projectile speed 28 m/s, gravity scale 0.6, max rope length 18 m (upgradable), max flight time 0.9 s.
- **Hit detection (custom, per step):** march the projectile segment through the grid with DDA.
  - First non-AIR cell: if material is hookable (ROCK/WOOD/METAL) → ATTACH at that point. If SAND/MUD/DIRT/WATER → MISS (hook plops, retracts after 0.5 s).
  - Also segment-vs-circle test against **anchor entities** (background trees/posts/spires, radius ~0.6 m). Anchor entities take priority if closer.
- **Rope:** on attach, create a static anchor body and a `RopeJoint` (max length = current distance). Slack is allowed.
- **Winch in (hold RMB/Shift):** while the rope is taut, apply `winchForce` (18 kN) from the mount toward the anchor, and **ratchet** the max length: `maxLength = min(maxLength, dist + 0.05)` so slack never returns. Minimum length 1.5 m.
- **Winch out (hold Ctrl):** extend max length 3 m/s up to the max rope length.
- **Tension:** read from the joint reaction force. Above 80% of `breakTension` (35 kN): HUD bar turns red + creak sound. Above 100% for 0.3 s: **rope snaps**, 1.5 s cooldown.
- The rope passes through terrain in MVP (no wrapping).
- Draw: 1 px line (Bresenham on the low-res canvas), slight sag when slack, 5×5 hook sprite.

### 8.6 Cargo **[MUST]**
- 6 crates (0.8 m) in the bed (2 layers of 3). Top layer can slide off on big jumps; that is intended.
- **Impact damage:** in Planck `post-solve`, for crate contacts: `impulse = Σ normalImpulses`; if `impulse > hitThresholdNs` → `integrity −= (impulse − threshold) × damagePerNsOver` (per crate, 0–100).
- **Water damage:** crate sample points in WATER → `integrity −= waterDamagePerSec × dt`.
- **Lost crate:** > 8 m from chassis or inside the mask for 2 s → counts as 0%.
- **Cargo integrity** = mean of the 6 crates (lost = 0). If all crates ≤ 0 → level failed ("Cargo destroyed").
- Cargo types (data-driven, Appendix A): **bricks** (tough, waterproof), **eggs** (very fragile), **medical** (fragile + water-sensitive).

### 8.7 Fail and win conditions
- **Win:** chassis inside the finish zone with ≥ 1 crate inside the zone.
- **Fail:** flooded · all cargo destroyed · fell out of world (y < −10 m) · player chooses Restart.
- No hard time limit in MVP (par time only affects stars).

### 8.8 Depots **[SHOULD]**
Zone entities. Stopping inside for 2 s: fuel +50% of tank, battery to full (once per depot per run) and sets the respawn point. Cargo is **not** repaired.

---

## 9. Controls

| Action | Keyboard / mouse | Gamepad **[SHOULD]** |
|---|---|---|
| Gas / forward | D or → | RT |
| Brake / reverse | A or ← | LT |
| Handbrake | Space | B |
| Pitch in air | A / D | Left stick |
| Aim hook | Mouse | Right stick |
| Fire / release hook | LMB | RB |
| Winch in (hold) | RMB or Shift | X |
| Winch out (hold) | Ctrl | Y |
| Toggle AUTO / ELECTRIC | E | D-pad up |
| Tire pressure (Low / Normal / High) **[SHOULD]** | T | D-pad down |
| Recover (hold 1 s) | R | Back |
| Restart level (hold 0.5 s) | Backspace | – |
| Pause | Esc | Start |
| Debug (dev builds) | F3 overlay · F4 collision wireframe · F5 sandbox brush · F6 slow-mo | – |

Rebindable keys **[COULD]**.

---

## 10. Game flow, economy, scoring

**Screens:** Title → World map (level select, stars) → Briefing (cargo, pay, par time, star goals) → Play → Result → Garage / Next / Retry. Pause menu and Settings (volume, show debug).

**Retry must feel instant:** from the fail screen, Retry reloads the pre-settled snapshot (§5.3) in < 1 s.

**Stars (per level)**
- ★ Delivered.
- ★★ Cargo integrity ≥ 80% and ≥ 5 crates delivered.
- ★★★ Finished within par time.

**Payout**
```
payout = round( basePay × (0.4 + 0.6 × integrity/100) × (time <= par ? 1.25 : 1.0) × (1 − recoverPenalty) )
firstClearBonus = 50
```
Levels unlock sequentially (≥ 1 star on the previous one). Replays pay full payout (no farming cap in MVP).

**Garage upgrades** (6 × 3 tiers; costs and effects in Appendix A): Engine, All-terrain tires, Battery pack, Fording kit (raised intake + better seals), Fuel tank, Winch & rope.

**Save schema (`localStorage`)**
```json
{
  "version": 1,
  "coins": 0,
  "upgrades": { "engine": 0, "tires": 0, "battery": 0, "fording": 0, "tank": 0, "winch": 0 },
  "levels": { "L1_farm_road": { "stars": 0, "bestTime": null } },
  "settings": { "musicVol": 0.6, "sfxVol": 0.8, "showDebug": false }
}
```
Wrap all storage access in try/catch (private mode can throw).

---

## 11. Levels

### 11.1 The five MVP levels

| # | Name | Length | Cargo | Teaches | Key obstacles | Par | Base pay |
|---|---|---|---|---|---|---|---|
| 1 | Farm Road | 300 m | Bricks | Driving, fuel, momentum | Rolling hills ≤ 22°, one sand patch | 70 s | 200 |
| 2 | Mud Season | 450 m | Eggs | Hook + winch | Two mud pits (6 m and 10 m wide, 0.9 m deep), anchor trees, fragile cargo, depot | 110 s | 350 |
| 3 | Ford Crossing | 500 m | Bricks | Battery + fording | Shallow ford (1 m), deep river (3.2 m deep × 26 m wide), sand, mud pit, 33° final hill | 120 s | 500 |
| 4 | Dune Sea | 600 m | Eggs | Sand dynamics, run-ups, fuel planning | Dunes up to 30°, loose-sand avalanches, soft climbs, mid-level depot | 140 s | 700 |
| 5 | Mountain Pass | 800 m | Medical | Everything | **Two routes:** flooded tunnel 25 m (shortcut, water damages cargo) vs high pass (35° rock climbs, fuel-hungry); mud + water combos; depots | 200 s | 1000 |

### 11.2 Level design rules
- Every obstacle has **at least two solutions** (momentum, hook, route, electric mode).
- Every mud pit has a hookable anchor within 15 m of both its near and far side.
- Show a world-space hint sign at the first appearance of each mechanic (hook, stall, flood, tire pressure).
- Depots about every 200 m from Level 2 onward.
- Solvable with base upgrades on Levels 1–3; Levels 4–5 are comfortable with 2–3 upgrades.

### 11.3 Level authoring: recipe JSON → generator **[MUST]**
Levels are data (`/src/data/levels/*.json`) consumed by `LevelGen.ts`. Steps: baseline height from seeded noise → fill layers (dirt over rock) → apply features in order → place entities. Same seed = same level (enables daily seeds later).

Feature types (each is a function `(world, rng, params)`):
`hill`, `valley`, `cliff_step`, `sand_patch`, `dune_field`, `mud_pit`, `river`, `flooded_tunnel`, `rock_outcrop`, `boulder`, `wood_bridge`.

Entity types: `start`, `finish`, `depot`, `anchor` (background, hookable), `hint` (text sign).

A full example (Level 3) is in Appendix A. **[COULD]** Later add an optional indexed-PNG stamp importer so artists can paint terrain chunks in a pixel editor.

---

## 12. Art and audio direction

### 12.1 Look
- **Sandbox pixel style:** every terrain pixel is a simulated cell. Flat shading, no outlines on terrain, per-cell colour variation (the classic falling-sand "grain" look). Vehicle gets a 1 px dark outline for readability.
- Everything is rendered on a **480×270 low-res canvas** and scaled up by an integer factor. No sub-pixel camera: the camera position is snapped to whole cells.
- Cheerful, warm palette; clear value contrast between ground, vehicle and sky.

### 12.2 Material palettes (colour index = `aux & 7` mod palette length)

| Material | Colours |
|---|---|
| ROCK | `#4A4E59 #5B5F6B #6B707D #7C8190 #8A8F9E #5B5F6B` |
| DIRT | `#7A5230 #8B6038 #6B4527 #94693F #7A5230 #8B6038` |
| Grass (render-only: DIRT with AIR above) | `#4C8A28 #5DA130 #6DB93A` |
| SAND | `#E4C97A #D9BC66 #EED38A #CDAF5A #F2DE9E #E4C97A` |
| MUD | `#5A3E2A #4B3322 #684A33 #3E2A1C #5A3E2A #7A5A40` (highlight = bubbles) |
| WATER | `#3A7BD5 #4A8BE0 #2F6BC0` at alpha ≈ 0.6; surface row `#9CCBFF`, shimmer by shifting variation every 8 frames |
| WOOD | `#8A5A2B #744A22 #9C6A33` |
| METAL | `#9AA3AD #7C858F #B6BEC7` |
| Sky | gradient `#6EC6E8` → `#CDEFFB` + 3 parallax pixel-cloud layers |
| Truck | body `#C8402D`, shade `#8E2B1E`, glass `#BFE6FF`, tire `#1E1E22`, rim `#9AA3AD`, outline `#1B1B1F` |

### 12.3 Rendering pipeline
1. Snap camera to cell grid; compute the 480×270 view rectangle.
2. **Base `ImageData`:** SOLID cells (palette lookup via `Uint32Array`); AIR = transparent. Grass = DIRT with AIR above (hash-based tuft height).
3. **Overlay `ImageData`:** SAND, MUD, WATER cells (water with alpha, surface highlight on rows with AIR above).
4. Draw to the low-res canvas in the order from §7.7, sprites drawn with `translate(round(x), round(y)) → rotate → drawImage` and smoothing off.
5. Scale low-res canvas to the display canvas with an integer factor.
Expected cost: ~130k cells × 2 passes ≈ 1–2 ms.

### 12.4 Sprite list (PNG, no anti-aliasing)

| Asset | Size (px) | Notes |
|---|---|---|
| `truck_body` | ~84×36 | Frame, cab, bed; wheel arches |
| `wheel` | 17×17 | Visible spokes so rotation reads |
| `crate_bricks`, `crate_eggs`, `crate_medical` | 13×13 | Distinct silhouettes/colours |
| `hook` | 5×5 | |
| `depot` | 48×40 | Pump + roof |
| `tree_bg_a/b`, `post_bg`, `spire_bg` | ~40×64 | Background anchors, slightly darker/desaturated |
| `sign` | 24×16 | Hint sign (text drawn with pixel font) |
| `finish_flag` | 24×40 | |
| UI icons | 8×8 | Fuel, battery, cargo, hook, mode |

Pixel rotation of sprites can look noisy at some angles; accept for MVP, consider "RotSprite"-style pre-rotated frames later **[COULD]**.

### 12.5 FX **[SHOULD]**
Dust (sand), mud splatter, water splash on entry (scaled by speed), bubbles when submerged, rope-snap sparks, subtle screen shake on hard landings (≤ 2 cells).

### 12.6 Audio list
Engine loop (pitch ∝ wheel ω), electric whine loop, stall splutter, restart, water enter/exit, bubbling loop, wheel spin in sand/mud (separate loops), hook launch, hook thunk, rope creak (∝ tension), rope snap, crate hit, cargo-damage sting, coin/payout, UI click/confirm, 1–2 chill chiptune loops. Use CC0/licensed assets; keep a credits file.

### 12.7 Fonts
One pixel font with a permissive licence (e.g. OFL "Pixelify Sans" or "Press Start 2P"); HUD drawn on the low-res canvas for pixel consistency, menus may use DOM.

---

## 13. HUD and UI

```
┌──────────────────────────────────────────────────────┐
│ FUEL ▮▮▮▮▮▯▯▯   BATT ▮▮▮▯▯▯▯▯   CARGO 92%    00:42  212 m │
│                                                      │
│                   (gameplay view)                    │
│                                                      │
│ [ENGINE]  FLOOD ▮▮▯▯ (only when > 0)   HOOK ▮▮▯ ← tension │
└──────────────────────────────────────────────────────┘
```

- Mode label `ENGINE / ELECTRIC / NO POWER` flashes on change.
- Distance-to-finish counter; timer turns green until par, then yellow.
- Contextual prompts: "Hold R to recover", "Engine stalled: electric mode".
- Aim line + range arc only while the hook is IDLE.
- World-space hint signs appear when the player first nears them.
- Pause menu: Resume, Restart, Settings, Quit to map.

---

## 14. Code architecture

```
src/
  main.ts                      bootstrap + main loop
  core/    Loop.ts Input.ts Rng.ts Config.ts Save.ts EventBus.ts
  sim/     World.ts (flat arrays + chunks) Materials.ts CellSim.ts Particles.ts
           LevelGen.ts Collision.ts (marching squares → Planck)
           Coupling.ts (friction, drag, buoyancy, digging, unstick)
  game/    Vehicle.ts Drivetrain.ts Hook.ts Cargo.ts Mission.ts Camera.ts Economy.ts
  render/  Renderer.ts Palette.ts Sprites.ts Hud.ts Fx.ts
  ui/      Title.ts Map.ts Briefing.ts Result.ts Garage.ts Pause.ts
  audio/   Audio.ts
  data/    globals.json materials.json vehicles.json cargo.json upgrades.json levels/*.json
  dev/     DebugOverlay.ts SandboxBrush.ts
tests/     cellsim.test.ts rng.test.ts marching.test.ts levelgen.test.ts
```

**Main loop**
```ts
function frame(now: number) {
  acc += Math.min(now - last, 0.1); last = now;
  while (acc >= DT) { fixedStep(); acc -= DT; }
  render(acc / DT);                     // interpolate rigid-body transforms only; cells are not interpolated
  requestAnimationFrame(frame);
}

function fixedStep() {
  input.poll();
  mission.update();                     // timers, win/fail checks
  drivetrain.update();                  // throttle → motors, fuel, battery, engine state, flood
  hook.update();                        // projectile DDA, rope, winch force
  coupling.apply();                     // drag, buoyancy, friction cache, digging (queues cell edits)
  physics.step(DT, 8, 3);               // Planck
  cargo.postStep();                     // damage, lost crates
  cells.step();                         // applies queued edits, then falling-sand tick
  collision.rebuildDirty(budgetMs);     // marching squares → Planck chains
  particles.update();
  audio.update();
}
```

**Conventions**
- Config loaded once from JSON with schema validation (zod or hand-written); invalid data fails loudly in dev.
- Systems communicate through a small typed event bus: `engine-stall`, `engine-restart`, `water-enter`, `water-exit`, `hook-fire`, `hook-attach`, `hook-miss`, `rope-snap`, `crate-hit`, `cargo-lost`, `flooded`, `level-complete`, `level-failed`.
- Cell edits requested by game code (digging, brush) go through `world.queueEdit()` and are applied at the start of `cells.step()` to keep the tick deterministic.
- No allocations in the per-tick hot paths (reuse typed arrays and pooled objects).

---

## 15. QA, debug tools and tests

**Debug overlay (F3):** FPS, ms per subsystem (sim / physics / collision / coupling / render), awake chunk count, collision chain count, chassis speed, per-wheel slip + contact material, battery/fuel/flood values, particle count.
**F4** collision wireframe · **F5** sandbox brush · **F6** slow-motion (0.25×).

**Unit tests (Vitest)**
- Sand pile reaches a stable angle in [35°, 45°]; a column of water in a U-shaped basin levels out.
- Sand sinks through water; mud sinks below sand.
- Same seed + same input → identical `mat` array hash after 600 ticks (determinism).
- Marching squares: closed shapes produce closed contours; shared chunk borders produce identical vertices.
- Level generator: same seed → identical level; every level has start, finish and a connected drivable path.

**Playtest checklist per level:** completable on base upgrades (L1–3); no spot where the player is permanently stuck without Recover/Restart; hints visible; cargo/fuel/battery budgets feel tight but fair; 60 fps in the worst chunk-heavy area.

---

## 16. Milestones (single developer estimate: 6–8 weeks)

| # | Deliverable | Acceptance criteria |
|---|---|---|
| M0 | Scaffold, fixed-step loop, renderer, flat grid, sand/mud/water rules, chunk sleep, sandbox brush | 480×270 view at 60 fps while pouring sand and water; sand piles at ~40°; chunks sleep when idle |
| M1 | Collision from cells + vehicle on solid terrain, camera, drive model | Truck climbs a 30° rock slope and rides without jitter; chunk rebuild ≤ 1.5 ms/frame; stuck-in-solid recovery works |
| M2 | Soft-material coupling: erosion, friction, drag, buoyancy, digging, flying cells | A 6 m mud pit is crossable only with momentum; spinning wheels carve ruts and sink; truck sinks slowly in deep water; sand dune climbs behave per §7.3 |
| M3 | Hook, winch, anchors, rope snap | From a stuck position in mud, the player escapes with an anchor ≤ 15 m away; rope snaps beyond tension limit; hook misses on sand/mud/water |
| M4 | Fuel, battery, engine stall/restart, flooding, AUTO/ELECTRIC | A 20 m submerged crossing is possible with ≥ 60% battery, fails below ~30%; flood bar fails the run when full |
| M5 | Cargo, mission flow, HUD, result screen, economy, save/load, Levels 1–2 | Full loop: briefing → drive → deliver → payout → retry in < 1 s; stars and coins persist |
| M6 | Levels 3–5, garage + upgrades, audio, FX, perf pass, build + deploy | ~30 min first playthrough; 60 fps on target hardware; no soft-locks; public build hosted |

---

## 17. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Collision jitter** while sand shifts under the wheels | Only settled soft cells collide (motion counter = 0); throttled rebuild; simplify + smooth contours; erosion keeps wheels slightly inside soft layers |
| Marching-squares rebuild spikes | Per-chunk incremental rebuild, per-frame cap (6 chunks / 1.5 ms), prioritise chunks under the vehicle; option to move to a Web Worker |
| Vehicle tunnels into solids when terrain changes | §7.6 unstick routine; bullet wheels; cap speed ~20 m/s |
| Cell sim too slow on low-end machines | Chunk sleeping, active-region limit, half-rate fallback, flat typed arrays, no allocations in hot loops |
| Pixel-rotated sprites look noisy | Accept in MVP; consider pre-rotated frames |
| Underwater/battery loop feels fiddly instead of fun | Prototype M2/M4 early; tune flood rate, drag K and battery drain from playtests before building levels 4–5 |
| Digging feels punishing | Tunable `digRate`; Recover key; hook anchors guaranteed near every pit; tire-pressure option |
| Planck API differences between versions | Pin the version; wrap Planck calls in a thin `physics.ts` adapter |

---

## 18. Post-MVP backlog (replayability and addiction hooks)

1. **Seeded daily route** + friend ghosts + leaderboards (determinism is already a requirement).
2. **Expedition mode:** multi-leg roguelite run with persistent damage, fuel and cargo.
3. **Risk/reward routes** and mystery-cargo modifiers (no-damage, fuel cap, time limit).
4. **Rain/weather:** rain turns sand/dirt to mud, rivers rise, night driving.
5. **More vehicles:** bus (cargo + passengers, tips easily), jeep, amphibious truck, tracked hauler.
6. **Rescue/tow missions** using the winch on stranded NPC vehicles.
7. **Dig/blast tools:** shovel arm, charges, ramps/planks.
8. **Liquid cargo sloshing**, live animals, hazardous goods.
9. Cosmetics (paint, decals), garage stat bars, achievements.
10. Mobile touch controls and gamepad polish.

---

## Appendix A — Starting configuration (JSON)

### A.1 `globals.json`
```json
{
  "cellsPerMeter": 16,
  "view": { "w": 480, "h": 270 },
  "gravity": 9.81,
  "fixedDt": 0.0166667,
  "velocityIterations": 8,
  "positionIterations": 3,
  "chunk": 32,
  "sim": { "activeMarginChunks": 3, "sleepAfterIdleTicks": 30, "preSettleTicks": 300, "maxParticles": 1024, "sinkChance": 0.6 },
  "collision": { "radius_m": 20, "hysteresis_m": 4, "simplifyEpsilonCells": 0.6, "maxChunkRebuildsPerFrame": 6, "maxRebuildMs": 1.5 },
  "camera": { "lookAheadSec": 0.5, "smooth": 0.15, "verticalBiasCells": -20, "snapToCells": true },
  "fail": { "fallBelow_m": -10 }
}
```

### A.2 `materials.json`
```json
[
  { "id": 0, "name": "AIR",   "cls": "EMPTY",    "density": 1 },
  { "id": 1, "name": "ROCK",  "cls": "SOLID",    "density": 2600, "grip": 0.95, "hookable": true,  "palette": ["#4A4E59","#5B5F6B","#6B707D","#7C8190","#8A8F9E","#5B5F6B"] },
  { "id": 2, "name": "DIRT",  "cls": "SOLID",    "density": 1800, "grip": 0.85, "hookable": false, "palette": ["#7A5230","#8B6038","#6B4527","#94693F","#7A5230","#8B6038"] },
  { "id": 3, "name": "SAND",  "cls": "GRANULAR", "density": 1600, "grip": 0.60, "hookable": false, "sinkDepth_m": 0.06, "dragK": 150,  "digRate": 30, "flowChance": 1.0,  "diagChance": 0.90, "palette": ["#E4C97A","#D9BC66","#EED38A","#CDAF5A","#F2DE9E","#E4C97A"] },
  { "id": 4, "name": "MUD",   "cls": "VISCOUS",  "density": 1900, "grip": 0.20, "hookable": false, "sinkDepth_m": 0.45, "dragK": 1200, "digRate": 45, "flowChance": 0.10, "diagChance": 0.03, "palette": ["#5A3E2A","#4B3322","#684A33","#3E2A1C","#5A3E2A","#7A5A40"] },
  { "id": 5, "name": "WATER", "cls": "LIQUID",   "density": 1000, "hookable": false, "dragK": 250, "dispersion": 5, "alpha": 0.6, "palette": ["#3A7BD5","#4A8BE0","#2F6BC0"] },
  { "id": 6, "name": "WOOD",  "cls": "SOLID",    "density": 700,  "grip": 0.70, "hookable": true,  "palette": ["#8A5A2B","#744A22","#9C6A33"] },
  { "id": 7, "name": "METAL", "cls": "SOLID",    "density": 7800, "grip": 0.60, "hookable": true,  "palette": ["#9AA3AD","#7C858F","#B6BEC7"] }
]
```

### A.3 `vehicles.json` (first entry; schema supports more)
```json
[
  {
    "id": "mule",
    "name": "Mule Pickup",
    "mass": { "chassisKg": 1800, "wheelKg": 80 },
    "chassis": {
      "boxes": [
        { "cx": 0.0,   "cy": 0.0,  "hx": 2.4,  "hy": 0.3  },
        { "cx": 1.35,  "cy": 0.75, "hx": 0.75, "hy": 0.45 },
        { "cx": 2.0,   "cy": 0.5,  "hx": 0.4,  "hy": 0.2  },
        { "cx": -2.35, "cy": 0.75, "hx": 0.05, "hy": 0.45 },
        { "cx": 0.5,   "cy": 0.75, "hx": 0.05, "hy": 0.45 }
      ],
      "comLocal": [0, -0.1], "friction": 0.4, "restitution": 0.0,
      "linearDamping": 0.02, "angularDamping": 0.2
    },
    "wheels": {
      "radius": 0.52, "front": [1.6, -0.4], "rear": [-1.6, -0.4],
      "grip": 1.0, "restitution": 0.05,
      "suspension": { "frontHz": 3.2, "rearHz": 3.0, "damping": 0.8, "travel_m": 0.25 }
    },
    "engine": {
      "peakTorque": 3000, "maxOmega": 31,
      "fuelTank": 40, "burnIdle": 0.01, "burnFull": 0.25,
      "intakeLocal": [2.0, 0.75], "stallAfterSec": 0.3, "restartAfterDrySec": 1.0, "restartDelaySec": 0.8
    },
    "electric": {
      "peakTorque": 1500, "maxOmega": 13,
      "batteryCap": 100, "drainPerSec": 4.0, "idleDrainPerSec": 0.15,
      "alternatorPerSec": 1.2, "regenK": 0.35, "regenMax": 3.0
    },
    "water": { "sealLocal": [1.3, 0.85], "floodPerSec": 0.06, "drainPerSec": 0.03, "buoyancyFactor": 0.08, "bodyDepthZ": 2.0 },
    "brake": { "torque": 1800, "handbrakeTorque": 2500 },
    "air": { "pitchTorque": 1200, "angularDamping": 0.6 },
    "hook": {
      "mountLocal": [1.7, 1.2], "speed": 28, "gravityScale": 0.6, "maxRope_m": 18,
      "winchForce": 18000, "winchSpeed": 3.0, "breakTension": 35000,
      "cooldownSec": 1.5, "missRetractSec": 0.5, "minRope_m": 1.5
    },
    "cargoSlots": [[-1.9, 0.7], [-1.05, 0.7], [-0.2, 0.7], [-1.9, 1.5], [-1.05, 1.5], [-0.2, 1.5]]
  }
]
```

### A.4 `cargo.json`
```json
[
  { "id": "bricks",  "name": "Brick pallets",    "crateMassKg": 70, "hitThresholdNs": 180, "damagePerNsOver": 0.04, "waterDamagePerSec": 0.0, "buoyancyFactor": 0.0,  "color": "#B5532F" },
  { "id": "eggs",    "name": "Egg crates",       "crateMassKg": 25, "hitThresholdNs": 50,  "damagePerNsOver": 0.12, "waterDamagePerSec": 1.0, "buoyancyFactor": 0.05, "color": "#F2E3B3" },
  { "id": "medical", "name": "Medical supplies", "crateMassKg": 30, "hitThresholdNs": 80,  "damagePerNsOver": 0.08, "waterDamagePerSec": 3.0, "buoyancyFactor": 0.05, "color": "#E8F4F8" }
]
```

### A.5 `upgrades.json`
```json
[
  { "id": "engine",  "name": "Engine tune",
    "tiers": [ { "cost": 250,  "peakTorqueMult": 1.12 }, { "cost": 600,  "peakTorqueMult": 1.25 }, { "cost": 1200, "peakTorqueMult": 1.40 } ] },
  { "id": "tires",   "name": "All-terrain tires",
    "tiers": [ { "cost": 200,  "softGripMult": 1.10, "sinkMult": 0.92 }, { "cost": 500,  "softGripMult": 1.20, "sinkMult": 0.85 }, { "cost": 1000, "softGripMult": 1.30, "sinkMult": 0.78 } ] },
  { "id": "battery", "name": "Battery pack",
    "tiers": [ { "cost": 200,  "capAdd": 30 }, { "cost": 500, "capAdd": 60 }, { "cost": 1000, "capAdd": 100 } ] },
  { "id": "fording", "name": "Fording kit (snorkel + seals)",
    "tiers": [ { "cost": 300,  "intakeRaise_m": 0.45, "floodMult": 0.85 }, { "cost": 700, "intakeRaise_m": 0.85, "floodMult": 0.70 }, { "cost": 1300, "intakeRaise_m": 1.25, "floodMult": 0.55 } ] },
  { "id": "tank",    "name": "Fuel tank",
    "tiers": [ { "cost": 150,  "fuelAdd": 10 }, { "cost": 350, "fuelAdd": 20 }, { "cost": 700, "fuelAdd": 35 } ] },
  { "id": "winch",   "name": "Winch & rope",
    "tiers": [ { "cost": 250,  "ropeAdd_m": 4, "tensionMult": 1.20, "winchForceMult": 1.15 }, { "cost": 600, "ropeAdd_m": 8, "tensionMult": 1.40, "winchForceMult": 1.30 }, { "cost": 1100, "ropeAdd_m": 12, "tensionMult": 1.60, "winchForceMult": 1.45 } ] }
]
```

### A.6 Tire pressure presets **[SHOULD]**

| Preset | Soft-surface grip | Hard-surface grip | Sink depth |
|---|---|---|---|
| Low | ×1.20 | ×0.90 | ×0.80 |
| Normal | ×1.00 | ×1.00 | ×1.00 |
| High | ×0.85 | ×1.05 | ×1.15 |

(Soft = SAND/MUD; multiply with tire-upgrade multipliers.)

### A.7 Example level: `L3_ford_crossing.json`
```json
{
  "id": "L3_ford_crossing",
  "name": "Ford Crossing",
  "seed": 30303,
  "size_m": { "w": 500, "h": 64 },
  "cargo": { "type": "bricks", "count": 6 },
  "basePay": 500,
  "parTime_s": 120,
  "start": { "fuelPct": 100, "batteryPct": 100 },
  "terrain": {
    "baselineY_m": 26,
    "noise": { "octaves": 3, "amplitude_m": 2.5, "wavelength_m": 45 },
    "layers": [
      { "material": "DIRT", "thickness_m": 5 },
      { "material": "ROCK", "fillToBottom": true }
    ]
  },
  "features": [
    { "type": "hill",       "x_m": 60,  "width_m": 50, "height_m": 8,  "maxSlopeDeg": 28 },
    { "type": "sand_patch", "x_m": 150, "width_m": 30, "depth_m": 1.2 },
    { "type": "river",      "x_m": 230, "width_m": 14, "depth_m": 1.0, "bankSlopeDeg": 20 },
    { "type": "river",      "x_m": 290, "width_m": 26, "depth_m": 3.2, "bankSlopeDeg": 25 },
    { "type": "mud_pit",    "x_m": 380, "width_m": 10, "depth_m": 0.9 },
    { "type": "hill",       "x_m": 420, "width_m": 50, "height_m": 10, "maxSlopeDeg": 33 }
  ],
  "entities": [
    { "type": "start",  "x_m": 8 },
    { "type": "finish", "x_m": 490 },
    { "type": "depot",  "x_m": 200 },
    { "type": "anchor", "kind": "tree", "x_m": 372, "aboveGround_m": 2.0, "radius_m": 0.6 },
    { "type": "anchor", "kind": "tree", "x_m": 396, "aboveGround_m": 2.0, "radius_m": 0.6 },
    { "type": "hint",   "x_m": 215, "text": "Water ahead. If the hood goes under, the engine stalls. Battery keeps you moving." },
    { "type": "hint",   "x_m": 365, "text": "Stuck? Aim with the mouse, click to fire the hook, hold RMB to winch." }
  ]
}
```

---

*End of spec. Open questions for the product owner:* final game title, whether the first release is desktop-only, and which store/hosting target (itch.io vs own site) to plan for.
