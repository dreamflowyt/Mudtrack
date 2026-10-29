import React from 'react';
import { GameSaveData } from '../types';

interface TitleProps {
  saveData: GameSaveData;
  onStartCampaign: () => void;
  onOpenGarage: () => void;
  onOpenSandbox: () => void;
}

export const Title: React.FC<TitleProps> = ({
  saveData,
  onStartCampaign,
  onOpenGarage,
  onOpenSandbox,
}) => {
  return (
    <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-between p-6 z-30 select-none overflow-y-auto">
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center mt-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-amber-500 font-mono text-sm tracking-widest font-bold">● PARTICLE-SIM WORLD ●</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white font-mono drop-shadow-[0_4px_16px_rgba(200,64,45,0.4)]">
          SAND<span className="text-red-500">HAUL</span>
        </h1>
        <p className="text-slate-400 mt-2 max-w-md text-sm">
          Simulated falling sand, mud, and water terrain meets 2D rigid-body truck physics. Deliver cargo without sinking, stalling, or smashing crates.
        </p>
      </div>

      {/* Main Action Menu */}
      <div className="flex flex-col items-center gap-3 w-full max-w-xs my-6">
        <button
          onClick={onStartCampaign}
          className="w-full py-3.5 px-6 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-base tracking-wide transition-all shadow-lg hover:shadow-red-600/30 flex items-center justify-center gap-2"
        >
          <span>START DELIVERY RUN</span>
          <span className="text-red-200">▶</span>
        </button>

        <button
          onClick={onOpenGarage}
          className="w-full py-2.5 px-6 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-slate-200 font-bold text-sm transition-all flex items-center justify-between"
        >
          <span>TRUCK GARAGE</span>
          <span className="text-amber-400 font-mono">{saveData.coins} Coins</span>
        </button>

        <button
          onClick={onOpenSandbox}
          className="w-full py-2.5 px-6 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs transition-all flex items-center justify-center gap-2"
        >
          <span>SANDBOX BRUSH MODE (F5)</span>
        </button>
      </div>

      {/* Controls Cheatsheet */}
      <div className="w-full max-w-2xl bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-300">
        <h2 className="text-slate-400 font-mono font-bold uppercase tracking-wider mb-2 text-[11px]">
          Operating Controls
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
          <div className="bg-slate-950/70 p-2 rounded border border-slate-800/80">
            <span className="text-slate-500 block text-[10px]">THROTTLE / REVERSE</span>
            <span className="text-white font-bold">A / D or ← / →</span>
          </div>
          <div className="bg-slate-950/70 p-2 rounded border border-slate-800/80">
            <span className="text-slate-500 block text-[10px]">AIM &amp; FIRE HOOK</span>
            <span className="text-white font-bold">Mouse Aim + LMB</span>
          </div>
          <div className="bg-slate-950/70 p-2 rounded border border-slate-800/80">
            <span className="text-slate-500 block text-[10px]">WINCH IN (PULL)</span>
            <span className="text-white font-bold">Hold RMB or Shift</span>
          </div>
          <div className="bg-slate-950/70 p-2 rounded border border-slate-800/80">
            <span className="text-slate-500 block text-[10px]">ELECTRIC MODE</span>
            <span className="text-white font-bold">E (Water / Eco)</span>
          </div>
          <div className="bg-slate-950/70 p-2 rounded border border-slate-800/80">
            <span className="text-slate-500 block text-[10px]">HANDBRAKE</span>
            <span className="text-white font-bold">Space</span>
          </div>
          <div className="bg-slate-950/70 p-2 rounded border border-slate-800/80">
            <span className="text-slate-500 block text-[10px]">TIRE PRESSURE</span>
            <span className="text-white font-bold">T (Low/Norm/High)</span>
          </div>
          <div className="bg-slate-950/70 p-2 rounded border border-slate-800/80">
            <span className="text-slate-500 block text-[10px]">FLIP RECOVERY</span>
            <span className="text-white font-bold">Hold R (1 sec)</span>
          </div>
          <div className="bg-slate-950/70 p-2 rounded border border-slate-800/80">
            <span className="text-slate-500 block text-[10px]">SANDBOX BRUSH</span>
            <span className="text-white font-bold">F5</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-slate-600 text-[11px] mt-4 flex items-center gap-4">
        <span>SANDHAUL MVP v0.1</span>
        <span>·</span>
        <span>TypeScript + Planck.js + Canvas2D</span>
      </div>
    </div>
  );
};
