# Публикация LastSticker Search 1.7.0 в Chrome Web Store

## 0. Что уже готово

- В Store опубликована **1.6.1**. Черновик 1.6.2 не отправлялся.
- 1.7.0 включает 1.6.2 и маршруты по трек-номерам.
- Ветка подготовки: `release/1.7.0`.
- Новых обязательных разрешений нет. Добавлены необязательные host permissions для `www.pochta.ru` и `api.belpost.by`; они запрашиваются только при включении маршрута.
- Подробное описание: `store/description-1.7.0.txt`.
- Что нового: `store/whats-new-1.7.0.txt`.
- Политика: `PRIVACY.md`, `docs/privacy.html`.

## 1. Проверить версию и собрать ZIP

```bash
git checkout release/1.7.0
npm ci
npm test -- --runInBand
npm run lint
npm run package
```

Проверить, что:

- в `manifest.json` и `package.json` версия **1.7.0**;
- ZIP содержит `manifest.json` в корне;
- внутри есть `tracking-core.js`, `tracking-api.js`, `tracking.js`, `tracking.css`;
- внутри есть `scroll-widget.*`, `theme.*`, `popup.*`, `welcome.*`, `icons/black/*`;
- в `manifest.json` есть `optional_host_permissions`, а не обязательные host permissions для сайтов операторов.

## 2. Загрузить в Chrome Web Store

1. Открыть https://chrome.google.com/webstore/devconsole
2. Выбрать **LastSticker Search**.
3. **Package → Upload new package** → `dist/laststicker-search-1.7.0.zip`.
4. Проверить черновик: версия **1.7.0**, обязательные разрешения не изменились.
5. Вставить описание из `store/description-1.7.0.txt`.
6. Вставить What's new из `store/whats-new-1.7.0.txt`, если поле доступно.
7. Проверить Privacy practices: remote code — No; трек-номер отправляется оператору только по клику; optional host permissions обоснованы.
   - В обосновании host permissions указать: доступ к `laststicker.ru` нужен для поиска, а необязательный доступ к `www.pochta.ru` и `api.belpost.by` — только для показа маршрута после клика.
   - В data usage отметить, что трек-номер передаётся оператору только по действию пользователя.
8. Отправить на проверку.

## 3. После публикации

- Проверить, что карточка показывает 1.7.0.
- Включить «Маршрут по трек-номеру» и выдать разрешения.
- Проверить ссылку и карточку маршрута для Почты России и Белпочты.
- Проверить светлую и тёмную тему, кэш и кнопку «Обновить».
- Выключить мастер-выключатель — ссылки и карточки должны исчезнуть.
