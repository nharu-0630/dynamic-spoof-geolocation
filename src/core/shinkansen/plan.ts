import type { SpoofSettings } from '@/core/settings';
import { PATH, PATH_KM } from './route';
import type { PlanStop, RunPlan } from './run-plan';
import { profileLeg, solveAlpha } from './running';
import { findTrain, type Train } from './timetable';

export type { PlanStop, RunPlan, TrainState } from './run-plan';
export { evaluatePlan } from './run-plan';

export interface BuildPlanOptions {
  /** Wall-clock time the run starts from. */
  departEpochMs: number;
  timeScale?: number;
}

export function buildRunPlan(train: Train, options: BuildPlanOptions): RunPlan {
  const calls = train.stops.filter((s) => !s.passing);
  const times: number[] = [0];
  const kms: number[] = [calls[0]!.km];
  const speeds: number[] = [0];

  for (let i = 0; i < calls.length - 1; i++) {
    const from = calls[i]!;
    const to = calls[i + 1]!;
    const legStart = from.departSec! - train.departSec;
    const legSec = to.arriveSec! - from.departSec!;

    const { alpha, surplusSec } = solveAlpha([[from.km, to.km]], legSec);
    const profile = profileLeg(from.km, to.km, alpha);
    const scale =
      profile.durationSec > 0 ? (legSec - surplusSec) / profile.durationSec : 1;
    const sign = Math.sign(to.km - from.km) || 1;

    for (let k = 1; k < profile.sampleT.length; k++) {
      times.push(legStart + profile.sampleT[k]! * scale);
      kms.push(from.km + (sign * profile.sampleS[k]!) / 1000);
      speeds.push(profile.sampleV[k]! / scale);
    }
    // Waiting at the platform: early arrival (a こだま being overtaken) plus the
    // booked dwell both show up as a flat stretch at the station's distance.
    if (to.departSec !== null) {
      times.push(to.departSec - train.departSec);
      kms.push(to.km);
      speeds.push(0);
    }
  }

  return {
    trainId: train.id,
    label: train.label,
    direction: train.direction,
    originName: train.originName,
    destName: train.destName,
    through: train.through,
    departEpochMs: options.departEpochMs,
    totalSec: train.arriveSec - train.departSec,
    timeScale: options.timeScale ?? 1,
    stops: train.stops.map((s) => ({
      name: s.station.name,
      nameEn: s.station.nameEn,
      km: s.km,
      arriveSec: s.arriveSec === null ? null : s.arriveSec - train.departSec,
      departSec: s.departSec === null ? null : s.departSec - train.departSec,
      passing: s.passing,
    })),
    sampleT: Float64Array.from(times),
    sampleKm: Float64Array.from(kms),
    sampleV: Float64Array.from(speeds),
    path: PATH,
    pathKm: PATH_KM,
  };
}

const startOfLocalDay = (epochMs: number) => {
  const day = new Date(epochMs);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
};

/**
 * Builds the plan a set of settings describes, or null when the mode is not
 * `shinkansen` or no train is selected.
 */
export function planFromSettings(settings: SpoofSettings): RunPlan | null {
  if (settings.mode !== 'shinkansen' || !settings.trainId) return null;
  const train = findTrain(settings.trainId);
  if (!train) return null;
  // Before the settings are applied the anchor is unset; preview against now.
  const anchor = settings.appliedAtMs || Date.now();
  const departEpochMs =
    settings.startMode === 'now'
      ? anchor
      : startOfLocalDay(anchor) + train.departSec * 1000;
  return buildRunPlan(train, { departEpochMs, timeScale: settings.timeScale });
}
