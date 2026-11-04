// LastSticker Search - quick page scroll widget.

(function (root) {
  'use strict';

  const isCommonJS = typeof module !== 'undefined' && module.exports;
  const WIDGET_ID = 'ls-scroll-widget';
  const STORAGE_KEY = 'isEnabled';
  const SCROLL_KEY = 'ls_scroll_enabled';
  const MIN_SCROLLABLE = 80;

  const state = {
    document: null,
    window: null,
    widget: null,
    upButton: null,
    downButton: null,
    enabled: true,
    scrollEnabled: true,
    frame: 0,
    listenersBound: false,
    storageBound: false,
  };

  function getDocument() {
    return state.document || root.document;
  }

  function getWindow() {
    const doc = getDocument();
    return state.window || (doc && doc.defaultView) || root;
  }

  function getScrollTop(win, doc) {
    const pageYOffset = Number(win.pageYOffset);
    if (Number.isFinite(pageYOffset) && pageYOffset > 0) return pageYOffset;

    const scrollY = Number(win.scrollY);
    if (Number.isFinite(scrollY) && scrollY > 0) return scrollY;

    const documentElement = doc.documentElement;
    const body = doc.body;
    return Number((documentElement && documentElement.scrollTop) || (body && body.scrollTop) || 0);
  }

  function getScrollHeight(doc) {
    const documentElement = doc.documentElement;
    const body = doc.body;
    return Math.max(
      Number(documentElement && documentElement.scrollHeight) || 0,
      Number(body && body.scrollHeight) || 0,
    );
  }

  function getViewportHeight(win, doc) {
    const innerHeight = Number(win.innerHeight);
    if (Number.isFinite(innerHeight) && innerHeight > 0) return innerHeight;

    return Number((doc.documentElement && doc.documentElement.clientHeight) || 0);
  }

  function getMaxScroll(win, doc) {
    return Math.max(0, getScrollHeight(doc) - getViewportHeight(win, doc));
  }

  function getScrollBehavior(win) {
    try {
      if (win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return 'auto';
      }
    } catch {
      // The widget still works if matchMedia is unavailable.
    }
    return 'smooth';
  }

  function scrollToTop() {
    const win = getWindow();
    if (!win || typeof win.scrollTo !== 'function') return;
    win.scrollTo({ top: 0, behavior: getScrollBehavior(win) });
  }

  function scrollToBottom() {
    const doc = getDocument();
    const win = getWindow();
    if (!doc || !win || typeof win.scrollTo !== 'function') return;
    win.scrollTo({
      top: getMaxScroll(win, doc),
      behavior: getScrollBehavior(win),
    });
  }

  function createButton(doc, direction, label, title) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = `ls-scroll-widget__button ls-scroll-widget__button--${direction}`;
    button.setAttribute('aria-label', label);
    button.title = title;

    const arrow = doc.createElement('span');
    arrow.className = 'ls-scroll-widget__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = direction === 'up' ? '↑' : '↓';
    button.appendChild(arrow);

    return button;
  }

  function createScrollWidget() {
    const doc = getDocument();
    if (!doc || !doc.body) return null;

    let widget = doc.getElementById(WIDGET_ID);
    if (!widget) {
      widget = doc.createElement('div');
      widget.id = WIDGET_ID;
      widget.className = 'ls-scroll-widget';
      widget.setAttribute('role', 'group');
      widget.setAttribute('aria-label', 'Быстрая прокрутка');

      const up = createButton(doc, 'up', 'В начало страницы', 'В начало');
      const down = createButton(doc, 'down', 'В конец страницы', 'В конец');
      up.addEventListener('click', scrollToTop);
      down.addEventListener('click', scrollToBottom);

      widget.appendChild(up);
      widget.appendChild(down);
      doc.body.appendChild(widget);
    }

    state.widget = widget;
    state.upButton = widget.querySelector('.ls-scroll-widget__button--up');
    state.downButton = widget.querySelector('.ls-scroll-widget__button--down');
    updateScrollWidget();

    return widget;
  }

  function removeScrollWidget() {
    const doc = getDocument();
    const widget = state.widget || (doc && doc.getElementById(WIDGET_ID));
    if (widget) widget.remove();

    state.widget = null;
    state.upButton = null;
    state.downButton = null;
  }

  function updateScrollWidget() {
    const doc = getDocument();
    const win = getWindow();
    if (!doc || !win || !state.widget) return;

    const maxScroll = getMaxScroll(win, doc);
    const scrollTop = getScrollTop(win, doc);
    const visible =
      state.enabled && state.scrollEnabled && maxScroll > MIN_SCROLLABLE;

    state.widget.hidden = !visible;
    if (!visible) return;

    if (state.upButton) state.upButton.disabled = scrollTop <= 1;
    if (state.downButton) {
      state.downButton.disabled = scrollTop >= maxScroll - 1;
    }
  }

  function requestUpdate() {
    if (state.frame) return;

    const win = getWindow();
    if (!win) return;

    const raf =
      win.requestAnimationFrame ||
      function fallback(callback) {
        return win.setTimeout(callback, 16);
      };

    state.frame = raf(function onFrame() {
      state.frame = 0;
      updateScrollWidget();
    });
  }

  function setExtensionEnabled(value) {
    state.enabled = value !== false;

    if (!state.enabled) {
      removeScrollWidget();
      return;
    }

    if (!state.scrollEnabled) {
      removeScrollWidget();
      return;
    }

    createScrollWidget();
    updateScrollWidget();
  }

  function setScrollEnabled(value) {
    state.scrollEnabled = value !== false;

    if (!state.scrollEnabled) {
      removeScrollWidget();
      return;
    }

    if (!state.enabled) return;

    createScrollWidget();
    updateScrollWidget();
  }

  async function readState() {
    const chromeApi = root.chrome;
    if (chromeApi && chromeApi.storage && chromeApi.storage.local) {
      try {
        const data = await chromeApi.storage.local.get([
          STORAGE_KEY,
          SCROLL_KEY,
        ]);
        return {
          enabled: !data || data[STORAGE_KEY] !== false,
          scrollEnabled: !data || data[SCROLL_KEY] !== false,
        };
      } catch {
        // Fall through to the enabled defaults.
      }
    }
    return { enabled: true, scrollEnabled: true };
  }

  function bindWindow(win) {
    if (state.listenersBound || !win) return;
    state.listenersBound = true;
    win.addEventListener('scroll', requestUpdate, { passive: true });
    win.addEventListener('resize', requestUpdate, { passive: true });
    win.addEventListener('load', requestUpdate, { passive: true });
  }

  function bindStorage() {
    if (state.storageBound) return;
    state.storageBound = true;

    const chromeApi = root.chrome;
    if (!chromeApi) return;

    if (chromeApi.storage && chromeApi.storage.onChanged) {
      chromeApi.storage.onChanged.addListener(function onStorageChanged(changes, area) {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY]) {
          setExtensionEnabled(changes[STORAGE_KEY].newValue !== false);
        }
        if (changes[SCROLL_KEY]) {
          setScrollEnabled(changes[SCROLL_KEY].newValue !== false);
        }
      });
    }

    if (chromeApi.runtime && chromeApi.runtime.onMessage) {
      chromeApi.runtime.onMessage.addListener(function onMessage(message) {
        if (message && message.action === 'extensionEnabledChanged') {
          setExtensionEnabled(message.enabled);
        }
      });
    }
  }

  function whenBodyReady(doc) {
    return new Promise(function waitForBody(resolve) {
      if (!doc || doc.body) {
        resolve();
        return;
      }
      doc.addEventListener(
        'DOMContentLoaded',
        function onReady() {
          resolve();
        },
        { once: true },
      );
    });
  }

  async function initScrollWidget() {
    const doc = root.document;
    if (!doc) return;

    await whenBodyReady(doc);
    state.document = doc;
    state.window = doc.defaultView || root;
    bindWindow(state.window);
    bindStorage();
    const stored = await readState();
    state.scrollEnabled = stored.scrollEnabled;
    setExtensionEnabled(stored.enabled);
  }

  const api = {
    WIDGET_ID,
    SCROLL_KEY,
    createScrollWidget,
    removeScrollWidget,
    updateScrollWidget,
    setExtensionEnabled,
    setScrollEnabled,
    initScrollWidget,
    scrollToTop,
    scrollToBottom,
    getScrollTop,
    getScrollHeight,
    getViewportHeight,
    getMaxScroll,
    getScrollBehavior,
  };

  root.LSScrollWidget = api;

  if (isCommonJS) {
    module.exports = api;
  } else if (root.document) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener(
        'DOMContentLoaded',
        function onReady() {
          void initScrollWidget();
        },
        { once: true },
      );
    } else {
      void initScrollWidget();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
