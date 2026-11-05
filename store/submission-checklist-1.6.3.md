# Публикация LastSticker Search 1.6.3 в Chrome Web Store

## 0. Что уже готово

- В Store опубликована **1.6.1**.
- Черновик **1.6.3** загружен: пакет, описание, пять скриншотов и Privacy practices.
- 1.6.3 возвращает функциональность 1.6.2 и добавляет переключатель «Быстрая прокрутка».
- Ветка подготовки: `release/1.6.3`.
- Новых разрешений нет. Только `storage`, `scripting`, `offscreen`, `alarms`, host permissions.
- Подробное описание: `store/description-1.6.3.txt`.
- Что нового: `store/whats-new-1.6.3.txt`.
- Политика: `PRIVACY.md`, `docs/privacy.html`.

## 1. Проверить версию и собрать ZIP

```bash
git checkout release/1.6.3
npm ci
npm test -- --runInBand
npm run lint
npm run package
```

Проверить, что:

- в `manifest.json` и `package.json` версия **1.6.3**;
- ZIP содержит `manifest.json` в корне;
- внутри есть `scroll-widget.js` и `scroll-widget.css`;
- внутри есть `theme.*`, `popup.*`, `welcome.*`, `icons/black/*`;
- в `manifest.json` нет `optional_host_permissions` и разрешений для сайтов почты.

## 2. Проверить и отправить в Chrome Web Store

1. Открыть https://chrome.google.com/webstore/devconsole
2. Выбрать **LastSticker Search**.
3. Проверить **Package**: черновик **1.6.3**, опубликовано **1.6.1**.
4. Проверить описание из `store/description-1.6.3.txt` (3755 символов).
5. Проверить, что в карточке пять скриншотов: диалоги, форум, тёмная тема, настройки и подсветка.
6. Проверить Privacy practices: remote code — No; данные — локально; разрешения не расширены.
7. Отправить на проверку.

## 3. После публикации

- Проверить, что карточка показывает 1.6.3.
- Включить и выключить «Быстрая прокрутка» в popup.
- Убедиться, что кнопки ↑ и ↓ исчезают и возвращаются без перезагрузки.
- Проверить светлую и тёмную тему.
- Выключить мастер-выключатель — кнопки должны исчезнуть.
