// LastSticker Search - Content Script
// Extracts messages from laststicker.ru pages

var isCommonJS = typeof module !== 'undefined' && module.exports;

// Debug output stays silent in production builds: flip the flag while debugging.
// `var`, not `const`: this content script shares the isolated world with the
// files background.js injects (inline-storage.js, inline-ui.js), and a lexical
// declaration here breaks them with a SyntaxError.
var DEBUG_LOG = false;

function debugLog(...args) {
  if (DEBUG_LOG) console.log(...args);
}

debugLog('[LS Search] Content script starting...');

let extensionEnabledState = true;
let extensionEnableInitPromise = null;

function setInlinePanelsVisible(visible) {
  ['ls-search-panel', 'ls-talk-search-panel', 'ls-forum-panel'].forEach(
    (id) => {
      const panel = document.getElementById(id);
      if (panel) panel.style.display = visible ? '' : 'none';
    },
  );
}

function handleExtensionEnabledChange(enabled) {
  extensionEnabledState = enabled !== false;

  if (!extensionEnabledState) {
    setInlinePanelsVisible(false);
    return;
  }

  if (window.InlinePanelReady) {
    setInlinePanelsVisible(true);
    return;
  }

  if (!extensionEnableInitPromise) {
    extensionEnableInitPromise = initInlinePanel()
      .then(() => {
        if (extensionEnabledState) setInlinePanelsVisible(true);
      })
      .catch(() => {})
      .finally(() => {
        extensionEnableInitPromise = null;
      });
  }
}

function setupExtensionStateListener() {
  if (isCommonJS) return;

  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.action === 'extensionEnabledChanged') {
        handleExtensionEnabledChange(message.enabled);
      }
    });
  }

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.isEnabled) return;
      handleExtensionEnabledChange(changes.isEnabled.newValue !== false);
    });
  }
}

// Load inline-panel dependencies - delegate to background script
async function loadInlineDependencies() {
  // Check if already loaded by background script
  if (window.InlineStorage && window.InlineUI) {
    return Promise.resolve();
  }
  
  // Ask background script to inject dependencies
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'injectDependencies' }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      
      // Wait for dependencies to load with retry logic
      waitForDependencies(0, 10, resolve, reject);
    });
  });
}

// Wait for dependencies with retry logic
function waitForDependencies(attempt, maxAttempts, resolve, reject) {
  if (window.InlineStorage && window.InlineUI) {
    resolve();
    return;
  }
  
  if (attempt >= maxAttempts) {
    reject(new Error('Dependencies not available'));
    return;
  }
  
  setTimeout(() => {
    waitForDependencies(attempt + 1, maxAttempts, resolve, reject);
  }, 200);
}

// Load dependencies and then inject inline-panel
async function initInlinePanel() {
  try {
    await loadInlineDependencies();
    
    // Check if InlineStorage and InlineUI are available (may be loaded by background)
    if (!window.InlineStorage || !window.InlineUI) {
      // Wait for background script to inject them
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (window.InlineStorage && window.InlineUI) break;
      }
    }
    
    if (!window.InlineStorage || !window.InlineUI) {
      console.error('[LS Search] Dependencies not available:', {
        InlineStorage: typeof window.InlineStorage,
        InlineUI: typeof window.InlineUI
      });
      return;
    }
    
    // Check if inline-panel already loaded
    if (window.InlinePanelReady) {
      return;
    }
    
    // Load inline-panel - wait for it to load
    await loadInlinePanelScript();
    
  } catch (error) {
    console.error('[LS Search] Error initializing inline panel:', error);
  }
}

// Load inline-panel.js - delegate to background script
async function loadInlinePanelScript() {
  // Check if already loaded
  if (window.InlinePanelReady) {
    return Promise.resolve();
  }
  
  // Ask background to inject the panel
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'injectInlinePanel' }, () => {
      if (chrome.runtime.lastError) {
        console.error('[LS Search] Error requesting inline-panel injection:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
        return;
      }
      
      // Wait for panel to load with retry logic
      waitForInlinePanel(0, 10, resolve, reject);
    });
  });
}

// Wait for InlinePanelReady with retry logic
function waitForInlinePanel(attempt, maxAttempts, resolve, reject) {
  if (window.InlinePanelReady) {
    resolve();
    return;
  }
  
  if (attempt >= maxAttempts) {
    reject(new Error('InlinePanel still not ready after injection'));
    return;
  }
  
  setTimeout(() => {
    waitForInlinePanel(attempt + 1, maxAttempts, resolve, reject);
  }, 200);
}

// Initialize inline panel when DOM is ready
if (!isCommonJS) {
  setupExtensionStateListener();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInlinePanel);
  } else {
    initInlinePanel();
  }
}

// Highlight the message from a #msg_<id> link opened by a search result.
function highlightHashMessage() {
  const hash = window.location.hash;
  if (!/^#msg_\d+$/.test(hash)) return;

  const target = document.querySelector(hash);
  if (!target) return;

  // #msg_<id> is the header block; highlight the whole .user_message row.
  const message = target.closest('.user_message') || target;

  // Restart the CSS animation when the user jumps between messages.
  if (message._lsTargetTimer) {
    clearTimeout(message._lsTargetTimer);
  }
  message.classList.remove('ls-message-target');
  void message.offsetWidth;
  message.classList.add('ls-message-target');

  message.scrollIntoView({ block: 'center', behavior: 'smooth' });

  message._lsTargetTimer = setTimeout(() => {
    message.classList.remove('ls-message-target');
    message._lsTargetTimer = null;
  }, 8000);
}

window.addEventListener('hashchange', highlightHashMessage);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(highlightHashMessage, 300);
  });
} else {
  setTimeout(highlightHashMessage, 300);
}


if (isCommonJS) {
  module.exports = { highlightHashMessage };
}
