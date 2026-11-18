// LastSticker Customizer - filter for the "Ищут" column on collection pages.
// The column contains a main demand count and an optional <sup> marker that
// means the current user is also looking for that sticker. The filter only
// targets that personal marker and does not touch tablesorter's own filters.

(function (root) {
  'use strict';

  const isCommonJS = typeof module !== 'undefined' && module.exports;

  function getHuntColumnIndex(table) {
    if (!table) return -1;

    const headerRow = table.querySelector('thead tr');
    if (!headerRow) return -1;

    const headers = Array.from(headerRow.children);
    return headers.findIndex(
      (header) => (header.textContent || '').replace(/\s+/g, ' ').trim() === 'Ищут',
    );
  }

  function isHuntMarked(cell) {
    if (!cell) return false;
    return Boolean(cell.querySelector('sup')) || cell.classList.contains('i_need');
  }

  function countVisibleRows(rows) {
    return rows.filter((row) => {
      if (row.classList.contains('ls-hunt-hidden')) return false;
      if (row.classList.contains('filtered')) return false;
      if (row.style && row.style.display === 'none') return false;
      return true;
    }).length;
  }

  function getDataRows(table, columnIndex) {
    if (!table || !table.tBodies) return [];

    const rows = [];
    Array.from(table.tBodies).forEach((tbody) => {
      Array.from(tbody.rows || []).forEach((row) => {
        if (row.parentElement !== tbody) return;
        if (row.classList.contains('tablesorter-filter-row')) return;
        if (row.children.length <= columnIndex) return;
        const firstCell = row.children[0];
        if (!firstCell || !(firstCell.textContent || '').trim()) return;
        rows.push(row);
      });
    });
    return rows;
  }

  // The site owns #checklist_count. Remember its text once, so the filter can
  // restore the original string instead of leaving "Показано … из …" behind
  // forever after the extension is disabled.
  const originalCounterText = new WeakMap();

  function captureCounterText(counter) {
    if (!counter) return null;
    if (!originalCounterText.has(counter)) {
      originalCounterText.set(counter, counter.textContent || '');
    }
    return originalCounterText.get(counter);
  }

  /**
   * Total number of stickers from the site's own counter text.
   * Understands "Показано 1–50 из 623" and a bare "623"; anything else is
   * unknown, and the filter then shows the visible count without a total
   * instead of inventing one.
   *
   * @param {string} text
   * @returns {number|null}
   */
  function parseTotal(text) {
    const value = String(text || '');
    const match = /из\s+(\d+)/.exec(value);
    if (match) return parseInt(match[1], 10);

    const plain = value.trim().match(/^(\d+)$/);
    return plain ? parseInt(plain[1], 10) : null;
  }

  function updateCount(doc, visible, total) {
    const counter = doc && doc.getElementById('checklist_count');
    if (!counter) return;

    counter.textContent =
      total == null ? `Показано: ${visible}` : `Показано ${visible} из ${total}`;
  }

  function restoreCount(doc) {
    const counter = doc && doc.getElementById('checklist_count');
    if (!counter || !originalCounterText.has(counter)) return;

    counter.textContent = originalCounterText.get(counter);
    originalCounterText.delete(counter);
  }

  function applyHuntFilter(table, mode, doc) {
    const documentRef = doc || (typeof document !== 'undefined' ? document : null);
    if (!table || !documentRef) return { visible: 0, total: 0 };

    const columnIndex = getHuntColumnIndex(table);
    if (columnIndex < 0) return { visible: 0, total: 0 };

    const rows = getDataRows(table, columnIndex);
    const onlyMine = mode === 'me';

    rows.forEach((row) => {
      const cell = row.children[columnIndex];
      const hide = onlyMine && !isHuntMarked(cell);
      row.classList.toggle('ls-hunt-hidden', hide);
    });

    const counter = documentRef.getElementById('checklist_count');
    const total = parseTotal(captureCounterText(counter));
    const visible = countVisibleRows(rows);

    if (counter) updateCount(documentRef, visible, total);

    return { visible, total: total ?? rows.length };
  }

  /**
   * Insert the "Все / Я ищу" select into the tablesorter filter row.
   *
   * @param {Document} doc
   * @param {{mode?: 'all'|'me', onModeChange?: (mode: string) => void}} [options]
   *   `mode` is used when the control is created again after the site
   *   re-rendered the header; it does not filter anything by itself.
   * @returns {boolean} true when the control exists after the call.
   */
  function initCollectionsFilter(doc, options = {}) {
    const documentRef = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentRef) return false;

    const table = documentRef.getElementById('checklist');
    if (!table) return false;

    const filterRow = table.querySelector('thead tr.tablesorter-filter-row');
    if (!filterRow) return false;

    const columnIndex = getHuntColumnIndex(table);
    if (columnIndex < 0) return false;

    const cell = filterRow.children[columnIndex];
    if (!cell) return false;

    if (cell.querySelector('.ls-customizer-filter')) return true;

    const oldInput = cell.querySelector('input.tablesorter-filter');
    if (oldInput) {
      oldInput.style.display = 'none';
    }

    const select = documentRef.createElement('select');
    select.className = 'ls-customizer-filter';
    select.setAttribute('aria-label', 'Фильтр по столбцу Ищут');
    select.innerHTML =
      '<option value="all">Все</option><option value="me">Я ищу</option>';
    select.value = options.mode === 'me' ? 'me' : 'all';

    select.addEventListener('change', () => {
      if (typeof options.onModeChange === 'function') {
        options.onModeChange(select.value);
      }
      applyHuntFilter(table, select.value, documentRef);
    });

    cell.appendChild(select);
    return true;
  }

  function removeCollectionsFilter(doc) {
    const documentRef = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentRef) return false;

    const table = documentRef.getElementById('checklist');
    if (!table) return false;

    const filterRow = table.querySelector('thead tr.tablesorter-filter-row');
    const columnIndex = getHuntColumnIndex(table);
    const cell =
      filterRow && columnIndex >= 0 ? filterRow.children[columnIndex] : null;

    if (cell) {
      const select = cell.querySelector('.ls-customizer-filter');
      if (select) select.remove();

      const oldInput = cell.querySelector('input.tablesorter-filter');
      if (oldInput) oldInput.style.display = '';
    }

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    rows.forEach((row) => row.classList.remove('ls-hunt-hidden'));

    // Restore the site's own counter text. When the filter was never applied
    // the counter is left untouched, so a disabled extension cannot rewrite it.
    restoreCount(documentRef);
    return true;
  }

  // tablesorter rebuilds the header and its filter row on sorting, resetting
  // filters and on its own re-render, so the select has to be inserted again.
  const SCAN_DELAY_MS = 50;

  function clearHuntMarks(table) {
    if (!table) return;
    Array.from(table.querySelectorAll('tbody tr.ls-hunt-hidden')).forEach((row) => {
      row.classList.remove('ls-hunt-hidden');
    });
  }

  /**
   * Keep the filter control alive for the lifetime of the page.
   *
   * @param {Document} doc
   * @returns {{stop: () => void}|null}
   */
  function start(doc) {
    const documentRef = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentRef) return null;

    let stopped = false;
    let observer = null;
    let scanTimer = null;
    let control = null;
    let mode = 'all';

    function rememberMode(value) {
      mode = value === 'me' ? 'me' : 'all';
    }

    function sync() {
      if (stopped) return;
      if (control && control.isConnected) return;

      const created = initCollectionsFilter(documentRef, {
        mode,
        onModeChange: rememberMode,
      });
      if (!created) return;

      control = documentRef.querySelector('.ls-customizer-filter');
      const table = documentRef.getElementById('checklist');
      if (!table) return;

      // Restore the remembered mode on a freshly rendered control.
      if (mode === 'me') {
        applyHuntFilter(table, mode, documentRef);
      } else {
        clearHuntMarks(table);
      }
    }

    function scheduleSync() {
      if (stopped || scanTimer) return;
      scanTimer = setTimeout(() => {
        scanTimer = null;
        sync();
      }, SCAN_DELAY_MS);
    }

    sync();

    if (typeof MutationObserver !== 'undefined' && documentRef.body) {
      observer = new MutationObserver(scheduleSync);
      observer.observe(documentRef.body, { childList: true, subtree: true });
    }

    return {
      stop() {
        stopped = true;
        if (scanTimer) clearTimeout(scanTimer);
        scanTimer = null;
        if (observer) observer.disconnect();
        observer = null;
        control = null;
      },
    };
  }

  function startWithEnabledState(doc) {
    const documentRef = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentRef) return null;

    let handle = null;
    const enable = () => {
      if (handle) return;
      handle = start(documentRef);
    };
    const disable = () => {
      if (handle) {
        handle.stop();
        handle = null;
      }
      removeCollectionsFilter(documentRef);
    };

    const chromeApi = root.chrome;
    if (chromeApi && chromeApi.storage && chromeApi.storage.local) {
      try {
        Promise.resolve(chromeApi.storage.local.get('isEnabled'))
          .then((data) => {
            if (data && data.isEnabled === false) disable();
            else enable();
          })
          .catch(enable);
      } catch {
        enable();
      }
    } else {
      enable();
    }

    if (chromeApi && chromeApi.storage && chromeApi.storage.onChanged) {
      chromeApi.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes || !changes.isEnabled) return;
        if (changes.isEnabled.newValue === false) disable();
        else enable();
      });
    }

    if (chromeApi && chromeApi.runtime && chromeApi.runtime.onMessage) {
      chromeApi.runtime.onMessage.addListener((message) => {
        if (message && message.action === 'extensionEnabledChanged') {
          if (message.enabled === false) disable();
          else enable();
        }
      });
    }

    return { enable, disable };
  }

  const api = {
    getHuntColumnIndex,
    isHuntMarked,
    countVisibleRows,
    updateCount,
    applyHuntFilter,
    initCollectionsFilter,
    removeCollectionsFilter,
    start,
    startWithEnabledState,
  };

  if (isCommonJS) {
    module.exports = api;
  } else {
    root.LSCollectionsFilter = api;
    if (typeof document !== 'undefined') {
      startWithEnabledState(document);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
