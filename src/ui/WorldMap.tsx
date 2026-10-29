import React from 'react';
import { LevelDef, GameSaveData } from '../types';
import { LEVELS } from '../data/levels';

interface WorldMapProps {
  saveData: GameSaveData;
  onSelectLevel: (level: LevelDef) => void;
  onOpenGarage: () => void;
  onBackToTitle: () => void;
}

export const WorldMap: React.FC<WorldMapProps> = ({
  saveData,
  onSelectLevel,
  onOpenGarage,
  onBackToTitle,
}) => {
  return (
    <div className="absolute inset-0 bg-slate-950/95 flex flex-col justify-between p-6 z-30 select-none overflow-y-auto">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-black text-white font-mono">DELIVERY CAMPAIGN</h2>
          <p className="text-slate-400 text-xs mt-0.5">Select a destination route. Deliver cargo safely to unlock further territories.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-400">FUNDS:</span>
            <span className="text-amber-400 font-bold">{saveData.coins} Coins</span>
          </div>

          <button
            onClick={onOpenGarage}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition-colors"
          >
            Garage Upgrades
          </button>

          <button
            onClick={onBackToTitle}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
          >
            Title
          </button>
        </div>
      </div>

      {/* Level Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 my-auto py-6">
        {LEVELS.map((level, idx) => {
          const prevLevel = idx > 0 ? LEVELS[idx - 1] : null;
          const prevUnlocked = !prevLevel || (saveData.levels[prevLevel.id]?.stars ?? 0) >= 1;
          const isUnlocked = idx === 0 || prevUnlocked;
          const record = saveData.levels[level.id];
          const stars = record?.stars ?? 0;

          return (
            <div
              key={level.id}
              className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
                isUnlocked
                  ? 'bg-slate-900/80 border-slate-700 hover:border-red-500 hover:shadow-lg hover:shadow-red-950/40'
                  : 'bg-slate-950/50 border-slate-800 opacity-50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono text-slate-400">ROUTE #{idx + 1}</span>
                  <div className="flex gap-1">
                    {[1, 2, 3].map((starIdx) => (
                      <span
                        key={starIdx}
                        className={`text-sm ${starIdx <= stars ? 'text-amber-400' : 'text-slate-700'}`}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                </div>

                <h3 className="text-lg font-bold text-white font-mono leading-tight">{level.name}</h3>

                <div className="mt-3 space-y-1 text-xs text-slate-400 font-mono">
                  <div className="flex justify-between">
                    <span>Length:</span>
                    <span className="text-slate-200">{level.size_m.w} m</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cargo:</span>
                    <span className="text-amber-300 uppercase">{level.cargo.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Par Time:</span>
                    <span className="text-slate-200">{level.parTime_s} s</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Base Pay:</span>
                    <span className="text-emerald-400 font-bold">{level.basePay}</span>
                  </div>
                  {record?.bestTime && (
                    <div className="flex justify-between text-[11px] pt-1 border-t border-slate-800">
                      <span>Best Time:</span>
                      <span className="text-cyan-400">{record.bestTime}s</span>
                    </div>
                  )}
                </div>
              </div>

              <button
                disabled={!isUnlocked}
                onClick={() => onSelectLevel(level)}
                className={`w-full mt-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors ${
                  isUnlocked
                    ? 'bg-red-600 hover:bg-red-500 active:bg-red-700 text-white shadow-md'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                {isUnlocked ? (stars > 0 ? 'Replay Route' : 'Drive Route') : 'Locked'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Hint Footer */}
      <div className="text-slate-500 text-xs text-center border-t border-slate-800 pt-3">
        Earn stars by delivering safely without smashing crates and finishing within par time.
      </div>
    </div>
  );
};
