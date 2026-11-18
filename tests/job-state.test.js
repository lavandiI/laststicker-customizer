const jobState = require('../job-state');

function createStorage(initial = {}, options = {}) {
  const data = { ...initial };

  return {
    data,
    async get(key) {
      if (options.failGet) throw new Error('storage unavailable');
      return { [key]: data[key] };
    },
    async set(values) {
      if (options.failSet) throw new Error('storage unavailable');
      Object.assign(data, values);
    },
    async remove(key) {
      if (options.failRemove) throw new Error('storage unavailable');
      delete data[key];
    },
  };
}

describe('job state', () => {
  test('normalizes a dialog job into a record', () => {
    const record = jobState.toRecord({ jobId: 'job-1', source: 'auto', tabId: 7 }, 1000);

    expect(record).toEqual({
      jobId: 'job-1',
      kind: 'dialog',
      source: 'auto',
      tabId: 7,
      postId: '',
      mode: '',
      startedAt: 1000,
    });
  });

  test('keeps the forum identity and falls back to safe defaults', () => {
    const forum = jobState.toRecord(
      { jobId: 5, kind: 'forum', postId: 12, mode: 'update', tabId: 'nope' },
      2000,
    );

    expect(forum.jobId).toBe('5');
    expect(forum.kind).toBe('forum');
    expect(forum.postId).toBe('12');
    expect(forum.mode).toBe('update');
    expect(forum.tabId).toBeNull();

    const unknown = jobState.toRecord({ jobId: 'x', kind: 'weird', source: 'weird' }, 1);
    expect(unknown.kind).toBe('dialog');
    expect(unknown.source).toBe('manual');
  });

  test('detects a stale or unreadable record', () => {
    const now = 10_000_000;

    expect(jobState.isStale(null, now)).toBe(true);
    expect(jobState.isStale({ jobId: 'a' }, now)).toBe(true);
    expect(jobState.isStale({ jobId: 'a', startedAt: 'oops' }, now)).toBe(true);

    expect(
      jobState.isStale(
        { jobId: 'a', startedAt: now - jobState.JOB_TTL_MS + 1000 },
        now,
      ),
    ).toBe(false);
    expect(
      jobState.isStale(
        { jobId: 'a', startedAt: now - jobState.JOB_TTL_MS - 1000 },
        now,
      ),
    ).toBe(true);
  });

  test('writes, reads and clears the record', async () => {
    const storage = createStorage();

    const record = await jobState.write(
      storage,
      { jobId: 'job-1', source: 'manual', tabId: 2 },
      500,
    );

    expect(record.startedAt).toBe(500);
    expect(storage.data[jobState.JOB_KEY].jobId).toBe('job-1');
    await expect(jobState.read(storage)).resolves.toEqual(record);

    await jobState.clear(storage);
    expect(storage.data[jobState.JOB_KEY]).toBeUndefined();
    await expect(jobState.read(storage)).resolves.toBeNull();
  });

  test('survives storage failures instead of throwing', async () => {
    await expect(
      jobState.write(createStorage({}, { failSet: true }), { jobId: 'x' }),
    ).resolves.toBeNull();
    await expect(
      jobState.read(createStorage({}, { failGet: true })),
    ).resolves.toBeNull();
    await expect(
      jobState.clear(createStorage({}, { failRemove: true })),
    ).resolves.toBeUndefined();
  });

  test('ignores a missing storage area', async () => {
    await expect(jobState.write(null, { jobId: 'x' })).resolves.toBeNull();
    await expect(jobState.read(undefined)).resolves.toBeNull();
    await expect(jobState.clear(null)).resolves.toBeUndefined();
  });
});
