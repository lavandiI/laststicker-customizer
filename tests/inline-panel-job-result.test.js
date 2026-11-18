function createStorageMock(messages = []) {
  const loadMessages = jest.fn(async () => messages);

  return {
    loadMessages,
    getMessages: loadMessages,
    getStats: jest.fn(() => ({
      dialogsCount: 1,
      partnersCount: 1,
      messagesCount: messages.length,
    })),
    loadLastIndexedAt: jest.fn(async () => 123),
    getIndexBytes: jest.fn(async () => 1024),
    loadAutoEnabled: jest.fn(async () => true),
    ensureFullIndexFlag: jest.fn(async () => true),
    loadAutoMeta: jest.fn(async () => ({})),
    saveAutoEnabled: jest.fn(async () => {}),
  };
}

function createUiMock() {
  return {
    renderStats: jest.fn(),
    renderLastIndexedAt: jest.fn(),
    renderIndexSize: jest.fn(),
    renderIndexErrors: jest.fn(),
    clearIndexErrors: jest.fn(),
    showStatus: jest.fn(),
    renderEmptyState: jest.fn(),
    hideStaleBanner: jest.fn(),
    showForumStatus: jest.fn(),
    renderForumErrors: jest.fn(),
    renderForumStats: jest.fn(),
    renderForumLastIndexedAt: jest.fn(),
    renderForumEmptyState: jest.fn(),
  };
}

describe('inline panel job result', () => {
  let panel;
  let storageListeners;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();

    storageListeners = [];
    window.InlineStorage = createStorageMock([{ text: 'a' }, { text: 'b' }]);
    window.InlineUI = createUiMock();
    window.chrome = {
      runtime: {
        lastError: undefined,
        sendMessage: (message, callback) => {
          if (callback) {
            callback({ result: { messagesCount: 0, topicsCount: 0, topic: null } });
          }
        },
      },
      storage: {
        onChanged: {
          addListener: (listener) => {
            storageListeners.push(listener);
          },
        },
      },
    };

    panel = require('../inline-panel');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllTimers();
    delete window.chrome;
  });

  test('renders a dialog job result and reports the status', async () => {
    await panel.applyIndexResult({
      jobId: 'job-1',
      addedCount: 5,
      skippedTalks: 2,
      indexedAt: 1000,
      errors: [],
    });

    expect(window.InlineUI.renderStats).toHaveBeenCalledWith({
      dialogsCount: 1,
      partnersCount: 1,
      messagesCount: 2,
    });
    expect(window.InlineUI.renderLastIndexedAt).toHaveBeenCalledWith(1000);
    expect(window.InlineUI.clearIndexErrors).toHaveBeenCalled();
    expect(window.InlineUI.showStatus).toHaveBeenCalledWith(
      'Добавлено 5 сообщений; пропущено 2 без изменений',
      'success',
    );
  });

  test('ignores the second delivery of the same job', async () => {
    const result = { jobId: 'job-2', addedCount: 1, errors: [] };

    await panel.applyIndexResult(result);
    await panel.applyIndexResult(result);

    expect(window.InlineUI.renderStats).toHaveBeenCalledTimes(1);
    expect(window.InlineUI.showStatus).toHaveBeenCalledTimes(1);
  });

  test('applies a job that finished while the worker was restarting', async () => {
    await panel.handleJobResultRecord({
      kind: 'dialog',
      jobId: 'job-3',
      result: { jobId: 'job-3', addedCount: 2, errors: [] },
    });

    expect(window.InlineUI.showStatus).toHaveBeenCalledWith(
      expect.stringContaining('Добавлено 2'),
      'success',
    );
  });

  test('shows an error written for a finished job', async () => {
    await panel.handleJobResultRecord({
      kind: 'dialog',
      jobId: 'job-4',
      error: 'Индекс очищен во время индексации',
    });

    expect(window.InlineUI.showStatus).toHaveBeenCalledWith(
      'Ошибка индексации: Индекс очищен во время индексации',
      'error',
    );
    expect(window.InlineUI.renderStats).not.toHaveBeenCalled();
  });

  test('ignores a forum job that belongs to another topic', async () => {
    await panel.handleJobResultRecord({
      kind: 'forum',
      postId: '777',
      result: { jobId: 'forum-1', messageCount: 3 },
    });

    expect(window.InlineUI.showForumStatus).not.toHaveBeenCalled();
  });

  test('applies a forum job for the current page', async () => {
    await panel.handleJobResultRecord({
      kind: 'forum',
      postId: '',
      result: { jobId: 'forum-2', noChanges: true },
    });

    expect(window.InlineUI.showForumStatus).toHaveBeenCalledWith(
      'Новых сообщений нет',
      'success',
    );
    expect(window.InlineUI.renderForumErrors).toHaveBeenCalledWith([]);
  });

  test('subscribes to the job result key only once', async () => {
    panel.attachJobResultListener();
    panel.attachJobResultListener();

    expect(storageListeners).toHaveLength(1);

    storageListeners[0](
      {
        ls_search_job_result: {
          newValue: {
            kind: 'dialog',
            jobId: 'job-5',
            result: { jobId: 'job-5', addedCount: 0, errors: [] },
          },
        },
      },
      'local',
    );

    await flushMicrotasks();

    expect(window.InlineUI.showStatus).toHaveBeenCalledWith(
      'Новых сообщений не найдено',
      'success',
    );
  });
});

async function flushMicrotasks(turns = 25) {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve();
  }
}
