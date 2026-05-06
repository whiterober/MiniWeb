/**
 * pip-trigger.js - Content Script for MiniWeb
 * Handles Document PiP launch from current page context.
 * Requires user activation to work (inherent browser security).
 */

const ENABLE_PIP_DEBUG_LOG = false;

function pipDebug(...args) {
  if (ENABLE_PIP_DEBUG_LOG) {
    console.log(...args);
  }
}

pipDebug("[MiniWeb][CS] pip-trigger.js loaded", { href: window.location.href });
pipDebug("[MiniWeb][CS] pip-trigger detail", `href=${window.location.href}`);

let activePipWindow = null;

function getCurrentThemeName() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "dark";
  }
}

window.addEventListener("miniweb-open-pip-request", (event) => {
  const targetUrl = String(event?.detail?.targetUrl || "");
  const placement = event?.detail?.placement;
  if (!isPinableUrl(targetUrl)) {
    return;
  }

  void openPipLauncher(targetUrl, placement).catch((error) => {
    console.error("[MiniWeb][PiP] open from page event failed", error);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  pipDebug("[MiniWeb][CS] onMessage received", { type: message?.type, targetUrl: message?.targetUrl });
  pipDebug("[MiniWeb][CS] onMessage detail", `type=${String(message?.type)} targetUrl=${String(message?.targetUrl || "")}`);
  if (message.type === "miniweb-open-pip") {
    void openPipLauncher(message.targetUrl, message.placement).then(() => {
      sendResponse({ ok: true });
    }).catch((error) => {
      console.error("[MiniWeb][PiP] openPipLauncher failed", error);
      sendResponse({ ok: false, error: String(error?.message || error) });
    });
    return true; // Keep the channel open for async response
  }
});

async function openPipLauncher(targetUrl, placement) {
  pipDebug("[MiniWeb][CS][PiP] openPipLauncher start", { targetUrl, hasApi: "documentPictureInPicture" in window });
  pipDebug("[MiniWeb][CS][PiP] openPipLauncher detail", `targetUrl=${String(targetUrl || "")} hasApi=${String("documentPictureInPicture" in window)}`);

  if (!("documentPictureInPicture" in window)) {
    console.error("[MiniWeb][CS][PiP] Document PiP not supported");
    throw new Error("Document PiP not supported");
  }

  // Reuse existing PiP if already open
  if (activePipWindow && !activePipWindow.closed) {
    pipDebug("[MiniWeb][CS][PiP] reuse existing pip window", {
      targetUrl,
      href: window.location.href
    });
    pipDebug("[MiniWeb][CS][PiP] reuse detail", `targetUrl=${String(targetUrl || "")} href=${window.location.href}`);
    activePipWindow.focus();
    return;
  }

  // Request PiP window
  pipDebug("[MiniWeb][CS][PiP] calling requestWindow...");
  pipDebug("[MiniWeb][CS][PiP] userActivation snapshot", {
    isActive: Boolean(navigator.userActivation?.isActive),
    hasBeenActive: Boolean(navigator.userActivation?.hasBeenActive)
  });
  pipDebug("[MiniWeb][CS][PiP] userActivation detail", `isActive=${String(Boolean(navigator.userActivation?.isActive))} hasBeenActive=${String(Boolean(navigator.userActivation?.hasBeenActive))}`);
  // Use popup's viewport dimensions (innerWidth/Height) so requestWindow gets viewport size.
  // chrome.windows.create({height}) is outer size (includes title bar); requestWindow({height}) is
  // viewport size. Using innerWidth/Height ensures the PiP content area matches the popup content area.
  const pipWidth = (Number.isFinite(window.innerWidth) && window.innerWidth > 0)
    ? Math.round(window.innerWidth)
    : 420;
  const pipHeight = (Number.isFinite(window.innerHeight) && window.innerHeight > 0)
    ? Math.round(window.innerHeight)
    : 900;
  const pipWindow = await documentPictureInPicture.requestWindow({
    width: pipWidth,
    height: pipHeight
  }).catch((err) => {
    console.error("[MiniWeb][CS][PiP] requestWindow error", {
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
      targetUrl,
      activation: {
        isActive: Boolean(navigator.userActivation?.isActive),
        hasBeenActive: Boolean(navigator.userActivation?.hasBeenActive)
      }
    });
    throw err;
  });

  pipDebug("[MiniWeb][CS][PiP] requestWindow success");
  activePipWindow = pipWindow;

  // Set up PiP document
  pipDebug("[MiniWeb][CS][PiP] setting up pipDoc...");
  const pipDoc = pipWindow.document;
  pipDoc.title = "MiniWeb Launcher";

  // Pre-load pinned links from chrome.storage for PiP window
  pipDebug("[MiniWeb][CS][PiP] loading pinned links from storage...");
  let pinnedLinks = [];
  try {
    const result = await chrome.storage.local.get("pinnedLinks");
    pinnedLinks = Array.isArray(result.pinnedLinks) ? result.pinnedLinks : [];
    pipDebug("[MiniWeb][CS][PiP] loaded", pinnedLinks.length, "pinned links");
  } catch (err) {
    pipDebug("[MiniWeb][CS][PiP] failed to load pinned links", err);
  }

  const debugPlacement = snapshotPipPlacement(pipWindow);
  if (debugPlacement) {
    pipDebug("[MiniWeb][CS][PiP] placement snapshot", debugPlacement);
  }

  // Load and inject launcher HTML
  pipDebug("[MiniWeb][CS][PiP] loading launcher HTML...");
  const launcherHtml = await loadLauncherHtml().catch((err) => {
    console.error("[MiniWeb][CS][PiP] loadLauncherHtml error", err);
    throw err;
  });
  pipDebug("[MiniWeb][CS][PiP] HTML loaded, injecting...");
  pipDoc.documentElement.innerHTML = launcherHtml;

  // Inject launcher CSS
  pipDebug("[MiniWeb][CS][PiP] loading launcher CSS...");
  const launcherCss = await loadLauncherCss().catch((err) => {
    console.error("[MiniWeb][CS][PiP] loadLauncherCss error", err);
    throw err;
  });
  const styleTag = pipDoc.createElement("style");
  styleTag.textContent = launcherCss;
  pipDoc.head.appendChild(styleTag);

  const pipHideTopStripStyle = pipDoc.createElement("style");
  pipHideTopStripStyle.textContent = `
    .top-strip { display: none !important; }
    .app-shell { grid-template-rows: 1fr !important; }
  `;
  pipDoc.head.appendChild(pipHideTopStripStyle);
  pipDebug("[MiniWeb][CS][PiP] CSS injected");

  // Sync system color-scheme to PiP document via data-theme attribute.
  // @media (prefers-color-scheme: dark) is unreliable in Document PiP windows;
  // we read the opener window's matchMedia instead and keep the two in sync.
  const pipThemeMq = window.matchMedia("(prefers-color-scheme: dark)");
  function applyThemeToPipDoc(isDark) {
    const themeName = isDark ? "dark" : "light";
    pipDoc.documentElement.dataset.theme = themeName;
    pipDoc.documentElement.style.colorScheme = themeName;
  }
  applyThemeToPipDoc(pipThemeMq.matches);
  function onThemeChange(e) {
    applyThemeToPipDoc(e.matches);
    pipDoc.dispatchEvent(new CustomEvent("miniweb-theme-sync", {
      detail: {
        themeName: e.matches ? "dark" : "light"
      }
    }));
  }
  pipThemeMq.addEventListener("change", onThemeChange);
  pipWindow.addEventListener("pagehide", () => {
    pipThemeMq.removeEventListener("change", onThemeChange);
  }, { once: true });

  // Inject bootstrap data as DOM JSON node for launcher.js.
  // This is readable from page world without relying on shared window objects.
  const bootstrapPayload = {
    initialTargetUrl: targetUrl || "https://www.google.com/",
    pinnedLinks,
    pipDebugPlacement: debugPlacement,
    currentThemeName: getCurrentThemeName()
  };
  const bootstrapNode = pipDoc.createElement("script");
  bootstrapNode.id = "miniweb-bootstrap-data";
  bootstrapNode.type = "application/json";
  bootstrapNode.textContent = safeJsonForInlineScript(bootstrapPayload);
  pipDoc.head.appendChild(bootstrapNode);

  // Keep mirrored values for content-script world logic.
  pipWindow.initialTargetUrl = bootstrapPayload.initialTargetUrl;
  pipWindow.isPipContext = true;
  pipWindow.pinnedLinks = pinnedLinks;
  // Bridge page-world launcher.js and content-script world via DOM CustomEvent.
  // Avoids isolated-world object visibility issues.
  pipDoc.addEventListener("miniweb-pin-current-request", (event) => {
    const detail = event?.detail || {};
    const requestId = String(detail.requestId || "");
    const url = String(detail.url || "");
    const title = String(detail.title || "");

    void handlePinCurrentRequest({ pipWindow, pipDoc, requestId, url, title });
  });

  pipDoc.addEventListener("miniweb-sync-links-request", (event) => {
    const detail = event?.detail || {};
    const requestId = String(detail.requestId || "");
    void handleSyncLinksRequest({ pipDoc, requestId });
  });

  pipDoc.addEventListener("miniweb-ensure-rules-request", (event) => {
    const detail = event?.detail || {};
    const requestId = String(detail.requestId || "");
    const url = String(detail.url || "");
    void handleEnsureRulesRequest({ pipDoc, requestId, url });
  });

  pipDoc.addEventListener("miniweb-sync-site-cookies-request", (event) => {
    const detail = event?.detail || {};
    const requestId = String(detail.requestId || "");
    const url = String(detail.url || "");
    void handleSyncSiteCookiesRequest({ pipDoc, requestId, url });
  });

  pipDoc.addEventListener("miniweb-should-double-open-request", (event) => {
    const detail = event?.detail || {};
    const requestId = String(detail.requestId || "");
    const url = String(detail.url || "");
    void handleShouldDoubleOpenRequest({ pipDoc, requestId, url });
  });

  pipDoc.addEventListener("miniweb-get-blocked-retry-policy-request", (event) => {
    const detail = event?.detail || {};
    const requestId = String(detail.requestId || "");
    const url = String(detail.url || "");
    void handleGetBlockedRetryPolicyRequest({ pipDoc, requestId, url });
  });

  pipDoc.addEventListener("miniweb-delete-link-request", (event) => {
    const detail = event?.detail || {};
    const requestId = String(detail.requestId || "");
    const linkId = String(detail.linkId || "");
    const url = String(detail.url || "");
    void handleDeleteLinkRequest({ pipWindow, pipDoc, requestId, linkId, url });
  });

  // Load launcher.js as module script
  // Since launcher.js has module-level code that auto-initializes,
  // we need to dynamically import it from the extension resource
  pipDebug("[MiniWeb][CS][PiP] injecting launcher.js script...");
  const launcherUrl = chrome.runtime.getURL("launcher/launcher.js");
  pipDebug("[MiniWeb][CS][PiP] launcher URL:", launcherUrl);
  const scriptTag = pipDoc.createElement("script");
  scriptTag.type = "module";
  scriptTag.src = launcherUrl;
  pipDoc.body.appendChild(scriptTag);
  pipDebug("[MiniWeb][CS][PiP] launcher.js script tag appended");

  // Handle PiP close
  pipWindow.addEventListener("pagehide", () => {
    pipDebug("[MiniWeb][CS][PiP] pipWindow closed");
    activePipWindow = null;
    void chrome.runtime.sendMessage({ type: "miniweb-pip-window-closed" }).catch(() => {
      // Ignore runtime messaging failures on teardown.
    });
  });

  void chrome.runtime.sendMessage({
    type: "miniweb-pip-opened-from-popup",
    targetUrl: String(targetUrl || ""),
    debugPlacement,
    popupScreenPos: {
      x: Math.round(Number(window.screenX ?? window.screenLeft ?? 0)),
      y: Math.round(Number(window.screenY ?? window.screenTop ?? 0))
    }
  }).catch(() => {
    // Ignore message errors in non-popup contexts.
  });

  pipDebug("[MiniWeb][CS][PiP] openPipLauncher complete", {
    targetUrl,
    pinnedCount: pinnedLinks.length
  });
  pipDebug("[MiniWeb][CS][PiP] openPipLauncher complete detail", `targetUrl=${String(targetUrl || "")} pinnedCount=${String(pinnedLinks.length)}`);
}

function snapshotPipPlacement(pipWindow) {
  try {
    const left = Number(pipWindow?.screenX ?? pipWindow?.screenLeft ?? NaN);
    const top = Number(pipWindow?.screenY ?? pipWindow?.screenTop ?? NaN);
    const width = Number(pipWindow?.outerWidth ?? NaN);
    const height = Number(pipWindow?.outerHeight ?? NaN);
    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)) {
      return null;
    }
    return {
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(width),
      height: Math.round(height),
      capturedAt: Date.now()
    };
  } catch {
    return null;
  }
}

