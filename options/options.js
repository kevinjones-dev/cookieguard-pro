// =============================================
// CookieGuard Pro — Options Page Script
// Manages: auto-delete toggle, whitelist CRUD
// =============================================

const FREE_TIER_LIMIT = 10;
const GITHUB_URL      = "https://github.com/kevinjones-dev/cookieguard-pro";

document.addEventListener("DOMContentLoaded", () => {

  // -----------------------------------------------
  // ELEMENT REFERENCES
  // -----------------------------------------------
  const autoDeleteToggle = document.getElementById("auto-delete-toggle");
  const autoDeleteStatus = document.getElementById("auto-delete-status");
  const slotUsedEl       = document.getElementById("slot-used");
  const limitBanner      = document.getElementById("limit-banner");
  const newDomainInput   = document.getElementById("new-domain-input");
  const addDomainBtn     = document.getElementById("add-domain-btn");
  const addError         = document.getElementById("add-error");
  const whitelistUl      = document.getElementById("whitelist-ul");
  const whitelistEmpty   = document.getElementById("whitelist-empty");
  const githubLink       = document.getElementById("github-link");

  // -----------------------------------------------
  // SET STATIC LINKS
  // -----------------------------------------------
  githubLink.href = GITHUB_URL;

  // -----------------------------------------------
  // LOAD SETTINGS
  // -----------------------------------------------
  chrome.storage.local.get(["autoDeleteEnabled", "whitelist"], (result) => {
    const autoDeleteEnabled = result.autoDeleteEnabled || false;
    const whitelist         = result.whitelist         || [];

    // Set the toggle
    autoDeleteToggle.checked = autoDeleteEnabled;
    updateStatusLine(autoDeleteEnabled);

    // Render the whitelist
    renderWhitelist(whitelist);
  });

  // -----------------------------------------------
  // AUTO-DELETE TOGGLE
  // -----------------------------------------------
  autoDeleteToggle.addEventListener("change", () => {
    const enabled = autoDeleteToggle.checked;
    chrome.storage.local.set({ autoDeleteEnabled: enabled });
    updateStatusLine(enabled);
    // The service worker's storage.onChanged listener will update the badge
  });

  function updateStatusLine(enabled) {
    if (enabled) {
      autoDeleteStatus.textContent = "Auto-delete is ON — cookies will be deleted when tabs close (except protected sites).";
      autoDeleteStatus.className   = "status-line status-on";
    } else {
      autoDeleteStatus.textContent = "Auto-delete is OFF — cookies will not be deleted when tabs close.";
      autoDeleteStatus.className   = "status-line status-off";
    }
  }

  // -----------------------------------------------
  // ADD DOMAIN
  // -----------------------------------------------
  addDomainBtn.addEventListener("click", () => {
    addDomain();
  });

  // Also allow pressing Enter in the input to add
  newDomainInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addDomain();
  });

  function addDomain() {
    addError.classList.add("hidden");

    let domain = newDomainInput.value.trim().toLowerCase();

    // Strip leading https:// or http:// if the user typed a full URL
    domain = domain.replace(/^https?:\/\//, "");

    // Strip a trailing slash
    domain = domain.replace(/\/$/, "");

    // Strip "www." prefix — we want the base domain
    // (we match subdomains automatically in the service worker)
    // Actually let's keep www. if they typed it — people should get what they expect

    // Validate: must contain at least one dot and no spaces
    if (!domain || !domain.includes(".") || domain.includes(" ")) {
      showAddError("Enter a valid domain like example.com or mail.google.com");
      return;
    }

    chrome.storage.local.get(["whitelist"], (result) => {
      const whitelist = result.whitelist || [];

      // Check limit
      if (whitelist.length >= FREE_TIER_LIMIT) {
        showAddError(`Free tier limit: ${FREE_TIER_LIMIT} protected sites maximum. Remove a site to add a new one.`);
        return;
      }

      // Check duplicate
      if (whitelist.includes(domain)) {
        showAddError(`"${domain}" is already on your protected list.`);
        return;
      }

      // Add it
      const updated = [...whitelist, domain];
      chrome.storage.local.set({ whitelist: updated }, () => {
        newDomainInput.value = "";
        renderWhitelist(updated);
      });
    });
  }

  function showAddError(msg) {
    addError.textContent = msg;
    addError.classList.remove("hidden");
  }

  // -----------------------------------------------
  // REMOVE DOMAIN
  // -----------------------------------------------
  function removeDomain(domain) {
    chrome.storage.local.get(["whitelist"], (result) => {
      const whitelist = result.whitelist || [];
      const updated   = whitelist.filter((d) => d !== domain);
      chrome.storage.local.set({ whitelist: updated }, () => {
        renderWhitelist(updated);
      });
    });
  }

  // -----------------------------------------------
  // RENDER THE WHITELIST
  // -----------------------------------------------
  function renderWhitelist(whitelist) {
    whitelistUl.innerHTML = "";

    // Update the slot counter
    slotUsedEl.textContent = whitelist.length;

    // Show or hide the limit banner
    if (whitelist.length >= FREE_TIER_LIMIT) {
      limitBanner.classList.remove("hidden");
    } else {
      limitBanner.classList.add("hidden");
    }

    // Show empty state if no sites
    if (whitelist.length === 0) {
      whitelistEmpty.classList.remove("hidden");
      return;
    }

    whitelistEmpty.classList.add("hidden");

    // Sort alphabetically so the list is easy to scan
    const sorted = [...whitelist].sort();

    sorted.forEach((domain) => {
      const li = document.createElement("li");
      li.className = "whitelist-item";

      li.innerHTML = `
        <div class="whitelist-shield">
          <svg width="12" height="13" viewBox="0 0 12 13" fill="none">
            <path d="M6 1L10.5 2.75v4C10.5 9.75 6 12 6 12S1.5 9.75 1.5 6.75v-4L6 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          </svg>
        </div>
        <span class="whitelist-domain" title="${escapeHtml(domain)}">${escapeHtml(domain)}</span>
        <button class="remove-btn" title="Remove ${escapeHtml(domain)} from protected sites" data-domain="${escapeHtml(domain)}">×</button>
      `;

      const removeBtn = li.querySelector(".remove-btn");
      removeBtn.addEventListener("click", () => {
        // Animate the row out before removing
        li.style.transition = "opacity 0.2s, transform 0.2s";
        li.style.opacity    = "0";
        li.style.transform  = "translateX(10px)";
        setTimeout(() => removeDomain(domain), 200);
      });

      whitelistUl.appendChild(li);
    });
  }

  // -----------------------------------------------
  // HELPER: escape HTML special characters
  // -----------------------------------------------
  function escapeHtml(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

}); // end DOMContentLoaded
