import { defineContentScript } from 'wxt/utils/define-content-script';
import { isPageMessage, PAGE_CHANNEL } from '@/core/messages';
import { resolvePosition } from '@/core/position';
import type { RunPlan } from '@/core/shinkansen/plan';
import type { SpoofSettings } from '@/core/settings';

/**
 * Runs in the page's own JavaScript world, so `navigator.geolocation` is the
 * object the page itself sees. It is installed at document_start before any
 * page script runs; the bridge in the isolated world tells it, a moment later,
 * whether this tab is being spoofed.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  world: 'MAIN',
  main: () => installSpoof(),
});

/** How long a geolocation call waits for the bridge before falling through. */
const HANDSHAKE_TIMEOUT_MS = 1500;
/** Interval `watchPosition` reports at, matching a typical GPS fix rate. */
const WATCH_INTERVAL_MS = 1000;

function installSpoof() {
  const original = navigator.geolocation;
  let settings: SpoofSettings | null = null;
  let plan: RunPlan | null = null;
  let ready = false;
  const waiting: (() => void)[] = [];

  /**
   * Live `watchPosition` registrations. Pages typically start a watch once, on
   * load, so a watch has to be able to move between the real API and the
   * spoofed one whenever the tab's settings change — otherwise turning spoofing
   * on would only take effect after a reload.
   */
  interface Watch {
    success: PositionCallback;
    error: PositionErrorCallback | null | undefined;
    options: PositionOptions | undefined;
    /** Set while the watch is delegated to the real API. */
    realId?: number;
    /** Set while the watch is being fed spoofed fixes. */
    timer?: ReturnType<typeof setInterval>;
  }
  const watches = new Map<number, Watch>();
  let nextWatchId = 1;

  const flush = () => {
    ready = true;
    while (waiting.length) waiting.shift()!();
  };

  /** Resolves once the bridge has reported this tab's state, or times out. */
  const whenReady = () =>
    new Promise<void>((resolve) => {
      if (ready) return resolve();
      const timer = setTimeout(() => {
        flush();
        resolve();
      }, HANDSHAKE_TIMEOUT_MS);
      waiting.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });

  const active = () => (settings?.enabled ? settings : null);

  const makePosition = (): GeolocationPosition => {
    const fix = resolvePosition(settings!, plan, Date.now());
    const coords = {
      latitude: fix.lat,
      longitude: fix.lon,
      accuracy: fix.accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: fix.heading,
      speed: fix.speed,
      toJSON() {
        const { toJSON, ...rest } = this;
        return rest;
      },
    };
    const timestamp = Date.now();
    return {
      coords,
      timestamp,
      toJSON: () => ({ coords: coords.toJSON(), timestamp }),
    } as unknown as GeolocationPosition;
  };

  const failure = (cause: unknown): GeolocationPositionError =>
    ({
      code: 2,
      message: `dynamic-spoof-geolocation: ${String(cause)}`,
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    }) as GeolocationPositionError;

  const feedSpoofed = (watch: Watch) => {
    if (watch.realId !== undefined) {
      original.clearWatch(watch.realId);
      watch.realId = undefined;
    }
    if (watch.timer !== undefined) return;
    const tick = () => {
      try {
        watch.success(makePosition());
      } catch (cause) {
        watch.error?.(failure(cause));
      }
    };
    tick();
    watch.timer = setInterval(tick, WATCH_INTERVAL_MS);
  };

  const feedReal = (watch: Watch) => {
    if (watch.timer !== undefined) {
      clearInterval(watch.timer);
      watch.timer = undefined;
    }
    if (watch.realId !== undefined) return;
    watch.realId = original.watchPosition(
      watch.success,
      watch.error ?? undefined,
      watch.options,
    );
  };

  /** Points every open watch at whichever source is currently in charge. */
  const resync = () => {
    for (const watch of watches.values()) {
      if (active()) feedSpoofed(watch);
      else feedReal(watch);
    }
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window || !isPageMessage(event.data)) return;
    if (event.data.kind === 'apply') {
      settings = event.data.settings;
      plan = event.data.plan;
    } else if (event.data.kind === 'stop') {
      settings = null;
      plan = null;
    } else {
      return;
    }
    flush();
    resync();
  });

  const spoofed: Geolocation = {
    getCurrentPosition(success, error, options) {
      void whenReady().then(() => {
        if (!active()) return original.getCurrentPosition(success, error, options);
        try {
          success(makePosition());
        } catch (cause) {
          error?.(failure(cause));
        }
      });
    },

    watchPosition(success, error, options) {
      const id = nextWatchId++;
      const watch: Watch = { success, error, options };
      watches.set(id, watch);
      void whenReady().then(() => {
        // The page may have cleared the watch while we were waiting.
        if (watches.get(id) !== watch) return;
        if (active()) feedSpoofed(watch);
        else feedReal(watch);
      });
      return id;
    },

    clearWatch(id) {
      const watch = watches.get(id);
      if (!watch) return;
      watches.delete(id);
      if (watch.timer !== undefined) clearInterval(watch.timer);
      if (watch.realId !== undefined) original.clearWatch(watch.realId);
    },
  };

  Object.defineProperty(navigator, 'geolocation', {
    value: spoofed,
    configurable: true,
    writable: true,
  });

  // Sites commonly gate the prompt behind a permission check; while a tab is
  // being spoofed, report the permission as already granted.
  const permissions = navigator.permissions;
  if (permissions?.query) {
    const query = permissions.query.bind(permissions);
    permissions.query = (async (descriptor: PermissionDescriptor) => {
      if (descriptor?.name !== 'geolocation') return query(descriptor);
      await whenReady();
      if (!active()) return query(descriptor);
      return {
        name: 'geolocation',
        state: 'granted',
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      } as unknown as PermissionStatus;
    }) as typeof permissions.query;
  }

  // The bridge may already have run; ask it to repeat itself.
  window.postMessage({ channel: PAGE_CHANNEL, kind: 'hello' }, '*');
}
