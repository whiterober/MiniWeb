(function () {
  "use strict";

  const DOCK_ID = "miniweb-popup-bottom-dock";
  const PANEL_ID = "miniweb-popup-bottom-panel";
  const LINKS_CACHE_KEY = "miniweb-popup-links-cache-v1";
  const DEFAULT_ICON =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23212a38'/%3E%3Cpath d='M18 22h28v20H18z' fill='%2398a7bd'/%3E%3Ccircle cx='26' cy='30' r='3' fill='%23dbe5f3'/%3E%3C/svg%3E";

  if (document.getElementById(DOCK_ID) || document.getElementById(PANEL_ID)) {
    return;
  }

  const SITE_FIX_STYLE_ID = "miniweb-site-fix";
  const SITE_FIX_CONFIG_KEY = "siteFixRulesConfigV1";
  const NO_MAIN_FRAME_REWRITE_KEY = "noMainFrameRewriteHostsV1";
  const DEFAULT_NO_MAIN_FRAME_REWRITE_HOSTS = ["qq.xx.com"];
  const OVERLAY_NAV_INTENT_KEY = "miniwebOverlayNavIntentV1";
  const ICON_SCROLLBAR_FIX_STYLE_ID = "miniweb-icon-scrollbar-fix";
  const LAYOUT_GUARD_STYLE_ID = "miniweb-layout-guard-fix";
  const PAGE_SCROLLBAR_HIDE_STYLE_ID = "miniweb-page-scrollbar-hide";
  const ICON_LOW_CONTRAST_THRESHOLD = 72;
  const DRAG_ARM_HOLD_MS = 120;
  const DRAG_ARM_MOVE_PX = 4;
  const SITE_FIX_OFFSET_FALLBACK_PX = 42;
  const LEFT_SCROLL_DEAD_ZONE_PX = 10;
  const RIGHT_SCROLL_DEAD_ZONE_PX = 10;
  const DELETE_CONFIRM_WINDOW_MS = 2000;
  const DELETE_HOLD_TO_DELETE_MS = 600;
  const DELETE_ICON_PATH_DEFAULT = "M6 11h12v2H6z";
  const DELETE_ICON_PATH_CONFIRM = "M7.41 6 12 10.59 16.59 6 18 7.41 13.41 12 18 16.59 16.59 18 12 13.41 7.41 18 6 16.59 10.59 12 6 7.41z";
  const ACTION_SHORTCUT_CACHE_KEY = "executeActionShortcutCacheV1";
  const PEEK_TAB_ID = "miniweb-peek-tab";
  const ENABLE_SIDE_DEBUG_LOG = false;

  function sideDebug(...args) {
    if (ENABLE_SIDE_DEBUG_LOG) {
      console.log(...args);
    }
  }
  const THEME_DARK = {
    panelBackground: "rgba(18,24,33,0.92)",
    panelBorder: "rgba(255,255,255,0.18)",
    actionDivider: "rgba(255,255,255,0.15)",
    triggerBorder: "rgba(255,255,255,0.35)",
    triggerBg: "rgba(255,255,255,0.12)",
    actionColor: "#ffffff",
    actionDanger: "#fecaca",
    sortActiveColor: "#93c5fd",
    sortActiveBg: "rgba(59,130,246,0.2)",
    scrollBtnBorder: "rgba(255,255,255,0.24)",
    scrollBtnBg: "rgba(16,24,40,0.62)",
    scrollBtnColor: "#ffffff",
    emptyBorder: "rgba(255,255,255,0.24)",
    emptyColor: "rgba(255,255,255,0.72)",
    selectedBorder: "rgba(110,210,255,0.75)",
    selectedBg: "rgba(40,120,170,0.28)",
    dragOverBorder: "rgba(147,197,253,0.9)"
  };
  const THEME_LIGHT = {
    panelBackground: "rgba(241,246,252,0.95)",
    panelBorder: "rgba(102,133,170,0.35)",
    actionDivider: "rgba(107,138,177,0.28)",
    triggerBorder: "rgba(78,110,150,0.45)",
    triggerBg: "rgba(120,150,190,0.2)",
    actionColor: "#1f3a5a",
    actionDanger: "#b63b3b",
    sortActiveColor: "#1b4f8f",
    sortActiveBg: "rgba(66,133,244,0.22)",
    scrollBtnBorder: "rgba(90,120,160,0.38)",
    scrollBtnBg: "rgba(220,232,246,0.94)",
    scrollBtnColor: "#1f3a5a",
    emptyBorder: "rgba(107,138,177,0.35)",
    emptyColor: "rgba(43,72,110,0.78)",
    selectedBorder: "rgba(46,123,204,0.78)",
    selectedBg: "rgba(89,152,220,0.24)",
    dragOverBorder: "rgba(59,130,246,0.9)"
  };
  // 站点定向修复默认规则
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
      cookieSyncEnabled: true
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
      cookieSyncEnabled: true
    },
    {
      id: "ariang",
      enabled: true,
      matchType: "hostnameRegex",
      pattern: "(^|\\.)ariang\\.example\\.com$",
      selectors: [".main-header", ".task-table-body"],
      useForEachRoot: false,
      useObserver: false,
      disableContextMenuPip: false,
      cookieSyncEnabled: true
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
      cookieSyncEnabled: true
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
      cookieSyncEnabled: true
    }
  ];
  const CLAUDE_NEW_BUTTON_SELECTORS = [
    "button[data-testid=\"pin-sidebar-toggle\"]",
    "button[aria-label=\"Use incognito\"]"
  ];
  let siteFixRules = buildRuntimeSiteFixRules(DEFAULT_SITE_FIX_RULES);
  let activeSiteFixRule = findActiveSiteFixRule(siteFixRules);

  let links = [];
  let expanded = true;
  let linksFingerprint = "";
  let scrollButtonsRafId = 0;
  let manualPagingLocked = false;
  let lockedScrollLeft = null;
  let siteFixObserver = null;
  let siteFixScanScheduled = false;
  let autoHideEnabled = false;
  let actionShortcutFallback = "";
  let dockAutoHidden = false;
  let savedScrollLeftOnHide = null;
  let restoreScrollInProgress = false;
  const iconDarknessCache = new Map();
  let systemThemeMediaQuery = null;
  let currentThemeName = getPreferredThemeName();
  let currentTheme = getThemePalette(currentThemeName);

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

  const dock = document.createElement("div");
  dock.id = DOCK_ID;
  dock.style.cssText = [
    activeSiteFixRule !== null ? "position:fixed" : "position:sticky",
    "left:0",
    "right:0",
    "top:0",
    "bottom:auto",
    "z-index:2147483646",
    "display:flex",
    "align-items:flex-start",
    "justify-content:center",
    "width:100%"
  ].join(";");

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.setAttribute("data-miniweb", "1");
  panel.style.cssText = [
    "width:100%",
    "box-sizing:border-box",
    "padding:6px 8px",
    "border-radius:0",
    "display:flex",
    "flex-direction:row",
    "align-items:center",
    "gap:6px",
    "overflow:hidden",
    "background:" + currentTheme.panelBackground,
    "backdrop-filter:blur(8px)",
    "-webkit-backdrop-filter:blur(8px)",
    "border-bottom:1px solid " + currentTheme.panelBorder,
    "box-shadow:0 -1px 0 " + currentTheme.panelBackground + ", 0 8px 24px rgba(0,0,0,0.42)",
    "z-index:2147483647"
  ].join(";");

  const actionWrap = document.createElement("div");
  actionWrap.setAttribute("data-miniweb-action-wrap", "1");
  actionWrap.style.cssText = [
    "display:flex",
    "flex-direction:row",
    "align-items:center",
    "white-space:nowrap",
    "gap:0",
    "padding-left:0",
    "padding-right:8px",
    "border-right:1px solid " + currentTheme.actionDivider,
    "flex:0 0 auto",
    "flex-shrink:0"
  ].join(";");

  const actionTrigger = document.createElement("button");
  actionTrigger.setAttribute("type", "button");
  actionTrigger.setAttribute("data-miniweb-trigger-btn", "1");
  actionTrigger.title = t("sideActionButton", undefined, "功能按钮");
  actionTrigger.setAttribute("aria-label", t("sideActionButton", undefined, "功能按钮"));
  actionTrigger.style.cssText = [
    "width:16px",
    "min-width:16px",
    "max-width:16px",
    "flex:0 0 16px",
    "height:16px",
    "border-radius:3px",
    "border:none",
    "background:transparent",
    "padding:0",
    "cursor:pointer",
    "overflow:hidden"
  ].join(";");

  const triggerImg = document.createElement("img");
  triggerImg.src = chrome.runtime.getURL("icons/icon32.png");
  triggerImg.alt = "MiniWeb";
  triggerImg.style.cssText = "width:100%;height:100%;object-fit:contain;display:block;pointer-events:none";
  actionTrigger.appendChild(triggerImg);

  const actionItems = document.createElement("div");
  actionItems.setAttribute("data-miniweb-action-items", "1");
  actionItems.style.cssText = [
    "display:flex",
    "flex-direction:row",
    "align-items:center",
    "justify-content:center",
    "white-space:nowrap",
    "position:absolute",
    "inset:0",
    "opacity:0",
    "pointer-events:none",
    "transition:opacity 120ms ease",
    "flex:0 0 auto"
  ].join(";");

  const delBtn = buildActionButton(t("sideDeleteSelected", undefined, "删除选中标签"), DELETE_ICON_PATH_DEFAULT, true);
  let deleteConfirmArmed = false;
  let deleteConfirmTimerId = 0;
  let deleteHoldTimerId = 0;
  let suppressDeleteClickUntil = 0;
  const clearDeleteHoldTimer = () => {
    if (deleteHoldTimerId) {
      window.clearTimeout(deleteHoldTimerId);
      deleteHoldTimerId = 0;
    }
  };
  const applyPendingDeleteTargetVisualState = () => {
    if (!iconWrap) {
      return;
    }
    const currentUrl = String(window.location.href || "");
    const targetBorder = currentThemeName === "light" ? "rgba(220,38,38,0.82)" : "rgba(252,165,165,0.9)";
    const targetBg = currentThemeName === "light" ? "rgba(220,38,38,0.16)" : "rgba(248,113,113,0.26)";
    const btns = iconWrap.querySelectorAll("[data-miniweb-link-btn='1']");
    for (const btn of btns) {
      const isSelected = isLinkSelected(btn._miniwebUrl || "", currentUrl);
      if (!isSelected) {
        continue;
      }
      if (deleteConfirmArmed) {
        btn.style.borderColor = targetBorder;
        btn.style.background = targetBg;
        btn.style.opacity = "0.5";
      } else {
        btn.style.borderColor = currentTheme.selectedBorder;
        btn.style.background = currentTheme.selectedBg;
        btn.style.opacity = "";
      }
    }
  };
  const applyDeleteConfirmVisualState = () => {
    const iconPathEl = delBtn._miniwebIconPathEl;
    if (iconPathEl) {
      iconPathEl.setAttribute("d", deleteConfirmArmed ? DELETE_ICON_PATH_CONFIRM : DELETE_ICON_PATH_DEFAULT);
    }
    delBtn.style.color = currentTheme.actionDanger;
    delBtn.style.background = deleteConfirmArmed
      ? (currentThemeName === "light" ? "rgba(220,38,38,0.14)" : "rgba(248,113,113,0.22)")
      : "transparent";
    delBtn.style.boxShadow = deleteConfirmArmed
      ? (currentThemeName === "light" ? "inset 0 0 0 1px rgba(185,28,28,0.26)" : "inset 0 0 0 1px rgba(252,165,165,0.38)")
      : "none";
    applyPendingDeleteTargetVisualState();
  };
  const resetDeleteConfirmState = () => {
    deleteConfirmArmed = false;
    if (deleteConfirmTimerId) {
      window.clearTimeout(deleteConfirmTimerId);
      deleteConfirmTimerId = 0;
    }
    clearDeleteHoldTimer();
    delBtn.title = t("sideDeleteSelected", undefined, "删除选中标签");
    delBtn.setAttribute("aria-label", t("sideDeleteSelected", undefined, "删除选中标签"));
    delBtn.style.transform = "";
    delBtn.style.opacity = "";
    applyDeleteConfirmVisualState();
  };
  const armDeleteConfirmState = () => {
    deleteConfirmArmed = true;
    if (deleteConfirmTimerId) {
      window.clearTimeout(deleteConfirmTimerId);
      deleteConfirmTimerId = 0;
    }
    clearDeleteHoldTimer();
    delBtn.title = t("sideDeleteHoldConfirm", undefined, "长按确认删除");
    delBtn.setAttribute("aria-label", t("sideDeleteHoldConfirm", undefined, "长按确认删除"));
    delBtn.style.transform = "scale(1.06)";
    delBtn.style.opacity = "0.95";
    applyDeleteConfirmVisualState();
    deleteConfirmTimerId = window.setTimeout(() => {
      deleteConfirmTimerId = 0;
      resetDeleteConfirmState();
    }, DELETE_CONFIRM_WINDOW_MS);
  };
  delBtn.addEventListener("click", () => {
    if (Date.now() < suppressDeleteClickUntil) {
      return;
    }
    if (!deleteConfirmArmed) {
      armDeleteConfirmState();
      return;
    }
  });
  delBtn.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !deleteConfirmArmed) {
      return;
    }
    clearDeleteHoldTimer();
    deleteHoldTimerId = window.setTimeout(() => {
      deleteHoldTimerId = 0;
      suppressDeleteClickUntil = Date.now() + 300;
      resetDeleteConfirmState();
      void deleteCurrentPage();
    }, DELETE_HOLD_TO_DELETE_MS);
  });
  delBtn.addEventListener("pointerup", clearDeleteHoldTimer);
  delBtn.addEventListener("pointerleave", clearDeleteHoldTimer);
  delBtn.addEventListener("pointercancel", clearDeleteHoldTimer);

  const setActionItemsVisible = (visible) => {
    actionItems.style.opacity = visible ? "1" : "0";
    actionItems.style.pointerEvents = visible ? "auto" : "none";
    actionTrigger.style.opacity = visible ? "0" : "1";
    actionTrigger.style.pointerEvents = visible ? "none" : "auto";
  };

  actionWrap.addEventListener("mouseenter", () => {
    const currentUrl = String(window.location.href || "");
    const hasSelected = links.some((l) => isLinkSelected(l.url, currentUrl));
    if (!hasSelected) {
      resetDeleteConfirmState();
      actionTrigger.style.cursor = "default";
      return;
    }
    actionTrigger.style.cursor = "pointer";
    setActionItemsVisible(true);
  });
  actionWrap.addEventListener("mouseleave", () => {
    resetDeleteConfirmState();
    actionTrigger.style.cursor = "pointer";
    setActionItemsVisible(false);
  });

  actionItems.appendChild(delBtn);
  const actionSlot = document.createElement("div");
  actionSlot.style.cssText = [
    "position:relative",
    "width:28px",
    "height:28px",
    "flex:0 0 28px"
  ].join(";");
  actionTrigger.style.position = "absolute";
  actionTrigger.style.left = "50%";
  actionTrigger.style.top = "50%";
  actionTrigger.style.transform = "translate(-50%, -50%)";
  actionTrigger.style.transition = "opacity 120ms ease";
  actionSlot.appendChild(actionTrigger);
  actionSlot.appendChild(actionItems);
  actionWrap.appendChild(actionSlot);
  panel.appendChild(actionWrap);

  const iconArea = document.createElement("div");
  iconArea.setAttribute("data-miniweb-icon-area", "1");
  iconArea.style.cssText = [
    "display:flex",
    "flex-direction:row",
    "align-items:center",
    "gap:4px",
    "height:42px",
    "min-height:42px",
    "flex:1",
    "min-width:0"
  ].join(";");

  const leftScrollBtn = buildScrollButton(t("sideScrollLeft", undefined, "向左滚动"), "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z");
  const rightScrollBtn = buildScrollButton(t("sideScrollRight", undefined, "向右滚动"), "M8.59 16.59 10 18l6-6-6-6-1.41 1.41L13.17 12z");

  const iconWrap = document.createElement("div");
  iconWrap.setAttribute("aria-label", t("sideIconListAria", undefined, "固定链接图标列表"));
  iconWrap.setAttribute("data-miniweb-icon-wrap", "1");
  iconWrap.style.cssText = [
    "display:flex",
    "position:relative",
    "flex-direction:row",
    "align-items:center",
    "gap:6px",
    "padding-right:4px",
    "box-sizing:border-box",
    "overflow-x:auto",
    "overflow-y:hidden",
    "height:42px",
    "min-height:42px",
    "flex:1",
    "min-width:0",
    "scroll-behavior:smooth",
    "scrollbar-width:none",
    "-ms-overflow-style:none"
  ].join(";");

  const dropIndicator = document.createElement("div");
  dropIndicator.style.cssText = [
    "position:absolute",
    "top:7px",
    "bottom:7px",
    "width:2px",
    "border-radius:999px",
    "background:" + currentTheme.dragOverBorder,
    "transform:translateX(-1px)",
    "opacity:0",
    "pointer-events:none",
    "z-index:4",
    "transition:opacity 80ms ease"
  ].join(";");
  iconWrap.appendChild(dropIndicator);

  // --- peekTab: 自动隐藏时露出的顶部半圆 Tab ---
  const peekTab = document.createElement("div");
  peekTab.id = PEEK_TAB_ID;
  peekTab.setAttribute("role", "button");
  peekTab.setAttribute("tabindex", "0");
  peekTab.setAttribute("aria-label", t("sideExpandBarAria", undefined, "展开 MiniWeb 图标栏"));
  peekTab.style.cssText = [
    "position:fixed",
    "top:0",
    "left:50%",
    "transform:translateX(-50%) translateY(calc(-100% - 12px))",
    "width:52px",
    "height:20px",
    "border-radius:0 0 26px 26px",
    "z-index:2147483647",
    "cursor:pointer",
    "display:flex",
    "align-items:flex-end",
    "justify-content:center",
    "padding-bottom:3px",
    "transition:transform 0.25s ease, opacity 0.16s ease",
    "opacity:0",
    "pointer-events:none",
    "user-select:none",
    "background:" + currentTheme.panelBackground,
    "color:" + currentTheme.actionColor,
    "box-shadow:none"
  ].join(";");
  const peekTabSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  peekTabSvg.setAttribute("width", "14");
  peekTabSvg.setAttribute("height", "8");
  peekTabSvg.setAttribute("viewBox", "0 0 14 8");
  peekTabSvg.setAttribute("fill", "none");
  peekTabSvg.style.cssText = "display:block;flex-shrink:0;pointer-events:none";
  const peekTabPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  peekTabPath.setAttribute("d", "M1 1L7 7L13 1");
  peekTabPath.setAttribute("stroke", "currentColor");
  peekTabPath.setAttribute("stroke-width", "2");
  peekTabPath.setAttribute("stroke-linecap", "round");
  peekTabPath.setAttribute("stroke-linejoin", "round");
  peekTabSvg.appendChild(peekTabPath);
  peekTab.appendChild(peekTabSvg);
  peekTab.addEventListener("click", () => {
    if (dockAutoHidden) showDockFromAutoHide();
  });
  peekTab.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && dockAutoHidden) {
      e.preventDefault();
      showDockFromAutoHide();
    }
  });

  let debugSeq = 0;
  function logOverlayDebug(event, extra = {}, wrapEl = iconWrap) {
    const maxScrollLeft = Math.max(0, (wrapEl?.scrollWidth || 0) - (wrapEl?.clientWidth || 0));
    const payload = {
      seq: ++debugSeq,
      t: Date.now(),
      event,
      href: String(window.location.href || ""),
      scrollLeft: Math.round(Number(wrapEl?.scrollLeft || 0)),
      maxScrollLeft: Math.round(maxScrollLeft),
      leftBtn: leftScrollBtn.style.display || "",
      rightBtn: rightScrollBtn.style.display || "",
      manualPagingLocked,
      lockedScrollLeft,
      ...extra
    };
    sideDebug("[MiniWebDBG]", payload);
  }

  panel.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  }, true);

  const updateScrollButtons = () => {
    const estimateBtnWidth = (btnEl) => {
      const measured = Number(btnEl?.offsetWidth || 0);
      return measured > 0 ? measured : 26;
    };

    const leftWidth = estimateBtnWidth(leftScrollBtn);
    const rightWidth = estimateBtnWidth(rightScrollBtn);
    const leftShownNow = leftScrollBtn.style.display !== "none";
    const rightShownNow = rightScrollBtn.style.display !== "none";
    const baseWrapWidth = Math.max(
      0,
      Number(iconWrap.clientWidth || 0)
        + (leftShownNow ? leftWidth : 0)
        + (rightShownNow ? rightWidth : 0)
    );
    const scrollWidth = Math.max(0, Number(iconWrap.scrollWidth || 0));
    const rawScrollLeft = Math.max(0, Number(iconWrap.scrollLeft || 0));
    const tolerancePx = 1;

    // 按“隐藏态是否仍需滚动”决定按钮显示，避免按钮自我维持显示。
    const wrapWidthIfBothHidden = Math.max(0, baseWrapWidth);
    const maxIfBothHidden = Math.max(0, scrollWidth - wrapWidthIfBothHidden);
    const scrollIfBothHidden = Math.max(0, Math.min(maxIfBothHidden, rawScrollLeft));
    const showLeft = scrollIfBothHidden > LEFT_SCROLL_DEAD_ZONE_PX + tolerancePx;

    const wrapWidthIfRightHidden = Math.max(0, baseWrapWidth - (showLeft ? leftWidth : 0));
    const maxIfRightHidden = Math.max(0, scrollWidth - wrapWidthIfRightHidden);
    const scrollIfRightHidden = Math.max(0, Math.min(maxIfRightHidden, rawScrollLeft));
    const rightRemainIfRightHidden = Math.max(0, maxIfRightHidden - scrollIfRightHidden);
    const showRight = rightRemainIfRightHidden > RIGHT_SCROLL_DEAD_ZONE_PX + tolerancePx;

    const finalWrapWidth = Math.max(0, baseWrapWidth - (showLeft ? leftWidth : 0) - (showRight ? rightWidth : 0));
    const finalMaxScrollLeft = Math.max(0, scrollWidth - finalWrapWidth);
    const finalScrollLeft = Math.max(0, Math.min(finalMaxScrollLeft, rawScrollLeft));
    const leftRemain = finalScrollLeft;
    const rightRemain = Math.max(0, finalMaxScrollLeft - finalScrollLeft);
    const firstFullyVisible = finalScrollLeft <= tolerancePx;
    const lastFullyVisible = finalScrollLeft + finalWrapWidth >= (scrollWidth - tolerancePx);

    if (finalMaxScrollLeft <= 1) {
      leftScrollBtn.style.display = "none";
      rightScrollBtn.style.display = "none";
      return;
    }

    leftScrollBtn.style.display = showLeft ? "grid" : "none";
    rightScrollBtn.style.display = showRight ? "grid" : "none";
    logOverlayDebug("updateScrollButtons", {
      leftRemain: Math.round(leftRemain),
      rightRemain: Math.round(rightRemain),
      firstFullyVisible,
      lastFullyVisible,
      stableMaxScrollLeft: Math.round(finalMaxScrollLeft)
    });
  };

  const scheduleScrollButtonsUpdate = () => {
    if (scrollButtonsRafId) {
      return;
    }

    // 双层 rAF：第一帧触发浏览器 reflow，第二帧读取正确的 scrollWidth/clientWidth
    scrollButtonsRafId = requestAnimationFrame(() => {
      scrollButtonsRafId = requestAnimationFrame(() => {
        scrollButtonsRafId = 0;
        updateScrollButtons();
      });
    });
  };

  function setScrollLeftImmediate(wrapEl, nextLeft) {
    if (!wrapEl) {
      return 0;
    }
    // scroll-behavior:smooth!important in guard style beats inline style assignment
    // Must use setProperty with 'important' priority to win the cascade
    wrapEl.style.setProperty('scroll-behavior', 'auto', 'important');
    wrapEl.scrollLeft = nextLeft;
    const applied = Number(wrapEl.scrollLeft || 0);
    wrapEl.style.removeProperty('scroll-behavior');
    return applied;
  }

  function restoreScrollLeftAfterExpand(targetLeft, attemptsLeft = 6) {
    if (!expanded) {
      restoreScrollInProgress = false;
      return;
    }

    const applied = setScrollLeftImmediate(iconWrap, targetLeft);
    const reached = Math.abs(Number(applied || 0) - Number(targetLeft || 0)) <= 1;
    if (reached || attemptsLeft <= 1) {
      restoreScrollInProgress = false;
      updateScrollButtons();
      return;
    }

    requestAnimationFrame(() => {
      restoreScrollLeftAfterExpand(targetLeft, attemptsLeft - 1);
    });
  }

  function ensureButtonFullyVisible(btnEl, iconWrapEl) {
    if (!btnEl || !iconWrapEl) {
      return;
    }

    const maxScrollLeft = Math.max(0, iconWrapEl.scrollWidth - iconWrapEl.clientWidth);
    const leftRemain = Math.max(0, Number(iconWrapEl.scrollLeft || 0));
    const rightRemain = Math.max(0, maxScrollLeft - leftRemain);
    const sideGapPx = 4;
    const leftOcclusionPx = leftRemain > LEFT_SCROLL_DEAD_ZONE_PX ? (leftScrollBtn.offsetWidth + sideGapPx) : 0;
    const rightOcclusionPx = rightRemain > RIGHT_SCROLL_DEAD_ZONE_PX ? (rightScrollBtn.offsetWidth + sideGapPx) : 0;

    const wrapRect = iconWrapEl.getBoundingClientRect();
    const btnRect = btnEl.getBoundingClientRect();
    const btnLeftInWrap = btnRect.left - wrapRect.left + iconWrapEl.scrollLeft;
    const btnRightInWrap = btnLeftInWrap + btnRect.width;
    const wrapWidth = iconWrapEl.clientWidth;

    const minVisibleLeft = iconWrapEl.scrollLeft + Math.max(LEFT_SCROLL_DEAD_ZONE_PX, leftOcclusionPx);
    const maxVisibleRight = iconWrapEl.scrollLeft + wrapWidth - Math.max(RIGHT_SCROLL_DEAD_ZONE_PX, rightOcclusionPx);

    let nextScrollLeft = iconWrapEl.scrollLeft;
    if (btnLeftInWrap < minVisibleLeft) {
      nextScrollLeft = btnLeftInWrap - Math.max(LEFT_SCROLL_DEAD_ZONE_PX, leftOcclusionPx);
    } else if (btnRightInWrap > maxVisibleRight) {
      nextScrollLeft = btnRightInWrap - wrapWidth + Math.max(RIGHT_SCROLL_DEAD_ZONE_PX, rightOcclusionPx);
    }

    nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, nextScrollLeft));
    const applied = setScrollLeftImmediate(iconWrapEl, nextScrollLeft);
    if (manualPagingLocked) {
      lockedScrollLeft = Math.round(applied);
    }
  }

  async function writeOverlayNavIntent(targetUrl, iconWrapEl) {
    try {
      const scrollLeft = Math.max(0, Math.round(Number(iconWrapEl?.scrollLeft || 0)));
      const remainingUses = await resolveOverlayNavIntentUses(targetUrl);
      await chrome.storage.local.set({
        [OVERLAY_NAV_INTENT_KEY]: {
          targetUrl: String(targetUrl || ""),
          scrollLeft,
          manualPagingLocked: Boolean(manualPagingLocked),
          remainingUses,
          at: Date.now()
        }
      });
      logOverlayDebug("navIntent:written", { targetUrl, scrollLeft, manualPagingLocked, remainingUses }, iconWrapEl);
    } catch {
      logOverlayDebug("navIntent:writeError", { targetUrl }, iconWrapEl);
    }
  }

  async function resolveOverlayNavIntentUses(targetUrl) {
    try {
      const host = new URL(String(targetUrl || "")).hostname.toLowerCase();
      if (!host) {
        return 1;
      }

      const data = await chrome.storage.local.get(NO_MAIN_FRAME_REWRITE_KEY);
      const hosts = Array.isArray(data?.[NO_MAIN_FRAME_REWRITE_KEY])
        ? data[NO_MAIN_FRAME_REWRITE_KEY].map((h) => String(h || "").trim().toLowerCase()).filter(Boolean)
        : DEFAULT_NO_MAIN_FRAME_REWRITE_HOSTS;

      return hosts.includes(host) ? 2 : 1;
    } catch {
      return 1;
    }
  }

  async function consumeOverlayNavIntent(iconWrapEl) {
    try {
      const data = await chrome.storage.local.get(OVERLAY_NAV_INTENT_KEY);
      const intent = data?.[OVERLAY_NAV_INTENT_KEY];
      if (!intent || typeof intent !== "object") {
        return false;
      }

      const ageMs = Date.now() - Number(intent.at || 0);
      if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 15000) {
        return false;
      }

      const targetUrl = String(intent.targetUrl || "");
      let sameTarget = false;
      try {
        const target = new URL(targetUrl);
        const current = new URL(String(window.location.href || ""));
        sameTarget = target.origin === current.origin && target.pathname === current.pathname;
      } catch {
        sameTarget = false;
      }

      if (!sameTarget) {
        return false;
      }

      const maxScrollLeft = Math.max(0, (iconWrapEl?.scrollWidth || 0) - (iconWrapEl?.clientWidth || 0));
      const desiredLeft = Math.max(0, Math.min(maxScrollLeft, Math.round(Number(intent.scrollLeft) || 0)));
      const applied = setScrollLeftImmediate(iconWrapEl, desiredLeft);
      manualPagingLocked = Boolean(intent.manualPagingLocked) && Math.round(applied) > 0;
      lockedScrollLeft = manualPagingLocked ? Math.round(applied) : null;

      const remainingUses = Math.max(0, Math.round(Number(intent.remainingUses || 1)) - 1);
      if (remainingUses > 0) {
        await chrome.storage.local.set({
          [OVERLAY_NAV_INTENT_KEY]: {
            ...intent,
            remainingUses
          }
        });
      } else {
        await chrome.storage.local.remove(OVERLAY_NAV_INTENT_KEY);
      }

      logOverlayDebug("navIntent:applied", { desiredLeft, applied: Math.round(applied), manualPagingLocked, remainingUses }, iconWrapEl);
      return true;
    } catch {
      logOverlayDebug("navIntent:consumeError", {}, iconWrapEl);
      return false;
    }
  }

  leftScrollBtn.addEventListener("click", () => {
    logOverlayDebug("leftScrollBtn:before");
    manualPagingLocked = true;
    iconWrap.scrollBy({ left: -340, behavior: "instant" });
    lockedScrollLeft = iconWrap.scrollLeft;
    logOverlayDebug("leftScrollBtn:afterScroll", { newLocked: lockedScrollLeft });
    updateScrollButtons();
  });

  rightScrollBtn.addEventListener("click", () => {
    logOverlayDebug("rightScrollBtn:before");
    manualPagingLocked = true;
    const pageStep = 340;

    const estimateBtnWidth = (btnEl) => {
      const measured = Number(btnEl?.offsetWidth || 0);
      return measured > 0 ? measured : 26;
    };
    const leftWidth = estimateBtnWidth(leftScrollBtn);
    const rightWidth = estimateBtnWidth(rightScrollBtn);
    const leftShownNow = leftScrollBtn.style.display !== "none";
    const rightShownNow = rightScrollBtn.style.display !== "none";
    const baseWrapWidth = Math.max(
      0,
      Number(iconWrap.clientWidth || 0)
        + (leftShownNow ? leftWidth : 0)
        + (rightShownNow ? rightWidth : 0)
    );
    const scrollWidth = Math.max(0, Number(iconWrap.scrollWidth || 0));
    const tolerancePx = 1;
    const resolveStableMaxAfterPage = (rawScrollLeft) => {
      const wrapWidthIfBothHidden = Math.max(0, baseWrapWidth);
      const maxIfBothHidden = Math.max(0, scrollWidth - wrapWidthIfBothHidden);
      const scrollIfBothHidden = Math.max(0, Math.min(maxIfBothHidden, Number(rawScrollLeft || 0)));
      const showLeft = scrollIfBothHidden > LEFT_SCROLL_DEAD_ZONE_PX + tolerancePx;

      const wrapWidthIfRightHidden = Math.max(0, baseWrapWidth - (showLeft ? leftWidth : 0));
      const maxIfRightHidden = Math.max(0, scrollWidth - wrapWidthIfRightHidden);
      const scrollIfRightHidden = Math.max(0, Math.min(maxIfRightHidden, Number(rawScrollLeft || 0)));
      const rightRemainIfRightHidden = Math.max(0, maxIfRightHidden - scrollIfRightHidden);
      const showRight = rightRemainIfRightHidden > RIGHT_SCROLL_DEAD_ZONE_PX + tolerancePx;

      const finalWrapWidth = Math.max(0, baseWrapWidth - (showLeft ? leftWidth : 0) - (showRight ? rightWidth : 0));
      return Math.max(0, Math.round(Math.max(0, scrollWidth - finalWrapWidth)));
    };

    const maxScrollLeft = Math.max(0, iconWrap.scrollWidth - iconWrap.clientWidth);
    const currentLeft = Math.max(0, Number(iconWrap.scrollLeft || 0));
    const desiredRaw = Math.max(0, Math.min(maxScrollLeft, currentLeft + pageStep));
    const stableMaxAfterPage = resolveStableMaxAfterPage(desiredRaw);
    let nextLeft = Math.max(0, Math.min(stableMaxAfterPage, desiredRaw));
    if (maxScrollLeft - nextLeft <= RIGHT_SCROLL_DEAD_ZONE_PX) {
      nextLeft = stableMaxAfterPage;
    }
    const appliedLeft = setScrollLeftImmediate(iconWrap, nextLeft);
    lockedScrollLeft = Math.round(appliedLeft);
    logOverlayDebug("rightScrollBtn:afterScroll", { newLocked: lockedScrollLeft });
    updateScrollButtons();
  });

  iconWrap.addEventListener("scroll", () => {
    if (!expanded || restoreScrollInProgress) {
      return;
    }
    logOverlayDebug("iconWrap:scroll");
    scheduleScrollButtonsUpdate();
  }, { passive: true });
  window.addEventListener("resize", scheduleScrollButtonsUpdate, { passive: true });

  if (typeof ResizeObserver === "function") {
    const iconWrapResizeObserver = new ResizeObserver(() => {
      scheduleScrollButtonsUpdate();
    });
    iconWrapResizeObserver.observe(iconWrap);
  }

  iconArea.appendChild(leftScrollBtn);
  iconArea.appendChild(iconWrap);
  iconArea.appendChild(rightScrollBtn);
  panel.appendChild(iconArea);

  const mount = () => {
    const target = document.documentElement || document.body;
    if (!target) {
      return;
    }
    dock.style.visibility = "hidden";
    ensureLayoutGuardStyle();
    ensureIconScrollbarHiddenStyle();
    ensurePageScrollbarHiddenStyle();
    applyTheme(getPreferredThemeName(), { rerender: false });
    startSystemThemeWatcher();
    dock.appendChild(panel);
    if (target.firstChild) {
      target.insertBefore(dock, target.firstChild);
    } else {
      target.appendChild(dock);
    }
    void reloadLinks(iconWrap).then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(async () => {
          const consumed = await consumeOverlayNavIntent(iconWrap);
          if (!consumed) {
            manualPagingLocked = false;
            lockedScrollLeft = null;
            setScrollLeftImmediate(iconWrap, 0);
            logOverlayDebug("mount:resetToFirstPage");
          }
          scheduleScrollButtonsUpdate();
          requestAnimationFrame(() => {
            dock.style.visibility = "visible";
            logOverlayDebug("mount:revealAfterPositioned");
          });
        });
      });
    });
    scheduleScrollButtonsUpdate();
    setExpanded(true);
  };

  window.addEventListener("resize", () => {
    if (expanded && activeSiteFixRule) {
      injectSiteFixStyles(activeSiteFixRule);
    }
  });

  void canInjectInCurrentWindow().then(async (ctx) => {
    if (!ctx.allowed || ctx.mode !== "popup-overlay") {
      return;
    }
    await hydrateSiteFixRulesFromStorage();
    await hydrateAutoHideConfig();
    sanitizePopupTitle();
    mount();
    setupAutoHide();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "miniweb-side-dot-health-check") {
      return {
        ok: true,
        mode: "popup-overlay",
        expanded,
        dockAutoHidden
      };
    }

    if (message?.type === "miniweb-side-dot-collapse") {
      setExpanded(false);
      return false;
    }

    if (message?.type === "miniweb-side-dot-toggle") {
      if (dockAutoHidden) {
        showDockFromAutoHide();
      } else {
        setExpanded(!expanded);
      }
      return { ok: true, expanded };
    }

    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }

    if (changes?.pinnedLinks) {
      const oldLinks = Array.isArray(changes.pinnedLinks.oldValue) ? changes.pinnedLinks.oldValue : [];
      const newLinks = Array.isArray(changes.pinnedLinks.newValue) ? changes.pinnedLinks.newValue : [];
      const oldUrlCounts = new Map();
      for (const item of oldLinks) {
        const oldUrl = String(item?.url || "");
        if (!/^https?:\/\//.test(oldUrl)) {
          continue;
        }
        oldUrlCounts.set(oldUrl, (oldUrlCounts.get(oldUrl) || 0) + 1);
      }

      let addedLink = null;
      for (let i = newLinks.length - 1; i >= 0; i -= 1) {
        const candidate = newLinks[i];
        const candidateUrl = String(candidate?.url || "");
        if (!/^https?:\/\//.test(candidateUrl)) {
          continue;
        }
        const leftCount = oldUrlCounts.get(candidateUrl) || 0;
        if (leftCount > 0) {
          oldUrlCounts.set(candidateUrl, leftCount - 1);
          continue;
        }
        addedLink = candidate;
        break;
      }

      void reloadLinks(iconWrap, { useCache: false }).then(async () => {
        if (addedLink) {
          const matchedButtons = Array.from(iconWrap.querySelectorAll("[data-miniweb-link-btn]")).filter((b) => b._miniwebUrl === addedLink.url);
          const newBtn = matchedButtons.length > 0 ? matchedButtons[matchedButtons.length - 1] : null;
          if (newBtn) {
            manualPagingLocked = true;
            lockedScrollLeft = Math.round(Number(newBtn.offsetLeft || 0));
            setScrollLeftImmediate(iconWrap, lockedScrollLeft);
            updateScrollButtons();
          }
          await writeOverlayNavIntent(addedLink.url, iconWrap);
          void openPopupByUrl(addedLink.url);
        }
      });
    }

    if (changes?.[SITE_FIX_CONFIG_KEY]) {
      applySiteFixRulesConfig(changes[SITE_FIX_CONFIG_KEY].newValue);
    }

    if (changes?.[ACTION_SHORTCUT_CACHE_KEY]) {
      void hydrateAutoHideConfig().then(() => { setupAutoHide(); });
    }
  });

  function buildActionButton(title, pathD, isDanger) {
    const btn = document.createElement("button");
    btn.setAttribute("type", "button");
    btn.setAttribute("data-miniweb-action-btn", "1");
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.style.cssText = [
      "width:28px",
      "min-width:28px",
      "max-width:28px",
      "flex:0 0 28px",
      "height:28px",
      "border-radius:9px",
      "border:none",
      "display:grid",
      "place-items:center",
      "padding:0",
      "cursor:pointer",
      "background:transparent",
      "color:" + (isDanger ? currentTheme.actionDanger : currentTheme.actionColor)
    ].join(";");

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.style.width = "16px";
    svg.style.height = "16px";
    svg.style.fill = "currentColor";

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    svg.appendChild(path);
    btn.appendChild(svg);
    btn._miniwebIconPathEl = path;

    return btn;
  }

  function buildScrollButton(title, pathD) {
    const btn = document.createElement("button");
    btn.setAttribute("type", "button");
    btn.setAttribute("data-miniweb-scroll-btn", "1");
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.style.cssText = [
      "width:22px",
      "height:22px",
      "border-radius:7px",
      "border:1px solid " + currentTheme.scrollBtnBorder,
      "display:none",
      "place-items:center",
      "padding:0",
      "cursor:pointer",
      "background:" + currentTheme.scrollBtnBg,
      "color:" + currentTheme.scrollBtnColor,
      "flex:0 0 22px"
    ].join(";");

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.style.width = "14px";
    svg.style.height = "14px";
    svg.style.fill = "currentColor";

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    svg.appendChild(path);
    btn.appendChild(svg);

    return btn;
  }

  function setExpanded(next) {
    expanded = Boolean(next);
    if (!expanded) {
      restoreScrollInProgress = false;
      savedScrollLeftOnHide = Math.round(Number(iconWrap.scrollLeft || 0));
    }
    dock.style.display = expanded ? "flex" : "none";
    if (!expanded) {
      resetDeleteConfirmState();
      setActionItemsVisible(false);
      if (dockAutoHidden) {
        dockAutoHidden = false;
        dock.style.transform = "";
        dock.style.transition = "";
        setPeekTabVisible(false);
      }
    }
    applySiteFix(expanded);
    if (expanded) {
      if (savedScrollLeftOnHide !== null) {
        const _restoreTarget = savedScrollLeftOnHide;
        savedScrollLeftOnHide = null;
        restoreScrollInProgress = true;
        // 双层 rAF：第一帧让 display:flex reflow 完成，第二帧读到稳定尺寸后再写 scrollLeft
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!expanded) {
              restoreScrollInProgress = false;
              return;
            }
            restoreScrollLeftAfterExpand(_restoreTarget, 6);
          });
        });
      } else {
        restoreScrollInProgress = false;
        scheduleScrollButtonsUpdate();
      }
    }
  }

  function sanitizePopupTitle() {
    const title = String(document.title || "");
    if (!title) {
      return;
    }

    if (/__crx__|_crx_/i.test(title)) {
      document.title = "MiniWeb";
    }
  }

  function ensureIconScrollbarHiddenStyle() {
    if (document.getElementById(ICON_SCROLLBAR_FIX_STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = ICON_SCROLLBAR_FIX_STYLE_ID;
    style.textContent = "[data-miniweb-icon-wrap='1']::-webkit-scrollbar{display:none;width:0;height:0}";
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureLayoutGuardStyle() {
    if (document.getElementById(LAYOUT_GUARD_STYLE_ID)) {
      return;
    }

    // 所有选择器都以面板 ID 为前缀，提升特异性到 ID 级别，
    // 确保无论站点 CSS 用多高特异性的规则都无法覆盖
    const p = "#" + PANEL_ID;
    const style = document.createElement("style");
    style.id = LAYOUT_GUARD_STYLE_ID;
    style.textContent = [
      `${p}[data-miniweb='1']{display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;align-items:center!important;box-sizing:border-box!important;padding-left:8px!important;padding-right:8px!important;overflow:hidden!important}`,
      `${p} [data-miniweb-icon-area='1']{display:flex!important;flex-direction:row!important;align-items:center!important;flex:1 1 0%!important;min-width:0!important;height:42px!important;min-height:42px!important;overflow:hidden!important}`,
      `${p} [data-miniweb-icon-wrap='1']{display:flex!important;position:relative!important;flex-direction:row!important;align-items:center!important;gap:6px!important;padding-right:4px!important;box-sizing:border-box!important;overflow-x:auto!important;overflow-y:hidden!important;flex:1 1 0%!important;min-width:0!important;height:42px!important;min-height:42px!important;scroll-behavior:smooth!important;scrollbar-width:none!important;-ms-overflow-style:none!important}`,
      `${p} [data-miniweb-scroll-btn='1']{width:22px!important;min-width:22px!important;max-width:22px!important;height:22px!important;min-height:22px!important;max-height:22px!important;flex:0 0 22px!important;padding:0!important;box-sizing:border-box!important;border-width:1px!important;border-style:solid!important;border-radius:7px!important;box-shadow:none!important;outline:none!important;appearance:none!important;-webkit-appearance:none!important}`,
      `${p} [data-miniweb-action-wrap='1']{padding-left:0!important;padding-right:8px!important;flex:0 0 auto!important;flex-shrink:0!important}`,
      `${p} [data-miniweb-action-items='1']{display:flex!important;position:absolute!important;inset:0!important;align-items:center!important;justify-content:center!important;padding-right:0!important;gap:0!important;flex:0 0 auto!important}`,
      `${p} [data-miniweb-trigger-btn='1']{width:16px!important;min-width:16px!important;max-width:16px!important;height:16px!important;min-height:16px!important;max-height:16px!important;flex:0 0 16px!important;padding:0!important;box-sizing:border-box!important;border:none!important;background:transparent!important;overflow:hidden!important}`,
      `${p} [data-miniweb-action-btn='1']{width:28px!important;min-width:28px!important;max-width:28px!important;height:28px!important;min-height:28px!important;max-height:28px!important;flex:0 0 28px!important;padding:0!important;box-sizing:border-box!important}`,
      `${p} [data-miniweb-link-btn='1']{width:28px!important;min-width:28px!important;max-width:28px!important;height:28px!important;min-height:28px!important;max-height:28px!important;flex:0 0 28px!important;padding:0!important;box-sizing:border-box!important}`,
      `${p} [data-miniweb-link-btn='1'] img{width:16px!important;min-width:16px!important;max-width:16px!important;height:16px!important;min-height:16px!important;max-height:16px!important;display:block!important;flex-shrink:0!important}`
    ].join("");
    (document.head || document.documentElement).appendChild(style);
    sideDebug('[MiniWeb] guard style injected, selector prefix:', p);
  }

  function ensurePageScrollbarHiddenStyle() {
    if (document.getElementById(PAGE_SCROLLBAR_HIDE_STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = PAGE_SCROLLBAR_HIDE_STYLE_ID;
    style.textContent = [
      "html,body{-ms-overflow-style:none!important;scrollbar-width:none!important}",
      "html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}"
    ].join("");
    (document.head || document.documentElement).appendChild(style);
  }

  function getPreferredThemeName() {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "dark";
    }
  }

  function getThemePalette(name) {
    return name === "light" ? THEME_LIGHT : THEME_DARK;
  }

  function applyTheme(name, options = {}) {
    const nextThemeName = name === "light" ? "light" : "dark";
    const themeChanged = currentThemeName !== nextThemeName;
    currentThemeName = nextThemeName;
    currentTheme = getThemePalette(name);

    if (themeChanged) {
      iconDarknessCache.clear();
    }

    panel.style.background = currentTheme.panelBackground;
    panel.style.borderBottom = `1px solid ${currentTheme.panelBorder}`;
    panel.style.boxShadow = `0 -1px 0 ${currentTheme.panelBackground}, 0 8px 24px rgba(0,0,0,0.42)`;
    actionWrap.style.borderRight = `1px solid ${currentTheme.actionDivider}`;

    actionTrigger.style.border = `1px solid ${currentTheme.triggerBorder}`;
    actionTrigger.style.background = currentTheme.triggerBg;

    applyDeleteConfirmVisualState();

    leftScrollBtn.style.border = `1px solid ${currentTheme.scrollBtnBorder}`;
    leftScrollBtn.style.background = currentTheme.scrollBtnBg;
    leftScrollBtn.style.color = currentTheme.scrollBtnColor;
    rightScrollBtn.style.border = `1px solid ${currentTheme.scrollBtnBorder}`;
    rightScrollBtn.style.background = currentTheme.scrollBtnBg;
    rightScrollBtn.style.color = currentTheme.scrollBtnColor;
    dropIndicator.style.background = currentTheme.dragOverBorder;

    if (options.rerender !== false) {
      renderLinks(iconWrap, links);
    }
    peekTab.style.background = currentTheme.panelBackground;
    peekTab.style.color = currentTheme.actionColor;
    setPeekTabVisible(dockAutoHidden);
  }

  function startSystemThemeWatcher() {
    if (systemThemeMediaQuery || typeof window.matchMedia !== "function") {
      return;
    }

    systemThemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyTheme(systemThemeMediaQuery.matches ? "dark" : "light");
    };

    if (typeof systemThemeMediaQuery.addEventListener === "function") {
      systemThemeMediaQuery.addEventListener("change", onChange);
      return;
    }

    if (typeof systemThemeMediaQuery.addListener === "function") {
      systemThemeMediaQuery.addListener(onChange);
    }
  }

  function toFinitePositiveNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function computeSiteFixOffsetPx() {
    const panelHeight = panel && expanded ? toFinitePositiveNumber(panel.getBoundingClientRect().height) : 0;
    if (panelHeight > 0) {
      return Math.max(1, Math.round(panelHeight));
    }
    return SITE_FIX_OFFSET_FALLBACK_PX;
  }

  function buildSiteFixCssText(rule, offsetPx) {
    const safeOffset = Math.max(1, Math.round(toFinitePositiveNumber(offsetPx) || SITE_FIX_OFFSET_FALLBACK_PX));
    const selectors = Array.isArray(rule?.selectors) ? rule.selectors : [];
    return selectors.map((sel) => {
      const normalized = String(sel || "").trim().toLowerCase();
      if (normalized === "body" || normalized === "html") {
        return `${sel}{margin-top:${safeOffset}px!important}`;
      }
      return `${sel}{top:${safeOffset}px!important}`;
    }).join("\n");
  }

  function injectSiteFixStyles(rule) {
    const cssText = buildSiteFixCssText(rule, computeSiteFixOffsetPx());
    if (rule.useForEachRoot) {
      forEachOpenRoot((root) => {
        ensureStyleElement(root, SITE_FIX_STYLE_ID, cssText);
      });
    } else {
      ensureStyleElement(document, SITE_FIX_STYLE_ID, cssText);
    }
  }

  function removeSiteFixStyles(rule) {
    if (rule.useForEachRoot) {
      forEachOpenRoot((root) => {
        const style = root.getElementById(SITE_FIX_STYLE_ID);
        if (style) {
          style.remove();
        }
      });
    } else {
      const style = document.getElementById(SITE_FIX_STYLE_ID);
      if (style) {
        style.remove();
      }
    }
  }

  function startSiteFixObserver(rule) {
    if (siteFixObserver) {
      return;
    }
    siteFixObserver = new MutationObserver(() => {
      if (siteFixScanScheduled || !expanded) {
        return;
      }
      siteFixScanScheduled = true;
      requestAnimationFrame(() => {
        siteFixScanScheduled = false;
        injectSiteFixStyles(rule);
      });
    });
    siteFixObserver.observe(document.documentElement || document, {
      childList: true,
      subtree: true
    });
  }

  function stopSiteFixObserver() {
    if (!siteFixObserver) {
      return;
    }
    siteFixObserver.disconnect();
    siteFixObserver = null;
    siteFixScanScheduled = false;
  }

  function applySiteFix(apply) {
    if (!activeSiteFixRule) {
      return;
    }
    const hasSiteFixSelectors = Array.isArray(activeSiteFixRule.selectors) && activeSiteFixRule.selectors.length > 0;
    if (apply) {
      if (hasSiteFixSelectors) {
        injectSiteFixStyles(activeSiteFixRule);
      }
      if (hasSiteFixSelectors && activeSiteFixRule.useObserver) {
        startSiteFixObserver(activeSiteFixRule);
      }
    } else {
      if (hasSiteFixSelectors && activeSiteFixRule.useObserver) {
        stopSiteFixObserver();
      }
      if (hasSiteFixSelectors) {
        removeSiteFixStyles(activeSiteFixRule);
      }
    }
  }

  function normalizeSelectors(input) {
    if (!Array.isArray(input)) {
      return [];
    }
    return input
      .map((s) => String(s || "").trim())
      .filter((s) => s.length > 0);
  }

  function ensureRequiredSiteFixRules(config) {
    const list = Array.isArray(config) ? [...config] : [];
    const existingIds = new Set(list.map((item) => String(item?.id || "")).filter(Boolean));
    for (const rule of DEFAULT_SITE_FIX_RULES) {
      if (rule?.id && !existingIds.has(rule.id)) {
        list.push(rule);
      }
    }
    return list;
  }

  function buildRuntimeSiteFixRules(config) {
    const list = Array.isArray(config)
      ? ensureRequiredSiteFixRules(config)
      : DEFAULT_SITE_FIX_RULES;
    const runtimeRules = [];

    for (const item of list) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const ruleId = String(item.id || "").trim();
      const enabled = item.enabled !== false;
      const matchType = String(item.matchType || "hostnameRegex");
      const pattern = String(item.pattern || "").trim();
      let selectors = normalizeSelectors(item.selectors);
      if (ruleId === "claude-new-body" && selectors.length === 1 && selectors[0].toLowerCase() === "body") {
        selectors = [...CLAUDE_NEW_BUTTON_SELECTORS];
      }
      const forceFloating = item.forceFloating === true;
      const disableContextMenuPip = item.disableContextMenuPip === true;
      const cookieSyncEnabled = item.cookieSyncEnabled !== false;
      const useForEachRoot = Boolean(item.useForEachRoot);
      const useObserver = Boolean(item.useObserver);
      const allowMatchType = matchType === "hostnameRegex" || matchType === "hrefRegex";

      if (!enabled || !allowMatchType || !pattern || (selectors.length === 0 && !forceFloating && !disableContextMenuPip && !cookieSyncEnabled)) {
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
        selectors,
        forceFloating,
        disableContextMenuPip,
        cookieSyncEnabled,
        useForEachRoot,
        useObserver,
        regex,
        matchType
      });
    }

    return runtimeRules;
  }

  function findActiveSiteFixRule(rules) {
    const hostname = String(window.location.hostname || "");
    const href = String(window.location.href || "");
    for (const rule of rules) {
      const target = rule.matchType === "hrefRegex" ? href : hostname;
      if (rule.regex.test(target)) {
        return rule;
      }
    }
    return null;
  }

  function findSiteFixRuleForUrl(url, rules = siteFixRules) {
    let parsed = null;
    try {
      parsed = new URL(String(url || ""));
    } catch {
      return null;
    }

    const hostname = String(parsed.hostname || "");
    const href = String(parsed.href || "");
    for (const rule of Array.isArray(rules) ? rules : []) {
      const target = rule.matchType === "hrefRegex" ? href : hostname;
      if (rule.regex.test(target)) {
        return rule;
      }
    }
    return null;
  }

  function syncDockPositionForSiteFix() {
    dock.style.position = activeSiteFixRule && activeSiteFixRule.forceFloating ? "fixed" : activeSiteFixRule ? "fixed" : "sticky";
  }

  function applySiteFixRulesConfig(configValue) {
    const previousRule = activeSiteFixRule;
    if (previousRule) {
      if (previousRule.useObserver) {
        stopSiteFixObserver();
      }
      removeSiteFixStyles(previousRule);
    }

    siteFixRules = buildRuntimeSiteFixRules(configValue);
    activeSiteFixRule = findActiveSiteFixRule(siteFixRules);
    autoHideEnabled = Boolean(activeSiteFixRule?.forceFloating);
    syncDockPositionForSiteFix();
    setupAutoHide();

    if (expanded) {
      applySiteFix(true);
    }
  }

  async function hydrateSiteFixRulesFromStorage() {
    try {
      const data = await chrome.storage.local.get(SITE_FIX_CONFIG_KEY);
      applySiteFixRulesConfig(data?.[SITE_FIX_CONFIG_KEY]);
    } catch {
      applySiteFixRulesConfig(DEFAULT_SITE_FIX_RULES);
    }
  }

  async function hydrateAutoHideConfig() {
    try {
      const data = await chrome.storage.local.get([ACTION_SHORTCUT_CACHE_KEY]);
      actionShortcutFallback = normalizeShortcutText(data?.[ACTION_SHORTCUT_CACHE_KEY] || "");
      try {
        const response = await chrome.runtime.sendMessage({ type: "miniweb-get-execute-action-shortcut" });
        if (response?.ok) {
          actionShortcutFallback = normalizeShortcutText(response.shortcut || actionShortcutFallback);
        }
      } catch {
        // Ignore when background is temporarily unavailable.
      }
    } catch {
      actionShortcutFallback = "";
    }
  }

  function setupAutoHide() {
    window.removeEventListener("keydown", handleGlobalToggleKeydown, true);
    window.addEventListener("keydown", handleGlobalToggleKeydown, true);
    syncDockPositionForSiteFix();
    if (autoHideEnabled) {
      const target = document.documentElement || document.body;
      if (target && !document.getElementById(PEEK_TAB_ID)) {
        target.appendChild(peekTab);
      }
    } else {
      const existing = document.getElementById(PEEK_TAB_ID);
      if (existing) existing.remove();
      if (dockAutoHidden) {
        dockAutoHidden = false;
        dock.style.transform = "";
        dock.style.transition = "";
        setPeekTabVisible(false);
      }
    }
  }

  function setPeekTabVisible(visible) {
    if (visible) {
      peekTab.style.transform = "translateX(-50%) translateY(0)";
      peekTab.style.opacity = "1";
      peekTab.style.pointerEvents = "auto";
      peekTab.style.boxShadow = "0 2px 8px rgba(0,0,0,0.32)";
      return;
    }
    peekTab.style.transform = "translateX(-50%) translateY(calc(-100% - 12px))";
    peekTab.style.opacity = "0";
    peekTab.style.pointerEvents = "none";
    peekTab.style.boxShadow = "none";
  }

  function hideDockForAutoHide() {
    if (dockAutoHidden || !expanded) return;
    dockAutoHidden = true;
    dock.style.transition = "transform 0.25s ease";
    dock.style.transform = "translateY(-100%)";
    setPeekTabVisible(true);
  }

  function showDockFromAutoHide() {
    if (!dockAutoHidden) return;
    dockAutoHidden = false;
    dock.style.transition = "transform 0.25s ease";
    dock.style.transform = "";
    setPeekTabVisible(false);
    setTimeout(() => {
      if (!dockAutoHidden) {
        dock.style.transition = "";
      }
    }, 280);
  }

  function matchesShortcut(event, shortcut) {
    if (!shortcut) return false;
    const parts = shortcut.split("+").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return false;
    const key = parts[parts.length - 1];
    const ctrl = parts.includes("ctrl");
    const alt = parts.includes("alt");
    const shift = parts.includes("shift");
    const meta = parts.includes("meta") || parts.includes("cmd");
    return (
      event.key.toLowerCase() === key &&
      event.ctrlKey === ctrl &&
      event.altKey === alt &&
      event.shiftKey === shift &&
      event.metaKey === meta
    );
  }

  function handleGlobalToggleKeydown(event) {
    if (!actionShortcutFallback || !matchesShortcut(event, actionShortcutFallback)) {
      return;
    }
    event.preventDefault();
    if (dockAutoHidden) {
      showDockFromAutoHide();
      return;
    }
    setExpanded(!expanded);
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

  function ensureStyleElement(root, id, cssText) {
    const container = root === document ? document.head || document.documentElement : root;
    if (!container) {
      return;
    }

    let style = root.getElementById(id);
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      container.appendChild(style);
    }

    if (style.textContent !== cssText) {
      style.textContent = cssText;
    }
  }

  function forEachOpenRoot(visitor) {
    const queue = [document];
    const visited = new Set();

    while (queue.length) {
      const root = queue.shift();
      if (!root || visited.has(root)) {
        continue;
      }

      visited.add(root);
      visitor(root);

      const nodes = root.querySelectorAll("*");
      for (const node of nodes) {
        if (node.shadowRoot) {
          queue.push(node.shadowRoot);
        }
      }
    }
  }

  async function reloadLinks(iconWrapEl, options = {}) {
    const useCache = options.useCache !== false;
    let renderedFromCache = false;

    if (useCache) {
      const cachedLinks = loadLinksCache();
      if (cachedLinks.length > 0) {
        links = cachedLinks;
        renderLinks(iconWrapEl, links);
        linksFingerprint = createLinksFingerprint(links);
        renderedFromCache = true;
      }
    }

    let nextLinks = [];
    try {
      const allLinks = await sendMessageAsync({ type: "miniweb-get-links" });
      nextLinks = normalizeLinks(Array.isArray(allLinks) ? allLinks : []);
    } catch {
      nextLinks = [];
    }

    const nextFingerprint = createLinksFingerprint(nextLinks);
    if (!renderedFromCache || nextFingerprint !== linksFingerprint) {
      links = nextLinks;
      renderLinks(iconWrapEl, links);
      linksFingerprint = nextFingerprint;
    } else {
      links = nextLinks;
    }

    saveLinksCache(nextLinks);
  }

  function renderLinks(iconWrapEl, list) {
    iconWrapEl.textContent = "";
    iconWrapEl.appendChild(dropIndicator);

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = t("sideEmpty", undefined, "无");
      empty.title = t("sideEmptyTitle", undefined, "暂无固定链接");
      empty.style.cssText = [
        "width:28px",
        "flex:0 0 28px",
        "height:28px",
        "display:grid",
        "place-items:center",
        "border-radius:8px",
        "border:1px dashed " + currentTheme.emptyBorder,
        "color:" + currentTheme.emptyColor,
        "font-size:11px"
      ].join(";");
      iconWrapEl.appendChild(empty);
      scheduleScrollButtonsUpdate();
      return;
    }

    let dragSourceUrl = "";

    const hideDropIndicator = () => {
      dropIndicator.style.opacity = "0";
    };

    const showDropIndicatorOn = (targetBtn, placeAfter) => {
      const x = Math.max(0, targetBtn.offsetLeft + (placeAfter ? targetBtn.offsetWidth + 3 : -3));
      dropIndicator.style.left = `${x}px`;
      dropIndicator.style.opacity = "1";
    };

    for (const link of list) {
      const btn = document.createElement("button");
      btn.setAttribute("type", "button");
      btn.setAttribute("data-miniweb-link-btn", "1");
      btn._miniwebUrl = link.url;
      btn.title = String(link.title || link.url || "").slice(0, 120);
      btn.draggable = true;
      btn.style.cssText = [
        "width:28px",
        "min-width:28px",
        "max-width:28px",
        "flex:0 0 28px",
        "height:28px",
        "border-radius:8px",
        "border:1px solid transparent",
        "background:transparent",
        "display:grid",
        "place-items:center",
        "padding:0",
        "cursor:pointer"
      ].join(";");

      if (isLinkSelected(link.url, String(window.location.href || ""))) {
        btn.style.borderColor = currentTheme.selectedBorder;
        btn.style.background = currentTheme.selectedBg;
      }

      const img = document.createElement("img");
      img.width = 16;
      img.height = 16;
      img.alt = "";
      img.style.cssText = "display:block;border-radius:3px;pointer-events:none";
      const candidates = buildFaviconCandidates(link);
      let index = 0;
      img.src = candidates[index] || DEFAULT_ICON;
      img.addEventListener("error", () => {
        index += 1;
        img.src = candidates[index] || DEFAULT_ICON;
      });
      attachAutoInvertForDarkIcon(img);

      btn.appendChild(img);
      let pointerDownAt = 0;
      let pointerDownX = 0;
      let pointerDownY = 0;
      let dragArmed = false;
      let suppressClickUntil = 0;

      const resetDragIntent = () => {
        pointerDownAt = 0;
        dragArmed = false;
      };

      btn.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }
        pointerDownAt = Date.now();
        pointerDownX = event.clientX;
        pointerDownY = event.clientY;
        dragArmed = false;
      });

      btn.addEventListener("pointermove", (event) => {
        if (!pointerDownAt) {
          return;
        }
        const moved = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
        const heldMs = Date.now() - pointerDownAt;
        if (moved >= DRAG_ARM_MOVE_PX || heldMs >= DRAG_ARM_HOLD_MS) {
          dragArmed = true;
        }
      });

      btn.addEventListener("pointerup", resetDragIntent);
      btn.addEventListener("pointercancel", resetDragIntent);

      btn.addEventListener("click", async (event) => {
        if (Date.now() < suppressClickUntil) {
          return;
        }

        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          btn.blur();
          logOverlayDebug("linkBtn:click:browser", { target: link.url }, iconWrapEl);
          void openBrowserTabByUrl(link.url);
          return;
        }

        btn.blur();
        ensureButtonFullyVisible(btn, iconWrapEl);
        scheduleScrollButtonsUpdate();
        logOverlayDebug("linkBtn:click:start", { target: link.url }, iconWrapEl);
        await writeOverlayNavIntent(link.url, iconWrapEl);
        void openPopupByUrl(link.url);
      });

      btn.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        btn.blur();
        const matchedRule = findSiteFixRuleForUrl(link.url);
        if (matchedRule?.disableContextMenuPip === true) {
          logOverlayDebug("linkBtn:contextmenu:pip:blocked", { target: link.url }, iconWrapEl);
          void sendMessageAsync({
            type: "miniweb-show-toast",
            message: t("sidePipDisabledToast", undefined, "该站点规则已禁用置顶模式"),
            isError: true
          }).catch(() => null);
          return;
        }
        logOverlayDebug("linkBtn:contextmenu:pip", { target: link.url }, iconWrapEl);
        void openPipByUrl(link.url);
      });

      btn.addEventListener("dragstart", (event) => {
        const moved = Math.hypot((event.clientX || 0) - pointerDownX, (event.clientY || 0) - pointerDownY);
        const heldMs = pointerDownAt ? Date.now() - pointerDownAt : 0;
        if (!dragArmed && (moved >= DRAG_ARM_MOVE_PX || heldMs >= DRAG_ARM_HOLD_MS)) {
          dragArmed = true;
        }
        if (!dragArmed) {
          event.preventDefault();
          return;
        }
        suppressClickUntil = Date.now() + 250;
        dragSourceUrl = link.url;
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", link.url);
        }
        btn.style.opacity = "0.5";
      });

      btn.addEventListener("dragover", (event) => {
        event.preventDefault();
        const rect = btn.getBoundingClientRect();
        const placeAfter = event.clientX > rect.left + rect.width / 2;
        showDropIndicatorOn(btn, placeAfter);
      });

      btn.addEventListener("dragleave", () => {
        hideDropIndicator();
      });

      btn.addEventListener("drop", (event) => {
        event.preventDefault();
        const rect = btn.getBoundingClientRect();
        const placeAfter = event.clientX > rect.left + rect.width / 2;
        const sourceUrl = dragSourceUrl || String(event.dataTransfer?.getData("text/plain") || "");
        if (!sourceUrl || sourceUrl === link.url) {
          hideDropIndicator();
          return;
        }
        if (!reorderLinksByUrlWithPosition(sourceUrl, link.url, placeAfter)) {
          hideDropIndicator();
          return;
        }
        hideDropIndicator();
        renderLinks(iconWrapEl, links);
        linksFingerprint = createLinksFingerprint(links);
        saveLinksCache(links);
        void persistReorderedLinks();
      });

      btn.addEventListener("dragend", () => {
        btn.style.opacity = "";
        if (isLinkSelected(link.url, String(window.location.href || ""))) {
          btn.style.borderColor = currentTheme.selectedBorder;
          btn.style.background = currentTheme.selectedBg;
        } else {
          btn.style.borderColor = "transparent";
          btn.style.background = "transparent";
        }
        hideDropIndicator();
        resetDragIntent();
      });

      iconWrapEl.appendChild(btn);
    }

    applyPendingDeleteTargetVisualState();

    // 先让双层 rAF 更新滚动按钮显隐（会改变 iconWrap.clientWidth），
    // 再用第三层 rAF 计算选中图标的滚动位置，确保 clientWidth 已稳定
    scheduleScrollButtonsUpdate();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // 诊断日志：guard 注入后实际计算尺寸
        const panel = document.getElementById(PANEL_ID);
        const panelCS = panel ? getComputedStyle(panel) : null;
        sideDebug('[MiniWeb] PAGE', window.location.href);
        sideDebug('[MiniWeb] panel computed', panelCS ? `w=${panel.offsetWidth} display=${panelCS.display} boxSizing=${panelCS.boxSizing}` : 'null');

        // 检查面板祖先元素是否有 zoom / transform 干扰
        let ancestor = panel?.parentElement;
        while (ancestor && ancestor !== document.documentElement) {
          const acs = getComputedStyle(ancestor);
          if (acs.zoom !== '1' && acs.zoom !== 'normal' && acs.zoom !== '') {
            sideDebug('[MiniWeb] ZOOM found on ancestor', ancestor.tagName, ancestor.id, ancestor.className, 'zoom=', acs.zoom);
          }
          if (acs.transform && acs.transform !== 'none') {
            sideDebug('[MiniWeb] TRANSFORM found on ancestor', ancestor.tagName, ancestor.id, ancestor.className, 'transform=', acs.transform);
          }
          ancestor = ancestor.parentElement;
        }

        const allLinkBtns = iconWrapEl.querySelectorAll('[data-miniweb-link-btn]');
        allLinkBtns.forEach((btn, i) => {
          const cs = getComputedStyle(btn);
          const img = btn.querySelector('img');
          const ics = img ? getComputedStyle(img) : null;
          sideDebug(`[MiniWeb] link-btn[${i}]`,
            `w=${btn.offsetWidth} h=${btn.offsetHeight}`,
            `minW=${cs.minWidth} maxW=${cs.maxWidth} flex=${cs.flex}`,
            img ? `img:${img.offsetWidth}x${img.offsetHeight} minW=${ics.minWidth}` : 'no-img'
          );
        });

        const iconAreaEl = iconWrapEl.parentElement;
        if (iconAreaEl) {
          const acs = getComputedStyle(iconAreaEl);
          sideDebug('[MiniWeb] iconArea computed', `w=${iconAreaEl.offsetWidth} flex=${acs.flex} overflow=${acs.overflow}`);
        }
        sideDebug('[MiniWeb] iconWrap', `scrollW=${iconWrapEl.scrollWidth} clientW=${iconWrapEl.clientWidth} scrollL=${iconWrapEl.scrollLeft}`);

        requestAnimationFrame(() => {
          scheduleScrollButtonsUpdate();
        });
      });
    });
  }

  function scrollSelectedIntoView(iconWrapEl) {
    if (manualPagingLocked) {
      return;
    }

    const currentUrl = String(window.location.href || "");
    const btns = iconWrapEl.querySelectorAll("[data-miniweb-link-btn='1']");
    let selectedBtn = null;
    for (const btn of btns) {
      if (isLinkSelected(btn._miniwebUrl || "", currentUrl)) {
        selectedBtn = btn;
        break;
      }
    }

    if (!selectedBtn) {
      return;
    }

    // 用 getBoundingClientRect 计算按钮相对于 iconWrap 的偏移，
    // 避免 offsetLeft 因 offsetParent 链不同而算错
    const wrapRect = iconWrapEl.getBoundingClientRect();
    const btnRect = selectedBtn.getBoundingClientRect();

    // 按钮左右边缘相对于 iconWrap 内容区的坐标（含当前 scrollLeft）
    const btnLeftInWrap = btnRect.left - wrapRect.left + iconWrapEl.scrollLeft;
    const btnRightInWrap = btnLeftInWrap + btnRect.width;
    const wrapWidth = iconWrapEl.clientWidth;
    const maxScrollLeft = Math.max(0, iconWrapEl.scrollWidth - iconWrapEl.clientWidth);
    const leftRemain = Math.max(0, Number(iconWrapEl.scrollLeft || 0));
    const rightRemain = Math.max(0, maxScrollLeft - leftRemain);
    const leftOcclusionPx = leftRemain > LEFT_SCROLL_DEAD_ZONE_PX ? SCROLL_BUTTON_OCCLUSION_PX : 0;
    const rightOcclusionPx = rightRemain > RIGHT_SCROLL_DEAD_ZONE_PX ? SCROLL_BUTTON_OCCLUSION_PX : 0;
    const minVisibleLeft = iconWrapEl.scrollLeft + Math.max(LEFT_SCROLL_DEAD_ZONE_PX, leftOcclusionPx);
    const maxVisibleRight = iconWrapEl.scrollLeft + wrapWidth - Math.max(RIGHT_SCROLL_DEAD_ZONE_PX, rightOcclusionPx);

    let nextScrollLeft = iconWrapEl.scrollLeft;
    if (btnLeftInWrap < minVisibleLeft) {
      nextScrollLeft = btnLeftInWrap - Math.max(LEFT_SCROLL_DEAD_ZONE_PX, leftOcclusionPx);
    } else if (btnRightInWrap > maxVisibleRight) {
      nextScrollLeft = btnRightInWrap - wrapWidth + Math.max(RIGHT_SCROLL_DEAD_ZONE_PX, rightOcclusionPx);
    }

    iconWrapEl.scrollLeft = Math.max(0, Math.min(maxScrollLeft, nextScrollLeft));
  }

  function reorderLinksByUrl(sourceUrl, targetUrl) {
    const fromIndex = links.findIndex((item) => item.url === sourceUrl);
    const toIndex = links.findIndex((item) => item.url === targetUrl);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return false;
    }

    const next = links.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    links = next;
    return true;
  }

  function reorderLinksByUrlWithPosition(sourceUrl, targetUrl, placeAfter) {
    const fromIndex = links.findIndex((item) => item.url === sourceUrl);
    if (fromIndex < 0) {
      return false;
    }

    const next = links.slice();
    const [moved] = next.splice(fromIndex, 1);
    let targetIndex = next.findIndex((item) => item.url === targetUrl);
    if (targetIndex < 0) {
      return false;
    }

    if (placeAfter) {
      targetIndex += 1;
    }

    next.splice(targetIndex, 0, moved);
    links = next;
    return true;
  }

  async function persistReorderedLinks() {
    const orderedUrls = links.map((item) => item.url).filter((url) => /^https?:\/\//.test(url));
    if (orderedUrls.length === 0) {
      return;
    }

    await sendMessageAsync({
      type: "miniweb-overlay-reorder-links",
      orderedUrls
    }).catch(() => null);
  }

  function createLinksFingerprint(list) {
    return list.map((item) => `${item.url}|${item.title}|${item.faviconUrl}`).join("\n");
  }

  function attachAutoInvertForDarkIcon(imgEl) {
    const detectAndApply = () => {
      const src = String(imgEl.currentSrc || imgEl.src || "");
      if (!src) {
        imgEl.style.filter = "";
        return;
      }

      const cacheKey = `${currentThemeName}|${src}`;

      if (iconDarknessCache.has(cacheKey)) {
        imgEl.style.filter = iconDarknessCache.get(cacheKey) ? "invert(1)" : "";
        return;
      }

      const shouldInvert = shouldInvertIconForTheme(imgEl);
      iconDarknessCache.set(cacheKey, shouldInvert);
      imgEl.style.filter = shouldInvert ? "invert(1)" : "";
    };

    imgEl.addEventListener("load", detectAndApply);
    if (imgEl.complete && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
      detectAndApply();
    }
  }

  function shouldInvertIconForTheme(imgEl) {
    const iconLuminance = detectIconLuminanceByCanvas(imgEl);
    if (iconLuminance == null) {
      return false;
    }

    const backgroundLuminance = getThemeBackgroundLuminance();
    return Math.abs(iconLuminance - backgroundLuminance) < ICON_LOW_CONTRAST_THRESHOLD;
  }

  function getThemeBackgroundLuminance() {
    const panelLuminance = parseLuminanceFromCssColor(currentTheme.panelBackground);
    if (panelLuminance != null) {
      return panelLuminance;
    }
    return currentThemeName === "light" ? 245 : 24;
  }

  function parseLuminanceFromCssColor(cssColor) {
    try {
      const match = String(cssColor || "").match(/rgba?\(([^)]+)\)/i);
      if (!match) {
        return null;
      }
      const parts = match[1].split(",").map((item) => Number.parseFloat(item.trim()));
      if (parts.length < 3 || parts.some((item, index) => index < 3 && Number.isNaN(item))) {
        return null;
      }

      const r = parts[0];
      const g = parts[1];
      const b = parts[2];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    } catch {
      return null;
    }
  }

  function detectIconLuminanceByCanvas(imgEl) {
    try {
      const canvas = document.createElement("canvas");
      const size = 16;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        return false;
      }

      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(imgEl, 0, 0, size, size);

      const { data } = ctx.getImageData(0, 0, size, size);
      let total = 0;
      let count = 0;

      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 16) {
          continue;
        }
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        total += luminance;
        count += 1;
      }

      if (count === 0) {
        return null;
      }

      return total / count;
    } catch {
      return null;
    }
  }

  function loadLinksCache() {
    try {
      const raw = sessionStorage.getItem(LINKS_CACHE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return normalizeLinks(Array.isArray(parsed) ? parsed : []);
    } catch {
      return [];
    }
  }

  function saveLinksCache(list) {
    try {
      sessionStorage.setItem(LINKS_CACHE_KEY, JSON.stringify(list));
    } catch {
      // Ignore quota and serialization errors.
    }
  }

  function normalizeLinks(raw) {
    return raw
      .filter((item) => item && typeof item.url === "string")
      .map((item) => ({
        title: String(item.title || item.url || ""),
        url: String(item.url || ""),
        faviconUrl: String(item.faviconUrl || "")
      }))
      .filter((item) => /^https?:\/\//.test(item.url));
  }

  function buildFaviconCandidates(link) {
    const candidates = [];
    if (link.faviconUrl) {
      candidates.push(link.faviconUrl);
    }

    try {
      const extBase = chrome.runtime.getURL("/_favicon/");
      const extQuery = new URLSearchParams({ pageUrl: link.url, size: "64" });
      candidates.push(`${extBase}?${extQuery.toString()}`);

      const s2Query = new URLSearchParams({ domain_url: link.url, sz: "64" });
      candidates.push(`https://www.google.com/s2/favicons?${s2Query.toString()}`);
    } catch {
      // Ignore malformed URL.
    }

    candidates.push(DEFAULT_ICON);
    return [...new Set(candidates)];
  }

  async function pinCurrentPage() {
    const ownerTab = await sendMessageAsync({ type: "miniweb-overlay-get-owner-tab" }).catch(() => null);
    const ownerUrl = String(ownerTab?.url || "");
    const ownerTitle = String(ownerTab?.title || ownerUrl || "");

    const url = /^https?:\/\//.test(ownerUrl)
      ? ownerUrl
      : String(window.location.href || "");
    const title = /^https?:\/\//.test(ownerUrl)
      ? ownerTitle
      : String(document.title || url);

    if (!/^https?:\/\//.test(url)) {
      return;
    }

    await sendMessageAsync({
      type: "miniweb-overlay-pin-current",
      url,
      title
    }).catch(() => null);

    await reloadLinks(iconWrap, { useCache: false });
    const newBtn = Array.from(iconWrap.querySelectorAll("[data-miniweb-link-btn]")).find(b => b._miniwebUrl === url);
    if (newBtn) {
      manualPagingLocked = true;
      lockedScrollLeft = newBtn.offsetLeft;
      iconWrap.scrollLeft = newBtn.offsetLeft;
      updateScrollButtons();
    }
    void openPopupByUrl(url);
  }

  async function deleteCurrentPage() {
    const url = String(window.location.href || "");
    if (!/^https?:\/\//.test(url)) {
      return;
    }

    await sendMessageAsync({
      type: "miniweb-overlay-delete-current",
      url
    }).catch(() => null);

    await reloadLinks(iconWrap, { useCache: false });
    if (links.length > 0) {
      void openPopupByUrl(links[0].url);
    }
  }

  async function deleteLinkByUrl(url) {
    const targetUrl = String(url || "");
    if (!/^https?:\/\//.test(targetUrl)) {
      return;
    }

    await sendMessageAsync({
      type: "miniweb-overlay-delete-current",
      url: targetUrl
    }).catch(() => null);

    await reloadLinks(iconWrap, { useCache: false });
    if (links.length > 0) {
      void openPopupByUrl(links[0].url);
    }
  }

  async function openPopupByUrl(url) {
    if (!/^https?:\/\//.test(String(url || ""))) {
      return;
    }

    const result = await sendMessageAsync({ type: "miniweb-action-open-popup-target", url }).catch(() => null);
    if (!result?.ok && window.top === window) {
      window.location.assign(url);
    }
  }

  async function openBrowserTabByUrl(url) {
    if (!/^https?:\/\//.test(String(url || ""))) {
      return;
    }
    await sendMessageAsync({ type: "miniweb-action-open-browser-tab-target", url }).catch(() => null);
  }

  async function openPipByUrl(url) {
    const targetUrl = String(url || "");
    if (!/^https?:\/\//.test(targetUrl)) {
      return;
    }

    try {
      const placementResp = await sendMessageAsync({ type: "miniweb-get-current-popup-placement" }).catch(() => null);
      const placement = placementResp?.ok
        ? {
          left: Math.round(Number(placementResp?.placement?.left || 0)),
          top: Math.round(Number(placementResp?.placement?.top || 0)),
          width: Math.round(Number(placementResp?.placement?.width || 0)),
          height: Math.round(Number(placementResp?.placement?.height || 0))
        }
        : {
          left: Math.round(Number(window.screenX || 0)),
          top: Math.round(Number(window.screenY || 0)),
          width: 0,
          height: 0
        };

      window.dispatchEvent(new CustomEvent("miniweb-open-pip-request", {
        detail: { targetUrl, placement }
      }));
    } catch {
      // Keep behavior graceful if PiP bridge is unavailable.
    }
  }

  function isLinkSelected(linkUrl, currentUrl) {
    try {
      const link = new URL(linkUrl);
      const current = new URL(currentUrl);
      return link.origin === current.origin && link.pathname === current.pathname;
    } catch {
      return false;
    }
  }

  function sendMessageAsync(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  async function canInjectInCurrentWindow() {
    if (window.opener && window.opener !== window) {
      return { allowed: false, mode: "none" };
    }

    try {
      const res = await sendMessageAsync({ type: "miniweb-side-dot-allowed" });
      return {
        allowed: Boolean(res?.allowed === true),
        mode: String(res?.mode || "none")
      };
    } catch {
      return { allowed: false, mode: "none" };
    }
  }

})();
