const fs = require('fs');
const path = require('path');

// Comments hold colour values too ("white on #ff6b35 is 2.8:1"), so they are
// stripped before any counting.
const rawCss = fs.readFileSync(path.join(__dirname, '..', 'theme.css'), 'utf8');
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');

function blockBody(selector) {
  const start = css.indexOf(selector);
  if (start < 0) return '';

  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  if (open < 0 || close < 0) return '';

  return css.slice(open + 1, close);
}

function collect(source, pattern) {
  const found = new Set();
  const regex = new RegExp(pattern.source, pattern.flags);
  let match = regex.exec(source);

  while (match) {
    found.add(match[1]);
    match = regex.exec(source);
  }

  return found;
}

const usedTokens = () => collect(css, /var\((--ls-[a-z0-9-]+)/g);
const definedTokens = (source) =>
  collect(source, /(--ls-[a-z0-9-]+)\s*:/g);

const ROOT = "html[data-ls-theme='dark'] {";
const PALETTES = {
  black: "html[data-ls-theme='dark'][data-ls-palette='black'] {",
  sapphire: "html[data-ls-theme='dark'][data-ls-palette='sapphire'] {",
};

// Surfaces that were literal colours tuned for the graphite palette.
const ACCENT_TOKENS = [
  '--ls-ok-bg',
  '--ls-warn-bg',
  '--ls-danger-bg',
  '--ls-hidden-bg',
  '--ls-selected',
  '--ls-new-comment-bg',
  '--ls-special',
  '--ls-counter-bg',
];

describe('theme.css invariants', () => {
  test('defines every custom property it uses', () => {
    const defined = definedTokens(blockBody(ROOT));
    const missing = Array.from(usedTokens()).filter(
      (name) => !defined.has(name),
    );

    expect(missing).toEqual([]);
  });

  test('defines the accent surfaces in every palette', () => {
    const missingByPalette = {};

    Object.entries(PALETTES).forEach(([name, selector]) => {
      const defined = definedTokens(blockBody(selector));
      missingByPalette[name] = ACCENT_TOKENS.filter(
        (token) => !defined.has(token),
      );
    });

    expect(missingByPalette).toEqual({ black: [], sapphire: [] });
  });

  test('never lets a custom property refer to itself', () => {
    expect(css.match(/(--ls-[a-z0-9-]+)\s*:\s*var\(\1\)/)).toBeNull();
  });

  test('keeps a literal accent colour only in its token definition', () => {
    const literals = [
      '#16281f',
      '#3a2f12',
      '#2e1a1a',
      '#3a1d2a',
      '#2a3a6a',
      '#1d2a33',
      '#4b4b9a',
      '#4a5a8a',
      '#ff6b35',
    ];

    const counts = {};
    literals.forEach((hex) => {
      counts[hex] = css.split(hex).length - 1;
    });

    expect(counts).toEqual(
      Object.fromEntries(literals.map((hex) => [hex, 1])),
    );
  });

  test('resets the palette for printing', () => {
    const printIndex = css.indexOf('@media print');
    expect(printIndex).toBeGreaterThan(-1);
    expect(css.slice(printIndex)).toContain('background: #ffffff');
    expect(definedTokens(css.slice(printIndex)).has('--ls-text')).toBe(true);
  });

  test('has balanced braces', () => {
    const open = (css.match(/{/g) || []).length;
    const close = (css.match(/}/g) || []).length;

    expect(open).toBe(close);
  });
});
