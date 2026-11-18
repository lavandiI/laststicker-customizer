const fs = require('fs');
const path = require('path');

const talkFixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'talk-page.html'),
  'utf8',
);

const listFixture = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="content">
  <div class="big_text"><a href="/users/my_talks/hide/">Архив</a></div>
  <table id="talks_table">
    <tr id="talk_41292">
      <td><a href="/users/100/">Анна</a></td>
      <td>3 / 3</td>
    </tr>
  </table>
</div>
<script>req.send("uid=55555&c=abc123")</script>
</body></html>`;

const hideFixture = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="content"><table id="talks_table"></table></div>
</body></html>`;

let store;
let sentMessages;
let unreadCount;
let fetchedUrls;

function createChromeMock() {
  const messageListeners = [];

  return {
    messageListeners,
    storage: {
      local: {
        get: async (keys) => {
          if (Array.isArray(keys)) {
            const result = {};
            keys.forEach((key) => {
              if (store[key] !== undefined) result[key] = store[key];
            });
            return result;
          }
          if (typeof keys === 'string') {
            return store[keys] !== undefined ? { [keys]: store[keys] } : {};
          }
          return { ...store };
        },
        set: async (values) => {
          Object.assign(store, values);
        },
        remove: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          list.forEach((key) => delete store[key]);
        },
        getBytesInUse: async (key) => {
          const raw = store[key] || '';
          return Buffer.byteLength(String(raw), 'utf8');
        },
      },
    },
    action: {
      setBadgeText: () => {},
      setBadgeBackgroundColor: () => {},
    },
    runtime: {
      lastError: undefined,
      sendMessage: (message, callback) => {
        sentMessages.push(message);
        if (callback) callback({ started: true });
      },
      onMessage: {
        addListener: (listener) => {
          messageListeners.push(listener);
        },
      },
    },
  };
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

async function runIndex(source = 'manual') {
  let resolveFinished;
  const finished = new Promise((resolve) => {
    resolveFinished = resolve;
  });

  global.chrome.runtime.sendMessage = (message, callback) => {
    sentMessages.push(message);
    if (message.action === 'indexFinished') {
      resolveFinished(message.result);
    }
    if (callback) callback({ started: true });
  };

  global.indexer.startIndex({ jobId: `test-${source}`, source });
  const result = await finished;
  return result;
}

