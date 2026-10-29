import React from 'react';
import { InputManager } from '../core/Input';

interface TouchOverlayProps {
  inputManager: InputManager;
}

export const TouchOverlay: React.FC<TouchOverlayProps> = ({ inputManager }) => {
  return (
    <div className="absolute inset-0 pointer-events-none flex justify-between items-end p-4 z-20 md:hidden">
      {/* Left controls: Reverse & Forward pedals */}
      <div className="flex items-center gap-3 pointer-events-auto">
        <button
          className="w-16 h-16 rounded-full bg-slate-900/80 border-2 border-slate-700 active:bg-slate-700 text-white font-bold flex items-center justify-center text-lg shadow-lg touch-none"
          onTouchStart={() => { inputManager.touchThrottle = -1; }}
          onTouchEnd={() => { inputManager.touchThrottle = 0; }}
          onMouseDown={() => { inputManager.touchThrottle = -1; }}
          onMouseUp={() => { inputManager.touchThrottle = 0; }}
        >
          ◀ REV
        </button>
        <button
          className="w-18 h-18 rounded-full bg-emerald-700/80 border-2 border-emerald-500 active:bg-emerald-600 text-white font-bold flex items-center justify-center text-xl shadow-lg touch-none"
          onTouchStart={() => { inputManager.touchThrottle = 1; }}
          onTouchEnd={() => { inputManager.touchThrottle = 0; }}
          onMouseDown={() => { inputManager.touchThrottle = 1; }}
          onMouseUp={() => { inputManager.touchThrottle = 0; }}
        >
          GAS ▶
        </button>
      </div>

      {/* Right controls: Winch In, Winch Out, Handbrake, Hook fire */}
      <div className="flex flex-col items-end gap-2 pointer-events-auto">
        <div className="flex gap-2">
          <button
            className="w-12 h-12 rounded-lg bg-amber-700/80 border border-amber-500 active:bg-amber-600 text-white font-bold text-xs flex items-center justify-center touch-none shadow-md"
            onTouchStart={() => { inputManager.touchWinchIn = true; }}
            onTouchEnd={() => { inputManager.touchWinchIn = false; }}
            onMouseDown={() => { inputManager.touchWinchIn = true; }}
            onMouseUp={() => { inputManager.touchWinchIn = false; }}
          >
            WINCH IN
          </button>
          <button
            className="w-12 h-12 rounded-lg bg-slate-800/80 border border-slate-600 active:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center touch-none shadow-md"
            onTouchStart={() => { inputManager.touchWinchOut = true; }}
            onTouchEnd={() => { inputManager.touchWinchOut = false; }}
            onMouseDown={() => { inputManager.touchWinchOut = true; }}
            onMouseUp={() => { inputManager.touchWinchOut = false; }}
          >
            OUT
          </button>
        </div>

        <div className="flex gap-2">
          <button
            className="w-14 h-14 rounded-full bg-red-700/80 border border-red-500 active:bg-red-600 text-white font-bold text-xs flex items-center justify-center touch-none shadow-md"
            onTouchStart={() => { inputManager.touchHandbrake = true; }}
            onTouchEnd={() => { inputManager.touchHandbrake = false; }}
            onMouseDown={() => { inputManager.touchHandbrake = true; }}
            onMouseUp={() => { inputManager.touchHandbrake = false; }}
          >
            BRAKE
          </button>
          <button
            className="w-14 h-14 rounded-full bg-sky-700/80 border border-sky-400 active:bg-sky-600 text-white font-bold text-xs flex items-center justify-center touch-none shadow-md"
            onClick={() => { inputManager.touchFireHook = true; }}
          >
            HOOK
          </button>
        </div>
      </div>
    </div>
  );
};
