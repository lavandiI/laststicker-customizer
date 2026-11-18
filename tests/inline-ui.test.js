require('../inline-ui');

describe('inline-ui filters and result links', () => {
  beforeAll(() => {
    document.body.innerHTML = '<div id="content"><div class="big_text"></div></div>';
    window.InlineUI.createSearchPanel();
  });

  test('creates index/cancel/clear controls without filters or import/export', () => {
    expect(document.getElementById('ls-indexBtn')).toBeTruthy();
    expect(document.getElementById('ls-cancelBtn')).toBeTruthy();
    expect(document.getElementById('ls-clearBtn')).toBeTruthy();
    expect(document.getElementById('ls-exportBtn')).toBeNull();
    expect(document.getElementById('ls-importBtn')).toBeNull();
    expect(document.getElementById('ls-partnerFilter')).toBeNull();
    expect(document.getElementById('ls-imagesOnly')).toBeNull();
  });

  test('adds accessible labels and index metadata', () => {
    const searchInput = document.getElementById('ls-searchInput');
    expect(searchInput.getAttribute('aria-label')).toBe('Поиск по сообщениям');
    expect(searchInput.getAttribute('aria-controls')).toBe('ls-results');
    expect(document.getElementById('ls-results').getAttribute('aria-label')).toBe(
      'Результаты поиска',
    );
    expect(document.getElementById('ls-indexSize')).toBeTruthy();
    expect(document.getElementById('ls-staleBanner')).toBeTruthy();
    expect(document.getElementById('ls-readNotice')).toBeTruthy();
    expect(document.getElementById('ls-indexErrors')).toBeTruthy();
    expect(document.getElementById('ls-autoEnabled')).toBeTruthy();
    expect(document.getElementById('ls-autoStatus')).toBeTruthy();
  });

  test('formats the index size and warns about a large index', () => {
    window.InlineUI.renderIndexSize(0);
    expect(document.getElementById('ls-indexSize').textContent).toBe('0 Б');

    window.InlineUI.renderIndexSize(3.4 * 1024 * 1024);
    expect(document.getElementById('ls-indexSize').textContent).toBe('3,4 МБ');
    expect(document.getElementById('ls-indexSize').classList.contains('ls-stat-warning')).toBe(
      false,
    );
    expect(document.getElementById('ls-indexSize').title).toBe(
      'Размер локального индекса',
    );

    window.InlineUI.renderIndexSize(9 * 1024 * 1024);
    expect(document.getElementById('ls-indexSize').classList.contains('ls-stat-warning')).toBe(
      true,
    );
    // The quota is lifted by unlimitedStorage: the hint is about speed, not a limit.
    expect(document.getElementById('ls-indexSize').title).toContain('может замедлиться');
    expect(document.getElementById('ls-indexSize').title).not.toContain('лимит');
  });

  test('shows and hides the stale-index banner', () => {
    window.InlineUI.showStaleBanner(8);
    const banner = document.getElementById('ls-staleBanner');
    expect(banner.hidden).toBe(false);
    expect(document.getElementById('ls-staleText').textContent).toContain('8 дней');

    window.InlineUI.showStaleBanner(1);
    expect(document.getElementById('ls-staleText').textContent).toContain('1 день');

    window.InlineUI.showStaleBanner(2);
    expect(document.getElementById('ls-staleText').textContent).toContain('2 дня');

    window.InlineUI.hideStaleBanner();
    expect(banner.hidden).toBe(true);
  });

  test('shows and hides the read-marking notice', () => {
    const notice = document.getElementById('ls-readNotice');
    window.InlineUI.showReadNotice();
    expect(notice.hidden).toBe(false);
    window.InlineUI.hideReadNotice();
    expect(notice.hidden).toBe(true);
  });

  test('keeps the status visible when the results are re-rendered', () => {
    window.InlineUI.showStatus('Готово', 'success');
    const status = document.getElementById('ls-status');
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe('Готово');

    window.InlineUI.renderEmptyState('no-query');
    expect(status.textContent).toBe('Готово');
  });

  test('renders indexing errors as text without executing HTML', () => {
    window.InlineUI.renderIndexErrors([
      '<img src=x onerror="window.__xss=1">',
      'dialogue 42: HTTP 500',
    ]);

    const box = document.getElementById('ls-indexErrors');
    expect(box.hidden).toBe(false);
    expect(box.querySelector('img')).toBeNull();
    expect(box.textContent).toContain('<img src=x');
    expect(box.textContent).toContain('dialogue 42');
    expect(document.getElementById('ls-retryBtn')).toBeTruthy();
    expect(box.querySelector('details')).toBeTruthy();

    window.InlineUI.clearIndexErrors();
    expect(box.hidden).toBe(true);
    expect(box.innerHTML).toBe('');
  });

  test('renders a clickable result, its index and a load-more button', () => {
    window.InlineUI.renderResults(
      [
        {
          partner: 'Анна',
          text: 'hello world',
          timestamp: 1690000000000,
          url: 'https://www.laststicker.ru/users/my_talks/1/page2/',
          messageId: '10',
        },
      ],
      'hello',
      250,
      200,
      true,
    );

    const link = document.querySelector('.ls-result-item');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe(
      'https://www.laststicker.ru/users/my_talks/1/page2/#msg_10',
    );
    expect(link.getAttribute('target')).toBeNull();
    expect(link.dataset.resultIndex).toBe('0');
    expect(link.id).toBe('ls-result-0');
    expect(link.getAttribute('aria-selected')).toBe('false');
    expect(document.getElementById('ls-loadMoreBtn')).toBeTruthy();
  });

  test('exposes the results as a listbox of options', () => {
    const container = document.getElementById('ls-results');
    expect(container.getAttribute('role')).toBe('listbox');

    window.InlineUI.renderResults(
      [{ partner: 'Анна', text: 'hello', timestamp: 1 }],
      'hello',
      1,
      200,
      false,
    );

    const item = document.querySelector('#ls-results .ls-result-item');
    expect(item.getAttribute('role')).toBe('option');
    // aria-selected is only meaningful on an option, which it now is.
    expect(item.getAttribute('aria-selected')).toBe('false');
  });

  test('highlights a query made of html characters', () => {
    window.InlineUI.renderResults(
      [{ partner: 'Анна', text: 'цена < 100 & скидка', timestamp: 1 }],
      '< 100 &',
      1,
      200,
      false,
    );

    const highlights = document.querySelectorAll('#ls-results .ls-highlight');
    expect(highlights).toHaveLength(1);
    // The markup is escaped, the visible text is the original query.
    expect(highlights[0].textContent).toBe('< 100 &');
  });

  test('keeps the combobox expanded state in sync with the listbox', () => {
    const input = document.getElementById('ls-searchInput');
    const container = document.getElementById('ls-results');
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');

    window.InlineUI.renderEmptyState('no-query');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    // A listbox may only contain options, so the empty state drops the role.
    expect(container.getAttribute('role')).toBeNull();

    window.InlineUI.renderResults(
      [{ partner: 'Анна', text: 'hello', timestamp: 1 }],
      'hello',
      1,
      200,
      false,
    );
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(container.getAttribute('role')).toBe('listbox');

    window.InlineUI.renderResults([], 'нет совпадений', 0, 200, false);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(container.getAttribute('role')).toBeNull();
  });
});
