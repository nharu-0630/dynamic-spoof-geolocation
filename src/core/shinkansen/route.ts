import routeData from '@/data/tokaido-route.json';
import { bearing, haversine, lowerBound } from '@/core/geo';

export interface Station {
  /** Japanese name, e.g. 新横浜. */
  name: string;
  /** Hepburn name, e.g. Shin-Yokohama. */
  nameEn: string;
  osmNodeId: number;
  lat: number;
  lon: number;
  /** Distance from 東京 along the alignment, in km. */
  km: number;
}

export const STATIONS: readonly Station[] = routeData.stations;
export const ROUTE_SOURCE = routeData.source;
export const ROUTE_LENGTH_KM = routeData.lengthKm;

/** Flat [lat, lon, lat, lon, …] of the running alignment, 東京 → 新大阪. */
export const PATH: Float64Array = Float64Array.from(routeData.path);

/** Cumulative distance from 東京, in km, for every point in {@link PATH}. */
export const PATH_KM: Float64Array = (() => {
  const count = PATH.length / 2;
  const km = new Float64Array(count);
  for (let i = 1; i < count; i++) {
    const d = haversine(
      PATH[2 * (i - 1)]!,
      PATH[2 * (i - 1) + 1]!,
      PATH[2 * i]!,
      PATH[2 * i + 1]!,
    );
    km[i] = km[i - 1]! + d / 1000;
  }
  return km;
})();

export const stationIndex = (name: string) => STATIONS.findIndex((s) => s.name === name);

export interface PointOnRoute {
  lat: number;
  lon: number;
  /** Bearing of the track at this point, in the 下り (東京 → 新大阪) sense. */
  bearingDown: number;
}

/** Interpolates a position and track bearing at `km` from 東京. */
export function pointAtKm(km: number): PointOnRoute {
  const clamped = Math.min(Math.max(km, 0), PATH_KM[PATH_KM.length - 1]!);
  const i = lowerBound(PATH_KM, clamped);
  const km0 = PATH_KM[i]!;
  const km1 = PATH_KM[i + 1]!;
  const t = km1 === km0 ? 0 : (clamped - km0) / (km1 - km0);
  const lat0 = PATH[2 * i]!;
  const lon0 = PATH[2 * i + 1]!;
  const lat1 = PATH[2 * (i + 1)]!;
  const lon1 = PATH[2 * (i + 1) + 1]!;
  return {
    lat: lat0 + (lat1 - lat0) * t,
    lon: lon0 + (lon1 - lon0) * t,
    bearingDown: bearing(lat0, lon0, lat1, lon1),
  };
}

/**
 * Line speed limits, as [startKm, endKm, km/h].
 *
 * From 東海道新幹線 § 所要時間と最高速度 (Japanese Wikipedia, CC BY-SA 4.0):
 * 東京 - 品川 100 km/h; 品川 - 多摩川橋梁 170 km/h; 多摩川橋梁 - 武蔵小杉付近
 * 110 km/h; 武蔵小杉付近 - 新横浜 200 km/h; 新横浜 - 新大阪 285 km/h, dropping to
 * 185 km/h through 熱海 and the approaches either side of it.
 */
export const SPEED_ZONES: readonly (readonly [number, number, number])[] = [
  [0, 6.7, 100],
  [6.7, 12.4, 170],
  [12.4, 15.6, 110],
  [15.6, 25.55, 200],
  [25.55, 91.9, 285],
  [91.9, 98.9, 185],
  [98.9, ROUTE_LENGTH_KM, 285],
];

/** Line speed limit in m/s at `km` from 東京. */
export function speedLimitAtKm(km: number): number {
  for (const [from, to, kmh] of SPEED_ZONES) {
    if (km >= from && km < to) return (kmh * 1000) / 3600;
  }
  return (SPEED_ZONES[SPEED_ZONES.length - 1]![2] * 1000) / 3600;
}
