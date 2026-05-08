const MENU_ROOT = "miniweb-root";
const MENU_OPEN_POPUP = "miniweb-open-popup";
const MENU_PIN_PAGE = "miniweb-pin-page";
const MENU_ACTION_MODE_ROOT = "miniweb-action-mode-root";
const MENU_ACTION_MODE_POPUP = "miniweb-action-mode-popup";
const STORAGE_KEY = "pinnedLinks";
const OVERLAY_ENABLED_KEY = "overlayEnabled";
const EMBED_RULE_HOSTS_KEY = "embedRuleHosts";
const LAUNCHER_URL = chrome.runtime.getURL("launcher/launcher.html");
const ACTION_DEFAULT_TARGET_FALLBACK = "https://www.google.com/";
const SITE_FIX_CONFIG_KEY = "siteFixRulesConfigV1";
const AUTO_HIDE_SITES_KEY = "autoHideSitesV1";
const ACTION_SHORTCUT_CACHE_KEY = "executeActionShortcutCacheV1";
const TOGGLE_SHORTCUT_COMMAND = "miniweb-toggle";
const NO_MAIN_FRAME_REWRITE_KEY = "noMainFrameRewriteHostsV1";
const LAST_PIP_PLACEMENT_KEY = "lastPipPlacementV1";
const SESSION_POPUP_WINDOW_IDS_KEY = "miniwebPopupWindowIds";
const SYNC_PREF_KEY = "syncEnabledV1";
const DEFAULT_NO_MAIN_FRAME_REWRITE_HOSTS = ["qq.xx.com"];
const MODE_POPUP = "popup";
const ENABLE_VERBOSE_LOGS = false;

let _syncEnabled = true;
void chrome.storage.local.get(SYNC_PREF_KEY).then((r) => {
  if (SYNC_PREF_KEY in r) { _syncEnabled = r[SYNC_PREF_KEY] !== false; }
}).catch(() => {});

function swLog(...args) {
  if (ENABLE_VERBOSE_LOGS) {
    console.log(...args);
  }
}

function swWarn(...args) {
  if (ENABLE_VERBOSE_LOGS) {
    console.warn(...args);
  }
}

function dataStorage() {
  return _syncEnabled ? chrome.storage.sync : chrome.storage.local;
}

const DEFAULT_SITE_FIX_RULES = [
  {
    id: "zashboard",
    enabled: true,
    matchType: "hrefRegex",
    pattern: "zashboard",
    selectors: [".need-blur"],
    useForEachRoot: false,
    useObserver: false,
    disableContextMenuPip: false,
    cookieSyncEnabled: true,
    doubleOpenCompensation: false,
    blockedRetryDelayMs: 260
  },
  {
    id: "home-assistant",
    enabled: true,
    matchType: "hostnameRegex",
    pattern: "(^|\\.)hass\\.example\\.com$",
    selectors: [".header", "app-header", "ha-top-app-bar-fixed", "hui-view-header", ".mdc-top-app-bar"],
    useForEachRoot: true,
    useObserver: true,
    disableContextMenuPip: false,
    cookieSyncEnabled: true,
    doubleOpenCompensation: false,
    blockedRetryDelayMs: 260
  },
  {
    id: "ariang",
    enabled: true,
    matchType: "hostnameRegex",
    pattern: "(^|\\.)ariang\\.example\\.com$",
    selectors: [".main-header"],
    useForEachRoot: false,
    useObserver: false,
    disableContextMenuPip: false,
    cookieSyncEnabled: true,
    doubleOpenCompensation: false,
    blockedRetryDelayMs: 260
  },
  {
    id: "deepseek",
    enabled: true,
    matchType: "hostnameRegex",
    pattern: "(^|\\.)chat\\.deepseek\\.com$",
    selectors: ["._2be88ba._1551317"],
    useForEachRoot: false,
    useObserver: false,
    disableContextMenuPip: false,
    cookieSyncEnabled: true,
    doubleOpenCompensation: false,
    blockedRetryDelayMs: 260
  },
  {
    id: "claude-new-body",
    enabled: true,
    matchType: "hrefRegex",
    pattern: "^https://claude\\.ai/new(?:/)?(?:[?#].*)?$",
    selectors: [
      "button[data-testid=\"pin-sidebar-toggle\"]",
      "button[aria-label=\"Use incognito\"]"
    ],
    useForEachRoot: false,
    useObserver: false,
    disableContextMenuPip: false,
    cookieSyncEnabled: true,
    doubleOpenCompensation: false,
    blockedRetryDelayMs: 260
  }
];
let actionDefaultTargetCache = ACTION_DEFAULT_TARGET_FALLBACK;
const popupOwnerByWindowId = new Map();
const popupTargetByWindowId = new Map();
const popupWindowIdByOwnerTabId = new Map();
const pipHiddenPopupWindowIdByTabId = new Map();
const pipHiddenPopupBoundsByTabId = new Map();
const suppressCollapseForOwnerTabIds = new Set();

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

void refreshActionCaches();

chrome.runtime.onInstalled.addListener(() => {
  void chrome.contextMenus.removeAll();
  void refreshActionCaches();
  void initDefaultSiteFixRules();
  void syncExecuteActionShortcutCache();
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.contextMenus.removeAll();
  void refreshActionCaches();
  void initDefaultSiteFixRules();
  void syncExecuteActionShortcutCache();
});

