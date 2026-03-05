import { createNoise2D } from "simplex-noise";

const NOISE_2D = createNoise2D()

export function noise1D(x: number) {
  return NOISE_2D(x, x)
}

export function noise2D(x: number, y: number) {
  return NOISE_2D(x, y)
}
