import React from 'react';
import { GameSaveData } from '../types';
import { UPGRADES } from '../data/upgrades';
import { SaveSystem } from '../core/Save';

interface GarageProps {
  saveData: GameSaveData;
  onUpdateSave: (newSave: GameSaveData) => void;
  onClose: () => void;
}

export const Garage: React.FC<GarageProps> = ({ saveData, onUpdateSave, onClose }) => {
  const buyUpgrade = (upgradeId: string) => {
    const currentTier = saveData.upgrades[upgradeId] ?? 0;
    const upgradeDef = UPGRADES.find((u) => u.id === upgradeId);
    if (!upgradeDef) return;

    if (currentTier >= upgradeDef.tiers.length) return; // Max tier
    const nextTierCost = upgradeDef.tiers[currentTier].cost;

    if (saveData.coins < nextTierCost) return; // Insufficient coins

    const nextSave: GameSaveData = {
      ...saveData,
      coins: saveData.coins - nextTierCost,
      upgrades: {
        ...saveData.upgrades,
        [upgradeId]: currentTier + 1,
      },
    };

    SaveSystem.save(nextSave);
    onUpdateSave(nextSave);
  };

  return (
    <div className="absolute inset-0 bg-slate-950/95 flex flex-col justify-between p-6 z-40 select-none overflow-y-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <span className="text-amber-500 font-mono text-[11px] font-bold uppercase tracking-widest block">
            WORKSHOP &amp; UPGRADES
          </span>
          <h2 className="text-3xl font-black text-white font-mono mt-0.5">TRUCK GARAGE</h2>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl flex items-center gap-2 font-mono">
            <span className="text-slate-400 text-xs">AVAILABLE COINS:</span>
            <span className="text-amber-400 font-bold text-base">{saveData.coins}</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase transition-colors"
          >
            Back
          </button>
        </div>
      </div>

      {/* Upgrades Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 my-auto py-6">
        {UPGRADES.map((upgrade) => {
          const currentTier = saveData.upgrades[upgrade.id] ?? 0;
          const maxTier = upgrade.tiers.length;
          const isMaxed = currentTier >= maxTier;
          const nextCost = !isMaxed ? upgrade.tiers[currentTier].cost : 0;
          const canAfford = !isMaxed && saveData.coins >= nextCost;

          return (
            <div
              key={upgrade.id}
              className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-mono font-bold text-white text-base">{upgrade.name}</h3>
                  <div className="flex gap-1">
                    {[1, 2, 3].map((tierIdx) => (
                      <span
                        key={tierIdx}
                        className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                          tierIdx <= currentTier ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-600'
                        }`}
                      >
                        T{tierIdx}
                      </span>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-slate-400 mb-4">{upgrade.desc}</p>

                {/* Tier specs */}
                <div className="space-y-1 text-[11px] font-mono text-slate-400 mb-4 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                  {upgrade.tiers.map((t, tIdx) => {
                    const isUnlocked = tIdx < currentTier;
                    const isCurrent = tIdx === currentTier;
                    return (
                      <div
                        key={tIdx}
                        className={`flex justify-between ${
                          isUnlocked ? 'text-emerald-400 font-bold' : isCurrent ? 'text-amber-300' : 'text-slate-600'
                        }`}
                      >
                        <span>
                          {isUnlocked ? '✓ ' : ''}Tier {tIdx + 1}
                        </span>
                        <span>
                          {t.peakTorqueMult && `+${Math.round((t.peakTorqueMult - 1) * 100)}% Torque`}
                          {t.softGripMult && `+${Math.round((t.softGripMult - 1) * 100)}% Soft Grip`}
                          {t.capAdd && `+${t.capAdd} Ah Battery`}
                          {t.intakeRaise_m && `+${t.intakeRaise_m}m Snorkel & Seals`}
                          {t.fuelAdd && `+${t.fuelAdd}L Fuel Tank`}
                          {t.ropeAdd_m && `+${t.ropeAdd_m}m Winch Cable`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                disabled={isMaxed || !canAfford}
                onClick={() => buyUpgrade(upgrade.id)}
                className={`w-full py-2.5 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
                  isMaxed
                    ? 'bg-slate-800 text-emerald-400 cursor-default'
                    : canAfford
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                {isMaxed ? (
                  'MAX TIER REACHED'
                ) : (
                  <>
                    <span>Upgrade Tier {currentTier + 1}</span>
                    <span className="text-[10px] opacity-80">({nextCost} Coins)</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="text-slate-500 text-xs text-center border-t border-slate-800 pt-3">
        Upgrades improve vehicle power, grip, endurance, and winch recovery across all campaign hauls.
      </div>
    </div>
  );
};
