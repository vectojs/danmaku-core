import type { CharacterEffects, DanmakuParams, PoolSlot, PresetId, PresetState } from './types';
import { DanmakuPool } from './DanmakuPool';
import { PRESETS } from './presets';

/** Options for {@link Scheduler}. */
export interface SchedulerOptions {
  /**
   * Supplies the text for each stress-spawned danmaku. The engine ships no
   * wording of its own — the consumer owns all content (memes, i18n, a live
   * feed, …). Defaults to a sampler that returns an empty string, so a
   * Scheduler with no sampler runs the simulation but draws nothing.
   */
  textSampler?: () => string;
}

const VERTICAL_BAND_PX = 4;
const VERTICAL_GAP_PX = 2;
const DEFAULT_SPAWN_RATE = 300;
const LANE_SAFETY_MARGIN = 1.3;
const JELLY_STIFFNESS = 180;
const JELLY_DAMPING = 18;
const JELLY_MAX_OFFSET = 0.32;
const JELLY_MIN_SCALE = Math.round((1 - JELLY_MAX_OFFSET) * 100) / 100;
const JELLY_MAX_SCALE = Math.round((1 + JELLY_MAX_OFFSET) * 100) / 100;
const JELLY_IMPULSE_SCALE = 12;
const CULL_MARGIN = 200;
const MIN_SPAWN_GAP = 50;
const REPULSION_VERTICAL_OUTSET = 6;

interface BandState {
  occupied: boolean;
  /** Fixed top/bottom content or incompatible overflow blocks reuse. */
  blocked: boolean;
  /** Right edge for left-moving content; left edge for reverse content. */
  entryEdge: number;
  /** Speed of the occupant nearest the candidate's entry edge. */
  speed: number;
  isReverse: boolean;
}

let sharedMeasureCtx: CanvasRenderingContext2D | null = null;

function measureWidth(text: string, fontSize: number): number {
  if (typeof document === 'undefined') return text.length * fontSize * 0.6;
  if (!sharedMeasureCtx) {
    const canvas = document.createElement('canvas');
    sharedMeasureCtx = canvas.getContext('2d');
  }
  if (!sharedMeasureCtx) return text.length * fontSize * 0.6;
  sharedMeasureCtx.font = `400 ${fontSize}px system-ui, sans-serif`;
  return sharedMeasureCtx.measureText(text).width + 4;
}

/**
 * Discrete font sizes for stress-spawned danmaku. Kept small on purpose: each
 * distinct size is a separate Canvas2D glyph-cache bucket and a separate
 * `ctx.font` state change, so collapsing the old continuous 16..36 range into
 * a few tiers keeps the glyph raster cache hot at 5,000+ concurrent danmaku
 * while still showing near/far size variety.
 */
const FONT_TIERS = [18, 24, 30];

function isMovingPreset(preset: PresetId): boolean {
  return preset !== 'top' && preset !== 'bottom';
}

export class Scheduler {
  readonly pool: DanmakuPool;
  private stageWidth: number;
  private stageHeight: number;
  private targetCount: number;
  private spawnRate: number;
  private bands: BandState[] = [];
  private spawnAccumulator = 0;
  private _bandRoundRobin = 0;
  private _showcaseJelly = false;
  showcasePhysics = false;
  /**
   * "Brush" effects stamped onto each stress-spawned danmaku at creation.
   * Acts like a paint brush: toggling an effect in the panel changes what
   * NEW danmaku are born with; danmaku already on screen keep the effects
   * they were spawned with, so different effects coexist (per-danmaku).
   */
  activeEffects: CharacterEffects = {
    glow: false,
    gradient: false,
    rainbow: false,
    outline: false,
  };

  private readonly textSampler: () => string;

  constructor(
    pool: DanmakuPool,
    stageWidth: number,
    stageHeight: number,
    targetCount: number,
    options: SchedulerOptions = {},
  ) {
    this.pool = pool;
    this.stageWidth = stageWidth;
    this.stageHeight = stageHeight;
    this.targetCount = targetCount;
    this.spawnRate = DEFAULT_SPAWN_RATE;
    this.textSampler = options.textSampler ?? (() => '');
    this._computeBands();
  }

  resize(width: number, height: number): void {
    this.stageWidth = width;
    this.stageHeight = height;
    this._computeBands();
    this._reflowActiveSlots();
  }

  setTargetCount(n: number): void {
    this.targetCount = Math.max(0, n);
  }

  setSpawnRate(r: number): void {
    this.spawnRate = Math.max(1, r);
  }

  get target(): number {
    return this.targetCount;
  }

  get rate(): number {
    return this.spawnRate;
  }

  get showcaseJelly(): boolean {
    return this._showcaseJelly;
  }

  set showcaseJelly(enabled: boolean) {
    if (this._showcaseJelly === enabled) return;
    this._showcaseJelly = enabled;
    this._reflowActiveSlots();
  }

