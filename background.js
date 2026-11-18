// Background script for LastSticker Search
// Handles message passing and script injection

importScripts('job-state.js');
importScripts('auto-update.js');
importScripts('forum-storage.js');

const ICONS_ENABLED = {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png'
};

const ICONS_DISABLED = {
  16: 'icons/black/icon16.png',
  32: 'icons/black/icon32.png',
  48: 'icons/black/icon48.png',
  128: 'icons/black/icon128.png'
};

const STORAGE_KEY = 'isEnabled';
const OFFSCREEN_URL = 'offscreen.html';
const AUTO_ALARM = 'ls-auto-index';
const AUTO_INTERVAL_MINUTES = LSAutoUpdate.AUTO_INTERVAL_MINUTES;
const AUTO_ENABLED_KEY = 'ls_search_auto_enabled';
const FULL_INDEX_KEY = 'ls_search_full_index_at';
const LAST_INDEXED_KEY = 'ls_search_last_indexed_at';
const AUTO_META_KEY = 'ls_search_auto_meta';
const MESSAGES_KEY = 'ls_search_messages';
const WELCOME_LAST_KEY = 'ls_welcome_last_version';
const WELCOME_PENDING_KEY = 'ls_welcome_pending';

// The result of the last indexing job. The page reads it through
// chrome.storage.onChanged, so a lost message port (the service worker was
// stopped and restarted mid-job) no longer leaves the panel waiting forever.
const JOB_RESULT_KEY = 'ls_search_job_result';

let activeJob = null;
let activeForumJob = null;
let offscreenCreating = null;
let jobRestorePromise = null;

// chrome.storage.session survives service worker restarts but not a browser
// restart, which is exactly the lifetime of an offscreen indexing job.
function getJobStorage() {
  try {
    return chrome.storage && chrome.storage.session ? chrome.storage.session : null;
  } catch {
    return null;
  }
}

async function rememberActiveJob(job) {
  await LSJobState.write(getJobStorage(), job);
}

async function forgetActiveJob() {
  await LSJobState.clear(getJobStorage());
}

async function isOffscreenJobAlive(record) {
  const action = record.kind === 'forum' ? 'pingForumIndex' : 'pingIndex';

  try {
    const response = await sendToOffscreenOnce({ action, jobId: record.jobId });
    return Boolean(
      response && response.running && response.jobId === record.jobId,
    );
  } catch {
    // No offscreen document, or it does not answer: the job is gone.
    return false;
  }
}

// Rehydrate the job identity after a service worker restart, so progress and
// the finish message are matched instead of dropped as "unknown job". Only the
// id is restored: the response callback cannot survive the restart.
async function restoreActiveJob() {
  // A job that already lives in this worker is newer than the stored record;
  // overwriting it would drop the live response callback.
  if (activeJob || activeForumJob) return;

  const record = await LSJobState.read(getJobStorage());
  if (!record) return;

  if (LSJobState.isStale(record)) {
    await forgetActiveJob();
    return;
  }

  if (!(await isOffscreenJobAlive(record))) {
    await forgetActiveJob();
    return;
  }

  if (record.kind === 'forum') {
    activeForumJob = {
      jobId: record.jobId,
      postId: record.postId,
      mode: record.mode,
      source: record.source,
      tabId: record.tabId,
      sendResponse: null,
      restored: true,
    };
  } else {
    activeJob = {
      jobId: record.jobId,
      source: record.source,
      tabId: record.tabId,
      sendResponse: null,
      restored: true,
    };
  }

  console.log('[LS Search] Restored indexing job:', record.jobId);
}

function ensureJobStateRestored() {
  if (!jobRestorePromise) {
    jobRestorePromise = restoreActiveJob().catch(() => {});
  }
  return jobRestorePromise;
}

function buildJobResultRecord(job, result) {
  return LSAutoUpdate.buildResultRecord(job, result);
}

async function saveJobResult(record) {
  try {
    await chrome.storage.local.set({ [JOB_RESULT_KEY]: record });
  } catch (e) {
    // Best effort: the sendResponse path still delivers the result.
    console.error('[LS Search] Could not store the job result:', e);
  }
}

