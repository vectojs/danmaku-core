# Changelog

## 0.3.1

### Patch Changes

- keep visible danmaku on resize instead of silent drop — \_reflowActiveSlots now clamps to fallback band and preserves slot.y instead of pool.deactivate when \_assignBandStart fails (CTX-0039 P2-3, 43ed7e0 band packing).

## 0.3.0

### Minor Changes

- 43ed7e0: Replace the fixed-height lane allocator with adaptive 4px vertical-band packing.

  The scheduler previously placed danmaku on fixed 36px lanes with a 4px gap, so a
  14px caption reserved as much vertical space as a 48px headline and tall text
  clipped into its neighbour. Placement now measures each slot and reserves a
  contiguous run of 4px bands sized from font size, motion outset, effect outset,
  and jelly headroom, which raises usable density at mixed font sizes and removes
  the clipping.

  Band assignment is three-pass: a free span, then a kinematically safe span
  (a faster candidate may only reuse a band when `catchTime > exitTime * 1.3`, so
  it cannot overtake the danmaku ahead of it), then round-robin overflow.

  `PoolSlot` gains `baseY`, `verticalBandStart`, and `verticalBandCount`. These are
  assigned by the pool and scheduler; consumers that only read slots are
  unaffected. `lane` is retained as a compatibility alias and is no longer the
  placement mechanism. Presets now derive vertical position from `slot.baseY`
  instead of recomputing `lane * (LINE_HEIGHT + LANE_GAP)`, and `repulsion`
  measures from real `fontSize` rather than a hardcoded line height.

## 0.2.0

### Minor Changes

- ea5c9bc: Add reusable Jelly spring state, deterministic scheduler integration, and explicit impulse control for renderer-agnostic squash/stretch effects.

## 0.1.0

### Minor Changes

- Initial release. Renderer-agnostic danmaku (barrage) engine primitives extracted
  from the Bakudan playground: fixed-capacity `DanmakuPool`, a kinematic lane
  `Scheduler` (free → gap+kinematic-safe → round-robin lane assignment) with an
  injectable text sampler, eight pure motion `PRESETS`
  (scroll/reverse/top/bottom/sine/rotation/glitch/repulsion), a `DanmakuTrack`
  timeline cursor for video-synced playback, and a Gaussian-clustered
  `generateTimedTrack` demo-track generator. Zero runtime dependencies; no
  VectoJS, Canvas, or DOM coupling.
