// LastSticker Search - local theme storage.
// chrome.storage.local is the source of truth; the page localStorage holds
// a tiny synchronous cache so theme.js can paint before the first frame.

(function (root) {
  'use strict';

  const core = root.LSTheme || (typeof require === 'function' ? require('./theme-core.js') : null);

  if (!core) return;

  function getChromeStorage() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return null;
    }
    return chrome.storage.local;
  }

  /**
   * Read the stored theme and let storage errors propagate.
   *
   * `saveTheme` uses this reader: a failed read must not turn a partial update
   * into "reset everything to the defaults", so the error has to reach the
   * caller instead of being replaced with `normalizeTheme(null)`.
   *
   * @returns {Promise<object>}
   */
  async function readStoredTheme() {
    const storage = getChromeStorage();

    if (storage) {
      const data = await storage.get(core.THEME_KEY);
      return core.normalizeTheme(data && data[core.THEME_KEY]);
    }

    if (typeof localStorage === 'undefined') {
      return core.normalizeTheme(null);
    }

    const raw = localStorage.getItem(core.THEME_KEY);
    if (!raw) return core.normalizeTheme(null);

    try {
      return core.normalizeTheme(JSON.parse(raw));
    } catch {
      // A corrupt value is not a storage failure: there is nothing to preserve.
      return core.normalizeTheme(null);
    }
  }

  async function loadTheme() {
    try {
      return await readStoredTheme();
    } catch {
      return core.normalizeTheme(null);
    }
  }

  /**
   * Save a partial theme update.
   *
   * @param {object} partial
   * @param {object} [base] Known current theme (the popup keeps one in memory).
   *   When it is passed, storage is not read again and a read failure cannot
   *   silently replace the user's settings with the defaults.
   * @returns {Promise<object>} The saved theme.
   */
  async function saveTheme(partial, base) {
    const current = base ? core.normalizeTheme(base) : await readStoredTheme();
    const next = core.normalizeTheme({ ...current, ...(partial || {}) });
    const storage = getChromeStorage();

    if (storage) {
      await storage.set({ [core.THEME_KEY]: next });
    } else {
      try {
        localStorage.setItem(core.THEME_KEY, JSON.stringify(next));
      } catch {
        // Storage can be unavailable in private mode; the in-memory value is
        // still returned so the current page can apply it.
      }
    }

    return next;
  }

  function onThemeChanged(callback) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) {
      return function unsubscribe() {};
    }

    const listener = (changes, area) => {
      if (area !== 'local' || !changes[core.THEME_KEY]) return;
      callback(core.normalizeTheme(changes[core.THEME_KEY].newValue));
    };

    chrome.storage.onChanged.addListener(listener);

    return function unsubscribe() {
      chrome.storage.onChanged.removeListener(listener);
    };
  }

  function readThemeCache() {
    try {
      const raw = localStorage.getItem(core.THEME_CACHE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;

      // Accept both the current shape and a bare theme object.
      const theme = core.normalizeTheme(parsed.theme || parsed);
      const resolved =
        parsed.resolved === 'dark' || parsed.resolved === 'light' ? parsed.resolved : null;

      if (!resolved) return null;
      return { theme, resolved };
    } catch {
      return null;
    }
  }

  function writeThemeCache(theme, resolved) {
    if (resolved !== 'dark' && resolved !== 'light') return;

    try {
      localStorage.setItem(
        core.THEME_CACHE_KEY,
        JSON.stringify({
          version: core.THEME_VERSION,
          theme: core.normalizeTheme(theme),
          resolved,
          savedAt: Date.now(),
        }),
      );
    } catch {
      // The cache is an optimization; ignore quota and private-mode errors.
    }
  }

  const api = {
    loadTheme,
    saveTheme,
    onThemeChanged,
    readThemeCache,
    writeThemeCache,
  };

  root.LSThemeStore = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
