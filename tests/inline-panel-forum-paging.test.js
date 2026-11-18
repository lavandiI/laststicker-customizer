const TOTAL_COMMENTS = 250;

function createComments() {
  return Array.from({ length: TOTAL_COMMENTS }, (_, index) => ({
    key: `forum:1:${index}`,
    postId: '1',
    commentId: String(index),
    text: `сообщение ${index}`,
    author: 'автор',
    timestamp: TOTAL_COMMENTS - index,
  }));
}

describe('inline panel forum paging', () => {
  let panel;
  let requests;
  let ui;
  let comments;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();

    requests = [];
    comments = createComments();
    ui = {
      renderForumResults: jest.fn(),
      renderForumStats: jest.fn(),
      renderForumLastIndexedAt: jest.fn(),
      renderForumErrors: jest.fn(),
      renderForumEmptyState: jest.fn(),
      showForumStatus: jest.fn(),
    };

    window.InlineUI = ui;
    window.chrome = {
      runtime: {
        lastError: undefined,
        sendMessage: (message, callback) => {
          requests.push(message);
          if (message.action === 'forumSearch') {
            const offset = Number(message.offset) || 0;
            const limit = Number(message.limit) || 200;
            callback({
              result: {
                results: comments.slice(offset, offset + limit),
                total: comments.length,
                hasMore: offset + limit < comments.length,
              },
            });
            return;
          }
          callback({ result: null });
        },
      },
      storage: { onChanged: { addListener: () => {} } },
    };

    panel = require('../inline-panel');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllTimers();
    delete window.chrome;
  });

  function lastRender() {
    return ui.renderForumResults.mock.calls[ui.renderForumResults.mock.calls.length - 1];
  }

  test('reads the first page with an explicit limit and offset', async () => {
    await panel.performForumSearch('сообщение');

    expect(requests[requests.length - 1]).toEqual({
      action: 'forumSearch',
      query: 'сообщение',
      postId: '',
      limit: 200,
      offset: 0,
    });

    const [results, query, total, limit, options] = lastRender();
    expect(results).toHaveLength(200);
    expect(query).toBe('сообщение');
    expect(total).toBe(TOTAL_COMMENTS);
    expect(limit).toBe(200);
    expect(options).toEqual({
      groupByTopic: true,
      canLoadMore: true,
      truncated: false,
    });
  });

  test('appends the next page instead of re-reading the result set', async () => {
    await panel.performForumSearch('сообщение');
    await panel.performForumSearch('сообщение', { append: true });

    expect(requests[requests.length - 1]).toMatchObject({
      action: 'forumSearch',
      limit: 200,
      offset: 200,
    });

    const [results, , total, limit, options] = lastRender();
    expect(results).toHaveLength(TOTAL_COMMENTS);
    expect(results[0].key).toBe(comments[0].key);
    expect(results[TOTAL_COMMENTS - 1].key).toBe(comments[TOTAL_COMMENTS - 1].key);
    expect(total).toBe(TOTAL_COMMENTS);
    expect(limit).toBe(TOTAL_COMMENTS);
    expect(options.canLoadMore).toBe(false);
  });

  test('starts from the first page when the query changes', async () => {
    await panel.performForumSearch('сообщение');
    await panel.performForumSearch('сообщение', { append: true });
    await panel.performForumSearch('другое');

    expect(requests[requests.length - 1]).toMatchObject({ offset: 0 });
    expect(lastRender()[0]).toHaveLength(200);
  });

  test('ignores a stale append for a query that is no longer shown', async () => {
    await panel.performForumSearch('сообщение');
    await panel.performForumSearch('другое', { append: true });

    expect(requests[requests.length - 1]).toMatchObject({ offset: 0 });
  });

  test('drops duplicates when pages overlap', () => {
    const first = [
      { key: 'a', text: '1' },
      { key: 'b', text: '2' },
    ];
    const second = [
      { key: 'b', text: '2' },
      { key: 'c', text: '3' },
    ];

    const merged = panel.mergeForumResults(first, second);

    expect(merged.map((item) => item.key)).toEqual(['a', 'b', 'c']);
  });
});