chrome.windows.onRemoved.addListener((windowId) => {
  for (const [tabId, hiddenWindowId] of pipHiddenPopupWindowIdByTabId.entries()) {
    if (hiddenWindowId === windowId) {
      pipHiddenPopupWindowIdByTabId.delete(tabId);
      pipHiddenPopupBoundsByTabId.delete(tabId);
    }
  }

  const ownerTabId = popupOwnerByWindowId.get(windowId);
  if (typeof ownerTabId !== "number") {
    return;
  }
  popupWindowIdByOwnerTabId.delete(ownerTabId);
  popupOwnerByWindowId.delete(windowId);
  popupTargetByWindowId.delete(windowId);
  void persistPopupWindowIds();

  if (suppressCollapseForOwnerTabIds.has(ownerTabId)) {
    suppressCollapseForOwnerTabIds.delete(ownerTabId);
    return;
  }

  void chrome.tabs.sendMessage(ownerTabId, { type: "miniweb-side-dot-collapse" }).catch(() => {
    // Source tab may be closed or not injectable.
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info) {
    return;
  }

  try {
    if (info.menuItemId === MENU_OPEN_POPUP) {
      await openPopupLauncher(tab, "MENU_OPEN_POPUP");
      return;
    }

    if (info.menuItemId === MENU_PIN_PAGE) {
      const effectiveUrl = String(tab?.url || info.pageUrl || "");
      const effectiveTitle = String(tab?.title || effectiveUrl || "");
      const result = await pinCurrentPage({
        id: tab?.id,
        url: effectiveUrl,
        title: effectiveTitle
      });
      if (typeof tab?.id === "number") {
        if (result?.ok) {
          await showPageToast(tab.id, t("popupStatusPinned", undefined, "已加入当前页"), false);
        } else {
          await showPageToast(tab.id, String(result?.reason || t("optionsManualAddFailed", undefined, "加入失败")), true);
        }
      }
      if (tab) {
        await clearActionHint(tab);
      }
      return;
    }

  } catch (error) {
    console.error("MiniWeb menu action failed", error);
  }
});

chrome.action.onClicked.addListener((tab) => {
  void (async () => {
    const toggled = await toggleMiniwebBarByShortcut();
    if (toggled) {
      return;
    }
    openFromAction(tab, "ACTION_CLICK");
  })();
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== TOGGLE_SHORTCUT_COMMAND) {
    return;
  }

  void (async () => {
    let tab = null;
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tab = tabs[0] || null;
    } catch {
      tab = null;
    }

    const hasFocusedPopup = await hasFocusedPopupWindowForShortcut();
    if (hasFocusedPopup) {
      await toggleMiniwebBarByShortcut();
      return;
    }

    // If popup exists but is not focused, only bring it to front.
    const hasPopup = await hasAnyPopupWindowForShortcut();
    if (hasPopup) {
      await focusAnyPopupWindowForShortcut();
      return;
    }

    openFromAction(tab, "COMMAND_SHORTCUT");
  })();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" && area !== "sync") {
    return;
  }

  if (area === "local" && SYNC_PREF_KEY in changes) {
    _syncEnabled = changes[SYNC_PREF_KEY].newValue !== false;
  }

  if (changes[STORAGE_KEY]) {
    const links = Array.isArray(changes[STORAGE_KEY].newValue) ? changes[STORAGE_KEY].newValue : [];
    actionDefaultTargetCache = getFirstPinableUrl(links) || ACTION_DEFAULT_TARGET_FALLBACK;
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "miniweb-side-dot-allowed") {
    const tab = _sender?.tab;
    if (typeof tab?.windowId !== "number") {
      sendResponse({ ok: true, allowed: false, mode: "none" });
      return false;
    }

    void chrome.windows.get(tab.windowId)
      .then((win) => {
        const isPopupWindow = String(win?.type || "normal") === "popup";
        sendResponse({ ok: true, allowed: isPopupWindow, mode: isPopupWindow ? "popup-overlay" : "none" });
      })
      .catch(() => {
        sendResponse({ ok: true, allowed: false, mode: "none" });
      });
    return true;
  }

  if (message?.type === "miniweb-get-links") {
    void dataStorage().get(STORAGE_KEY)
      .then((result) => {
        const links = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
        sendResponse(links);
      })
      .catch(() => sendResponse([]));
    return true;
  }

  if (message?.type === "miniweb-get-execute-action-shortcut") {
    void syncExecuteActionShortcutCache()
      .then((shortcut) => sendResponse({ ok: true, shortcut }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error), shortcut: "" }));
    return true;
  }

  if (message?.type === "miniweb-open-action-popup") {
    void chrome.action.openPopup()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === "miniweb-show-toast") {
    const senderTab = _sender?.tab;
    const tabId = typeof senderTab?.id === "number" ? senderTab.id : null;
    if (tabId == null) {
      sendResponse({ ok: false, error: "sender tab unavailable" });
      return false;
    }

    const text = String(message?.message || "").trim();
    const isError = message?.isError === true;
    if (!text) {
      sendResponse({ ok: false, error: "message required" });
      return false;
    }

    void showPageToast(tabId, text, isError)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === "miniweb-get-current-popup-placement") {
    const senderTab = _sender?.tab;
    const windowId = typeof senderTab?.windowId === "number" ? senderTab.windowId : null;
    if (windowId == null) {
      sendResponse({ ok: false, error: "sender window unavailable" });
      return false;
    }

    void chrome.windows.get(windowId)
      .then((win) => {
        sendResponse({
          ok: true,
          placement: {
            left: Number(win?.left || 0),
            top: Number(win?.top || 0),
            width: Number(win?.width || 0),
            height: Number(win?.height || 0)
          }
        });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: String(error?.message || error) });
      });
    return true;
  }

  if (message?.type === "miniweb-pip-opened-from-popup") {
    const senderTab = _sender?.tab;
    const popupWindowId = typeof senderTab?.windowId === "number" ? senderTab.windowId : null;
    if (popupWindowId == null || typeof senderTab?.id !== "number") {
      sendResponse({ ok: false, error: "sender tab unavailable" });
      return false;
    }

    const reportedLeft = Number(message?.debugPlacement?.left);
    const reportedTop = Number(message?.debugPlacement?.top);
    const reportedWidth = Number(message?.debugPlacement?.width);
    const reportedHeight = Number(message?.debugPlacement?.height);
    const pipPlacementValid = (
      Number.isFinite(reportedLeft)
      && Number.isFinite(reportedTop)
      && Number.isFinite(reportedWidth)
      && Number.isFinite(reportedHeight)
    );

    // popup's window.screenX/Y as reported by content script
    const popupScreenX = Number(message?.popupScreenPos?.x);
    const popupScreenY = Number(message?.popupScreenPos?.y);

    void chrome.windows.get(popupWindowId)
      .then(async (win) => {
        if (String(win?.type || "") !== "popup") {
          sendResponse({ ok: false, error: "sender is not popup window" });
          return;
        }

        const popupChromeLeft = Number(win.left || 0);
        const popupChromeTop = Number(win.top || 0);
        const calibLeft = (Number.isFinite(popupScreenX)) ? (popupChromeLeft - popupScreenX) : 0;
        const calibTop = (Number.isFinite(popupScreenY)) ? (popupChromeTop - popupScreenY) : 0;

        if (pipPlacementValid) {
          const normalizedPlacement = {
            left: Math.max(0, Math.round(reportedLeft + calibLeft)),
            top: Math.max(0, Math.round(reportedTop + calibTop)),
            width: Math.max(1, Math.round(reportedWidth)),
            height: Math.max(1, Math.round(reportedHeight)),
            updatedAt: Date.now()
          };
          swLog("[MiniWeb][SW][PiP] reported placement", {
            ...normalizedPlacement,
            calibLeft,
            calibTop,
            popupWindowId,
            senderTabId: senderTab.id
          });
          void chrome.storage.local.set({ [LAST_PIP_PLACEMENT_KEY]: normalizedPlacement }).catch(() => {});
        }

        pipHiddenPopupBoundsByTabId.set(senderTab.id, {
          left: popupChromeLeft,
          top: popupChromeTop,
          width: Number(win.width || 0),
          height: Number(win.height || 0)
        });

        // Hide popup by stacking it exactly behind the PiP window.
        // PiP is always-on-top, so it fully covers the popup — no visible strip.
        // If we have calibrated PiP coordinates, move+resize popup to match the PiP rect.
        // Fallback (no placement data): shrink to minimum size at (0,0).
        // Two-call pattern required: state and geometry cannot be combined in one update.
        await chrome.windows.update(popupWindowId, { state: "normal" });
        if (pipPlacementValid) {
          await chrome.windows.update(popupWindowId, {
            left: Math.max(0, Math.round(reportedLeft + calibLeft)),
            top: Math.max(0, Math.round(reportedTop + calibTop)),
            width: Math.max(1, Math.round(reportedWidth)),
            height: Math.max(1, Math.round(reportedHeight)),
            focused: false
          });
        } else {
          await chrome.windows.update(popupWindowId, {
            width: 1,
            height: 1,
            left: 0,
            top: 0,
            focused: false
          });
        }
        pipHiddenPopupWindowIdByTabId.set(senderTab.id, popupWindowId);
        sendResponse({ ok: true, windowId: popupWindowId });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: String(error?.message || error) });
      });
    return true;
  }

  if (message?.type === "miniweb-pip-window-closed") {
    const senderTab = _sender?.tab;
    const senderTabId = typeof senderTab?.id === "number" ? senderTab.id : null;
    const popupWindowId = senderTabId == null ? null : pipHiddenPopupWindowIdByTabId.get(senderTabId);
    const popupBounds = senderTabId == null ? null : pipHiddenPopupBoundsByTabId.get(senderTabId);

    if (popupWindowId == null) {
      sendResponse({ ok: true, restored: false });
      return false;
    }

    pipHiddenPopupWindowIdByTabId.delete(senderTabId);
    pipHiddenPopupBoundsByTabId.delete(senderTabId);

    // Restore must also be two calls: state change and position change
    // cannot be combined reliably.
    const restorePromise = popupBounds
      ? chrome.windows.update(popupWindowId, { state: "normal" }).then(() =>
          chrome.windows.update(popupWindowId, {
            left: Math.round(Number(popupBounds.left || 0)),
            top: Math.round(Number(popupBounds.top || 0)),
            width: Math.max(1, Math.round(Number(popupBounds.width || 0))),
            height: Math.max(1, Math.round(Number(popupBounds.height || 0))),
            focused: true
          })
        )
      : chrome.windows.update(popupWindowId, { state: "normal", focused: true });

    void restorePromise
      .then(() => sendResponse({ ok: true, restored: true, windowId: popupWindowId }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error), windowId: popupWindowId }));
    return true;
  }

  if (message?.type === "miniweb-get-active-tab") {
    void chrome.tabs.query({ active: true, lastFocusedWindow: true })
      .then((tabs) => {
        const tab = tabs[0] || null;
        sendResponse({
          ok: true,
          id: typeof tab?.id === "number" ? tab.id : null,
          url: String(tab?.url || ""),
          title: String(tab?.title || tab?.url || "")
        });
      })
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error), id: null, url: "", title: "" }));
    return true;
  }

  if (message?.type === "miniweb-overlay-get-owner-tab") {
    const senderTab = _sender?.tab;
    const popupWindowId = typeof senderTab?.windowId === "number" ? senderTab.windowId : null;
    const ownerTabId = typeof popupWindowId === "number" ? popupOwnerByWindowId.get(popupWindowId) : null;

    if (typeof ownerTabId !== "number") {
      sendResponse({ ok: false, error: "owner tab unavailable", id: null, url: "", title: "" });
      return false;
    }

    void chrome.tabs.get(ownerTabId)
      .then((tab) => {
        sendResponse({
          ok: true,
          id: ownerTabId,
          url: String(tab?.url || ""),
          title: String(tab?.title || tab?.url || "")
        });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: String(error?.message || error), id: ownerTabId, url: "", title: "" });
      });
    return true;
  }

  if (message?.type === "miniweb-pin-active-tab") {
    void chrome.tabs.query({ active: true, lastFocusedWindow: true })
      .then(async (tabs) => {
        const tab = tabs[0] || null;
        const url = String(tab?.url || "");
        if (!isPinableUrl(url)) {
          throw new Error("active tab url not pinable");
        }
        const record = {
          id: buildLinkId(url),
          title: String(tab?.title || url).trim().slice(0, 180),
          url,
          faviconUrl: buildFaviconUrl(url),
          createdAt: Date.now()
        };
        const links = await upsertPinnedLink(record);
        actionDefaultTargetCache = getFirstPinableUrl(links) || ACTION_DEFAULT_TARGET_FALLBACK;
        sendResponse({ ok: true, links });
      })
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error), links: [] }));
    return true;
  }

  if (message?.type === "miniweb-delete-active-tab") {
    void chrome.tabs.query({ active: true, lastFocusedWindow: true })
      .then(async (tabs) => {
        const tab = tabs[0] || null;
        const url = String(tab?.url || "");
        if (!url) {
          throw new Error("active tab url unavailable");
        }
        const links = await deletePinnedLinkByUrl(url);
        actionDefaultTargetCache = getFirstPinableUrl(links) || ACTION_DEFAULT_TARGET_FALLBACK;
        sendResponse({ ok: true, links });
      })
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error), links: [] }));
    return true;
  }

  if (message?.type === "miniweb-action-open-popup-target") {
    const rawUrl = String(message?.url || "");
    const keepActionPopupVisible = message?.keepActionPopupVisible === true;
    if (!isPinableUrl(rawUrl)) {
      sendResponse({ ok: false, error: "url not pinable" });
      return false;
    }

    void Promise.resolve()
      .then(async () => {
        const senderTab = _sender?.tab || null;
        let sourceTab = senderTab;

        // If click comes from the popup itself, use owner tab as placement anchor.
        if (typeof senderTab?.windowId === "number") {
          const ownerTabId = popupOwnerByWindowId.get(senderTab.windowId);
          if (typeof ownerTabId === "number") {
            sourceTab = await chrome.tabs.get(ownerTabId).catch(() => senderTab);
          }
        }

        if (!sourceTab) {
          const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          sourceTab = tabs[0] || null;
        }

        const focusPopup = !keepActionPopupVisible;

        await openPopupLauncherWithTarget(
          sourceTab,
          "ACTION_POPUP_PICK",
          rawUrl,
          { focusPopup, preservePlacement: true }
        );

        const shouldDoubleOpen = await shouldDoubleOpenTarget(rawUrl);
        if (!shouldDoubleOpen) {
          return;
        }

        await delayMs(300);
        await openPopupLauncherWithTarget(
          sourceTab,
          "ACTION_POPUP_PICK_SECOND_PASS",
          rawUrl,
          { focusPopup, preservePlacement: true }
        );
      })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        sendResponse({ ok: false, error: String(error?.message || error) });
      });
    return true;
  }

  if (message?.type === "miniweb-action-open-browser-tab-target") {
    const rawUrl = String(message?.url || "");
    if (!isPinableUrl(rawUrl)) {
      sendResponse({ ok: false, error: "url not pinable" });
      return false;
    }

    void chrome.tabs.create({ url: rawUrl, active: true })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        sendResponse({ ok: false, error: String(error?.message || error) });
      });
    return true;
  }

  if (message?.type === "miniweb-overlay-pin-current") {
    const rawUrl = String(message?.url || "");
    const rawTitle = String(message?.title || "");

    if (!isPinableUrl(rawUrl)) {
      sendResponse({ ok: false, error: "url not pinable", links: [] });
      return false;
    }

    const record = {
      id: buildLinkId(rawUrl),
      title: (rawTitle || rawUrl).trim().slice(0, 180),
      url: rawUrl,
      faviconUrl: buildFaviconUrl(rawUrl),
      createdAt: Date.now()
    };

    void upsertPinnedLink(record)
      .then((links) => {
        actionDefaultTargetCache = getFirstPinableUrl(links) || ACTION_DEFAULT_TARGET_FALLBACK;
        sendResponse({ ok: true, links });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: String(error?.message || error), links: [] });
      });
    return true;
  }

  if (message?.type === "miniweb-overlay-delete-current") {
    const rawUrl = String(message?.url || "");
    if (!rawUrl) {
      sendResponse({ ok: false, error: "url required", links: [] });
      return false;
    }

    void deletePinnedLinkByUrl(rawUrl)
      .then((links) => {
        actionDefaultTargetCache = getFirstPinableUrl(links) || ACTION_DEFAULT_TARGET_FALLBACK;
        sendResponse({ ok: true, links });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: String(error?.message || error), links: [] });
      });
    return true;
  }

  if (message?.type === "miniweb-overlay-reorder-links") {
    const orderedUrls = Array.isArray(message?.orderedUrls)
      ? message.orderedUrls.map((item) => String(item || "")).filter(isPinableUrl)
      : [];

    if (orderedUrls.length === 0) {
      sendResponse({ ok: false, error: "orderedUrls required", links: [] });
      return false;
    }

    void reorderPinnedLinksByUrls(orderedUrls)
      .then((next) => {
        actionDefaultTargetCache = getFirstPinableUrl(next) || ACTION_DEFAULT_TARGET_FALLBACK;
        sendResponse({ ok: true, links: next });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: String(error?.message || error), links: [] });
      });
    return true;
  }

  if (message?.type === "miniweb-sync-site-cookies") {
    const rawUrl = String(message?.url || "");
    const rawTopLevelSite = String(message?.topLevelSite || "");
    void syncSiteCookiesForPip(rawUrl, rawTopLevelSite)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ ok: false, error: String(error?.message || error), synced: 0, failed: 0, skipped: false });
      });
    return true;
  }

  if (message?.type === "miniweb-should-double-open-url") {
    const rawUrl = String(message?.url || "");
    void resolveDoubleOpenCompensationRuleForUrl(rawUrl)
      .then((rule) => {
        sendResponse({
          ok: true,
          shouldDoubleOpen: Boolean(rule),
          matchedRuleId: rule?.id || "",
          matchedRuleName: rule?.name || ""
        });
      })
      .catch((error) => {
        sendResponse({ ok: false, shouldDoubleOpen: false, error: String(error?.message || error) });
      });
    return true;
  }

  if (message?.type === "miniweb-get-blocked-retry-policy") {
    const rawUrl = String(message?.url || "");
    void resolveBlockedRetryPolicyForUrl(rawUrl)
      .then((policy) => {
        sendResponse({
          ok: true,
          blockedRetryDelayMs: normalizeBlockedRetryDelayMs(policy?.blockedRetryDelayMs),
          matchedRuleId: String(policy?.matchedRuleId || ""),
          matchedRuleName: String(policy?.matchedRuleName || "")
        });
      })
      .catch((error) => {
        sendResponse({ ok: false, blockedRetryDelayMs: 260, error: String(error?.message || error) });
      });
    return true;
  }

  if (message?.type !== "miniweb-ensure-embed-rules") {
    return false;
  }

  void ensureEmbeddingRules(message.url)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.error("MiniWeb ensure embedding rules failed", error);
      sendResponse({ ok: false, error: String(error?.message || error) });
    });

  return true;
});

