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
    expect(themeScript.js).toEqual(['theme-core.js', 'theme-store.js', 'theme.js']);
  });

  test('injects the quick scroll widget on site pages', () => {
    const contentScript = manifest.content_scripts.find((script) =>
      script.js.includes('content.js'),
    );

    expect(contentScript).toBeTruthy();
    expect(contentScript.js).toEqual(['scroll-widget.js', 'content.js']);
  });

  test('injects the collection filter on card pages', () => {
    const filterScript = manifest.content_scripts.find((script) =>
      script.js.includes('collections-filter.js'),
    );

    expect(filterScript).toBeTruthy();
    expect(filterScript.css).toEqual(['collections-filter.css']);
    expect(filterScript.run_at).toBe('document_idle');
    expect(filterScript.matches).toContain(
      'https://www.laststicker.ru/cards/*',
    );
  });

  test('injects favorite stars on auction list pages', () => {
    const favoritesScript = manifest.content_scripts.find((script) =>
      script.js.includes('auction-favorites.js'),
    );

    expect(favoritesScript).toBeTruthy();
    expect(favoritesScript.js).toEqual(['auction-favorites.js']);
    expect(favoritesScript.run_at).toBe('document_idle');
    expect(favoritesScript.matches).toContain(
      'https://www.laststicker.ru/auction/*',
    );
    expect(favoritesScript.matches).toContain(
      'https://www.laststicker.ru/users/auction/*',
    );
  });
});
