import type { Direction } from '@/data/tokaido-pattern';

export type SpoofMode = 'fixed' | 'moving' | 'shinkansen';

/** How a Shinkansen run lines up with the clock. */
export type StartMode =
  /** Follow the real clock: the train is wherever the timetable says it is now. */
  | 'schedule'
  /** Leave the originating station the moment the run is applied. */
  | 'now';

export interface SpoofSettings {
  enabled: boolean;
  mode: SpoofMode;
  /** Reported `coords.accuracy`, in metres. */
  accuracy: number;
  randomize: boolean;
  randomRangeM: number;

  /** fixed / moving: the point the run starts from. */
  lat: number;
  lng: number;

  /** moving: constant-bearing drift. */
  bearingDeg: number;
  speedKmh: number;

  /** shinkansen. */
  direction: Direction;
  trainId: string | null;
  startMode: StartMode;
  /** Simulated seconds per real second. */
  timeScale: number;
  /** Epoch ms the run was applied; the anchor for `startMode: 'now'`. */
  appliedAtMs: number;
}

export const DEFAULT_SETTINGS: SpoofSettings = {
  enabled: false,
  mode: 'fixed',
  accuracy: 10,
  randomize: false,
  randomRangeM: 5,
  lat: 35.6812,
  lng: 139.7671,
  bearingDeg: 0,
  speedKmh: 30,
  direction: 'down',
  trainId: null,
  startMode: 'schedule',
  timeScale: 1,
  appliedAtMs: 0,
};

export const TIME_SCALES = [1, 2, 5, 10, 30, 60] as const;

export const tabStorageKey = (tabId: number) => `local:tab_${tabId}` as const;
