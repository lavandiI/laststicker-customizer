function setGeometry({ top = 0, height = 3000, viewport = 1000 } = {}) {
  const defineValue = (target, property, value) => {
    Object.defineProperty(target, property, {
      configurable: true,
      get: () => value,
    });
  };

  defineValue(window, 'pageYOffset', top);
  defineValue(window, 'scrollY', top);
  defineValue(window, 'innerHeight', viewport);
  defineValue(document.documentElement, 'scrollHeight', height);
  defineValue(document.documentElement, 'clientHeight', viewport);
  defineValue(document.documentElement, 'scrollTop', top);
  defineValue(document.body, 'scrollHeight', height);
}

function createChromeMock(initial = {}) {
  const data = { isEnabled: true, ...initial };
  const storageListeners = [];
  const messageListeners = [];

  return {
    storage: {
      local: {
        async get(key) {
          return { [key]: data[key] };
        },
      },
      onChanged: {
        addListener(listener) {
          storageListeners.push(listener);
        },
      },
    },
    runtime: {
      onMessage: {
        addListener(listener) {
          messageListeners.push(listener);
        },
      },
    },
    data,
    emitStorage(changes) {
      storageListeners.slice().forEach((listener) => listener(changes, 'local'));
    },
    emitMessage(message) {
      messageListeners.slice().forEach((listener) => listener(message));
    },
  };
}

describe('scroll widget', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    delete global.chrome;
    delete global.LSScrollWidget;

    window.scrollTo = jest.fn();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn(() => ({ matches: false })),
    });
    setGeometry();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete global.chrome;
    delete global.LSScrollWidget;
  });

  test('creates one rail with up and down buttons', () => {
    const widget = require('../scroll-widget.js');
    widget.createScrollWidget();
    widget.createScrollWidget();

    const rail = document.getElementById('ls-scroll-widget');
    expect(rail).toBeTruthy();
    expect(document.querySelectorAll('#ls-scroll-widget')).toHaveLength(1);
    expect(rail.getAttribute('role')).toBe('group');

    const buttons = rail.querySelectorAll('.ls-scroll-widget__button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('aria-label')).toBe('В начало страницы');
    expect(buttons[1].getAttribute('aria-label')).toBe('В конец страницы');
    expect(buttons[0].title).toBe('В начало');
    expect(buttons[1].title).toBe('В конец');
  });

  test('scrolls to the top and to the bottom of the page', () => {
    setGeometry({ top: 500, height: 3000, viewport: 1000 });

    const widget = require('../scroll-widget.js');
    widget.createScrollWidget();

    widget.scrollToBottom();
    expect(window.scrollTo).toHaveBeenLastCalledWith({
      top: 2000,
      behavior: 'smooth',
    });

    widget.scrollToTop();
    expect(window.scrollTo).toHaveBeenLastCalledWith({
      top: 0,
      behavior: 'smooth',
    });
  });

  test('uses instant scrolling when reduced motion is preferred', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn(() => ({ matches: true })),
    });

    const widget = require('../scroll-widget.js');
    widget.createScrollWidget();
    widget.scrollToBottom();

    expect(widget.getScrollBehavior(window)).toBe('auto');
    expect(window.scrollTo).toHaveBeenLastCalledWith({
      top: 2000,
      behavior: 'auto',
    });
  });

  test('disables the button that cannot move further', () => {
    setGeometry({ top: 0, height: 3000, viewport: 1000 });

    const widget = require('../scroll-widget.js');
    widget.createScrollWidget();

    const up = document.querySelector('.ls-scroll-widget__button--up');
    const down = document.querySelector('.ls-scroll-widget__button--down');
    expect(up.disabled).toBe(true);
    expect(down.disabled).toBe(false);

    setGeometry({ top: 2000, height: 3000, viewport: 1000 });
    widget.updateScrollWidget();

    expect(up.disabled).toBe(false);
    expect(down.disabled).toBe(true);
  });

  test('hides the rail when the page has nowhere to scroll', () => {
    setGeometry({ top: 0, height: 500, viewport: 1000 });

    const widget = require('../scroll-widget.js');
    widget.createScrollWidget();

    expect(document.getElementById('ls-scroll-widget').hidden).toBe(true);
  });

  test('removes the rail when the extension is disabled and restores it', () => {
    const widget = require('../scroll-widget.js');
    widget.createScrollWidget();

    widget.setExtensionEnabled(false);
    expect(document.getElementById('ls-scroll-widget')).toBeNull();

    widget.setExtensionEnabled(true);
    expect(document.getElementById('ls-scroll-widget')).toBeTruthy();
  });

  test('reads the master switch and reacts to storage changes', async () => {
    const chromeMock = createChromeMock({ isEnabled: false });
    global.chrome = chromeMock;

    const widget = require('../scroll-widget.js');
    await widget.initScrollWidget();

    expect(document.getElementById('ls-scroll-widget')).toBeNull();

    chromeMock.emitStorage({ isEnabled: { newValue: true } });
    expect(document.getElementById('ls-scroll-widget')).toBeTruthy();

    chromeMock.emitStorage({ isEnabled: { newValue: false } });
    expect(document.getElementById('ls-scroll-widget')).toBeNull();
  });

  test('reacts to the background extension state message', async () => {
    const chromeMock = createChromeMock({ isEnabled: true });
    global.chrome = chromeMock;

    const widget = require('../scroll-widget.js');
    await widget.initScrollWidget();

    expect(document.getElementById('ls-scroll-widget')).toBeTruthy();

    chromeMock.emitMessage({
      action: 'extensionEnabledChanged',
      enabled: false,
    });
    expect(document.getElementById('ls-scroll-widget')).toBeNull();

    chromeMock.emitMessage({
      action: 'extensionEnabledChanged',
      enabled: true,
    });
    expect(document.getElementById('ls-scroll-widget')).toBeTruthy();
  });
});
