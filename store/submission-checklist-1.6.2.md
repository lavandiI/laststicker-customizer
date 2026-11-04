# Публикация LastSticker Search 1.6.2 в Chrome Web Store

> 1.6.2 загружена как черновик, но не отправлялась. Актуальный чек-лист — `store/submission-checklist-1.6.3.md`.

## 0. Что уже готово

- В Store опубликована **1.6.1**.
- Черновик **1.6.2** загружен в Store: пакет, описание и пять скриншотов готовы.
- 1.6.2 включает функции 1.6.1 и быструю прокрутку страницы.
- Ветка подготовки: `release/1.6.2`.
- Новых разрешений нет: `storage`, `scripting`, `offscreen`, `alarms`, host permissions.
- Тексты карточки: `store/listing-ru.md`.
- Подробное описание: `store/description-1.6.2.txt`.
- Что нового: `store/whats-new-1.6.2.txt`.
- Политика: `PRIVACY.md` и `docs/privacy.html`.

## 1. Проверить версию и собрать ZIP

```bash
git checkout release/1.6.2
npm ci
npm test -- --runInBand
npm run lint
npm run package
```

Проверить, что:

- в `manifest.json` и `package.json` версия **1.6.2**;
- ZIP содержит `manifest.json` в корне;
- внутри есть `scroll-widget.js` и `scroll-widget.css`;
- внутри есть `theme.*`, `popup.*`, `welcome.*`, `icons/black/*`;
- в `manifest.json` есть `action.default_popup`;
- новых разрешений нет.

## 2. Проверить и отправить в Chrome Web Store

1. Открыть https://chrome.google.com/webstore/devconsole
2. Выбрать **LastSticker Search**.
3. Проверить **Package**: черновик **1.6.2**, опубликовано **1.6.1**.
4. Проверить описание из `store/description-1.6.2.txt` (3592 символа).
5. Проверить, что в карточке пять скриншотов, включая тёмную тему.
6. Проверить Privacy practices: remote code — No, данные — локально.
7. Отправить на проверку.

## 3. После публикации

- Проверить, что карточка показывает 1.6.2.
- На длинной странице `laststicker.ru` проверить кнопки ↑ и ↓.
- Проверить светлую и тёмную тему, палитру «Чёрная».
- Выключить расширение мастер-выключателем — кнопки должны исчезнуть.
- Включить обратно — кнопки должны вернуться.
