import type { PresetFn } from '../types';

const REPULSE_RADIUS = 150;
const REPULSE_STRENGTH = 200;

export const repulsion: PresetFn = (slot, dt, state, _stageWidth) => {
  slot.age += dt;
  if (!state.pointerActive) {
    const seconds = dt / 1000;
    slot.x -= slot.params.speed * seconds;
    slot.y = slot.baseY;
    slot.rotation = 0;
    slot.opacity = slot.params.opacity;
    return;
  }

  const seconds = dt / 1000;
  slot.x -= slot.params.speed * seconds;
  const dx = slot.x + slot.width / 2 - state.cursorX;
  const dy = slot.baseY + slot.params.fontSize / 2 - state.cursorY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < REPULSE_RADIUS && dist > 0) {
    const force = (1 - dist / REPULSE_RADIUS) * REPULSE_STRENGTH;
    const normalizedForce = force / REPULSE_STRENGTH;
    slot.jellyVelocity = Math.min(4, slot.jellyVelocity + normalizedForce * seconds * 8);
    slot.x += (dx / dist) * force * seconds;
    slot.y = slot.baseY + (dy / dist) * force * seconds;
  } else {
    slot.y = slot.baseY;
  }
  slot.rotation = 0;
  slot.opacity = slot.params.opacity;
};
