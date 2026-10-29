import React from 'react';
import { Drivetrain } from '../game/Drivetrain';
import { CargoManager } from '../game/Cargo';
import { HookManager } from '../game/Hook';
import { MissionManager } from '../game/Mission';
import { Vehicle } from '../game/Vehicle';

interface HudProps {
  drivetrain: Drivetrain;
  cargo: CargoManager;
  hook: HookManager;
  mission: MissionManager;
  vehicle: Vehicle;
  isFlipped: boolean;
  onTogglePause: () => void;
  onToggleBrush: () => void;
  isBrushActive: boolean;
}

export const HudOverlay: React.FC<HudProps> = ({
  drivetrain,
  cargo,
  hook,
  mission,
  vehicle,
  isFlipped,
  onTogglePause,
  onToggleBrush,
  isBrushActive,
}) => {
  const fuelPct = Math.round((drivetrain.fuel / drivetrain.maxFuel) * 100);
  const battPct = Math.round((drivetrain.battery / drivetrain.maxBattery) * 100);
  const cargoPct = cargo.getMeanIntegrity();
  const dist = mission.getFinishDistance(vehicle);
  const time = mission.elapsedTime;
  const par = mission.levelDef.parTime_s;
  const isUnderPar = time <= par;

  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const tensionPct = Math.min(100, Math.round(hook.tensionRatio * 100));

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 select-none text-xs font-mono">
      {/* Top Telemetry Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/85 backdrop-blur-sm border border-slate-800 rounded-lg px-4 py-2 pointer-events-auto">
        {/* Left meters: Fuel & Battery */}
        <div className="flex items-center gap-4">
          {/* Fuel */}
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold tracking-wider">FUEL</span>
            <div className="w-24 h-2.5 bg-slate-800 rounded-xs overflow-hidden border border-slate-700">
              <div
                className={`h-full transition-all duration-100 ${fuelPct < 20 ? 'bg-red-500 animate-pulse' : 'bg-amber-400'}`}
                style={{ width: `${fuelPct}%` }}
              />
            </div>
            <span className="text-slate-300 w-8 tabular-nums">{fuelPct}%</span>
          </div>

          {/* Battery */}
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 font-bold tracking-wider">BATT</span>
            <div className="w-24 h-2.5 bg-slate-800 rounded-xs overflow-hidden border border-slate-700">
              <div
                className={`h-full transition-all duration-100 ${battPct < 20 ? 'bg-red-500 animate-pulse' : 'bg-cyan-400'}`}
                style={{ width: `${battPct}%` }}
              />
            </div>
            <span className="text-slate-300 w-8 tabular-nums">{battPct}%</span>
          </div>
        </div>

        {/* Center: Cargo Integrity */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-bold">CARGO</span>
          <div className="w-28 h-2.5 bg-slate-800 rounded-xs overflow-hidden border border-slate-700">
            <div
              className={`h-full transition-all duration-150 ${cargoPct > 70 ? 'bg-emerald-400' : cargoPct > 35 ? 'bg-amber-400' : 'bg-red-500'}`}
              style={{ width: `${cargoPct}%` }}
            />
          </div>
          <span className={`font-bold tabular-nums ${cargoPct < 40 ? 'text-red-400' : 'text-slate-200'}`}>
            {cargoPct}%
          </span>
          <span className="text-slate-500 text-[10px]">({cargo.getDeliveredCrateCount()}/6)</span>
        </div>

        {/* Right metrics: Time, Distance, Menu */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">TIME:</span>
            <span className={`font-bold tabular-nums ${isUnderPar ? 'text-emerald-400' : 'text-amber-400'}`}>
              {timeStr}
            </span>
            <span className="text-slate-500 text-[10px]">/ {par}s</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">GOAL:</span>
            <span className="text-white font-bold tabular-nums">{dist} m</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onToggleBrush}
              className={`px-2 py-1 rounded text-[11px] font-sans font-medium transition-colors ${
                isBrushActive ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              F5 Brush
            </button>
            <button
              onClick={onTogglePause}
              className="px-2 py-1 rounded text-[11px] font-sans font-medium bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Pause
            </button>
          </div>
        </div>
      </div>

      {/* Center Context Notifications */}
      <div className="flex flex-col items-center gap-2 my-auto">
        {mission.activeHint && (
          <div className="bg-amber-950/90 border border-amber-600/70 text-amber-200 px-4 py-2 rounded-lg max-w-lg text-center shadow-lg animate-fade-in font-sans text-sm">
            {mission.activeHint}
          </div>
        )}

        {isFlipped && (
          <div className="bg-red-950/90 border border-red-500 text-red-200 px-4 py-2 rounded-lg font-bold animate-bounce text-sm shadow-xl">
            Vehicle Flipped! Hold <span className="bg-red-800 px-1.5 py-0.5 rounded text-white">R</span> to recover (-15% pay)
          </div>
        )}

        {drivetrain.engineState === 'STALLED' && (
          <div className="bg-sky-950/90 border border-sky-500 text-sky-200 px-3 py-1.5 rounded-lg text-xs font-sans">
            Engine Stalled in Water! Battery electric drive active.
          </div>
        )}
      </div>

      {/* Bottom Status & Controls Bar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* Drive Mode & Tire info */}
        <div className="flex items-center gap-2 bg-slate-950/85 backdrop-blur-sm border border-slate-800 rounded-lg px-3 py-2 pointer-events-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">MODE:</span>
            <span
              className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                drivetrain.mode === 'AUTO'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : drivetrain.mode === 'ELECTRIC'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-red-500/20 text-red-300 border border-red-500/40'
              }`}
            >
              [{drivetrain.mode}]
            </span>
            <span className="text-slate-500 text-[10px]">(E)</span>
          </div>

          <div className="w-px h-4 bg-slate-700 mx-1" />

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">TIRE:</span>
            <span className="text-slate-200 font-bold">{drivetrain.tirePressure}</span>
            <span className="text-slate-500 text-[10px]">(T)</span>
          </div>
        </div>

        {/* Warning Bars (Flood & Winch Tension) */}
        <div className="flex items-center gap-3">
          {drivetrain.flood > 0 && (
            <div className="bg-slate-950/85 backdrop-blur-sm border border-sky-500/60 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="text-sky-400 font-bold animate-pulse">FLOOD</span>
              <div className="w-24 h-2.5 bg-slate-800 rounded-xs overflow-hidden border border-slate-700">
                <div
                  className="h-full bg-sky-400 transition-all duration-100"
                  style={{ width: `${Math.round(drivetrain.flood * 100)}%` }}
                />
              </div>
              <span className="text-sky-300 tabular-nums">{Math.round(drivetrain.flood * 100)}%</span>
            </div>
          )}

          {hook.state === 'ATTACHED' && (
            <div className="bg-slate-950/85 backdrop-blur-sm border border-slate-800 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className={`font-bold ${tensionPct > 80 ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>
                WINCH
              </span>
              <div className="w-24 h-2.5 bg-slate-800 rounded-xs overflow-hidden border border-slate-700">
                <div
                  className={`h-full transition-all duration-100 ${tensionPct > 80 ? 'bg-red-500' : tensionPct > 50 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                  style={{ width: `${tensionPct}%` }}
                />
              </div>
              <span className="text-slate-300 text-[10px]">RMB Pull</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
