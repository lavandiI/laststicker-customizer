const fakeIndexedDB = require('fake-indexeddb');

global.indexedDB = fakeIndexedDB.indexedDB;
global.IDBKeyRange = fakeIndexedDB.IDBKeyRange;
window.indexedDB = fakeIndexedDB.indexedDB;
window.IDBKeyRange = fakeIndexedDB.IDBKeyRange;
global.structuredClone = global.structuredClone || ((value) => JSON.parse(JSON.stringify(value)));
window.structuredClone = global.structuredClone;

const storage = require('../forum-storage');

function comment(overrides = {}) {
  return {
    key: 'forum:1:1',
    kind: 'comment',
    postId: '1',
    commentId: '1',
    topicTitle: 'Тема',
    category: 'Футбол',
    categoryPath: '/blog/football/',
    author: 'Автор',
    authorId: '10',
    city: 'Москва',
    timestamp: 100,
    text: 'Есть пакетик запечатаный',
    page: 1,
    pageParam: 0,
    url: 'https://www.laststicker.ru/blog/post1/#c1',
    ...overrides,
  };
}

describe('forum storage', () => {
  beforeEach(async () => {
    await storage.deleteDatabase();
  });

  afterAll(async () => {
    await storage.closeDb();
  });

  test('stores and searches comments with a topic filter', async () => {
    await storage.putComments(
      [
        comment({ key: 'forum:1:1', commentId: '1', timestamp: 100 }),
        comment({
          key: 'forum:1:2',
          commentId: '2',
          timestamp: 200,
          text: 'Другой пакетик',
        }),
        comment({
          key: 'forum:2:3',
          postId: '2',
          commentId: '3',
          timestamp: 300,
          text: 'Посторонняя тема',
        }),
        comment({
          key: 'forum:1:4',
          commentId: '4',
          topicTitle: 'УникальныйЗаголовок',
          timestamp: 400,
          text: 'обычный текст',
        }),
      ],
      0,
    );

    const all = await storage.searchComments('пакетик');
    expect(all.total).toBe(2);
    expect(all.results.map((item) => item.commentId)).toEqual(['2', '1']);

    const topic = await storage.searchComments('пакетик', { postId: '1' });
    expect(topic.total).toBe(2);
    expect(topic.results.every((item) => item.postId === '1')).toBe(true);

    const limited = await storage.searchComments('пакетик', {
      postId: '1',
      limit: 1,
    });
    expect(limited.results).toHaveLength(1);
    expect(limited.hasMore).toBe(true);

    const titleOnly = await storage.searchComments('УникальныйЗаголовок');
    expect(titleOnly.total).toBe(0);
  });

  test('returns statistics and topic metadata', async () => {
    await storage.putComments(
      [comment({ key: 'forum:1:1' }), comment({ key: 'forum:1:2', commentId: '2' })],
      0,
    );
    await storage.putTopic(
      {
        postId: '1',
        title: 'Тема',
        category: 'Футбол',
        indexedComments: 2,
        lastPageParam: 0,
        lastCompletePageParam: 0,
        complete: true,
      },
      0,
    );

    const stats = await storage.getStats('1');
    expect(stats.messagesCount).toBe(2);
    expect(stats.topicsCount).toBe(1);
    expect(stats.topic).toMatchObject({
      postId: '1',
      title: 'Тема',
      indexedComments: 2,
      complete: true,
    });
    expect(stats.sizeBytes).toBeGreaterThan(0);
  });

  test('bumps generation without deleting existing comments', async () => {
    await storage.putComments([comment()], 0);
    const before = await storage.getGeneration();

    await storage.bumpGeneration();

    expect(await storage.getGeneration()).toBe(before + 1);
    expect(await storage.countComments()).toBe(1);
  });

  test('rejects writes after the index was cleared', async () => {
    await storage.putComments([comment()], 0);
    await storage.clearAll();

    expect(await storage.getGeneration()).toBe(1);
    expect(await storage.countComments()).toBe(0);
    expect((await storage.getStats('')).sizeBytes).toBe(0);

    await expect(storage.putComments([comment()], 0)).rejects.toThrow('очищен');
    expect(await storage.countComments()).toBe(0);
  });

  test('deletes a single topic without touching other topics', async () => {
    await storage.putComments(
      [
        comment({ key: 'forum:1:1', postId: '1', commentId: '1' }),
        comment({ key: 'forum:2:2', postId: '2', commentId: '2' }),
      ],
      0,
    );
    await storage.putTopic({ postId: '1', title: 'One' }, 0);
    await storage.putTopic({ postId: '2', title: 'Two' }, 0);

    await storage.deleteTopic('1');

    expect(await storage.countComments()).toBe(1);
    expect(await storage.countTopics()).toBe(1);
    expect(await storage.getTopic('1')).toBeNull();
    expect((await storage.getTopic('2')).title).toBe('Two');
  });
});

