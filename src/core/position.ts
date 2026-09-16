import { destination } from './geo';
import { walkRoute, type RouteFix } from './route-walk';
import { evaluatePlan, type RunPlan, type TrainState } from './shinkansen/run-plan';
import type { SpoofSettings } from './settings';

export interface ResolvedPosition {
  lat: number;
  lon: number;
  accuracy: number;
  /** Degrees clockwise from north, or null when the receiver is not moving. */
  heading: number | null;
  /** Ground speed in m/s, or null when the receiver is not moving. */
  speed: number | null;
  /** Only in moving mode. */
  route?: RouteFix;
  /** Only in shinkansen mode. */
  train?: TrainState;
}

/** Scatters a point inside a circle of `rangeM`, uniformly by area. */
function jitter(lat: number, lon: number, rangeM: number): [number, number] {
  const angle = Math.random() * 360;
  const radius = rangeM * Math.sqrt(Math.random());
  return destination(lat, lon, angle, radius);
}

/**
 * Where the spoofed receiver is at `nowMs`. Everything is derived from the
 * clock rather than accumulated per call, so a page that polls once a second
 * and one that polls fifty times a second see the same track.
 */
export function resolvePosition(
  settings: SpoofSettings,
  plan: RunPlan | null,
  nowMs: number,
): ResolvedPosition {
  let lat = settings.lat;
  let lon = settings.lng;
  let heading: number | null = null;
  let speed: number | null = null;
  let route: RouteFix | undefined;
  let train: TrainState | undefined;

  if (settings.mode === 'moving') {
    // Before the settings are applied the anchor is unset; hold the start point.
    const anchor = settings.appliedAtMs || nowMs;
    const elapsedSec = Math.max(0, (nowMs - anchor) / 1000);
    const fix = walkRoute(settings.route, settings.routeEnd, settings.bearingDeg, elapsedSec);
    if (fix) {
      route = fix;
      lat = fix.lat;
      lon = fix.lon;
      heading = fix.heading;
      speed = fix.speed;
    }
  } else if (settings.mode === 'shinkansen' && plan) {
    train = evaluatePlan(plan, nowMs);
    lat = train.lat;
    lon = train.lon;
    speed = train.speed;
    heading = train.speed > 0.5 ? train.heading : null;
  }

  if (settings.randomize && settings.randomRangeM > 0) {
    [lat, lon] = jitter(lat, lon, settings.randomRangeM);
  }

  return { lat, lon, accuracy: settings.accuracy, heading, speed, route, train };
}
