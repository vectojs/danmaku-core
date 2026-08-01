# Changelog

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
