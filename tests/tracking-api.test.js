const api = require('../tracking-api.js');

function response(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => payload,
  };
}

describe('tracking API', () => {
  test('normalizes Russian Post history', () => {
    const result = api.normalizePochta(
      {
        detailedTrackings: [
          {
            trackingItem: {
              commonStatus: 'В пути',
              lastOperationDateTime: '2026-11-05T10:00:00+03:00',
              trackingHistoryItemList: [
                {
                  date: '2026-11-04T09:00:00+03:00',
                  humanStatus: 'Принято',
                  cityName: 'Москва',
                  index: '101000',
                },
                {
                  date: '2026-11-05T10:00:00+03:00',
                  humanStatus: 'Сортировка',
                  cityName: 'Минск',
                  index: '220000',
                },
              ],
            },
          },
        ],
      },
      'RA644000001RU',
    );

    expect(result.operator).toBe('pochta');
    expect(result.number).toBe('RA644000001RU');
    expect(result.status).toBe('В пути');
    expect(result.events.map((event) => event.status)).toEqual(['Сортировка', 'Принято']);
  });

  test('normalizes Belpost history', () => {
    const result = api.normalizeBelpost(
      {
        data: [
          {
            steps: [
              {
                created_at: '2026-11-04 09:00:00',
                event: 'Принято',
                place: 'Минск',
                place_index: '220000',
              },
              {
                created_at: '2026-11-05 10:00:00',
                event: 'Вручено',
                place: 'Борисов',
                place_index: '222120',
              },
            ],
          },
        ],
      },
      'RR123456789BY',
    );

    expect(result.operator).toBe('belpost');
    expect(result.status).toBe('Вручено');
    expect(result.events.map((event) => event.place)).toEqual(['Борисов', 'Минск']);
  });

  test('requests the Russian Post endpoint and returns normalized data', async () => {
    const fetchMock = jest.fn(async () =>
      response(200, {
        detailedTrackings: [
          {
            trackingItem: {
              commonStatus: 'В пути',
              trackingHistoryItemList: [
                {
                  date: '2026-11-05T10:00:00+03:00',
                  humanStatus: 'Сортировка',
                  cityName: 'Москва',
                  index: '101000',
                },
              ],
            },
          },
        ],
      }),
    );

    const result = await api.fetchPochtaTracking('RA644000001RU', fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('track-numbers=RA644000001RU'),
      expect.any(Object),
    );
    expect(result.status).toBe('В пути');
  });

  test('requests the Belpost endpoint with JSON body', async () => {
    const fetchMock = jest.fn(async () =>
      response(200, {
        data: [
          {
            steps: [
              {
                created_at: '2026-11-05 10:00:00',
                event: 'Вручено',
                place: 'Борисов',
                place_index: '222120',
              },
            ],
          },
        ],
      }),
    );

    const result = await api.fetchBelpostTracking('RR123456789BY', fetchMock);
    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe('https://api.belpost.by/api/v1/tracking');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      number: 'RR123456789BY',
      show_order: true,
    });
    expect(result.status).toBe('Вручено');
  });

  test('maps rate limits and missing shipments to stable codes', async () => {
    await expect(
      api.fetchPochtaTracking('RA644000001RU', async () => response(429, {})),
    ).rejects.toMatchObject({ code: 'rate_limited' });

    await expect(
      api.fetchBelpostTracking('RR123456789BY', async () => response(404, {})),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
