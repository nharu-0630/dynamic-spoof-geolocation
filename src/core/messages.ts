import type { RunPlan } from './shinkansen/run-plan';
import type { SpoofSettings } from './settings';

/** popup → background */
export type PopupMessage =
  | { kind: 'apply'; tabId: number; settings: SpoofSettings }
  | { kind: 'stop'; tabId: number }
  | { kind: 'read'; tabId: number };

/** background → bridge content script */
export type TabMessage =
  | { kind: 'spoof:apply'; settings: SpoofSettings }
  | { kind: 'spoof:stop' };

/** bridge ↔ MAIN world, over window.postMessage */
export const PAGE_CHANNEL = 'dynamic-spoof-geolocation';

export type PageMessage =
  | {
      channel: typeof PAGE_CHANNEL;
      kind: 'apply';
      settings: SpoofSettings;
      /** Present only in shinkansen mode. */
      plan: RunPlan | null;
    }
  | { channel: typeof PAGE_CHANNEL; kind: 'stop' }
  /** Sent by the MAIN-world script once it is listening. */
  | { channel: typeof PAGE_CHANNEL; kind: 'hello' };

export const isPageMessage = (data: unknown): data is PageMessage =>
  typeof data === 'object' &&
  data !== null &&
  (data as { channel?: unknown }).channel === PAGE_CHANNEL;
