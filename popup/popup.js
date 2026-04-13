// =============================================
// CookieGuard Pro — Popup Script (Phase 3)
// Adds: auto-delete toggle, whitelist quick-add,
//       settings button, free-tier limit messaging
// =============================================

const FREE_TIER_WHITELIST_LIMIT = 10;

document.addEventListener("DOMContentLoaded", () => {

  // -----------------------------------------------
  // ELEMENT REFERENCES
  // -----------------------------------------------

  // Header / controls
  const siteDomainEl      = document.getElementById("site-domain");
  const autoDeleteToggle  = document.getElementById("auto-delete-toggle");
  const whitelistBtn      = document.getElementById("whitelist-btn");
  const whitelistBtnText  = document.getElementById("whitelist-btn-text");
  const settingsBtn       = document.getElementById("settings-btn");

  // Toolbar
  const cookieCountEl     = document.getElementById("cookie-count");
  const addCookieBtn      = document.getElementById("add-cookie-btn");
  const deleteAllBtn      = document.getElementById("delete-all-btn");

  // List panel states
  const panelContainer    = document.getElementById("panel-container");
  const loadingStateEl    = document.getElementById("loading-state");
  const emptyStateEl      = document.getElementById("empty-state");
  const errorStateEl      = document.getElementById("error-state");
  const cookieListEl      = document.getElementById("cookie-list");

  // Edit panel
  const backBtn           = document.getElementById("back-btn");
  const editPanelTitle    = document.getElementById("edit-panel-title");
  const editDeleteBtn     = document.getElementById("edit-delete-btn");
  const fieldName         = document.getElementById("field-name");
  const fieldValue        = document.getElementById("field-value");
  const fieldDomain       = document.getElementById("field-domain");
  const fieldPath         = document.getElementById("field-path");
  const fieldExpires      = document.getElementById("field-expires");
  const fieldSession      = document.getElementById("field-session");
  const fieldSecure       = document.getElementById("field-secure");
  const fieldHttpOnly     = document.getElementById("field-httponly");
  const fieldSameSite     = document.getElementById("field-samesite");
  const errorName         = document.getElementById("error-name");
  const errorDomain       = document.getElementById("error-domain");
  const saveBtn           = document.getElementById("save-btn");
  const saveError         = document.getElementById("save-error");

  // Toast
  const toastEl           = document.getElementById("toast");

  // -----------------------------------------------
  // STATE
  // -----------------------------------------------

  let currentTabUrl          = "";
  let currentHostname        = "";
  let editingOriginalCookie  = null;
  let currentWhitelist       = [];   // live copy of whitelist from storage
  let autoDeleteEnabled      = false;

  // -----------------------------------------------
  // INITIALIZATION
  // -----------------------------------------------

  // Step 1: figure out what site we're on
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) { showError(); return; }

    const tab = tabs[0];
    const url = tab.url;

    if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("about:")) {
      showError();
      // Still load settings even on error pages
      loadSettings(() => {});
      return;
    }

    let hostname = "";
    try { hostname = new URL(url).hostname; } catch (e) { showError(); return; }

    currentTabUrl   = url;
    currentHostname = hostname;
    siteDomainEl.textContent = hostname;

    // Step 2: load settings from storage, THEN load cookies
    loadSettings(() => {
      updateWhitelistButton();
      loadCookiesForUrl(url);
    });
  });

  // -----------------------------------------------
  // LOAD SETTINGS FROM STORAGE
  // -----------------------------------------------
  function loadSettings(callback) {
    chrome.storage.local.get(["autoDeleteEnabled", "whitelist"], (result) => {
      autoDeleteEnabled  = result.autoDeleteEnabled || false;
      currentWhitelist   = result.whitelist         || [];

      // Set the toggle to match the saved setting
      autoDeleteToggle.checked = autoDeleteEnabled;

      if (callback) callback();
    });
  }

  // -----------------------------------------------
  // AUTO-DELETE TOGGLE
  // -----------------------------------------------
  autoDeleteToggle.addEventListener("change", () => {
    autoDeleteEnabled = autoDeleteToggle.checked;

    // Save to storage — the service worker's storage listener will update the badge
    chrome.storage.local.set({ autoDeleteEnabled: autoDeleteEnabled });

    showToast(
      autoDeleteEnabled ? "Auto-delete ON" : "Auto-delete OFF",
      autoDeleteEnabled ? "success" : "error"
    );
  });

  // -----------------------------------------------
  // WHITELIST (PROTECT SITE) BUTTON
  // -----------------------------------------------
  whitelistBtn.addEventListener("click", () => {
    if (!currentHostname) return;

    const isCurrentlyWhitelisted = currentWhitelist.includes(currentHostname);

    if (isCurrentlyWhitelisted) {
      // Remove from whitelist
      currentWhitelist = currentWhitelist.filter((d) => d !== currentHostname);
      chrome.storage.local.set({ whitelist: currentWhitelist });
      updateWhitelistButton();
      showToast(`Removed "${currentHostname}" from protected sites`, "error");

    } else {
      // Check free-tier limit before adding
      if (currentWhitelist.length >= FREE_TIER_WHITELIST_LIMIT) {
        showToast(
          `Free tier limit: ${FREE_TIER_WHITELIST_LIMIT} protected sites max. Open Settings to manage.`,
          "error"
        );
        return;
      }

      // Add to whitelist
      currentWhitelist.push(currentHostname);
      chrome.storage.local.set({ whitelist: currentWhitelist });
      updateWhitelistButton();
      showToast(`"${currentHostname}" is now protected`, "success");
    }
  });

  // Update the whitelist button appearance based on whether this site is protected
  function updateWhitelistButton() {
    if (!currentHostname) return;

    const isProtected = currentWhitelist.includes(currentHostname);

    if (isProtected) {
      whitelistBtn.className    = "btn btn-protected btn-sm";
      whitelistBtnText.textContent = "✓ Protected";
      whitelistBtn.title        = "Click to remove this site from your protected list";
    } else {
      whitelistBtn.className    = "btn btn-ghost btn-sm";
      whitelistBtnText.textContent = "Protect Site";
      whitelistBtn.title        = "Add this site to your protected list so cookies are never auto-deleted";
    }
  }

  // -----------------------------------------------
  // SETTINGS BUTTON → Open options page
  // -----------------------------------------------
  settingsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // -----------------------------------------------
  // TOOLBAR: ADD + DELETE ALL
  // -----------------------------------------------
  addCookieBtn.addEventListener("click", () => {
    if (!currentTabUrl) return;
    openAddPanel();
  });

  deleteAllBtn.addEventListener("click", () => {
    const allDeleteButtons = Array.from(document.querySelectorAll(".delete-btn"));
    if (allDeleteButtons.length === 0) {
      showToast("No cookies to delete", "error");
      return;
    }

    let deletedCount = 0;
    const total = allDeleteButtons.length;

    allDeleteButtons.forEach((btn) => {
      chrome.cookies.remove({ url: btn.dataset.url, name: btn.dataset.name }, (result) => {
        if (result) deletedCount++;
        if (deletedCount === total) {
          showToast(`Deleted ${deletedCount} cookie${deletedCount !== 1 ? "s" : ""}`, "success");
          loadCookiesForUrl(currentTabUrl);
        }
      });
    });
  });

  // -----------------------------------------------
  // EDIT PANEL: BACK + DELETE
  // -----------------------------------------------
  backBtn.addEventListener("click", () => {
    closeEditPanel();
    loadCookiesForUrl(currentTabUrl);
  });

  editDeleteBtn.addEventListener("click", () => {
    if (!editingOriginalCookie) return;
    const cookieUrl  = buildCookieUrl(editingOriginalCookie);
    const cookieName = editingOriginalCookie.name; // save it NOW before closeEditPanel nulls it out
    chrome.cookies.remove({ url: cookieUrl, name: cookieName }, (result) => {
      if (chrome.runtime.lastError || !result) {
        showSaveError("Could not delete this cookie. Try again.");
        return;
      }
      closeEditPanel();
      loadCookiesForUrl(currentTabUrl);
      showToast(`Deleted "${cookieName}"`, "success"); // use the saved variable, not editingOriginalCookie.name
    });
  });

  // Session checkbox toggles expiry field
  fieldSession.addEventListener("change", () => {
    fieldExpires.disabled = fieldSession.checked;
    if (fieldSession.checked) fieldExpires.value = "";
  });

  // Save button
  saveBtn.addEventListener("click", saveCookie);

  // =============================================
  // COOKIE LIST FUNCTIONS
  // =============================================

  function loadCookiesForUrl(url) {
    showState("loading");
    chrome.cookies.getAll({ url: url }, (cookies) => {
      if (chrome.runtime.lastError) { showError(); return; }
      cookieCountEl.textContent = cookies.length;
      if (cookies.length === 0) { showState("empty"); return; }
      buildCookieList(cookies);
      showState("list");
    });
  }

  function buildCookieList(cookies) {
    cookieListEl.innerHTML = "";
    cookies.sort((a, b) => a.name.localeCompare(b.name));

    cookies.forEach((cookie) => {
      const cookieUrl    = buildCookieUrl(cookie);
      const flags        = buildFlagBadges(cookie);
      const displayValue = cookie.value.length > 80
        ? cookie.value.substring(0, 80) + "…"
        : (cookie.value || "(empty)");

      const li = document.createElement("li");
      li.className = "cookie-item";
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

      const deleteBtn = li.querySelector(".delete-btn");
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteSingleCookie(cookieUrl, cookie.name, li);
      });

      li.addEventListener("click", (e) => {
        if (e.target === deleteBtn || deleteBtn.contains(e.target)) return;
        openEditPanel(cookie);
      });

      cookieListEl.appendChild(li);
    });
  }

  function deleteSingleCookie(url, name, rowElement) {
    chrome.cookies.remove({ url: url, name: name }, (result) => {
      if (chrome.runtime.lastError) { showToast("Delete failed", "error"); return; }
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

  function openEditPanel(cookie) {
    editingOriginalCookie = cookie;
    editPanelTitle.textContent = cookie.name;
    editDeleteBtn.classList.remove("hidden-btn");

    fieldName.value   = cookie.name;
    fieldValue.value  = cookie.value;
    fieldDomain.value = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
    fieldPath.value   = cookie.path || "/";

    if (cookie.expirationDate) {
      fieldSession.checked  = false;
      fieldExpires.disabled = false;
      fieldExpires.value    = timestampToDatetimeLocal(cookie.expirationDate);
    } else {
      fieldSession.checked  = true;
      fieldExpires.disabled = true;
      fieldExpires.value    = "";
    }

    fieldSecure.checked   = cookie.secure   || false;
    fieldHttpOnly.checked = cookie.httpOnly || false;
    fieldSameSite.value   = cookie.sameSite || "unspecified";

    clearErrors();
    panelContainer.classList.add("showing-edit");
  }

  function openAddPanel() {
    editingOriginalCookie = null;
    editPanelTitle.textContent = "New Cookie";
    editDeleteBtn.classList.add("hidden-btn");

    fieldName.value       = "";
    fieldValue.value      = "";
    fieldDomain.value     = currentHostname;
    fieldPath.value       = "/";
    fieldSession.checked  = false;
    fieldExpires.disabled = false;
    fieldExpires.value    = timestampToDatetimeLocal(Date.now() / 1000 + 30 * 24 * 60 * 60);
    fieldSecure.checked   = false;
    fieldHttpOnly.checked = false;
    fieldSameSite.value   = "unspecified";

    clearErrors();
    panelContainer.classList.add("showing-edit");
    setTimeout(() => fieldName.focus(), 300);
  }

  function closeEditPanel() {
    panelContainer.classList.remove("showing-edit");
    editingOriginalCookie = null;
  }

  // =============================================
  // SAVE COOKIE
  // =============================================

  function saveCookie() {
    let hasError = false;

    const newName = fieldName.value.trim();
    if (!newName) { errorName.classList.remove("hidden"); hasError = true; }
    else            errorName.classList.add("hidden");

    const newDomain = fieldDomain.value.trim();
    if (!newDomain) { errorDomain.classList.remove("hidden"); hasError = true; }
    else              errorDomain.classList.add("hidden");

    if (hasError) return;

    const newValue   = fieldValue.value;
    const newPath    = fieldPath.value.trim() || "/";
    const isSession  = fieldSession.checked;
    const isSecure   = fieldSecure.checked;
    const isHttpOnly = fieldHttpOnly.checked;
    const sameSite   = fieldSameSite.value;

    const scheme    = isSecure ? "https" : "http";
    const cookieUrl = `${scheme}://${newDomain}${newPath}`;

    const cookieDescriptor = {
      url: cookieUrl, name: newName, value: newValue,
      domain: newDomain, path: newPath,
      secure: isSecure, httpOnly: isHttpOnly, sameSite: sameSite
    };

    if (!isSession && fieldExpires.value) {
      cookieDescriptor.expirationDate = datetimeLocalToTimestamp(fieldExpires.value);
    }

    hideSaveError();

    const nameChanged = editingOriginalCookie && (editingOriginalCookie.name !== newName);

    if (nameChanged) {
      const oldUrl = buildCookieUrl(editingOriginalCookie);
      chrome.cookies.remove({ url: oldUrl, name: editingOriginalCookie.name }, () => {
        setCookieAndReturn(cookieDescriptor, newName);
      });
    } else {
      setCookieAndReturn(cookieDescriptor, newName);
    }
  }

  function setCookieAndReturn(cookieDescriptor, cookieName) {
    chrome.cookies.set(cookieDescriptor, (result) => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || "Unknown error";
        if (msg.includes("No host permissions")) {
          showSaveError("Permission error: extension doesn't have access to this domain.");
        } else if (msg.includes("secure")) {
          showSaveError("SameSite=None requires Secure to be checked. Enable Secure and try again.");
        } else {
          showSaveError(`Chrome refused to save: ${msg}`);
        }
        return;
      }
      if (!result) {
        showSaveError("Chrome didn't save the cookie. Check that the domain matches the current site.");
        return;
      }
      const action = editingOriginalCookie ? "Updated" : "Created";
      closeEditPanel();
      loadCookiesForUrl(currentTabUrl);
      showToast(`${action} "${cookieName}"`, "success");
    });
  }

  // =============================================
  // HELPERS
  // =============================================

  function buildCookieUrl(cookie) {
    const scheme = cookie.secure ? "https" : "http";
    const domain = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
    return `${scheme}://${domain}${cookie.path || "/"}`;
  }

  function buildFlagBadges(cookie) {
    const flags = [];
    if (cookie.secure)          flags.push('<span class="flag flag-secure">Secure</span>');
    if (cookie.httpOnly)        flags.push('<span class="flag flag-http">HttpOnly</span>');
    if (!cookie.expirationDate) flags.push('<span class="flag flag-session">Session</span>');
    return flags;
  }

  function timestampToDatetimeLocal(timestamp) {
    const date   = new Date(timestamp * 1000);
    const offset = date.getTimezoneOffset() * 60 * 1000;
    const local  = new Date(date.getTime() - offset);
    return local.toISOString().slice(0, 16);
  }

  function datetimeLocalToTimestamp(str) {
    return new Date(str).getTime() / 1000;
  }

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

  let toastTimer = null;
  function showToast(message, type = "success") {
    toastEl.textContent = message;
    toastEl.className   = `toast ${type} show`;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
  }

  function escapeHtml(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

}); // end DOMContentLoaded
