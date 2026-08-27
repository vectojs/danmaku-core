import type { PresetFn } from '../types';

export const rotation: PresetFn = (slot, dt, _state, _stageWidth) => {
  const seconds = dt / 1000;
  slot.x -= slot.params.speed * seconds;
  slot.y = slot.baseY;
  slot.age += dt;
  const len = slot.params.text.length;
  // CTX-0054: lazy charAngles — allocate only when rotation actually runs (rare; no current profile weights it, but keep correctness for manual preset use and tests).
  if (!slot.charAngles || slot.charAngles.length < 64) {
    slot.charAngles = new Float64Array(64);
  }
  for (let i = 0; i < len && i < slot.charAngles.length; i++) {
    slot.charAngles[i] = Math.sin((slot.age / 1000) * 3 + i * 0.5) * 0.4;
  }
  slot.opacity = slot.params.opacity;
};