function getCookieSyncRuleTarget(rule, parsedUrl) {
  const target = String(rule?.matchType || "hostnameRegex") === "hrefRegex"
    ? String(parsedUrl?.href || "")
    : String(parsedUrl?.hostname || "");
  return target;
}

function normalizeBlockedRetryDelayMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 260;
  }
  return Math.max(0, Math.min(2000, Math.round(n)));
}

function compileCookieSyncRuleList(config) {
  const list = Array.isArray(config) ? config : DEFAULT_SITE_FIX_RULES;
  const runtimeRules = [];

  for (const item of list) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const enabled = item.enabled !== false;
    const cookieSyncEnabled = item.cookieSyncEnabled !== false;
    const matchType = String(item.matchType || "hostnameRegex");
    const pattern = String(item.pattern || "").trim();
    const allowMatchType = matchType === "hostnameRegex" || matchType === "hrefRegex";
    if (!enabled || !cookieSyncEnabled || !allowMatchType || !pattern) {
      continue;
    }

    let regex = null;
    try {
      regex = new RegExp(pattern, "i");
    } catch {
      regex = null;
    }
    if (!regex) {
      continue;
    }

    runtimeRules.push({
      id: String(item.id || ""),
      name: String(item._name || item.id || ""),
      matchType,
      regex
    });
  }

  return runtimeRules;
}

