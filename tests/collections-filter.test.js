const {
  getHuntColumnIndex,
  isHuntMarked,
  applyHuntFilter,
  initCollectionsFilter,
  removeCollectionsFilter,
} = require('../collections-filter');

function createCollectionDocument() {
  document.body.innerHTML = `
    <table id="checklist">
      <thead>
        <tr>
          <th>№</th>
          <th>Название</th>
          <th>Фото</th>
          <th>Раздел</th>
          <th>Тип</th>
          <th>Ищут</th>
        </tr>
        <tr class="tablesorter-filter-row">
          <td><input class="tablesorter-filter disabled" disabled /></td>
          <td><input class="tablesorter-filter" /></td>
          <td><input class="tablesorter-filter disabled" disabled /></td>
          <td><select class="tablesorter-filter"></select></td>
          <td><select class="tablesorter-filter"></select></td>
          <td><input class="tablesorter-filter disabled" data-column="5" disabled /></td>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>Обычная</td><td></td><td>A</td><td>-</td><td>38</td></tr>
        <tr><td>2</td><td>Нужная</td><td></td><td>A</td><td>-</td><td class="i_need">74 <sup>1</sup></td></tr>
        <tr><td>3</td><td>Без спроса</td><td></td><td>A</td><td>-</td><td>0</td></tr>
        <tr class="filtered"><td>4</td><td>Скрыта фильтром</td><td></td><td>A</td><td>-</td><td class="i_need">80 <sup>2</sup></td></tr>
      </tbody>
    </table>
    <div id="checklist_count"></div>
  `;
  return document;
}

describe('collection hunt filter', () => {
  test('finds the Ищут column and recognises the personal marker', () => {
    const doc = createCollectionDocument();
    const table = doc.getElementById('checklist');

    expect(getHuntColumnIndex(table)).toBe(5);
    expect(isHuntMarked(table.querySelectorAll('tbody tr')[1].children[5])).toBe(
      true,
    );
    expect(isHuntMarked(table.querySelectorAll('tbody tr')[0].children[5])).toBe(
      false,
    );
  });

  test('adds the Все / Я ищу select and filters only marked rows', () => {
    const doc = createCollectionDocument();
    const table = doc.getElementById('checklist');

    expect(initCollectionsFilter(doc)).toBe(true);
    expect(initCollectionsFilter(doc)).toBe(true);

    const select = doc.querySelector('.ls-customizer-filter');
    expect(select).not.toBeNull();
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(
      ['Все', 'Я ищу'],
    );
    expect(doc.querySelector('input[data-column="5"]').style.display).toBe(
      'none',
    );

    select.value = 'me';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    expect(rows[0].classList.contains('ls-hunt-hidden')).toBe(true);
    expect(rows[1].classList.contains('ls-hunt-hidden')).toBe(false);
    expect(rows[2].classList.contains('ls-hunt-hidden')).toBe(true);
    expect(rows[3].classList.contains('ls-hunt-hidden')).toBe(false);
    expect(doc.getElementById('checklist_count').textContent).toBe(
      'Показано 1 из 4',
    );

    select.value = 'all';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(rows[0].classList.contains('ls-hunt-hidden')).toBe(false);
    expect(rows[1].classList.contains('ls-hunt-hidden')).toBe(false);
    expect(rows[2].classList.contains('ls-hunt-hidden')).toBe(false);
    expect(doc.getElementById('checklist_count').textContent).toBe(
      'Показано 3 из 4',
    );
  });

  test('keeps tablesorter filtered rows out of the visible count', () => {
    const doc = createCollectionDocument();
    const table = doc.getElementById('checklist');

    const result = applyHuntFilter(table, 'me', doc);

    expect(result).toEqual({ visible: 1, total: 4 });
    expect(doc.getElementById('checklist_count').textContent).toBe(
      'Показано 1 из 4',
    );
  });

  test('removes the filter and restores the table when the extension is disabled', () => {
    const doc = createCollectionDocument();
    const table = doc.getElementById('checklist');

    expect(initCollectionsFilter(doc)).toBe(true);
    const select = doc.querySelector('.ls-customizer-filter');
    select.value = 'me';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(removeCollectionsFilter(doc)).toBe(true);
    expect(doc.querySelector('.ls-customizer-filter')).toBeNull();
    expect(doc.querySelector('input[data-column="5"]').style.display).toBe('');
    expect(
      Array.from(table.querySelectorAll('tbody tr')).some((row) =>
        row.classList.contains('ls-hunt-hidden'),
      ),
    ).toBe(false);
    expect(doc.getElementById('checklist_count').textContent).toBe(
      'Показано 4 из 4',
    );
  });
});
