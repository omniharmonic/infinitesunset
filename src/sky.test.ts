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
      expect(c.x).toBeGreaterThan(-40);
      expect(c.x).toBeLessThan(40);
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
    a.colorTime = 100 * 5 - 0.001;
    a.update(0, []);
    const colors = a.colors.map((c) => c.clone());
    a.colorTime = 100 * 5 + 0.001;
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
    ).toEqual({ ...defaults, density: 2.5, exposure: 0.4 });
  });
  it("does not allow arbitrary properties into state", () => {
    expect(sanitize({ html: "<script>", density: 0.2 })).toEqual({
      ...defaults,
      density: 0.2,
    });
    expect(sanitize(null)).toEqual(defaults);
  });
});

describe("expanded atmosphere", () => {
  it("animates named colors independently of a stationary sun", () => {
    const sky = new Sky({
      ...defaults,
      palette: "rose",
      sunRate: 0,
      colorRate: 4,
    });
    const sun = sky.sunlight.clone(),
      before = sky.colors.map((c) => c.clone());
    for (let i = 0; i < 300; i++) sky.update(1 / 30, []);
    expect(sky.sunlight.toArray()).toEqual(sun.toArray());
    expect(sky.colors.some((c, i) => c.distanceTo(before[i]) > 0.02)).toBe(
      true,
    );
  });
  it("holds colors when color speed is zero, with sunlight still moving", () => {
    const sky = new Sky({
      ...defaults,
      palette: "lavender",
      colorRate: 0,
      sunRate: 5,
    });
    const sun = sky.sunlight.clone(),
      before = sky.colors.map((c) => c.toArray());
    for (let i = 0; i < 300; i++) sky.update(1 / 30, []);
    expect(sky.colors.map((c) => c.toArray())).toEqual(before);
    expect(sky.sunlight.distanceTo(sun)).toBeGreaterThan(0.1);
  });
  it("changes rates without jumping either clock and freezes both when evolution is off", () => {
    const sky = new Sky({ ...defaults });
    for (let i = 0; i < 60; i++) sky.update(0.05, []);
    const before = sky.snapshot();
    sky.settings.sunRate = 8;
    sky.settings.colorRate = 4;
    sky.update(0, []);
    expect(sky.snapshot()).toEqual(before);
    sky.settings.evolve = false;
    for (let i = 0; i < 60; i++) sky.update(0.05, []);
    expect(sky.lightTime).toBe(before.lightTime);
    expect(sky.colorTime).toBe(before.colorTime);
  });
  it("offers substantially more cloud volume at high cover", () => {
    const sparse = new Sky({ ...defaults, density: 0.5 }),
      dense = new Sky({ ...defaults, density: 2.5 });
    const volume = (sky: Sky) =>
      sky.centers.reduce((sum, c) => sum + c.w ** 3, 0);
    expect(volume(dense)).toBeGreaterThan(volume(sparse) * 3);
  });
  it("diversifies silhouettes and regenerates new banks beyond the view", () => {
    const plain = new Sky({ ...defaults, variety: 0 }),
      varied = new Sky({ ...defaults, variety: 1, speed: 1 });
    expect(new Set(plain.shapes.map((c) => c.y.toFixed(2))).size).toBe(1);
    expect(
      new Set(varied.shapes.map((c) => c.y.toFixed(2))).size,
    ).toBeGreaterThan(3);
    const shapes = varied.shapes.map((s) => s.toArray());
    for (let i = 0; i < 10000; i++) varied.update(0.05, []);
    expect(varied.recycled).toBeGreaterThan(10);
    expect(varied.shapes.map((s) => s.toArray())).not.toEqual(shapes);
  });
  it("makes faster breathing measurably deform a stationary cloudscape", () => {
    const still = new Sky({
        ...defaults,
        speed: 0,
        breathingRate: 0,
        turbulence: 0,
      }),
      alive = new Sky({
        ...defaults,
        speed: 0,
        breathingRate: 4,
        billow: 1,
        turbulence: 1,
      });
    for (let i = 0; i < 240; i++) {
      still.update(1 / 30, []);
      alive.update(1 / 30, []);
    }
    expect(
      alive.centers.reduce(
        (sum, c, i) => sum + c.clone().sub(still.centers[i]).length(),
        0,
      ),
    ).toBeGreaterThan(20);
  });
  it("sanitizes custom colors, rate limits, and legacy preferences", () => {
    const s = sanitize({
      palette: "custom",
      sunRate: 99,
      colorRate: -5,
      breathingRate: Infinity,
      customColors: { zenith: "#AaBBcc", horizon: "javascript:bad" },
    });
    expect(s.customColors.zenith).toBe("#aabbcc");
    expect(s.customColors.horizon).toBe(defaults.customColors.horizon);
    expect(s.sunRate).toBe(8);
    expect(s.colorRate).toBe(0);
    expect(s.breathingRate).toBe(1);
    expect(sanitize({ density: 0.68, evolve: false }).evolve).toBe(false);
    s.customColors.zenith = "#000000";
    expect(defaults.customColors.zenith).not.toBe("#000000");
  });
});
