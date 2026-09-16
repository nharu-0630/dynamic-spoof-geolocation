import { speedLimitAtKm } from './route';

/**
 * A running model for the line: the train pulls away at {@link ACCEL}, holds
 * `alpha` × the line speed limit, and brakes at {@link DECEL} into the next
 * stop. `alpha` is the padding factor — real schedules are cut with several
 * percent of 余裕時分, so a train that is timed generously simply cruises below
 * the limit rather than sprinting and then idling.
 *
 * Rates are averages for an N700S over the whole speed range, not the peak
 * 起動加速度: 0 → 285 km/h works out at just over 2.5 min and about 6 km, and
 * braking from 285 km/h at 0.7 m/s² needs about 4.5 km, which is what service
 * braking on the line actually looks like.
 */
export const ACCEL = 0.5;
export const DECEL = 0.7;

/** A train never crawls below this fraction of the limit; extra time waits at a station instead. */
export const ALPHA_FLOOR = 0.72;

const STEP_M = 200;

export interface LegProfile {
  distanceM: number;
  durationSec: number;
  /** Distance travelled from the start of the leg, in metres. */
  sampleS: Float64Array;
  /** Time from the start of the leg, in seconds. */
  sampleT: Float64Array;
  /** Speed at each sample, in m/s. */
  sampleV: Float64Array;
}

/**
 * Builds the speed profile for one stop-to-stop leg. `fromKm`/`toKm` are
 * distances from 東京, so an 上り leg has `toKm < fromKm`.
 */
export function profileLeg(fromKm: number, toKm: number, alpha: number): LegProfile {
  const distanceM = Math.abs(toKm - fromKm) * 1000;
  const sign = Math.sign(toKm - fromKm) || 1;
  const steps = Math.max(1, Math.round(distanceM / STEP_M));
  const ds = distanceM / steps;
  const n = steps + 1;

  const sampleS = new Float64Array(n);
  const ceiling = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    sampleS[i] = i * ds;
    const km = fromKm + (sign * sampleS[i]!) / 1000;
    ceiling[i] = alpha * speedLimitAtKm(km);
  }
  // The train is stationary at both ends of the leg.
  ceiling[0] = 0;
  ceiling[n - 1] = 0;

  const forward = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    forward[i] = Math.min(ceiling[i]!, Math.sqrt(forward[i - 1]! ** 2 + 2 * ACCEL * ds));
  }
  const sampleV = new Float64Array(n);
  let back = 0;
  for (let i = n - 1; i >= 0; i--) {
    back = i === n - 1 ? 0 : Math.min(ceiling[i]!, Math.sqrt(back ** 2 + 2 * DECEL * ds));
    sampleV[i] = Math.min(forward[i]!, back);
  }

  const sampleT = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const mean = sampleV[i - 1]! + sampleV[i]!;
    sampleT[i] = sampleT[i - 1]! + (mean > 0 ? (2 * ds) / mean : 0);
  }

  return { distanceM, durationSec: sampleT[n - 1]!, sampleS, sampleT, sampleV };
}

/** Shortest possible running time for a leg, in seconds. */
export function fastestLegSeconds(fromKm: number, toKm: number): number {
  return profileLeg(fromKm, toKm, 1).durationSec;
}

/**
 * Finds the padding factor that makes a set of legs take `targetSec` in total.
 * Returns {@link ALPHA_FLOOR} (and a positive `surplusSec`) when the schedule is
 * so slack that the train would have to crawl — that surplus belongs in station
 * waits, the way a こだま waits to be overtaken.
 */
export function solveAlpha(
  legs: readonly (readonly [number, number])[],
  targetSec: number,
): { alpha: number; surplusSec: number } {
  const totalAt = (alpha: number) =>
    legs.reduce((sum, [from, to]) => sum + profileLeg(from, to, alpha).durationSec, 0);

  if (totalAt(1) >= targetSec) return { alpha: 1, surplusSec: 0 };
  const floorTotal = totalAt(ALPHA_FLOOR);
  if (floorTotal <= targetSec) {
    return { alpha: ALPHA_FLOOR, surplusSec: targetSec - floorTotal };
  }

  let lo = ALPHA_FLOOR;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (totalAt(mid) > targetSec) lo = mid;
    else hi = mid;
  }
  return { alpha: (lo + hi) / 2, surplusSec: 0 };
}
