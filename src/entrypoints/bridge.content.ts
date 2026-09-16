import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { isPageMessage, PAGE_CHANNEL, type TabMessage } from '@/core/messages';
import { planFromSettings } from '@/core/shinkansen/plan';
import type { SpoofSettings } from '@/core/settings';

/**
 * Isolated-world half of the pair. It is the only part that can talk to the
 * background, and it turns a train selection into a run plan so the page-world
 * script stays small and data-free.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  main() {
    let current: SpoofSettings | null = null;

    const push = () => {
      if (!current?.enabled) {
        window.postMessage({ channel: PAGE_CHANNEL, kind: 'stop' }, '*');
        return;
      }
      window.postMessage(
        {
          channel: PAGE_CHANNEL,
          kind: 'apply',
          settings: current,
          plan: planFromSettings(current),
        },
        '*',
      );
    };

    browser.runtime.onMessage.addListener((message: TabMessage) => {
      if (message?.kind === 'spoof:apply') {
        current = message.settings;
        push();
      } else if (message?.kind === 'spoof:stop') {
        current = null;
        push();
      }
    });

    // The page-world script may load after this one; it announces itself, and
    // we repeat whatever we know.
    window.addEventListener('message', (event) => {
      if (event.source !== window || !isPageMessage(event.data)) return;
      if (event.data.kind === 'hello') push();
    });

    void browser.runtime
      .sendMessage({ kind: 'bridge:read' })
      .then((settings: SpoofSettings | null | undefined) => {
        current = settings ?? null;
        push();
      })
      .catch(() => push());
  },
});
