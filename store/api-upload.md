# Загрузка пакета в Chrome Web Store из терминала

Консоль разработчика нельзя автоматизировать: Chrome блокирует и переход, и
подключение отладчика к `chrome.google.com/webstore` и
`chromewebstore.google.com`. Поэтому единственный сценарный путь — официальный
Chrome Web Store API. Настройка делается один раз, дальше загрузка — одна строка.

## 1. Включить API и создать OAuth-клиент

1. В [Google Cloud Console](https://console.cloud.google.com/) создайте проект
   (или возьмите существующий).
2. **APIs & Services → Library** → найдите **Chrome Web Store API** → **Enable**.
3. **APIs & Services → OAuth consent screen**: тип **External**, добавьте себя в
   **Test users**. Публикация приложения не нужна.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   тип **Desktop app**. Сохраните `Client ID` и `Client secret`.

## 2. Получить refresh token

Откройте [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/):

1. Шестерёнка справа вверху → **Use your own OAuth credentials** → вставьте
   `Client ID` и `Client secret`.
2. В поле **Input your own scopes** введите:
   `https://www.googleapis.com/auth/chromewebstore`
3. **Authorize APIs** → войдите тем аккаунтом, у которого есть доступ к карточке
   расширения → **Exchange authorization code for tokens**.
4. Скопируйте **Refresh token**.

Scope `chromewebstore` даёт право загружать пакеты и отправлять их на проверку.
Токен бессрочный, пока вы не отзовёте доступ.

## 3. ID расширения

`CWS_EXTENSION_ID` — это 32-символьный ID карточки, не путать с ID локальной
установки. Он виден в консоли разработчика и в URL карточки вида
`.../detail/<slug>/<id>`.

## 4. Задать переменные и загрузить

PowerShell (на текущую сессию):

```powershell
$env:CWS_CLIENT_ID     = "…apps.googleusercontent.com"
$env:CWS_CLIENT_SECRET = "…"
$env:CWS_REFRESH_TOKEN = "…"
$env:CWS_EXTENSION_ID  = "gnifahljoihlmlekcmgcoaflchhdicoc"

npm run package
npm run publish:store
```

Скрипт загружает `dist/laststicker-search-<версия>.zip` в черновик и **не**
отправляет его на проверку. Когда карточка и политика готовы:

```powershell
npm run publish:store -- --publish
```

## Что скрипт проверяет

- версия ZIP берётся из `manifest.json`, поэтому случайно загрузить старый
  архив из `dist/` не получится, если собирать через `npm run package`;
- ответ API разбирается: при `uploadState: FAILURE` печатаются коды ошибок
  (`itemError`), а не «успех»;
- `--publish` — отдельный флаг, потому что чек-лист запрещает отправку на
  проверку без согласования.

## Если что-то не так

| Ответ | Причина |
| --- | --- |
| `401` / `invalid_grant` | refresh token отозван или выпущен для другого клиента — получите заново |
| `403` + `PERMISSION_DENIED` | у аккаунта нет доступа к карточке, либо не включён Chrome Web Store API |
| `uploadState: FAILURE` | пакет не прошёл валидацию: версия не выше опубликованной, битый `manifest.json`, лишние файлы |

## Про Windows и SHA

ZIP собирается локально из рабочей копии, а она на Windows содержит CRLF, поэтому
SHA локального архива отличается от архива из GitHub-релиза (там LF). Для Store
это не важно — важна версия внутри `manifest.json`. Если нужен побайтово тот же
файл, что в релизе, скачайте его: `gh release download v<версия> --pattern '*.zip'`.
