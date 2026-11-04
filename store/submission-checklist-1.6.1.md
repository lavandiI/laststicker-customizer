# Публикация LastSticker Search 1.6.1 в Chrome Web Store

> 1.6.1 опубликована. Актуальный чек-лист — `store/submission-checklist-1.6.2.md`.

## 0. Что уже готово

- 1.5.0 опубликована; 1.6.0 не публикуем, сразу выпускаем **1.6.1**.
- Ветка подготовки: `release/1.6.1`.
- В 1.6.1 входят: тёмная тема, мастер-выключатель, чёрная иконка, Welcome page.
- Новых разрешений нет: `storage`, `scripting`, `offscreen`, `alarms`, host permissions.
- Тексты карточки: `store/listing-ru.md`.
- Подробное описание: `store/description-1.6.1.txt`.
- Что нового: `store/whats-new-1.6.1.txt`.
- Политика: `PRIVACY.md` и `docs/privacy.html`.

## 1. Проверить версию и собрать ZIP

```bash
git checkout release/1.6.1
npm ci
npm test -- --runInBand
npm run lint
npm run package
```

Проверить, что:

- в `manifest.json` и `package.json` версия **1.6.1**;
- ZIP содержит `manifest.json` в корне, а не во вложенной папке;
- внутри есть `theme.css`, `theme.js`, `theme-core.js`, `theme-store.js`, `popup.html`, `popup.css`, `popup.js`;
- внутри есть `welcome.html`, `welcome.css`, `welcome.js`;
- внутри есть `icons/black/icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`;
- в `manifest.json` есть `action.default_popup` и content script темы на `document_start`;
- popup содержит мастер-выключатель «Расширение» и не содержит выбора области «сайт/панели»;
- новых разрешений нет.

## 2. Публичный URL политики

- главная: https://lavandii.github.io/laststicker-search/
- политика: https://lavandii.github.io/laststicker-search/privacy.html
- поддержка: https://github.com/lavandiI/laststicker-search/issues

## 3. Скриншоты

Пять файлов 1280×800, 24-бит PNG без альфа-канала:

1. `store/screenshot-dialogs-1.5.0.png` — поиск по всем диалогам.
2. `store/screenshot-forum-1.5.0.png` — глобальный поиск по темам форума.
3. `store/screenshot-theme-1.6.0.png` — тёмная тема, панель темы и жёлтая подсветка.
4. `store/screenshot-forum-indexing-1.5.0.png` — прогресс индексации темы.
5. `store/screenshot-highlight-1.5.0.png` — жёлтая подсветка результата и комментария.

В Dashboard оставить эти пять; скриншот темы уже стоит с 1.6.0. В кадре нет реальных имён и сообщений — данные демонстрационные.

Рекламные изображения:

- `store/promo-440x280.png` — 440×280 PNG, **Small promo tile**;
- `store/marquee-1400x560.jpg` — 1400×560 JPEG, **Marquee promo tile**.

## 4. Загрузить в Chrome Web Store

1. Открыть https://chrome.google.com/webstore/devconsole
2. Выбрать **LastSticker Search**.
3. Открыть **Package → Upload new package** и загрузить `laststicker-search-1.6.1.zip`.
4. Проверить карточку:
   - название: `LastSticker Search`;
   - краткое описание берётся из `manifest.json` → `description`;
   - подробное описание вставить из `store/description-1.6.1.txt`;
   - категория: Tools (группа Productivity);
   - язык: Русский;
   - иконка 128×128 уже внутри ZIP.
5. В **What's new** вставить `store/whats-new-1.6.1.txt`.
6. Проверить **Privacy practices**:
   - single purpose: диалоги и форум laststicker.ru;
   - обоснования `storage`, `scripting`, `offscreen`, `alarms`, host permissions;
   - data usage: Personal communications, Website content, Personally identifiable information — только локальное хранение;
   - настройки, состояние выключателя и Welcome page — локально, без аналитики;
   - remote code: No;
   - privacy policy URL.
7. Проверить видимость: **Public — опубликовано для всех**.
8. Отправить на review.

## 5. После публикации

Chrome обновит расширение у пользователей. Проверить:

- карточка показывает 1.6.1;
- клик по иконке открывает popup с мастер-выключателем;
- выключение гасит панель, тему и индексацию, иконка становится чёрной;
- после обновления с 1.5.0 открывается Welcome page;
- кнопка «Включить расширение» на Welcome page работает.

Для следующей версии:

- обновить `CHANGELOG.md` и версии в `manifest.json`/`package.json`;
- не менять уже опубликованный пакет;
- повторить проверки и загрузку.
