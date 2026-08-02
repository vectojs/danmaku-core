import type { PresetFn } from '../types';

export const scroll: PresetFn = (slot, dt, _state, _stageWidth) => {
  const seconds = dt / 1000;
  slot.x -= slot.params.speed * seconds;
  slot.y = slot.baseY;
  slot.rotation = 0;
  slot.age += dt;
  slot.opacity = slot.params.opacity;
};
