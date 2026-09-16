import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { storage } from 'wxt/utils/storage';
import type { PopupMessage, TabMessage } from '@/core/messages';
import { tabStorageKey, type SpoofSettings } from '@/core/settings';

type BridgeMessage = { kind: 'bridge:read' };

/**
 * Owns the per-tab spoof settings. Content scripts ask for their tab's state on
 * every page load, so a spoofed tab keeps its settings across navigations.
 */
export default defineBackground(() => {
  const readTab = (tabId: number) =>
    storage.getItem<SpoofSettings>(tabStorageKey(tabId));

  const broadcast = async (tabId: number, message: TabMessage) => {
    try {
      await browser.tabs.sendMessage(tabId, message);
    } catch {
      // No content script in that tab yet (chrome:// pages, the web store, a
      // tab that has not navigated). It will ask us when it loads.
    }
  };

  browser.runtime.onMessage.addListener(
    (message: PopupMessage | BridgeMessage, sender, sendResponse) => {
      if (message?.kind === 'bridge:read') {
        const tabId = sender.tab?.id;
        if (tabId === undefined) {
          sendResponse(null);
          return false;
        }
        void readTab(tabId).then((settings) => sendResponse(settings ?? null));
        return true;
      }

      if (message?.kind === 'read') {
        void readTab(message.tabId).then((settings) => sendResponse(settings ?? null));
        return true;
      }

      if (message?.kind === 'apply') {
        void storage
          .setItem(tabStorageKey(message.tabId), message.settings)
          .then(() => broadcast(message.tabId, { kind: 'spoof:apply', settings: message.settings }))
          .then(() => sendResponse({ ok: true }));
        return true;
      }

      if (message?.kind === 'stop') {
        void storage
          .removeItem(tabStorageKey(message.tabId))
          .then(() => broadcast(message.tabId, { kind: 'spoof:stop' }))
          .then(() => sendResponse({ ok: true }));
        return true;
      }

      return false;
    },
  );

  browser.tabs.onRemoved.addListener((tabId) => {
    void storage.removeItem(tabStorageKey(tabId));
  });
});
