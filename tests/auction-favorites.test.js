const {
  isAuctionListPath,
  isLoggedIn,
  getPostIdFromRow,
  hasFavoriteControl,
  parseFavoriteIds,
  fetchFavoriteIds,
  createStar,
  setStarState,
  toggleFavorite,
  createController,
} = require('../auction-favorites');

function createAuctionRow({
  postId,
  title = 'Лот',
  lastCell = '<b>1000</b> <b class="b-rub">Р</b><br>2 дня 10 ч.',
  favorite = false,
}) {
  const favoriteMarkup = favorite
    ? `<div class="forum_favorite_button_yes" id="forum_favorite_${postId}" onclick="user_forum_post_rel_img(${postId}, 0);"></div>`
    : '';

  return `
    <tr>
      <td><a href="/auction/post${postId}/" class="help_tooltip"><img src="/i/album/1_s.jpg" alt=""></a></td>
      <td width="50%"><a href="/auction/post${postId}/">${title}</a></td>
      <td width="25%"><a href="/users/95042/">Продавец</a></td>
      <td width="25%">${favoriteMarkup}${lastCell}</td>
    </tr>
  `;
}

function createAuctionDocument() {
  document.body.innerHTML = `
    <a href="/logout/">Выйти</a>
    <div id="top_ban_auction">
      <a href="/auction/post1104172/">Рекомендация</a>
    </div>
    <table class="inner">
      <tbody>
        ${createAuctionRow({ postId: 1103446, title: 'Избранный лот' })}
        ${createAuctionRow({
          postId: 1102608,
          title: 'Обычный лот',
          lastCell:
            '<b>3000</b> <b class="b-rub">Р</b> (<a href="/auction/post1102608/">8 ставок</a>)<br>2 дня 21 ч.',
        })}
        ${createAuctionRow({
          postId: 1103828,
          title: 'Завершённый лот',
          lastCell:
            '<b>3200</b> <b class="b-rub">Р</b><br>Закончен <span>8 ноября 22:26</span>',
        })}
        ${createAuctionRow({
          postId: 1104172,
          title: 'Уже со звездой',
          favorite: true,
        })}
        ${createAuctionRow({
          postId: 1095514,
          title: 'Объявление',
          lastCell: 'Объявление<br>2 дня 10 ч.',
        })}
      </tbody>
    </table>
  `;
  return document;
}

