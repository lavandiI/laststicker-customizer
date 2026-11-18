const fs = require('fs');
const path = require('path');
const {
  parseUnreadParams,
  extractListPage,
  parseMessageCount,
  getLastLinkedTalkPage,
  parseTalkIdFromUrl,
  getSelfUserId,
  parseMessageElement,
  extractMessagesFromDocument,
  buildMessageKey,
  dedupeMessages,
  parseDateStr,
} = require('../parser');

const talkFixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'talk-page.html'),
  'utf8',
);

describe('parser', () => {
  test('reads csrf parameters for the unread counter', () => {
    expect(parseUnreadParams('<script>req.send("uid=123&c=abc");</script>')).toEqual({
      uid: '123',
      c: 'abc',
    });
    expect(parseUnreadParams('<div>no params</div>')).toBeNull();
  });

  test('extracts list rows and pagination links', () => {
    const doc = new DOMParser().parseFromString(
      `<div id="content"><table id="talks_table">
        <tr id="talk_1"><td>2 / 3</td></tr>
        <tr id="talk_2"><td>no count</td></tr>
      </table><div id="pages"><a class="page" href="/users/my_talks/page2/">2</a></div></div>`,
      'text/html',
    );

    const page = extractListPage(doc);

    expect(page.rows).toEqual([
      { talkId: '1', messageCount: 5 },
      { talkId: '2', messageCount: null },
    ]);
    expect(page.pageUrls).toEqual(['/users/my_talks/page2/']);
    expect(getLastLinkedTalkPage(doc)).toBe(2);
  });

  test('reads own id and message id from a talk page', () => {
    const doc = new DOMParser().parseFromString(talkFixture, 'text/html');

    expect(getSelfUserId(doc)).toBe('55555');
    expect(parseTalkIdFromUrl('https://www.laststicker.ru/users/my_talks/41292/')).toBe(
      '41292',
    );

    const message = parseMessageElement(doc.getElementById('msg_101'), {
      defaultPartner: 'Анна',
      talkId: '41292',
      pageUrl: 'https://www.laststicker.ru/users/my_talks/41292/',
    });

    expect(message.messageId).toBe('101');
    expect(message.talkId).toBe('41292');
    expect(message.partner).toBe('Анна');
    expect(message.text).toContain('наклейки для обмена');
  });

  test('keeps the default partner for own messages', () => {
    const doc = new DOMParser().parseFromString(talkFixture, 'text/html');

    const message = parseMessageElement(doc.getElementById('msg_102'), {
      defaultPartner: 'Анна',
    });

    expect(message.partner).toBe('Анна');
    expect(message.text).toBe('Да, есть несколько наборов.');
  });

  test('detects the current account from the page instead of a hardcoded id', () => {
    const doc = new DOMParser().parseFromString(talkFixture, 'text/html');
    doc.querySelector('#left_menu a').setAttribute('href', '/users/999/');
    doc.querySelector('#msg_102 a[href^="/users/"]').setAttribute('href', '/users/999/');

    expect(getSelfUserId(doc)).toBe('999');
    expect(parseMessageElement(doc.getElementById('msg_102'), { defaultPartner: 'Анна' }).partner).toBe('Анна');
    expect(parseMessageElement(doc.getElementById('msg_101'), { defaultPartner: 'Анна' }).partner).toBe('Анна');
  });

  test('appends image urls to the message text', () => {
    const doc = new DOMParser().parseFromString(talkFixture, 'text/html');

    const message = parseMessageElement(doc.getElementById('msg_103'), {
      defaultPartner: 'Анна',
    });

    expect(message.text).toContain('Фото:');
    expect(message.text).toContain('[Image: /uploads/sticker.png]');
  });

  test('keeps html-looking text as text', () => {
    const doc = new DOMParser().parseFromString(talkFixture, 'text/html');

    const message = parseMessageElement(doc.getElementById('msg_106'), {
      defaultPartner: 'Анна',
    });

    expect(message.text).toBe('<img src=x onerror=alert(1)>');
    expect(doc.querySelectorAll('img')).toHaveLength(1);
  });

  test('extracts every message with talk id and page url', () => {
    const doc = new DOMParser().parseFromString(talkFixture, 'text/html');
    const pageUrl = 'https://www.laststicker.ru/users/my_talks/41292/page2/';

    const messages = extractMessagesFromDocument(doc, {
      defaultPartner: 'Анна',
      talkId: '41292',
      pageUrl,
    });

    expect(messages).toHaveLength(6);
    expect(messages[0].talkId).toBe('41292');
    expect(messages[0].url).toBe(pageUrl);
    expect(messages.every((message) => message.messageId)).toBe(true);
  });

  test('keeps equal text with different message ids after deduplication', () => {
    const doc = new DOMParser().parseFromString(talkFixture, 'text/html');
    const messages = extractMessagesFromDocument(doc, {
      defaultPartner: 'Анна',
      talkId: '41292',
      pageUrl: 'https://x/',
    });
    const duplicates = messages.filter(
      (message) => message.messageId === '104' || message.messageId === '105',
    );

    expect(buildMessageKey(duplicates[0])).not.toBe(buildMessageKey(duplicates[1]));
    expect(dedupeMessages(duplicates)).toHaveLength(2);
  });

  test('parses Russian dates with a two-digit year', () => {
    expect(parseDateStr('31.10.25 11:40')).toBe(new Date(2025, 9, 31, 11, 40).getTime());
    expect(parseDateStr('01.01.99 00:05')).toBe(new Date(1999, 0, 1, 0, 5).getTime());
    expect(parseDateStr('не дата')).toBeNull();
  });

  test('does not mistake a date in a row for the message counter', () => {
    const doc = new DOMParser().parseFromString(
      `<div id="content"><table id="talks_table">
        <tr id="talk_1"><td>12/2024</td><td>3 / 4</td></tr>
        <tr id="talk_2"><td>12/2024</td><td>без счётчика</td></tr>
        <tr id="talk_3"><td>2 / 3</td><td>12/2024</td></tr>
        <tr id="talk_4"><td>4 / 5 новых</td><td></td></tr>
      </table></div>`,
      'text/html',
    );

    const page = extractListPage(doc);

    expect(page.rows).toEqual([
      { talkId: '1', messageCount: 7 },
      { talkId: '2', messageCount: null },
      { talkId: '3', messageCount: 5 },
      { talkId: '4', messageCount: 9 },
    ]);
  });

  test('reads the counter of a single row from cell text', () => {
    const doc = new DOMParser().parseFromString(
      `<table id="talks_table">
        <tr id="talk_9"><td>1</td><td>3 / 3</td></tr>
      </table>`,
      'text/html',
    );
    const row = doc.querySelector('#talk_9');

    expect(parseMessageCount(row)).toBe(6);
    expect(parseMessageCount(null)).toBeNull();
  });
});