async function setExtensionIcon(enabled) {
  const icons = enabled ? ICONS_ENABLED : ICONS_DISABLED;
  try {
    await chrome.action.setIcon({ path: icons });
  } catch (e) {
    console.error('[LS Search] Error setting icon:', e);
  }
}

async function loadAndSetInitialState() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const isEnabled = result[STORAGE_KEY] !== false;
    await setExtensionIcon(isEnabled);

    if (!isEnabled) {
      setBadgeText('');
      try {
        await chrome.alarms.clear(AUTO_ALARM);
      } catch {
        // Alarm cleanup is best-effort.
      }
    }

    return isEnabled;
  } catch (e) {
    console.error('[LS Search] Error loading state:', e);
    await setExtensionIcon(true);
    return true;
  }
}

async function isExtensionEnabled() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] !== false;
  } catch {
    return true;
  }
}

async function broadcastExtensionState(enabled) {
  try {
    const tabs = await chrome.tabs.query({
      url: ['*://laststicker.ru/*', '*://www.laststicker.ru/*'],
    });

    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        chrome.tabs.sendMessage(
          tab.id,
          { action: 'extensionEnabledChanged', enabled },
          () => {
            void chrome.runtime.lastError;
          },
        );
      } catch {
        // The tab may have been closed or may not have a content script.
      }
    }
  } catch {
    // Tab messaging is best-effort; the next page load still gets the state.
  }
}

async function applyExtensionEnabled(enabled) {
  await setExtensionIcon(enabled);

  if (!enabled) {
    setBadgeText('');
    try {
      await chrome.alarms.clear(AUTO_ALARM);
    } catch {
      // Alarm cleanup is best-effort.
    }

    if (activeJob) {
      sendToOffscreen({ action: 'cancelIndex' }).catch(() => {});
    }
    if (activeForumJob) {
      sendToOffscreen({ action: 'cancelForumIndex' }).catch(() => {});
    }
  } else {
    await scheduleAutoAlarm();
  }

  await broadcastExtensionState(enabled);
}

async function setExtensionEnabled(enabled) {
  await chrome.storage.local.set({ [STORAGE_KEY]: enabled });
}

function buildWelcomeUrl(version, previousVersion) {
  return chrome.runtime.getURL(
    `welcome.html?reason=update&version=${encodeURIComponent(
      version,
    )}&previous=${encodeURIComponent(previousVersion || '')}`,
  );
}

async function openWelcomeTab(details) {
  try {
    const version = chrome.runtime.getManifest().version;
    const previousVersion =
      details && details.previousVersion ? details.previousVersion : '';
    const data = await chrome.storage.local.get([
      WELCOME_LAST_KEY,
      WELCOME_PENDING_KEY,
    ]);

    if (data[WELCOME_LAST_KEY] === version) return;

    try {
      await chrome.tabs.create({
        url: buildWelcomeUrl(version, previousVersion),
      });
      await chrome.storage.local.set({ [WELCOME_LAST_KEY]: version });
      await chrome.storage.local.remove(WELCOME_PENDING_KEY);
    } catch {
      await chrome.storage.local.set({
        [WELCOME_PENDING_KEY]: {
          version,
          previousVersion,
          createdAt: Date.now(),
        },
      });
    }
  } catch (e) {
    console.error('[LS Search] Error opening welcome page:', e);
  }
}

async function openPendingWelcome() {
  try {
    const data = await chrome.storage.local.get([
      WELCOME_PENDING_KEY,
      WELCOME_LAST_KEY,
    ]);
    const pending = data[WELCOME_PENDING_KEY];
    if (!pending || !pending.version) return;

    if (data[WELCOME_LAST_KEY] === pending.version) {
      await chrome.storage.local.remove(WELCOME_PENDING_KEY);
      return;
    }

    await chrome.tabs.create({
      url: buildWelcomeUrl(pending.version, pending.previousVersion),
    });
    await chrome.storage.local.set({ [WELCOME_LAST_KEY]: pending.version });
    await chrome.storage.local.remove(WELCOME_PENDING_KEY);
  } catch {
    // Keep the pending marker so the next startup can retry.
  }
}

