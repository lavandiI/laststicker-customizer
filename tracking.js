// LastSticker Search - linkifies tracking numbers and renders their route.

(function (root) {
  'use strict';

  const isCommonJS = typeof module !== 'undefined' && module.exports;
  const core =
    root.LSTrackingCore || (typeof require === 'function' ? require('./tracking-core.js') : null);

  if (!core) return;

  const MASTER_KEY = 'isEnabled';
  const TRACKING_KEY = 'ls_tracking_enabled';
  const CARD_CLASS = 'ls-track-card';
  const LINK_CLASS = 'ls-track-link';
  const MESSAGE_SELECTORS = ['.user_message .big_text', 'dl.comment_new dd [id^="comment_txt"]'];
  const SKIP_SELECTOR = 'a, script, style, textarea, input, button, code, pre, .ls-track-card';

  let extensionEnabled = true;
  let trackingEnabled = false;
  let observer = null;
  let cardSeq = 0;
  let initialized = false;

  function getChrome() {
    return root.chrome;
  }

  function getThemeMessageRoots() {
    const selectors = MESSAGE_SELECTORS.slice();
    if (/^\/blog\/post\d+(?:\/page\d+)?\/?$/.test(root.location.pathname)) {
      selectors.push('#content .forum_content');
    }
    return selectors;
  }

  function shouldProcessText(node) {
    const parent = node.parentElement;
    if (!parent) return false;
    if (parent.closest(SKIP_SELECTOR)) return false;
    return String(node.nodeValue || '').length >= 13;
  }

  function createLink(number, operator) {
    const doc = root.document;
    const link = doc.createElement('a');
    link.className = LINK_CLASS;
    link.href = core.officialUrl(number, operator);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = number;
    link.title = `${core.operatorLabel(operator)} — открыть маршрут`;
    link.setAttribute('aria-label', `${core.operatorLabel(operator)}, трек-номер ${number}`);
    link.dataset.lsTrackNumber = number;
    link.dataset.lsTrackOperator = operator;
    link.addEventListener('click', onLinkClick);
    return link;
  }

  function linkifyTextNode(node) {
    const text = String(node.nodeValue || '');
    const matches = core.findMatches(text);
    if (!matches.length) return;

    const doc = root.document;
    const fragment = doc.createDocumentFragment();
    let cursor = 0;

    matches.forEach(function appendMatch(match) {
      if (match.start > cursor) {
        fragment.appendChild(doc.createTextNode(text.slice(cursor, match.start)));
      }
      fragment.appendChild(createLink(match.value, match.operator));
      cursor = match.end;
    });

    if (cursor < text.length) {
      fragment.appendChild(doc.createTextNode(text.slice(cursor)));
    }

    if (node.parentNode) {
      node.parentNode.replaceChild(fragment, node);
    }
  }

  function linkifyContainer(container) {
    if (!container || !extensionEnabled) return;
    if (container.closest && container.closest('.ls-track-card')) return;

    const walker = root.document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          return shouldProcessText(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      },
      false,
    );

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(linkifyTextNode);
  }

  function scan(scope) {
    if (!extensionEnabled || !scope) return;

    const selectors = getThemeMessageRoots();
    const containers = new Set();

    selectors.forEach(function collect(selector) {
      if (scope.nodeType === 9) {
        scope.querySelectorAll(selector).forEach((el) => containers.add(el));
        return;
      }

      if (scope.nodeType === 1 && scope.matches && scope.matches(selector)) {
        containers.add(scope);
      }

      if (scope.querySelectorAll) {
        scope.querySelectorAll(selector).forEach((el) => containers.add(el));
      }
    });

    containers.forEach(linkifyContainer);
  }

  function startObserver() {
    if (observer || !root.document.body) return;

    observer = new MutationObserver(function onMutations(mutations) {
      if (!extensionEnabled) return;

      mutations.forEach(function inspect(mutation) {
        mutation.addedNodes.forEach(function inspectNode(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.closest && node.closest('.ls-track-card')) return;
            scan(node);
            return;
          }

          if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
            if (!node.parentElement.closest(SKIP_SELECTOR)) {
              linkifyTextNode(node);
            }
          }
        });
      });
    });

    observer.observe(root.document.body, {
      childList: true,
      subtree: true,
    });
  }

  function disconnectObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function closeAllCards() {
    root.document.querySelectorAll(`.${CARD_CLASS}`).forEach((card) => {
      card.remove();
    });
    root.document.querySelectorAll(`.${LINK_CLASS}`).forEach((link) => {
      link.setAttribute('aria-expanded', 'false');
      link.removeAttribute('aria-controls');
      delete link.dataset.lsTrackCardId;
    });
  }

  function removeAllTracking() {
    disconnectObserver();
    closeAllCards();

    root.document.querySelectorAll(`.${LINK_CLASS}`).forEach((link) => {
      if (link.parentNode) {
        link.replaceWith(root.document.createTextNode(link.textContent));
      }
    });
  }

  function setExtensionEnabled(enabled) {
    extensionEnabled = enabled !== false;

    if (!extensionEnabled) {
      removeAllTracking();
      return;
    }

    scan(root.document);
    startObserver();
  }

  function setTrackingEnabled(enabled) {
    trackingEnabled = enabled === true;
    if (!trackingEnabled) closeAllCards();
  }

  function onLinkClick(event) {
    if (!extensionEnabled || !trackingEnabled) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    toggleCard(event.currentTarget);
  }

  function createCard(link) {
    const doc = root.document;
    const card = doc.createElement('div');
    card.className = CARD_CLASS;
    card.id = `ls-track-card-${++cardSeq}`;
    card.setAttribute('role', 'region');
    card.dataset.loaded = '0';

    const head = doc.createElement('div');
    head.className = 'ls-track-card__head';

    const title = doc.createElement('div');
    title.className = 'ls-track-card__title';

    const operator = doc.createElement('span');
    operator.className = 'ls-track-card__operator';
    operator.textContent = core.operatorLabel(link.dataset.lsTrackOperator);

    const number = doc.createElement('span');
    number.className = 'ls-track-card__number';
    number.textContent = link.dataset.lsTrackNumber;

    title.appendChild(operator);
    title.appendChild(number);

    const actions = doc.createElement('div');
    actions.className = 'ls-track-card__actions';

    const refresh = doc.createElement('button');
    refresh.type = 'button';
    refresh.className = 'ls-track-card__refresh';
    refresh.textContent = 'Обновить';

    const site = doc.createElement('a');
    site.className = 'ls-track-card__site';
    site.href = core.officialUrl(link.dataset.lsTrackNumber, link.dataset.lsTrackOperator);
    site.target = '_blank';
    site.rel = 'noopener noreferrer';
    site.textContent = 'На сайте';

    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'ls-track-card__close';
    close.setAttribute('aria-label', 'Свернуть маршрут');
    close.textContent = '×';

    actions.appendChild(refresh);
    actions.appendChild(site);
    actions.appendChild(close);

    const status = doc.createElement('div');
    status.className = 'ls-track-card__status';
    status.textContent = 'Загружаем маршрут…';

    const timeline = doc.createElement('ol');
    timeline.className = 'ls-track-card__timeline';

    head.appendChild(title);
    head.appendChild(actions);
    card.appendChild(head);
    card.appendChild(status);
    card.appendChild(timeline);
    card.hidden = false;

    refresh.addEventListener('click', function refreshCard() {
      loadCard(card, link, true);
    });
    close.addEventListener('click', function closeCard() {
      card.hidden = true;
      link.setAttribute('aria-expanded', 'false');
    });

    card._lsStatus = status;
    card._lsTimeline = timeline;
    card._lsRefresh = refresh;

    return card;
  }

  function toggleCard(link) {
    const doc = root.document;
    const existing = link.dataset.lsTrackCardId && doc.getElementById(link.dataset.lsTrackCardId);

    if (existing) {
      if (existing.hidden) {
        existing.hidden = false;
        link.setAttribute('aria-expanded', 'true');
        if (existing.dataset.loaded !== '1') loadCard(existing, link);
      } else {
        existing.hidden = true;
        link.setAttribute('aria-expanded', 'false');
      }
      return;
    }

    const messageRoot =
      link.closest('.user_message') ||
      link.closest('dl.comment_new') ||
      link.closest('.forum_content') ||
      link.parentElement;

    if (!messageRoot || !messageRoot.parentNode) return;

    const card = createCard(link);
    messageRoot.parentNode.insertBefore(card, messageRoot.nextSibling);
    link.setAttribute('aria-expanded', 'true');
    link.setAttribute('aria-controls', card.id);
    link.dataset.lsTrackCardId = card.id;
    loadCard(card, link);
  }

  function errorText(code) {
    switch (code) {
      case 'tracking_disabled':
        return 'Отслеживание выключено в настройках расширения.';
      case 'permission_required':
        return 'Разрешите доступ к сайтам Почты России и Белпочты в настройках расширения.';
      case 'not_found':
        return 'Маршрут не найден. Проверьте номер отправления.';
      case 'rate_limited':
        return 'Слишком много запросов. Попробуйте позже.';
      case 'invalid_number':
        return 'Некорректный трек-номер.';
      default:
        return 'Не удалось загрузить маршрут.';
    }
  }

  function renderError(card, code) {
    if (card._lsStatus) card._lsStatus.textContent = errorText(code);
    if (card._lsTimeline) card._lsTimeline.replaceChildren();
    card.dataset.loaded = '0';
  }

  function renderResult(card, result) {
    if (!result) {
      renderError(card, 'tracking_failed');
      return;
    }

    const status = result.status || 'Статус не указан';
    const updated = core.formatEventDate(result.updatedAt);
    if (card._lsStatus) {
      card._lsStatus.textContent = updated ? `${status} · обновлено ${updated}` : status;
    }

    const timeline = card._lsTimeline;
    if (!timeline) return;
    timeline.replaceChildren();

    const events = Array.isArray(result.events) ? result.events : [];
    if (!events.length) {
      const empty = root.document.createElement('li');
      empty.className = 'ls-track-card__empty';
      empty.textContent = 'Маршрут пока не обновлялся.';
      timeline.appendChild(empty);
    } else {
      events.forEach(function appendEvent(event) {
        const item = root.document.createElement('li');
        item.className = 'ls-track-card__event-item';
        if (event.planned) item.classList.add('is-planned');

        const date = root.document.createElement('time');
        date.className = 'ls-track-card__date';
        date.textContent = core.formatEventDate(event.date || '') || '—';

        const title = root.document.createElement('strong');
        title.className = 'ls-track-card__event';
        title.textContent = event.status || 'Операция';

        const place = root.document.createElement('span');
        place.className = 'ls-track-card__place';
        const placeParts = [];
        if (event.place) placeParts.push(event.place);
        if (event.index) placeParts.push(event.index);
        place.textContent = placeParts.join(' · ');

        item.appendChild(date);
        item.appendChild(title);
        if (place.textContent) item.appendChild(place);
        timeline.appendChild(item);
      });
    }

    card.dataset.loaded = '1';
  }

  function loadCard(card, link, force) {
    if (!extensionEnabled || !trackingEnabled) {
      renderError(card, 'tracking_disabled');
      return;
    }

    const chromeApi = getChrome();
    if (!chromeApi || !chromeApi.runtime || !chromeApi.runtime.sendMessage) {
      renderError(card, 'tracking_failed');
      return;
    }

    if (card._lsStatus) card._lsStatus.textContent = 'Загружаем маршрут…';
    if (card._lsTimeline) card._lsTimeline.replaceChildren();
    if (card._lsRefresh) card._lsRefresh.disabled = true;
    card.classList.add('is-loading');
    card.dataset.loaded = '0';

    try {
      chromeApi.runtime.sendMessage(
        {
          action: 'trackShipment',
          number: link.dataset.lsTrackNumber,
          operator: link.dataset.lsTrackOperator,
          force: Boolean(force),
        },
        function onResponse(response) {
          void chromeApi.runtime.lastError;
          card.classList.remove('is-loading');
          if (card._lsRefresh) card._lsRefresh.disabled = false;

          if (!response || response.error) {
            renderError(card, response && response.error);
            return;
          }

          renderResult(card, response.result);
        },
      );
    } catch {
      card.classList.remove('is-loading');
      if (card._lsRefresh) card._lsRefresh.disabled = false;
      renderError(card, 'tracking_failed');
    }
  }

  async function readState() {
    const chromeApi = getChrome();
    if (!chromeApi || !chromeApi.storage || !chromeApi.storage.local) {
      return { enabled: true, tracking: false };
    }

    try {
      const data = await chromeApi.storage.local.get([MASTER_KEY, TRACKING_KEY]);
      return {
        enabled: data[MASTER_KEY] !== false,
        tracking: data[TRACKING_KEY] === true,
      };
    } catch {
      return { enabled: true, tracking: false };
    }
  }

  function bindState() {
    const chromeApi = getChrome();
    if (!chromeApi) return;

    if (chromeApi.storage && chromeApi.storage.onChanged) {
      chromeApi.storage.onChanged.addListener(function onStorageChanged(changes, area) {
        if (area !== 'local') return;
        if (changes[MASTER_KEY]) {
          setExtensionEnabled(changes[MASTER_KEY].newValue !== false);
        }
        if (changes[TRACKING_KEY]) {
          setTrackingEnabled(changes[TRACKING_KEY].newValue === true);
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

  async function initTracking() {
    if (initialized) return;
    initialized = true;

    const state = await readState();
    extensionEnabled = state.enabled;
    trackingEnabled = state.tracking;
    bindState();

    if (!extensionEnabled) return;

    if (!root.document.body) {
      await new Promise(function waitForBody(resolve) {
        root.document.addEventListener('DOMContentLoaded', resolve, {
          once: true,
        });
      });
    }

    scan(root.document);
    startObserver();
  }

  const api = {
    LINK_CLASS,
    CARD_CLASS,
    createLink,
    linkifyTextNode,
    linkifyContainer,
    scan,
    toggleCard,
    renderResult,
    renderError,
    setExtensionEnabled,
    setTrackingEnabled,
    initTracking,
  };

  root.LSTracking = api;

  if (isCommonJS) {
    module.exports = api;
  } else if (root.document) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener(
        'DOMContentLoaded',
        function onReady() {
          void initTracking();
        },
        { once: true },
      );
    } else {
      void initTracking();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
