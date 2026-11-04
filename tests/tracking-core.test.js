const core = require('../tracking-core.js');

describe('tracking core', () => {
  test('detects Russian and Belarusian tracking numbers', () => {
    expect(core.detectOperator('RR123456789BY')).toBe('belpost');
    expect(core.detectOperator('rr123456789by')).toBe('belpost');
    expect(core.detectOperator('RA644000001RU')).toBe('pochta');
    expect(core.detectOperator('45005145009749')).toBe('pochta');
    expect(core.detectOperator('1234567890123', 'Белпочта')).toBe('belpost');
    expect(core.detectOperator('1234567890123')).toBeNull();
    expect(core.detectOperator('ABC')).toBeNull();
  });

  test('finds numbers and keeps their positions', () => {
    const text = 'Трек RR123456789BY и 45005145009749, ещё 1234567890123.';
    const matches = core.findMatches(text);

    expect(matches.map((match) => match.value)).toEqual(['RR123456789BY', '45005145009749']);
    expect(matches.map((match) => match.operator)).toEqual(['belpost', 'pochta']);
    expect(text.slice(matches[0].start, matches[0].end)).toBe('RR123456789BY');
  });

  test('links a standalone 13-digit Belpost number', () => {
    const matches = core.findMatches('1234567890123');
    expect(matches).toHaveLength(1);
    expect(matches[0].operator).toBe('belpost');
  });

  test('builds official fallback URLs', () => {
    expect(core.officialUrl('RR123456789BY', 'belpost')).toBe(
      'https://belpost.by/Otsleditotpravleniye?number=RR123456789BY',
    );
    expect(core.officialUrl('RA644000001RU', 'pochta')).toBe(
      'https://www.pochta.ru/tracking?barcode=RA644000001RU',
    );
  });

  test('formats event dates and keeps invalid input readable', () => {
    expect(core.formatEventDate('2025-07-30 19:58:17')).toMatch(/30\.07\.2025/);
    expect(core.formatEventDate('')).toBe('');
    expect(core.formatEventDate('not-a-date')).toBe('not-a-date');
  });
});