loadAndSetInitialState();
ensureJobStateRestored();

function setBadgeText(text, color) {
  try {
    if (chrome.action && chrome.action.setBadgeText) {
      chrome.action.setBadgeText({ text });
      if (color && chrome.action.setBadgeBackgroundColor) {
        chrome.action.setBadgeBackgroundColor({ color });
      }
    }
  } catch {
    // Badge updates are best-effort.
  }
}

function sendToOffscreenOnce(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ ...message, target: 'offscreen' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function sendToOffscreen(message) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await sendToOffscreenOnce(message);
    } catch (e) {
      lastError = e;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw lastError;
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) {
    const error = new Error('Offscreen API unavailable');
    error.code = 'OFFSCREEN_UNAVAILABLE';
    throw error;
  }

  if (offscreenCreating) return offscreenCreating;

  offscreenCreating = (async () => {
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ['DOM_PARSER'],
        justification: 'Локальный парсинг страниц laststicker для поиска',
      });
    } catch (e) {
      const message = String((e && e.message) || e);
      if (!/single offscreen|already/i.test(message)) throw e;
    }
  })();

  try {
    await offscreenCreating;
  } finally {
    offscreenCreating = null;
  }
}

async function saveAutoError(message) {
  try {
    const data = await chrome.storage.local.get(AUTO_META_KEY);
    const meta = LSAutoUpdate.parseAutoMeta(data[AUTO_META_KEY]);
    await chrome.storage.local.set({
      [AUTO_META_KEY]: JSON.stringify({
        ...meta,
        lastCheck: Date.now(),
        lastError: message,
      }),
    });
  } catch {
    // Storage errors are non-fatal for the scheduler.
  }
}

async function ensureFullIndexFlagRaw() {
  const data = await chrome.storage.local.get([
    FULL_INDEX_KEY,
    LAST_INDEXED_KEY,
    MESSAGES_KEY,
  ]);

  const state = LSAutoUpdate.resolveFullIndexFlag({
    fullIndexAt: data[FULL_INDEX_KEY],
    lastIndexedAt: data[LAST_INDEXED_KEY],
    messagesRaw: data[MESSAGES_KEY],
  });

  if (state.flag) {
    await chrome.storage.local.set({ [FULL_INDEX_KEY]: state.flag });
  }

  return state.full;
}

async function getAutoState() {
  const data = await chrome.storage.local.get([
    AUTO_ENABLED_KEY,
    FULL_INDEX_KEY,
    LAST_INDEXED_KEY,
  ]);

  return {
    enabled: LSAutoUpdate.isAutoEnabled(data[AUTO_ENABLED_KEY]),
    full: Boolean(data[FULL_INDEX_KEY]),
    lastIndexedAt: Number(data[LAST_INDEXED_KEY]) || 0,
  };
}

async function scheduleAutoAlarm() {
  if (!(await isExtensionEnabled())) {
    chrome.alarms.clear(AUTO_ALARM);
    return;
  }

  const state = await getAutoState();
  if (LSAutoUpdate.shouldSchedule(state)) {
    chrome.alarms.create(AUTO_ALARM, { periodInMinutes: AUTO_INTERVAL_MINUTES });
  } else {
    chrome.alarms.clear(AUTO_ALARM);
  }
}

async function runAutoIfDue() {
  const state = await getAutoState();
  if (!state.enabled || !state.full) return;

  const data = await chrome.storage.local.get(AUTO_META_KEY);
  const meta = LSAutoUpdate.parseAutoMeta(data[AUTO_META_KEY]);
  const intervalMs = AUTO_INTERVAL_MINUTES * 60 * 1000;

  if (!LSAutoUpdate.isDue(meta, state.lastIndexedAt, intervalMs)) return;

  await startAutoIndex();
}

