import { describe, expect, it } from "bun:test";
import { generateTimedTrack } from "../src/model/TimedTrack";

describe("generateTimedTrack", () => {
  const textSampler = () => "x";

  it("generates entries within [0, duration] sorted by time", () => {
    const track = generateTimedTrack(30, { textSampler });
    expect(track.length).toBeGreaterThan(0);
    for (let i = 1; i < track.length; i++) {
      expect(track[i].time).toBeGreaterThanOrEqual(track[i - 1].time);
    }
    for (const e of track) {
      expect(e.time).toBeGreaterThanOrEqual(0);
      expect(e.time).toBeLessThanOrEqual(30);
    }
  });

  it("sources text from the injected sampler", () => {
    const track = generateTimedTrack(20, { textSampler: () => "MEME" });
    expect(track.every((e) => e.text === "MEME")).toBe(true);
  });

  it("honors the maxEntries cap", () => {
    const track = generateTimedTrack(10000, { textSampler, maxEntries: 100 });
    expect(track.length).toBeLessThanOrEqual(100);
  });

  it("only uses presets from the provided list", () => {
    const track = generateTimedTrack(60, { textSampler, presets: ["scroll"] });
    expect(track.every((e) => e.preset === "scroll")).toBe(true);
  });
});
