// LastSticker Customizer - favorite stars in auction lists.
// Adds the site's own star to every auction row (active and recently ended),
// adds/removes the favorite through the site's AJAX endpoint, and restores the
// initial state from the "Избранные аукционы" page.

(function (root) {
  'use strict';

  const isCommonJS = typeof module !== 'undefined' && module.exports;

  const FAVORITE_YES = 'forum_favorite_button_yes';
  const FAVORITE_NO = 'forum_favorite_button_no';
  const FAVORITE_ENDPOINT = '/inc/site/ajax/user_forum_post_rel_img.php';
  const FAVORITE_PAGE = '/auction/favorite/';
  // Most accounts have a single page of favorites; the rest are only fetched
  // when the first page links them.
  const MAX_FAVORITE_PAGES = 3;
  const FETCH_TIMEOUT_MS = 10000;
  const OBSERVER_DELAY_MS = 50;
  const WARMUP_DELAY_MS = 300;
  const FAVORITES_CACHE_KEY = 'ls_auction_favorites_cache';
  const FAVORITES_CACHE_TTL_MS = 5 * 60 * 1000;
  const STATUS_ID = 'ls-auction-status';
  const STATUS_TIMEOUT_MS = 4000;

  function getSessionStorage() {
    try {
      return root.sessionStorage || null;
    } catch {
      return null;
    }
  }

  function readCachedFavoriteIds(storage) {
    if (!storage) return null;

    try {
      const raw = storage.getItem(FAVORITES_CACHE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.ids)) return null;

      const savedAt = Number(parsed.savedAt) || 0;
      if (Date.now() - savedAt > FAVORITES_CACHE_TTL_MS) return null;

      return parsed.ids.map(String);
    } catch {
      return null;
    }
  }

  function writeCachedFavoriteIds(storage, ids) {
    if (!storage) return;

    try {
      storage.setItem(
        FAVORITES_CACHE_KEY,
        JSON.stringify({ ids: Array.from(ids), savedAt: Date.now() }),
      );
    } catch {
      // A full or unavailable session storage only loses the cache.
    }
  }

  // Auction item pages and the pages that already render their own stars are
  // intentionally excluded. Seller lot lists are included.
  function isAuctionListPath(pathname) {
    const path = String(pathname || '');

    if (/^\/auction\/post\d+(?:\/|$)/.test(path)) return false;
    if (/^\/auction\/(?:favorite|archive|won)(?:\/|$)/.test(path)) {
      return false;
    }
    if (/^\/users\/auction\/\d+(?:\/|$)/.test(path)) return true;

    return /^\/auction(?:\/|$)/.test(path);
  }

  function isLoggedIn(doc) {
    if (!doc || !doc.querySelector) return false;
    return Boolean(doc.querySelector('a[href*="/logout/"]'));
  }

  function getPostIdFromRow(row) {
    if (!row || !row.querySelectorAll) return '';

    const links = row.querySelectorAll('a[href*="/auction/post"]');
    for (let i = 0; i < links.length; i += 1) {
      const href = links[i].getAttribute('href') || '';
      const match = href.match(/\/auction\/post(\d+)(?:[/?#]|$)/);
      if (match) return match[1];
    }

    return '';
  }

  function getLastCell(row) {
    if (!row || !row.cells || !row.cells.length) return null;
    return row.cells[row.cells.length - 1];
  }

  function hasFavoriteControl(row) {
    if (!row || !row.querySelector) return false;

    return Boolean(
      row.querySelector(
        '.forum_favorite_button_yes, .forum_favorite_button_no, ' +
          '[onclick*="user_forum_post_rel_img"], [data-ls-auction-fav]',
      ),
    );
  }

  function uniqueStarId(doc, postId) {
    const base = `forum_favorite_${postId}`;
    if (!doc || !doc.getElementById) return base;
    if (!doc.getElementById(base)) return base;

    let index = 2;
    while (doc.getElementById(`${base}_${index}`)) index += 1;
    return `${base}_${index}`;
  }

  function setStarState(star, isFavorite) {
    if (!star) return;

    star.className = isFavorite ? FAVORITE_YES : FAVORITE_NO;
    star.dataset.lsAuctionFavState = isFavorite ? 'yes' : 'no';

    const label = isFavorite
      ? 'Убрать из избранного'
      : 'Добавить в избранное';
    star.title = label;
    star.setAttribute('aria-label', label);
    star.setAttribute('aria-pressed', isFavorite ? 'true' : 'false');
  }

  function ensureStatusElement(doc) {
    let element = doc.getElementById(STATUS_ID);
    if (element) return element;

    element = doc.createElement('div');
    element.id = STATUS_ID;
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    element.style.cssText = [
      'position:fixed',
      'left:16px',
      'bottom:16px',
      'z-index:2147483000',
      'max-width:320px',
      'padding:8px 12px',
      'border-radius:6px',
      'background:#993333',
      'color:#fff',
      'font:13px/1.4 system-ui,-apple-system,sans-serif',
      'box-shadow:0 2px 10px rgba(0,0,0,.35)',
      'pointer-events:none',
    ].join(';');
    element.hidden = true;

    (doc.body || doc.documentElement).appendChild(element);
    return element;
  }

  /**
   * Show a short-lived message on pages that have no search panel.
   * Auction lists are not touched by the panel, so a failed star click would
   * otherwise stay completely silent.
   *
   * @param {Document} doc
   * @param {string} message
   */
  function showStatusMessage(doc, message) {
    if (!doc || !doc.createElement) return;

    const element = ensureStatusElement(doc);
    element.textContent = message;
    element.hidden = false;

    if (element._lsTimer) clearTimeout(element._lsTimer);
    element._lsTimer = setTimeout(() => {
      element.hidden = true;
      element._lsTimer = null;
    }, STATUS_TIMEOUT_MS);
  }

  function createStar(doc, postId, isFavorite) {
    const star = doc.createElement('div');
    star.id = uniqueStarId(doc, postId);
    star.dataset.lsAuctionFav = String(postId);
    star.setAttribute('role', 'button');
    star.tabIndex = 0;
    star.style.cssFloat = 'right';
    setStarState(star, isFavorite);
    return star;
  }

  // The favorite page contains stars for every favorite lot. Page links are
  // followed too, so users with several pages of favorites keep the correct
  // initial state.
  function parseFavoriteIds(html, baseUrl) {
    const ids = new Set();
    const pageUrls = [];

    if (!html || typeof DOMParser === 'undefined') {
      return { ids, pageUrls };
    }

    const parsed = new DOMParser().parseFromString(String(html), 'text/html');
    parsed.querySelectorAll('[id^="forum_favorite_"]').forEach((element) => {
      const match = String(element.id || '').match(/^forum_favorite_(\d+)/);
      if (match) ids.add(match[1]);
    });

    const origin = baseUrl || 'https://www.laststicker.ru';
    parsed.querySelectorAll('#pages a[href], a.page[href]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
        return;
      }

      try {
        const url = new URL(href, origin);
        if (!url.pathname.startsWith(FAVORITE_PAGE)) return;
        const normalized = `${url.pathname}${url.search}`;
        if (!pageUrls.includes(normalized)) pageUrls.push(normalized);
      } catch {
        // Ignore malformed pagination links.
      }
    });

    return { ids, pageUrls };
  }

  function fetchWithTimeout(fetchImpl, url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    return Promise.resolve(
      fetchImpl(url, {
        credentials: 'same-origin',
        // The page is fetched again on the next visit anyway; letting the
        // browser reuse it avoids a full re-download for every list page.
        cache: 'default',
        signal: controller.signal,
      }),
    ).finally(() => clearTimeout(timer));
  }

  async function fetchFavoriteIds(options = {}) {
    const fetchImpl =
      options.fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!fetchImpl) throw new Error('fetch is not available');

    const baseUrl =
      options.baseUrl ||
      (typeof location !== 'undefined'
        ? location.origin
        : 'https://www.laststicker.ru');
    const timeoutMs = options.timeoutMs || FETCH_TIMEOUT_MS;
    const maxPages = options.maxPages || MAX_FAVORITE_PAGES;
    const ids = new Set();
    const queue = [new URL(FAVORITE_PAGE, baseUrl).href];
    const visited = new Set();

    while (queue.length && visited.size < maxPages) {
      const url = queue.shift();
      if (visited.has(url)) continue;
      visited.add(url);

      let response;
      try {
        response = await fetchWithTimeout(fetchImpl, url, timeoutMs);
      } catch {
        continue;
      }

      if (!response || response.ok === false) continue;

      let html;
      try {
        html = await response.text();
      } catch {
        continue;
      }

      const parsed = parseFavoriteIds(html, baseUrl);
      parsed.ids.forEach((id) => ids.add(id));
      parsed.pageUrls.forEach((pageUrl) => {
        const absolute = new URL(pageUrl, baseUrl).href;
        if (!visited.has(absolute)) queue.push(absolute);
      });
    }

    return ids;
  }

  function requestFavoriteChange(postId, type) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    return fetch(FAVORITE_ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        post_id: String(postId),
        type: String(type),
      }).toString(),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .finally(() => clearTimeout(timer));
  }

  /**
   * Toggle the favorite state of one lot.
   *
   * @param {Element} star
   * @param {string} postId
   * @param {(postId: string, type: number) => Promise<object>} request
   * @param {{onError?: (message: string) => void}} [options]
   * @returns {Promise<boolean|null>} the new state, or null when nothing changed
   */
  async function toggleFavorite(star, postId, request, options = {}) {
    if (!star || star.dataset.lsPending === '1') return null;

    const reportError = (message) => {
      if (typeof options.onError === 'function') options.onError(message);
    };

    // The site always sends type=0 and lets the server toggle the relation.
    // The response's class_fav tells us the new state.
    star.dataset.lsPending = '1';

    try {
      const data = await request(postId, 0);
      if (!data || data.answer !== 'y') {
        reportError('сайт не подтвердил изменение');
        return null;
      }

      const nextClass = String(data.class_fav || '').trim();
      let next;
      if (nextClass === FAVORITE_YES) next = true;
      else if (nextClass === FAVORITE_NO) next = false;
      else {
        reportError('сайт вернул неожиданный ответ');
        return null;
      }

      setStarState(star, next);
      return next;
    } catch (error) {
      console.warn('[LS AuctionFavorites] favorite request failed', error);
      const message = String((error && error.message) || '');
      reportError(
        /^HTTP \d+$/.test(message)
          ? `сайт ответил ${message.replace('HTTP ', '')}`
          : 'нет связи с сайтом',
      );
      return null;
    } finally {
      delete star.dataset.lsPending;
    }
  }

  function createController(doc, options = {}) {
    if (!doc) return null;

    const request = options.request || requestFavoriteChange;
    const favoriteIds = new Set(options.favoriteIds || []);
    const fetchOptions = options.fetchOptions || {};
    let loaded = Boolean(options.favoriteIds);
    let favoritesPromise = loaded ? Promise.resolve(favoriteIds) : null;
    let observer = null;
    let scanTimer = null;
    let warmupTimer = null;
    let destroyed = false;
    const pendingPosts = new Set();

    function syncStars(postId, isFavorite) {
      const target = String(postId);
      doc.querySelectorAll('[data-ls-auction-fav]').forEach((star) => {
        if (star.dataset.lsAuctionFav === target) {
          setStarState(star, isFavorite);
        }
      });
    }

    async function handleActivate(star, postId) {
      const target = String(postId);

      // The same lot can appear in two rows (subscriptions, duplicates). The
      // server toggles the relation, so two parallel requests for one lot would
      // cancel each other out.
      if (destroyed || pendingPosts.has(target)) return;
      pendingPosts.add(target);

      try {
        if (!loaded) {
          try {
            await loadFavorites();
          } catch {
            // A failed initial fetch must not block the click.
          }
        }
        if (destroyed || !star.isConnected) return;

        const next = await toggleFavorite(star, target, request, {
          onError: (message) =>
            showStatusMessage(doc, `Не удалось изменить избранное: ${message}`),
        });
        if (next === null) return;

        if (next) favoriteIds.add(target);
        else favoriteIds.delete(target);
        syncStars(target, next);
      } finally {
        pendingPosts.delete(target);
      }
    }

    function bindStar(star, postId) {
      star.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleActivate(star, postId);
      });

      star.addEventListener('keydown', (event) => {
        if (
          event.key === 'Enter' ||
          event.key === ' ' ||
          event.key === 'Spacebar'
        ) {
          event.preventDefault();
          event.stopPropagation();
          handleActivate(star, postId);
        }
      });
    }

    function scan() {
      if (destroyed) return 0;

      let injected = 0;
      doc.querySelectorAll('table.inner tr').forEach((row) => {
        if (!row.querySelector('a[href*="/auction/post"]')) return;
        if (row.cells && row.cells.length < 3) return;
        if (hasFavoriteControl(row)) return;

        const postId = getPostIdFromRow(row);
        if (!postId) return;

        const cell = getLastCell(row);
        if (!cell) return;

        const star = createStar(doc, postId, favoriteIds.has(postId));
        cell.insertBefore(star, cell.firstChild);
        bindStar(star, postId);
        injected += 1;
      });

      return injected;
    }

    function scheduleScan() {
      if (destroyed || scanTimer) return;

      scanTimer = setTimeout(() => {
        scanTimer = null;
        scan();
      }, OBSERVER_DELAY_MS);
    }

    function startObserver() {
      if (
        destroyed ||
        observer ||
        typeof MutationObserver === 'undefined' ||
        !doc.body
      ) {
        return;
      }

      observer = new MutationObserver(scheduleScan);
      observer.observe(doc.body, { childList: true, subtree: true });
    }

    function loadFavorites() {
      if (favoritesPromise) return favoritesPromise;

      favoritesPromise = (async () => {
        const storage = getSessionStorage();
        const cached = readCachedFavoriteIds(storage);

        if (cached) {
          cached.forEach((id) => favoriteIds.add(String(id)));
        } else {
          try {
            const fetched = await fetchFavoriteIds(fetchOptions);
            fetched.forEach((id) => favoriteIds.add(id));
            writeCachedFavoriteIds(storage, fetched);
          } catch (error) {
            console.warn('[LS AuctionFavorites] favorites request failed', error);
          }
        }

        loaded = true;
        if (!destroyed) {
          doc.querySelectorAll('[data-ls-auction-fav]').forEach((star) => {
            const postId = star.dataset.lsAuctionFav;
            setStarState(star, favoriteIds.has(postId));
          });
        }

        return favoriteIds;
      })();

      return favoritesPromise;
    }

    // The favorite list is only needed to paint the stars correctly, so it is
    // fetched once the page is idle instead of on every list view.
    function scheduleFavoritesWarmup() {
      const run = () => {
        if (!destroyed) loadFavorites();
      };

      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 2000 });
        return;
      }

      warmupTimer = setTimeout(run, WARMUP_DELAY_MS);
    }

    function destroy() {
      destroyed = true;
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = null;
      if (warmupTimer) clearTimeout(warmupTimer);
      warmupTimer = null;
      if (observer) observer.disconnect();
      observer = null;
      doc.querySelectorAll('[data-ls-auction-fav]').forEach((star) => {
        star.remove();
      });
    }

    if (!loaded) scheduleFavoritesWarmup();
    scan();
    startObserver();

    return {
      favoriteIds,
      get ready() {
        return loadFavorites();
      },
      scan,
      loadFavorites,
      syncStars,
      destroy,
      isLoaded: () => loaded,
    };
  }

  function start(doc) {
    const documentRef =
      doc || (typeof document !== 'undefined' ? document : null);
    const locationRef =
      root.location || (typeof location !== 'undefined' ? location : null);

    if (!documentRef || !locationRef) return null;
    if (!isAuctionListPath(locationRef.pathname)) return null;
    if (!isLoggedIn(documentRef)) return null;

    let controller = null;
    let stopped = false;

    const create = () => {
      if (stopped || controller) return;
      controller = createController(documentRef, {
        fetchOptions: { baseUrl: locationRef.origin },
      });
    };

    const remove = () => {
      if (!controller) return;
      controller.destroy();
      controller = null;
    };

    const applyEnabled = (enabled) => {
      if (stopped) return;
      if (enabled === false) remove();
      else create();
    };

    const chromeApi = root.chrome;
    if (chromeApi && chromeApi.storage && chromeApi.storage.local) {
      try {
        Promise.resolve(chromeApi.storage.local.get('isEnabled'))
          .then((data) => applyEnabled(!data || data.isEnabled !== false))
          .catch(() => applyEnabled(true));
      } catch {
        applyEnabled(true);
      }
    } else {
      create();
    }

    if (chromeApi && chromeApi.storage && chromeApi.storage.onChanged) {
      chromeApi.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes || !changes.isEnabled) return;
        applyEnabled(changes.isEnabled.newValue !== false);
      });
    }

    if (chromeApi && chromeApi.runtime && chromeApi.runtime.onMessage) {
      chromeApi.runtime.onMessage.addListener((message) => {
        if (message && message.action === 'extensionEnabledChanged') {
          applyEnabled(message.enabled);
        }
      });
    }

    return {
      destroy() {
        stopped = true;
        remove();
      },
      get controller() {
        return controller;
      },
    };
  }

  const api = {
    isAuctionListPath,
    isLoggedIn,
    getPostIdFromRow,
    hasFavoriteControl,
    parseFavoriteIds,
    fetchFavoriteIds,
    createStar,
    setStarState,
    showStatusMessage,
    toggleFavorite,
    createController,
    start,
  };

  if (isCommonJS) {
    module.exports = api;
  } else {
    root.LSAuctionFavorites = api;
    if (typeof document !== 'undefined') {
      start(document);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
