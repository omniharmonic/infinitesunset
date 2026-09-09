export const palettes = [
  "journey",
  "golden",
  "rose",
  "lavender",
  "blue",
  "ember",
  "custom",
] as const;
export type Palette = (typeof palettes)[number];
export interface ColorSet {
  zenith: string;
  horizon: string;
  sunlight: string;
  shadow: string;
}
export interface Settings {
  palette: Palette;
  density: number;
  speed: number;
  billow: number;
  variety: number;
  turbulence: number;
  breathingRate: number;
  light: number;
  sunRate: number;
  colorRate: number;
  colorShift: number;
  customColors: ColorSet;
  exposure: number;
  evolve: boolean;
  quality: "auto" | "high" | "eco";
  seed: number;
}
export const defaults: Settings = {
  palette: "journey",
  density: 0.95,
  speed: 0.22,
  billow: 0.62,
  variety: 0.72,
  turbulence: 0.35,
  breathingRate: 1,
  light: 0.32,
  sunRate: 1,
  colorRate: 1,
  colorShift: 0.3,
  customColors: {
    zenith: "#3c4d73",
    horizon: "#c17c55",
    sunlight: "#cf9b6e",
    shadow: "#4d5d7c",
  },
  exposure: 1.05,
  evolve: true,
  quality: "auto",
  seed: 7241,
};
export const ranges = {
  density: [0, 2.5],
  speed: [0, 1],
  billow: [0, 1],
  variety: [0, 1],
  turbulence: [0, 1],
  breathingRate: [0, 4],
  light: [0, 1],
  sunRate: [0, 8],
  colorRate: [0, 8],
  colorShift: [0, 1],
  exposure: [0.4, 1.8],
} as const;
export type RangeKey = keyof typeof ranges;
export function sanitize(value: unknown): Settings {
  const v = (
    value && typeof value === "object" ? value : {}
  ) as Partial<Settings>;
  const s = { ...defaults, customColors: { ...defaults.customColors } };
  for (const key of Object.keys(ranges) as RangeKey[]) {
    const n = v[key];
    if (typeof n === "number" && Number.isFinite(n))
      s[key] = Math.max(ranges[key][0], Math.min(ranges[key][1], n));
  }
  if (palettes.includes(v.palette as Palette)) s.palette = v.palette!;
  if (["auto", "high", "eco"].includes(v.quality!)) s.quality = v.quality!;
  if (typeof v.evolve === "boolean") s.evolve = v.evolve;
  if (typeof v.seed === "number" && Number.isFinite(v.seed))
    s.seed = Math.abs(Math.floor(v.seed)) % 1000000;
  if (v.customColors && typeof v.customColors === "object")
    for (const key of Object.keys(s.customColors) as (keyof ColorSet)[]) {
      const c = v.customColors[key];
      if (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c))
        s.customColors[key] = c.toLowerCase();
    }
  return s;
}
export function readSettings(): Settings {
  try {
    const shared = new URLSearchParams(location.hash.slice(1)).get("sky");
    return sanitize(
      JSON.parse(shared ?? localStorage.getItem("infinite-sunset:v1") ?? "{}"),
    );
  } catch {
    return sanitize(null);
  }
}
export function saveSettings(s: Settings) {
  try {
    localStorage.setItem("infinite-sunset:v1", JSON.stringify(s));
  } catch {
    /* Private browsing still works. */
  }
}
export function shareURL(s: Settings) {
  const url = new URL(location.href);
  url.hash = new URLSearchParams({ sky: JSON.stringify(s) }).toString();
  return url.toString();
}
