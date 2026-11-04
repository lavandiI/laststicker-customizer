const fs = require('fs');
const path = require('path');

let chromeMock = null;

function createChromeMock(initial = {}) {
  const data = {
    ls_search_theme: { enabled: true, palette: 'graphite', images: 'off' },
    isEnabled: true,
    ...initial,
  };

  return {
    storage: {
      local: {
        async get(keys) {
          if (Array.isArray(keys)) {
            const result = {};
            keys.forEach((key) => {
              result[key] = data[key];
            });
            return result;
          }
          return { [keys]: data[keys] };
        },
        async set(values) {
          Object.assign(data, values);
        },
      },
    },
    runtime: {
      getManifest: () => ({ version: '1.7.0' }),
      sendMessage: (message, callback) => {
        if (callback) callback({ success: true });
      },
    },
    tabs: {
      create: jest.fn(),
      getCurrent: jest.fn(),
      remove: jest.fn(),
    },
    data,
  };
}

function createWelcomeDocument() {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'welcome.html'),
    'utf8',
  );
  const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
  const body = bodyMatch
    ? bodyMatch[1].replace(/<script[\s\S]*?<\/script>/g, '')
    : '';

  const doc = document.implementation.createHTMLDocument('welcome');
  doc.body.innerHTML = body;
  return doc;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('welcome page', () => {
  let welcome;

  beforeAll(() => {
    welcome = require('../welcome.js');
  });

  beforeEach(() => {
    chromeMock = createChromeMock();
    global.chrome = chromeMock;
  });

  afterEach(() => {
    delete global.chrome;
  });

  test('shows the version, theme, scroll and tracking cards for 1.5.0 users', async () => {
    const doc = createWelcomeDocument();
    const info = welcome.initWelcome(
      doc,
      '?reason=update&version=1.7.0&previous=1.5.0',
    );
    await flush();

    expect(info.version).toBe('1.7.0');
    expect(doc.getElementById('versionLabel').textContent).toBe('v1.7.0');
    expect(doc.getElementById('heroVersion').textContent).toBe('в 1.7.0');
    expect(doc.getElementById('themeFeature').hidden).toBe(false);
    expect(doc.getElementById('scrollFeature').hidden).toBe(false);
    expect(doc.getElementById('trackingFeature').hidden).toBe(false);
    expect(doc.getElementById('previousLabel').textContent).toBe(
      'Обновление с 1.5.0',
    );
    expect(doc.getElementById('disabledBanner').hidden).toBe(true);
    expect(doc.documentElement.dataset.theme).toBe('dark');
  });

  test('shows scroll and tracking cards for 1.6.1 users', async () => {
    const doc = createWelcomeDocument();
    welcome.initWelcome(
      doc,
      '?reason=update&version=1.7.0&previous=1.6.1',
    );
    await flush();

    expect(doc.getElementById('themeFeature').hidden).toBe(true);
    expect(doc.getElementById('scrollFeature').hidden).toBe(false);
    expect(doc.getElementById('trackingFeature').hidden).toBe(false);
  });

  test('hides the scroll card and shows tracking for 1.6.2 users', async () => {
    const doc = createWelcomeDocument();
    welcome.initWelcome(
      doc,
      '?reason=update&version=1.7.0&previous=1.6.2',
    );
    await flush();

    expect(doc.getElementById('scrollFeature').hidden).toBe(true);
    expect(doc.getElementById('trackingFeature').hidden).toBe(false);
  });

  test('hides the tracking card when updating from 1.7.0', async () => {
    const doc = createWelcomeDocument();
    welcome.initWelcome(
      doc,
      '?reason=update&version=1.7.1&previous=1.7.0',
    );
    await flush();

    expect(doc.getElementById('trackingFeature').hidden).toBe(true);
  });

  test('offers to enable a disabled extension', async () => {
    chromeMock = createChromeMock({ isEnabled: false });
    global.chrome = chromeMock;

    const doc = createWelcomeDocument();
    welcome.initWelcome(
      doc,
      '?reason=update&version=1.7.0&previous=1.5.0',
    );
    await flush();

    expect(doc.getElementById('disabledBanner').hidden).toBe(false);

    doc.getElementById('enableBtn').click();
    await flush();

    expect(chromeMock.data.isEnabled).toBe(true);
    expect(doc.getElementById('disabledBanner').hidden).toBe(true);
  });

  test('opens LastSticker in a new tab', async () => {
    const doc = createWelcomeDocument();
    welcome.initWelcome(doc, '?version=1.7.0&previous=1.5.0');
    await flush();

    doc.getElementById('openSite').click();

    expect(chromeMock.tabs.create).toHaveBeenCalledWith({
      url: 'https://laststicker.ru/',
    });
  });

  test('compares versions numerically', () => {
    expect(welcome.compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(welcome.compareVersions('1.7.0', '1.6.2')).toBe(1);
    expect(welcome.compareVersions('1.6.2', '1.6.1')).toBe(1);
    expect(welcome.compareVersions('1.6.1', '1.6.0')).toBe(1);
    expect(welcome.compareVersions('1.6.0', '1.6.0')).toBe(0);
    expect(welcome.compareVersions('1.5.0', '1.6.0')).toBe(-1);
  });
});
