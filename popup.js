// LastSticker Search - popup settings controller.

(function (root) {
  'use strict';

  const core =
    root.LSTheme ||
    (typeof require === 'function' ? require('./theme-core.js') : null);
  const store =
    root.LSThemeStore ||
    (typeof require === 'function' ? require('./theme-store.js') : null);

  if (!core || !store) return;

  const MASTER_KEY = 'isEnabled';
  const SCROLL_KEY = 'ls_scroll_enabled';

  let current = core.normalizeTheme(null);
  let masterEnabled = true;
  let scrollEnabled = true;
  let saveTimer = null;
  let saveQueue = Promise.resolve();

  function byId(doc, id) {
    return doc.getElementById(id);
  }

  function chromeStorage() {
    if (
      typeof chrome === 'undefined' ||
      !chrome.storage ||
      !chrome.storage.local
    ) {
      return null;
    }
    return chrome.storage.local;
  }

  async function loadMasterEnabled() {
    const storage = chromeStorage();
    if (!storage) return true;

    try {
      const data = await storage.get(MASTER_KEY);
      return data[MASTER_KEY] !== false;
    } catch {
      return true;
    }
  }

  async function saveMasterEnabled(enabled) {
    const storage = chromeStorage();
    if (!storage) return;

    await storage.set({ [MASTER_KEY]: enabled });
  }

  async function loadScrollEnabled() {
    const storage = chromeStorage();
    if (!storage) return true;

    try {
      const data = await storage.get(SCROLL_KEY);
      return data[SCROLL_KEY] !== false;
    } catch {
      return true;
    }
  }

  async function saveScrollEnabled(enabled) {
    const storage = chromeStorage();
    if (!storage) return;

    await storage.set({ [SCROLL_KEY]: enabled });
  }

  function onMasterChanged(callback) {
    if (
      typeof chrome === 'undefined' ||
      !chrome.storage ||
      !chrome.storage.onChanged
    ) {
      return function unsubscribe() {};
    }

    const listener = (changes, area) => {
      if (area !== 'local' || !changes[MASTER_KEY]) return;
      callback(changes[MASTER_KEY].newValue !== false);
    };

    chrome.storage.onChanged.addListener(listener);

    return function unsubscribe() {
      chrome.storage.onChanged.removeListener(listener);
    };
  }

  function setChecked(doc, name, value) {
    const input = doc.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  }

  function syncThemeControls(doc, enabled) {
    const themeSettings = byId(doc, 'themeSettings');
    if (themeSettings) {
      themeSettings.classList.toggle('is-disabled', !enabled);
      themeSettings.setAttribute('aria-disabled', enabled ? 'false' : 'true');
      themeSettings
        .querySelectorAll('input, select, button')
        .forEach((control) => {
          control.disabled = !enabled;
        });
    }

    const note = byId(doc, 'disabledNote');
    if (note) note.hidden = enabled;

    const reset = byId(doc, 'resetBtn');
    if (reset) reset.disabled = !enabled;
  }

  function syncScrollControls(doc, enabled) {
    const toggle = byId(doc, 'scrollEnabled');
    if (toggle) toggle.disabled = !enabled;
  }

  function render(doc, theme, enabled, scroll) {
    current = core.normalizeTheme(theme);
    masterEnabled = enabled !== false;
    scrollEnabled = scroll !== false;

    const masterToggle = byId(doc, 'extensionEnabled');
    if (masterToggle) masterToggle.checked = masterEnabled;

    const masterState = byId(doc, 'masterState');
    if (masterState) {
      masterState.textContent = masterEnabled ? 'Включено' : 'Выключено';
      masterState.classList.toggle('is-on', masterEnabled);
    }

    const masterCard = byId(doc, 'masterCard');
    if (masterCard) masterCard.classList.toggle('is-on', masterEnabled);

    const scrollToggle = byId(doc, 'scrollEnabled');
    if (scrollToggle) {
      scrollToggle.checked = masterEnabled ? scrollEnabled : false;
    }

    const scrollState = byId(doc, 'scrollState');
    if (scrollState) {
      scrollState.textContent = masterEnabled
        ? scrollEnabled
          ? 'Включена'
          : 'Выключена'
        : 'Недоступна';
      scrollState.classList.toggle('is-on', masterEnabled && scrollEnabled);
    }

    syncScrollControls(doc, masterEnabled);

    const themeToggle = byId(doc, 'themeEnabled');
    if (themeToggle) {
      themeToggle.checked = masterEnabled ? current.enabled : false;
    }

    const themeState = byId(doc, 'themeState');
    if (themeState) {
      themeState.textContent = masterEnabled
        ? current.enabled
          ? 'Включена'
          : 'Выключена'
        : 'Недоступна';
      themeState.classList.toggle(
        'is-on',
        masterEnabled && current.enabled,
      );
    }

    setChecked(doc, 'palette', current.palette);

    const images = byId(doc, 'images');
    if (images) images.value = current.images;

    syncThemeControls(doc, masterEnabled);

    const resolved = masterEnabled ? core.resolveTheme(current) : 'light';
    const rootEl = doc.documentElement;
    rootEl.dataset.lsTheme = resolved;
    rootEl.dataset.lsPalette = current.palette;

    const site = byId(doc, 'previewSite');
    if (site) {
      site.classList.toggle('is-dark', resolved === 'dark');
      site.dataset.images = current.images;
    }

    const panel = byId(doc, 'previewPanel');
    if (panel) {
      panel.classList.toggle('is-dark', resolved === 'dark');
    }
  }

  function showSaved(doc, text) {
    const status = byId(doc, 'saveStatus');
    if (!status) return;

    status.textContent = text || 'Сохранено';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      status.textContent = '';
    }, 1600);
  }

  function enqueue(task) {
    saveQueue = saveQueue.then(task, task);
    return saveQueue;
  }

  function updateTheme(doc, partial, statusText) {
    return enqueue(async function () {
      try {
        const next = await store.saveTheme(partial);
        render(doc, next, masterEnabled, scrollEnabled);
        showSaved(doc, statusText);
      } catch {
        showSaved(doc, 'Не удалось сохранить');
      }
    });
  }

  function updateScroll(doc, enabled) {
    return enqueue(async function () {
      try {
        await saveScrollEnabled(enabled);
        scrollEnabled = enabled;
        render(doc, current, masterEnabled, enabled);
        showSaved(doc, enabled ? 'Прокрутка включена' : 'Прокрутка выключена');
      } catch {
        showSaved(doc, 'Не удалось сохранить');
      }
    });
  }

  function updateMaster(doc, enabled) {
    return enqueue(async function () {
      try {
        await saveMasterEnabled(enabled);
        masterEnabled = enabled;
        render(doc, current, enabled, scrollEnabled);
        showSaved(doc, enabled ? 'Расширение включено' : 'Выключено');

        if (
          typeof chrome !== 'undefined' &&
          chrome.runtime &&
          chrome.runtime.sendMessage
        ) {
          try {
            chrome.runtime.sendMessage({
              action: 'setExtensionEnabled',
              enabled,
            });
          } catch {
            // The storage write above is enough for the next page load.
          }
        }
      } catch {
        showSaved(doc, 'Не удалось сохранить');
      }
    });
  }

  function initPopup(doc) {
    const document = doc || root.document;
    if (!document) return null;

    const version = byId(document, 'version');
    if (
      version &&
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.getManifest === 'function'
    ) {
      try {
        version.textContent = `v${chrome.runtime.getManifest().version}`;
      } catch {
        version.textContent = '';
      }
    }

    Promise.all([
      store.loadTheme(),
      loadMasterEnabled(),
      loadScrollEnabled(),
    ])
      .then(([theme, enabled, scroll]) => {
        render(document, theme, enabled, scroll);
      })
      .catch(() => {
        render(document, core.DEFAULT_THEME, true, true);
      });

    document.addEventListener('change', function (event) {
      const target = event.target;
      if (!target) return;

      if (target.id === 'extensionEnabled') {
        updateMaster(document, target.checked);
        return;
      }

      if (!masterEnabled) return;

      if (target.id === 'scrollEnabled') {
        updateScroll(document, target.checked);
        return;
      }

      if (target.id === 'themeEnabled') {
        updateTheme(document, { enabled: target.checked });
        return;
      }

      if (target.name === 'palette') {
        updateTheme(document, { palette: target.value });
        return;
      }

      if (target.id === 'images') {
        updateTheme(document, { images: target.value });
      }
    });

    const reset = byId(document, 'resetBtn');
    if (reset) {
      reset.addEventListener('click', function () {
        if (!masterEnabled) return;
        updateTheme(document, core.DEFAULT_THEME, 'Сброшено');
      });
    }

    store.onThemeChanged(function (theme) {
      render(document, theme, masterEnabled, scrollEnabled);
    });

    onMasterChanged(function (enabled) {
      render(document, current, enabled, scrollEnabled);
    });

    return { render };
  }

  root.LSPopup = { initPopup, render };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.LSPopup;
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initPopup();
    });
  } else {
    initPopup();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
