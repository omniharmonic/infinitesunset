import { Vector3, Vector4, PerspectiveCamera } from "three";
import type { Hand } from "./core";
import type { Settings } from "../settings";
export const COUNT = 48;
export const BOUNDS_MIN = [-25, -3, -15];
export const BOUNDS_MAX = [25, 14, 8];
// Linear-light colors: zenith, horizon, direct sunlight, diffuse cloud shadow.
const colors = [
  [
    [0.045, 0.075, 0.17],
    [0.53, 0.18, 0.09],
    [1.25, 0.66, 0.31],
    [0.075, 0.11, 0.2],
  ],
  [
    [0.125, 0.07, 0.23],
    [0.62, 0.17, 0.19],
    [1.35, 0.64, 0.52],
    [0.17, 0.135, 0.3],
  ],
  [
    [0.085, 0.07, 0.25],
    [0.42, 0.23, 0.41],
    [1.16, 0.72, 0.83],
    [0.135, 0.15, 0.33],
  ],
  [
    [0.026, 0.075, 0.19],
    [0.32, 0.22, 0.29],
    [0.82, 0.74, 0.83],
    [0.085, 0.15, 0.27],
  ],
  [
    [0.085, 0.047, 0.13],
    [0.92, 0.2, 0.035],
    [1.8, 0.62, 0.16],
    [0.14, 0.105, 0.19],
  ],
];
export class Sky {
  readonly centers = Array.from({ length: COUNT }, () => new Vector4());
  readonly velocities = Array.from({ length: COUNT }, () => new Vector3());
  private origins = Array.from({ length: COUNT }, () => new Vector3());
  private radii = new Float32Array(COUNT);
  readonly camera = new PerspectiveCamera(49, 1, 0.1, 150);
  readonly sunlight = new Vector3();
  readonly colors = Array.from({ length: 4 }, () => new Vector3());
  time = 0;
  lightTime = 0;
  drift = 0;
  revision = 0;
  constructor(public settings: Settings) {
    this.reset();
    this.camera.position.set(0, 3.1, 18);
    this.camera.lookAt(0, 4, -4);
    this.camera.updateMatrixWorld();
    this.update(0, []);
  }
  reset() {
    let state = this.settings.seed;
    const rand = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    for (let group = 0; group < 8; group++) {
      const gx = -21 + group * 6 + rand() * 1.5,
        gy = group % 3 === 0 ? 6.5 : 2 + rand() * 2.5,
        gz = -8 + rand() * 10;
      for (let j = 0; j < 6; j++) {
        const i = group * 6 + j;
        const a = j * 2.39996;
        const r = Math.sqrt(j) * 0.98;
        this.origins[i].set(
          gx + Math.cos(a) * r,
          gy + Math.sin(j * 2.1) * 0.8 + (j < 2 ? 1 : 0),
          gz + Math.sin(a) * r * 0.8,
        );
        this.radii[i] = 1.3 + rand() * 0.8;
        const o = this.origins[i];
        this.centers[i].set(o.x, o.y, o.z, this.radii[i]);
        this.velocities[i].set(0, 0, 0);
      }
    }
    this.time = 0;
    this.lightTime = 0;
    this.drift = 0;
    this.revision++;
  }
  update(dt: number, hands: Hand[]) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    if (this.settings.evolve) this.lightTime += dt;
    this.drift += dt * this.settings.speed * 0.24;
    const s = this.settings;
    const phase = this.lightTime / 170;
    const index =
      s.palette === "journey"
        ? phase
        : ["golden", "rose", "lavender", "blue", "ember"].indexOf(s.palette);
    const a = Math.floor(index) % 5,
      b = (a + 1) % 5,
      f = s.palette === "journey" ? index - Math.floor(index) : 0,
      t = f * f * (3 - 2 * f);
    for (let k = 0; k < 4; k++)
      this.colors[k]
        .fromArray(colors[a][k])
        .lerp(new Vector3().fromArray(colors[b][k]), t);
    const azimuth =
      (s.light - 0.5) * 2.2 + Math.sin(this.lightTime / 140) * 0.16;
    this.sunlight
      .set(
        Math.sin(azimuth),
        0.16 + Math.sin(this.lightTime / 180) * 0.06,
        -Math.cos(azimuth),
      )
      .normalize();
    for (let i = 0; i < COUNT; i++) {
      const p = this.centers[i],
        v = this.velocities[i],
        o = this.origins[i];
      let x = ((o.x + this.drift + 27) % 54) - 27;
      // Wrap only outside the visible frustum, carrying each billow's displacement.
      if (Math.abs(x - p.x) > 40) {
        p.x = x;
        v.x = 0;
      }
      const y = o.y + Math.sin(this.time * 0.035 + i) * 0.17 * s.billow;
      v.x += (x - p.x) * dt * 0.18;
      v.y += (y - p.y) * dt * 0.18;
      v.z += (o.z - p.z) * dt * 0.18;
      let radius =
        this.radii[i] *
        (0.55 + s.density * 0.68) *
        (1 + Math.sin(this.time * 0.055 + i) * s.billow * 0.04);
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
      v.multiplyScalar(Math.exp(-dt * 0.9)).clampLength(0, 5);
      p.x += v.x * dt;
      p.y = Math.max(-0.5, Math.min(11, p.y + v.y * dt));
      p.z = Math.max(-12, Math.min(5, p.z + v.z * dt));
      p.w += (radius - p.w) * (1 - Math.exp(-dt * 2));
    }
    if (dt > 0) this.revision++;
  }
  snapshot() {
    return {
      time: this.time,
      drift: this.drift,
      revision: this.revision,
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
