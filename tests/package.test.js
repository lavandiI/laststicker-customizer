const fs = require('fs');
const path = require('path');

const files = require('../scripts/runtime-files.js');
const root = path.join(__dirname, '..');

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const manifest = JSON.parse(readText('manifest.json'));

function collectManifestReferences(source) {
  const references = new Set();
  const add = (value) => {
    if (typeof value === 'string' && value && !/^(?:https?:)?\/\//.test(value)) {
      references.add(value);
    }
  };

  if (source.background) add(source.background.service_worker);
  if (source.action) {
    add(source.action.default_popup);
    Object.values(source.action.default_icon || {}).forEach(add);
  }
  Object.values(source.icons || {}).forEach(add);

  (source.content_scripts || []).forEach((script) => {
    (script.js || []).forEach(add);
    (script.css || []).forEach(add);
  });

  (source.web_accessible_resources || []).forEach((entry) => {
    (entry.resources || []).forEach(add);
  });

  return references;
}

function collectHtmlReferences(relativePath) {
  const html = readText(relativePath);
  const references = new Set();

  const patterns = [
    /<script[^>]+src=["']([^"']+)["']/gi,
    /<link[^>]+href=["']([^"']+)["']/gi,
  ];

  patterns.forEach((pattern) => {
    let match = pattern.exec(html);
    while (match) {
      references.add(match[1]);
      match = pattern.exec(html);
    }
  });

  return references;
}

function collectImportScripts(relativePath) {
  const source = readText(relativePath);
  const references = new Set();
  const pattern = /importScripts\(\s*["']([^"']+)["']\s*\)/g;

  let match = pattern.exec(source);
  while (match) {
    references.add(match[1]);
    match = pattern.exec(source);
  }

  return references;
}

function missingFromPackage(references) {
  return Array.from(references).filter((reference) => !files.includes(reference));
}

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

  test('includes the collection filter', () => {
    expect(files).toEqual(
      expect.arrayContaining(['collections-filter.js', 'collections-filter.css']),
    );
  });

  test('includes the auction favorite stars', () => {
    expect(files).toEqual(expect.arrayContaining(['auction-favorites.js']));
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

  test('ships every file the manifest points to', () => {
    // A script added to the manifest but forgotten here would pass every other
    // check and produce a ZIP that Chrome refuses to load.
    expect(missingFromPackage(collectManifestReferences(manifest))).toEqual([]);
  });

  test('ships every script loaded from the extension pages', () => {
    const pages = ['offscreen.html', 'popup.html', 'welcome.html'];
    const referenced = new Set();

    pages.forEach((page) => {
      collectHtmlReferences(page).forEach((reference) => {
        referenced.add(reference);
      });
    });

    expect(missingFromPackage(referenced)).toEqual([]);
  });

  test('ships every script imported by the service worker', () => {
    expect(missingFromPackage(collectImportScripts('background.js'))).toEqual(
      [],
    );
  });

  test('keeps development files out of the package', () => {
    const forbidden = [
      /^tests\//,
      /^scripts\//,
      /^docs\//,
      /^store\//,
      /^node_modules\//,
      /^dist\//,
      /^\.github\//,
      /\.test\.js$/,
      /^package(?:-lock)?\.json$/,
      /^(?:README|CHANGELOG|AUDIT|PRIVACY)\.md$/,
      /^eslint\.config\.js$/,
      /^jest\.config\.js$/,
      /^\.prettierrc$/,
    ];

    const leaked = files.filter((file) =>
      forbidden.some((pattern) => pattern.test(file)),
    );

    expect(leaked).toEqual([]);
  });
});
