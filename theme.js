// LastSticker Search - applies the selected theme before the page is painted.

(function () {
  'use strict';

  const core = globalThis.LSTheme;
  const store = globalThis.LSThemeStore;
  if (!core || !store) return;

  const MASTER_KEY = 'isEnabled';
  const MASTER_CACHE_KEY = 'ls_search_master_enabled';

  let currentTheme = core.normalizeTheme(null);
  let masterEnabled = readMasterCache();
  let started = false;
  // Every storage change bumps this; a `get` snapshot that resolves later than
  // a change must not overwrite the newer value.
  let stateRevision = 0;

  function readMasterCache() {
    try {
      return localStorage.getItem(MASTER_CACHE_KEY) !== '0';
    } catch {
      return true;
    }
  }

  function writeMasterCache(enabled) {
    try {
      localStorage.setItem(MASTER_CACHE_KEY, enabled ? '1' : '0');
    } catch {
      // The cache is an optimization; storage is the source of truth.
    }
  }

  function apply(theme, enabled, options) {
    const settings = options || {};
    const normalized = core.normalizeTheme(theme);
    const resolved = enabled ? core.resolveTheme(normalized) : 'light';
    const root = document.documentElement;

    if (!root) return;

    root.dataset.lsTheme = resolved;
    root.dataset.lsPalette = normalized.palette;
    root.dataset.lsImages = normalized.images;

    // There is no panel-only mode. The constant scope attribute is kept
    // because theme.css uses it to raise specificity over the site styles.
    root.dataset.lsScope = 'site';

    currentTheme = normalized;
    masterEnabled = enabled !== false;
    writeMasterCache(masterEnabled);

    // Write the cache even when the extension is off: the next page load reads
    // it synchronously, and a stale "dark" record would paint the page dark
    // before the async storage check switches it back to light.
    if (settings.cache !== false) {
      store.writeThemeCache(normalized, resolved);
    }
  }

  function applyWhenReady(theme, enabled, options) {
    if (document.documentElement) {
      apply(theme, enabled, options);
      return;
    }

    document.addEventListener('readystatechange', function onReady() {
      if (!document.documentElement) return;
      document.removeEventListener('readystatechange', onReady);
      apply(theme, enabled, options);
    });
  }

  async function loadState() {
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.local
    ) {
      try {
        const data = await chrome.storage.local.get([
          core.THEME_KEY,
          MASTER_KEY,
        ]);
        return {
          theme: core.normalizeTheme(data[core.THEME_KEY]),
          enabled: data[MASTER_KEY] !== false,
        };
      } catch {
        // Fall through to the theme store fallback.
      }
    }

    return {
      theme: await store.loadTheme(),
      enabled: true,
    };
  }

  function start() {
    if (started) return;
    started = true;

    // Synchronous cache: prevents a white flash on repeat visits.
    const cached = store.readThemeCache();
    if (cached) {
      applyWhenReady(cached.theme, masterEnabled, { cache: false });
    } else if (!masterEnabled) {
      applyWhenReady(core.DEFAULT_THEME, false, { cache: false });
    }

    // chrome.storage.local is the source of truth. The snapshot is only
    // applied when no change arrived while it was in flight.
    const snapshotRevision = stateRevision;
    loadState()
      .then(function (state) {
        if (stateRevision !== snapshotRevision) return;
        applyWhenReady(state.theme, state.enabled);
      })
      .catch(function () {});

    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.onChanged
    ) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;

        let changed = false;

        if (changes[core.THEME_KEY]) {
          currentTheme = core.normalizeTheme(
            changes[core.THEME_KEY].newValue,
          );
          changed = true;
        }

        if (changes[MASTER_KEY]) {
          masterEnabled = changes[MASTER_KEY].newValue !== false;
          changed = true;
        }

        if (changed) {
          stateRevision += 1;
          applyWhenReady(currentTheme, masterEnabled);
        }
      });
    } else {
      store.onThemeChanged(function (theme) {
        applyWhenReady(theme, masterEnabled);
      });
    }
  }

  start();
})();
