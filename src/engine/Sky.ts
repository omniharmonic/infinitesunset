import { Color, Vector3, Vector4, PerspectiveCamera } from "three";
import type { Hand } from "./core";
import type { Settings } from "../settings";
import { themeColors, customVectors } from "../colors";
export const COUNT = 96;
const GROUPS = 16,
  PER_GROUP = COUNT / GROUPS;
export const BOUNDS_MIN = [-25, -5, -18];
export const BOUNDS_MAX = [25, 17, 10];
export class Sky {
  readonly centers = Array.from({ length: COUNT }, () => new Vector4());
  readonly shapes = Array.from(
    { length: COUNT },
    () => new Vector4(1.18, 0.88, 1, 0),
  );
  readonly velocities = Array.from({ length: COUNT }, () => new Vector3());
  private origins = Array.from({ length: COUNT }, () => new Vector3());
  private targetShapes = Array.from({ length: COUNT }, () => new Vector4());
  private radii = new Float32Array(COUNT);
  private travel = new Float64Array(GROUPS);
  private generations = new Uint32Array(GROUPS);
  private flow = new Vector3();
  private mean = new Vector3();
  private tint = new Color();
  readonly camera = new PerspectiveCamera(49, 1, 0.1, 150);
  readonly sunlight = new Vector3();
  readonly colors = Array.from({ length: 4 }, () => new Vector3());
  time = 0;
  lightTime = 0;
  colorTime = 0;
  cloudTime = 0;
  drift = 0;
  revision = 0;
  recycled = 0;
  constructor(public settings: Settings) {
    this.reset();
    this.camera.position.set(0, 3.1, 18);
    this.camera.lookAt(0, 4, -4);
    this.camera.updateMatrixWorld();
    this.update(0, []);
  }
  private makeGroup(group: number, place: boolean) {
    let state =
      (this.settings.seed +
        Math.imul(group + 1, 71933) +
        Math.imul(this.generations[group], 19349663)) >>>
      0;
    const rand = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const diversity = this.settings.variety;
    const gx = -26 + group * 3.4,
      gy = 1.7 + rand() * 5.2,
      gz = -10 + rand() * 11;
    const kind = Math.floor(rand() * 4),
      angle = rand() * Math.PI * 2;
    // Towers, broad banks, thin shelves, and scattered puffs vary in size and depth.
    const axes = [
      [0.85, 1.35, 0.85],
      [1.65, 0.64, 1.15],
      [2.0, 0.32, 1.3],
      [1.02, 0.9, 0.8],
    ][kind];
    const groupScale = 0.75 + rand() * 0.75;
    for (let j = 0; j < PER_GROUP; j++) {
      const i = group * PER_GROUP + j,
        a = angle + j * (1.4 + rand() * 1.8),
        spread = Math.sqrt(j) * (0.8 + rand() * 1.0);
      const jitter = (rand() - 0.5) * diversity;
      this.origins[i].set(
        gx + Math.cos(a) * spread,
        gy +
          Math.sin(j * 2.1) * (0.45 + diversity * 0.75) +
          (kind === 0 ? j * 0.27 : 0),
        gz + Math.sin(a) * spread * 0.7,
      );
      this.radii[i] =
        (1.05 + rand() * 0.95) * (1 + (groupScale - 1) * diversity);
      const shape = this.targetShapes[i];
      shape.set(
        1.18 + (axes[0] - 1.18) * diversity + jitter * 0.16,
        0.88 + (axes[1] - 0.88) * diversity,
        1 + (axes[2] - 1) * diversity,
        rand(),
      );
      if (place) {
        const o = this.origins[i];
        this.centers[i].set(
          o.x + this.travel[group],
          o.y,
          o.z,
          this.radii[i] * (0.5 + Math.sqrt(this.settings.density) * 0.65),
        );
        this.shapes[i].copy(shape);
        this.velocities[i].set(0, 0, 0);
      }
    }
  }
  reshape() {
    for (let g = 0; g < GROUPS; g++) this.makeGroup(g, false);
    this.revision++;
  }
  reset() {
    this.time = 0;
    this.lightTime = 0;
    this.colorTime = 0;
    this.cloudTime = 0;
    this.drift = 0;
    this.recycled = 0;
    this.travel.fill(0);
    this.generations.fill(0);
    for (let g = 0; g < GROUPS; g++) this.makeGroup(g, true);
    this.revision++;
  }
  update(dt: number, hands: Hand[]) {
    dt = Math.max(0, Math.min(dt, 1 / 20));
    const s = this.settings;
    this.time += dt;
    if (s.evolve) {
      this.lightTime += dt * s.sunRate;
      this.colorTime += dt * s.colorRate;
    }
    this.cloudTime += dt * s.breathingRate;
    this.drift += dt * s.speed * 0.24;
    const index =
      s.palette === "journey"
        ? this.colorTime / 100
        : Math.max(
            0,
            ["golden", "rose", "lavender", "blue", "ember"].indexOf(s.palette),
          );
    const a = Math.floor(index) % 5,
      b = (a + 1) % 5,
      f = s.palette === "journey" ? index - Math.floor(index) : 0,
      t = f * f * (3 - 2 * f);
    const custom =
      s.palette === "custom" ? customVectors(s.customColors) : null;
    for (let k = 0; k < 4; k++) {
      const c = this.colors[k];
      if (custom) c.copy(custom[k]);
      else
        c.fromArray(themeColors[a][k]).lerp(
          this.flow.fromArray(themeColors[b][k]),
          t,
        );
      // Named and custom stories move around their chosen colors, independently of the sun.
      const wave =
        Math.sin(this.colorTime * 0.022 + k * 0.25) - Math.sin(k * 0.25);
      const gain = k === 2 ? 2 : 1;
      this.tint
        .setRGB(c.x / gain, c.y / gain, c.z / gain)
        .offsetHSL(
          wave * s.colorShift * 0.1,
          Math.sin(this.colorTime * 0.017) * s.colorShift * 0.08,
          0,
        );
      c.set(this.tint.r * gain, this.tint.g * gain, this.tint.b * gain);
    }
    const azimuth =
      (s.light - 0.5) * 2.2 + Math.sin(this.lightTime / 95) * 0.42;
    this.sunlight
      .set(
        Math.sin(azimuth),
        0.16 + Math.sin(this.lightTime / 123) * 0.09,
        -Math.cos(azimuth),
      )
      .normalize();
    for (let group = 0; group < GROUPS; group++) {
      this.travel[group] += dt * s.speed * 0.24 * (0.7 + (group % 5) * 0.14);
      if (-26 + group * 3.4 + this.travel[group] > 32) {
        this.travel[group] -= 64;
        this.generations[group]++;
        this.recycled++;
        this.makeGroup(group, true);
      }
      this.mean.set(0, 0, 0);
      for (let j = 0; j < PER_GROUP; j++)
        this.mean.add(this.velocities[group * PER_GROUP + j]);
      this.mean.multiplyScalar(1 / PER_GROUP);
      for (let j = 0; j < PER_GROUP; j++) {
        const i = group * PER_GROUP + j,
          p = this.centers[i],
          v = this.velocities[i],
          o = this.origins[i],
          clock = this.cloudTime;
        const phase = i * 1.71;
        const breath = Math.sin(clock * 0.16 + group * 0.9);
        const x =
          o.x +
          this.travel[group] +
          Math.sin(clock * 0.11 + phase) * s.billow * 0.45;
        const y =
          o.y +
          (breath * 0.55 + Math.sin(clock * 0.23 + phase) * 0.22) * s.billow;
        const z = o.z + Math.cos(clock * 0.13 + phase) * s.billow * 0.5;
        v.x += (x - p.x) * dt * 0.18;
        v.y += (y - p.y) * dt * 0.18;
        v.z += (z - p.z) * dt * 0.18;
        // A divergence-free analytic flow (each component independent of its own axis),
        // buoyancy-like lift, and within-bank velocity diffusion drive continuous deformation.
        const force = s.turbulence * s.breathingRate * dt * 0.45;
        v.x += Math.sin(p.y * 0.6 + clock * 0.21) * force;
        v.y += Math.sin(p.z * 0.55 + clock * 0.17) * force * 0.7;
        v.z += Math.sin(p.x * 0.45 - clock * 0.19) * force;
        v.addScaledVector(this.flow.copy(this.mean).sub(v), dt * 0.18);
        let radius =
          this.radii[i] *
          (0.5 + Math.sqrt(s.density) * 0.65) *
          (1 +
            s.billow *
              (breath * 0.14 + Math.sin(clock * 0.29 + phase) * 0.065));
        for (const h of hands) {
          const dx = p.x - h.position.x,
            dy = p.y - h.position.y,
            dz = p.z - h.position.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;
          const f = Math.exp((-dist * dist) / 35) * dt * 1.6;
          v.x += h.velocity.x * f;
          v.y += h.velocity.y * f;
          if (h.action === "gather") {
            v.x -= dx * f * 2;
            v.y -= dy * f * 2;
            v.z -= dz * f;
            radius *= 0.84;
          }
          if (h.action === "push") {
            v.x += (dx / dist) * f * 8;
            v.y += (dy / dist) * f * 8;
            v.z += (dz / dist) * f * 5;
          }
          if (h.action === "swirl") {
            v.x += (-dy * 2.5 - dx * 0.2) * f;
            v.y += (dx * 2.5 - dy * 0.2) * f;
          }
          if (h.action === "lift") v.y += f * 5;
          if (h.action === "calm") v.multiplyScalar(Math.exp(-f * 5));
        }

        v.multiplyScalar(Math.exp(-dt * 0.65)).clampLength(0, 5);
        p.x += v.x * dt;
        p.y = Math.max(-0.5, Math.min(11, p.y + v.y * dt));
        p.z = Math.max(-12, Math.min(5, p.z + v.z * dt));
        p.w += (radius - p.w) * (1 - Math.exp(-dt * 2));
        this.shapes[i].lerp(this.targetShapes[i], 1 - Math.exp(-dt * 2));
      }
    }
    if (dt > 0) this.revision++;
  }
  snapshot() {
    return {
      time: this.time,
      lightTime: this.lightTime,
      colorTime: this.colorTime,
      cloudTime: this.cloudTime,
      drift: this.drift,
      revision: this.revision,
      recycled: this.recycled,
      clouds: COUNT,
      colorValues: this.colors.map((c) => c.toArray()),
      sun: this.sunlight.toArray(),
      checksum: this.centers.reduce(
        (sum, c, i) => sum + c.x * (i + 1) + c.y * 0.7 + c.w,
        0,
      ),
    };
  }
}
export interface SkyRenderer {
  readonly kind: string;
  render(sky: Sky): void;
  resize(width: number, height: number, ratio: number): void;
  dispose(): void;
}