function compileDoubleOpenCompensationRuleList(config) {
  const list = Array.isArray(config) ? config : DEFAULT_SITE_FIX_RULES;
  const runtimeRules = [];

  for (const item of list) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const enabled = item.enabled !== false;
    const doubleOpenCompensation = item.doubleOpenCompensation === true;
    const matchType = String(item.matchType || "hostnameRegex");
    const pattern = String(item.pattern || "").trim();
    const allowMatchType = matchType === "hostnameRegex" || matchType === "hrefRegex";
    if (!enabled || !doubleOpenCompensation || !allowMatchType || !pattern) {
      continue;
    }

    let regex = null;
    try {
      regex = new RegExp(pattern, "i");
    } catch {
      regex = null;
    }
    if (!regex) {
      continue;
    }

    runtimeRules.push({
      id: String(item.id || ""),
      name: String(item._name || item.id || ""),
      matchType,
      regex
    });
  }

  return runtimeRules;
}

function compileBlockedRetryDelayRuleList(config) {
  const list = Array.isArray(config) ? config : DEFAULT_SITE_FIX_RULES;
  const runtimeRules = [];

  for (const item of list) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const enabled = item.enabled !== false;
    const matchType = String(item.matchType || "hostnameRegex");
    const pattern = String(item.pattern || "").trim();
    const allowMatchType = matchType === "hostnameRegex" || matchType === "hrefRegex";
    if (!enabled || !allowMatchType || !pattern) {
      continue;
    }

    let regex = null;
    try {
      regex = new RegExp(pattern, "i");
    } catch {
      regex = null;
    }
    if (!regex) {
      continue;
    }

    runtimeRules.push({
      id: String(item.id || ""),
      name: String(item._name || item.id || ""),
      matchType,
      regex,
      blockedRetryDelayMs: normalizeBlockedRetryDelayMs(item.blockedRetryDelayMs)
    });
  }

  return runtimeRules;
}

async function resolveCookieSyncRuleForUrl(url) {
  const parsed = new URL(url);
  const current = await chrome.storage.local.get(SITE_FIX_CONFIG_KEY);
  const runtimeRules = compileCookieSyncRuleList(current?.[SITE_FIX_CONFIG_KEY]);
  for (const rule of runtimeRules) {
    const target = getCookieSyncRuleTarget(rule, parsed);
    if (rule.regex.test(target)) {
      return rule;
    }
  }
  return null;
}

async function resolveDoubleOpenCompensationRuleForUrl(url) {
  if (!isPinableUrl(url)) {
    return null;
  }
  const parsed = new URL(url);
  const current = await chrome.storage.local.get(SITE_FIX_CONFIG_KEY);
  const runtimeRules = compileDoubleOpenCompensationRuleList(current?.[SITE_FIX_CONFIG_KEY]);
  for (const rule of runtimeRules) {
    const target = getCookieSyncRuleTarget(rule, parsed);
    if (rule.regex.test(target)) {
      return rule;
    }
  }
  return null;
}

async function resolveBlockedRetryPolicyForUrl(url) {
  if (!isPinableUrl(url)) {
    return {
      blockedRetryDelayMs: 260,
      matchedRuleId: "",
      matchedRuleName: ""
    };
  }

  const parsed = new URL(url);
  const current = await chrome.storage.local.get(SITE_FIX_CONFIG_KEY);
  const runtimeRules = compileBlockedRetryDelayRuleList(current?.[SITE_FIX_CONFIG_KEY]);
  for (const rule of runtimeRules) {
    const target = getCookieSyncRuleTarget(rule, parsed);
    if (rule.regex.test(target)) {
      return {
        blockedRetryDelayMs: normalizeBlockedRetryDelayMs(rule.blockedRetryDelayMs),
        matchedRuleId: rule.id || "",
        matchedRuleName: rule.name || ""
      };
    }
  }

  return {
    blockedRetryDelayMs: 260,
    matchedRuleId: "",
    matchedRuleName: ""
  };
}

function normalizeCookieSameSite(cookie) {
  const raw = String(cookie?.sameSite || "").toLowerCase();
  if (raw === "strict") {
    return "strict";
  }
  if (raw === "lax") {
    return "lax";
  }
  if (raw === "no_restriction" || raw === "none") {
    return "no_restriction";
  }
  return "lax";
}

function toCookieSetDetails(cookie, topLevelSite, options = {}) {
  const host = String(cookie?.domain || "").replace(/^\./, "");
  const path = String(cookie?.path || "/");
  const scheme = cookie?.secure === false ? "http" : "https";
  if (!host) {
    return null;
  }

  const forceNoRestriction = options.forceNoRestriction === true;
  const omitPartitionKey = options.omitPartitionKey === true;
  const sameSite = forceNoRestriction ? "no_restriction" : normalizeCookieSameSite(cookie);

  const details = {
    url: `${scheme}://${host}${path}`,
    name: String(cookie.name || ""),
    value: String(cookie.value || ""),
    path,
    secure: cookie?.secure !== false,
    httpOnly: cookie?.httpOnly === true,
    sameSite
  };

  if (!omitPartitionKey) {
    details.partitionKey = {
      topLevelSite,
      hasCrossSiteAncestor: true
    };
  }

  if (!cookie?.hostOnly && cookie?.domain) {
    details.domain = String(cookie.domain);
  }

  if (typeof cookie?.expirationDate === "number" && Number.isFinite(cookie.expirationDate)) {
    details.expirationDate = cookie.expirationDate;
  }

  if (cookie?.session === true) {
    delete details.expirationDate;
  }

  return details;
}

