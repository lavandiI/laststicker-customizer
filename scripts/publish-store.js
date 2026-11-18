#!/usr/bin/env node
/**
 * Upload the packaged extension to the Chrome Web Store.
 *
 * The developer dashboard cannot be automated: Chrome blocks both navigation
 * and debugging for chrome.google.com/webstore and chromewebstore.google.com,
 * so the official API is the only scriptable path.
 *
 * Credentials come from the environment (see store/api-upload.md):
 *   CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, CWS_EXTENSION_ID
 *
 * Usage:
 *   node scripts/publish-store.js                 # upload the current version
 *   node scripts/publish-store.js --zip path.zip  # upload a specific archive
 *   node scripts/publish-store.js --publish       # upload and submit for review
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/chromewebstore/v1.1/items';

function parseArgs(argv) {
  const args = { publish: false, zip: null };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--publish') args.publish = true;
    else if (value === '--zip') {
      args.zip = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function currentVersion() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'),
  );
  return manifest.version;
}

function resolveZip(args) {
  if (args.zip) return path.resolve(args.zip);
  return path.join(root, 'dist', `laststicker-search-${currentVersion()}.zip`);
}

function readCredentials() {
  const credentials = {
    clientId: process.env.CWS_CLIENT_ID,
    clientSecret: process.env.CWS_CLIENT_SECRET,
    refreshToken: process.env.CWS_REFRESH_TOKEN,
    extensionId: process.env.CWS_EXTENSION_ID,
  };

  const missing = Object.entries({
    CWS_CLIENT_ID: credentials.clientId,
    CWS_CLIENT_SECRET: credentials.clientSecret,
    CWS_REFRESH_TOKEN: credentials.refreshToken,
    CWS_EXTENSION_ID: credentials.extensionId,
  })
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length) {
    throw new Error(
      `Не заданы переменные окружения: ${missing.join(', ')}.\n` +
        'Как их получить — store/api-upload.md.',
    );
  }

  return credentials;
}

async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Не удалось получить токен: HTTP ${response.status} ${text}`);
  }

  const data = JSON.parse(text);
  if (!data.access_token) {
    throw new Error('Ответ без access_token: ' + text);
  }

  return data.access_token;
}

async function uploadPackage(token, extensionId, zipPath) {
  const archive = fs.readFileSync(zipPath);

  const response = await fetch(`${API}/${extensionId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-api-version': '2',
      'Content-Type': 'application/zip',
    },
    body: archive,
  });

  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // Some failures come back as plain text.
  }

  if (!response.ok) {
    throw new Error(`Загрузка не удалась: HTTP ${response.status} ${text}`);
  }

  const state = data && data.uploadState;
  if (state && state !== 'SUCCESS') {
    const details = (data.itemError || [])
      .map((item) => `${item.error_code || ''} ${item.error_detail || ''}`.trim())
      .join('; ');
    throw new Error(`Загрузка не принята (${state}): ${details || text}`);
  }

  return data;
}

async function publishItem(token, extensionId) {
  const response = await fetch(`${API}/${extensionId}/publish?publishTarget=default`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-api-version': '2',
      'Content-Length': '0',
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Публикация не удалась: HTTP ${response.status} ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const zipPath = resolveZip(args);

  if (!fs.existsSync(zipPath)) {
    throw new Error(
      `Нет файла ${zipPath}. Соберите пакет: npm run package.`,
    );
  }

  const credentials = readCredentials();
  const token = await getAccessToken(credentials);

  console.log(`Загружаю ${path.relative(root, zipPath)} (${fs.statSync(zipPath).size} байт)…`);
  const uploaded = await uploadPackage(token, credentials.extensionId, zipPath);
  console.log(
    `Загрузка: ${uploaded && uploaded.uploadState ? uploaded.uploadState : 'SUCCESS'}` +
      (uploaded && uploaded.id ? `, item ${uploaded.id}` : ''),
  );

  if (!args.publish) {
    console.log(
      'Пакет загружен в черновик. Отправка на проверку не выполнялась: ' +
        'запустите с --publish, когда карточка и политика готовы.',
    );
    return;
  }

  const published = await publishItem(token, credentials.extensionId);
  console.log('Отправлено на проверку:', JSON.stringify(published.status || published));
}

main().catch((error) => {
  console.error('Ошибка:', error.message);
  process.exitCode = 1;
});
