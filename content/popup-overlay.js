/**
 * popup-overlay.js — MiniWeb Popup Mode Floating Launcher Bar
 *
 * Injected via chrome.scripting.executeScript into the popup-mode window tab.
 * Renders a fixed floating bar with pinned link icons. Clicking an icon navigates
 * window.location to that URL. Re-injected on each page load by service-worker.
 *
 * Security: All DOM is built via createElement / textContent / setAttribute.
 * No innerHTML with untrusted data. URLs are validated before navigation.
 */
(function () {
  "use strict";

  const OVERLAY_ID = "miniweb-popup-overlay";
  const OVERLAY_HANDLE_ID = "miniweb-popup-overlay-handle";
  const OVERLAY_HEIGHT = 44;
  const LAYOUT_PREF_KEY = "popupOverlayLayoutByOrigin";
  const HIDDEN_PREF_KEY = "popupOverlayHiddenByOrigin";
  const DEFAULT_ICON =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23e2e8f0'/%3E%3Cpath d='M18 22h28v20H18z' fill='%2394a3b8'/%3E%3Ccircle cx='26' cy='30' r='3' fill='%23e2e8f0'/%3E%3C/svg%3E";

  let linkList = [];
  let activeUrl = "";
  let layoutMode = "top";
  let isHidden = false;

  function t(key, substitutions, fallback = "") {
    try {
      const value = chrome.i18n?.getMessage(key, substitutions);
      if (value) {
        return value;
      }
    } catch {
      // ignore
    }
    return fallback || key;
  }

  // Idempotent — don't inject twice on the same page.
  if (document.getElementById(OVERLAY_ID)) {
    return;
  }

  activeUrl = safeCurrentUrl();

  // Request pinned links from service worker.
  chrome.runtime.sendMessage({ type: "miniweb-get-links" }, (links) => {
    if (chrome.runtime.lastError) {
      console.warn("[MiniWeb][Overlay] sendMessage failed", chrome.runtime.lastError.message);
      return;
    }
    linkList = normalizeLinks(Array.isArray(links) ? links : []);
    void loadOverlayPrefs().then(() => {
      buildOverlay();
    });
  });

  function buildOverlay() {
    // Re-check after async gap.
    if (document.getElementById(OVERLAY_ID)) return;

    // ── Bar container ──────────────────────────────────────────────────────────
    const bar = document.createElement("div");
    bar.id = OVERLAY_ID;
    bar.setAttribute("data-miniweb", "1");
    bar.style.cssText = [
      "position:fixed",
      "top:" + (layoutMode === "top" ? "0" : "auto"),
      "bottom:" + (layoutMode === "bottom" ? "0" : "auto"),
      "left:0",
      "right:0",
      "width:100%",
      "height:" + String(OVERLAY_HEIGHT) + "px",
      "background:rgba(20,20,24,0.93)",
      "backdrop-filter:blur(8px)",
      "-webkit-backdrop-filter:blur(8px)",
      "z-index:2147483646",
      "display:flex",
      "align-items:center",
      "padding:0 8px",
      "gap:4px",
      "box-shadow:0 2px 10px rgba(0,0,0,0.5)",
      "box-sizing:border-box",
      "overflow-x:hidden",
      "overflow-y:hidden",
    ].join(";");

    const iconWrap = document.createElement("div");
    iconWrap.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:6px",
      "overflow-x:auto",
      "overflow-y:hidden",
      "flex:1 1 auto",
      "min-width:0",
    ].join(";");

    const actionWrap = document.createElement("div");
    actionWrap.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:6px",
      "flex:0 0 auto",
      "margin-left:8px",
    ].join(";");

    const deleteBtn = buildActionButton(
      "delete",
      t("popupOverlayDeleteCurrent", undefined, "删除当前图标"),
      "M9 3h6a1 1 0 0 1 .95.68L16.62 6H20v2h-1l-1 11a2 2 0 0 1-2 1.82H8A2 2 0 0 1 6 19L5 8H4V6h3.38l.67-2.32A1 1 0 0 1 9 3zm1 6v9h2V9h-2zm4 0v9h2V9h-2z"
    );
    const hideBtn = buildActionButton(
      "hide",
      t("popupOverlayHideBar", undefined, "隐藏图标栏"),
      "M6 12a1 1 0 1 0 0 2h12a1 1 0 1 0 0-2H6z"
    );
    const layoutBtn = buildActionButton(
      "layout",
      layoutMode === "top"
        ? t("popupOverlaySwitchToBottom", undefined, "切换到底部")
        : t("popupOverlaySwitchToTop", undefined, "切换到顶部"),
      layoutMode === "top"
        ? "M12 18l-6-6h4V6h4v6h4z"
        : "M12 6l6 6h-4v6h-4v-6H6z"
    );

    deleteBtn.addEventListener("click", () => {
      void deleteCurrent();
    });
    hideBtn.addEventListener("click", () => {
      void setHidden(true);
    });
    layoutBtn.addEventListener("click", () => {
      void toggleLayout();
    });

    actionWrap.appendChild(layoutBtn);
    actionWrap.appendChild(deleteBtn);
    actionWrap.appendChild(hideBtn);

    const handle = document.createElement("button");
    handle.id = OVERLAY_HANDLE_ID;
    handle.setAttribute("type", "button");
    handle.title = t("popupOverlayShowBar", undefined, "显示图标栏");
    handle.setAttribute("aria-label", t("popupOverlayShowBar", undefined, "显示图标栏"));
    handle.style.cssText = [
      "position:fixed",
      "left:50%",
      "right:auto",
      "top:" + (layoutMode === "top" ? "8px" : "auto"),
      "bottom:" + (layoutMode === "bottom" ? "8px" : "auto"),
      "transform:translateX(-50%)",
      "width:14px",
      "height:14px",
      "border-radius:999px",
      "border:1px solid rgba(255,255,255,0.7)",
      "background:rgba(20,20,24,0.86)",
      "box-shadow:0 2px 8px rgba(0,0,0,0.45)",
      "cursor:pointer",
      "padding:0",
      "z-index:2147483647",
      "display:none",
    ].join(";");
    handle.addEventListener("click", () => {
      void setHidden(false);
    });

    // ── Icon buttons ───────────────────────────────────────────────────────────
    const currentOrigin = getCurrentOrigin();

    for (const link of linkList) {
      const safeUrl = sanitizeUrl(link.url);
      if (!safeUrl) continue;

      const btn = document.createElement("button");
      btn.title = sanitizeText(link.title || link.url);
      btn.setAttribute("type", "button");

      const isActive = safeUrl === activeUrl || (currentOrigin && new URL(safeUrl).origin === currentOrigin);
      btn.style.cssText = [
        "width:24px",
        "height:24px",
        "border:1px solid " + (isActive ? "rgba(255,255,255,0.45)" : "transparent"),
        "border-radius:7px",
        "cursor:pointer",
        "background:" + (isActive ? "rgba(255,255,255,0.22)" : "transparent"),
        "display:inline-flex",
        "align-items:center",
        "justify-content:center",
        "padding:0",
        "flex-shrink:0",
        "box-shadow:" + (isActive ? "inset 0 0 0 1px rgba(255,255,255,0.35)" : "none"),
        "transition:background 0.15s",
      ].join(";");

      const img = document.createElement("img");
      img.width = 16;
      img.height = 16;
      img.style.cssText = "display:block;border-radius:3px;pointer-events:none";
      const faviconCandidates = buildFaviconCandidates(link);
      let faviconIndex = 0;
      img.src = faviconCandidates[faviconIndex] || DEFAULT_ICON;
      img.alt = "";
      img.addEventListener("error", () => {
        faviconIndex += 1;
        img.src = faviconCandidates[faviconIndex] || DEFAULT_ICON;
      });
      btn.appendChild(img);

      btn.addEventListener("click", () => {
        activeUrl = safeUrl;
        window.location.href = safeUrl;
      });
      btn.addEventListener("mouseover", () => {
        if (!isActive) btn.style.background = "rgba(255,255,255,0.16)";
      });
      btn.addEventListener("mouseout", () => {
        if (!isActive) btn.style.background = "transparent";
      });
      btn.addEventListener("blur", () => {
        if (!isActive) btn.style.background = "transparent";
      });

      iconWrap.appendChild(btn);
    }

    bar.appendChild(iconWrap);
    bar.appendChild(actionWrap);

    const applyVisibility = () => {
      bar.style.display = isHidden ? "none" : "flex";
      handle.style.display = isHidden ? "block" : "none";
    };

    // ── Attach to DOM ──────────────────────────────────────────────────────────
    const attach = () => {
      if (document.getElementById(OVERLAY_ID)) return;
      const target = document.body || document.documentElement;
      if (target) {
        target.appendChild(bar);
        target.appendChild(handle);
        applyVisibility();
      }
    };

    if (document.body) {
      attach();
    } else {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getCurrentOrigin() {
    try {
      return new URL(window.location.href).origin;
    } catch {
      return null;
    }
  }

  function sanitizeUrl(raw) {
    try {
      const u = new URL(String(raw || ""));
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      return u.href;
    } catch {
      return null;
    }
  }

  function sanitizeText(raw) {
    return String(raw || "").slice(0, 120);
  }

  function safeCurrentUrl() {
    const url = sanitizeUrl(window.location.href);
    return url || "";
  }

  function normalizeLinks(raw) {
    return raw
      .filter((item) => item && typeof item.url === "string")
      .map((item) => ({
        id: String(item.id || hash(item.url)),
        title: String(item.title || item.url),
        url: String(item.url),
        faviconUrl: String(item.faviconUrl || ""),
      }));
  }

  function buildFaviconCandidates(link) {
    const candidates = [];

    try {
      const pageUrl = String(link?.url || "");
      if (/^https?:\/\//.test(pageUrl)) {
        const extFaviconBase = typeof chrome !== "undefined" && chrome.runtime
          ? chrome.runtime.getURL("/_favicon/")
          : "";

        if (extFaviconBase) {
          const extQuery = new URLSearchParams({
            pageUrl,
            size: "64"
          });
          candidates.push(`${extFaviconBase}?${extQuery.toString()}`);
        }

        const s2Query = new URLSearchParams({
          domain_url: pageUrl,
          sz: "64"
        });
        candidates.push(`https://www.google.com/s2/favicons?${s2Query.toString()}`);
      }
    } catch {
      // Ignore malformed URL.
    }

    if (link?.faviconUrl) {
      candidates.push(link.faviconUrl);
    }

    candidates.push(DEFAULT_ICON);
    return [...new Set(candidates)];
  }

  function hash(value) {
    let h = 0;
    for (let i = 0; i < value.length; i += 1) {
      h = (h << 5) - h + value.charCodeAt(i);
      h |= 0;
    }
    return `link_${Math.abs(h)}`;
  }

  function buildActionButton(kind, title, pathD) {
    const btn = document.createElement("button");
    btn.setAttribute("type", "button");
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.style.cssText = [
      "width:28px",
      "height:28px",
      "min-width:28px",
      "display:grid",
      "place-items:center",
      "line-height:0",
      "border-radius:9px",
      "padding:0",
      "cursor:pointer",
      "border:1px solid rgba(255,255,255,0.25)",
      "background:" + (kind === "delete" ? "rgba(180,20,20,0.16)" : "rgba(255,255,255,0.10)"),
      "color:" + (kind === "delete" ? "#fecaca" : "#ffffff"),
    ].join(";");

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.style.width = "16px";
    svg.style.height = "16px";
    svg.style.fill = "currentColor";
    svg.style.display = "block";
    svg.style.margin = "0 auto";

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    svg.appendChild(path);
    btn.appendChild(svg);
    return btn;
  }

  async function deleteCurrent() {
    const url = activeUrl || safeCurrentUrl();
    if (!url) return;
    chrome.runtime.sendMessage(
      {
        type: "miniweb-overlay-delete-current",
        url
      },
      (res) => {
        if (chrome.runtime.lastError || !res?.ok) {
          return;
        }
        linkList = normalizeLinks(Array.isArray(res.links) ? res.links : []);
        activeUrl = safeCurrentUrl();
        refreshOverlay();
      }
    );
  }

  function refreshOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      existing.remove();
    }
    const handle = document.getElementById(OVERLAY_HANDLE_ID);
    if (handle) {
      handle.remove();
    }
    buildOverlay();
  }

  async function loadOverlayPrefs() {
    try {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        layoutMode = "top";
        isHidden = false;
        return;
      }
      const result = await chrome.storage.local.get([LAYOUT_PREF_KEY, HIDDEN_PREF_KEY]);
      const layoutMap = result?.[LAYOUT_PREF_KEY] && typeof result[LAYOUT_PREF_KEY] === "object"
        ? result[LAYOUT_PREF_KEY]
        : {};
      const hiddenMap = result?.[HIDDEN_PREF_KEY] && typeof result[HIDDEN_PREF_KEY] === "object"
        ? result[HIDDEN_PREF_KEY]
        : {};
      const origin = getCurrentOrigin();
      const mode = origin ? String(layoutMap[origin] || "") : "";
      layoutMode = mode === "bottom" ? "bottom" : "top";
      isHidden = origin ? Boolean(hiddenMap[origin]) : false;
    } catch {
      layoutMode = "top";
      isHidden = false;
    }
  }

  async function saveLayoutMode() {
    try {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        return;
      }
      const origin = getCurrentOrigin();
      if (!origin) return;
      const result = await chrome.storage.local.get(LAYOUT_PREF_KEY);
      const map = result?.[LAYOUT_PREF_KEY] && typeof result[LAYOUT_PREF_KEY] === "object"
        ? result[LAYOUT_PREF_KEY]
        : {};
      map[origin] = layoutMode;
      await chrome.storage.local.set({ [LAYOUT_PREF_KEY]: map });
    } catch {
      // Ignore preference save failure.
    }
  }

  async function saveHiddenState() {
    try {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        return;
      }
      const origin = getCurrentOrigin();
      if (!origin) return;
      const result = await chrome.storage.local.get(HIDDEN_PREF_KEY);
      const map = result?.[HIDDEN_PREF_KEY] && typeof result[HIDDEN_PREF_KEY] === "object"
        ? result[HIDDEN_PREF_KEY]
        : {};
      map[origin] = Boolean(isHidden);
      await chrome.storage.local.set({ [HIDDEN_PREF_KEY]: map });
    } catch {
      // Ignore preference save failure.
    }
  }

  async function setHidden(hidden) {
    isHidden = Boolean(hidden);
    await saveHiddenState();
    refreshOverlay();
  }

  async function toggleLayout() {
    layoutMode = layoutMode === "top" ? "bottom" : "top";
    await saveLayoutMode();
    refreshOverlay();
  }
})();