async function syncSiteCookiesForPip(url, topLevelSiteCandidate = "") {
  if (!isPinableUrl(url)) {
    return { ok: true, skipped: true, synced: 0, failed: 0, reason: "url not pinable" };
  }

  const parsed = new URL(url);
  const hostname = String(parsed.hostname || "").toLowerCase();
  const matchedRule = await resolveCookieSyncRuleForUrl(url);
  if (!matchedRule) {
    return { ok: true, skipped: true, synced: 0, failed: 0, reason: "rule not matched or cookie sync disabled" };
  }

  if (!chrome.cookies || typeof chrome.cookies.getAll !== "function" || typeof chrome.cookies.set !== "function") {
    return { ok: false, skipped: false, synced: 0, failed: 0, error: "cookies permission unavailable" };
  }

  const normalizeTopLevelSite = (value) => {
    try {
      const u = new URL(String(value || ""));
      if (u.protocol !== "http:" && u.protocol !== "https:" && u.protocol !== "chrome-extension:") {
        return "";
      }
      return `${u.protocol}//${u.hostname}`;
    } catch {
      return "";
    }
  };

  const topLevelSite = normalizeTopLevelSite(topLevelSiteCandidate) || `chrome-extension://${chrome.runtime.id}`;
  const sourceCookies = await chrome.cookies.getAll({ url: parsed.origin });
  const filtered = sourceCookies.filter((item) => Boolean(item?.name));

  let synced = 0;
  let failed = 0;
  const sampleErrors = [];

  const trySetCookieWithFallback = async (cookie) => {
    const attempts = [
      {
        label: "partition-original-sameSite",
        details: toCookieSetDetails(cookie, topLevelSite, { forceNoRestriction: false, omitPartitionKey: false })
      },
      {
        label: "partition-no_restriction",
        details: toCookieSetDetails(cookie, topLevelSite, { forceNoRestriction: true, omitPartitionKey: false })
      },
      {
        label: "non-partition-original-sameSite",
        details: toCookieSetDetails(cookie, topLevelSite, { forceNoRestriction: false, omitPartitionKey: true })
      }
    ];

    const attemptErrors = [];
    for (const attempt of attempts) {
      if (!attempt.details || !attempt.details.name) {
        continue;
      }
      try {
        await chrome.cookies.set(attempt.details);
        return { ok: true, mode: attempt.label, errors: attemptErrors };
      } catch (error) {
        attemptErrors.push(`${attempt.label}:${String(error?.message || error)}`);
      }
    }

    return { ok: false, mode: "", errors: attemptErrors };
  };

  for (const cookie of filtered) {
    if (!cookie || !cookie.name) {
      continue;
    }

    const result = await trySetCookieWithFallback(cookie);
    if (result.ok) {
      synced += 1;
    } else {
      failed += 1;
      if (sampleErrors.length < 3) {
        sampleErrors.push(`${cookie.name}:${result.errors.join(" || ")}`);
      }
    }
  }

  swLog(
    "[MiniWeb][SW][CookieSync]",
    `host=${hostname} rule=${matchedRule.id || matchedRule.name || "unknown"} source=${String(filtered.length)} synced=${String(synced)} failed=${String(failed)} topLevelSite=${topLevelSite}`,
    sampleErrors.length ? sampleErrors : ""
  );

  return {
    ok: true,
    skipped: false,
    synced,
    failed,
    total: filtered.length,
    targetHost: hostname,
    matchedRuleId: matchedRule.id || "",
    matchedRuleName: matchedRule.name || "",
    usedTopLevelSite: topLevelSite,
    sampleErrors
  };
}

async function createMenus() {
  await chrome.contextMenus.removeAll();

  await chrome.contextMenus.create({
    id: MENU_PIN_PAGE,
    title: t("menuPinPageTitle", undefined, "当前页加入 MiniWeb"),
    contexts: ["page"]
  });
}

async function openPopupLauncher(tab, source) {
  const targetUrl = resolveLauncherTarget(tab?.url || "");
  await openPopupLauncherWithTarget(tab, source, targetUrl, { focusPopup: true });
}

async function openPopupLauncherWithTarget(tab, source, targetUrl, options = {}) {
  // Popup mode: navigate directly to target URL (real web context).
  // DNR rules cannot modify headers for iframes inside chrome-extension:// pages,
  // so we open the target directly and inject a floating launcher overlay via content script.
  const safeTarget = /^https?:\/\//.test(targetUrl) ? targetUrl : "about:blank";
  const shouldFocusPopup = options?.focusPopup !== false;
  const preservePlacement = options?.preservePlacement === true;
  const popupWidth = 435;
  const popupHeight = 900;
  const placement = await resolvePopupPlacement(tab?.windowId, popupWidth, popupHeight);

  const reused = await reuseExistingPopupLauncher(tab, safeTarget, popupWidth, popupHeight, placement, shouldFocusPopup, preservePlacement);
  if (reused) {
    await clearActionHint(tab);
    swLog("[MiniWeb][SW] launch requested detail", `source=${String(source)} mode=popup-reuse tabId=${String(tab?.id)} target=${String(safeTarget)}`);
    return;
  }

  const win = await chrome.windows.create({
    url: safeTarget,
    type: "popup",
    width: popupWidth,
    height: popupHeight,
    left: placement?.left,
    top: placement?.top,
    focused: shouldFocusPopup
  });

  // chrome.windows.create placement is a hint; the browser may return the requested value in
  // win.left/top rather than the actual placed position. Always force-move after create.
  if (typeof win.id === "number" && placement?.left != null && placement?.top != null) {
    await chrome.windows.update(win.id, {
      left: Math.round(placement.left),
      top: Math.round(placement.top)
    }).catch(() => {});
  }

  let newTabId = win.tabs?.[0]?.id ?? null;
  if (newTabId == null && typeof win.id === "number") {
    const tabs = await chrome.tabs.query({ windowId: win.id });
    newTabId = tabs[0]?.id ?? null;
  }

  if (typeof win.id === "number" && typeof tab?.id === "number") {
    popupOwnerByWindowId.set(win.id, tab.id);
    popupTargetByWindowId.set(win.id, safeTarget);
    popupWindowIdByOwnerTabId.set(tab.id, win.id);
    void persistPopupWindowIds();
  }

  await clearActionHint(tab);

  swLog("[MiniWeb][SW] launch requested detail", `source=${String(source)} mode=popup tabId=${String(tab?.id)} target=${String(safeTarget)} overlayTabId=${String(newTabId)}`);
}

async function persistPopupWindowIds() {
  const ids = [...popupOwnerByWindowId.keys()].filter((id) => typeof id === "number");
  try {
    if (ids.length > 0) {
      await chrome.storage.session.set({ [SESSION_POPUP_WINDOW_IDS_KEY]: ids });
    } else {
      await chrome.storage.session.remove(SESSION_POPUP_WINDOW_IDS_KEY);
    }
  } catch {
    // storage.session not available in this context; ignore.
  }
}

async function discoverMiniwebPopupWindowIds() {
  const found = [];
  try {
    // Fast path: check session storage for persisted window IDs (survives SW restarts).
    const sessionResult = await chrome.storage.session.get(SESSION_POPUP_WINDOW_IDS_KEY).catch(() => ({}));
    const sessionIds = Array.isArray(sessionResult?.[SESSION_POPUP_WINDOW_IDS_KEY])
      ? sessionResult[SESSION_POPUP_WINDOW_IDS_KEY].filter((id) => typeof id === "number")
      : [];

    if (sessionIds.length > 0) {
      for (const winId of sessionIds) {
        try {
          await chrome.windows.get(winId);
          found.push(winId);
        } catch {
          // Window no longer exists; skip.
        }
      }
      if (found.length > 0) {
        // Prune stale entries from session.
        if (found.length !== sessionIds.length) {
          void chrome.storage.session.set({ [SESSION_POPUP_WINDOW_IDS_KEY]: found }).catch(() => {});
        }
        return [...new Set(found)];
      }
      // All session IDs are stale; clear and fall through to message discovery.
      void chrome.storage.session.remove(SESSION_POPUP_WINDOW_IDS_KEY).catch(() => {});
    }

    // Slow path: probe all popup windows via content script health-check message.
    const popupWindows = await chrome.windows.getAll({ populate: true, windowTypes: ["popup"] });
    for (const win of popupWindows) {
      const windowId = typeof win?.id === "number" ? win.id : null;
      if (windowId == null) {
        continue;
      }

      const tabs = Array.isArray(win.tabs) ? win.tabs : [];
      for (const tab of tabs) {
        if (typeof tab?.id !== "number") {
          continue;
        }
        try {
          const probe = await chrome.tabs.sendMessage(tab.id, { type: "miniweb-side-dot-health-check" });
          if (probe?.ok === true && String(probe?.mode || "") === "popup-overlay") {
            found.push(windowId);
            break;
          }
        } catch {
          // Ignore tabs without MiniWeb overlay receiver.
        }
      }
    }
  } catch {
    return [];
  }
  return [...new Set(found)];
}

