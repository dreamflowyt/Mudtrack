import React from 'react';
import { MissionResult } from '../game/Mission';

interface ResultModalProps {
  isVictory: boolean;
  result: MissionResult | null;
  failReason: string;
  onRetry: () => void;
  onNextLevel: () => void;
  onReturnToMap: () => void;
  hasNextLevel: boolean;
}

export const ResultModal: React.FC<ResultModalProps> = ({
  isVictory,
  result,
  failReason,
  onRetry,
  onNextLevel,
  onReturnToMap,
  hasNextLevel,
}) => {
  return (
    <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-fade-in flex flex-col gap-5">
        {/* Header */}
        <div className="text-center border-b border-slate-800 pb-3">
          {isVictory ? (
            <>
              <span className="text-xs font-mono text-emerald-400 font-bold uppercase tracking-widest block">
                DELIVERY SUCCESSFUL
              </span>
              <h2 className="text-3xl font-black text-white font-mono mt-1">HAUL COMPLETE</h2>
            </>
          ) : (
            <>
              <span className="text-xs font-mono text-red-400 font-bold uppercase tracking-widest block">
                DELIVERY FAILED
              </span>
              <h2 className="text-3xl font-black text-red-500 font-mono mt-1">HAUL ABORTED</h2>
            </>
          )}
        </div>

        {isVictory && result ? (
          <>
            {/* Stars Awarded */}
            <div className="flex justify-center items-center gap-2 py-2">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`text-4xl transition-all transform ${
                    s <= result.stars ? 'text-amber-400 scale-110 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]' : 'text-slate-800'
                  }`}
                >
                  ★
                </div>
              ))}
            </div>

            {/* Stats Breakdown */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center text-slate-300">
                <span>Time Taken:</span>
                <span className={`font-bold ${result.underPar ? 'text-emerald-400' : 'text-slate-200'}`}>
                  {result.timeSec}s {result.underPar && '(Under Par!)'}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>Cargo Integrity:</span>
                <span className={`font-bold ${result.integrityPct >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {result.integrityPct}% ({result.cratesDelivered}/6 intact)
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-sm font-bold">
                <span className="text-slate-400">Total Payout:</span>
                <span className="text-amber-400 font-mono text-base">+{result.payout} Coins</span>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-red-950/40 border border-red-900/60 rounded-xl p-4 text-center">
            <span className="text-red-400 text-xs font-mono block">Failure Cause:</span>
            <p className="text-white font-bold text-sm mt-1">{failReason || 'Vehicle incapacitated'}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-2">
          {isVictory && hasNextLevel && (
            <button
              onClick={onNextLevel}
              className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 font-bold text-sm uppercase tracking-wider transition-colors shadow-lg"
            >
              Next Route ▶
            </button>
          )}

          <div className="flex gap-2">
            <button
              onClick={onRetry}
              className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-xs uppercase tracking-wider transition-colors"
            >
              Retry Fast (Backspace)
            </button>
            <button
              onClick={onReturnToMap}
              className="flex-1 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider transition-colors"
            >
              World Map
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
