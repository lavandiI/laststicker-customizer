// LastSticker Search - tracking API clients for Russian Post and Belpost.

(function (root) {
  'use strict';

  const core =
    root.LSTrackingCore || (typeof require === 'function' ? require('./tracking-core.js') : null);

  const TRACKING_ORIGINS = ['https://www.pochta.ru/*', 'https://api.belpost.by/*'];

  function trackingError(code, message) {
    const error = new Error(message || code);
    error.code = code;
    return error;
  }

  function dateValue(value) {
    const timestamp = new Date(value || 0).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function sortEvents(events) {
    return events.slice().sort(function newestFirst(a, b) {
      return dateValue(b.date) - dateValue(a.date);
    });
  }

  function normalizePochta(data, number) {
    const item =
      data &&
      data.detailedTrackings &&
      data.detailedTrackings[0] &&
      data.detailedTrackings[0].trackingItem;

    if (!item) {
      throw trackingError('not_found', 'Отправление не найдено');
    }

    const history = Array.isArray(item.trackingHistoryItemList) ? item.trackingHistoryItemList : [];
    const future = Array.isArray(item.futurePathList) ? item.futurePathList : [];

    let events = history.filter(Boolean).map(function mapHistory(event) {
      return {
        date: event.date || '',
        status: event.humanStatus || event.humanOperationStatus || '',
        place: event.cityName || event.description || '',
        index: event.index || '',
        planned: false,
      };
    });

    if (!events.length) {
      events = future.filter(Boolean).map(function mapFuture(event) {
        return {
          date: event.date || '',
          status: event.humanStatus || '',
          place: event.cityName || event.description || '',
          index: event.index || '',
          planned: true,
        };
      });
    }

    events = sortEvents(events);

    return {
      operator: 'pochta',
      number: core.normalizeNumber(number),
      status: item.commonStatus || item.globalStatus || (events[0] ? events[0].status : ''),
      updatedAt:
        item.lastOperationDateTime ||
        (
          events.find(function actual(event) {
            return !event.planned;
          }) || {}
        ).date ||
        '',
      events,
    };
  }

  function normalizeBelpost(data, number) {
    const item = data && data.data && data.data[0];
    if (!item) {
      throw trackingError('not_found', 'Отправление не найдено');
    }

    let events = Array.isArray(item.steps)
      ? item.steps.filter(Boolean).map(function mapStep(step) {
          return {
            date: step.created_at || '',
            status: step.event || '',
            place: step.place || '',
            index: step.place_index || '',
            planned: false,
          };
        })
      : [];

    events = sortEvents(events);

    return {
      operator: 'belpost',
      number: core.normalizeNumber(number),
      status: events[0] ? events[0].status : 'Маршрут пока не обновлялся',
      updatedAt: events[0] ? events[0].date : '',
      events,
    };
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch {
      throw trackingError('tracking_failed', 'Некорректный ответ сервиса');
    }
  }

  async function fetchPochtaTracking(number, fetchImpl) {
    const fetchFn = fetchImpl || fetch;
    const normalized = core.normalizeNumber(number);
    const url = `https://www.pochta.ru/api/tracking/api/v1/trackings/by-barcodes?language=ru&track-numbers=${encodeURIComponent(
      normalized,
    )}`;

    const response = await fetchFn(url, {
      headers: { Accept: 'application/json' },
    });

    if (response.status === 429) {
      throw trackingError('rate_limited', 'Слишком много запросов');
    }
    if (response.status === 400 || response.status === 404) {
      throw trackingError('not_found', 'Отправление не найдено');
    }
    if (!response.ok) {
      throw trackingError('tracking_failed', 'Сервис временно недоступен');
    }

    return normalizePochta(await readJson(response), normalized);
  }

  async function fetchBelpostTracking(number, fetchImpl) {
    const fetchFn = fetchImpl || fetch;
    const normalized = core.normalizeNumber(number);

    const response = await fetchFn('https://api.belpost.by/api/v1/tracking', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        hl: 'ru',
        platform: 'web',
      },
      body: JSON.stringify({ number: normalized, show_order: true }),
    });

    if (response.status === 429) {
      throw trackingError('rate_limited', 'Слишком много запросов');
    }
    if (response.status === 400 || response.status === 404) {
      throw trackingError('not_found', 'Отправление не найдено');
    }
    if (!response.ok) {
      throw trackingError('tracking_failed', 'Сервис временно недоступен');
    }

    return normalizeBelpost(await readJson(response), normalized);
  }

  function fetchTracking(operator, number, options) {
    const settings = options || {};
    return operator === 'belpost'
      ? fetchBelpostTracking(number, settings.fetchImpl)
      : fetchPochtaTracking(number, settings.fetchImpl);
  }

  const api = {
    TRACKING_ORIGINS,
    trackingError,
    normalizePochta,
    normalizeBelpost,
    fetchPochtaTracking,
    fetchBelpostTracking,
    fetchTracking,
  };

  root.LSTrackingApi = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
