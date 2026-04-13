// =============================================
// CookieGuard Pro — Popup Script (Phase 2)
// Adds: click to edit, edit form, add new cookie
// =============================================

document.addEventListener("DOMContentLoaded", () => {

  // -----------------------------------------------
  // 1. ELEMENT REFERENCES
  // -----------------------------------------------

  // Header / toolbar
  const siteDomainEl    = document.getElementById("site-domain");
  const cookieCountEl   = document.getElementById("cookie-count");
  const addCookieBtn    = document.getElementById("add-cookie-btn");
  const deleteAllBtn    = document.getElementById("delete-all-btn");

  // List panel
  const panelContainer  = document.getElementById("panel-container");
  const loadingStateEl  = document.getElementById("loading-state");
  const emptyStateEl    = document.getElementById("empty-state");
  const errorStateEl    = document.getElementById("error-state");
  const cookieListEl    = document.getElementById("cookie-list");

  // Edit panel
  const backBtn         = document.getElementById("back-btn");
  const editPanelTitle  = document.getElementById("edit-panel-title");
  const editDeleteBtn   = document.getElementById("edit-delete-btn");
  const fieldName       = document.getElementById("field-name");
  const fieldValue      = document.getElementById("field-value");
  const fieldDomain     = document.getElementById("field-domain");
  const fieldPath       = document.getElementById("field-path");
  const fieldExpires    = document.getElementById("field-expires");
  const fieldSession    = document.getElementById("field-session");
  const fieldSecure     = document.getElementById("field-secure");
  const fieldHttpOnly   = document.getElementById("field-httponly");
  const fieldSameSite   = document.getElementById("field-samesite");
  const errorName       = document.getElementById("error-name");
  const errorDomain     = document.getElementById("error-domain");
  const saveBtn         = document.getElementById("save-btn");
  const saveError       = document.getElementById("save-error");

  // Toast
  const toastEl         = document.getElementById("toast");

  // -----------------------------------------------
  // 2. STATE — things we need to remember
  // -----------------------------------------------

  // The current tab's full URL (e.g. "https://www.google.com/")
  let currentTabUrl = "";

  // The current tab's hostname (e.g. "www.google.com")
  let currentHostname = "";

  // When editing an EXISTING cookie, we store its original data here.
  // We need this so that if the user changes the name, we can delete
  // the old-named cookie before saving the new one.
  let editingOriginalCookie = null;

  // -----------------------------------------------
  // 3. INITIALIZATION — figure out what site we're on
  // -----------------------------------------------

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {

    if (!tabs || tabs.length === 0) { showError(); return; }

    const tab = tabs[0];
    const url = tab.url;

    // Can't work on Chrome's own pages
    if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("about:")) {
      showError();
      return;
    }

    let hostname = "";
    try {
      hostname = new URL(url).hostname;
    } catch (e) {
      showError();
      return;
    }

    currentTabUrl    = url;
    currentHostname  = hostname;
    siteDomainEl.textContent = hostname;

    loadCookiesForUrl(url);
  });

  // -----------------------------------------------
  // 4. TOOLBAR BUTTON HANDLERS
  // -----------------------------------------------

  // "+ Add" button — open a blank edit form
  addCookieBtn.addEventListener("click", () => {
    if (!currentTabUrl) return; // can't add cookies on error pages
    openAddPanel();
  });

  // "Delete All" button — delete every cookie for this site
  deleteAllBtn.addEventListener("click", () => {
    const allDeleteButtons = Array.from(document.querySelectorAll(".delete-btn"));
    if (allDeleteButtons.length === 0) {
      showToast("No cookies to delete", "error");
      return;
    }

    let deletedCount = 0;
    const total = allDeleteButtons.length;

    allDeleteButtons.forEach((btn) => {
      const cookieUrl  = btn.dataset.url;
      const cookieName = btn.dataset.name;

      chrome.cookies.remove({ url: cookieUrl, name: cookieName }, (result) => {
        if (result) deletedCount++;
        if (deletedCount === total) {
          showToast(`Deleted ${deletedCount} cookie${deletedCount !== 1 ? "s" : ""}`, "success");
          loadCookiesForUrl(currentTabUrl);
        }
      });
    });
  });

  // "← Back" button — return to the cookie list
  backBtn.addEventListener("click", () => {
    closeEditPanel();
    loadCookiesForUrl(currentTabUrl); // refresh the list
  });

  // Delete button inside the edit panel
  editDeleteBtn.addEventListener("click", () => {
    if (!editingOriginalCookie) return;

    const cookieUrl = buildCookieUrl(editingOriginalCookie);

    chrome.cookies.remove({ url: cookieUrl, name: editingOriginalCookie.name }, (result) => {
      if (chrome.runtime.lastError || !result) {
        showSaveError("Could not delete this cookie. Try again.");
        return;
      }
      closeEditPanel();
      loadCookiesForUrl(currentTabUrl);
      showToast(`Deleted "${editingOriginalCookie.name}"`, "success");
    });
  });

  // "Session" checkbox — toggles the date input on/off
  fieldSession.addEventListener("change", () => {
    fieldExpires.disabled = fieldSession.checked;
    if (fieldSession.checked) {
      fieldExpires.value = ""; // clear the date when switching to session
    }
  });

  // Save button
  saveBtn.addEventListener("click", () => {
    saveCookie();
  });

  // =============================================
  // COOKIE LIST FUNCTIONS
  // =============================================

  // Load all cookies for the given URL and show them
  function loadCookiesForUrl(url) {
    showState("loading");

    chrome.cookies.getAll({ url: url }, (cookies) => {
      if (chrome.runtime.lastError) { showError(); return; }

      cookieCountEl.textContent = cookies.length;

      if (cookies.length === 0) {
        showState("empty");
        return;
      }

      buildCookieList(cookies);
      showState("list");
    });
  }

  // Build the HTML list of cookies
  function buildCookieList(cookies) {
    cookieListEl.innerHTML = "";

    // Sort alphabetically by name
    cookies.sort((a, b) => a.name.localeCompare(b.name));

    cookies.forEach((cookie) => {
      const cookieUrl = buildCookieUrl(cookie);

      const li = document.createElement("li");
      li.className = "cookie-item";

      const flags = buildFlagBadges(cookie);

      // Truncate long values for display
      const displayValue = cookie.value.length > 80
        ? cookie.value.substring(0, 80) + "…"
        : (cookie.value || "(empty)");

      li.innerHTML = `
        <div class="cookie-dot"></div>
        <div class="cookie-info">
          <div class="cookie-name" title="${escapeHtml(cookie.name)}">${escapeHtml(cookie.name)}</div>
          <div class="cookie-value" title="${escapeHtml(cookie.value)}">${escapeHtml(displayValue)}</div>
          ${flags.length > 0 ? `<div class="cookie-flags">${flags.join("")}</div>` : ""}
        </div>
        <span class="edit-hint">edit →</span>
        <button class="delete-btn" title="Delete this cookie"
          data-url="${escapeHtml(cookieUrl)}"
          data-name="${escapeHtml(cookie.name)}">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 3.5h9M5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M10.5 3.5l-.5 7a.5.5 0 01-.5.5H4a.5.5 0 01-.5-.5l-.5-7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      `;

      // Clicking the delete button deletes without opening the editor
      const deleteBtn = li.querySelector(".delete-btn");
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation(); // prevent the row click from also firing
        deleteSingleCookie(cookieUrl, cookie.name, li);
      });

      // Clicking anywhere ELSE on the row opens the edit panel
      li.addEventListener("click", (e) => {
        if (e.target === deleteBtn || deleteBtn.contains(e.target)) return;
        openEditPanel(cookie);
      });

      cookieListEl.appendChild(li);
    });
  }

  // Delete a single cookie from the list view
  function deleteSingleCookie(url, name, rowElement) {
    chrome.cookies.remove({ url: url, name: name }, (result) => {
      if (chrome.runtime.lastError) {
        showToast("Delete failed — try again", "error");
        return;
      }

      if (result) {
        rowElement.classList.add("removing");
        setTimeout(() => {
          rowElement.remove();
          const remaining = document.querySelectorAll(".cookie-item").length;
          cookieCountEl.textContent = remaining;
          if (remaining === 0) showState("empty");
        }, 230);
        showToast(`Deleted "${name}"`, "success");
      } else {
        showToast("Could not delete this cookie", "error");
      }
    });
  }

  // =============================================
  // EDIT PANEL FUNCTIONS
  // =============================================

  // Open the edit panel pre-filled with an existing cookie's data
  function openEditPanel(cookie) {
    editingOriginalCookie = cookie; // remember what we're editing

    // Set the panel title to the cookie's name
    editPanelTitle.textContent = cookie.name;

    // Show the delete button (hidden when adding new cookies)
    editDeleteBtn.classList.remove("hidden-btn");

    // Fill in all the fields
    fieldName.value    = cookie.name;
    fieldValue.value   = cookie.value;

    // Domain: strip the leading dot if present (e.g. ".google.com" → "google.com")
    fieldDomain.value  = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
    fieldPath.value    = cookie.path || "/";

    // Expiration: check if it's a session cookie (no expiry) or has a date
    if (cookie.expirationDate) {
      fieldSession.checked  = false;
      fieldExpires.disabled = false;
      fieldExpires.value    = timestampToDatetimeLocal(cookie.expirationDate);
    } else {
      fieldSession.checked  = true;
      fieldExpires.disabled = true;
      fieldExpires.value    = "";
    }

    // Flags
    fieldSecure.checked   = cookie.secure   || false;
    fieldHttpOnly.checked = cookie.httpOnly || false;

    // SameSite — the cookie object uses Chrome's internal value names
    fieldSameSite.value = cookie.sameSite || "unspecified";

    // Clear any previous error messages
    clearErrors();

    // Slide to the edit panel
    panelContainer.classList.add("showing-edit");
  }

  // Open the edit panel with a BLANK form for creating a new cookie
  function openAddPanel() {
    editingOriginalCookie = null; // we're not editing an existing one

    editPanelTitle.textContent = "New Cookie";

    // Hide the delete button — can't delete a cookie that doesn't exist yet
    editDeleteBtn.classList.add("hidden-btn");

    // Fill in sensible defaults
    fieldName.value    = "";
    fieldValue.value   = "";

    // Default domain to the current site's hostname
    fieldDomain.value  = currentHostname;
    fieldPath.value    = "/";

    // Default to a non-session cookie expiring 30 days from now
    fieldSession.checked  = false;
    fieldExpires.disabled = false;
    fieldExpires.value    = timestampToDatetimeLocal(Date.now() / 1000 + 30 * 24 * 60 * 60);

    // Default flags off
    fieldSecure.checked   = false;
    fieldHttpOnly.checked = false;
    fieldSameSite.value   = "unspecified";

    clearErrors();

    panelContainer.classList.add("showing-edit");

    // Focus the name field so the user can start typing right away
    setTimeout(() => fieldName.focus(), 300);
  }

  // Close the edit panel and go back to the list
  function closeEditPanel() {
    panelContainer.classList.remove("showing-edit");
    editingOriginalCookie = null;
  }

  // =============================================
  // SAVE COOKIE LOGIC
  // =============================================

  function saveCookie() {

    // --- Validation ---
    let hasError = false;

    const newName = fieldName.value.trim();
    if (!newName) {
      errorName.classList.remove("hidden");
      hasError = true;
    } else {
      errorName.classList.add("hidden");
    }

    const newDomain = fieldDomain.value.trim();
    if (!newDomain) {
      errorDomain.classList.remove("hidden");
      hasError = true;
    } else {
      errorDomain.classList.add("hidden");
    }

    if (hasError) return;

    // --- Build the cookie object to pass to Chrome ---
    const newValue    = fieldValue.value;
    const newPath     = fieldPath.value.trim() || "/";
    const isSession   = fieldSession.checked;
    const isSecure    = fieldSecure.checked;
    const isHttpOnly  = fieldHttpOnly.checked;
    const sameSite    = fieldSameSite.value;

    // Build the URL chrome.cookies.set() needs
    // Secure cookies need https://, others can use http://
    const scheme    = isSecure ? "https" : "http";
    const cookieUrl = `${scheme}://${newDomain}${newPath}`;

    // Start building the cookie descriptor object
    const cookieDescriptor = {
      url:      cookieUrl,
      name:     newName,
      value:    newValue,
      domain:   newDomain,
      path:     newPath,
      secure:   isSecure,
      httpOnly: isHttpOnly,
      sameSite: sameSite
    };

    // Only add expirationDate if it's NOT a session cookie
    if (!isSession && fieldExpires.value) {
      cookieDescriptor.expirationDate = datetimeLocalToTimestamp(fieldExpires.value);
    }

    hideSaveError();

    // --- If we renamed an existing cookie, delete the old one first ---
    // Cookie "identity" in Chrome is (name + domain + path).
    // Changing the name creates a NEW cookie — the old one stays.
    // So if the name changed, we must explicitly delete the old one.
    const nameChanged = editingOriginalCookie && (editingOriginalCookie.name !== newName);

    if (nameChanged) {
      const oldUrl = buildCookieUrl(editingOriginalCookie);
      chrome.cookies.remove({ url: oldUrl, name: editingOriginalCookie.name }, () => {
        // Now save the new cookie (regardless of whether remove succeeded)
        setCookieAndReturn(cookieDescriptor, newName);
      });
    } else {
      setCookieAndReturn(cookieDescriptor, newName);
    }
  }

  // Actually call chrome.cookies.set, then return to the list on success
  function setCookieAndReturn(cookieDescriptor, cookieName) {
    chrome.cookies.set(cookieDescriptor, (result) => {

      // chrome.runtime.lastError is how Chrome reports failures
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || "Unknown error";

        // Give the user a plain-English explanation for the most common errors
        if (msg.includes("No host permissions")) {
          showSaveError("Permission error: The extension doesn't have access to this domain.");
        } else if (msg.includes("secure")) {
          showSaveError("A SameSite=None cookie must have Secure enabled. Check the Secure box and try again.");
        } else {
          showSaveError(`Chrome refused to save: ${msg}`);
        }
        return;
      }

      if (!result) {
        showSaveError("Chrome didn't save the cookie. Check that the domain matches the current site.");
        return;
      }

      // Success! Go back to the list.
      const action = editingOriginalCookie ? "Updated" : "Created";
      closeEditPanel();
      loadCookiesForUrl(currentTabUrl);
      showToast(`${action} "${cookieName}"`, "success");
    });
  }

  // =============================================
  // HELPER FUNCTIONS
  // =============================================

  // Build the URL chrome.cookies methods need from a cookie object
  function buildCookieUrl(cookie) {
    const scheme = cookie.secure ? "https" : "http";
    const domain = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
    const path   = cookie.path || "/";
    return `${scheme}://${domain}${path}`;
  }

  // Build the little badge HTML strings for a cookie's flags
  function buildFlagBadges(cookie) {
    const flags = [];
    if (cookie.secure)           flags.push('<span class="flag flag-secure">Secure</span>');
    if (cookie.httpOnly)         flags.push('<span class="flag flag-http">HttpOnly</span>');
    if (!cookie.expirationDate)  flags.push('<span class="flag flag-session">Session</span>');
    return flags;
  }

  // Convert a Unix timestamp (in seconds, as Chrome uses) to the string
  // format that HTML datetime-local inputs expect: "YYYY-MM-DDTHH:MM"
  function timestampToDatetimeLocal(timestamp) {
    const date = new Date(timestamp * 1000);
    // toISOString() gives "2026-04-12T14:30:00.000Z" — we take the first 16 chars
    // but we need LOCAL time, not UTC. So we adjust:
    const offset = date.getTimezoneOffset() * 60 * 1000; // offset in ms
    const local  = new Date(date.getTime() - offset);
    return local.toISOString().slice(0, 16);
  }

  // Convert a datetime-local string ("YYYY-MM-DDTHH:MM") back to a Unix
  // timestamp in SECONDS (Chrome's expirationDate uses seconds, not milliseconds)
  function datetimeLocalToTimestamp(str) {
    return new Date(str).getTime() / 1000;
  }

  // Switch which "view" is visible in the list panel
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

  function clearErrors() {
    errorName.classList.add("hidden");
    errorDomain.classList.add("hidden");
    hideSaveError();
  }

  function showSaveError(msg) {
    saveError.textContent = msg;
    saveError.classList.remove("hidden");
  }

  function hideSaveError() {
    saveError.classList.add("hidden");
    saveError.textContent = "";
  }

  // Show a small notification at the bottom of the popup
  let toastTimer = null;
  function showToast(message, type = "success") {
    toastEl.textContent = message;
    toastEl.className   = `toast ${type} show`;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2500);
  }

  // Escape HTML special characters so cookie values can't inject code
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