describe('auction favorite stars', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  test('detects auction list pages and skips pages with their own stars', () => {
    expect(isAuctionListPath('/auction/')).toBe(true);
    expect(isAuctionListPath('/auction/bid/')).toBe(true);
    expect(isAuctionListPath('/auction/bid/page1/')).toBe(true);
    expect(isAuctionListPath('/auction/buy_it_now/')).toBe(true);
    expect(isAuctionListPath('/auction/auction_ent/')).toBe(true);
    expect(isAuctionListPath('/auction/search/')).toBe(true);
    expect(isAuctionListPath('/users/auction/95042/')).toBe(true);
    expect(isAuctionListPath('/users/auction/95042/page1/')).toBe(true);

    expect(isAuctionListPath('/auction/post1103446/')).toBe(false);
    expect(isAuctionListPath('/auction/favorite/')).toBe(false);
    expect(isAuctionListPath('/auction/subscribe/')).toBe(true);
    expect(isAuctionListPath('/auction/archive/')).toBe(false);
    expect(isAuctionListPath('/auction/won/')).toBe(false);
    expect(isAuctionListPath('/users/my_auctions/')).toBe(false);
    expect(isAuctionListPath('/cards/panini_avengers_endgame/')).toBe(false);
  });

  test('detects the logged-in state', () => {
    document.body.innerHTML = '<a href="/logout/">Выйти</a>';
    expect(isLoggedIn(document)).toBe(true);

    document.body.innerHTML = '<a href="/login/">Войти</a>';
    expect(isLoggedIn(document)).toBe(false);
  });

  test('extracts the post id from a list row', () => {
    createAuctionDocument();
    const rows = document.querySelectorAll('table.inner tr');

    expect(getPostIdFromRow(rows[0])).toBe('1103446');
    expect(getPostIdFromRow(rows[4])).toBe('1095514');
  });

  test('recognises an existing favorite control', () => {
    createAuctionDocument();
    const rows = document.querySelectorAll('table.inner tr');

    expect(hasFavoriteControl(rows[3])).toBe(true);
    expect(hasFavoriteControl(rows[0])).toBe(false);

    const custom = document.createElement('tr');
    custom.innerHTML = '<td data-ls-auction-fav="1"></td>';
    expect(hasFavoriteControl(custom)).toBe(true);
  });

  test('parses favorite ids and pagination links', () => {
    const html = `
      <div id="forum_favorite_1103446" class="forum_favorite_button_yes"></div>
      <div id="forum_favorite_1102608" class="forum_favorite_button_yes"></div>
      <div id="forum_favorite_1103446_duplicate" class="forum_favorite_button_yes"></div>
      <div id="pages">
        <a href="#" class="page">1</a>
        <a href="/auction/favorite/page1/" class="page">2</a>
        <a href="/auction/favorite/page1/" class="page">2</a>
        <a href="/auction/favorite/page2/">3</a>
        <a href="/other/page3/">4</a>
      </div>
      <a class="page" href="https://www.laststicker.ru/auction/favorite/page3/">4</a>
    `;

    const result = parseFavoriteIds(html, 'https://www.laststicker.ru');

    expect(Array.from(result.ids).sort()).toEqual(['1102608', '1103446']);
    expect(result.pageUrls).toEqual([
      '/auction/favorite/page1/',
      '/auction/favorite/page2/',
      '/auction/favorite/page3/',
    ]);
  });

  test('loads favorite ids from every pagination page', async () => {
    const pages = {
      'https://www.laststicker.ru/auction/favorite/': `
        <div id="forum_favorite_1" class="forum_favorite_button_yes"></div>
        <div id="pages"><a class="page" href="/auction/favorite/page1/">2</a></div>
      `,
      'https://www.laststicker.ru/auction/favorite/page1/': `
        <div id="forum_favorite_2" class="forum_favorite_button_yes"></div>
        <div id="pages"><a class="page" href="/auction/favorite/page2/">3</a></div>
      `,
      'https://www.laststicker.ru/auction/favorite/page2/': `
        <div id="forum_favorite_3" class="forum_favorite_button_yes"></div>
      `,
    };

    const fetchImpl = jest.fn(async (url) => ({
      ok: true,
      text: async () => pages[url] || '',
    }));

    const ids = await fetchFavoriteIds({
      fetchImpl,
      baseUrl: 'https://www.laststicker.ru',
    });

    expect(Array.from(ids).sort()).toEqual(['1', '2', '3']);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test('creates a site-style star with a unique id', () => {
    const star = createStar(document, '123', false);

    expect(star.className).toBe('forum_favorite_button_no');
    expect(star.id).toBe('forum_favorite_123');
    expect(star.dataset.lsAuctionFav).toBe('123');
    expect(star.style.cssFloat).toBe('right');
    expect(star.getAttribute('role')).toBe('button');
    expect(star.getAttribute('tabindex')).toBe('0');
    expect(star.title).toBe('Добавить в избранное');
    expect(star.getAttribute('aria-pressed')).toBe('false');

    document.body.appendChild(star);
    const second = createStar(document, '123', true);
    expect(second.id).toBe('forum_favorite_123_2');
    expect(second.className).toBe('forum_favorite_button_yes');
    expect(second.title).toBe('Убрать из избранного');
    expect(second.getAttribute('aria-pressed')).toBe('true');

    setStarState(second, false);
    expect(second.className).toBe('forum_favorite_button_no');
    expect(second.title).toBe('Добавить в избранное');
  });

  test('injects stars into every auction row except existing controls', () => {
    createAuctionDocument();
    const controller = createController(document, {
      favoriteIds: ['1103446'],
    });

    const stars = document.querySelectorAll('[data-ls-auction-fav]');
    expect(stars).toHaveLength(4);

    const favoriteStar = document.querySelector(
      '[data-ls-auction-fav="1103446"]',
    );
    const normalStar = document.querySelector('[data-ls-auction-fav="1102608"]');
    const endedStar = document.querySelector('[data-ls-auction-fav="1103828"]');
    const adStar = document.querySelector('[data-ls-auction-fav="1095514"]');

    expect(favoriteStar.className).toBe('forum_favorite_button_yes');
    expect(normalStar.className).toBe('forum_favorite_button_no');
    expect(endedStar.className).toBe('forum_favorite_button_no');
    expect(adStar.className).toBe('forum_favorite_button_no');

    const rows = document.querySelectorAll('table.inner tr');
    expect(rows[3].querySelectorAll('.forum_favorite_button_yes')).toHaveLength(
      1,
    );
    expect(rows[3].querySelector('[data-ls-auction-fav]')).toBeNull();
    expect(
      document.getElementById('top_ban_auction').querySelector(
        '[data-ls-auction-fav]',
      ),
    ).toBeNull();

    expect(controller.scan()).toBe(0);
    expect(document.querySelectorAll('[data-ls-auction-fav]')).toHaveLength(4);

    controller.destroy();
    expect(document.querySelectorAll('[data-ls-auction-fav]')).toHaveLength(0);
  });

  test('restores a filled star for an ended favorite', () => {
    createAuctionDocument();
    const controller = createController(document, {
      favoriteIds: ['1103828'],
    });

    const endedStar = document.querySelector('[data-ls-auction-fav="1103828"]');
    expect(endedStar.className).toBe('forum_favorite_button_yes');
    expect(endedStar.title).toBe('Убрать из избранного');

    controller.destroy();
  });

  test('keeps duplicate post ids unique and syncs all of them', () => {
    document.body.innerHTML = `
      <table class="inner"><tbody>
        ${createAuctionRow({ postId: 777, title: 'Первый' })}
        ${createAuctionRow({ postId: 777, title: 'Второй' })}
      </tbody></table>
    `;

    const controller = createController(document, { favoriteIds: ['777'] });
    const stars = document.querySelectorAll('[data-ls-auction-fav="777"]');

    expect(stars).toHaveLength(2);
    expect(stars[0].id).toBe('forum_favorite_777');
    expect(stars[1].id).toBe('forum_favorite_777_2');
    expect(stars[0].className).toBe('forum_favorite_button_yes');
    expect(stars[1].className).toBe('forum_favorite_button_yes');

    controller.syncStars('777', false);
    expect(stars[0].className).toBe('forum_favorite_button_no');
    expect(stars[1].className).toBe('forum_favorite_button_no');

    controller.destroy();
  });

  test('sends one request per lot even when two rows are clicked', async () => {
    document.body.innerHTML = `
      <table class="inner"><tbody>
        ${createAuctionRow({ postId: 777, title: 'Первый' })}
        ${createAuctionRow({ postId: 777, title: 'Второй' })}
      </tbody></table>
    `;

    let resolveRequest;
    const request = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const controller = createController(document, {
      favoriteIds: ['777'],
      request,
    });
    const stars = document.querySelectorAll('[data-ls-auction-fav="777"]');

    stars[0].click();
    stars[1].click();

    expect(request).toHaveBeenCalledTimes(1);
    expect(stars[0].dataset.lsPending).toBe('1');

    resolveRequest({ answer: 'y', class_fav: 'forum_favorite_button_no' });
    await Promise.resolve();
    await Promise.resolve();

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('777', 0);
    expect(stars[0].className).toBe('forum_favorite_button_no');
    expect(stars[1].className).toBe('forum_favorite_button_no');
    expect(stars[0].dataset.lsPending).toBeUndefined();

    controller.destroy();
  });

  test('tells the user why a star click did nothing', async () => {
    document.body.innerHTML = `
      <table class="inner"><tbody>
        ${createAuctionRow({ postId: 777, title: 'Лот' })}
      </tbody></table>
    `;
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const request = jest.fn().mockResolvedValue({ answer: 'n' });
    const controller = createController(document, {
      favoriteIds: [],
      request,
    });

    document.querySelector('[data-ls-auction-fav="777"]').click();
    await Promise.resolve();
    await Promise.resolve();

    const status = document.getElementById('ls-auction-status');
    expect(status).not.toBeNull();
    expect(status.hidden).toBe(false);
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe(
      'Не удалось изменить избранное: сайт не подтвердил изменение',
    );
    expect(
      document.querySelector('[data-ls-auction-fav="777"]').className,
    ).toBe('forum_favorite_button_no');

    controller.destroy();
  });

  test('reports an HTTP failure and hides the message afterwards', async () => {
    jest.useFakeTimers();
    try {
      document.body.innerHTML = `
        <table class="inner"><tbody>
          ${createAuctionRow({ postId: 888, title: 'Лот' })}
        </tbody></table>
      `;
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      const request = jest.fn().mockRejectedValue(new Error('HTTP 500'));
      const controller = createController(document, {
        favoriteIds: [],
        request,
      });

      document.querySelector('[data-ls-auction-fav="888"]').click();
      await Promise.resolve();
      await Promise.resolve();

      const status = document.getElementById('ls-auction-status');
      expect(status.textContent).toBe(
        'Не удалось изменить избранное: сайт ответил 500',
      );

      jest.advanceTimersByTime(4000);
      expect(status.hidden).toBe(true);

      controller.destroy();
    } finally {
      jest.useRealTimers();
    }
  });

  test('reports a network failure through the onError callback', async () => {
    const star = createStar(document, '123', false);
    document.body.appendChild(star);

    const onError = jest.fn();
    const rejected = jest.fn().mockRejectedValue(new Error('network'));

    await expect(
      toggleFavorite(star, '123', rejected, { onError }),
    ).resolves.toBeNull();
    expect(onError).toHaveBeenCalledWith('нет связи с сайтом');
  });

  test('loads the initial favorite state from the site', async () => {
    createAuctionDocument();
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      text: async () =>
        '<div id="forum_favorite_1102608" class="forum_favorite_button_yes"></div>',
    }));

    const controller = createController(document, {
      fetchOptions: {
        baseUrl: 'https://www.laststicker.ru',
        fetchImpl,
      },
    });

    await controller.ready;

    expect(controller.isLoaded()).toBe(true);
    expect(controller.favoriteIds.has('1102608')).toBe(true);
    expect(
      document.querySelector('[data-ls-auction-fav="1102608"]').className,
    ).toBe('forum_favorite_button_yes');
    expect(
      document.querySelector('[data-ls-auction-fav="1103446"]').className,
    ).toBe('forum_favorite_button_no');

    controller.destroy();
  });

  test('toggles a favorite through the site endpoint', async () => {
    const star = createStar(document, '123', false);
    document.body.appendChild(star);

    const addRequest = jest
      .fn()
      .mockResolvedValue({ answer: 'y', class_fav: 'forum_favorite_button_yes' });

    await expect(toggleFavorite(star, '123', addRequest)).resolves.toBe(true);
    expect(addRequest).toHaveBeenCalledWith('123', 0);
    expect(star.className).toBe('forum_favorite_button_yes');
    expect(star.title).toBe('Убрать из избранного');
    expect(star.getAttribute('aria-pressed')).toBe('true');
    expect(star.dataset.lsPending).toBeUndefined();

    const removeRequest = jest
      .fn()
      .mockResolvedValue({ answer: 'y', class_fav: 'forum_favorite_button_no' });

    await expect(toggleFavorite(star, '123', removeRequest)).resolves.toBe(
      false,
    );
    expect(removeRequest).toHaveBeenCalledWith('123', 0);
    expect(star.className).toBe('forum_favorite_button_no');
    expect(star.title).toBe('Добавить в избранное');
  });

  test('leaves the star unchanged on errors or unknown responses', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const star = createStar(document, '123', false);
    document.body.appendChild(star);

    const rejected = jest.fn().mockRejectedValue(new Error('network'));
    await expect(toggleFavorite(star, '123', rejected)).resolves.toBeNull();
    expect(star.className).toBe('forum_favorite_button_no');
    expect(warn).toHaveBeenCalled();

    const denied = jest
      .fn()
      .mockResolvedValue({ answer: 'n', class_fav: 'forum_favorite_button_yes' });
    await expect(toggleFavorite(star, '123', denied)).resolves.toBeNull();
    expect(star.className).toBe('forum_favorite_button_no');

    const unknown = jest
      .fn()
      .mockResolvedValue({ answer: 'y', class_fav: 'some_other_class' });
    await expect(toggleFavorite(star, '123', unknown)).resolves.toBeNull();
    expect(star.className).toBe('forum_favorite_button_no');

    star.dataset.lsPending = '1';
    const pending = jest.fn();
    await expect(toggleFavorite(star, '123', pending)).resolves.toBeNull();
    expect(pending).not.toHaveBeenCalled();
  });
});

