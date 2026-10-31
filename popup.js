document.addEventListener("DOMContentLoaded", () => {
  const accountsContainer = document.getElementById("accounts-list");
  const emptyState = document.getElementById("empty-state");
  const noResultsState = document.getElementById("no-results");
  const addAccountBtn = document.getElementById("add-account-btn");
  const refreshBtn = document.getElementById("refresh-btn");
  const countBadge = document.getElementById("account-count-badge");
  const searchInput = document.getElementById("search-input");

  const LOAD_TIMEOUT_MS = 2500;
  const PHOTO_SEARCH_WINDOW = 800; // chars scanned around an email match (fallback when no neighboring email boundary is found)

  const USER_ICON_SVG = `
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
    </svg>
  `;

  // ---------- In-memory & Storage caches ----------
  let memoryAvatarCache = null;
  let memoryHiddenAccounts = null;

  function getLocalHiddenAccountsSync() {
    try {
      const item = localStorage.getItem("gmail_hidden_accounts");
      return item ? JSON.parse(item) : [];
    } catch (e) {
      return [];
    }
  }

  function getLocalAvatarCacheSync() {
    try {
      const item = localStorage.getItem("gmail_avatars_cache");
      return item ? JSON.parse(item) : {};
    } catch (e) {
      return {};
    }
  }

  async function getHiddenAccounts() {
    if (memoryHiddenAccounts !== null) return memoryHiddenAccounts;
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(["gmail_hidden_accounts"], (res) => {
          memoryHiddenAccounts = res ? res.gmail_hidden_accounts || [] : [];
          resolve(memoryHiddenAccounts);
        });
      } else {
        memoryHiddenAccounts = getLocalHiddenAccountsSync();
        resolve(memoryHiddenAccounts);
      }
    });
  }

  async function saveHiddenAccounts(hiddenList) {
    memoryHiddenAccounts = hiddenList;
    try {
      localStorage.setItem("gmail_hidden_accounts", JSON.stringify(hiddenList));
    } catch (e) {}
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ gmail_hidden_accounts: hiddenList });
    }
  }

  async function getStoredAvatars() {
    if (memoryAvatarCache !== null) return memoryAvatarCache;
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(["gmail_avatars_cache"], (res) => {
          memoryAvatarCache = res ? res.gmail_avatars_cache || {} : {};
          resolve(memoryAvatarCache);
        });
      } else {
        memoryAvatarCache = getLocalAvatarCacheSync();
        resolve(memoryAvatarCache);
      }
    });
  }

  async function saveStoredAvatars(cacheObj) {
    memoryAvatarCache = cacheObj;
    try {
      localStorage.setItem("gmail_avatars_cache", JSON.stringify(cacheObj));
    } catch (e) {}
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ gmail_avatars_cache: cacheObj });
    }
  }

  // ---------- Rendering ----------
  async function renderAccounts(forceRefresh = false) {
    if (!accountsContainer) return;

    const rawAccounts = Array.isArray(window.GMAIL_ACCOUNTS) ? window.GMAIL_ACCOUNTS : [];
    
    // Check synchronous storage first for zero-latency initial paint
    const hiddenAccounts = memoryHiddenAccounts !== null 
      ? memoryHiddenAccounts 
      : getLocalHiddenAccountsSync();
      
    const accounts = rawAccounts.filter(a => !hiddenAccounts.includes((a.email || "").toLowerCase()));
    const allEmails = accounts.map((a) => a.email).filter(Boolean);

    if (countBadge) countBadge.textContent = String(accounts.length);

    if (accounts.length === 0) {
      accountsContainer.innerHTML = "";
      if (emptyState) emptyState.classList.remove("hidden");
      return;
    }
    if (emptyState) emptyState.classList.add("hidden");

    // Instant render using cache synchronously first
    const avatarCache = memoryAvatarCache !== null 
      ? memoryAvatarCache 
      : getLocalAvatarCacheSync();

    const fragment = document.createDocumentFragment();
    const rowElements = [];

    accounts.forEach((acc, idx) => {
      const name = acc.name || "Unnamed Account";
      const email = acc.email || "";
      const lowerEmail = email.toLowerCase();
      const cachedAvatar = acc.avatarUrl || avatarCache[lowerEmail];
      const targetUrl = getGmailAccountUrl(email, false);

      const row = document.createElement("a");
      row.className = "row";
      row.href = targetUrl;
      row.target = "_blank";
      row.rel = "noopener noreferrer";
      row.setAttribute("role", "option");
      row.setAttribute("aria-label", `${name} (${email})`);
      row.dataset.email = lowerEmail;
      row.dataset.name = name.toLowerCase();

      const indexEl = document.createElement("span");
      indexEl.className = "row-index";
      indexEl.textContent = String(idx + 1).padStart(2, "0");
      row.appendChild(indexEl);

      const avatarWrap = document.createElement("div");
      avatarWrap.className = "avatar-wrap";
      if (cachedAvatar) {
        avatarWrap.innerHTML = `
          <div class="avatar-tile">
            <img src="${escapeHTML(cachedAvatar)}" alt="${escapeHTML(name)}" class="avatar-img" />
          </div>
        `;
      } else {
        avatarWrap.innerHTML = `<div class="avatar-skeleton"></div>`;
      }
      row.appendChild(avatarWrap);

      const infoDiv = document.createElement("div");
      infoDiv.className = "row-info";
      infoDiv.innerHTML = `
        <div class="row-name-line">
          <span class="row-name">${escapeHTML(name)}</span>
        </div>
        <div class="row-meta-line">
          <span class="status-dot ${cachedAvatar ? "online" : ""}"></span>
          <span class="row-email">${escapeHTML(email)}</span>
        </div>
      `;
      row.appendChild(infoDiv);

      // Actions Area (Delete + Go Arrow)
      const actionsDiv = document.createElement("div");
      actionsDiv.className = "row-actions";

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "row-delete-btn";
      deleteBtn.type = "button";
      deleteBtn.title = "ลบบัญชีนี้ออกจากรายการ";
      deleteBtn.setAttribute("aria-label", `ลบบัญชี ${name}`);
      deleteBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      `;

      deleteBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(`คุณต้องการซ่อน/ลบบัญชี ${email} ออกจากรายการใช่หรือไม่?`)) {
          const currentHidden = await getHiddenAccounts();
          if (!currentHidden.includes(lowerEmail)) {
            currentHidden.push(lowerEmail);
            await saveHiddenAccounts(currentHidden);
            renderAccounts();
          }
        }
      });
      actionsDiv.appendChild(deleteBtn);

      const goEl = document.createElement("span");
      goEl.className = "row-go";
      goEl.setAttribute("aria-hidden", "true");
      goEl.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      `;
      actionsDiv.appendChild(goEl);

      row.appendChild(actionsDiv);

      row.addEventListener("click", (e) => {
        if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          e.preventDefault();
          const isUnlogged = row.classList.contains("is-unlogged");
          openGmailTab(email, isUnlogged);
        }
      });

      fragment.appendChild(row);
      rowElements.push({ row, acc, cachedAvatar });
    });

    // Single DOM update operation (batch injection)
    accountsContainer.innerHTML = "";
    accountsContainer.appendChild(fragment);
    applyFilter();

    // Re-sync storage in background if not already in memory
    if (memoryHiddenAccounts === null || memoryAvatarCache === null) {
      Promise.all([getHiddenAccounts(), getStoredAvatars()]).then(([storedHidden, storedAvatars]) => {
        // If hidden list changed from background, re-filter
        if (storedHidden.length !== hiddenAccounts.length) {
          renderAccounts();
        }
      });
    }

    // Determine if we need to fetch Google SignOutOptions:
    // Only fetch if forceRefresh is true OR there are accounts without any cached avatar
    const needsFetch = forceRefresh || rowElements.some(item => !item.cachedAvatar);

    if (needsFetch) {
      fetchSignOutOptionsHtml().then((signOutHtml) => {
        rowElements.forEach(({ row, acc }) => {
          processAccountAvatar(row, acc, avatarCache, signOutHtml, allEmails, forceRefresh);
        });
      });
    }
  }

  async function processAccountAvatar(row, acc, avatarCache, signOutHtml, allEmails, forceRefresh = false) {
    const avatarWrap = row.querySelector(".avatar-wrap");
    const statusDot = row.querySelector(".status-dot");
    const name = acc.name || "Unnamed Account";
    const email = acc.email || "";
    const lowerEmail = email.toLowerCase();

    // If already has avatar and not forced refresh, no need to re-verify
    if (!forceRefresh && avatarCache[lowerEmail] && row.querySelector(".avatar-img")) {
      statusDot.className = "status-dot online";
      row.classList.remove("is-unlogged");
      return;
    }

    let isResolved = false;

    const timeoutTimer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        setUnloggedState(row, avatarWrap, statusDot);
      }
    }, LOAD_TIMEOUT_MS);

    try {
      // 1. Manual override
      let targetUrl = acc.avatarUrl;

      // 2. Try extracting this account's photo from the page
      if (!targetUrl && signOutHtml) {
        targetUrl = extractPhotoForEmail(signOutHtml, email, allEmails);
      }

      // 3. Fallback to cache ONLY if fetch succeeded or manual override exists
      if (!targetUrl && avatarCache[lowerEmail]) {
        delete avatarCache[lowerEmail];
        saveStoredAvatars(avatarCache);
      }

      if (targetUrl) {
        if (avatarCache[lowerEmail] === targetUrl && row.querySelector(".avatar-img")) {
          clearTimeout(timeoutTimer);
          isResolved = true;
          statusDot.className = "status-dot online";
          row.classList.remove("is-unlogged");
          return;
        }

        const imgLoaded = await testLoadImage(targetUrl, 1500);
        if (imgLoaded && !isResolved) {
          clearTimeout(timeoutTimer);
          isResolved = true;

          avatarCache[lowerEmail] = targetUrl;
          saveStoredAvatars(avatarCache);

          avatarWrap.innerHTML = `
            <div class="avatar-tile">
              <img src="${escapeHTML(targetUrl)}" alt="${escapeHTML(name)}" class="avatar-img" />
            </div>
          `;
          statusDot.className = "status-dot online";
          row.classList.remove("is-unlogged");
          return;
        }
      }
    } catch (err) {
      console.debug("Error processing avatar for", email, err);
    }

    if (!isResolved) {
      clearTimeout(timeoutTimer);
      isResolved = true;
      delete avatarCache[lowerEmail];
      saveStoredAvatars(avatarCache);
      setUnloggedState(row, avatarWrap, statusDot);
    }
  }

  function setUnloggedState(row, avatarWrap, statusDot) {
    row.classList.add("is-unlogged");
    const email = row.dataset.email || "";
    row.href = getGmailAccountUrl(email, true);
    avatarWrap.innerHTML = `
      <div class="avatar-tile avatar-fallback-icon" title="ยังไม่ได้ล็อกอิน">
        ${USER_ICON_SVG}
      </div>
    `;
    statusDot.className = "status-dot offline";
    row.setAttribute("title", "ยังไม่ Login (คลิกเพื่อ Login บัญชีนี้)");
  }

  function getGmailAccountUrl(email, isUnlogged) {
    if (isUnlogged) {
      if (email) {
        return `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(email)}&continue=${encodeURIComponent("https://mail.google.com/mail/")}`;
      }
      return "https://accounts.google.com/AddSession";
    }
    return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email)}`;
  }

  function openGmailTab(email, isUnlogged) {
    const targetUrl = getGmailAccountUrl(email, isUnlogged);

    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: targetUrl });
    } else {
      window.open(targetUrl, "_blank");
    }
  }

  function testLoadImage(url, timeoutMs) {
    return new Promise((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => {
        img.src = "";
        resolve(false);
      }, timeoutMs);

      img.onload = () => {
        clearTimeout(timer);
        resolve(true);
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
      img.src = url;
    });
  }

  /**
   * Parse Google SignOutOptions page HTML to accurately extract each email's avatar.
   * Google embeds profile info in JSON-like arrays or HTML blocks pairing email with avatar.
   *
   * To avoid picking up a neighboring account's photo (the main cause of
   * mismatched avatars), the search window for a given email is clamped to
   * the position of the nearest OTHER known account email before/after it,
   * instead of always using a fixed-size window. Among candidate URLs found
   * in that window, the one closest to the email's position wins, with a
   * small preference given to URLs that look like real profile-photo paths.
   */
  function extractPhotoForEmail(html, email, allEmails) {
    if (!email) return null;
    const lowerHtml = html.toLowerCase();
    const lowerEmail = email.toLowerCase();

    // Positions of every OTHER account's email in the page, used as
    // boundaries so we never scan into a neighboring account's block.
    const otherEmailPositions = [];
    (allEmails || []).forEach((e) => {
      if (!e || e.toLowerCase() === lowerEmail) return;
      const lowerOther = e.toLowerCase();
      let idx = lowerHtml.indexOf(lowerOther);
      while (idx !== -1) {
        otherEmailPositions.push(idx);
        idx = lowerHtml.indexOf(lowerOther, idx + 1);
      }
    });

    const urlPattern = /https:\/\/[a-zA-Z0-9.\-]*googleusercontent\.com\/[a-zA-Z0-9_\-/=?]+/g;

    let searchStart = 0;
    let bestUrl = null;
    let bestScore = Infinity;

    while (searchStart < lowerHtml.length) {
      const emailIdx = lowerHtml.indexOf(lowerEmail, searchStart);
      if (emailIdx === -1) break;

      // Clamp the window to the nearest neighboring account email, falling
      // back to the fixed PHOTO_SEARCH_WINDOW if none is nearby.
      let prevBoundary = Math.max(0, emailIdx - PHOTO_SEARCH_WINDOW);
      let nextBoundary = Math.min(html.length, emailIdx + PHOTO_SEARCH_WINDOW);

      otherEmailPositions.forEach((pos) => {
        if (pos < emailIdx && pos > prevBoundary) prevBoundary = pos;
        if (pos > emailIdx && pos < nextBoundary) nextBoundary = pos;
      });

      const snippet = html.slice(prevBoundary, nextBoundary);
      const offset = prevBoundary;

      let match;
      urlPattern.lastIndex = 0;
      while ((match = urlPattern.exec(snippet)) !== null) {
        const url = match[0];
        const absPos = offset + match.index;
        const distance = Math.abs(absPos - emailIdx);

        const looksLikeProfilePhoto =
          url.includes("/a/") ||
          url.includes("/ogw/") ||
          url.includes("/a-/") ||
          url.includes("/cm/") ||
          url.includes("s96-c") ||
          url.includes("s64-c");

        // Prefer close matches; heavily penalize URLs that don't look like
        // actual profile-photo paths so we don't grab an unrelated image.
        const score = distance + (looksLikeProfilePhoto ? 0 : 100000);

        if (score < bestScore) {
          bestScore = score;
          bestUrl = url;
        }
      }

      searchStart = emailIdx + lowerEmail.length;
    }

    return bestUrl;
  }

  async function fetchSignOutOptionsHtml() {
    try {
      const res = await fetch("https://accounts.google.com/SignOutOptions", {
        credentials: "include"
      });
      if (res.ok) {
        return await res.text();
      }
    } catch (e) {
      console.debug("Error fetching SignOutOptions page", e);
    }
    return null;
  }

  function openAddAccountTab() {
    const addAccountUrl = "https://accounts.google.com/AddSession";
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: addAccountUrl });
    } else {
      window.open(addAccountUrl, "_blank");
    }
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ---------- Search filter ----------
  function applyFilter() {
    if (!searchInput || !accountsContainer) return;
    const q = searchInput.value.trim().toLowerCase();
    const rows = accountsContainer.querySelectorAll(".row");
    let visibleCount = 0;

    rows.forEach((row) => {
      const match = !q || row.dataset.name.includes(q) || row.dataset.email.includes(q);
      row.classList.toggle("hidden", !match);
      if (match) visibleCount += 1;
    });

    const hasAccounts = rows.length > 0;
    if (noResultsState) {
      noResultsState.classList.toggle("hidden", !hasAccounts || visibleCount > 0 || !q);
    }
  }

  let filterAnimationFrame;
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      if (filterAnimationFrame) cancelAnimationFrame(filterAnimationFrame);
      filterAnimationFrame = requestAnimationFrame(applyFilter);
    });
  }

  if (addAccountBtn) {
    addAccountBtn.addEventListener("click", openAddAccountTab);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      saveStoredAvatars({});
      renderAccounts(true);
    });
  }

  try {
    renderAccounts();
  } catch (err) {
    console.error("Error rendering Gmail accounts:", err);
    if (emptyState) emptyState.classList.remove("hidden");
  }
});