describe('forum comment urls', () => {
  beforeEach(async () => {
    await storage.deleteDatabase();
  });

  afterAll(async () => {
    await storage.closeDb();
  });

  test('keeps site links as they are', () => {
    expect(storage.normalizeUrl('https://www.laststicker.ru/blog/post1/#c2')).toBe(
      'https://www.laststicker.ru/blog/post1/#c2',
    );
    expect(storage.normalizeUrl('/blog/post1/#c2')).toBe('/blog/post1/#c2');
  });

  test('upgrades the bare and insecure host forms', () => {
    expect(storage.normalizeUrl('https://laststicker.ru/blog/post1/')).toBe(
      'https://www.laststicker.ru/blog/post1/',
    );
    expect(storage.normalizeUrl('http://www.laststicker.ru/blog/post1/')).toBe(
      'https://www.laststicker.ru/blog/post1/',
    );
  });

  test('drops links that would end up in a foreign href', () => {
    expect(storage.normalizeUrl('javascript:alert(1)')).toBe('');
    expect(storage.normalizeUrl('https://evil.example/blog/post1/')).toBe('');
    expect(storage.normalizeUrl('//evil.example/x')).toBe('');
    expect(storage.normalizeUrl(undefined)).toBe('');
    expect(storage.normalizeUrl(42)).toBe('');
  });

  test('normalizes the url on write', async () => {
    await storage.putComments(
      [
        comment({ key: 'forum:1:1', commentId: '1', url: 'javascript:alert(1)' }),
        comment({
          key: 'forum:1:2',
          commentId: '2',
          url: 'http://laststicker.ru/blog/post1/#c2',
        }),
      ],
      0,
    );

    const all = await storage.searchComments('пакетик', { limit: 10 });
    const urls = all.results.map((item) => item.url).sort();

    expect(urls).toEqual(['', 'https://www.laststicker.ru/blog/post1/#c2']);
  });
});

describe('forum search paging', () => {
  const many = (count, postId = '1') =>
    Array.from({ length: count }, (_, index) =>
      comment({
        key: `forum:${postId}:${index}`,
        postId,
        commentId: String(index),
        timestamp: 100 + index,
        text: `пакетик ${index}`,
      }),
    );

  beforeEach(async () => {
    await storage.deleteDatabase();
  });

  afterAll(async () => {
    await storage.closeDb();
  });

  test('stops the scan one match past the requested page', async () => {
    await storage.putComments(many(10), 0);

    const page = await storage.searchComments('пакетик', { limit: 2 });

    expect(page.results).toHaveLength(2);
    expect(page.results.map((item) => item.commentId)).toEqual(['9', '8']);
    expect(page.truncated).toBe(true);
    // Only the requested page plus one look-ahead match was read.
    expect(page.total).toBe(3);
    expect(page.hasMore).toBe(true);
  });

  test('applies the offset to a truncated scan', async () => {
    await storage.putComments(many(10), 0);

    const page = await storage.searchComments('пакетик', {
      limit: 2,
      offset: 2,
    });

    expect(page.results.map((item) => item.commentId)).toEqual(['7', '6']);
    expect(page.truncated).toBe(true);
    expect(page.total).toBe(5);
    expect(page.hasMore).toBe(true);
  });

  test('reports an exact total when the whole index fits the page', async () => {
    await storage.putComments(many(4), 0);

    const page = await storage.searchComments('пакетик', { limit: 50 });

    expect(page.results).toHaveLength(4);
    expect(page.truncated).toBe(false);
    expect(page.total).toBe(4);
    expect(page.hasMore).toBe(false);
  });

  test('matches the author even when the message text does not', async () => {
    await storage.putComments(
      [
        comment({
          key: 'forum:1:1',
          commentId: '1',
          author: 'Пресс',
          text: 'Текст без совпадения',
        }),
      ],
      0,
    );

    const page = await storage.searchComments('пресс');

    expect(page.total).toBe(1);
    expect(page.results[0].commentId).toBe('1');
  });

  test('counts only the requested topic when the scan is truncated', async () => {
    await storage.putComments([...many(3, '1'), ...many(5, '2')], 0);

    const page = await storage.searchComments('пакетик', {
      postId: '2',
      limit: 1,
    });

    expect(page.results).toHaveLength(1);
    expect(page.results[0].postId).toBe('2');
    expect(page.truncated).toBe(true);
    // One match for the page plus one look-ahead match.
    expect(page.total).toBe(2);
  });
});