describe('offscreen indexer', () => {
  beforeEach(() => {
    jest.resetModules();
    store = {};
    sentMessages = [];
    unreadCount = 0;
    fetchedUrls = [];

    const chrome = createChromeMock();
    global.chrome = chrome;
    window.chrome = chrome;

    global.fetch = jest.fn(async (url) => {
      const href = String(url);
      fetchedUrls.push(href);

      if (href.includes('user_new_msg.php')) {
        return response(JSON.stringify({ answer: 'y', new_msg_cnt: String(unreadCount) }));
      }
      if (href.includes('/users/my_talks/hide/')) {
        return response(hideFixture);
      }
      if (/\/users\/my_talks\/41292\/page\d+\//.test(href)) {
        return response('<!doctype html><html><body><div id="content"></div></body></html>');
      }
      if (href.includes('/users/my_talks/41292/')) {
        return response(talkFixture);
      }
      if (href.includes('/users/my_talks/')) {
        return response(listFixture);
      }
      return response('', 404);
    });

    require('../inline-storage');
    require('../parser');
    require('../fetch-retry');
    global.InlineStorage = window.InlineStorage;
    global.LSParser = window.LSParser;
    global.LSFetch = globalThis.LSFetch;
    global.indexer = require('../indexer');
  });

  test('indexes messages and marks a complete index', async () => {
    const result = await runIndex('manual');

    expect(result.addedCount).toBe(6);
    expect(result.messagesCount).toBe(6);
    expect(result.dialogsCount).toBe(1);
    expect(result.fullIndex).toBe(true);
    expect(JSON.parse(store.ls_search_messages)).toHaveLength(6);
    expect(store.ls_search_full_index_at).toBeTruthy();
  });

  test('skips auto refresh when there are unread messages', async () => {
    unreadCount = 2;
    store.ls_search_auto_enabled = '1';
    store.ls_search_full_index_at = String(Date.now());
    store.ls_search_last_indexed_at = String(Date.now());

    const result = await runIndex('auto');

    expect(result.skipped).toBe(true);
    expect(result.reason).toContain('непрочитанные');
    expect(fetchedUrls.some((url) => url.includes('/users/my_talks/41292/'))).toBe(false);
    expect(store.ls_search_messages).toBeUndefined();
  });

  test('skips auto refresh when there is no complete index', async () => {
    store.ls_search_auto_enabled = '1';

    const result = await runIndex('auto');

    expect(result.skipped).toBe(true);
    expect(result.reason).toContain('полного индекса');
  });

  test('removes inline handlers and scripts before parsing', () => {
    const cleaned = global.indexer.sanitizeHtml(
      '<tr onClick="go_talk(1)"><td onclick=alert(1)>ok</td></tr><script>alert(2)</script>',
    );

    expect(cleaned).not.toContain('onClick');
    expect(cleaned).not.toContain('onclick');
    expect(cleaned).not.toContain('<script');
    expect(cleaned).toContain('ok');
  });

  test('does not save an index after storage was cleared during indexing', async () => {
    let releaseTalk;
    let markTalkStarted;
    const talkGate = new Promise((resolve) => {
      releaseTalk = resolve;
    });
    const talkStarted = new Promise((resolve) => {
      markTalkStarted = resolve;
    });

    const baseFetch = global.fetch;
    global.fetch = jest.fn(async (url) => {
      const href = String(url);
      if (
        href.includes('/users/my_talks/41292/') &&
        !/\/page\d+\//.test(href)
      ) {
        markTalkStarted();
        await talkGate;
      }
      return baseFetch(href);
    });

    const pending = runIndex('manual');
    await talkStarted;
    await window.InlineStorage.clearMessages();
    releaseTalk();

    const result = await pending;

    expect(result.error).toContain('очищен');
    expect(store.ls_search_messages).toBeUndefined();
  });

  test('reports how many messages were collected when the index cannot be saved', async () => {
    const originalSave = window.InlineStorage.saveMessages;
    window.InlineStorage.saveMessages = async () => false;

    try {
      const result = await runIndex('manual');

      expect(result.error).toContain('Не удалось сохранить индекс');
      expect(result.error).toContain('собрано 6 сообщений');
      expect(result.error).toContain('Освободите место');
      // Nothing was written, but the previously saved index is untouched.
      expect(store.ls_search_messages).toBeUndefined();
      expect(store.ls_search_full_index_at).toBeUndefined();
    } finally {
      window.InlineStorage.saveMessages = originalSave;
    }
  });

  test('does not report a failure when only the full-index flag was not saved', async () => {
    const original = window.InlineStorage.saveFullIndexAt;
    window.InlineStorage.saveFullIndexAt = async () => {
      throw new Error('QuotaExceededError');
    };

    try {
      const result = await runIndex('manual');

      expect(result.error).toBeUndefined();
      expect(result.fullIndex).toBe(true);
      expect(JSON.parse(store.ls_search_messages)).toHaveLength(6);
      expect(store.ls_search_full_index_at).toBeUndefined();
    } finally {
      window.InlineStorage.saveFullIndexAt = original;
    }
  });

  test('still saves the index when the auto-update report fails', async () => {
    store.ls_search_auto_enabled = '1';
    store.ls_search_full_index_at = String(Date.now());
    store.ls_search_last_indexed_at = String(Date.now());

    const original = window.InlineStorage.saveAutoMeta;
    window.InlineStorage.saveAutoMeta = async () => {
      throw new Error('QuotaExceededError');
    };

    try {
      const result = await runIndex('auto');

      expect(result.error).toBeUndefined();
      expect(JSON.parse(store.ls_search_messages)).toHaveLength(6);
    } finally {
      window.InlineStorage.saveAutoMeta = original;
    }
  });

  test('answers a ping so a restarted service worker can verify the job', () => {
    const [listener] = global.chrome.messageListeners;
    let response = null;

    listener(
      { target: 'offscreen', action: 'pingIndex', jobId: 'job-1' },
      {},
      (value) => {
        response = value;
      },
    );

    expect(response).toEqual({ running: false, jobId: null });
  });

  test('reports the running job id on a ping', async () => {
    let releaseTalk;
    let markTalkStarted;
    const talkGate = new Promise((resolve) => {
      releaseTalk = resolve;
    });
    const talkStarted = new Promise((resolve) => {
      markTalkStarted = resolve;
    });

    const baseFetch = global.fetch;
    global.fetch = jest.fn(async (url) => {
      const href = String(url);
      if (
        href.includes('/users/my_talks/41292/') &&
        !/\/page\d+\//.test(href)
      ) {
        markTalkStarted();
        await talkGate;
      }
      return baseFetch(href);
    });

    const pending = runIndex('manual');
    await talkStarted;

    const [listener] = global.chrome.messageListeners;
    let response = null;
    listener(
      { target: 'offscreen', action: 'pingIndex', jobId: 'test-manual' },
      {},
      (value) => {
        response = value;
      },
    );

    expect(response).toEqual({ running: true, jobId: 'test-manual' });

    releaseTalk();
    await pending;
  });

  test('keeps the service worker alive while indexing', async () => {
    const stop = jest.fn();
    const start = jest.fn(() => ({ stop }));
    global.LSKeepalive = { start };

    try {
      await runIndex('manual');

      expect(start).toHaveBeenCalledWith({
        action: 'indexHeartbeat',
        payload: { jobId: 'test-manual', kind: 'dialog' },
      });
      expect(stop).toHaveBeenCalled();
    } finally {
      delete global.LSKeepalive;
    }
  });

  test('runs auto refresh when there are no unread messages', async () => {
    store.ls_search_auto_enabled = '1';
    store.ls_search_full_index_at = String(Date.now());
    store.ls_search_last_indexed_at = String(Date.now());

    const result = await runIndex('auto');

    expect(result.skipped).toBeUndefined();
    expect(result.addedCount).toBe(6);
    expect(JSON.parse(store.ls_search_messages)).toHaveLength(6);
  });
});
