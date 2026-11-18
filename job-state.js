// Persisted identity of the indexing job that is currently running.
//
// A Manifest V3 service worker can be stopped at any moment, so the job cannot
// live in memory alone: when the worker wakes up it has to know that a job is
// still going on in the offscreen document, otherwise progress and the finish
// message would be dropped as "unknown job".
//
// The module is deliberately free of chrome API calls: the caller passes the
// storage area, which keeps it testable outside the service worker.

(function (global) {
  'use strict';

  const JOB_KEY = 'ls_search_active_job';

  // A dialog index of a large archive takes minutes, not hours. A record older
  // than this is treated as a leftover from a crashed worker.
  const JOB_TTL_MS = 30 * 60 * 1000;

  /**
   * @param {object|null} record
   * @param {number} [now]
   * @returns {boolean} true when the record cannot describe a running job.
   */
  function isStale(record, now = Date.now()) {
    if (!record || !record.jobId) return true;

    const startedAt = Number(record.startedAt);
    if (!Number.isFinite(startedAt) || startedAt <= 0) return true;

    return now - startedAt > JOB_TTL_MS;
  }

  /**
   * @param {{jobId: string, source?: string, tabId?: number, kind?: string, postId?: string, mode?: string}} job
   * @param {number} [now]
   * @returns {{jobId: string, kind: string, source: string, tabId: number|null, postId: string, mode: string, startedAt: number}}
   */
  function toRecord(job, now = Date.now()) {
    const source = job && typeof job === 'object' ? job : {};

    return {
      jobId: String(source.jobId || ''),
      kind: source.kind === 'forum' ? 'forum' : 'dialog',
      source: source.source === 'auto' ? 'auto' : 'manual',
      tabId: typeof source.tabId === 'number' ? source.tabId : null,
      postId: source.postId ? String(source.postId) : '',
      mode: source.mode ? String(source.mode) : '',
      startedAt: now,
    };
  }

  /**
   * @param {object} storage chrome.storage-like area with get()
   * @returns {Promise<object|null>}
   */
  async function read(storage) {
    if (!storage || typeof storage.get !== 'function') return null;

    try {
      const data = await storage.get(JOB_KEY);
      const record = data && data[JOB_KEY];
      return record && typeof record === 'object' ? record : null;
    } catch {
      return null;
    }
  }

  /**
   * @param {object} storage chrome.storage-like area with set()
   * @param {object} job
   * @param {number} [now]
   * @returns {Promise<object|null>} the stored record, or null when the write failed
   */
  async function write(storage, job, now = Date.now()) {
    if (!storage || typeof storage.set !== 'function') return null;

    const record = toRecord(job, now);

    try {
      await storage.set({ [JOB_KEY]: record });
      return record;
    } catch {
      // Best effort: the in-memory job keeps working without the record.
      return null;
    }
  }

  /**
   * @param {object} storage chrome.storage-like area with remove()
   * @returns {Promise<void>}
   */
  async function clear(storage) {
    if (!storage || typeof storage.remove !== 'function') return;

    try {
      await storage.remove(JOB_KEY);
    } catch {
      // Best effort.
    }
  }

  const api = { JOB_KEY, JOB_TTL_MS, isStale, toRecord, read, write, clear };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.LSJobState = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
