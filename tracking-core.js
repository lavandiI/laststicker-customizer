// LastSticker Search - shared tracking number helpers.

(function (root) {
  'use strict';

  const MATCH_RE = /(?<![A-Z0-9])(?:[A-Z]{2}\d{9}[A-Z]{2}|\d{14}|\d{13})(?![A-Z0-9])/gi;

  function normalizeNumber(value) {
    return String(value || '')
      .replace(/[\s-]/g, '')
      .toUpperCase();
  }

  function detectOperator(value, context, standalone) {
    const number = normalizeNumber(value);

    if (/^[A-Z]{2}\d{9}BY$/.test(number)) return 'belpost';
    if (/^[A-Z]{2}\d{9}RU$/.test(number)) return 'pochta';
    if (/^\d{14}$/.test(number)) return 'pochta';
    if (/^\d{13}$/.test(number)) {
      return standalone || /белпочт|belpost|\bBY\b/i.test(String(context || '')) ? 'belpost' : null;
    }

    return null;
  }

  function findMatches(text) {
    const source = String(text || '');
    const matches = [];
    const standalone = source.trim().length > 0;
    MATCH_RE.lastIndex = 0;

    let match;
    while ((match = MATCH_RE.exec(source))) {
      const value = normalizeNumber(match[0]);
      const start = match.index;
      const end = start + match[0].length;
      const context = source.slice(Math.max(0, start - 80), Math.min(source.length, end + 80));
      const isWholeText =
        standalone && source.slice(0, start).trim() === '' && source.slice(end).trim() === '';
      const operator = detectOperator(value, context, isWholeText);

      if (operator) {
        matches.push({ value, operator, start, end });
      }
    }

    return matches;
  }

  function officialUrl(number, operator) {
    const normalized = normalizeNumber(number);
    if (operator === 'belpost') {
      return `https://belpost.by/Otsleditotpravleniye?number=${encodeURIComponent(normalized)}`;
    }
    return `https://www.pochta.ru/tracking?barcode=${encodeURIComponent(normalized)}`;
  }

  function operatorLabel(operator) {
    return operator === 'belpost' ? 'Белпочта' : 'Почта России';
  }

  function formatEventDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).trim();

    try {
      return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return String(value).trim();
    }
  }

  const api = {
    normalizeNumber,
    detectOperator,
    findMatches,
    officialUrl,
    operatorLabel,
    formatEventDate,
  };

  root.LSTrackingCore = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
