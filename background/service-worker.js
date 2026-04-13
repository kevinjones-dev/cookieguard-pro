// =============================================
// CookieGuard Pro — Background Service Worker
// Phase 3: Auto-delete on tab close + whitelist
// =============================================
//
// KEY RULE: Chrome can terminate this service worker
// at any moment to save memory. When an event fires
// (like a tab closing), Chrome wakes it back up.
// This means ANY state stored in plain JS variables
// is gone after termination. We ALWAYS read fresh
// from chrome.storage before making decisions.
//
// How tab URL tracking works:
//   1. When any tab loads a URL → we save tabId→url
//      to chrome.storage so we remember it.
//   2. When a tab closes → chrome.tabs.onRemoved fires.
//      We look up the closed tab's URL from storage,
//      check the whitelist, and delete cookies if needed.
//   3. On startup → we re-scan all open tabs so we
//      don't miss tabs that were open before the
//      worker was running.
// =============================================


// -----------------------------------------------
// EXTENSION INSTALLED (first time)
// -----------------------------------------------
chrome.runtime.onInstalled.addListener((details) => {

  if (details.reason === "install") {
    console.log("CookieGuard Pro installed.");

    // Set up all default settings
    chrome.storage.local.set({
      autoDeleteEnabled: false,
      whitelist:         [],
      tabUrls:           {}
    });

    updateBadge(false);
  }

  if (details.reason === "update") {
    console.log("CookieGuard Pro updated to", chrome.runtime.getManifest().version);
    chrome.storage.local.get(["autoDeleteEnabled"], (result) => {
      updateBadge(result.autoDeleteEnabled || false);
    });
  }

  cacheAllTabUrls();
});


// -----------------------------------------------
// CHROME STARTS UP
// -----------------------------------------------
chrome.runtime.onStartup.addListener(() => {
  console.log("CookieGuard Pro: browser started, refreshing tab cache.");
  cacheAllTabUrls();

  chrome.storage.local.get(["autoDeleteEnabled"], (result) => {
    updateBadge(result.autoDeleteEnabled || false);
  });
});


// -----------------------------------------------
// TAB URL TRACKING
// -----------------------------------------------
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {

  // Guard: make sure tab and changeInfo actually exist before reading from them.
  // Chrome can sometimes call this with incomplete data.
  if (!tab || !changeInfo) return;

  // We only care when the URL changes or the page finishes loading
  if (!changeInfo.url && changeInfo.status !== "complete") return;

  const url = tab.url;

  // Skip Chrome's own internal pages
  if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("about:")) return;

  // Save this tab's URL to storage
  chrome.storage.local.get(["tabUrls"], (result) => {
    if (chrome.runtime.lastError) return; // storage read failed — skip safely
    const tabUrls = result.tabUrls || {};
    tabUrls[tabId] = url;
    chrome.storage.local.set({ tabUrls });
  });
});


// -----------------------------------------------
// AUTO-DELETE ON TAB CLOSE
// -----------------------------------------------
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {

  // Read EVERYTHING fresh from storage — never use variables
  chrome.storage.local.get(["autoDeleteEnabled", "whitelist", "tabUrls"], (result) => {

    if (chrome.runtime.lastError) return; // storage read failed — skip safely

    const tabUrls           = result.tabUrls          || {};
    const autoDeleteEnabled = result.autoDeleteEnabled || false;
    const whitelist         = result.whitelist         || [];

    const closedUrl = tabUrls[tabId];

    // Clean up: remove this tab from our tracking map
    delete tabUrls[tabId];
    chrome.storage.local.set({ tabUrls });

    if (!autoDeleteEnabled) return;
    if (!closedUrl) return;

    let hostname = "";
    try {
      hostname = new URL(closedUrl).hostname;
    } catch (e) {
      return;
    }

    if (!hostname) return;

    if (isWhitelisted(hostname, whitelist)) {
      console.log(`CookieGuard: "${hostname}" is whitelisted, skipping auto-delete.`);
      return;
    }

    // Pass the full URL, not just the hostname — Chrome's getAll({ url })
    // correctly finds ALL cookies for that page including parent-domain cookies
    // like .reddit.com, which getAll({ domain: "www.reddit.com" }) would miss.
    deleteCookiesForUrl(closedUrl);
  });
});


