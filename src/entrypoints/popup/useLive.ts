import { useEffect, useMemo, useState } from 'react';
import { resolvePosition, type ResolvedPosition } from '@/core/position';
import { planFromSettings, type RunPlan } from '@/core/shinkansen/plan';
import type { SpoofSettings } from '@/core/settings';

const TICK_MS = 250;

export interface Live {
  now: number;
  plan: RunPlan | null;
  /**
   * Where the receiver is right now. Jitter is left off: the map and the
   * read-out should show the position the simulation is actually at, not the
   * scatter that is layered on top of it for the page.
   */
  fix: ResolvedPosition;
}

/** Ticks while the position is in motion, so the popup can mirror the page. */
export function useLive(settings: SpoofSettings): Live {
  const moving = settings.mode !== 'fixed';
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!moving) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [moving]);

  const plan = useMemo(() => planFromSettings(settings), [settings]);
  const fix = useMemo(
    () => resolvePosition({ ...settings, randomize: false }, plan, moving ? now : Date.now()),
    [settings, plan, moving, now],
  );

  return { now, plan, fix };
}
