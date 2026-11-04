const fs = require('fs');
const path = require('path');

const files = require('../scripts/runtime-files.js');
const root = path.join(__dirname, '..');

describe('runtime package', () => {
  test('includes the disabled icon set', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'icons/black/icon16.png',
        'icons/black/icon32.png',
        'icons/black/icon48.png',
        'icons/black/icon128.png',
      ]),
    );
  });

  test('includes the scroll widget', () => {
    expect(files).toEqual(
      expect.arrayContaining(['scroll-widget.js', 'scroll-widget.css']),
    );
  });

  test('includes the welcome page', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'welcome.html',
        'welcome.css',
        'welcome.js',
      ]),
    );
  });

  test('lists every runtime file once and the file exists', () => {
    expect(new Set(files).size).toBe(files.length);

    const missing = files.filter(
      (file) => !fs.existsSync(path.join(root, file)),
    );
    expect(missing).toEqual([]);
  });
});
