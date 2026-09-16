import type { Direction } from '@/data/tokaido-pattern';

export type SpoofMode = 'fixed' | 'moving' | 'shinkansen';

/** How a Shinkansen run lines up with the clock. */
export type StartMode =
  /** Follow the real clock: the train is wherever the timetable says it is now. */
  | 'schedule'
  /** Leave the originating station the moment the run is applied. */
  | 'now';

/** One point on a 移動 route. */
export interface Waypoint {
  lat: number;
  lng: number;
  /** Ground speed over the leg that leaves this point, in km/h. */
  speedKmh: number;
  /** Seconds to stand still here on arrival, before moving on. */
  dwellSec: number;
}

/** What happens once the last waypoint is reached. */
export type RouteEnd =
  /** Stand at the last waypoint. */
  | 'stop'
  /** Run back to the first waypoint and go round again. */
  | 'loop'
  /** Retrace the route back to the start, then forwards again. */
  | 'pingpong'
  /** Carry straight on, on a fixed heading, forever. */
  | 'bearing';

export interface SpoofSettings {
  enabled: boolean;
  mode: SpoofMode;
  /** Reported `coords.accuracy`, in metres. */
  accuracy: number;
  randomize: boolean;
  randomRangeM: number;

  /** fixed: the reported point. */
  lat: number;
  lng: number;

  /** moving: the route, in travel order. A single waypoint just drifts. */
  route: Waypoint[];
  routeEnd: RouteEnd;
  /** Heading held after the last waypoint when `routeEnd` is `'bearing'`. */
  bearingDeg: number;

  /** shinkansen. */
  direction: Direction;
  trainId: string | null;
  startMode: StartMode;
  /** Simulated seconds per real second. */
  timeScale: number;
  /** Epoch ms the run was applied; the anchor for movement and for `startMode: 'now'`. */
  appliedAtMs: number;
}

export const DEFAULT_WAYPOINT: Omit<Waypoint, 'lat' | 'lng'> = {
  speedKmh: 30,
  dwellSec: 0,
};

export const DEFAULT_SETTINGS: SpoofSettings = {
  enabled: false,
  mode: 'fixed',
  accuracy: 10,
  randomize: false,
  randomRangeM: 5,
  lat: 35.6812,
  lng: 139.7671,
  route: [{ lat: 35.6812, lng: 139.7671, ...DEFAULT_WAYPOINT }],
  routeEnd: 'bearing',
  bearingDeg: 0,
  direction: 'down',
  trainId: null,
  startMode: 'schedule',
  timeScale: 1,
  appliedAtMs: 0,
};

export const TIME_SCALES = [1, 2, 5, 10, 30, 60] as const;

export const ROUTE_END_LABELS: Record<RouteEnd, string> = {
  bearing: '方位を保って直進',
  stop: '終点で停止',
  loop: '始点に戻って繰り返し',
  pingpong: '折り返して往復',
};

export const tabStorageKey = (tabId: number) => `local:tab_${tabId}` as const;
