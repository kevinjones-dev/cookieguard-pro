// =============================================
// CookieGuard Pro — Popup Script
// =============================================
// This file runs every time the popup opens.
// It reads cookies for the current site and
// displays them. It also handles deleting cookies.
//
// MV3 rule: No inline scripts allowed. All JS
// must be in a separate file like this one.
// =============================================

// --- Wait for the page to fully load before doing anything ---
document.addEventListener("DOMContentLoaded", () => {

  // -----------------------------------------------
  // 1. GRAB REFERENCES TO HTML ELEMENTS
  // -----------------------------------------------
  // These are the parts of the popup we'll show/hide/update.

  const siteDomainEl    = document.getElementById("site-domain");
  const cookieCountEl   = document.getElementById("cookie-count");
  const cookieListEl    = document.getElementById("cookie-list");
  const loadingStateEl  = document.getElementById("loading-state");
  const emptyStateEl    = document.getElementById("empty-state");
  const errorStateEl    = document.getElementById("error-state");
  const deleteAllBtn    = document.getElementById("delete-all-btn");
  const toastEl         = document.getElementById("toast");

  // -----------------------------------------------
  // 2. FIGURE OUT WHICH WEBSITE WE'RE ON
  // -----------------------------------------------
  // We ask Chrome: "what tab is active right now?"
  // Then we use that tab's URL to find cookies.

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {

    // If we somehow got no tabs back, show an error.
    if (!tabs || tabs.length === 0) {
      showError();
      return;
    }

    const tab = tabs[0];
    const url = tab.url;

    // Chrome internal pages (like chrome://extensions or the new tab page)
    // don't have cookies. We can't do anything on those pages.
    if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("about:")) {
      showError();
      return;
    }

    // Pull out just the hostname from the URL.
    // e.g. "https://www.google.com/search?q=test" → "www.google.com"
    let hostname = "";
    try {
      hostname = new URL(url).hostname;
    } catch (e) {
      showError();
      return;
    }

    // Show the site name in the header badge
    siteDomainEl.textContent = hostname;

    // -----------------------------------------------
    // 3. LOAD COOKIES FOR THIS SITE
    // -----------------------------------------------
    loadCookiesForUrl(url, hostname);
  });

  // -----------------------------------------------
  // 4. DELETE ALL BUTTON
  // -----------------------------------------------
  deleteAllBtn.addEventListener("click", () => {

    // Find every delete button currently shown and click them all.
    // We collect them into an array first so the list doesn't change
    // while we're looping through it.
    const allDeleteButtons = Array.from(document.querySelectorAll(".delete-btn"));

    if (allDeleteButtons.length === 0) {
      showToast("No cookies to delete", "error");
      return;
    }

    // We keep track of how many we successfully deleted
    let count = 0;
    const total = allDeleteButtons.length;

    allDeleteButtons.forEach((btn) => {
      // Each delete button has the cookie's URL and name stored on it.
      // We put that data there when we built the list (see buildCookieList below).
      const cookieUrl  = btn.dataset.url;
      const cookieName = btn.dataset.name;

      chrome.cookies.remove({ url: cookieUrl, name: cookieName }, (result) => {
        if (result) {
          count++;
        }

        // After the last deletion attempt, refresh the display
        if (count === total) {
          showToast(`Deleted ${count} cookie${count !== 1 ? "s" : ""}`, "success");
          // Refresh the list so it shows empty state
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
              loadCookiesForUrl(tabs[0].url, new URL(tabs[0].url).hostname);
            }
          });
        }
      });
    });
  });

  // =============================================
  // HELPER FUNCTIONS
  // =============================================

  // -----------------------------------------------
  // loadCookiesForUrl: Fetches and displays cookies
  // -----------------------------------------------
  function loadCookiesForUrl(url, hostname) {

    // Show the loading spinner while we wait
    showState("loading");

    // Ask Chrome for all cookies that match this URL.
    // The chrome.cookies.getAll API returns an array of cookie objects.
    chrome.cookies.getAll({ url: url }, (cookies) => {

      // If Chrome returns an error, show the error state
      if (chrome.runtime.lastError) {
        console.error("CookieGuard error:", chrome.runtime.lastError.message);
        showError();
        return;
      }

      // Update the count display
      cookieCountEl.textContent = cookies.length;

      // If there are no cookies, show the empty state
      if (cookies.length === 0) {
        showState("empty");
        return;
      }

      // Otherwise, build and show the cookie list
      buildCookieList(cookies, url);
      showState("list");
    });
  }

  // -----------------------------------------------
  // buildCookieList: Turns cookie data into HTML rows
  // -----------------------------------------------
  function buildCookieList(cookies, pageUrl) {

    // Clear any old rows from a previous load
    cookieListEl.innerHTML = "";

    // Sort cookies alphabetically by name so they're easy to scan
    cookies.sort((a, b) => a.name.localeCompare(b.name));

    // Create one row (list item) for each cookie
    cookies.forEach((cookie) => {

      // Figure out the right URL to use when deleting this cookie.
      // Chrome's cookies.remove() needs a URL that matches the cookie's domain.
      const cookieUrl = buildCookieUrl(cookie);

      // Create the <li> element
      const li = document.createElement("li");
      li.className = "cookie-item";

      // Build the "flags" — little badges showing properties of the cookie
      const flags = buildFlagBadges(cookie);

      // Truncate the value for display (some cookies are very long)
      const displayValue = cookie.value.length > 80
        ? cookie.value.substring(0, 80) + "…"
        : (cookie.value || "(empty)");

      // Put together the HTML for this row
      li.innerHTML = `
        <div class="cookie-dot"></div>
        <div class="cookie-info">
          <div class="cookie-name" title="${escapeHtml(cookie.name)}">${escapeHtml(cookie.name)}</div>
          <div class="cookie-value" title="${escapeHtml(cookie.value)}">${escapeHtml(displayValue)}</div>
          ${flags.length > 0 ? `<div class="cookie-flags">${flags.join("")}</div>` : ""}
        </div>
        <button class="delete-btn" title="Delete this cookie"
          data-url="${escapeHtml(cookieUrl)}"
          data-name="${escapeHtml(cookie.name)}">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 3.5h9M5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M10.5 3.5l-.5 7a.5.5 0 01-.5.5H4a.5.5 0 01-.5-.5l-.5-7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      `;

      // Add the click handler for this row's delete button
      const deleteBtn = li.querySelector(".delete-btn");
      deleteBtn.addEventListener("click", () => {
        deleteSingleCookie(cookieUrl, cookie.name, li);
      });

      cookieListEl.appendChild(li);
    });
  }

  // -----------------------------------------------
  // deleteSingleCookie: Removes one cookie
  // -----------------------------------------------
  function deleteSingleCookie(url, name, rowElement) {

    // Tell Chrome to delete this specific cookie
    chrome.cookies.remove({ url: url, name: name }, (result) => {

      if (chrome.runtime.lastError) {
        showToast("Delete failed — try again", "error");
        return;
      }

      if (result) {
        // Animate the row fading out
        rowElement.classList.add("removing");

        // After the animation, actually remove it from the DOM
        setTimeout(() => {
          rowElement.remove();

          // Update the count shown in the toolbar
          const remaining = document.querySelectorAll(".cookie-item").length;
          cookieCountEl.textContent = remaining;

          // If that was the last one, show the empty state
          if (remaining === 0) {
            showState("empty");
          }
        }, 250);

        showToast(`Deleted "${name}"`, "success");

      } else {
        showToast("Could not delete this cookie", "error");
      }
    });
  }

  // -----------------------------------------------
  // buildCookieUrl: Constructs the right URL for a cookie
  // -----------------------------------------------
  // Chrome's cookie API needs a URL, not just a domain.
  // Secure cookies need https://, others can use http://.
  function buildCookieUrl(cookie) {
    const scheme = cookie.secure ? "https" : "http";
    // Cookie domains often start with a dot (e.g. ".example.com")
    // We strip that leading dot for the URL.
    const domain = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
    const path   = cookie.path || "/";
    return `${scheme}://${domain}${path}`;
  }

  // -----------------------------------------------
  // buildFlagBadges: Returns HTML strings for cookie properties
  // -----------------------------------------------
  function buildFlagBadges(cookie) {
    const flags = [];
    if (cookie.secure)   flags.push('<span class="flag flag-secure">Secure</span>');
    if (cookie.httpOnly) flags.push('<span class="flag flag-http">HttpOnly</span>');
    // A session cookie has no expiration date (it disappears when the browser closes)
    if (!cookie.expirationDate) flags.push('<span class="flag flag-session">Session</span>');
    return flags;
  }

  // -----------------------------------------------
  // showState: Switches which "view" is visible
  // -----------------------------------------------
  function showState(state) {
    loadingStateEl.classList.add("hidden");
    emptyStateEl.classList.add("hidden");
    errorStateEl.classList.add("hidden");
    cookieListEl.classList.add("hidden");

    if (state === "loading") loadingStateEl.classList.remove("hidden");
    if (state === "empty")   emptyStateEl.classList.remove("hidden");
    if (state === "error")   errorStateEl.classList.remove("hidden");
    if (state === "list")    cookieListEl.classList.remove("hidden");
  }

  function showError() {
    cookieCountEl.textContent = "0";
    showState("error");
  }

  // -----------------------------------------------
  // showToast: Shows a small notification message
  // -----------------------------------------------
  let toastTimer = null;

  function showToast(message, type = "success") {
    toastEl.textContent = message;
    toastEl.className = `toast ${type} show`;

    // Clear any previous timer so we don't hide too early
    if (toastTimer) clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 2500);
  }

  // -----------------------------------------------
  // escapeHtml: Safety function to prevent XSS
  // -----------------------------------------------
  // Cookie names and values are untrusted input.
  // Before putting them into innerHTML, we must escape
  // any HTML special characters so they can't inject scripts.
  function escapeHtml(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

}); // end DOMContentLoaded
