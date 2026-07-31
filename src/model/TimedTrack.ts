import type { TimedDanmakuEntry, PresetId } from './types';

/** Options for {@link generateTimedTrack}. */
export interface GenerateTimedTrackOptions {
  /** Supplies each generated entry's text. The engine ships no wording. */
  textSampler: () => string;
  /**
   * Presets to pick from. Defaults to all eight motion presets.
   */
  presets?: PresetId[];
  /** Max entries generated. Default `2500` (keeps a long clip lightweight). */
  maxEntries?: number;
  /** Average entries per second before the cap. Default `4.5`. */
  perSecond?: number;
  /** Fraction of entries clustered around peak moments. Default `0.7`. */
  clusterRatio?: number;
}

const ALL_PRESETS: PresetId[] = [
  'scroll',
  'reverse',
  'top',
  'bottom',
  'sine',
  'rotation',
  'glitch',
  'repulsion',
];

/**
 * Generate a synthetic timestamp-pinned danmaku track for a clip of `duration`
 * seconds. Uses a Box–Muller Gaussian to cluster a share of entries around
 * evenly-spaced peak moments (mimicking how real barrage spikes at highlights),
 * with the rest spread uniformly.
 *
 * Pure and renderer-agnostic: text is injected via `opts.textSampler`, and no
 * persisted/user content is read here — a consumer that wants to merge its own
 * saved danmaku appends them to the returned array and re-sorts by `time`.
 */
export function generateTimedTrack(
  duration: number,
  opts: GenerateTimedTrackOptions,
): TimedDanmakuEntry[] {
  const { textSampler } = opts;
  const presets = opts.presets ?? ALL_PRESETS;
  const clusterRatio = opts.clusterRatio ?? 0.7;
  const list: TimedDanmakuEntry[] = [];

  const peakInterval = Math.max(15, Math.floor(duration * 0.15));
  const numPeaks = Math.floor(duration / peakInterval);
  const peaks: number[] = [];
  for (let i = 1; i <= numPeaks; i++) peaks.push(i * peakInterval);

  const textCount = Math.min(
    opts.maxEntries ?? 2500,
    Math.floor(duration * (opts.perSecond ?? 4.5)),
  );

  for (let i = 0; i < textCount; i++) {
    let time = 0;
    if (Math.random() < clusterRatio && peaks.length > 0) {
      const peak = peaks[Math.floor(Math.random() * peaks.length)];
      const u = Math.random() || 0.0001;
      const v = Math.random() || 0.0001;
      const spread = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * 3.5;
      time = Math.max(0.1, Math.min(duration - 0.5, peak + spread));
    } else {
      time = 0.1 + Math.random() * (duration - 0.6);
    }
    list.push({
      time: Math.round(time * 10) / 10,
      text: textSampler(),
      preset: presets[Math.floor(Math.random() * presets.length)],
      fontSize: 16 + Math.random() * 16,
      speed: 120 + Math.random() * 120,
    });
  }

  list.sort((a, b) => a.time - b.time);
  return list;
}
