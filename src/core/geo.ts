export const EARTH_RADIUS_M = 6371008.8;

export const toRad = (deg: number) => (deg * Math.PI) / 180;
export const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const dφ = φ2 - φ1;
  const dλ = toRad(lon2 - lon1);
  const h =
    Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Initial bearing from one point to another, in degrees clockwise from north. */
export function bearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const dλ = toRad(lon2 - lon1);
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point reached by travelling `distanceM` from (lat, lon) on the given bearing. */
export function destination(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceM: number,
): [number, number] {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(lat);
  const λ1 = toRad(lon);
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );
  return [toDeg(φ2), ((toDeg(λ2) + 540) % 360) - 180];
}

/**
 * Index of the last entry in a sorted array that is <= `value`, clamped so that
 * `result + 1` is always a valid index.
 */
export function lowerBound(sorted: ArrayLike<number>, value: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  if (value <= sorted[0]!) return 0;
  if (value >= sorted[hi]!) return hi - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= value) lo = mid;
    else hi = mid;
  }
  return lo;
}