async function reuseExistingPopupLauncher(tab, targetUrl, popupWidth, popupHeight, placement, shouldFocusPopup = true, preservePlacement = false) {
  const trackedWindowIds = [...popupOwnerByWindowId.keys()].filter((id) => typeof id === "number");
  const discoveredWindowIds = await discoverMiniwebPopupWindowIds();
  const candidateWindowIds = [...new Set([...trackedWindowIds, ...discoveredWindowIds])];
  if (candidateWindowIds.length === 0) {
    return false;
  }

  const primaryWindowId = candidateWindowIds[0];
  const staleWindowIds = candidateWindowIds.slice(1);

  for (const staleId of staleWindowIds) {
    const staleOwnerTabId = popupOwnerByWindowId.get(staleId);
    if (typeof staleOwnerTabId === "number") {
      suppressCollapseForOwnerTabIds.add(staleOwnerTabId);
    }
    await chrome.windows.remove(staleId).catch(() => {});
  }

  try {
    const primaryWindow = await chrome.windows.get(primaryWindowId, { populate: true });
    const existingOwnerTabId = popupOwnerByWindowId.get(primaryWindowId);
    if (typeof existingOwnerTabId === "number") {
      popupWindowIdByOwnerTabId.delete(existingOwnerTabId);
    }

    const tabId = primaryWindow.tabs?.[0]?.id;
    if (typeof tabId === "number") {
      await chrome.tabs.update(tabId, { url: targetUrl });
    }

    const updateInfo = {
      state: "normal",
      focused: shouldFocusPopup,
      width: popupWidth,
      height: popupHeight
    };
    if (!preservePlacement) {
      updateInfo.left = placement?.left;
      updateInfo.top = placement?.top;
    }
    await chrome.windows.update(primaryWindowId, updateInfo);

    // Force-move if the update didn't land exactly on target.
    if (!preservePlacement && placement?.left != null && placement?.top != null) {
      const updated = await chrome.windows.get(primaryWindowId).catch(() => null);
      if (updated && (updated.left !== placement.left || updated.top !== placement.top)) {
        await chrome.windows.update(primaryWindowId, {
          left: Math.round(placement.left),
          top: Math.round(placement.top)
        }).catch(() => {});
      }
    }

    if (typeof tab?.id === "number") {
      popupOwnerByWindowId.set(primaryWindowId, tab.id);
      popupWindowIdByOwnerTabId.set(tab.id, primaryWindowId);
    }
    popupTargetByWindowId.set(primaryWindowId, targetUrl);
    void persistPopupWindowIds();
    return true;
  } catch {
    popupOwnerByWindowId.delete(primaryWindowId);
    popupTargetByWindowId.delete(primaryWindowId);
    void persistPopupWindowIds();
    return false;
  }
}

async function resolvePopupPlacement(baseWindowId, popupWidth, popupHeight) {
  if (typeof baseWindowId !== "number") {
    return null;
  }

  const savedPipPlacement = await getSavedPipPlacement();
  if (savedPipPlacement) {
    return {
      left: savedPipPlacement.left,
      top: savedPipPlacement.top
    };
  }

  try {
    const win = await chrome.windows.get(baseWindowId);
    const left = Number(win.left || 0);
    const top = Number(win.top || 0);
    const width = Number(win.width || 1200);
    const height = Number(win.height || 900);

    const gap = 140;
    const computedLeft = Math.max(0, left + width - popupWidth - gap);
    const computedTop = Math.max(0, top + Math.round((height - popupHeight) / 2));

    return {
      left: computedLeft,
      top: computedTop
    };
  } catch {
    return null;
  }
}

async function getSavedPipPlacement() {
  try {
    const result = await chrome.storage.local.get(LAST_PIP_PLACEMENT_KEY);
    const placement = result?.[LAST_PIP_PLACEMENT_KEY] || null;
    const left = Number(placement?.left);
    const top = Number(placement?.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      return null;
    }
    return {
      left: Math.max(0, Math.round(left)),
      top: Math.max(0, Math.round(top))
    };
  } catch {
    return null;
  }
}

async function clearActionHint(tab) {
  if (typeof tab?.id === "number") {
    await chrome.action.setBadgeText({ text: "", tabId: tab.id });
    await chrome.action.setTitle({ title: t("actionTitle", undefined, "MiniWeb"), tabId: tab.id });
    return;
  }

  await chrome.action.setBadgeText({ text: "" });
  await chrome.action.setTitle({ title: t("actionTitle", undefined, "MiniWeb") });
}

function openFromAction(tab, source) {
  void (async () => {
    const targetUrl = await resolveActionClickTarget(tab);
    await openPopupLauncherWithTarget(tab, source, targetUrl, { focusPopup: true });
  })();
}

async function resolveActionClickTarget(tab) {
  if (isPinableUrl(actionDefaultTargetCache)) {
    return actionDefaultTargetCache;
  }

  try {
    actionDefaultTargetCache = await getActionDefaultTargetUrl();
  } catch {
    // ignore and continue to next fallback
  }

  if (isPinableUrl(actionDefaultTargetCache)) {
    return actionDefaultTargetCache;
  }

  const tabUrl = String(tab?.url || "");
  if (isPinableUrl(tabUrl)) {
    return tabUrl;
  }

  return resolveLauncherTarget(tabUrl);
}

async function getActionDefaultTargetUrl() {
  const current = await dataStorage().get(STORAGE_KEY);
  const links = Array.isArray(current[STORAGE_KEY]) ? current[STORAGE_KEY] : [];
  return getFirstPinableUrl(links) || ACTION_DEFAULT_TARGET_FALLBACK;
}

function getFirstPinableUrl(links) {
  const first = links.find((item) => item && typeof item.url === "string" && isPinableUrl(item.url));
  return first?.url || "";
}

async function refreshActionCaches() {
  try {
    actionDefaultTargetCache = await getActionDefaultTargetUrl();
    await createMenus();
  } catch (error) {
    swWarn("[MiniWeb][SW] refreshActionCaches failed", error);
  }
}

async function initDefaultSiteFixRules() {
  try {
    const existing = await dataStorage().get([SITE_FIX_CONFIG_KEY, AUTO_HIDE_SITES_KEY, NO_MAIN_FRAME_REWRITE_KEY]);

    // Init noMainFrameRewriteHostsV1 with default only on first run
    if (!Array.isArray(existing[NO_MAIN_FRAME_REWRITE_KEY])) {
      await dataStorage().set({ [NO_MAIN_FRAME_REWRITE_KEY]: DEFAULT_NO_MAIN_FRAME_REWRITE_HOSTS });
    }
    const legacyPatterns = Array.isArray(existing?.[AUTO_HIDE_SITES_KEY])
      ? existing[AUTO_HIDE_SITES_KEY].map((item) => String(item || "").trim()).filter(Boolean)
      : [];

    const baseList = Array.isArray(existing?.[SITE_FIX_CONFIG_KEY])
      ? existing[SITE_FIX_CONFIG_KEY].map((item) => ({
        ...item,
        forceFloating: item?.forceFloating === true,
        disableContextMenuPip: item?.disableContextMenuPip === true,
        cookieSyncEnabled: item?.cookieSyncEnabled !== false,
        doubleOpenCompensation: item?.doubleOpenCompensation === true,
        blockedRetryDelayMs: normalizeBlockedRetryDelayMs(item?.blockedRetryDelayMs)
      }))
      : [...DEFAULT_SITE_FIX_RULES];

    const list = [...baseList];
    const existingIds = new Set(list.map((item) => String(item?.id || "")).filter(Boolean));
    for (const rule of DEFAULT_SITE_FIX_RULES) {
      const ruleId = String(rule?.id || "");
      if (!ruleId || existingIds.has(ruleId)) {
        continue;
      }
      list.push({ ...rule, forceFloating: false });
      existingIds.add(ruleId);
    }

    if (legacyPatterns.length > 0) {
      for (const pattern of legacyPatterns) {
        const hit = list.find((item) =>
          item && typeof item === "object" && item.enabled !== false &&
          String(item.matchType || "hostnameRegex") === "hostnameRegex" &&
          String(item.pattern || "").trim() === pattern
        );

        if (hit) {
          hit.forceFloating = true;
          continue;
        }

        let nextId = `floating-${pattern.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "site"}`;
        while (existingIds.has(nextId)) {
          nextId = `${nextId}-x`;
        }
        existingIds.add(nextId);
        list.push({
          id: nextId,
          enabled: true,
          matchType: "hostnameRegex",
          pattern,
          selectors: [],
          useForEachRoot: false,
          useObserver: false,
          forceFloating: true,
          cookieSyncEnabled: true,
          doubleOpenCompensation: false,
          blockedRetryDelayMs: 260
        });
      }
    }

    await dataStorage().set({ [SITE_FIX_CONFIG_KEY]: list });
    if (legacyPatterns.length > 0) {
      await chrome.storage.local.remove(AUTO_HIDE_SITES_KEY);
    }
  } catch (error) {
    swWarn("[MiniWeb][SW] initDefaultSiteFixRules failed", error);
  }
}

