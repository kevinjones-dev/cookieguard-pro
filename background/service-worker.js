// =============================================
// CookieGuard Pro — Background Service Worker
// =============================================
// This is the extension's "background brain."
// It runs quietly in the background and handles
// tasks like auto-deleting cookies when tabs close.
//
// IMPORTANT MV3 RULE:
// Service workers can be TERMINATED by Chrome at
// any time to save memory. This means:
//   ✅ DO store everything in chrome.storage
//   ❌ DON'T store state in regular variables
//      (they'll be lost when the worker sleeps)
//
// Right now this file is mostly empty — it just
// keeps the MV3 structure complete. We'll add
// auto-delete logic in Phase 3 of the roadmap.
// =============================================

// Log a message when the service worker first installs
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("CookieGuard Pro installed successfully.");

    // Set up default settings in storage.
    // These are the factory defaults for a brand new install.
    chrome.storage.local.set({
      autoDeleteEnabled: false,  // Auto-delete is off by default
      whitelist: [],             // No sites are whitelisted yet
      theme: "dark"              // Default to dark theme
    });
  }

  if (details.reason === "update") {
    console.log("CookieGuard Pro updated to version:", chrome.runtime.getManifest().version);
  }
});

// -----------------------------------------------
// FUTURE HOME: Auto-delete on tab close (Phase 3)
// -----------------------------------------------
// When we build Phase 3, we'll add this listener:
//
// chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
//   // Read autoDeleteEnabled from chrome.storage
//   // If enabled, get the tab's domain
//   // Check if domain is on the whitelist
//   // If not whitelisted, delete cookies for that domain
// });
//
// We'll build this out in the next phase.
// -----------------------------------------------

// Keep the service worker alive when the popup sends a message.
// (We'll use this for communication between popup and background later.)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Right now we don't handle any messages — this is a placeholder
  // so the message channel is open for future use.
  console.log("Service worker received message:", message);
  return true; // Keep the message channel open for async responses
});
