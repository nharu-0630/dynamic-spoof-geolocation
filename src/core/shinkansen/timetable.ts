import {
  DOWN_PATTERN,
  NUMBER_BLOCKS,
  SEASONAL_WINDOW,
  SERVICE_WINDOW,
  UP_PATTERN,
  type Direction,
  type PatternSlot,
  type TrainType,
} from '@/data/tokaido-pattern';
import { STATIONS, type Station } from './route';
import { profileLeg, solveAlpha } from './running';

export type { Direction, TrainType };

export interface TrainStop {
  station: Station;
  /** Index into {@link STATIONS}, i.e. always in 下り order. */
  stationIndex: number;
  km: number;
  /** Seconds since midnight; null at the originating station. */
  arriveSec: number | null;
  /** Seconds since midnight; null at the terminating station. */
  departSec: number | null;
  /** True when the train runs through without calling. */
  passing: boolean;
}

export interface Train {
  id: string;
  type: TrainType;
  number: number;
  /** e.g. のぞみ235号. */
  label: string;
  direction: Direction;
  /** A 臨時列車 (`◆` in the published pattern). */
  seasonal: boolean;
  /** Where the train continues to on the 山陽新幹線, or comes from. */
  through?: string;
  originName: string;
  destName: string;
  departSec: number;
  arriveSec: number;
  /** Every station the train passes through, in travel order. */
  stops: TrainStop[];
  /** Padding factor the running model settled on; 1 means flat out. */
  alpha: number;
}

/** Stations the fast trains run through, where a こだま waits to be overtaken. */
const OVERTAKEN_AT = new Set([
  '小田原',
  '熱海',
  '三島',
  '新富士',
  '掛川',
  '豊橋',
  '三河安城',
  '岐阜羽島',
  '米原',
]);

/** Extra journey time, in seconds, for each 「▲」 station the train calls at. */
const OPTIONAL_STOP_COST_SEC = 180;

function baseDwellSec(type: TrainType, stationName: string): number {
  if (stationName === '名古屋' || stationName === '京都') return 90;
  return type === 'こだま' ? 60 : 70;
}

/**
 * Whether a 「▲」 station is called at. The published pattern only says "0–2 of
 * these", so pick deterministically: the same train on the same day always makes
 * the same decision.
 */
const callsAtOptional = (hour: number, ordinal: number) => (hour + ordinal) % 2 === 0;

function travelOrder(direction: Direction): number[] {
  const order = STATIONS.map((_, i) => i);
  return direction === 'down' ? order : order.reverse();
}

function numberBlock(type: TrainType, through: string | undefined): keyof typeof NUMBER_BLOCKS {
  if (type === 'こだま') return 'こだま';
  const beyondOsaka = through !== undefined && through !== '新大阪' && through !== '名古屋';
  if (type === 'のぞみ') return beyondOsaka ? 'のぞみ/山陽' : 'のぞみ/東海道';
  return beyondOsaka ? 'ひかり/山陽' : 'ひかり/東海道';
}

