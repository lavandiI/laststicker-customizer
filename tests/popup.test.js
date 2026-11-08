const fs = require('fs');
const path = require('path');

const core = require('../theme-core.js');

let activeStore = null;
let chromeMock = null;

const storeProxy = {
  loadTheme: (...args) => activeStore.loadTheme(...args),
  saveTheme: (...args) => activeStore.saveTheme(...args),
  onThemeChanged: (...args) => activeStore.onThemeChanged(...args),
};

function createStoreMock(initial) {
  let stored = core.normalizeTheme(initial);

  return {
    loadTheme: jest.fn(async () => stored),
    saveTheme: jest.fn(async (partial) => {
      stored = core.normalizeTheme({ ...stored, ...partial });
      return stored;
    }),
    onThemeChanged: jest.fn(() => () => {}),
    getStored: () => stored,
  };
}

function createChromeMock(initial = {}) {
  const data = { isEnabled: true, ...initial };
  const listeners = [];

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
          if (typeof keys === 'string') return { [keys]: data[keys] };
          return { ...data };
        },
        async set(values) {
          Object.assign(data, values);
        },
      },
      onChanged: {
        addListener(listener) {
          listeners.push(listener);
        },
        removeListener(listener) {
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        },
      },
    },
    data,
    emit(changes) {
      listeners.slice().forEach((listener) => listener(changes, 'local'));
    },
  };
}