  exciteJelly(slotId: number, impulse = 0.24): boolean {
    if (slotId < 0 || slotId >= this.pool.capacity) return false;
    const slot = this.pool.slots[slotId]!;
    if (!slot.active || slot.interactionLocked) return false;
    const bounded = Math.max(-1, Math.min(1, impulse));
    slot.jellyVelocity += bounded * JELLY_IMPULSE_SCALE;
    return true;
  }

  /** Current stage width in px (used by the render layer for frustum culling). */
  get stageW(): number {
    return this.stageWidth;
  }

  /** Current stage height in px. */
  get stageH(): number {
    return this.stageHeight;
  }

  tick(
    dt: number,
    presetId: PresetId,
    cursorState: {
      cursorX: number;
      cursorY: number;
      pointerActive: boolean;
    },
  ): number {
    const state: PresetState = {
      time: performance.now(),
      cursorX: cursorState.cursorX,
      cursorY: cursorState.cursorY,
      pointerActive: cursorState.pointerActive,
    };
    const width = this.stageWidth;
    const height = this.stageHeight;
    const slots = this.pool.slots;

    this._resetBands();

    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index];
      if (!slot.active || slot.interactionLocked) continue;

      const slotPreset = slot.params.preset || presetId;
      const presetFn = PRESETS[slotPreset] || PRESETS.scroll;
      if (!slot.paused) presetFn(slot, dt, state, width, height);

      if (this.showcasePhysics) {
        if (slot.params.presetParams.vy === undefined) {
          slot.params.presetParams.vy = -100 - Math.random() * 200;
          slot.params.presetParams.gravity = 600 + Math.random() * 400;
        }
        const seconds = dt / 1000;
        slot.params.presetParams.vy += slot.params.presetParams.gravity * seconds;
        slot.y += slot.params.presetParams.vy * seconds;
        const ground = height - 80;
        if (slot.y > ground) {
          slot.y = ground;
          slot.params.presetParams.vy = -Math.abs(slot.params.presetParams.vy) * 0.7;
        }
      }
      this._stepJelly(slot, dt);

      if (slot.x + slot.width < -CULL_MARGIN || slot.x > width + CULL_MARGIN) {
        this.pool.deactivate(index);
        continue;
      }