// -----------------------------------------------
// SETTINGS CHANGE LISTENER
// -----------------------------------------------
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.autoDeleteEnabled) {
    updateBadge(changes.autoDeleteEnabled.newValue);
  }
});


// -----------------------------------------------
// MESSAGE HANDLER
// -----------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // IMPORTANT: Chrome can send internal messages to extensions that
  // don't match our expected format. Always guard against null/unexpected
  // messages before reading any properties from them.
  if (!message || typeof message !== "object") return;

  if (message.type === "getStatus") {
    chrome.storage.local.get(["autoDeleteEnabled", "whitelist"], (result) => {
      if (chrome.runtime.lastError) {
        sendResponse({ autoDeleteEnabled: false, whitelist: [] });
        return;
      }
      sendResponse({
        autoDeleteEnabled: result.autoDeleteEnabled || false,
        whitelist:         result.whitelist         || []
      });
    });
    return true; // Keep message channel open for async response
  }

  // If we don't recognize the message type, do nothing.
  // Don't throw — Chrome may send messages we don't need to handle.
});


// =============================================
// HELPER FUNCTIONS
// =============================================

// Query all currently open tabs and save their URLs to storage
function cacheAllTabUrls() {
  chrome.tabs.query({}, (tabs) => {

    if (chrome.runtime.lastError || !tabs) return;

    const tabUrls = {};
    tabs.forEach((tab) => {
      // Guard: make sure the tab object is valid before reading from it
      if (!tab || !tab.id || !tab.url) return;

      if (!tab.url.startsWith("chrome://") &&
          !tab.url.startsWith("chrome-extension://") &&
          !tab.url.startsWith("about:")) {
        tabUrls[tab.id] = tab.url;
      }
    });

    // Merge with any existing tabUrls
    chrome.storage.local.get(["tabUrls"], (result) => {
      if (chrome.runtime.lastError) return;
      const existing = result.tabUrls || {};
      const merged   = Object.assign({}, existing, tabUrls);
      chrome.storage.local.set({ tabUrls: merged });
    });
  });
}

// Check if a hostname matches any entry in the whitelist
function isWhitelisted(hostname, whitelist) {
  if (!hostname || !Array.isArray(whitelist)) return false;
  return whitelist.some((entry) => {
    if (!entry) return false;
    if (hostname === entry) return true;
    if (hostname.endsWith("." + entry)) return true;
    return false;
  });
}

// Delete all cookies that belong to the given URL.
// Using getAll({ url }) is more reliable than getAll({ domain }) because
// Chrome automatically includes parent-domain cookies (e.g. .reddit.com)
// that apply to the page — something domain-based lookup misses.
function deleteCookiesForUrl(url) {
  if (!url) return;
  console.log(`CookieGuard: auto-deleting cookies for "${url}"`);

  chrome.cookies.getAll({ url: url }, (cookies) => {

    if (chrome.runtime.lastError || !cookies || cookies.length === 0) return;

    let count = 0;
    cookies.forEach((cookie) => {

      // Guard: make sure the cookie object is valid before reading from it
      if (!cookie || !cookie.name) return;

      const scheme     = cookie.secure ? "https" : "http";
      const domain     = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
      const cookieUrl  = `${scheme}://${domain}${cookie.path || "/"}`;

      chrome.cookies.remove({ url: cookieUrl, name: cookie.name }, () => {
        // Check and clear lastError so Chrome doesn't surface it as an uncaught error
        if (chrome.runtime.lastError) {
          console.log(`CookieGuard: could not remove cookie "${cookie.name}": ${chrome.runtime.lastError.message}`);
        }
        count++;
        if (count === cookies.length) {
          console.log(`CookieGuard: finished processing ${count} cookie(s) for "${url}"`);
        }
      });
    });
  });
}

// Update the extension icon badge
function updateBadge(isEnabled) {
  if (isEnabled) {
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#00d4aa" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}
