import { bearing, destination, haversine } from './geo';
import type { RouteEnd, Waypoint } from './settings';

export interface RouteFix {
  lat: number;
  lon: number;
  /** Degrees clockwise from north, or null while standing still. */
  heading: number | null;
  /** Ground speed in m/s. */
  speed: number;
  /** Index into the travel sequence of the point last reached. */
  index: number;
  /** True once a non-repeating route has run out. */
  finished: boolean;
}

/** One stretch of the timeline: either standing at a point or running a leg. */
type Step =
  | { kind: 'wait'; at: number; seconds: number }
  | { kind: 'run'; from: number; to: number; seconds: number; distanceM: number; speed: number };

interface Timeline {
  points: Waypoint[];
  steps: Step[];
  /** Total time for one pass, in seconds. */
  totalSec: number;
  cyclic: boolean;
}

const isCyclic = (end: RouteEnd) => end === 'loop' || end === 'pingpong';

/**
 * Expands a route into the order it is actually travelled: a loop returns to its
 * first point, and a ping-pong retraces itself.
 */
function travelOrder(route: Waypoint[], end: RouteEnd): Waypoint[] {
  if (route.length < 2) return route;
  if (end === 'loop') return [...route, route[0]!];
  if (end === 'pingpong') return [...route, ...route.slice(0, -1).reverse()];
  return route;
}

function buildTimeline(route: Waypoint[], end: RouteEnd): Timeline {
  const points = travelOrder(route, end);
  const cyclic = isCyclic(end);
  const steps: Step[] = [];
  let totalSec = 0;

  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    // On a repeating route the last point is the first one coming round again,
    // so its wait belongs to the next pass, not this one.
    const skipWait = cyclic && i === points.length - 1;
    if (point.dwellSec > 0 && !skipWait) {
      steps.push({ kind: 'wait', at: i, seconds: point.dwellSec });
      totalSec += point.dwellSec;
    }
    const next = points[i + 1];
    if (!next) continue;
    const distanceM = haversine(point.lat, point.lng, next.lat, next.lng);
    const speed = Math.max(point.speedKmh, 0) / 3.6;
    const seconds = speed > 0 ? distanceM / speed : 0;
    steps.push({ kind: 'run', from: i, to: i + 1, seconds, distanceM, speed });
    totalSec += seconds;
  }

  return { points, steps, totalSec, cyclic };
}

function pointOnLeg(timeline: Timeline, step: Extract<Step, { kind: 'run' }>, t: number): RouteFix {
  const from = timeline.points[step.from]!;
  const to = timeline.points[step.to]!;
  const course = bearing(from.lat, from.lng, to.lat, to.lng);
  const travelled = step.seconds > 0 ? (t / step.seconds) * step.distanceM : 0;
  const [lat, lon] = destination(from.lat, from.lng, course, travelled);
  return {
    lat,
    lon,
    // The course of a great circle turns as you go, so report it from here.
    heading: step.distanceM > 0 ? bearing(lat, lon, to.lat, to.lng) : course,
    speed: step.speed,
    index: step.from,
    finished: false,
  };
}

const standingAt = (point: Waypoint, index: number, finished: boolean): RouteFix => ({
  lat: point.lat,
  lon: point.lng,
  heading: null,
  speed: 0,
  index,
  finished,
});

/**
 * Where a route has got to after `elapsedSec`. Everything is derived from the
 * elapsed time rather than accumulated step by step, so the answer does not
 * depend on how often it is asked.
 */
export function walkRoute(
  route: Waypoint[],
  end: RouteEnd,
  bearingDeg: number,
  elapsedSec: number,
): RouteFix | null {
  if (route.length === 0) return null;
  const timeline = buildTimeline(route, end);
  const last = timeline.points[timeline.points.length - 1]!;
  let t = Math.max(0, elapsedSec);

  if (t >= timeline.totalSec) {
    if (timeline.cyclic && timeline.totalSec > 0) {
      t %= timeline.totalSec;
    } else if (end === 'bearing') {
      // Carry on past the end of the route on a fixed heading.
      const speed = Math.max(last.speedKmh, 0) / 3.6;
      const heading = ((bearingDeg % 360) + 360) % 360;
      const [lat, lon] = destination(
        last.lat,
        last.lng,
        heading,
        speed * (t - timeline.totalSec),
      );
      return {
        lat,
        lon,
        heading: speed > 0 ? heading : null,
        speed,
        index: timeline.points.length - 1,
        finished: false,
      };
    } else {
      return standingAt(last, timeline.points.length - 1, true);
    }
  }

  for (const step of timeline.steps) {
    if (t > step.seconds) {
      t -= step.seconds;
      continue;
    }
    if (step.kind === 'wait') return standingAt(timeline.points[step.at]!, step.at, false);
    return pointOnLeg(timeline, step, t);
  }

  return standingAt(timeline.points[0]!, 0, false);
}

/** Total length of the route as travelled, in metres. */
export function routeLengthM(route: Waypoint[], end: RouteEnd): number {
  return buildTimeline(route, end).steps.reduce(
    (sum, step) => sum + (step.kind === 'run' ? step.distanceM : 0),
    0,
  );
}

/** How long one pass over the route takes, in seconds. */
export function routeDurationSec(route: Waypoint[], end: RouteEnd): number {
  return buildTimeline(route, end).totalSec;
}
