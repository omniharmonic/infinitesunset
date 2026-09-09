import { Color, Vector3 } from "three";
import type { ColorSet } from "./settings";
export const themeColors = [
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

export const colorKeys = ["zenith", "horizon", "sunlight", "shadow"] as const;
export function colorsToHex(colors: Vector3[]): ColorSet {
  return Object.fromEntries(
    colorKeys.map((key, i) => {
      const c = colors[i];
      const gain = i === 2 ? 2 : 1;
      return [
        key,
        "#" +
          new Color().setRGB(c.x / gain, c.y / gain, c.z / gain).getHexString(),
      ];
    }),
  ) as unknown as ColorSet;
}
export function customVectors(set: ColorSet): Vector3[] {
  return colorKeys.map((key, i) => {
    const c = new Color(set[key]);
    return new Vector3(c.r, c.g, c.b).multiplyScalar(i === 2 ? 2 : 1);
  });
}
