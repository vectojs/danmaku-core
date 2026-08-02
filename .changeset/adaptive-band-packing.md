---
"@vectojs/danmaku-core": minor
---

Replace the fixed-height lane allocator with adaptive 4px vertical-band packing.

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
