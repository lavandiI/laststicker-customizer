jest.useFakeTimers();

const {
  isForumPath,
  detectPanelPage,
} = require('../inline-panel');

function createDocument(html = '') {
  const doc = document.implementation.createHTMLDocument('page');
  doc.body.innerHTML = html;
  return doc;
}

describe('inline panel page detection', () => {
  test('recognises forum paths only under /blog/', () => {
    expect(isForumPath('/blog/forum/')).toBe(true);
    expect(isForumPath('/blog/post2650/')).toBe(true);
    expect(isForumPath('/auction/post1103446/')).toBe(false);
    expect(isForumPath('/cards/panini_avengers_endgame/')).toBe(false);
  });

  test('does not treat auction pages with comments_list as a forum', () => {
    const doc = createDocument('<h2 id="comments_list">Комментарии:</h2>');

    expect(detectPanelPage('/auction/post1103446/', doc)).toBe('none');
  });

  test('does not treat collection pages with comments_list as a forum', () => {
    const doc = createDocument('<h2 id="comments_list">Комментарии:</h2>');

    expect(
      detectPanelPage('/cards/panini_avengers_endgame/', doc),
    ).toBe('none');
  });

  test('detects forum index, forum topic and talk pages', () => {
    const forumDoc = createDocument(
      '<div id="content"><div class="forum_list"></div></div>',
    );

    expect(detectPanelPage('/blog/forum/', forumDoc)).toBe('forum');
    expect(detectPanelPage('/blog/post2650/', createDocument())).toBe(
      'forum-topic',
    );
    expect(detectPanelPage('/users/my_talks/41292/', createDocument())).toBe(
      'talk',
    );
    expect(detectPanelPage('/users/my_talks/', createDocument())).toBe(
      'talk-list',
    );
    expect(detectPanelPage('/users/my_talks/hide/', createDocument())).toBe(
      'none',
    );
  });
});
