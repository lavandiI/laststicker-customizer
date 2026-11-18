const auto = require('../auto-update');

describe('auto update decisions', () => {
  test('treats a missing switch as enabled', () => {
    expect(auto.isAutoEnabled(undefined)).toBe(true);
    expect(auto.isAutoEnabled('1')).toBe(true);
    expect(auto.isAutoEnabled(true)).toBe(true);
  });

  test('respects both stored spellings of "off"', () => {
    expect(auto.isAutoEnabled('0')).toBe(false);
    expect(auto.isAutoEnabled(false)).toBe(false);
  });

  test('reads the scheduler report tolerantly', () => {
    expect(auto.parseAutoMeta(null)).toEqual({});
    expect(auto.parseAutoMeta('')).toEqual({});
    expect(auto.parseAutoMeta('{broken')).toEqual({});
    expect(auto.parseAutoMeta('[1,2]')).toEqual({});
    expect(auto.parseAutoMeta('{"lastRun":5}')).toEqual({ lastRun: 5 });
  });

  test('schedules the alarm only for a complete index with the switch on', () => {
    expect(auto.shouldSchedule({ enabled: true, full: true })).toBe(true);
    expect(auto.shouldSchedule({ enabled: true, full: false })).toBe(false);
    expect(auto.shouldSchedule({ enabled: false, full: true })).toBe(false);
    expect(auto.shouldSchedule(null)).toBe(false);
  });

  test('runs when nothing has ever been attempted', () => {
    const hour = auto.AUTO_INTERVAL_MINUTES * 60 * 1000;

    expect(auto.isDue({}, 0, hour, 1_000_000)).toBe(true);
  });

  test('waits for the full interval since the newest attempt', () => {
    const interval = 60_000;
    const now = 1_000_000;

    expect(auto.isDue({ lastRun: now - 30_000 }, 0, interval, now)).toBe(false);
    expect(auto.isDue({ lastRun: now - 60_000 }, 0, interval, now)).toBe(true);
    expect(
      auto.isDue({ lastRun: now - 90_000, lastCheck: now - 10_000 }, 0, interval, now),
    ).toBe(false);
    expect(auto.isDue({}, now - 10_000, interval, now)).toBe(false);
  });

  test('keeps an existing complete-index flag untouched', () => {
    expect(
      auto.resolveFullIndexFlag({
        fullIndexAt: '1700000000000',
        lastIndexedAt: '1700000000000',
        messagesRaw: '[]',
      }),
    ).toEqual({ full: true, flag: null });
  });

  test('does not invent a complete index', () => {
    expect(auto.resolveFullIndexFlag({})).toEqual({ full: false, flag: null });
    expect(
      auto.resolveFullIndexFlag({ lastIndexedAt: '1700', messagesRaw: '[]' }),
    ).toEqual({ full: false, flag: null });
    expect(
      auto.resolveFullIndexFlag({
        lastIndexedAt: '1700',
        messagesRaw: '{broken',
      }),
    ).toEqual({ full: false, flag: null });
    expect(
      auto.resolveFullIndexFlag({
        lastIndexedAt: '1700',
        messagesRaw: '{"a":1}',
      }),
    ).toEqual({ full: false, flag: null });
  });

  test('upgrades an existing index to a complete one', () => {
    expect(
      auto.resolveFullIndexFlag({
        lastIndexedAt: '1700',
        messagesRaw: '[{"text":"a"}]',
      }),
    ).toEqual({ full: true, flag: '1700' });
  });

  test('builds a dialog result record', () => {
    const record = auto.buildResultRecord(
      { jobId: 'job-1', kind: 'dialog', source: 'manual', tabId: 7 },
      { addedCount: 2, errors: ['first'], indexedAt: 1000 },
      500,
    );

    expect(record).toEqual({
      jobId: 'job-1',
      kind: 'dialog',
      source: 'manual',
      tabId: 7,
      postId: '',
      finishedAt: 500,
      result: { addedCount: 2, errors: ['first'], indexedAt: 1000 },
    });
    expect(record.error).toBeUndefined();
  });

  test('builds a forum record and keeps the error', () => {
    const record = auto.buildResultRecord(
      { jobId: 9, kind: 'forum', postId: 12, source: 'auto' },
      { error: 'Индекс очищен во время индексации', errors: [] },
      100,
    );

    expect(record.jobId).toBe('9');
    expect(record.kind).toBe('forum');
    expect(record.postId).toBe('12');
    expect(record.source).toBe('auto');
    expect(record.tabId).toBeNull();
    expect(record.error).toBe('Индекс очищен во время индексации');
  });

  test('caps the stored errors and survives a non-array', () => {
    const errors = Array.from({ length: 30 }, (_, index) => `error ${index}`);

    const capped = auto.buildResultRecord({ jobId: 'j' }, { errors });
    expect(capped.result.errors).toHaveLength(auto.RESULT_MAX_ERRORS);
    expect(capped.result.errors[0]).toBe('error 0');

    const broken = auto.buildResultRecord({ jobId: 'j' }, { errors: 'nope' });
    expect(broken.result.errors).toEqual([]);
  });
});