function normalizeShortcutText(shortcut) {
  return String(shortcut || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/control/g, "ctrl")
    .replace(/option/g, "alt")
    .replace(/command/g, "cmd");
}

async function syncExecuteActionShortcutCache() {
  try {
    const commands = typeof chrome.commands?.getAll === "function"
      ? await chrome.commands.getAll()
      : [];
    const executeActionCommand = commands.find((item) => item?.name === TOGGLE_SHORTCUT_COMMAND)
      || commands.find((item) => item?.name === "_execute_action");
    const shortcut = normalizeShortcutText(executeActionCommand?.shortcut || "");
    await chrome.storage.local.set({ [ACTION_SHORTCUT_CACHE_KEY]: shortcut });
    return shortcut;
  } catch (error) {
    swWarn("[MiniWeb][SW] syncExecuteActionShortcutCache failed", error);
    await chrome.storage.local.set({ [ACTION_SHORTCUT_CACHE_KEY]: "" });
    return "";
  }
}

async function toggleMiniwebBarByShortcut(options = {}) {
  const shouldFocusPopup = options?.focusPopup === true;
  const popupWindows = await chrome.windows.getAll({ populate: true, windowTypes: ["popup"] });

  for (const win of popupWindows) {
    const tabs = Array.isArray(win.tabs) ? win.tabs : [];
    for (const tab of tabs) {
      if (typeof tab?.id !== "number") {
        continue;
      }

      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: "miniweb-side-dot-toggle" });
        if (response?.ok === true) {
          if (shouldFocusPopup && typeof win?.id === "number") {
            await chrome.windows.update(win.id, { state: "normal", focused: true }).catch(() => {});
          }
          return true;
        }
      } catch {
        // Ignore tabs without receiver.
      }
    }
  }

  return false;
}

