import React from 'react';

export interface DebugStats {
  fps: number;
  simMs: number;
  physMs: number;
  couplingMs: number;
  renderMs: number;
  awakeChunks: number;
  particleCount: number;
  speedKmh: number;
  chassisSubmerged: number;
}

interface DebugOverlayProps {
  stats: DebugStats;
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({ stats }) => {
  return (
    <div className="absolute top-14 left-4 bg-slate-950/90 border border-emerald-500/60 rounded-lg p-3 text-[11px] font-mono text-emerald-400 z-30 pointer-events-none shadow-xl space-y-1">
      <div className="font-bold border-b border-emerald-800/80 pb-1 mb-1 text-white flex justify-between">
        <span>SANDHAUL F3 DIAGNOSTICS</span>
        <span className="text-emerald-300">{stats.fps} FPS</span>
      </div>
      <div>Sim ms: {stats.simMs.toFixed(2)} ms</div>
      <div>Planck Physics: {stats.physMs.toFixed(2)} ms</div>
      <div>Coupling ms: {stats.couplingMs.toFixed(2)} ms</div>
      <div>Render ms: {stats.renderMs.toFixed(2)} ms</div>
      <div className="border-t border-emerald-900/60 pt-1">Awake Chunks: {stats.awakeChunks}</div>
      <div>Particles: {stats.particleCount}</div>
      <div>Speed: {stats.speedKmh.toFixed(1)} km/h</div>
      <div>Submerged: {(stats.chassisSubmerged * 100).toFixed(0)}%</div>
    </div>
  );
};