function buildTrain(
  slot: PatternSlot,
  direction: Direction,
  hour: number,
  number: number,
): Train | null {
  const order = travelOrder(direction);
  const marks = [...slot.stops];
  if (marks.length !== order.length) throw new Error(`bad stop pattern: ${slot.stops}`);

  let optionalOrdinal = 0;
  let optionalStopsTaken = 0;
  const served: { stationIndex: number; stopping: boolean }[] = [];
  for (let i = 0; i < order.length; i++) {
    const mark = marks[i]!;
    if (mark === '-') continue;
    let stopping = mark === '●';
    if (mark === '▲') {
      stopping = callsAtOptional(hour, optionalOrdinal++);
      if (stopping) optionalStopsTaken++;
    }
    served.push({ stationIndex: order[i]!, stopping });
  }
  if (served.length < 2) return null;
  served[0]!.stopping = true;
  served[served.length - 1]!.stopping = true;

  const departSec = hour * 3600 + slot.departMinute * 60;
  const totalSec = slot.runMinutes * 60 + optionalStopsTaken * OPTIONAL_STOP_COST_SEC;

  const stopSeq = served.filter((s) => s.stopping);
  const legs = stopSeq.slice(0, -1).map((s, i) => {
    const next = stopSeq[i + 1]!;
    return [STATIONS[s.stationIndex]!.km, STATIONS[next.stationIndex]!.km] as const;
  });

  const dwells = stopSeq
    .slice(1, -1)
    .map((s) => baseDwellSec(slot.type, STATIONS[s.stationIndex]!.name));
  const dwellTotal = dwells.reduce((a, b) => a + b, 0);

  const { alpha, surplusSec } = solveAlpha(legs, totalSec - dwellTotal);
  // A train with time to spare waits at a station rather than crawling the whole
  // way. Put those waits where a こだま is actually overtaken: the stations the
  // fast trains run through.
  const waitAt = stopSeq
    .slice(1, -1)
    .map((s, i) => (OVERTAKEN_AT.has(STATIONS[s.stationIndex]!.name) ? i : -1))
    .filter((i) => i >= 0);
  const spread = waitAt.length > 0 ? waitAt : dwells.map((_, i) => i);
  const extraDwell = new Array(dwells.length).fill(0) as number[];
  for (const i of spread) extraDwell[i] = surplusSec / spread.length;

  const profiles = legs.map(([from, to]) => profileLeg(from, to, alpha));
  const runTotal = profiles.reduce((sum, p) => sum + p.durationSec, 0);
  const scale = runTotal > 0 ? (totalSec - dwellTotal - surplusSec) / runTotal : 1;

  const timeAt = new Map<number, { arrive: number | null; depart: number | null }>();
  let clock = departSec;
  timeAt.set(stopSeq[0]!.stationIndex, { arrive: null, depart: departSec });
  for (let i = 0; i < profiles.length; i++) {
    clock += profiles[i]!.durationSec * scale;
    const arrive = clock;
    const isLast = i === profiles.length - 1;
    if (isLast) {
      timeAt.set(stopSeq[i + 1]!.stationIndex, { arrive: departSec + totalSec, depart: null });
    } else {
      clock += dwells[i]! + extraDwell[i]!;
      timeAt.set(stopSeq[i + 1]!.stationIndex, { arrive, depart: clock });
    }
  }

  // Pass times come from where the train is on the leg it is running.
  let cursor = 0;
  for (const entry of served) {
    if (entry.stopping) {
      if (entry.stationIndex === stopSeq[cursor + 1]?.stationIndex) cursor++;
      continue;
    }
    const legStart = timeAt.get(stopSeq[cursor]!.stationIndex)!.depart!;
    const profile = profiles[cursor]!;
    const from = STATIONS[stopSeq[cursor]!.stationIndex]!.km;
    const travelled = Math.abs(STATIONS[entry.stationIndex]!.km - from) * 1000;
    let k = 0;
    while (k < profile.sampleS.length - 1 && profile.sampleS[k + 1]! < travelled) k++;
    const span = profile.sampleS[k + 1]! - profile.sampleS[k]!;
    const t =
      profile.sampleT[k]! +
      (span > 0 ? ((travelled - profile.sampleS[k]!) / span) * (profile.sampleT[k + 1]! - profile.sampleT[k]!) : 0);
    timeAt.set(entry.stationIndex, { arrive: legStart + t * scale, depart: null });
  }

  const round = (sec: number | null) => (sec === null ? null : Math.round(sec / 60) * 60);
  const stops: TrainStop[] = served.map(({ stationIndex, stopping }) => {
    const times = timeAt.get(stationIndex)!;
    const station = STATIONS[stationIndex]!;
    return {
      station,
      stationIndex,
      km: station.km,
      arriveSec: round(times.arrive),
      departSec: stopping ? round(times.depart) : round(times.arrive),
      passing: !stopping,
    };
  });
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  first.arriveSec = null;
  first.departSec = departSec;
  last.arriveSec = departSec + totalSec;
  last.departSec = null;

  const id = `${direction}-${slot.type}-${String(departSec).padStart(5, '0')}`;
  return {
    id,
    type: slot.type,
    number,
    label: `${slot.type}${number}号`,
    direction,
    seasonal: slot.seasonal ?? false,
    through: slot.through,
    originName: first.station.name,
    destName: last.station.name,
    departSec,
    arriveSec: departSec + totalSec,
    stops,
    alpha,
  };
}

/** Every train in one direction for a service day, in departure order. */
export function generateTimetable(direction: Direction): Train[] {
  const pattern = direction === 'down' ? DOWN_PATTERN : UP_PATTERN;
  const draft: { slot: PatternSlot; hour: number; departSec: number }[] = [];

  for (let hour = 5; hour <= 22; hour++) {
    for (const slot of pattern) {
      const minuteOfDay = hour * 60 + slot.departMinute;
      if (minuteOfDay < SERVICE_WINDOW.firstMinute) continue;
      if (minuteOfDay > SERVICE_WINDOW.lastMinute) continue;
      if (
        slot.seasonal &&
        (minuteOfDay < SEASONAL_WINDOW.firstMinute || minuteOfDay > SEASONAL_WINDOW.lastMinute)
      ) {
        continue;
      }
      draft.push({ slot, hour, departSec: minuteOfDay * 60 });
    }
  }
  draft.sort((a, b) => a.departSec - b.departSec);

  const counters = new Map<string, number>();
  const trains: Train[] = [];
  for (const { slot, hour } of draft) {
    const train = buildTrain(slot, direction, hour, 0);
    // The line closes for maintenance overnight, so nothing is still running
    // after midnight.
    if (!train || train.arriveSec > 24 * 3600) continue;
    const block = numberBlock(slot.type, slot.through);
    const next = counters.get(block) ?? NUMBER_BLOCKS[block];
    counters.set(block, next + 2);
    train.number = direction === 'down' ? next : next + 1;
    train.label = `${train.type}${train.number}号`;
    trains.push(train);
  }
  return trains;
}

let cache: Partial<Record<Direction, Train[]>> = {};

export function getTimetable(direction: Direction): Train[] {
  return (cache[direction] ??= generateTimetable(direction));
}

export function findTrain(id: string): Train | undefined {
  for (const direction of ['down', 'up'] as const) {
    const hit = getTimetable(direction).find((t) => t.id === id);
    if (hit) return hit;
  }
  return undefined;
}

export const formatClock = (sec: number) => {
  const total = Math.floor(sec / 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
};
