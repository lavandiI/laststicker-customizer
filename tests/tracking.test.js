function makeMessage(text) {
  const message = document.createElement('div');
  message.className = 'user_message';
  const body = document.createElement('div');
  body.className = 'big_text';
  body.textContent = text;
  message.appendChild(body);
  document.body.appendChild(message);
  return { message, body };
}

describe('tracking links', () => {
  let tracking;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    delete global.chrome;
    delete global.LSTracking;
    delete global.LSTrackingCore;

    const core = require('../tracking-core.js');
    global.LSTrackingCore = core;
    tracking = require('../tracking.js');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete global.chrome;
  });

  test('turns track numbers into links without changing the text', () => {
    const { body } = makeMessage('Трек RR123456789BY и 45005145009749.');
    tracking.linkifyContainer(body);

    const links = body.querySelectorAll('a.ls-track-link');
    expect(links).toHaveLength(2);
    expect(links[0].textContent).toBe('RR123456789BY');
    expect(links[0].href).toBe('https://belpost.by/Otsleditotpravleniye?number=RR123456789BY');
    expect(links[1].textContent).toBe('45005145009749');
    expect(links[1].href).toBe('https://www.pochta.ru/tracking?barcode=45005145009749');
    expect(body.textContent).toBe('Трек RR123456789BY и 45005145009749.');

    tracking.linkifyContainer(body);
    expect(body.querySelectorAll('a.ls-track-link')).toHaveLength(2);
  });

  test('does not touch existing links or code', () => {
    const { body } = makeMessage('');
    body.innerHTML =
      '<a href="#">RR123456789BY</a> ' +
      '<code>45005145009749</code> ' +
      '<span>RR123456789BY</span>';
    tracking.linkifyContainer(body);

    expect(body.querySelectorAll('a.ls-track-link')).toHaveLength(1);
    expect(body.querySelector('code').textContent).toBe('45005145009749');
    expect(body.querySelector('a[href="#"]').textContent).toBe('RR123456789BY');
  });

  test('recognizes a standalone 13-digit Belpost number', () => {
    const { body } = makeMessage('1234567890123');
    tracking.linkifyContainer(body);
    expect(body.querySelectorAll('a.ls-track-link')).toHaveLength(1);
    expect(body.querySelector('a.ls-track-link').dataset.lsTrackOperator).toBe('belpost');

    const second = makeMessage('заказ 1234567890123');
    tracking.linkifyContainer(second.body);
    expect(second.body.querySelectorAll('a.ls-track-link')).toHaveLength(0);
  });

  test('removes links when the extension is disabled and restores them', () => {
    const { body } = makeMessage('RR123456789BY');
    tracking.linkifyContainer(body);
    expect(body.querySelectorAll('a.ls-track-link')).toHaveLength(1);

    tracking.setExtensionEnabled(false);
    expect(body.querySelectorAll('a.ls-track-link')).toHaveLength(0);
    expect(body.textContent).toContain('RR123456789BY');

    tracking.setExtensionEnabled(true);
    expect(body.querySelectorAll('a.ls-track-link')).toHaveLength(1);
  });

  test('renders a route card after clicking a link', () => {
    const { body } = makeMessage('RR123456789BY');
    global.chrome = {
      runtime: {
        sendMessage(message, callback) {
          callback({
            result: {
              operator: message.operator,
              number: message.number,
              status: 'Вручено',
              updatedAt: '2026-11-05 10:00:00',
              events: [
                {
                  date: '2026-11-05 10:00:00',
                  status: 'Вручено',
                  place: 'Борисов',
                  index: '222120',
                },
              ],
            },
          });
        },
      },
    };

    tracking.linkifyContainer(body);
    tracking.setTrackingEnabled(true);
    const link = body.querySelector('a.ls-track-link');
    link.click();

    const card = document.querySelector('.ls-track-card');
    expect(card).toBeTruthy();
    expect(card.querySelector('.ls-track-card__status').textContent).toContain('Вручено');
    expect(card.querySelectorAll('.ls-track-card__event-item')).toHaveLength(1);
    expect(link.getAttribute('aria-expanded')).toBe('true');

    link.click();
    expect(card.hidden).toBe(true);

    tracking.setTrackingEnabled(false);
    expect(document.querySelector('.ls-track-card')).toBeNull();
  });
});
