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

  function readTotal(doc) {
    const counter = doc && doc.getElementById('checklist_count');
    if (!counter) return null;
    const match = /из\s+(\d+)/.exec(counter.textContent || '');
    return match ? parseInt(match[1], 10) : null;
  }

  function updateCount(doc, visible, total) {
    const counter = doc && doc.getElementById('checklist_count');
    if (counter) {
      counter.textContent = `Показано ${visible} из ${total}`;
    }
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

    const total = readTotal(documentRef) || rows.length;
    const visible = countVisibleRows(rows);
    updateCount(documentRef, visible, total);
    return { visible, total };
  }

  function initCollectionsFilter(doc) {
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

    select.addEventListener('change', () => {
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

    const total = readTotal(documentRef) || rows.length;
    updateCount(documentRef, rows.length, total);
    return true;
  }

  function start(doc) {
    const documentRef = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentRef) return null;

    let stopped = false;
    let attempts = 0;
    const tick = () => {
      if (stopped) return;
      if (initCollectionsFilter(documentRef) || attempts >= 100) return;
      attempts += 1;
      setTimeout(tick, 50);
    };

    tick();

    return {
      stop() {
        stopped = true;
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
