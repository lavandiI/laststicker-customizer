jest.useFakeTimers();

const { highlightHashMessage } = require('../content');

function setHash(hash) {
  window.history.replaceState(null, '', hash);
}

describe('target highlight', () => {
  beforeEach(() => {
    jest.clearAllTimers();
    document.body.innerHTML = `
      <div class="user_message" id="msg_101"><div>Первое сообщение</div></div>
      <div class="user_message" id="msg_102"><div>Второе сообщение</div></div>
    `;
    Element.prototype.scrollIntoView = jest.fn();
    setHash('#msg_101');
  });

  afterEach(() => {
    setHash('#');
  });

  test('adds the target class and removes it after 8 seconds', () => {
    highlightHashMessage();

    const message = document.getElementById('msg_101');
    expect(message.classList.contains('ls-message-target')).toBe(true);

    jest.advanceTimersByTime(7999);
    expect(message.classList.contains('ls-message-target')).toBe(true);

    jest.advanceTimersByTime(1);
    expect(message.classList.contains('ls-message-target')).toBe(false);
  });

  test('restarts the highlight when jumping to another message', () => {
    highlightHashMessage();
    jest.advanceTimersByTime(3000);

    setHash('#msg_102');
    highlightHashMessage();

    const second = document.getElementById('msg_102');
    expect(second.classList.contains('ls-message-target')).toBe(true);

    jest.advanceTimersByTime(7999);
    expect(second.classList.contains('ls-message-target')).toBe(true);

    jest.advanceTimersByTime(1);
    expect(second.classList.contains('ls-message-target')).toBe(false);
  });
});
