/**
 * SANDHAUL - 2D Physics Delivery & Particle-Sim World MVP
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as planck from 'planck';
import { LevelDef, GameSaveData } from './types';
import { LEVELS } from './data/levels';
import { SaveSystem } from './core/Save';
import { InputManager } from './core/Input';
import { eventBus } from './core/EventBus';
import { CellSim } from './sim/CellSim';
import { LevelGenerator } from './sim/LevelGen';
import { World } from './sim/World';
import { CollisionManager } from './sim/Collision';
import { CouplingManager } from './sim/Coupling';
import { ParticleSystem } from './sim/Particles';
import { Vehicle } from './game/Vehicle';
import { Drivetrain } from './game/Drivetrain';
import { HookManager } from './game/Hook';
import { CargoManager } from './game/Cargo';
import { MissionManager, MissionResult } from './game/Mission';
import { Camera } from './game/Camera';
import { Renderer } from './render/Renderer';
import { MAT_ID } from './data/materials';
import { UPGRADES } from './data/upgrades';

// UI Components
import { Title } from './ui/Title';
import { WorldMap } from './ui/WorldMap';
import { Briefing } from './ui/Briefing';
import { HudOverlay } from './ui/HudOverlay';
import { TouchOverlay } from './ui/TouchOverlay';
import { ResultModal } from './ui/ResultModal';
import { Garage } from './ui/Garage';
import { SandboxToolbar } from './ui/SandboxToolbar';
import { DebugOverlay, DebugStats } from './ui/DebugOverlay';

type AppState = 'TITLE' | 'MAP' | 'BRIEFING' | 'PLAYING' | 'RESULT' | 'GARAGE';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [appState, setAppState] = useState<AppState>('TITLE');
  const [saveData, setSaveData] = useState<GameSaveData>(() => SaveSystem.load());
  const [selectedLevel, setSelectedLevel] = useState<LevelDef>(LEVELS[0]);
  const [missionResult, setMissionResult] = useState<MissionResult | null>(null);
  const [failReason, setFailReason] = useState<string>('');
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Developer Sandbox & Debugging state
  const [isBrushOpen, setIsBrushOpen] = useState<boolean>(false);
  const [brushMat, setBrushMat] = useState<number>(MAT_ID.SAND);
  const [brushRadius, setBrushRadius] = useState<number>(4);
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [debugStats, setDebugStats] = useState<DebugStats>({
    fps: 60,
    simMs: 0,
    physMs: 0,
    couplingMs: 0,
    renderMs: 0,
    awakeChunks: 0,
    particleCount: 0,
    speedKmh: 0,
    chassisSubmerged: 0,
  });

  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [, setHudTick] = useState<number>(0);

  // Simulation singletons in ref
  const engineRef = useRef<{
    physicsWorld: planck.World;
    world: World;
    cellSim: CellSim;
    collision: CollisionManager;
    coupling: CouplingManager;
    particles: ParticleSystem;
    vehicle: Vehicle;
    drivetrain: Drivetrain;
    hook: HookManager;
    cargo: CargoManager;
    mission: MissionManager;
    camera: Camera;
    renderer: Renderer | null;
    input: InputManager;
  } | null>(null);

  // Apply purchased garage upgrades to drivetrain & hook
  const applySavedUpgrades = useCallback((save: GameSaveData) => {
    if (!engineRef.current) return;
    const { drivetrain, hook, coupling } = engineRef.current;

    let peakTorqueMult = 1.0;
    let softGripMult = 1.0;
    let sinkMult = 1.0;
    let capAdd = 0;
    let intakeRaise_m = 0;
    let floodMult = 1.0;
    let fuelAdd = 0;
    let ropeAdd_m = 0;
    let tensionMult = 1.0;
    let winchForceMult = 1.0;

    for (const [upgradeId, tier] of Object.entries(save.upgrades)) {
      if (tier <= 0) continue;
      const def = UPGRADES.find((u) => u.id === upgradeId);
      if (!def) continue;
      const tierData = def.tiers[tier - 1];
      if (tierData.peakTorqueMult) peakTorqueMult = tierData.peakTorqueMult;
      if (tierData.softGripMult) softGripMult = tierData.softGripMult;
      if (tierData.sinkMult) sinkMult = tierData.sinkMult;
      if (tierData.capAdd) capAdd = tierData.capAdd;
      if (tierData.intakeRaise_m) intakeRaise_m = tierData.intakeRaise_m;
      if (tierData.floodMult) floodMult = tierData.floodMult;
      if (tierData.fuelAdd) fuelAdd = tierData.fuelAdd;
      if (tierData.ropeAdd_m) ropeAdd_m = tierData.ropeAdd_m;
      if (tierData.tensionMult) tensionMult = tierData.tensionMult;
      if (tierData.winchForceMult) winchForceMult = tierData.winchForceMult;
    }

    drivetrain.applyUpgrades({
      peakTorqueMult,
      fuelMaxAdd: fuelAdd,
      batteryMaxAdd: capAdd,
      intakeRaise_m,
      floodMult,
      softGripMult,
      sinkMult,
    });

    hook.applyUpgrades({
      ropeAdd_m,
      tensionMult,
      winchForceMult,
    });

    coupling.setConfig({
      softGripMult,
      tireSinkMult: sinkMult,
    });
  }, []);

  // Initialize or re-generate level
  const initLevel = useCallback((level: LevelDef) => {
    // 1. Create Planck physics world
    const physicsWorld = planck.World({ gravity: planck.Vec2(0, -9.81) });

    // 2. Setup systems
    const cellSim = new CellSim();
    const world = LevelGenerator.generate(level, cellSim);
    const collision = new CollisionManager(physicsWorld);
    collision.initBoundaries(world.widthM, world.heightM);

    const coupling = new CouplingManager();
    const particles = new ParticleSystem();
    const vehicle = new Vehicle(physicsWorld);

    // Spawn vehicle at start entity on ground surface
    const startEnt = level.entities.find((e) => e.type === 'start');
    const startXM = startEnt?.x_m ?? 8;
    const surfaceYM = world.getSurfaceHeightM(startXM, 2.5);
    const startYM = surfaceYM + 1.4;

    vehicle.spawn(startXM, startYM, level.cargo.type);

    // Immediately pre-build terrain collision chains around spawn position
    collision.rebuildDirtyChunks(world, startXM, startYM, 100);

    const drivetrain = new Drivetrain();
    const hook = new HookManager();
    const cargo = new CargoManager(level.cargo.type);
    const mission = new MissionManager(level);
    mission.setInitialCheckpoint(startXM, startYM);

    const camera = new Camera();
    camera.xM = startXM;
    camera.yM = startYM;
    camera.update(startXM, startYM, 0, 0.016, world);

    const input = new InputManager();

    // Attach input to canvas if available
    if (canvasRef.current) {
      input.attach(canvasRef.current);
    }

    // Planck Contact listener for cargo impact damage
    physicsWorld.on('post-solve', (contact, impulse) => {
      const bA = contact.getFixtureA().getBody();
      const bB = contact.getFixtureB().getBody();
      const uA = bA.getUserData() as any;
      const uB = bB.getUserData() as any;
      const maxImpulse = Math.max(...(impulse.normalImpulses || [0]));
      if (uA?.isCrate) cargo.handleContactImpulse(uA.crateIndex, maxImpulse);
      if (uB?.isCrate) cargo.handleContactImpulse(uB.crateIndex, maxImpulse);
    });

    engineRef.current = {
      physicsWorld,
      world,
      cellSim,
      collision,
      coupling,
      particles,
      vehicle,
      drivetrain,
      hook,
      cargo,
      mission,
      camera,
      renderer: canvasRef.current ? new Renderer(canvasRef.current) : null,
      input,
    };

    applySavedUpgrades(saveData);
    setIsFlipped(false);
  }, [applySavedUpgrades, saveData]);

  // Fast level restart (<1s)
  const handleFastRestart = useCallback(() => {
    if (!engineRef.current) return;
    const { world, vehicle, drivetrain, hook, cargo, mission, particles, collision, camera } = engineRef.current;

    // Restore pre-settle pristine cell grid
    world.restoreSnapshot();
    particles.clear();
    collision.clear();
    collision.initBoundaries(world.widthM, world.heightM);

    // Respawn vehicle upright at level start on ground surface
    const startEnt = mission.levelDef.entities.find((e) => e.type === 'start');
    const startXM = startEnt?.x_m ?? 8;
    const surfaceYM = world.getSurfaceHeightM(startXM, 2.5);
    const startYM = surfaceYM + 1.4;

    vehicle.respawnUpright(startXM, startYM);
    collision.rebuildDirtyChunks(world, startXM, startYM, 100);

    camera.xM = startXM;
    camera.yM = startYM;
    camera.update(startXM, startYM, 0, 0.016, world);

    drivetrain.refuelFull();
    drivetrain.flood = 0;
    hook.reset();
    cargo.init(mission.levelDef.cargo.type);
    mission.init(mission.levelDef);
    mission.setInitialCheckpoint(startXM, startYM);

    setMissionResult(null);
    setFailReason('');
    setIsFlipped(false);
    setAppState('PLAYING');
  }, []);

  // Event bus bindings (failures & completions)
  useEffect(() => {
    const unsubComplete = eventBus.on('level-complete', (data) => {
      setMissionResult({
        completed: true,
        stars: data.stars,
        payout: data.payout,
        timeSec: data.timeSec,
        integrityPct: engineRef.current?.cargo.getMeanIntegrity() ?? 100,
        cratesDelivered: engineRef.current?.cargo.getDeliveredCrateCount() ?? 6,
        underPar: data.timeSec <= (selectedLevel.parTime_s ?? 120),
      });

      // Update save file
      setSaveData((prev) => {
        const curStars = prev.levels[selectedLevel.id]?.stars ?? 0;
        const curBest = prev.levels[selectedLevel.id]?.bestTime;
        const newBest = curBest === null ? data.timeSec : Math.min(curBest, data.timeSec);
        const newSave: GameSaveData = {
          ...prev,
          coins: prev.coins + data.payout,
          levels: {
            ...prev.levels,
            [selectedLevel.id]: {
              stars: Math.max(curStars, data.stars),
              bestTime: newBest,
            },
          },
        };
        SaveSystem.save(newSave);
        return newSave;
      });

      setAppState('RESULT');
    });

    const unsubFail = eventBus.on('level-failed', (data) => {
      setFailReason(data.reason);
      setAppState('RESULT');
    });

    return () => {
      unsubComplete();
      unsubFail();
    };
  }, [selectedLevel]);

  // Main fixed-step game loop (60 FPS accumulator)
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    let accumulator = 0;
    const FIXED_DT = 1 / 60;
    let flipCheckTimer = 0;
    let hudUpdateTimer = 0;

    const frame = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const engine = engineRef.current;

      if (engine && appState === 'PLAYING' && !isPaused) {
        accumulator += dt;

        let simElapsed = 0;
        let physElapsed = 0;
        let couplingElapsed = 0;

        while (accumulator >= FIXED_DT) {
          const {
            physicsWorld,
            world,
            cellSim,
            collision,
            coupling,
            particles,
            vehicle,
            drivetrain,
            hook,
            cargo,
            mission,
            camera,
            input,
          } = engine;

          // 1. Update camera coordinates for input aiming
          input.updateWorldCoordinates((sx, sy) => camera.screenToWorld(sx, sy, world));
          const inputState = input.poll(FIXED_DT);

          // F3 toggle debug
          if (inputState.toggleDebug) setShowDebug((prev) => !prev);
          // F4 toggle wireframe
          if (inputState.toggleWireframe) setShowWireframe((prev) => !prev);
          // F5 toggle sandbox brush
          if (inputState.toggleBrush) setIsBrushOpen((prev) => !prev);

          // Hold R for recovery (1 second)
          if (inputState.recoverHold >= 1.0) {
            mission.triggerRecovery(vehicle, world);
            const cPos = vehicle.chassisBody.getPosition();
            collision.rebuildDirtyChunks(world, cPos.x, cPos.y, 100);
            setIsFlipped(false);
          }

          // Hold Backspace for fast restart (0.5 second)
          if (inputState.restartHold >= 0.5) {
            handleFastRestart();
            accumulator = 0;
            break;
          }

          // F5 Sandbox Brush Painting
          if (isBrushOpen && inputState.brushActive) {
            const bx = world.cellX(inputState.brushWorldPos.x);
            const by = world.cellY(inputState.brushWorldPos.y);
            const r = brushRadius;
            for (let dy = -r; dy <= r; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy <= r * r) {
                  world.queueEdit(bx + dx, by + dy, brushMat, world.rng.rangeInt(0, 5));
                }
              }
            }
          }

          // 2. Mission update (checkpoints, finish, win/fail)
          mission.update(FIXED_DT, vehicle, cargo, drivetrain);

          // 3. Drivetrain update
          drivetrain.update(
            FIXED_DT,
            inputState.throttle,
            inputState.handbrake,
            inputState.toggleMode,
            inputState.cycleTirePressure,
            vehicle,
            world
          );

          // 4. Hook & Winch update
          hook.update(
            FIXED_DT,
            inputState.fireHookPressed,
            inputState.winchIn,
            inputState.winchOut,
            inputState.hookAimWorld,
            vehicle,
            world
          );

          // 5. Terrain Coupling (buoyancy, drag, tire digging, unstick)
          const coupStart = performance.now();
          const { submergedFraction } = coupling.applyDragAndBuoyancy(
            world,
            vehicle.chassisBody,
            vehicle.frontWheelBody,
            vehicle.rearWheelBody,
            vehicle.cargoBodies
          );

          coupling.applyWheelDigging(world, particles, vehicle.frontWheelBody, true, inputState.throttle, FIXED_DT);
          coupling.applyWheelDigging(world, particles, vehicle.rearWheelBody, false, inputState.throttle, FIXED_DT);
          coupling.applyUnstick(world, vehicle.chassisBody, vehicle.frontWheelBody, vehicle.rearWheelBody);
          couplingElapsed += performance.now() - coupStart;

          // Rebuild dirty collision chunks near vehicle BEFORE physics step
          const cPosBefore = vehicle.chassisBody.getPosition();
          collision.rebuildDirtyChunks(world, cPosBefore.x, cPosBefore.y);

          // 6. Planck Physics step
          const physStart = performance.now();
          physicsWorld.step(FIXED_DT, 8, 3);
          physElapsed += performance.now() - physStart;

          // 7. Cargo post-step (damage & distance)
          cargo.update(FIXED_DT, vehicle, world);

          // 8. Cellular Automata step
          const simStart = performance.now();
          const cPos = vehicle.chassisBody.getPosition();
          cellSim.updateActiveRegion(cPos.x, cPos.y, camera.viewWidthM * 0.5, camera.viewHeightM * 0.5, world);
          cellSim.step(world);
          simElapsed += performance.now() - simStart;

          // 10. Flying mass particles & FX
          particles.update(FIXED_DT, world);

          // 11. Camera track vehicle
          const cVel = vehicle.chassisBody.getLinearVelocity();
          camera.update(cPos.x, cPos.y, cVel.x, FIXED_DT, world);

          // 12. Check if flipped (beyond +-100 deg for 2 seconds)
          const angleDeg = (vehicle.chassisBody.getAngle() * 180) / Math.PI;
          const isFlippedNow = Math.abs(angleDeg) > 100 && Math.hypot(cVel.x, cVel.y) < 1.0;
          if (isFlippedNow) {
            flipCheckTimer += FIXED_DT;
            if (flipCheckTimer >= 2.0) setIsFlipped(true);
          } else {
            flipCheckTimer = 0;
            setIsFlipped(false);
          }

          accumulator -= FIXED_DT;
        }

        // Render pass
        const renderStart = performance.now();
        const { world, vehicle, hook, particles, camera, renderer, input } = engine;
        if (renderer) {
          renderer.render(
            world,
            camera,
            vehicle,
            hook,
            particles,
            input['mouseWorldPos'] || { x: 0, y: 0 },
            showWireframe
          );
        }
        const renderElapsed = performance.now() - renderStart;

        // Periodic HUD state sync (every 60ms)
        hudUpdateTimer += dt;
        if (hudUpdateTimer > 0.06) {
          setHudTick((t) => t + 1);
          hudUpdateTimer = 0;

          if (showDebug) {
            const cVel = engine.vehicle.chassisBody.getLinearVelocity();
            setDebugStats({
              fps: Math.round(1 / (dt || 0.016)),
              simMs: simElapsed,
              physMs: physElapsed,
              couplingMs: couplingElapsed,
              renderMs: renderElapsed,
              awakeChunks: engine.world.awakeChunks.length,
              particleCount: engine.particles.particles.length,
              speedKmh: Math.hypot(cVel.x, cVel.y) * 3.6,
              chassisSubmerged: 0,
            });
          }
        }
      }

      animId = requestAnimationFrame(frame);
    };

    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
  }, [appState, isPaused, isBrushOpen, brushMat, brushRadius, showWireframe, showDebug, handleFastRestart]);

  // Window resize handler for pixelated canvas scaling
  useEffect(() => {
    const handleResize = () => {
      if (engineRef.current?.renderer) {
        engineRef.current.renderer.resize();
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="relative w-screen h-screen bg-slate-950 overflow-hidden flex items-center justify-center font-sans">
      {/* 2D Canvas Viewport */}
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain cursor-crosshair touch-none"
      />

      {/* Title Screen */}
      {appState === 'TITLE' && (
        <Title
          saveData={saveData}
          onStartCampaign={() => {
            initLevel(selectedLevel);
            setAppState('MAP');
          }}
          onOpenGarage={() => setAppState('GARAGE')}
          onOpenSandbox={() => {
            initLevel(selectedLevel);
            setIsBrushOpen(true);
            setAppState('PLAYING');
          }}
        />
      )}

      {/* World Map Level Select */}
      {appState === 'MAP' && (
        <WorldMap
          saveData={saveData}
          onSelectLevel={(lvl) => {
            setSelectedLevel(lvl);
            setAppState('BRIEFING');
          }}
          onOpenGarage={() => setAppState('GARAGE')}
          onBackToTitle={() => setAppState('TITLE')}
        />
      )}

      {/* Mission Briefing */}
      {appState === 'BRIEFING' && (
        <Briefing
          level={selectedLevel}
          onLaunch={() => {
            initLevel(selectedLevel);
            setAppState('PLAYING');
          }}
          onBack={() => setAppState('MAP')}
        />
      )}

      {/* Garage Screen */}
      {appState === 'GARAGE' && (
        <Garage
          saveData={saveData}
          onUpdateSave={(newSave) => {
            setSaveData(newSave);
            applySavedUpgrades(newSave);
          }}
          onClose={() => setAppState('MAP')}
        />
      )}

      {/* In-Game HUD Overlay */}
      {appState === 'PLAYING' && engineRef.current && (
        <>
          <HudOverlay
            drivetrain={engineRef.current.drivetrain}
            cargo={engineRef.current.cargo}
            hook={engineRef.current.hook}
            mission={engineRef.current.mission}
            vehicle={engineRef.current.vehicle}
            isFlipped={isFlipped}
            onTogglePause={() => setIsPaused((p) => !p)}
            onToggleBrush={() => setIsBrushOpen((b) => !b)}
            isBrushActive={isBrushOpen}
          />
          <TouchOverlay inputManager={engineRef.current.input} />
        </>
      )}

      {/* Sandbox Brush Toolbar (F5) */}
      {isBrushOpen && appState === 'PLAYING' && (
        <SandboxToolbar
          selectedMat={brushMat}
          onSelectMat={(m) => setBrushMat(m)}
          brushRadius={brushRadius}
          onRadiusChange={(r) => setBrushRadius(r)}
          onPreSettle={() => {
            if (engineRef.current) {
              for (let t = 0; t < 100; t++) {
                engineRef.current.cellSim.step(engineRef.current.world, true);
              }
            }
          }}
          onClose={() => setIsBrushOpen(false)}
        />
      )}

      {/* F3 Diagnostics Overlay */}
      {showDebug && appState === 'PLAYING' && (
        <DebugOverlay stats={debugStats} />
      )}

      {/* Victory / Failure Result Modal */}
      {appState === 'RESULT' && (
        <ResultModal
          isVictory={missionResult !== null && missionResult.completed}
          result={missionResult}
          failReason={failReason}
          onRetry={handleFastRestart}
          onNextLevel={() => {
            const curIdx = LEVELS.findIndex((l) => l.id === selectedLevel.id);
            if (curIdx < LEVELS.length - 1) {
              const nextLvl = LEVELS[curIdx + 1];
              setSelectedLevel(nextLvl);
              initLevel(nextLvl);
              setAppState('BRIEFING');
            } else {
              setAppState('MAP');
            }
          }}
          onReturnToMap={() => setAppState('MAP')}
          hasNextLevel={LEVELS.findIndex((l) => l.id === selectedLevel.id) < LEVELS.length - 1}
        />
      )}

      {/* Pause Menu Modal */}
      {isPaused && appState === 'PLAYING' && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xs w-full p-6 text-center space-y-4 shadow-2xl">
            <h3 className="text-2xl font-black text-white font-mono">GAME PAUSED</h3>
            <div className="space-y-2">
              <button
                onClick={() => setIsPaused(false)}
                className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-500 font-bold text-white text-xs uppercase"
              >
                Resume Run
              </button>
              <button
                onClick={handleFastRestart}
                className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase"
              >
                Restart Level
              </button>
              <button
                onClick={() => {
                  setIsPaused(false);
                  setAppState('MAP');
                }}
                className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase"
              >
                Exit to Route Map
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