describe('auction favorites loading', () => {
  const CACHE_KEY = 'ls_auction_favorites_cache';

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
    sessionStorage.clear();
    // jsdom has no requestIdleCallback: pin the setTimeout fallback.
    delete window.requestIdleCallback;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllTimers();
    sessionStorage.clear();
    document.body.innerHTML = '';
  });

  function favoritesResponse(ids) {
    return {
      ok: true,
      text: async () =>
        ids
          .map(
            (id) =>
              `<div id="forum_favorite_${id}" class="forum_favorite_button_yes"></div>`,
          )
          .join(''),
    };
  }

  async function flush() {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  }

  test('waits for the page to be idle before loading the favorites', async () => {
    createAuctionDocument();
    const fetchImpl = jest.fn(async () => favoritesResponse(['1103446']));

    const controller = createController(document, {
      fetchOptions: { baseUrl: 'https://www.laststicker.ru', fetchImpl },
    });

    expect(fetchImpl).not.toHaveBeenCalled();

    jest.advanceTimersByTime(300);
    await flush();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(controller.isLoaded()).toBe(true);

    controller.destroy();
  });

  test('reuses a fresh cached set without any request', async () => {
    createAuctionDocument();
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ids: ['1103828'], savedAt: Date.now() }),
    );

    const fetchImpl = jest.fn();
    const controller = createController(document, {
      fetchOptions: { baseUrl: 'https://www.laststicker.ru', fetchImpl },
    });

    jest.advanceTimersByTime(300);
    await flush();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-ls-auction-fav="1103828"]').className,
    ).toBe('forum_favorite_button_yes');

    controller.destroy();
  });

  test('ignores an expired cache and stores the fetched set', async () => {
    createAuctionDocument();
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        ids: ['1103828'],
        savedAt: Date.now() - 10 * 60 * 1000,
      }),
    );

    const fetchImpl = jest.fn(async () => favoritesResponse(['1102608']));
    const controller = createController(document, {
      fetchOptions: { baseUrl: 'https://www.laststicker.ru', fetchImpl },
    });

    jest.advanceTimersByTime(300);
    await flush();

    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY));
    expect(cached.ids).toContain('1102608');
    expect(cached.ids).not.toContain('1103828');

    controller.destroy();
  });

  test('starts the load on a click when the warm-up has not run yet', async () => {
    document.body.innerHTML = `
      <table class="inner"><tbody>
        ${createAuctionRow({ postId: 777, title: 'Лот' })}
      </tbody></table>
    `;

    const fetchImpl = jest.fn(async () => favoritesResponse([]));
    const request = jest.fn().mockResolvedValue({
      answer: 'y',
      class_fav: 'forum_favorite_button_yes',
    });

    const controller = createController(document, {
      fetchOptions: { baseUrl: 'https://www.laststicker.ru', fetchImpl },
      request,
    });

    document.querySelector('[data-ls-auction-fav="777"]').click();
    await flush();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);

    controller.destroy();
  });
});
