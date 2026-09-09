export const palettes = [
  "journey",
  "golden",
  "rose",
  "lavender",
  "blue",
  "ember",
] as const;
export type Palette = (typeof palettes)[number];
export interface Settings {
  palette: Palette;
  density: number;
  speed: number;
  billow: number;
  light: number;
  exposure: number;
  evolve: boolean;
  quality: "auto" | "high" | "eco";
  seed: number;
}
export const defaults: Settings = {
  palette: "journey",
  density: 0.68,
  speed: 0.22,
  billow: 0.5,
  light: 0.32,
  exposure: 1.05,
  evolve: true,
  quality: "auto",
  seed: 7241,
};
export function sanitize(value: unknown): Settings {
  const v = (
    value && typeof value === "object" ? value : {}
  ) as Partial<Settings>;
  const s = { ...defaults };
  for (const k of [
    "density",
    "speed",
    "billow",
    "light",
    "exposure",
  ] as const) {
    const n = v[k];
    if (typeof n === "number" && Number.isFinite(n))
      s[k] = Math.max(
        k === "exposure" ? 0.4 : 0,
        Math.min(k === "exposure" ? 1.8 : 1, n),
      );
  }
  if (palettes.includes(v.palette as Palette)) s.palette = v.palette!;
  if (["auto", "high", "eco"].includes(v.quality!)) s.quality = v.quality!;
  if (typeof v.evolve === "boolean") s.evolve = v.evolve;
  if (typeof v.seed === "number" && Number.isFinite(v.seed))
    s.seed = Math.abs(Math.floor(v.seed)) % 1000000;
  return s;
}
export function readSettings(): Settings {
  try {
    const shared = new URLSearchParams(location.hash.slice(1)).get("sky");
    return sanitize(
      JSON.parse(shared ?? localStorage.getItem("infinite-sunset:v1") ?? "{}"),
    );
  } catch {
    return { ...defaults };
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
