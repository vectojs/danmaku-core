import type { PresetFn } from '../types';

export const sine: PresetFn = (slot, dt, _state, _stageWidth) => {
  const seconds = dt / 1000;
  const amp = slot.params.presetParams.amplitude ?? 60;
  const freq = slot.params.presetParams.frequency ?? 2;
  slot.x -= slot.params.speed * seconds;
  slot.age += dt;
  slot.y = slot.baseY + Math.sin((slot.age / 1000) * freq * Math.PI * 2) * amp;
  slot.rotation = 0;
  slot.opacity = slot.params.opacity;
};
