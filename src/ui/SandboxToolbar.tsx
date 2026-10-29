import React from 'react';
import { MAT_ID } from '../data/materials';

interface SandboxToolbarProps {
  selectedMat: number;
  onSelectMat: (mat: number) => void;
  brushRadius: number;
  onRadiusChange: (radius: number) => void;
  onPreSettle: () => void;
  onClose: () => void;
}

export const SandboxToolbar: React.FC<SandboxToolbarProps> = ({
  selectedMat,
  onSelectMat,
  brushRadius,
  onRadiusChange,
  onPreSettle,
  onClose,
}) => {
  const materials = [
    { id: MAT_ID.SAND, name: 'Sand', color: '#E4C97A' },
    { id: MAT_ID.MUD, name: 'Mud', color: '#5A3E2A' },
    { id: MAT_ID.WATER, name: 'Water', color: '#3A7BD5' },
    { id: MAT_ID.ROCK, name: 'Rock', color: '#6B707D' },
    { id: MAT_ID.DIRT, name: 'Dirt', color: '#8B6038' },
    { id: MAT_ID.WOOD, name: 'Wood', color: '#8A5A2B' },
    { id: MAT_ID.AIR, name: 'Eraser', color: '#ef4444' },
  ];

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-slate-950/90 backdrop-blur-md border border-amber-500/80 rounded-xl px-4 py-2.5 z-40 flex items-center gap-4 text-xs font-mono shadow-2xl">
      <div className="flex items-center gap-1.5 text-amber-400 font-bold">
        <span>F5 BRUSH:</span>
      </div>

      {/* Material Buttons */}
      <div className="flex items-center gap-1.5">
        {materials.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelectMat(m.id)}
            className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-all ${
              selectedMat === m.id
                ? 'bg-amber-500 text-slate-950 font-bold scale-105 shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full inline-block border border-black/30"
              style={{ backgroundColor: m.color }}
            />
            <span>{m.name}</span>
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-slate-800" />

      {/* Radius control */}
      <div className="flex items-center gap-2 text-slate-400">
        <span>SIZE: {brushRadius}px</span>
        <input
          type="range"
          min="1"
          max="16"
          value={brushRadius}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
          className="w-20 accent-amber-500 cursor-pointer"
        />
      </div>

      <div className="w-px h-5 bg-slate-800" />

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPreSettle}
          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
          title="Fast-forward simulation 100 ticks to settle particles"
        >
          Settle (100t)
        </button>
        <button
          onClick={onClose}
          className="px-2 py-1 rounded bg-red-950/60 hover:bg-red-900 border border-red-700 text-red-200 text-[11px]"
        >
          Close [F5]
        </button>
      </div>
    </div>
  );
};