async function loadLauncherHtml() {
  const url = chrome.runtime.getURL("launcher/launcher.html");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load launcher.html: ${response.statusText}`);
  }

  const html = await response.text();

  // Extract body content only (skip doctype, html, head tags from original)
  // Find the body section and extract its content
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Remove original script tags to avoid early execution before bootstrap is ready.
  for (const script of doc.querySelectorAll("script")) {
    script.remove();
  }

  // Reconstruct a minimal but complete HTML document
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MiniWeb Launcher</title>
  </head>
  <body>
    ${doc.body.innerHTML}
  </body>
</html>`;
}

async function loadLauncherCss() {
  const url = chrome.runtime.getURL("launcher/launcher.css");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load launcher.css: ${response.statusText}`);
  }

  return response.text();
}

function isPinableUrl(url) {
  if (!url) {
    return false;
  }
  return /^https?:\/\//.test(String(url));
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

function safeJsonForInlineScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

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

async function handlePinCurrentRequest({ pipWindow, pipDoc, requestId, url, title }) {
  const respond = (payload) => {
    pipDoc.dispatchEvent(
      new CustomEvent("miniweb-pin-current-response", {
        detail: {
          requestId,
          ...payload
        }
      })
    );
  };

  try {
    if (!isPinableUrl(url)) {
      respond({ ok: false, error: t("pipCurrentUrlNotPinable", undefined, "当前页面 URL 不可固定") });
      return;
    }

    const normalizedUrl = String(url);
    const record = {
      id: buildLinkId(normalizedUrl),
      title: String(title || normalizedUrl).trim().slice(0, 180),
      url: normalizedUrl,
      faviconUrl: buildFaviconUrl(normalizedUrl),
      createdAt: Date.now()
    };

    const current = await chrome.storage.local.get("pinnedLinks");
    const links = Array.isArray(current.pinnedLinks) ? current.pinnedLinks : [];
    const withoutSame = links.filter((item) => item && item.url !== record.url);
    withoutSame.unshift(record);
    await chrome.storage.local.set({ pinnedLinks: withoutSame });

    pipWindow.pinnedLinks = withoutSame;

    try {
      await chrome.runtime.sendMessage({
        type: "miniweb-ensure-embed-rules",
        url: normalizedUrl
      });
    } catch (error) {
      pipDebug("[MiniWeb][CS][PiP] ensure rules after pin failed", error);
    }

    respond({ ok: true, links: withoutSame });
  } catch (error) {
    respond({ ok: false, error: String(error?.message || error) });
  }
}

async function handleSyncLinksRequest({ pipDoc, requestId }) {
  const respond = (payload) => {
    pipDoc.dispatchEvent(
      new CustomEvent("miniweb-sync-links-response", {
        detail: {
          requestId,
          ...payload
        }
      })
    );
  };

  try {
    const current = await chrome.storage.local.get("pinnedLinks");
    const links = Array.isArray(current.pinnedLinks) ? current.pinnedLinks : [];
    respond({ ok: true, links });
  } catch (error) {
    respond({ ok: false, error: String(error?.message || error) });
  }
}

async function handleEnsureRulesRequest({ pipDoc, requestId, url }) {
  const respond = (payload) => {
    pipDoc.dispatchEvent(
      new CustomEvent("miniweb-ensure-rules-response", {
        detail: {
          requestId,
          ...payload
        }
      })
    );
  };

  try {
    const result = await chrome.runtime.sendMessage({
      type: "miniweb-ensure-embed-rules",
      url
    });
    if (result?.ok === true) {
      respond({ ok: true });
      return;
    }
    respond({ ok: false, error: String(result?.error || "ensure rules failed") });
  } catch (error) {
    respond({ ok: false, error: String(error?.message || error) });
  }
}

async function handleSyncSiteCookiesRequest({ pipDoc, requestId, url }) {
  const respond = (payload) => {
    pipDoc.dispatchEvent(
      new CustomEvent("miniweb-sync-site-cookies-response", {
        detail: {
          requestId,
          ...payload
        }
      })
    );
  };

  try {
    const topLevelSite = String(window.location.origin || "");
    const result = await chrome.runtime.sendMessage({
      type: "miniweb-sync-site-cookies",
      url,
      topLevelSite
    });

    if (result?.ok === true) {
      respond(result);
      return;
    }

    respond({ ok: false, error: String(result?.error || "cookie sync failed") });
  } catch (error) {
    respond({ ok: false, error: String(error?.message || error) });
  }
}

async function handleShouldDoubleOpenRequest({ pipDoc, requestId, url }) {
  const respond = (payload) => {
    pipDoc.dispatchEvent(
      new CustomEvent("miniweb-should-double-open-response", {
        detail: {
          requestId,
          ...payload
        }
      })
    );
  };

  try {
    const result = await chrome.runtime.sendMessage({
      type: "miniweb-should-double-open-url",
      url
    });

    if (result?.ok === true) {
      respond(result);
      return;
    }

    respond({ ok: false, error: String(result?.error || "double open check failed"), shouldDoubleOpen: false });
  } catch (error) {
    respond({ ok: false, error: String(error?.message || error), shouldDoubleOpen: false });
  }
}

async function handleGetBlockedRetryPolicyRequest({ pipDoc, requestId, url }) {
  const respond = (payload) => {
    pipDoc.dispatchEvent(
      new CustomEvent("miniweb-get-blocked-retry-policy-response", {
        detail: {
          requestId,
          ...payload
        }
      })
    );
  };

  try {
    const result = await chrome.runtime.sendMessage({
      type: "miniweb-get-blocked-retry-policy",
      url
    });

    if (result?.ok === true) {
      respond(result);
      return;
    }

    respond({ ok: false, blockedRetryDelayMs: 260, error: String(result?.error || "blocked retry policy failed") });
  } catch (error) {
    respond({ ok: false, blockedRetryDelayMs: 260, error: String(error?.message || error) });
  }
}

async function handleDeleteLinkRequest({ pipWindow, pipDoc, requestId, linkId, url }) {
  const respond = (payload) => {
    pipDoc.dispatchEvent(
      new CustomEvent("miniweb-delete-link-response", {
        detail: {
          requestId,
          ...payload
        }
      })
    );
  };

  try {
    const current = await chrome.storage.local.get("pinnedLinks");
    const links = Array.isArray(current.pinnedLinks) ? current.pinnedLinks : [];
    const next = links.filter((item) => {
      if (!item) {
        return false;
      }
      if (linkId && String(item.id) === linkId) {
        return false;
      }
      if (url && String(item.url) === url) {
        return false;
      }
      return true;
    });

    await chrome.storage.local.set({ pinnedLinks: next });
    pipWindow.pinnedLinks = next;
    respond({ ok: true, links: next });
  } catch (error) {
    respond({ ok: false, error: String(error?.message || error) });
  }
}
