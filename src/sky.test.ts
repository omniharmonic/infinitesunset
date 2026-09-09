import { describe, it, expect } from "vitest";
import { Vector2, Vector3 } from "three";
import { Sky } from "./engine/Sky";
import { defaults, sanitize } from "./settings";
import type { Hand } from "./engine/core";
describe("a persistent, finite sky", () => {
  it("recreates a shared formation deterministically", () => {
    const a = new Sky({ ...defaults, seed: 841 }),
      b = new Sky({ ...defaults, seed: 841 });
    expect(a.snapshot().checksum).toBe(b.snapshot().checksum);
    expect(new Sky({ ...defaults, seed: 842 }).snapshot().checksum).not.toBe(
      a.snapshot().checksum,
    );
  });
  it("responds to a hand and continues with inertia after release", () => {
    const a = new Sky({ ...defaults, speed: 0 }),
      b = new Sky({ ...defaults, speed: 0 });
    const hand: Hand = {
      position: new Vector3(1, 3, 0),
      velocity: new Vector3(3, 2, 0),
      screen: new Vector2(),
      strength: 1,
      action: "swirl",
    };
    for (let i = 0; i < 120; i++) {
      a.update(1 / 30, [hand]);
      b.update(1 / 30, []);
    }
    expect(
      Math.abs(a.snapshot().checksum - b.snapshot().checksum),
    ).toBeGreaterThan(1);
    const before = a.centers.map((c) => c.clone());
    a.update(1 / 30, []);
    expect(
      a.centers.some((c, i) => c.clone().sub(before[i]).length() > 0.0001),
    ).toBe(true);
  });
  it("stays bounded through repeated recycling and extreme hand forces", () => {
    const a = new Sky({ ...defaults, speed: 1 });
    const hand: Hand = {
      position: new Vector3(),
      velocity: new Vector3(10000, 10000, 10000),
      screen: new Vector2(),
      strength: 1,
      action: "push",
    };
    for (let i = 0; i < 20000; i++) a.update(0.05, i % 150 < 20 ? [hand] : []);
    expect(a.drift).toBeGreaterThan(200);
    for (const c of a.centers) {
      expect(c.toArray().every(Number.isFinite)).toBe(true);
      expect(c.x).toBeGreaterThan(-30);
      expect(c.x).toBeLessThan(30);
      expect(c.y).toBeLessThanOrEqual(11);
      expect(c.w).toBeGreaterThan(0);
    }
  });
  it("holds simulation time and cloud positions at zero timestep", () => {
    const a = new Sky({ ...defaults });
    a.update(0.03, []);
    const before = a.snapshot();
    a.update(0, []);
    expect(a.snapshot()).toEqual(before);
  });
  it("cycles color stories continuously through the loop boundary", () => {
    const a = new Sky({ ...defaults });
    a.lightTime = 170 * 5 - 0.001;
    a.update(0, []);
    const colors = a.colors.map((c) => c.clone());
    a.lightTime = 170 * 5 + 0.001;
    a.update(0, []);
    for (let i = 0; i < 4; i++)
      expect(a.colors[i].distanceTo(colors[i])).toBeLessThan(0.001);
  });
});
describe("untrusted shared settings", () => {
  it("rejects invalid values and clamps numeric ranges", () => {
    expect(
      sanitize({
        palette: "bad",
        density: 100,
        exposure: -10,
        speed: NaN,
        seed: Infinity,
        quality: "ultra",
        evolve: "false",
      }),
    ).toEqual({ ...defaults, density: 1, exposure: 0.4 });
  });
  it("does not allow arbitrary properties into state", () => {
    expect(sanitize({ html: "<script>", density: 0.2 })).toEqual({
      ...defaults,
      density: 0.2,
    });
    expect(sanitize(null)).toEqual(defaults);
  });
});
