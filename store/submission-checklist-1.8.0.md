# Публикация LastSticker Customizer 1.8.0 в Chrome Web Store

## 0. Текущее состояние

- В Store опубликована **1.8.0** (см. `README.md`). Предыдущая опубликованная версия — 1.7.1.
- Версия **1.8.0** подготовлена в ветке `release/1.8.0`; в неё входят все накопленные изменения после 1.7.1.
- **Новое разрешение: `unlimitedStorage`.** Оно не даёт доступа к новым данным, но ревью сверяет набор прав с листингом — обоснование уже добавлено в `store/listing-ru.md` и в политику.
- Подробное описание: `store/description-1.8.0.txt`.
- Что нового: `store/whats-new-1.8.0.txt`.
- Описание карточки: `store/listing-ru.md`.
- Политика: `PRIVACY.md`, `docs/privacy.html`.
- Release notes для GitHub: `store/release-notes-1.8.0.md`.
- Промо и скриншоты: файлы `*-1.7.1.*` — интерфейс визуально не менялся, снимки переиспользуются.
- **Не отправлять на проверку без отдельного согласования.**

## 1. Проверить версию и собрать ZIP

```bash
git checkout release/1.8.0
npm ci
npm test -- --runInBand --coverage
npm run lint
npm run package
```

Проверить:

- в `manifest.json`, `package.json` и `package-lock.json` версия **1.8.0**;
- ZIP: `dist/laststicker-search-1.8.0.zip`, внутри `manifest.json` в корне и версия 1.8.0;
- в списке прав появился `unlimitedStorage`;
- внутри есть `job-state.js`, `keepalive.js`, `auto-update.js`, `auction-favorites.js`,
  `collections-filter.js`, `collections-filter.css`, `welcome.*`, `theme.*`, `popup.*`,
  `scroll-widget.*`, `icons/black/*`;
- нет файлов трекинга, тестов, `node_modules`, `docs/`, `store/` и `AUDIT.md`;
- SHA256 совпадает с тем, что указан в описании релиза.

Список файлов пакета проверяется тестом `tests/package.test.js`: он сверяет `scripts/runtime-files.js`
с `manifest.json`, `offscreen.html`, страницами расширения и `importScripts` в service worker.

## 2. Загрузить пакет и заполнить карточку

1. Открыть Chrome Web Store Developer Dashboard → LastSticker Customizer.
2. Проверить, что обновлённая политика уже опубликована (`docs/privacy.html` на GitHub Pages):
   в ней должен быть пункт про `unlimitedStorage` и список из четырёх разрешений плюс host permissions.
3. В разделе **Пакет** загрузить `dist/laststicker-search-1.8.0.zip` и проверить, что черновик — **1.8.0**.
4. Вставить подробное описание из `store/description-1.8.0.txt`.
5. В поле **What's new** вставить `store/whats-new-1.8.0.txt`.
6. В разделе **Privacy practices** ничего не меняется: данные по-прежнему только локальные,
   remote code — No, но проверьте, что обоснование `unlimitedStorage` совпадает с листингом.
7. Скриншоты и промо оставить прежними (файлы `*-1.7.1.*`): визуальных изменений нет,
   новые снимки не требуются.
8. **Не отправлять на проверку** до отдельного согласования.

## 3. После публикации

- Проверить, что Chrome предлагает обновление 1.7.1 → 1.8.0 и после него индекс и настройки на месте
  (они привязаны к ID расширения, а не к версии).
- Проверить, что при первом запуске после обновления открывается экран «Что нового» с текстом 1.8.0.
- Открыть `laststicker.ru`, убедиться, что панель поиска, тема, фильтр коллекций и звёздочки работают.
- Прогнать ручную проверку темы по `docs/theme-qa.md`.

## 4. Откат

- Прежний ZIP: `laststicker-search-1.7.1.zip` из релиза v1.7.1.
- Откат безопасен для пользовательских данных: формат `chrome.storage.local` и IndexedDB не менялся.
- Удаление разрешения `unlimitedStorage` при откате вернёт квоту 5–10 МБ — на больших архивах
  запись индекса снова может не пройти.
