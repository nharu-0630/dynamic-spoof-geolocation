import { bearing, lowerBound } from '@/core/geo';
import type { Direction } from '@/data/tokaido-pattern';

export interface PlanStop {
  name: string;
  nameEn: string;
  km: number;
  arriveSec: number | null;
  departSec: number | null;
  passing: boolean;
}

/**
 * Everything needed to place a train on the map at a given moment. Built once,
 * then handed to the page, so the injected script never needs the route data.
 */
export interface RunPlan {
  trainId: string;
  label: string;
  direction: Direction;
  originName: string;
  destName: string;
  through?: string;
  /** Wall-clock time of the departure from the originating station. */
  departEpochMs: number;
  /** Journey length in seconds. */
  totalSec: number;
  /** Simulated seconds per real second. */
  timeScale: number;
  stops: PlanStop[];
  /** Seconds since departure; strictly non-decreasing. */
  sampleT: Float64Array;
  /** Distance from 東京 in km at each sample. */
  sampleKm: Float64Array;
  /** Speed in m/s at each sample. */
  sampleV: Float64Array;
  /** Flat [lat, lon, …] of the alignment. */
  path: Float64Array;
  /** Distance from 東京 in km for each point of {@link path}. */
  pathKm: Float64Array;
}

export interface TrainState {
  lat: number;
  lon: number;
  /** m/s. */
  speed: number;
  /** Degrees clockwise from north. */
  heading: number;
  km: number;
  /** Seconds since departure, clamped to the journey. */
  elapsedSec: number;
  /** True once the train has arrived at its terminus. */
  finished: boolean;
  /** True while the train is still sitting at its origin. */
  waiting: boolean;
  /** Station the train is standing at, if any. */
  atStation: string | null;
  /** Next station it calls at, if any. */
  nextStop: PlanStop | null;
}

/**
 * Position of the train `atEpochMs`. Pure arithmetic over the plan's arrays, so
 * this runs anywhere — including the MAIN-world script inside a page.
 */
export function evaluatePlan(plan: RunPlan, atEpochMs: number): TrainState {
  const raw = ((atEpochMs - plan.departEpochMs) / 1000) * plan.timeScale;
  const elapsedSec = Math.min(Math.max(raw, 0), plan.totalSec);

  const i = lowerBound(plan.sampleT, elapsedSec);
  const t0 = plan.sampleT[i]!;
  const t1 = plan.sampleT[i + 1]!;
  const f = t1 === t0 ? 0 : (elapsedSec - t0) / (t1 - t0);
  const km = plan.sampleKm[i]! + (plan.sampleKm[i + 1]! - plan.sampleKm[i]!) * f;
  const speed = plan.sampleV[i]! + (plan.sampleV[i + 1]! - plan.sampleV[i]!) * f;

  const p = lowerBound(plan.pathKm, km);
  const km0 = plan.pathKm[p]!;
  const km1 = plan.pathKm[p + 1]!;
  const g = km1 === km0 ? 0 : (km - km0) / (km1 - km0);
  const lat0 = plan.path[2 * p]!;
  const lon0 = plan.path[2 * p + 1]!;
  const lat1 = plan.path[2 * (p + 1)]!;
  const lon1 = plan.path[2 * (p + 1) + 1]!;
  const down = bearing(lat0, lon0, lat1, lon1);

  const nextStop =
    plan.stops.find((s) => !s.passing && s.arriveSec !== null && s.arriveSec > elapsedSec) ??
    null;
  const atStation =
    plan.stops.find(
      (s) =>
        !s.passing &&
        (s.arriveSec ?? -Infinity) <= elapsedSec &&
        elapsedSec <= (s.departSec ?? Infinity),
    )?.name ?? null;

  return {
    lat: lat0 + (lat1 - lat0) * g,
    lon: lon0 + (lon1 - lon0) * g,
    speed,
    heading: plan.direction === 'down' ? down : (down + 180) % 360,
    km,
    elapsedSec,
    finished: raw >= plan.totalSec,
    waiting: raw < 0,
    atStation,
    nextStop,
  };
}

