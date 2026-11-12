// Team colors: the engine stores the dark-surface steps; on paper we print the light-surface step of the same hue.
import { LIGHT_STEP } from '../../src/render/raster';

export function teamColor(hex: string, dark: boolean): string {
  if (dark) return hex;
  return LIGHT_STEP[hex.toLowerCase()] ?? hex;
}

export const TERRAIN_PAPER: Record<number, string> = {
  0: '#c9d6d8', 1: '#ebe4d3', 2: '#e2d9b0', 3: '#c6d1b8', 4: '#d2c9b9', 5: '#dcd2c4', 6: '#c7b693',
};
export const TERRAIN_NIGHT: Record<number, string> = {
  0: '#17211f', 1: '#22201b', 2: '#2b2a1d', 3: '#1c271e', 4: '#2d2a24', 5: '#2a2621', 6: '#3d3322',
};
/** Engraving marks drawn over terrain: forests get stipple, mountains get carets, water gets ripples. */
export const INK_PAPER = 'rgba(27,26,23,0.32)';
export const INK_NIGHT = 'rgba(235,229,216,0.18)';
