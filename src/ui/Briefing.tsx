import React from 'react';
import { LevelDef } from '../types';
import { CARGO_TYPES } from '../data/cargo';

interface BriefingProps {
  level: LevelDef;
  onLaunch: () => void;
  onBack: () => void;
}

export const Briefing: React.FC<BriefingProps> = ({ level, onLaunch, onBack }) => {
  const cargoDef = CARGO_TYPES[level.cargo.type] || CARGO_TYPES.bricks;

  return (
    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-40 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-fade-in flex flex-col gap-5">
        {/* Header */}
        <div className="border-b border-slate-800 pb-3 flex justify-between items-start">
          <div>
            <span className="text-[11px] font-mono text-amber-500 font-bold uppercase tracking-widest">
              MISSION BRIEFING
            </span>
            <h2 className="text-2xl font-black text-white font-mono mt-0.5">{level.name}</h2>
          </div>
          <span className="text-xs bg-slate-800 text-slate-300 font-mono px-2.5 py-1 rounded">
            {level.size_m.w} METERS
          </span>
        </div>

        {/* Cargo Manifest */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold border border-slate-700 shrink-0"
            style={{ backgroundColor: cargoDef.color, color: '#18181b' }}
          >
            📦
          </div>
          <div className="text-xs space-y-0.5">
            <span className="text-slate-400 font-mono text-[10px] block uppercase">CARGO MANIFEST</span>
            <span className="text-white font-bold text-sm block">{cargoDef.name} (6 Crates)</span>
            <p className="text-slate-400 text-[11px]">
              {level.cargo.type === 'bricks' && 'Heavy & durable pallets. Waterproof, but will test suspension weight.'}
              {level.cargo.type === 'eggs' && 'Fragile egg crates! Vulnerable to hard landings and bumps.'}
              {level.cargo.type === 'medical' && 'High-priority supplies. Damaged by hard impacts and severely spoiled by water!'}
            </p>
          </div>
        </div>

        {/* Star Objectives */}
        <div className="space-y-2 text-xs font-mono">
          <span className="text-slate-400 text-[11px] font-bold block uppercase tracking-wider">Star Objectives</span>
          <div className="flex items-center gap-2 text-slate-300">
            <span className="text-amber-400 text-sm">★</span>
            <span>Deliver truck &amp; cargo to the finish zone</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <span className="text-amber-400 text-sm">★★</span>
            <span>Maintain ≥ 80% cargo integrity with at least 5 intact crates</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <span className="text-amber-400 text-sm">★★★</span>
            <span>Complete route within par time ({level.parTime_s} seconds)</span>
          </div>
        </div>

        {/* Pay & Actions */}
        <div className="border-t border-slate-800 pt-4 flex items-center justify-between">
          <div>
            <span className="text-slate-500 text-[10px] font-mono block">BASE CONTRACT PAY</span>
            <span className="text-emerald-400 font-mono font-bold text-lg">{level.basePay} Coins</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onLaunch}
              className="px-6 py-2 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-red-950/40"
            >
              Depart Now ▶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
