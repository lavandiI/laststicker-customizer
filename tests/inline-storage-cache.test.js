function createChromeMock(initial = {}) {
  const options = { failGet: false };
  const data = { ls_search_storage_migrated: true, ...initial };
  const listeners = [];
  const calls = { get: 0, set: 0, remove: 0 };

  return {
    data,
    calls,
    options,
    listeners,
    storage: {
      local: {
        async get(key) {
          calls.get += 1;
          if (options.failGet) throw new Error('storage unavailable');
          return { [key]: data[key] };
        },
        async set(values) {
          calls.set += 1;
          Object.assign(data, values);
        },
        async remove(key) {
          calls.remove += 1;
          delete data[key];
        },
      },
      onChanged: {
        addListener: (listener) => {
          listeners.push(listener);
        },
      },
    },
    emit(changes) {
      listeners.slice().forEach((listener) => listener(changes, 'local'));
    },
  };
}

const RAW_ONE = JSON.stringify([{ talkId: '1', messageId: '10', text: 'a', partner: 'p' }]);
const RAW_TWO = JSON.stringify([
  { talkId: '1', messageId: '10', text: 'a', partner: 'p' },
  { talkId: '1', messageId: '11', text: 'b', partner: 'p' },
]);

describe('inline-storage message cache', () => {
  let store;
  let chromeMock;

  function load(initial) {
    chromeMock = createChromeMock(initial);
    global.chrome = chromeMock;
    jest.resetModules();
    store = require('../inline-storage');
    return store;
  }

  beforeEach(() => {
    localStorage.clear();
    delete global.chrome;
  });

  afterEach(() => {
    localStorage.clear();
    delete global.chrome;
  });

  test('parses the index once and reuses the array', async () => {
    load({ ls_search_messages: RAW_ONE });

    const first = await store.getMessages();
    const readsAfterFirst = chromeMock.calls.get;
    const second = await store.getMessages();

    expect(first).toHaveLength(1);
    expect(second).toBe(first);
    expect(chromeMock.calls.get).toBe(readsAfterFirst);
  });

  test('keeps loadMessages uncached for paths that must see fresh data', async () => {
    load({ ls_search_messages: RAW_ONE });

    await store.getMessages();
    chromeMock.data.ls_search_messages = RAW_TWO;

    await expect(store.loadMessages()).resolves.toHaveLength(2);
    // The cache still holds what was parsed earlier.
    await expect(store.getMessages()).resolves.toHaveLength(1);
  });

  test('replaces the cache with what was just saved', async () => {
    load({ ls_search_messages: RAW_ONE });
    await store.getMessages();

    const saved = [
      { talkId: '2', messageId: '20', text: 'saved', partner: 'p' },
    ];
    const readsBeforeSave = chromeMock.calls.get;

    await expect(store.saveMessages(saved, {})).resolves.toBe(true);
    const afterSave = await store.getMessages();

    expect(afterSave).toHaveLength(1);
    expect(afterSave[0].text).toBe('saved');
    expect(chromeMock.calls.get).toBe(readsBeforeSave);
  });

  test('drops the cache when the index is cleared', async () => {
    load({ ls_search_messages: RAW_TWO });
    await expect(store.getMessages()).resolves.toHaveLength(2);

    await store.clearMessages();

    await expect(store.getMessages()).resolves.toHaveLength(0);
  });

  test('drops the cache when another context rewrites the index', async () => {
    load({ ls_search_messages: RAW_ONE });
    await expect(store.getMessages()).resolves.toHaveLength(1);

    chromeMock.data.ls_search_messages = RAW_TWO;
    chromeMock.emit({
      ls_search_messages: { newValue: RAW_TWO },
    });

    await expect(store.getMessages()).resolves.toHaveLength(2);
  });

  test('does not cache a failed read', async () => {
    load({ ls_search_messages: RAW_ONE });
    chromeMock.options.failGet = true;

    await expect(store.getMessages()).resolves.toEqual([]);

    chromeMock.options.failGet = false;
    await expect(store.getMessages()).resolves.toHaveLength(1);
  });
});
