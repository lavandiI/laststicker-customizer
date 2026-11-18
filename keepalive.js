// Keeps the extension service worker alive while a long offscreen job runs.
//
// Manifest V3 stops the worker after ~30 seconds without events. Indexing is
// event-free between batches: a single dialog can take up to 30 s per request
// with three attempts, so a batch easily outlives the idle window. A periodic
// message from the offscreen document resets the timer and, if the worker has
// already been restarted, wakes it so the job identity is restored.

(function (global) {
  'use strict';

  const DEFAULT_INTERVAL_MS = 10000;

  /**
   * @param {{action?: string, payload?: object, intervalMs?: number}} [options]
   * @returns {{stop: () => void}}
   */
  function start(options = {}) {
    const settings = options && typeof options === 'object' ? options : {};

    if (
      typeof chrome === 'undefined' ||
      !chrome.runtime ||
      typeof chrome.runtime.sendMessage !== 'function'
    ) {
      return { stop() {} };
    }

    const intervalMs =
      Number(settings.intervalMs) > 0
        ? Number(settings.intervalMs)
        : DEFAULT_INTERVAL_MS;

    const message = {
      target: 'background',
      action: settings.action || 'indexHeartbeat',
    };
    if (settings.payload && typeof settings.payload === 'object') {
      Object.assign(message, settings.payload);
    }

    const beat = () => {
      try {
        chrome.runtime.sendMessage(message, () => {
          void chrome.runtime.lastError;
        });
      } catch {
        // The worker may be stopping; the next beat wakes it again.
      }
    };

    const timer = setInterval(beat, intervalMs);

    return {
      stop() {
        clearInterval(timer);
      },
    };
  }

  const api = { DEFAULT_INTERVAL_MS, start };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.LSKeepalive = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