function createPopupDocument() {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'popup.html'),
    'utf8',
  );
  const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
  const body = bodyMatch
    ? bodyMatch[1].replace(/<script[\s\S]*?<\/script>/g, '')
    : '';

  const doc = document.implementation.createHTMLDocument('popup');
  doc.body.innerHTML = body;
  return doc;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function change(target) {
  target.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('popup settings', () => {
  let LSPopup;

  beforeAll(() => {
    global.LSTheme = core;
    global.LSThemeStore = storeProxy;

    LSPopup = require('../popup.js');
  });

  beforeEach(() => {
    jest.useFakeTimers();
    chromeMock = createChromeMock();
    global.chrome = chromeMock;
    activeStore = createStoreMock(core.DEFAULT_THEME);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete global.chrome;
  });

  test('renders the master switch on and the theme off by default', async () => {
    const doc = createPopupDocument();
    LSPopup.initPopup(doc);
    await flush();

    expect(doc.getElementById('extensionEnabled').checked).toBe(true);
    expect(doc.getElementById('masterState').textContent).toBe('Включено');
    expect(doc.getElementById('themeEnabled').checked).toBe(false);
    expect(doc.getElementById('themeState').textContent).toBe('Выключена');
    expect(doc.getElementById('disabledNote').hidden).toBe(true);
    expect(
      doc.getElementById('themeSettings').classList.contains('is-disabled'),
    ).toBe(false);
    expect(doc.getElementById('resetBtn').disabled).toBe(false);
    expect(doc.documentElement.dataset.lsTheme).toBe('light');
  });

  test('turns everything off when the master switch is disabled', async () => {
    const doc = createPopupDocument();
    LSPopup.initPopup(doc);
    await flush();

    const master = doc.getElementById('extensionEnabled');
    master.checked = false;
    change(master);
    await flush();

    expect(chromeMock.data.isEnabled).toBe(false);
    expect(doc.getElementById('masterState').textContent).toBe('Выключено');
    expect(doc.getElementById('masterCard').classList.contains('is-on')).toBe(
      false,
    );
    expect(doc.getElementById('themeState').textContent).toBe('Недоступна');
    expect(doc.getElementById('themeEnabled').checked).toBe(false);
    expect(doc.getElementById('themeEnabled').disabled).toBe(true);
    expect(
      doc.getElementById('themeSettings').classList.contains('is-disabled'),
    ).toBe(true);
    expect(doc.getElementById('disabledNote').hidden).toBe(false);
    expect(doc.getElementById('resetBtn').disabled).toBe(true);
    expect(doc.documentElement.dataset.lsTheme).toBe('light');
  });

  test('restores the saved theme when the master switch is enabled again', async () => {
    activeStore = createStoreMock({
      enabled: true,
      palette: 'graphite',
      images: 'off',
    });

    const doc = createPopupDocument();
    LSPopup.initPopup(doc);
    await flush();

    expect(doc.documentElement.dataset.lsTheme).toBe('dark');

    const master = doc.getElementById('extensionEnabled');
    master.checked = false;
    change(master);
    await flush();

    expect(doc.documentElement.dataset.lsTheme).toBe('light');

    master.checked = true;
    change(master);
    await flush();

    expect(chromeMock.data.isEnabled).toBe(true);
    expect(doc.documentElement.dataset.lsTheme).toBe('dark');
    expect(doc.getElementById('themeEnabled').checked).toBe(true);
    expect(doc.getElementById('themeState').textContent).toBe('Включена');
  });

  test('turns the dark theme on and saves it', async () => {
    const doc = createPopupDocument();
    LSPopup.initPopup(doc);
    await flush();

    const theme = doc.getElementById('themeEnabled');
    theme.checked = true;
    change(theme);
    await flush();

    expect(activeStore.getStored().enabled).toBe(true);
    expect(doc.documentElement.dataset.lsTheme).toBe('dark');
    expect(doc.getElementById('themeEnabled').checked).toBe(true);
    expect(doc.getElementById('themeState').textContent).toBe('Включена');
  });

  test('switches to the black palette', async () => {
    const doc = createPopupDocument();
    LSPopup.initPopup(doc);
    await flush();

    const black = doc.querySelector('input[name="palette"][value="black"]');
    black.checked = true;
    change(black);
    await flush();

    expect(activeStore.getStored().palette).toBe('black');
    expect(doc.documentElement.dataset.lsPalette).toBe('black');
  });

  test('switches to the sapphire palette', async () => {
    const doc = createPopupDocument();
    LSPopup.initPopup(doc);
    await flush();

    const sapphire = doc.querySelector(
      'input[name="palette"][value="sapphire"]',
    );
    sapphire.checked = true;
    change(sapphire);
    await flush();

    expect(activeStore.getStored().palette).toBe('sapphire');
    expect(doc.documentElement.dataset.lsPalette).toBe('sapphire');
  });

  test('updates the image dimming preview', async () => {
    const doc = createPopupDocument();
    LSPopup.initPopup(doc);
    await flush();

    const images = doc.getElementById('images');
    images.value = 'strong';
    change(images);
    await flush();

    expect(activeStore.getStored().images).toBe('strong');
    expect(doc.getElementById('previewSite').dataset.images).toBe('strong');
  });

  test('resets every setting while the extension is enabled', async () => {
    activeStore = createStoreMock({
      enabled: true,
      palette: 'black',
      images: 'strong',
    });

    const doc = createPopupDocument();
    LSPopup.initPopup(doc);
    await flush();

    doc.getElementById('resetBtn').click();
    await flush();

    expect(activeStore.getStored()).toEqual(core.DEFAULT_THEME);
    expect(doc.documentElement.dataset.lsTheme).toBe('light');
    expect(doc.getElementById('themeEnabled').checked).toBe(false);
    expect(doc.getElementById('saveStatus').textContent).toBe('Сброшено');
  });

  test('keeps quick scroll on by default', async () => {
    const doc = createPopupDocument();
    LSPopup.initPopup(doc);
    await flush();

    expect(doc.getElementById('scrollEnabled').checked).toBe(true);
    expect(doc.getElementById('scrollState').textContent).toBe('Включена');
  });

  test('turns quick scroll off and on', async () => {
    const doc = createPopupDocument();
    LSPopup.initPopup(doc);
    await flush();

    const scroll = doc.getElementById('scrollEnabled');
    scroll.checked = false;
    change(scroll);
    await flush();

    expect(chromeMock.data.ls_scroll_enabled).toBe(false);
    expect(doc.getElementById('scrollState').textContent).toBe('Выключена');

    scroll.checked = true;
    change(scroll);
    await flush();

    expect(chromeMock.data.ls_scroll_enabled).toBe(true);
    expect(doc.getElementById('scrollState').textContent).toBe('Включена');
  });

  test('reads a stored quick scroll setting', async () => {
    chromeMock = createChromeMock({ ls_scroll_enabled: false });
    global.chrome = chromeMock;

    const doc = createPopupDocument();
    LSPopup.initPopup(doc);
    await flush();

    expect(doc.getElementById('scrollEnabled').checked).toBe(false);
    expect(doc.getElementById('scrollState').textContent).toBe('Выключена');
  });

  test('disables quick scroll control when the extension is off', async () => {
    const doc = createPopupDocument();
    LSPopup.initPopup(doc);
    await flush();

    const master = doc.getElementById('extensionEnabled');
    master.checked = false;
    change(master);
    await flush();

    expect(doc.getElementById('scrollEnabled').disabled).toBe(true);
    expect(doc.getElementById('scrollState').textContent).toBe('Недоступна');
  });
});