      this._occupyBands(slot);
    }

    const deficit = this.targetCount - this.pool.activeCount;
    if (deficit <= 0) return 0;

    this.spawnAccumulator += (this.spawnRate * dt) / 1000;
    let spawned = 0;
    while (this.spawnAccumulator >= 1 && spawned < deficit) {
      this.spawnAccumulator -= 1;
      if (!this._spawnOne(presetId)) break;
      spawned++;
    }

    return spawned;
  }

  userSpawn(params: DanmakuParams, userSent = false): boolean {
    const bandStart = this._assignBandStart(params, false);
    if (bandStart < 0) return false;
    const [slot] = this.pool.activateBatch([params]);
    if (!slot) return false;
    this._initializeSlot(slot, bandStart, userSent);
    return true;
  }

  private _stepJelly(slot: PoolSlot, dt: number): void {
    if (!this.showcaseJelly) {
      slot.jellyScaleX = 1;
      slot.jellyScaleY = 1;
      slot.jellyVelocity = 0;
      return;
    }

    const seconds = dt / 1000;
    const offset = slot.jellyScaleY - 1;
    const acceleration = -JELLY_STIFFNESS * offset - JELLY_DAMPING * slot.jellyVelocity;
    slot.jellyVelocity += acceleration * seconds;
    const nextY = slot.jellyScaleY + slot.jellyVelocity * seconds;
    slot.jellyScaleY = Math.max(JELLY_MIN_SCALE, Math.min(JELLY_MAX_SCALE, nextY));
    slot.jellyScaleX = Math.max(JELLY_MIN_SCALE, Math.min(JELLY_MAX_SCALE, 2 - slot.jellyScaleY));

    if (Math.abs(slot.jellyScaleY - 1) < 0.0005 && Math.abs(slot.jellyVelocity) < 0.0005) {
      slot.jellyScaleX = 1;
      slot.jellyScaleY = 1;
      slot.jellyVelocity = 0;
    }
  }

  private _spawnOne(presetId: PresetId): boolean {
    const text = this.textSampler();
    // Quantize to a few discrete font tiers instead of a continuous 16..36
    // range. Visual size variety remains while the glyph caches stay hot.
    const fontSize = FONT_TIERS[Math.floor(Math.random() * FONT_TIERS.length)];
    const slateColors = [
      '#f8fafc',
      '#cbd5e1',
      '#94a3b8',
      '#38bdf8',
      '#60a5fa',
      '#818cf8',
      '#a78bfa',
      '#34d399',
    ];
    const color = slateColors[Math.floor(Math.random() * slateColors.length)];
    const params: DanmakuParams = {
      text,
      color,
      fontSize,
      speed: 150 + Math.random() * 150,
      // Uniform opacity avoids a Canvas2D state change per stress-spawned slot.
      opacity: 1,
      preset: presetId,
      presetParams: {},
      effects: { ...this.activeEffects },
    };
    const bandStart = this._assignBandStart(params, true);
    if (bandStart < 0) return false;
    const [slot] = this.pool.activateBatch([params]);
    if (!slot) return false;
    this._initializeSlot(slot, bandStart, false);
    return true;
  }

  private _initializeSlot(slot: PoolSlot, bandStart: number, userSent: boolean): void {
    this._setSlotVerticalPlacement(slot, bandStart);
    slot.userSent = userSent;
    slot.width = measureWidth(slot.params.text, slot.params.fontSize);
    switch (slot.params.preset) {
      case 'reverse':
        slot.x = -slot.width - 20;
        break;
      case 'top':
      case 'bottom':
        slot.x = (this.stageWidth - slot.width) / 2;
        break;
      default:
        slot.x = this.stageWidth + 20;
    }
    slot.y = slot.baseY;
    this._occupyBands(slot);
    if (this.showcaseJelly) this.exciteJelly(slot.id, 0.24);
  }

  private _setSlotVerticalPlacement(slot: PoolSlot, bandStart: number): void {
    slot.verticalBandStart = bandStart;
    slot.verticalBandCount = this._verticalBandCount(slot.params);
    slot.baseY = bandStart * VERTICAL_BAND_PX + this._verticalBaseOffset(slot.params);
    // Retained for source compatibility; adaptive presets use baseY directly.
    slot.lane = bandStart;
  }

  private _verticalBandCount(params: DanmakuParams): number {
    const extent = params.fontSize * 1.2 + this._verticalOutset(params) * 2 + VERTICAL_GAP_PX;
    return Math.max(1, Math.ceil(extent / VERTICAL_BAND_PX));
  }

  private _verticalBaseOffset(params: DanmakuParams): number {
    return this._verticalOutset(params) + VERTICAL_GAP_PX / 2;
  }

  private _verticalOutset(params: DanmakuParams): number {
    let motion = 0;
    switch (params.preset) {
      case 'sine':
        motion = Math.abs(params.presetParams.amplitude ?? 60);
        break;
      case 'rotation':
        motion = params.fontSize * 0.4;
        break;
      case 'glitch':
        motion = 3;
        break;
      case 'repulsion':
        motion = REPULSION_VERTICAL_OUTSET;
        break;
    }
    let effect = 0;
    if (params.effects.outline) effect += 2;
    if (params.effects.glow) effect += 4;
    const jelly = this.showcaseJelly ? params.fontSize * JELLY_MAX_OFFSET * 0.5 : 0;
    return Math.ceil(motion + effect + jelly);
  }

  private _computeBands(): void {
    const bandCount = Math.max(0, Math.floor(this.stageHeight / VERTICAL_BAND_PX));
    this.bands = Array.from({ length: bandCount }, () => ({
      occupied: false,
      blocked: false,
      entryEdge: 0,
      speed: 0,
      isReverse: false,
    }));
    this._bandRoundRobin = bandCount === 0 ? 0 : this._bandRoundRobin % bandCount;
  }

  private _resetBands(): void {
    for (let index = 0; index < this.bands.length; index++) {
      const band = this.bands[index];
      band.occupied = false;
      band.blocked = false;
    }
  }

  private _reflowActiveSlots(): void {
    if (this.bands.length === 0) return;
    this._resetBands();
    const slots = this.pool.slots;
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index];
      if (!slot.active) continue;
      if (slot.interactionLocked) {
        const count = this._verticalBandCount(slot.params);
        const maxStart = Math.max(0, this.bands.length - count);
        const unclamped = Math.round(
          (slot.y - this._verticalBaseOffset(slot.params)) / VERTICAL_BAND_PX,
        );
        this._setSlotVerticalPlacement(slot, Math.max(0, Math.min(maxStart, unclamped)));
        continue;
      }
      const bandStart = this._assignBandStart(slot.params, this.targetCount > 0);
      if (bandStart < 0) {
        // P2-3: resize must not silently drop visible danmaku. Keep the slot
        // at a clamped fallback instead of deactivating (requeue/keep contract).
        const count = this._verticalBandCount(slot.params);
        const maxStart = Math.max(0, this.bands.length - count);
        const fallback = Math.max(0, Math.min(slot.verticalBandStart, maxStart));
        this._setSlotVerticalPlacement(slot, fallback);
        // Preserve mid-flight y for moving presets; clamp inside stage.
        const minY = this._verticalBaseOffset(slot.params);
        const maxY = Math.max(
          minY,
          this.stageHeight - slot.params.fontSize * 1.2 - this._verticalBaseOffset(slot.params),
        );
        slot.y = Math.max(minY, Math.min(slot.y, maxY));
        this._occupyBands(slot);
        continue;
      }
      this._setSlotVerticalPlacement(slot, bandStart);
      slot.y = slot.baseY;
      this._occupyBands(slot);
    }
  }

  private _assignBandStart(params: DanmakuParams, allowOverflow: boolean): number {
    const span = this._verticalBandCount(params);
    const candidateCount = this.bands.length - span + 1;
    if (candidateCount <= 0) return -1;

    for (let offset = 0; offset < candidateCount; offset++) {
      const start = this._candidateStart(params.preset, offset, candidateCount);
      if (this._isSpanFree(start, span)) {
        this._advanceRoundRobin(start, span);
        return start;
      }
    }

    if (isMovingPreset(params.preset)) {
      for (let offset = 0; offset < candidateCount; offset++) {
        const start = this._candidateStart(params.preset, offset, candidateCount);
        if (this._isSpanSafe(start, span, params.speed, params.preset === 'reverse')) {
          this._advanceRoundRobin(start, span);
          return start;
        }
      }
    }

    if (!allowOverflow) return -1;
    const start =
      params.preset === 'bottom'
        ? candidateCount - 1
        : params.preset === 'top'
          ? 0
          : this._bandRoundRobin % candidateCount;
    this._advanceRoundRobin(start, span);
    return start;
  }

  private _candidateStart(preset: PresetId, offset: number, candidateCount: number): number {
    if (preset === 'top') return offset;
    if (preset === 'bottom') return candidateCount - 1 - offset;
    return (this._bandRoundRobin + offset) % candidateCount;
  }

  private _advanceRoundRobin(start: number, span: number): void {
    if (this.bands.length === 0) return;
    this._bandRoundRobin = (start + span) % this.bands.length;
  }

  private _isSpanFree(start: number, count: number): boolean {
    const end = start + count;
    for (let index = start; index < end; index++) {
      if (this.bands[index].occupied) return false;
    }
    return true;
  }

  private _isSpanSafe(start: number, count: number, speed: number, isReverse: boolean): boolean {
    const end = start + count;
    for (let index = start; index < end; index++) {
      if (!this._isBandSafe(this.bands[index], speed, isReverse)) return false;
    }
    return true;
  }

  /**
   * A moving candidate may reuse a vertical band only when it cannot catch the
   * occupant nearest that entry edge before the occupant leaves the stage.
   */
  private _isBandSafe(band: BandState, newSpeed: number, isReverse: boolean): boolean {
    if (!band.occupied) return true;
    if (band.blocked || band.isReverse !== isReverse || band.speed <= 0) return false;

    let gap: number;
    let exitTime: number;
    if (isReverse) {
      // Candidate right edge is -20; stored edge is the old occupant's left edge.
      if (band.entryEdge > this.stageWidth + CULL_MARGIN) return true;
      gap = band.entryEdge + 20;
      exitTime = (this.stageWidth + CULL_MARGIN - band.entryEdge) / band.speed;
    } else {
      // Candidate left edge is stageWidth + 20; stored edge is the old right edge.
      if (band.entryEdge < -CULL_MARGIN) return true;
      gap = this.stageWidth + 20 - band.entryEdge;
      exitTime = (band.entryEdge + CULL_MARGIN) / band.speed;
    }

    if (gap < MIN_SPAWN_GAP) return false;
    if (newSpeed <= band.speed) return true;
    const catchTime = gap / (newSpeed - band.speed);
    return catchTime > exitTime * LANE_SAFETY_MARGIN;
  }

  private _occupyBands(slot: PoolSlot): void {
    if (slot.interactionLocked) return;
    const start = Math.max(0, slot.verticalBandStart);
    const end = Math.min(this.bands.length, start + slot.verticalBandCount);
    const moving = isMovingPreset(slot.params.preset);
    const isReverse = slot.params.preset === 'reverse';
    const entryEdge = isReverse ? slot.x : slot.x + slot.width;

    for (let index = start; index < end; index++) {
      const band = this.bands[index];
      if (!moving) {
        band.occupied = true;
        band.blocked = true;
        continue;
      }
      if (!band.occupied) {
        band.occupied = true;
        band.blocked = false;
        band.entryEdge = entryEdge;
        band.speed = slot.params.speed;
        band.isReverse = isReverse;
        continue;
      }
      if (band.blocked || band.isReverse !== isReverse) {
        band.blocked = true;
        continue;
      }
      const nearerEntry = isReverse ? entryEdge < band.entryEdge : entryEdge > band.entryEdge;
      if (nearerEntry) {
        band.entryEdge = entryEdge;
        band.speed = slot.params.speed;
      }
    }
  }
}
