// LastSticker Search - update welcome page.

(function (root) {
  'use strict';

  function compareVersions(a, b) {
    const left = String(a || '')
      .split('.')
      .map((part) => parseInt(part, 10) || 0);
    const right = String(b || '')
      .split('.')
      .map((part) => parseInt(part, 10) || 0);

    for (let index = 0; index < 3; index += 1) {
      const diff = (left[index] || 0) - (right[index] || 0);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
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

  function getManifestVersion() {
    try {
      if (
        typeof chrome !== 'undefined' &&
        chrome.runtime &&
        typeof chrome.runtime.getManifest === 'function'
      ) {
        return chrome.runtime.getManifest().version;
      }
    } catch {
      // Fall through to the default below.
    }
    return '1.6.4';
  }

  async function loadState() {
    const storage = chromeStorage();
    if (!storage) return { theme: null, masterEnabled: true };

    try {
      const data = await storage.get(['ls_search_theme', 'isEnabled']);
      return {
        theme: data['ls_search_theme'] || null,
        masterEnabled: data.isEnabled !== false,
      };
    } catch {
      return { theme: null, masterEnabled: true };
    }
  }

  function applyTheme(doc, theme, masterEnabled) {
    const dark = Boolean(
      masterEnabled !== false && theme && theme.enabled === true,
    );
    doc.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      if (
        typeof chrome === 'undefined' ||
        !chrome.runtime ||
        typeof chrome.runtime.sendMessage !== 'function'
      ) {
        resolve(null);
        return;
      }

      try {
        chrome.runtime.sendMessage(message, (response) => {
          void chrome.runtime.lastError;
          resolve(response || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  async function enableExtension(doc) {
    const button = doc.getElementById('enableBtn');
    const banner = doc.getElementById('disabledBanner');
    if (button) {
      button.disabled = true;
      button.textContent = 'Включаем…';
    }

    try {
      const storage = chromeStorage();
      if (storage) {
        await storage.set({ isEnabled: true });
      }

      await sendMessage({ action: 'setExtensionEnabled', enabled: true });

      if (banner) banner.hidden = true;
      if (button) {
        button.textContent = 'Включено';
        button.disabled = false;
      }

      const state = await loadState();
      applyTheme(doc, state.theme, true);
    } catch {
      if (button) {
        button.textContent = 'Не удалось включить';
        button.disabled = false;
      }
    }
  }

  function openSite() {
    if (
      typeof chrome !== 'undefined' &&
      chrome.tabs &&
      typeof chrome.tabs.create === 'function'
    ) {
      chrome.tabs.create({ url: 'https://laststicker.ru/' });
      return;
    }

    if (root.open) root.open('https://laststicker.ru/', '_blank');
  }

  function closePage() {
    if (
      typeof chrome !== 'undefined' &&
      chrome.tabs &&
      typeof chrome.tabs.getCurrent === 'function' &&
      typeof chrome.tabs.remove === 'function'
    ) {
      chrome.tabs.getCurrent((tab) => {
        if (tab && tab.id) {
          chrome.tabs.remove(tab.id);
        } else if (root.close) {
          root.close();
        }
      });
      return;
    }

    if (root.close) root.close();
  }

  function updateCopy(doc, version, previousVersion) {
    const versionLabel = doc.getElementById('versionLabel');
    const heroVersion = doc.getElementById('heroVersion');
    const footerVersion = doc.getElementById('footerVersion');
    const previousLabel = doc.getElementById('previousLabel');
    const lead = doc.getElementById('lead');
    const themeFeature = doc.getElementById('themeFeature');
    const scrollFeature = doc.getElementById('scrollFeature');

    const fromOldVersion =
      !previousVersion || compareVersions(previousVersion, '1.6.0') < 0;
    const fromBeforeScroll =
      !previousVersion || compareVersions(previousVersion, '1.6.3') < 0;
    const fromBeforeHighlight =
      !previousVersion || compareVersions(previousVersion, '1.6.4') < 0;

    if (versionLabel) versionLabel.textContent = `v${version}`;
    if (heroVersion) heroVersion.textContent = `в ${version}`;
    if (footerVersion) footerVersion.textContent = version;

    if (previousLabel) {
      previousLabel.textContent = previousVersion
        ? `Обновление с ${previousVersion}`
        : '';
    }

    if (lead) {
      if (fromOldVersion) {
        lead.textContent =
          'Быстрая прокрутка в начало и в конец страницы, тёмная тема всего сайта и один выключатель для всего расширения — чтобы ничего не пропустить.';
      } else if (fromBeforeScroll) {
        lead.textContent =
          'Быстрая прокрутка страницы с возможностью отключить её в настройках и один выключатель для всего расширения — чтобы ничего не пропустить.';
      } else if (fromBeforeHighlight) {
        lead.textContent =
          'Найденное сообщение теперь подсвечивается мягким сапфировым акцентом: плавное появление, короткий блик и такое же плавное затухание.';
      } else {
        lead.textContent =
          'Один выключатель для всего расширения, чёрная иконка без поиска и этот экран — чтобы ничего не пропустить.';
      }
    }

    if (themeFeature) themeFeature.hidden = !fromOldVersion;
    if (scrollFeature) scrollFeature.hidden = !fromBeforeScroll;
  }

  function initWelcome(doc, search) {
    const document = doc || root.document;
    if (!document) return null;

    const params = new URLSearchParams(
      typeof search === 'string' ? search : root.location.search,
    );
    const version = params.get('version') || getManifestVersion();
    const previousVersion = params.get('previous') || '';

    updateCopy(document, version, previousVersion);
    loadState().then((state) => {
      applyTheme(document, state.theme, state.masterEnabled);
      const banner = document.getElementById('disabledBanner');
      if (banner) banner.hidden = state.masterEnabled;
    });

    const openButton = document.getElementById('openSite');
    if (openButton) openButton.addEventListener('click', openSite);

    const closeTop = document.getElementById('closeTop');
    if (closeTop) closeTop.addEventListener('click', closePage);

    const closeBottom = document.getElementById('closeBottom');
    if (closeBottom) closeBottom.addEventListener('click', closePage);

    const enableButton = document.getElementById('enableBtn');
    if (enableButton) {
      enableButton.addEventListener('click', () => {
        void enableExtension(document);
      });
    }

    return { version, previousVersion };
  }

  root.LSWelcome = { initWelcome, compareVersions };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.LSWelcome;
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initWelcome();
    });
  } else {
    initWelcome();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
