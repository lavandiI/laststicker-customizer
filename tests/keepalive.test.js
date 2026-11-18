describe('offscreen keepalive', () => {
  let keepalive;
  let sent;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    sent = [];

    global.chrome = {
      runtime: {
        lastError: undefined,
        sendMessage: (message, callback) => {
          sent.push(message);
          if (callback) callback({ ok: true });
        },
      },
    };

    keepalive = require('../keepalive');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllTimers();
    delete global.chrome;
  });

  test('sends a heartbeat on every interval', () => {
    const handle = keepalive.start({
      action: 'indexHeartbeat',
      payload: { jobId: 'job-1', kind: 'dialog' },
      intervalMs: 1000,
    });

    expect(sent).toHaveLength(0);

    jest.advanceTimersByTime(1000);
    expect(sent).toEqual([
      { target: 'background', action: 'indexHeartbeat', jobId: 'job-1', kind: 'dialog' },
    ]);

    jest.advanceTimersByTime(2000);
    expect(sent).toHaveLength(3);

    handle.stop();
  });

  test('stops sending after stop()', () => {
    const handle = keepalive.start({ intervalMs: 1000 });
    jest.advanceTimersByTime(1000);
    expect(sent).toHaveLength(1);

    handle.stop();
    jest.advanceTimersByTime(5000);
    expect(sent).toHaveLength(1);
  });

  test('does nothing without the runtime API', () => {
    delete global.chrome;
    jest.resetModules();
    const api = require('../keepalive');

    const handle = api.start({ intervalMs: 1000 });
    jest.advanceTimersByTime(5000);

    expect(sent).toHaveLength(0);
    expect(() => handle.stop()).not.toThrow();
  });

  test('survives a throwing sendMessage', () => {
    global.chrome.runtime.sendMessage = () => {
      throw new Error('Extension context invalidated');
    };

    const handle = keepalive.start({ intervalMs: 1000 });
    expect(() => jest.advanceTimersByTime(1000)).not.toThrow();

    handle.stop();
  });
});