async function startAutoIndex() {
  if (activeJob || activeForumJob) return;
  if (!(await isExtensionEnabled())) return;

  const job = {
    jobId: `auto-${Date.now()}`,
    source: 'auto',
    tabId: null,
  };

  try {
    await ensureOffscreenDocument();
    activeJob = { ...job, sendResponse: null };
    await rememberActiveJob(job);
    const response = await sendToOffscreen({
      action: 'startIndex',
      jobId: job.jobId,
      source: job.source,
    });
    if (response && response.error) {
      throw new Error(response.error);
    }
  } catch (e) {
    activeJob = null;
    await forgetActiveJob();
    await saveAutoError(e.message);
    setBadgeText('!', '#993333');
  }
}

async function startOffscreenIndex(job, sendResponse) {
  if (activeJob || activeForumJob) {
    sendResponse({ error: 'Индексация уже выполняется' });
    return;
  }

  try {
    await ensureOffscreenDocument();
    activeJob = { ...job, sendResponse };
    await rememberActiveJob(job);
    const response = await sendToOffscreen({
      action: 'startIndex',
      jobId: job.jobId,
      source: job.source,
    });
    if (response && response.error) {
      throw new Error(response.error);
    }
  } catch (e) {
    activeJob = null;
    await forgetActiveJob();

    if (job.source === 'auto') {
      await saveAutoError(e.message);
    }
    setBadgeText('!', '#993333');

    // The offscreen API exists since Chrome 109 and the manifest requires it,
    // so this only happens on a manually downgraded browser.
    sendResponse({
      error:
        e.code === 'OFFSCREEN_UNAVAILABLE'
          ? 'Индексация требует Chrome 109 или новее: обновите браузер'
          : e.message,
    });
  }
}

async function finishOffscreenJob(message) {
  await ensureJobStateRestored();

  const job = activeJob;
  if (!job || job.jobId !== message.jobId) return;

  activeJob = null;
  await forgetActiveJob();
  setBadgeText('');

  const result = message.result || {};
  await saveJobResult(buildJobResultRecord({ ...job, kind: 'dialog' }, result));

  if (result.error) {
    if (job.source === 'auto') {
      await saveAutoError(result.error);
    }
    if (job.sendResponse) {
      job.sendResponse({ error: result.error });
    }
    setBadgeText('!', '#993333');
    return;
  }

  if (job.sendResponse) {
    job.sendResponse({ result });
  }
  scheduleAutoAlarm();
}

async function startForumIndex(job, sendResponse) {
  if (activeJob || activeForumJob) {
    sendResponse({ error: 'Индексация уже выполняется' });
    return;
  }

  activeForumJob = { ...job };

  try {
    await ensureOffscreenDocument();
    await rememberActiveJob({ ...job, kind: 'forum' });
    const response = await sendToOffscreen({
      action: 'startForumIndex',
      jobId: job.jobId,
      postId: job.postId,
      mode: job.mode,
      source: job.source,
    });
    if (response && response.error) {
      throw new Error(response.error);
    }

    sendResponse({ started: true });
  } catch (e) {
    activeForumJob = null;
    await forgetActiveJob();
    setBadgeText('!', '#993333');
    sendResponse({ error: e.message });
  }
}

