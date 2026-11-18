const core = require('../theme-core.js');
const store = require('../theme-store.js');

function createChromeMock(initial = {}, options = {}) {
  const data = { ...initial };
  const listeners = [];
  const setCalls = [];

  return {
    storage: {
      local: {
        async get(key) {
          if (options.failGet) throw new Error('storage unavailable');
          if (typeof key === 'string') return { [key]: data[key] };
          return { ...data };
        },
        async set(values) {
          if (options.failSet) throw new Error('storage unavailable');
          setCalls.push(values);
          Object.assign(data, values);
        },
      },
      onChanged: {
        addListener(listener) {
          listeners.push(listener);
        },
        removeListener(listener) {
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        },
      },
    },
    emit(changes) {
      listeners.slice().forEach((listener) => listener(changes, 'local'));
    },
    listeners,
    setCalls,
    data,
  };
}

describe('theme store', () => {
  beforeEach(() => {
    localStorage.clear();
    delete global.chrome;
  });

  afterEach(() => {
    delete global.chrome;
  });

  test('loads defaults when storage is empty', async () => {
    global.chrome = createChromeMock();

    await expect(store.loadTheme()).resolves.toEqual(core.DEFAULT_THEME);
  });

  test('normalizes invalid stored values', async () => {
    global.chrome = createChromeMock({
      [core.THEME_KEY]: { enabled: 'yes', palette: 'purple' },
    });

    const theme = await store.loadTheme();
    expect(theme.enabled).toBe(false);
    expect(theme.palette).toBe('graphite');
  });

  test('saves a partial update and keeps the other settings', async () => {
    const chromeMock = createChromeMock({
      [core.THEME_KEY]: {
        enabled: true,
        palette: 'graphite',
        images: 'off',
      },
    });
    global.chrome = chromeMock;

    const next = await store.saveTheme({ palette: 'black' });

    expect(next.enabled).toBe(true);
    expect(next.palette).toBe('black');
    expect(chromeMock.data[core.THEME_KEY]).toEqual(next);
  });

  test('uses the given base instead of re-reading storage', async () => {
    // Storage still holds the defaults/empty state; the popup knows better.
    const chromeMock = createChromeMock({}, { failGet: true });
    global.chrome = chromeMock;

    const next = await store.saveTheme(
      { palette: 'sapphire' },
      { enabled: true, palette: 'graphite', images: 'soft' },
    );

    expect(next.enabled).toBe(true);
    expect(next.palette).toBe('sapphire');
    expect(next.images).toBe('soft');
    expect(chromeMock.data[core.THEME_KEY]).toEqual(next);
  });

  test('rejects instead of writing defaults when the storage read fails', async () => {
    const chromeMock = createChromeMock({}, { failGet: true });
    global.chrome = chromeMock;

    await expect(store.saveTheme({ images: 'strong' })).rejects.toThrow(
      'storage unavailable',
    );
    expect(chromeMock.setCalls).toHaveLength(0);
    expect(chromeMock.data[core.THEME_KEY]).toBeUndefined();
  });

  test('still falls back to defaults when the theme is only read', async () => {
    global.chrome = createChromeMock({}, { failGet: true });

    await expect(store.loadTheme()).resolves.toEqual(core.DEFAULT_THEME);
  });

  test('falls back to localStorage without chrome.storage', async () => {
    await store.saveTheme({ enabled: true, palette: 'black' });

    const theme = await store.loadTheme();
    expect(theme.enabled).toBe(true);
    expect(theme.palette).toBe('black');
    expect(JSON.parse(localStorage.getItem(core.THEME_KEY)).enabled).toBe(true);
  });

  test('notifies about theme changes only', () => {
    const chromeMock = createChromeMock();
    global.chrome = chromeMock;
    const callback = jest.fn();

    const unsubscribe = store.onThemeChanged(callback);

    chromeMock.emit({ another_key: { newValue: true } });
    chromeMock.emit({
      [core.THEME_KEY]: { newValue: { enabled: true } },
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0].enabled).toBe(true);

    unsubscribe();
    expect(chromeMock.listeners).toHaveLength(0);
  });

  test('writes and reads the synchronous cache', () => {
    store.writeThemeCache({ enabled: true, palette: 'black' }, 'dark');

    const cached = store.readThemeCache();
    expect(cached.resolved).toBe('dark');
    expect(cached.theme.enabled).toBe(true);
    expect(cached.theme.palette).toBe('black');
  });

  test('ignores cache entries without a valid resolved theme', () => {
    localStorage.setItem(
      core.THEME_CACHE_KEY,
      JSON.stringify({ theme: { enabled: true }, resolved: 'sepia' }),
    );

    expect(store.readThemeCache()).toBeNull();
  });
});