async function hasAnyPopupWindowForShortcut() {
  try {
    const trackedWindowIds = [...popupOwnerByWindowId.keys()].filter((id) => typeof id === "number");
    const discoveredWindowIds = await discoverMiniwebPopupWindowIds();
    const candidateWindowIds = [...new Set([...trackedWindowIds, ...discoveredWindowIds])];
    if (candidateWindowIds.length === 0) {
      return false;
    }

    for (const winId of candidateWindowIds) {
      try {
        await chrome.windows.get(winId);
        return true;
      } catch {
        popupOwnerByWindowId.delete(winId);
        popupTargetByWindowId.delete(winId);
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function hasFocusedPopupWindowForShortcut() {
  try {
    const trackedWindowIds = [...popupOwnerByWindowId.keys()].filter((id) => typeof id === "number");
    const discoveredWindowIds = await discoverMiniwebPopupWindowIds();
    const candidateWindowIds = [...new Set([...trackedWindowIds, ...discoveredWindowIds])];
    if (candidateWindowIds.length === 0) {
      return false;
    }

    for (const winId of candidateWindowIds) {
      try {
        const win = await chrome.windows.get(winId);
        if (win?.focused === true) {
          return true;
        }
      } catch {
        popupOwnerByWindowId.delete(winId);
        popupTargetByWindowId.delete(winId);
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function focusAnyPopupWindowForShortcut() {
  try {
    const trackedWindowIds = [...popupOwnerByWindowId.keys()].filter((id) => typeof id === "number");
    const discoveredWindowIds = await discoverMiniwebPopupWindowIds();
    const candidateWindowIds = [...new Set([...trackedWindowIds, ...discoveredWindowIds])];

    for (const winId of candidateWindowIds) {
      try {
        await chrome.windows.update(winId, { state: "normal", focused: true });
        return true;
      } catch {
        popupOwnerByWindowId.delete(winId);
        popupTargetByWindowId.delete(winId);
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function openOrFocusLauncher(query = "") {
  const params = new URLSearchParams(query);
  const targetUrl = params.get("target") || "";
  await ensureEmbeddingRules(targetUrl);

  const launcherBase = LAUNCHER_URL;
  const launcherTarget = query ? `${launcherBase}?${query}` : launcherBase;
  const tabs = await chrome.tabs.query({});

  const existing = tabs.find((item) => {
    if (!item.url) {
      return false;
    }
    return item.url.startsWith(launcherBase);
  });

  if (existing && existing.id) {
    await chrome.tabs.update(existing.id, { active: true, url: launcherTarget });
    if (typeof existing.windowId === "number") {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url: launcherTarget, active: true });
}

function buildLauncherQuery(url) {
  const params = new URLSearchParams({
    autopip: "1",
    target: resolveLauncherTarget(url)
  });
  return params.toString();
}

async function ensureEmbeddingRules(url) {
  if (!isPinableUrl(url)) {
    return;
  }

  const hostname = new URL(url).hostname;
  const nextHosts = new Set([hostname]);
  const rootDomain = getRootDomainForRules(hostname);
  if (rootDomain) {
    nextHosts.add(rootDomain);
  }

  const current = await dataStorage().get(EMBED_RULE_HOSTS_KEY);
  const hosts = Array.isArray(current[EMBED_RULE_HOSTS_KEY])
    ? current[EMBED_RULE_HOSTS_KEY].filter((item) => typeof item === "string" && item)
    : [];

  let changed = false;
  for (const item of nextHosts) {
    if (!hosts.includes(item)) {
      hosts.push(item);
      changed = true;
    }
  }

  if (changed) {
    await dataStorage().set({ [EMBED_RULE_HOSTS_KEY]: hosts });
  }

  await rebuildEmbeddingRules(hosts);
}

async function rebuildEmbeddingRules(hosts) {
  const stored = await dataStorage().get(NO_MAIN_FRAME_REWRITE_KEY);
  const noMainFrameHosts = Array.isArray(stored[NO_MAIN_FRAME_REWRITE_KEY])
    ? stored[NO_MAIN_FRAME_REWRITE_KEY].filter((h) => typeof h === "string" && h)
    : DEFAULT_NO_MAIN_FRAME_REWRITE_HOSTS;

  const dynamicRules = hosts.flatMap((host, index) => buildRulesForHost(host, index, noMainFrameHosts));
  const addRules = [...dynamicRules];
  const existing = await chrome.declarativeNetRequest.getSessionRules();
  const removeRuleIds = existing
    .filter((rule) => typeof rule.id === "number" && rule.id >= 1000)
    .map((rule) => rule.id);

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds,
    addRules
  });
}

function buildRulesForHost(host, index, noMainFrameHosts = DEFAULT_NO_MAIN_FRAME_REWRITE_HOSTS) {
  const baseId = 1000 + index * 10;
  const urlFilter = `||${host}^`;
  const hostOrigin = `https://${host}/`;
  const isNoMainFrame = noMainFrameHosts.includes(host);
  const shouldSpoofRequestHeaders = !isNoMainFrame;
  const resourceTypes = ["sub_frame"];

  const rules = [
    {
      id: baseId,
      priority: 10,
      action: {
        type: "modifyHeaders",
        responseHeaders: [
          { header: "x-frame-options", operation: "remove" },
          { header: "content-security-policy", operation: "remove" },
          { header: "content-security-policy-report-only", operation: "remove" },
          { header: "x-content-security-policy", operation: "remove" },
          { header: "x-webkit-csp", operation: "remove" },
          { header: "cross-origin-opener-policy", operation: "remove" },
          { header: "cross-origin-embedder-policy", operation: "remove" },
          { header: "cross-origin-resource-policy", operation: "remove" },
          { header: "origin-agent-cluster", operation: "remove" },
          { header: "frame-ancestors", operation: "set", value: "*" }
        ]
      },
      condition: {
        urlFilter,
        resourceTypes
      }
    }
  ];

  if (shouldSpoofRequestHeaders) {
    rules.push({
      id: baseId + 1,
      priority: 10,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "sec-fetch-site", operation: "set", value: "same-origin" },
          { header: "sec-fetch-mode", operation: "set", value: "navigate" },
          { header: "sec-fetch-dest", operation: "set", value: "iframe" },
          { header: "origin", operation: "set", value: hostOrigin },
          { header: "referer", operation: "set", value: hostOrigin },
          { header: "if-none-match", operation: "remove" }
        ]
      },
      condition: {
        urlFilter,
        resourceTypes: ["sub_frame"]
      }
    });
  }

  return rules;
}

function getRootDomainForRules(hostname) {
  if (!hostname) {
    return "";
  }

  // Keep IP addresses and localhost as exact host only.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname === "localhost") {
    return "";
  }

  const parts = hostname.split(".").filter(Boolean);
  if (parts.length < 2) {
    return "";
  }

  // Simple and pragmatic root extraction for common domains.
  return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
}

function resolveLauncherTarget(url) {
  if (isPinableUrl(url)) {
    return url;
  }

  return "https://www.google.com/";
}

async function shouldDoubleOpenTarget(url) {
  const rule = await resolveDoubleOpenCompensationRuleForUrl(url);
  return Boolean(rule);
}

function delayMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Number(ms) || 0));
}

async function enableOverlayMode(tab) {
  await dataStorage().set({ [OVERLAY_ENABLED_KEY]: true });

  if (!tab?.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "miniweb-overlay-enable" });
  } catch (error) {
    // Content script may not be ready yet on some pages.
    swLog("MiniWeb overlay message skipped", error);
  }
}

async function pinCurrentPage(tab) {
  const url = tab?.url || "";
  if (!isPinableUrl(url)) {
    // For non-pinable URLs, just trigger PiP directly
    if (tab && tab.id) {
      await chrome.tabs.sendMessage(tab.id, {
        type: "miniweb-open-pip",
        targetUrl: url
      }).catch((error) => {
        swWarn("MiniWeb send message to tab failed", error);
      });
    }
    return { ok: false, reason: t("pipCurrentUrlNotPinable", undefined, "当前页面 URL 不可固定") };
  }

  const title = (tab?.title || url).trim().slice(0, 180);
  const id = buildLinkId(url);
  const faviconUrl = buildFaviconUrl(url);
  const createdAt = Date.now();

  const record = {
    id,
    title,
    url,
    faviconUrl,
    createdAt
  };

  const current = await dataStorage().get(STORAGE_KEY);
  const links = Array.isArray(current[STORAGE_KEY]) ? current[STORAGE_KEY] : [];

  const withoutSame = links.filter((item) => item && item.url !== record.url);
  withoutSame.push(record);

  await dataStorage().set({ [STORAGE_KEY]: withoutSame });
  actionDefaultTargetCache = getFirstPinableUrl(withoutSame) || ACTION_DEFAULT_TARGET_FALLBACK;
  return { ok: true };
}

async function showPageToast(tabId, message, isError) {
  let injected = false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (text, errorStyle) => {
        const id = "miniweb-inline-toast";
        const existing = document.getElementById(id);
        if (existing) {
          existing.remove();
        }

        const toast = document.createElement("div");
        toast.id = id;
        toast.textContent = String(text || "");
        const panel = document.getElementById("miniweb-popup-bottom-panel");
        const panelBottom = Number(panel?.getBoundingClientRect?.().bottom || 0);
        const toastTop = panelBottom > 0 ? Math.round(panelBottom + 8) : 16;
        toast.style.cssText = [
          "position:fixed",
          "left:50%",
          `top:${String(toastTop)}px`,
          "transform:translateX(-50%)",
          "z-index:2147483647",
          "min-height:28px",
          "padding:0 12px",
          "border-radius:8px",
          "display:flex",
          "align-items:center",
          "font-size:12px",
          "font-family:\"Microsoft YaHei\",\"PingFang SC\",\"Noto Sans CJK SC\",\"Source Han Sans SC\",sans-serif",
          "font-weight:700",
          "line-height:1",
          "color:" + (errorStyle ? "#fee2e2" : "#d1fae5"),
          "background:" + (errorStyle ? "rgba(127,29,29,0.92)" : "rgba(6,78,59,0.92)"),
          "border:1px solid " + (errorStyle ? "rgba(252,165,165,0.5)" : "rgba(110,231,183,0.45)"),
          "box-shadow:0 8px 20px rgba(0,0,0,0.3)",
          "pointer-events:none"
        ].join(";");

        document.documentElement.appendChild(toast);
        setTimeout(() => {
          toast.remove();
        }, 1300);
      },
      args: [message, Boolean(isError)]
    });
    injected = true;
  } catch {
    // Scripting unavailable on this page (e.g. chrome:// urls).
  }

  // If script injection is not available (e.g. chrome://), skip toast fallback.
}

async function upsertPinnedLink(record) {
  const current = await dataStorage().get(STORAGE_KEY);
  const links = Array.isArray(current[STORAGE_KEY]) ? current[STORAGE_KEY] : [];
  const withoutSame = links.filter((item) => item && item.url !== record.url);
  withoutSame.push(record);
  await dataStorage().set({ [STORAGE_KEY]: withoutSame });
  return withoutSame;
}

async function deletePinnedLinkByUrl(url) {
  const current = await dataStorage().get(STORAGE_KEY);
  const links = Array.isArray(current[STORAGE_KEY]) ? current[STORAGE_KEY] : [];
  const next = links.filter((item) => item && item.url !== url);
  await dataStorage().set({ [STORAGE_KEY]: next });
  return next;
}

async function reorderPinnedLinksByUrls(orderedUrls) {
  const current = await dataStorage().get(STORAGE_KEY);
  const links = Array.isArray(current[STORAGE_KEY]) ? current[STORAGE_KEY] : [];
  const linkByUrl = new Map();

  for (const item of links) {
    if (item && isPinableUrl(String(item.url || "")) && !linkByUrl.has(item.url)) {
      linkByUrl.set(item.url, item);
    }
  }

  const used = new Set();
  const next = [];

  for (const url of orderedUrls) {
    if (used.has(url)) {
      continue;
    }
    const hit = linkByUrl.get(url);
    if (!hit) {
      continue;
    }
    used.add(url);
    next.push(hit);
  }

  for (const item of links) {
    const url = String(item?.url || "");
    if (!url || used.has(url)) {
      continue;
    }
    used.add(url);
    next.push(item);
  }

  await dataStorage().set({ [STORAGE_KEY]: next });
  return next;
}

function isPinableUrl(url) {
  if (!url) {
    return false;
  }
  return url.startsWith("http://") || url.startsWith("https://");
}

function buildLinkId(url) {
  return `link_${simpleHash(url)}`;
}

function buildFaviconUrl(pageUrl) {
  const base = chrome.runtime.getURL("/_favicon/");
  const query = new URLSearchParams({
    pageUrl,
    size: "32"
  });
  return `${base}?${query.toString()}`;
}

function simpleHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return String(Math.abs(hash));
}