async function finishForumJob(message) {
  await ensureJobStateRestored();

  const job = activeForumJob;
  if (!job || job.jobId !== message.jobId) return;

  activeForumJob = null;
  await forgetActiveJob();
  setBadgeText('');

  const result = message.result || {};
  await saveJobResult(buildJobResultRecord({ ...job, kind: 'forum' }, result));

  if (job.tabId) {
    chrome.tabs.sendMessage(
      job.tabId,
      {
        action: 'forumIndexFinished',
        result: message.result || {},
      },
      () => {
        void chrome.runtime.lastError;
      },
    );
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_ALARM) {
    startAutoIndex();
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'update') {
    await openWelcomeTab(details);
  }

  await ensureFullIndexFlagRaw();

  if (await isExtensionEnabled()) {
    await scheduleAutoAlarm();
    await runAutoIfDue();
  } else {
    try {
      await chrome.alarms.clear(AUTO_ALARM);
    } catch {
      // Alarm cleanup is best-effort.
    }
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await openPendingWelcome();
  await ensureFullIndexFlagRaw();

  if (await isExtensionEnabled()) {
    await scheduleAutoAlarm();
    await runAutoIfDue();
  } else {
    try {
      await chrome.alarms.clear(AUTO_ALARM);
    } catch {
      // Alarm cleanup is best-effort.
    }
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes[STORAGE_KEY]) {
    const enabled = changes[STORAGE_KEY].newValue !== false;
    void applyExtensionEnabled(enabled);
  }

  if (changes[AUTO_ENABLED_KEY] || changes[FULL_INDEX_KEY]) {
    scheduleAutoAlarm();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.action) return false;

  if (request.action === 'setExtensionEnabled') {
    (async () => {
      try {
        await setExtensionEnabled(request.enabled !== false);
        sendResponse({
          success: true,
          enabled: request.enabled !== false,
        });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  if (request.target === 'background' && request.action === 'indexProgress') {
    if (activeJob && request.jobId === activeJob.jobId) {
      const percent = request.total
        ? Math.round((request.done / request.total) * 100)
        : 0;
      setBadgeText(request.total ? `${percent}%` : '', '#2444bc');

      if (activeJob.tabId) {
        chrome.tabs.sendMessage(
          activeJob.tabId,
          {
            action: 'indexProgress',
            done: request.done,
            total: request.total,
            messageCount: request.messageCount,
            currentTalkId: request.currentTalkId,
          },
          () => {
            void chrome.runtime.lastError;
          },
        );
      }
    }
    return false;
  }

  if (request.target === 'background' && request.action === 'indexHeartbeat') {
    // Receiving the message is the whole point: it resets the service worker
    // idle timer while the offscreen job is between progress updates.
    sendResponse({ ok: true });
    return false;
  }

  if (request.target === 'background' && request.action === 'indexFinished') {
    finishOffscreenJob(request).catch(() => {});
    return false;
  }

  if (
    request.target === 'background' &&
    request.action === 'forumIndexProgress'
  ) {
    if (activeForumJob && request.jobId === activeForumJob.jobId) {
      const percent = request.total
        ? Math.round((request.done / request.total) * 100)
        : 0;
      setBadgeText(request.total ? `${percent}%` : '', '#2444bc');

      if (activeForumJob.tabId) {
        chrome.tabs.sendMessage(
          activeForumJob.tabId,
          {
            action: 'forumIndexProgress',
            postId: request.postId,
            done: request.done,
            total: request.total,
            messageCount: request.messageCount,
            currentPage: request.currentPage,
          },
          () => {
            void chrome.runtime.lastError;
          },
        );
      }
    }
    return false;
  }

  if (
    request.target === 'background' &&
    request.action === 'forumIndexFinished'
  ) {
    finishForumJob(request).catch(() => {});
    return false;
  }

  if (request.action === 'forumStartIndex') {
    (async () => {
      if (!(await isExtensionEnabled())) {
        sendResponse({ error: 'Расширение отключено' });
        return;
      }

      await startForumIndex(
        {
          jobId: `forum-${Date.now()}`,
          postId: String(request.postId || ''),
          mode: request.mode || 'topic',
          source: 'manual',
          tabId: sender.tab ? sender.tab.id : null,
        },
        sendResponse,
      );
    })();
    return true;
  }

  if (request.action === 'forumCancelIndex') {
    (async () => {
      const cancelled = Boolean(activeForumJob);
      if (cancelled) {
        await sendToOffscreen({ action: 'cancelForumIndex' }).catch(() => {});
      }
      sendResponse({ cancelled });
    })();
    return true;
  }

  if (request.action === 'forumClear') {
    (async () => {
      if (activeForumJob) {
        await sendToOffscreen({ action: 'cancelForumIndex' }).catch(() => {});
      }

      try {
        await LSForumStorage.clearAll();
        sendResponse({ result: true });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  if (request.action === 'forumDeleteTopic') {
    (async () => {
      try {
        const postId = String(request.postId || '');
        const jobForTopic =
          activeForumJob && String(activeForumJob.postId) === postId;

        if (jobForTopic) {
          await sendToOffscreen({ action: 'cancelForumIndex' }).catch(
            () => {},
          );
          await LSForumStorage.bumpGeneration();
        }

        await LSForumStorage.deleteTopic(postId);
        sendResponse({ result: true });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  if (request.action === 'forumSearch') {
    (async () => {
      try {
        const result = await LSForumStorage.searchComments(request.query, {
          postId: request.postId || '',
          limit: request.limit || 200,
          offset: request.offset || 0,
        });
        sendResponse({ result });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  if (request.action === 'forumStats') {
    (async () => {
      try {
        const result = await LSForumStorage.getStats(request.postId || '');
        sendResponse({ result });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  // Offscreen documents do not get chrome.storage in this Chrome version.
  // Keep all index data in the extension's normal storage via RPC.
  if (request.action && request.action.startsWith('lsStorage')) {
    if (!sender || sender.id !== chrome.runtime.id || sender.tab) {
      sendResponse({ error: 'Storage RPC is only available to extension pages' });
      return false;
    }

    if (request.action === 'lsStorageGet') {
      chrome.storage.local
        .get(request.keys || [])
        .then((result) => sendResponse({ result }))
        .catch((error) => sendResponse({ error: error.message }));
      return true;
    }

    if (request.action === 'lsStorageSet') {
      chrome.storage.local
        .set(request.items || {})
        .then(() => sendResponse({ result: true }))
        .catch((error) => sendResponse({ error: error.message }));
      return true;
    }

    if (request.action === 'lsStorageRemove') {
      chrome.storage.local
        .remove(request.keys || [])
        .then(() => sendResponse({ result: true }))
        .catch((error) => sendResponse({ error: error.message }));
      return true;
    }

    if (request.action === 'lsStorageGetBytes') {
      chrome.storage.local
        .getBytesInUse(request.key)
        .then((bytes) => sendResponse({ result: bytes }))
        .catch((error) => sendResponse({ error: error.message }));
      return true;
    }
  }

  if (request.action === 'cancelIndex') {
    if (activeJob) {
      sendToOffscreen({ action: 'cancelIndex' }).catch(() => {});
    }

    sendResponse({ cancelled: Boolean(activeJob) });
    return false;
  }

  if (request.action === 'indexAllSections') {
    (async () => {
      if (!(await isExtensionEnabled())) {
        sendResponse({ error: 'Расширение отключено' });
        return;
      }

      await startOffscreenIndex(
        {
          jobId: `manual-${Date.now()}`,
          source: 'manual',
          tabId: sender.tab ? sender.tab.id : null,
        },
        sendResponse,
      );
    })();
    return true;
  }

  if (request.action === 'injectDependencies') {
    (async () => {
      if (!(await isExtensionEnabled())) {
        sendResponse({ error: 'Расширение отключено' });
        return;
      }

      if (!sender.tab || typeof sender.tab.id !== 'number') {
        sendResponse({ error: 'No sender tab' });
        return;
      }

      const tabId = sender.tab.id;

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            return {
              hasInlineStorage: typeof window.InlineStorage !== 'undefined',
              hasInlineUI: typeof window.InlineUI !== 'undefined'
            };
          }
        });

        const state = results[0]?.result;
        if (state && state.hasInlineStorage && state.hasInlineUI) {
          sendResponse({ success: true, alreadyInjected: true });
          return;
        }

        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['inline-storage.js']
        });

        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['inline-ui.js']
        });

        sendResponse({ success: true });
      } catch (e) {
        console.error('[LS Search] Error injecting dependencies:', e);
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  if (request.action === 'injectInlinePanel') {
    (async () => {
      if (!(await isExtensionEnabled())) {
        sendResponse({ error: 'Расширение отключено' });
        return;
      }

      if (!sender.tab || typeof sender.tab.id !== 'number') {
        sendResponse({ error: 'No sender tab' });
        return;
      }

      const tabId = sender.tab.id;

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            return {
              hasInlinePanelReady: typeof window.InlinePanelReady !== 'undefined'
            };
          }
        });

        const state = results[0]?.result;
        if (state && state.hasInlinePanelReady) {
          sendResponse({ success: true, alreadyInjected: true });
          return;
        }

        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['inline-panel.js']
        });

        sendResponse({ success: true });
      } catch (e) {
        console.error('[LS Search] Error injecting inline-panel:', e);
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }
});
