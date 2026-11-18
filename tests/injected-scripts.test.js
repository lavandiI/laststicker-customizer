const fs = require('fs');
const path = require('path');

// background.js and the manifest put several scripts into one page scope:
// chrome.scripting.executeScript files share the isolated world, and every
// content_scripts entry shares one world too. A top-level `const`/`let` with a
// duplicate name makes the *next* script fail with a SyntaxError, and no
// CommonJS-based unit test notices it.
const root = path.join(__dirname, '..');

const SCOPES = {
  // The real isolated world on laststicker.ru: every content script entry plus
  // the files background.js injects into the same world afterwards.
  'content script world': [
    'theme-core.js',
    'theme-store.js',
    'theme.js',
    'scroll-widget.js',
    'content.js',
    'inline-storage.js',
    'inline-ui.js',
    'inline-panel.js',
  ],
  'injected panel': ['inline-storage.js', 'inline-ui.js', 'inline-panel.js'],
  'content scripts': ['scroll-widget.js', 'content.js'],
  theme: ['theme-core.js', 'theme-store.js', 'theme.js'],
};

function readTopLevelDeclarations(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const declarations = [];
  const pattern = /^(const|let|var)\s+([A-Za-z_$][\w$]*)/gm;

  let match = pattern.exec(source);
  while (match) {
    declarations.push({ kind: match[1], name: match[2] });
    match = pattern.exec(source);
  }

  return declarations;
}

// `var` may be redeclared; two lexical declarations (or a mix of `var` and a
// lexical one) throw at parse time.
function isLexical(kind) {
  return kind === 'const' || kind === 'let';
}

function findConflicts(files) {
  const seen = new Map();
  const conflicts = [];

  files.forEach((file) => {
    readTopLevelDeclarations(file).forEach((declaration) => {
      const previous = seen.get(declaration.name);
      if (!previous) {
        seen.set(declaration.name, { file, kind: declaration.kind });
        return;
      }

      const bothVar = !isLexical(previous.kind) && !isLexical(declaration.kind);
      if (!bothVar) {
        conflicts.push(
          `${declaration.name}: ${previous.kind} in ${previous.file}, ${declaration.kind} in ${file}`,
        );
      }
    });
  });

  return conflicts;
}

describe('scripts sharing one page scope', () => {
  Object.entries(SCOPES).forEach(([scope, files]) => {
    test(`${scope} do not redeclare the same lexical name`, () => {
      expect(findConflicts(files)).toEqual([]);
    });
  });

  test('the debug helper is declared with var wherever it is shared', () => {
    const shared = ['content.js', 'inline-storage.js', 'inline-ui.js'].map(
      (file) => ({
        file,
        declaration: readTopLevelDeclarations(file).find(
          (item) => item.name === 'DEBUG_LOG',
        ),
      }),
    );

    // A lexical declaration here breaks the other files with a SyntaxError,
    // which is exactly how the panel failed to boot in 1.8.0.
    expect(shared).toEqual([
      { file: 'content.js', declaration: { kind: 'var', name: 'DEBUG_LOG' } },
      {
        file: 'inline-storage.js',
        declaration: { kind: 'var', name: 'DEBUG_LOG' },
      },
      { file: 'inline-ui.js', declaration: { kind: 'var', name: 'DEBUG_LOG' } },
    ]);
  });
});
