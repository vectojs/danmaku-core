import { describe, expect, it } from 'bun:test';
import { DanmakuPool } from '../src/model/DanmakuPool';
import { Scheduler } from '../src/model/Scheduler';
import { createDefaultParams, type PresetId } from '../src/model/types';

describe('Scheduler', () => {
  const preset: PresetId = 'scroll';

  it('spawns danmaku respecting maxCount ceiling', () => {
    const pool = new DanmakuPool(100);
    const sched = new Scheduler(pool, 1920, 1080, 50);
    sched.tick(16, preset, {
      cursorX: 0,
      cursorY: 0,
      pointerActive: false,
    });
    expect(pool.activeCount).toBeGreaterThan(0);
    expect(pool.activeCount).toBeLessThanOrEqual(50);
  });

  it('userSpawn() adds a danmaku with given text', () => {
    const pool = new DanmakuPool(100);
    const sched = new Scheduler(pool, 1920, 1080, 100);
    sched.userSpawn({ ...createDefaultParams(), text: 'user message', preset });
    expect(pool.activeCount).toBe(1);
    expect(pool.slots.find((s) => s.active)!.params.text).toBe('user message');
  });

  it('stress-spawns text from the injected textSampler', () => {
    const pool = new DanmakuPool(100);
    const sched = new Scheduler(pool, 1920, 1080, 50, {
      textSampler: () => 'INJECTED',
    });
    sched.tick(16, preset, { cursorX: 0, cursorY: 0, pointerActive: false });
    const spawned = pool.slots.filter((s) => s.active);
    expect(spawned.length).toBeGreaterThan(0);
    // Every auto-spawned danmaku takes its text from the sampler.
    expect(spawned.every((s) => s.params.text === 'INJECTED')).toBe(true);
  });

  it('defaults to empty text when no sampler is provided', () => {
    const pool = new DanmakuPool(100);
    const sched = new Scheduler(pool, 1920, 1080, 50);
    sched.tick(16, preset, { cursorX: 0, cursorY: 0, pointerActive: false });
    const spawned = pool.slots.filter((s) => s.active);
    expect(spawned.every((s) => s.params.text === '')).toBe(true);
  });

  it('respects targetCount when filling', () => {
    const pool = new DanmakuPool(200);
    const sched = new Scheduler(pool, 1920, 1080, 100);
    for (let i = 0; i < 30; i++) {
      sched.tick(16, preset, {
        cursorX: 0,
        cursorY: 0,
        pointerActive: false,
      });
    }
    expect(pool.activeCount).toBeGreaterThan(0);
    expect(pool.activeCount).toBeLessThanOrEqual(100);
  });

  it('deactivates danmaku that leave the viewport (targetCount=0 = no refill)', () => {
    const pool = new DanmakuPool(100);
    const sched = new Scheduler(pool, 1920, 1080, 0);
    sched.userSpawn({
      ...createDefaultParams(),
      text: 'AAAA',
      preset: 'scroll',
      speed: 1000,
    });
    sched.userSpawn({
      ...createDefaultParams(),
      text: 'BBBB',
      preset: 'scroll',
      speed: 1000,
    });
    expect(pool.activeCount).toBe(2);
    // dt=5000ms at speed 1000px/s => both should be far off-screen left
    sched.tick(5000, preset, {
      cursorX: 0,
      cursorY: 0,
      pointerActive: false,
    });
    expect(pool.activeCount).toBe(0);
  });

  it('assigns adaptive vertical bands within the stage', () => {
    const pool = new DanmakuPool(100);
    const sched = new Scheduler(pool, 1920, 1080, 10);
    for (let i = 0; i < 30; i++) {
      sched.tick(16, 'scroll', {
        cursorX: 0,
        cursorY: 0,
        pointerActive: false,
      });
    }
    for (const slot of pool.slots) {
      if (!slot.active) continue;
      expect(slot.verticalBandStart).toBeGreaterThanOrEqual(0);
      expect(slot.verticalBandCount).toBeGreaterThan(0);
      expect((slot.verticalBandStart + slot.verticalBandCount) * 4).toBeLessThanOrEqual(1080);
      expect(slot.lane).toBe(slot.verticalBandStart);
    }
  });

  it('setTargetCount changes the ceiling live', () => {
    const pool = new DanmakuPool(200);
    const sched = new Scheduler(pool, 1920, 1080, 50);
    for (let i = 0; i < 20; i++) {
      sched.tick(16, preset, {
        cursorX: 0,
        cursorY: 0,
        pointerActive: false,
      });
    }
    const before = pool.activeCount;
    sched.setTargetCount(150);
    for (let i = 0; i < 30; i++) {
      sched.tick(16, preset, {
        cursorX: 0,
        cursorY: 0,
        pointerActive: false,
      });
    }
    expect(pool.activeCount).toBeGreaterThan(before);
    expect(pool.activeCount).toBeLessThanOrEqual(150);
  });

  it('packs mixed font sizes into non-overlapping vertical spans', () => {
    const pool = new DanmakuPool(4);
    const sched = new Scheduler(pool, 1000, 120, 0);
    expect(sched.userSpawn({ ...createDefaultParams(), text: 'small', fontSize: 18 })).toBe(true);
    expect(sched.userSpawn({ ...createDefaultParams(), text: 'large', fontSize: 30 })).toBe(true);

    const [small, large] = pool.slots;
    const smallEnd = small.verticalBandStart + small.verticalBandCount;
    const largeEnd = large.verticalBandStart + large.verticalBandCount;
    expect(smallEnd <= large.verticalBandStart || largeEnd <= small.verticalBandStart).toBe(true);
  });

  it('refuses unsafe user overlap when no vertical span remains', () => {
    const pool = new DanmakuPool(2);
    const sched = new Scheduler(pool, 1000, 24, 0);
    const params = { ...createDefaultParams(), text: 'only row', fontSize: 18 };
    expect(sched.userSpawn(params)).toBe(true);
    expect(sched.userSpawn({ ...params, contentId: 'second' })).toBe(false);
    expect(pool.activeCount).toBe(1);
  });

  it('keeps interaction-locked slots fixed and outside occupancy', () => {
    const pool = new DanmakuPool(2);
    const sched = new Scheduler(pool, 1000, 24, 0);
    const params = { ...createDefaultParams(), text: 'selected', fontSize: 18 };
    expect(sched.userSpawn(params)).toBe(true);
    const selected = pool.slots[0]!;
    selected.interactionLocked = true;
    const { x, y } = selected;

    sched.tick(100, 'scroll', { cursorX: 0, cursorY: 0, pointerActive: false });

    expect(selected.x).toBe(x);
    expect(selected.y).toBe(y);
    expect(sched.userSpawn({ ...params, contentId: 'behind' })).toBe(true);
  });

  it('keeps explicit stress overflow spawning after safe spans fill', () => {
    const pool = new DanmakuPool(10);
    const sched = new Scheduler(pool, 1000, 48, 10, { textSampler: () => 'stress' });
    sched.setSpawnRate(10_000);

    const spawned = sched.tick(1, 'scroll', {
      cursorX: 0,
      cursorY: 0,
      pointerActive: false,
    });

    expect(spawned).toBe(10);
    expect(pool.activeCount).toBe(10);
  });

  it('reflows or removes active spans that no longer fit after resize', () => {
    const pool = new DanmakuPool(4);
    const sched = new Scheduler(pool, 1000, 120, 0);
    sched.userSpawn({ ...createDefaultParams(), text: 'small', fontSize: 18 });
    sched.userSpawn({ ...createDefaultParams(), text: 'large', fontSize: 30 });

    sched.resize(1000, 60);

    for (const slot of pool.slots) {
      if (!slot.active) continue;
      expect((slot.verticalBandStart + slot.verticalBandCount) * 4).toBeLessThanOrEqual(60);
    }
  });
  it('excites and settles Jelly state deterministically', () => {
    const pool = new DanmakuPool(1);
    const scheduler = new Scheduler(pool, 640, 360, 0);
    scheduler.showcaseJelly = true;
    scheduler.userSpawn({ ...createDefaultParams(), text: 'jelly', preset: 'scroll' });
    const slot = pool.slots.find((candidate) => candidate.active)!;

    expect(slot.jellyVelocity).not.toBe(0);
    for (let i = 0; i < 240; i++) {
      scheduler.tick(1000 / 120, 'scroll', {
        cursorX: 0,
        cursorY: 0,
        pointerActive: false,
      });
    }

    expect(slot.jellyScaleX).toBeCloseTo(1, 2);
    expect(slot.jellyScaleY).toBeCloseTo(1, 2);
    expect(slot.jellyVelocity).toBeCloseTo(0, 1);
  });

  it('clamps Jelly impulses to a bounded scale range', () => {
    const pool = new DanmakuPool(1);
    const scheduler = new Scheduler(pool, 640, 360, 0);
    scheduler.showcaseJelly = true;
    scheduler.userSpawn({ ...createDefaultParams(), text: 'jelly', preset: 'scroll' });
    const slot = pool.slots.find((candidate) => candidate.active)!;

    for (let i = 0; i < 20; i++) scheduler.exciteJelly(slot.id, 1);
    scheduler.tick(16, 'scroll', { cursorX: 0, cursorY: 0, pointerActive: false });

    expect(slot.jellyScaleX).toBeGreaterThanOrEqual(0.68);
    expect(slot.jellyScaleX).toBeLessThanOrEqual(1.32);
    expect(slot.jellyScaleY).toBeGreaterThanOrEqual(0.68);
    expect(slot.jellyScaleY).toBeLessThanOrEqual(1.32);
  });

  it('returns Jelly state to rest immediately when the showcase is disabled', () => {
    const pool = new DanmakuPool(1);
    const scheduler = new Scheduler(pool, 640, 360, 0);
    scheduler.showcaseJelly = true;
    scheduler.userSpawn({ ...createDefaultParams(), text: 'jelly', preset: 'scroll' });
    const slot = pool.slots.find((candidate) => candidate.active)!;
    scheduler.showcaseJelly = false;

    scheduler.tick(16, 'scroll', { cursorX: 0, cursorY: 0, pointerActive: false });
    expect(slot.jellyScaleX).toBe(1);
    expect(slot.jellyScaleY).toBe(1);
    expect(slot.jellyVelocity).toBe(0);
  });
});
