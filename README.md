# @vectojs/danmaku-core

> Pure danmaku (barrage / 弹幕) engine primitives — renderer-agnostic and zero-dependency.

[![MIT license](https://img.shields.io/badge/license-MIT-6366f1.svg)](./LICENSE)

`@vectojs/danmaku-core` owns the _simulation_ half of a danmaku system: the object
pool, the lane-assigning scheduler with kinematic collision avoidance, the motion
presets, and the timeline track for video-synced playback. It intentionally has no
VectoJS, Canvas, DOM, or browser dependency, so a website, benchmark, CLI, or server
can drive the same danmaku semantics and plug in any renderer.

It was extracted from the [Bakudan](https://bakudan.vectojs.org) playground, where it
sustains 5,000 concurrent danmaku by keeping all per-frame work `O(N)` and allocating
nothing on the hot path.

## What's in the box

- **`DanmakuPool`** — a fixed-capacity object pool. Slots are reused, never
  re-allocated, so a full stress run produces no per-frame garbage.
- **`Scheduler`** — advances every active slot in one `O(N)` pass and assigns lanes
  with a three-pass strategy (free lane → gap + kinematically-safe lane →
  round-robin fallback) so scrolling danmaku never visually overlap. Text content is
  **injected** via a `textSampler`, so the engine carries no wording of its own.
- **`PRESETS`** — eight pure motion functions
  (`scroll`, `reverse`, `top`, `bottom`, `sine`, `rotation`, `glitch`, `repulsion`).
  Each is a `PresetFn` that mutates a slot given `dt` and pointer state — no
  rendering, no side effects.
- **`DanmakuTrack`** — a cursor over timestamp-pinned `TimedDanmakuEntry` items that
  emits the danmaku due since the last video time, for playback synced to a `<video>`.
- **`generateTimedTrack`** — a Gaussian-clustered demo-track generator (70% of entries
  cluster around peak moments) that also takes an injected `textSampler`.

## Renderer-agnostic by design

The engine only reads and writes plain numbers on `PoolSlot` (`x`, `y`, `width`,
`rotation`, `opacity`, `age`, `lane`, `charAngles`). It never touches a canvas. Your
renderer walks `scheduler.pool.slots` each frame and draws the active ones however it
likes — Canvas2D, WebGL/MSDF, SVG, or a test harness that asserts positions.

## Install

```bash
bun add @vectojs/danmaku-core
```

## Use

```ts
import { DanmakuPool, Scheduler } from "@vectojs/danmaku-core";

// You own the content. The engine just asks for the next string.
const phrases = ["hello", "666", "nice", "first!"];
const textSampler = () => phrases[(Math.random() * phrases.length) | 0]!;

const pool = new DanmakuPool(5000);
const scheduler = new Scheduler(pool, 1920, 1080, 500, { textSampler });

// In your frame loop (dt in ms, and the active motion preset):
function frame(dtMs: number) {
  scheduler.tick(dtMs, "scroll", {
    cursorX: 0,
    cursorY: 0,
    pointerActive: false,
  });
  for (const slot of pool.slots) {
    if (!slot.active) continue;
    // draw slot.params.text at (slot.x, slot.y) in your renderer of choice
  }
}
```

### Video-synced playback

```ts
import {
  createDefaultParams,
  DanmakuTrack,
  generateTimedTrack,
} from "@vectojs/danmaku-core";

const track = new DanmakuTrack(generateTimedTrack(15, { textSampler }));

// On a discontinuous jump (load, scrub), reposition without firing:
track.seek(video.currentTime);

// Each frame during normal playback, get entries due in (lastTime, currentTime]:
for (const entry of track.sync(video.currentTime)) {
  scheduler.userSpawn({
    ...createDefaultParams(),
    text: entry.text,
    preset: entry.preset ?? "scroll",
  });
}
```

## Verify

```bash
bun install
bun run format:check
bun run lint
bun test
bun run build
```

## Release governance

Public API changes start with a Changeset, then the reviewed version bump is published
through the repository's exact `@vectojs/danmaku-core@<version>` tag workflow.
`CHANGELOG.md` remains the human-readable release record.

## License

[MIT](./LICENSE) © 2026 Xuepoo
