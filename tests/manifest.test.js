const fs = require('fs');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

describe('manifest', () => {
  test('does not request the tabs permission', () => {
    expect(manifest.permissions).not.toContain('tabs');
  });

  test('keeps only the permissions justified in the privacy policy', () => {
    expect(manifest.permissions.sort()).toEqual(['alarms', 'offscreen', 'scripting', 'storage']);
  });

  test('version matches package.json', () => {
    expect(manifest.version).toBe(pkg.version);
  });

  test('opens the theme settings from the toolbar icon', () => {
    expect(manifest.action.default_popup).toBe('popup.html');
  });

  test('injects the theme before the page is painted', () => {
    const themeScript = manifest.content_scripts.find(
      (script) => script.run_at === 'document_start',
    );

    expect(themeScript).toBeTruthy();
    expect(themeScript.css).toContain('theme.css');
    expect(themeScript.css).toContain('scroll-widget.css');
    expect(themeScript.css).toContain('tracking.css');
    expect(themeScript.js).toEqual(['theme-core.js', 'theme-store.js', 'theme.js']);
  });

  test('injects the quick scroll widget and tracking scripts on site pages', () => {
    const contentScript = manifest.content_scripts.find((script) =>
      script.js.includes('content.js'),
    );

    expect(contentScript).toBeTruthy();
    expect(contentScript.js).toEqual([
      'scroll-widget.js',
      'tracking-core.js',
      'tracking.js',
      'content.js',
    ]);
  });

  test('requests tracking hosts only as optional permissions', () => {
    expect(manifest.optional_host_permissions).toEqual([
      'https://www.pochta.ru/*',
      'https://api.belpost.by/*',
    ]);
    expect(manifest.host_permissions).not.toContain(
      'https://www.pochta.ru/*',
    );
    expect(manifest.host_permissions).not.toContain(
      'https://api.belpost.by/*',
    );
  });
});
