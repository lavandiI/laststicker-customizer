// Pure decisions for the automatic index refresh and the job result record.
//
// background.js owns the chrome.storage and chrome.alarms calls; the rules
// that decide *whether* to run and *what* to remember are kept here, so they
// can be tested without a service worker.

(function (global) {
  'use strict';

  const AUTO_INTERVAL_MINUTES = 360;
  const RESULT_MAX_ERRORS = 20;

  /**
   * Automatic refresh is on unless it was explicitly turned off.
   * Older builds stored '0' as a string, the popup stores a boolean.
   *
   * @param {unknown} value
   * @returns {boolean}
   */
  function isAutoEnabled(value) {
    return value !== '0' && value !== false;
  }

  /**
   * Read the scheduler report, tolerating a missing or corrupt value.
   *
   * @param {unknown} raw
   * @returns {{lastRun?: number, lastCheck?: number, lastError?: string, lastResult?: string}}
   */
  function parseAutoMeta(raw) {
    if (!raw) return {};

    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  /**
   * The alarm is needed only for a complete index with auto refresh on.
   *
   * @param {{enabled?: boolean, full?: boolean}} state
   * @returns {boolean}
   */
  function shouldSchedule(state) {
    return Boolean(state && state.enabled && state.full);
  }

  /**
   * @param {{lastRun?: number, lastCheck?: number}} meta
   * @param {number} lastIndexedAt
   * @param {number} intervalMs
   * @param {number} [now]
   * @returns {boolean} true when enough time has passed since the last attempt
   */
  function isDue(meta, lastIndexedAt, intervalMs, now = Date.now()) {
    const lastAttempt = Math.max(
      Number(meta && meta.lastRun) || 0,
      Number(meta && meta.lastCheck) || 0,
      Number(lastIndexedAt) || 0,
    );

    if (!lastAttempt) return true;
    return now - lastAttempt >= intervalMs;
  }

  /**
   * Existing users have an index but no "complete index" flag. Such an index
   * counts as complete when it has messages and a last-indexed timestamp;
   * `flag` is the value to persist in that case.
   *
   * @param {{fullIndexAt?: unknown, lastIndexedAt?: unknown, messagesRaw?: string}} state
   * @returns {{full: boolean, flag: string|null}}
   */
  function resolveFullIndexFlag(state = {}) {
    if (state.fullIndexAt) return { full: true, flag: null };
    if (!state.lastIndexedAt) return { full: false, flag: null };

    let messages;
    try {
      messages = JSON.parse(state.messagesRaw || '[]');
    } catch {
      return { full: false, flag: null };
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return { full: false, flag: null };
    }

    return { full: true, flag: String(state.lastIndexedAt) };
  }

  /**
   * Build the record the page reads through chrome.storage.onChanged.
   *
   * @param {{jobId?: string, kind?: string, source?: string, tabId?: number, postId?: string}} job
   * @param {object} result
   * @param {number} [now]
   * @returns {object}
   */
  function buildResultRecord(job, result, now = Date.now()) {
    const source = result && typeof result === 'object' ? result : {};
    const owner = job && typeof job === 'object' ? job : {};
    const errors = Array.isArray(source.errors)
      ? source.errors.slice(0, RESULT_MAX_ERRORS)
      : [];

    const record = {
      jobId: String(owner.jobId || ''),
      kind: owner.kind === 'forum' ? 'forum' : 'dialog',
      source: owner.source === 'auto' ? 'auto' : 'manual',
      tabId: typeof owner.tabId === 'number' ? owner.tabId : null,
      postId: owner.postId ? String(owner.postId) : '',
      finishedAt: now,
      result: { ...source, errors },
    };

    if (source.error) record.error = source.error;

    return record;
  }

  const api = {
    AUTO_INTERVAL_MINUTES,
    RESULT_MAX_ERRORS,
    isAutoEnabled,
    parseAutoMeta,
    shouldSchedule,
    isDue,
    resolveFullIndexFlag,
    buildResultRecord,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.LSAutoUpdate = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
