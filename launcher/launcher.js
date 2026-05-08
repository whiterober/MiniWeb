const STORAGE_KEY = "pinnedLinks";
const DEFAULT_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23e2e8f0'/%3E%3Cpath d='M18 22h28v20H18z' fill='%2394a3b8'/%3E%3Ccircle cx='26' cy='30' r='3' fill='%23e2e8f0'/%3E%3C/svg%3E";

const iconBar = document.getElementById("iconBar");
const emptyState = document.getElementById("emptyState");
const statusCard = document.getElementById("statusCard");
const frame = document.getElementById("contentFrame");
const iconTemplate = document.getElementById("iconItemTemplate");
const pinCurrentButton = document.getElementById("pinCurrentButton");
const deleteCurrentButton = document.getElementById("deleteCurrentButton");
const appShell = document.querySelector(".app-shell");
const DEFAULT_TARGET_URL = "https://www.google.com/";
const BRIDGE_TIMEOUT_MS = 1500;
const ENABLE_VERBOSE_PIP_LOG = false;

const SYNC_PREF_KEY = "syncEnabledV1";
let _syncEnabled = true;
void chrome.storage.local.get(SYNC_PREF_KEY).then((r) => {
  if (SYNC_PREF_KEY in r) { _syncEnabled = r[SYNC_PREF_KEY] !== false; }
}).catch(() => {});
function dataStorage() {
  return _syncEnabled ? chrome.storage.sync : chrome.storage.local;
}

let links = [];
let activeLinkId = "";
let initialTargetUrl = DEFAULT_TARGET_URL;
let launchMode = "";
const linkNavStates = new Map();
let lastRequestedUrl = DEFAULT_TARGET_URL;
let hasExplicitInitialTarget = false;
const autoExternalOpenedUrls = new Set();
const blockedRetryCountByUrl = new Map();

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

function applyStaticI18n() {
  document.title = t("launcherTitle", undefined, "MiniWeb 启动器");

  iconBar?.setAttribute("aria-label", t("launcherIconBarAria", undefined, "固定链接图标栏"));
  deleteCurrentButton?.setAttribute("aria-label", t("launcherDeleteCurrentAria", undefined, "删除当前图标"));
  deleteCurrentButton?.setAttribute("title", t("launcherDeleteCurrentAria", undefined, "删除当前图标"));
  pinCurrentButton?.setAttribute("aria-label", t("launcherPinCurrentAria", undefined, "当前页加入 MiniWeb"));
  pinCurrentButton?.setAttribute("title", t("launcherPinCurrentAria", undefined, "当前页加入 MiniWeb"));
  frame?.setAttribute("title", t("launcherIframeTitle", undefined, "页面内容区"));

  const emptyTitle = document.querySelector("#emptyState h2");
  const emptyDesc = document.querySelector("#emptyState p");
  if (emptyTitle) {
    emptyTitle.textContent = t("launcherEmptyTitle", undefined, "还没有固定链接");
  }
  if (emptyDesc) {
    emptyDesc.textContent = t("launcherEmptyDesc", undefined, "点击右上角“当前页加入 MiniWeb”即可把当前页面加入图标栏。");
  }
}

function normalizeThemeName(value) {
  return value === "light" ? "light" : "dark";
}

function applyLauncherTheme(themeName, reason = "unknown") {
  const normalizedTheme = normalizeThemeName(themeName);
  document.documentElement.dataset.theme = normalizedTheme;
  document.documentElement.style.colorScheme = normalizedTheme;
  logPip("theme applied", `theme=${normalizedTheme} reason=${reason}`);
}

function logPip(message, extra = undefined) {
  if (!ENABLE_VERBOSE_PIP_LOG) {
    return;
  }
  const prefix = `[MiniWeb][PiP][${new Date().toISOString()}]`;
  if (extra === undefined) {
    console.log(prefix, message);
    return;
  }
  console.log(prefix, message, extra);
}

initialize().catch((error) => {
  showStatus(t("launcherInitFailed", [String(error?.message || error)], `初始化失败: ${String(error?.message || error)}`), true);
});

async function initialize() {
  applyStaticI18n();
  const bootstrap = readBootstrapPayload();

  applyLauncherTheme(bootstrap.currentThemeName || "dark", "bootstrap");

  bindEvents();

  if (Array.isArray(bootstrap.pinnedLinks) && bootstrap.pinnedLinks.length > 0) {
    links = normalizeLinks(bootstrap.pinnedLinks);
  }

  const params = new URLSearchParams(window.location.search);
  launchMode = params.get("launchMode") || "";

  const requestedTarget = String(params.get("target") || bootstrap.initialTargetUrl || "");
  hasExplicitInitialTarget = /^https?:\/\//.test(requestedTarget);
  initialTargetUrl = resolveInitialTarget(requestedTarget);

  await loadLinks();

  const bootstrapPlacement = bootstrap.pipDebugPlacement;
  const bootstrapPlacementText = bootstrapPlacement
    ? `left=${bootstrapPlacement.left} top=${bootstrapPlacement.top} width=${bootstrapPlacement.width} height=${bootstrapPlacement.height} capturedAt=${bootstrapPlacement.capturedAt}`
    : "null";
  const windowPlacementText = `left=${Math.round(Number(window.screenX || window.screenLeft || 0))} top=${Math.round(Number(window.screenY || window.screenTop || 0))} width=${Math.round(Number(window.outerWidth || 0))} height=${Math.round(Number(window.outerHeight || 0))}`;
  logPip("initialize detail", `href=${window.location.href} target=${initialTargetUrl} hasExplicitInitialTarget=${String(hasExplicitInitialTarget)} bootstrapPinnedCount=${String(Array.isArray(bootstrap.pinnedLinks) ? bootstrap.pinnedLinks.length : 0)} bootstrapPipPlacement={${bootstrapPlacementText}} windowPlacement={${windowPlacementText}}`);

  if (!activeLinkId && links.length > 0) {
    const matched = links.find((item) => item.url === initialTargetUrl);
    activeLinkId = matched?.id || links[0]?.id || "";
  }

  if (!hasExplicitInitialTarget && links.length === 0) {
    renderLinks();
    showStatus("", false);
    return;
  }

  await setViewerUrl(initialTargetUrl, false);

  showStatus("", false);
}

function bindEvents() {
  document.addEventListener("miniweb-theme-sync", (event) => {
    const themeName = String(event?.detail?.themeName || "dark");
    applyLauncherTheme(themeName, "theme-sync-event");
  });

  pinCurrentButton?.addEventListener("click", () => {
    void pinCurrentPageIntoLauncher();
  });

  deleteCurrentButton?.addEventListener("click", () => {
    void deleteCurrentLink();
  });

  // Listen for storage-access results from the content iframe.
  window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "miniweb-storage-access-result") {
      return;
    }
    const { ok, error } = event.data;
    if (ok) {
      logPip("storage access granted for iframe");
    } else {
      logPip(`storage access denied for iframe: ${String(error ?? "unknown")}`);
    }
  });

  window.addEventListener("beforeunload", () => {
    logPip("beforeunload fired", { href: window.location.href });
  });

  window.addEventListener("pagehide", (event) => {
    logPip("pagehide fired", { persisted: Boolean(event.persisted), href: window.location.href });
  });

  document.addEventListener("visibilitychange", () => {
    logPip("visibilitychange", { state: document.visibilityState, href: window.location.href });
  });

  // Listen to chrome.storage events
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.onChanged.addListener((changes, area) => {
    if ((area !== "local" && area !== "sync") || !changes[STORAGE_KEY]) {
      if (area === "local" && SYNC_PREF_KEY in changes) {
        _syncEnabled = changes[SYNC_PREF_KEY].newValue !== false;
      }
      return;
    }

    const next = Array.isArray(changes[STORAGE_KEY].newValue)
      ? changes[STORAGE_KEY].newValue
      : [];
    links = normalizeLinks(next);
    renderLinks();
    });
  }

  frame.addEventListener("load", () => {
    const requestedUrl = resolveInitialTarget(lastRequestedUrl || frame.src || initialTargetUrl);
    try {
      const nextHref = frame.contentWindow?.location?.href;
      logPip("frame load detail", `requested=${requestedUrl} nextHref=${String(nextHref)} frameSrc=${String(frame.src)} activeLinkId=${String(activeLinkId || "")}`);
      if (typeof nextHref === "string" && nextHref.startsWith("chrome-error://")) {
        logPip("frame load detected chrome-error detail", `requested=${requestedUrl} nextHref=${nextHref}`);
        const retryCount = Number(blockedRetryCountByUrl.get(requestedUrl) || 0);
        if (retryCount < 1) {
          blockedRetryCountByUrl.set(requestedUrl, retryCount + 1);
          void retryBlockedViewerLoad(requestedUrl);
          return;
        }
        logPip("pip blocked retry failed", `requested=${requestedUrl} retryCount=${String(retryCount)}`);
        showStatus(buildOpenFailureHint(requestedUrl), true, requestedUrl);
        return;
      }
      if (typeof nextHref === "string" && /^https?:\/\//.test(nextHref)) {
        blockedRetryCountByUrl.delete(requestedUrl);
      }
    } catch (error) {
      // Cross-origin pages may block location access; keep last known URL.
      logPip("frame load read href failed", String(error?.message || error));
      blockedRetryCountByUrl.delete(requestedUrl);
    }

    const activeState = getActiveNavState();
    if (activeState) {
      try {
        const nextHref = frame.contentWindow?.location?.href;
        if (typeof nextHref === "string" && /^https?:\/\//.test(nextHref)) {
          activeState.currentUrl = nextHref;
        }
      } catch {
        // Cross-origin pages may block location access; keep last known URL.
      }
      updateNavButtons();
    }

    if (!activeLinkId) {
      return;
    }

    showStatus("", false);

    // Trigger a Storage Access request in the iframe (best-effort).
    // The helper script (storage-access-helper.js) running inside the iframe
    // will attempt requestStorageAccess() so login state can be shared with
    // the popup window that originally loaded the same site.
    void triggerIframeStorageAccess();
  });

  frame.addEventListener("error", () => {
    const state = getActiveNavState();
    const failingUrl = resolveInitialTarget(lastRequestedUrl || frame.src || state?.currentUrl || initialTargetUrl);
    logPip("frame error detail", `failing=${failingUrl} frameSrc=${String(frame.src)} activeLinkId=${String(activeLinkId || "")}`);
    showStatus(buildOpenFailureHint(failingUrl), true, failingUrl);
  });
}

async function loadLinks() {
  if (
    typeof chrome === "undefined" ||
    !chrome.storage ||
    !chrome.storage.sync ||
    typeof chrome.storage.sync.get !== "function"
  ) {
    logPip("loadLinks: chrome.storage.sync unavailable");
    if (links.length === 0) {
      const synced = await syncLinksFromBridge();
      if (synced.length > 0) {
        links = synced;
      }
    }
    renderLinks();
    return;
  }

  const result = await dataStorage().get(STORAGE_KEY);
  const raw = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  links = normalizeLinks(raw);
  renderLinks();
}

async function pinCurrentPageIntoLauncher() {
  const currentUrl = resolveInitialTarget(frame.src || initialTargetUrl);
  if (!/^https?:\/\//.test(currentUrl)) {
    showStatus(t("launcherCurrentUrlNotPinable", undefined, "当前页面 URL 不可固定。"), true);
    return;
  }

  try {
    const activeTitle = links.find((item) => item.id === activeLinkId)?.title || currentUrl;
    const result = await chrome.runtime.sendMessage({
      type: "miniweb-overlay-pin-current",
      url: currentUrl,
      title: activeTitle
    });

    if (!result?.ok) {
      showStatus(t("launcherPinFailed", [String(result?.error || "未知错误")], `加入失败: ${String(result?.error || "未知错误")}`), true);
      return;
    }

    const next = Array.isArray(result.links) ? result.links : [];
    links = normalizeLinks(next);
    const matched = links.find((item) => item.url === currentUrl);
    activeLinkId = matched?.id || activeLinkId;
    renderLinks();
    showStatus(t("launcherPinned", undefined, "当前页已加入 MiniWeb。"), false);
  } catch (error) {
    showStatus(t("launcherPinFailed", [String(error?.message || error)], `加入失败: ${String(error?.message || error)}`), true);
  }
}

async function deleteCurrentLink() {
  if (!activeLinkId) {
    showStatus(t("launcherSelectFirst", undefined, "请先选择一个图标。"), true);
    return;
  }

  const link = links.find((item) => item.id === activeLinkId);
  if (!link) {
    showStatus(t("launcherCurrentMissing", undefined, "当前图标不存在或已删除。"), true);
    return;
  }

  try {
    const result = await chrome.runtime.sendMessage({
      type: "miniweb-overlay-delete-current",
      url: link.url
    });

    if (!result?.ok) {
      showStatus(t("launcherDeleteFailed", [String(result?.error || "未知错误")], `删除失败: ${String(result?.error || "未知错误")}`), true);
      return;
    }

    const next = Array.isArray(result.links) ? result.links : [];
    links = normalizeLinks(next);
    linkNavStates.delete(link.id);

    if (!links.length) {
      activeLinkId = "";
      renderLinks();
      showStatus(t("launcherDeleted", undefined, "已删除当前图标。"), false);
      return;
    }

    const nextActive = links[0];
    activeLinkId = nextActive.id;
    const state = ensureLinkNavState(nextActive);
    renderLinks();
    await setViewerUrl(state.currentUrl, false);
    showStatus(t("launcherDeleted", undefined, "已删除当前图标。"), false);
  } catch (error) {
    showStatus(t("launcherDeleteFailed", [String(error?.message || error)], `删除失败: ${String(error?.message || error)}`), true);
  }
}

function normalizeLinks(raw) {
  return raw
    .filter((item) => item && typeof item.url === "string")
    .map((item) => ({
      id: String(item.id || hash(item.url)),
      title: String(item.title || item.url),
      url: String(item.url),
      faviconUrl: String(item.faviconUrl || DEFAULT_ICON),
      createdAt: Number(item.createdAt || Date.now())
    }));
}

function renderLinks() {
  syncNavStatesWithLinks();
  iconBar.innerHTML = "";

  if (!links.length) {
    activeLinkId = "";
    updateNavButtons();
    emptyState.classList.remove("hidden");
    if (!frame.src || frame.src === "about:blank") {
      void setViewerUrl(initialTargetUrl, false);
    }
    return;
  }

  emptyState.classList.add("hidden");

  for (const link of links) {
    const node = iconTemplate.content.firstElementChild.cloneNode(true);
    const image = node.querySelector(".icon-image");
    node.dataset.linkId = link.id;

    const faviconCandidates = buildFaviconCandidates(link);
    let faviconIndex = 0;
    image.src = faviconCandidates[faviconIndex] || DEFAULT_ICON;
    image.alt = link.title;
    image.onerror = () => {
      faviconIndex += 1;
      image.src = faviconCandidates[faviconIndex] || DEFAULT_ICON;
    };
    node.title = `${link.title}\n${link.url}`;

    if (link.id === activeLinkId) {
      node.classList.add("active");
    }

    node.addEventListener("click", () => {
      openInCurrentWindow(link.id);
    });

    iconBar.appendChild(node);
  }
}

function openInCurrentWindow(linkId) {
  const link = links.find((item) => item.id === linkId);
  if (!link) {
    return;
  }

  const state = ensureLinkNavState(link);
  activeLinkId = link.id;
  syncActiveLinkHighlight();

  if (shouldUsePopupDirectLaunch()) {
    state.currentUrl = resolveInitialTarget(state.currentUrl);
    const nextUrl = buildPopupDirectLaunchUrl(state.currentUrl);
    logPip("popup direct launch detail", `target=${state.currentUrl} next=${nextUrl}`);
    window.location.href = nextUrl;
    return;
  }

  updateNavButtons();
  void setViewerUrl(state.currentUrl, false);
}

function shouldUsePopupDirectLaunch() {
  return launchMode === "popup";
}

function buildPopupDirectLaunchUrl(targetUrl) {
  const next = new URL(window.location.href);
  next.searchParams.set("target", resolveInitialTarget(targetUrl));
  next.searchParams.set("launchMode", "popup");
  next.searchParams.delete("autopip");
  return next.toString();
}

function syncActiveLinkHighlight() {
  for (const node of iconBar.querySelectorAll(".icon-item")) {
    node.classList.toggle("active", node.dataset.linkId === activeLinkId);
  }
}

function syncNavStatesWithLinks() {
  const alive = new Set(links.map((item) => item.id));
  for (const key of linkNavStates.keys()) {
    if (!alive.has(key)) {
      linkNavStates.delete(key);
    }
  }

  for (const link of links) {
    ensureLinkNavState(link);
  }
}

function ensureLinkNavState(link) {
  if (!linkNavStates.has(link.id)) {
    linkNavStates.set(link.id, {
      homeUrl: link.url,
      currentUrl: link.url,
      backStack: [],
      forwardStack: []
    });
  }

  const state = linkNavStates.get(link.id);
  if (!state.homeUrl) {
    state.homeUrl = link.url;
  }
  if (!state.currentUrl) {
    state.currentUrl = link.url;
  }
  return state;
}

function getActiveNavState() {
  if (!activeLinkId) {
    return null;
  }

  const link = links.find((item) => item.id === activeLinkId);
  if (!link) {
    return null;
  }

  return ensureLinkNavState(link);
}

function updateNavButtons() {
  return;
}

async function navigateActiveLink(action) {
  const state = getActiveNavState();
  if (!state) {
    return;
  }

  try {
    if (action === "home") {
      state.currentUrl = state.homeUrl;
      await setViewerUrl(state.homeUrl, false);
    }
  } catch (error) {
    showStatus(t("launcherNavigateFailed", [String(error?.message || error)], `导航失败: ${String(error?.message || error)}`), true);
  }
}

async function setViewerUrl(url, announce, options = {}) {
  const safeUrl = resolveInitialTarget(url);
  const allowSecondPass = options?.allowSecondPass !== false;
  const forceReload = options?.forceReload === true;

  const currentFrameSrc = frame.getAttribute("src") || frame.src || "";
  lastRequestedUrl = safeUrl;
  logPip("setViewerUrl detail", `input=${String(url)} safe=${safeUrl} activeLinkId=${String(activeLinkId || "")}`);

  if (currentFrameSrc && currentFrameSrc !== "about:blank" && (currentFrameSrc !== safeUrl || forceReload)) {
    logPip("setViewerUrl preclear detail", `from=${currentFrameSrc} to=about:blank next=${safeUrl}`);
    frame.src = "about:blank";
    await waitForNextFrame();
  }

  await syncSiteCookiesForUrl(safeUrl);

  const ensured = await ensureEmbedRulesForUrl(safeUrl);
  if (ensured) {
    logPip("setViewerUrl ensured rules detail", `safe=${safeUrl}`);
  } else {
    logPip("setViewerUrl ensure rules failed detail", `safe=${safeUrl}`);
  }
  frame.src = safeUrl;

  const activeState = getActiveNavState();
  if (activeState) {
    activeState.currentUrl = safeUrl;
  }
  updateNavButtons();

  if (allowSecondPass) {
    const secondPass = await shouldDoubleOpenForUrl(safeUrl);
    if (secondPass.shouldDoubleOpen) {
      logPip("pip second pass triggered", `url=${safeUrl} rule=${String(secondPass.matchedRuleId || "")}`);
      await waitMs(300);
      await setViewerUrl(safeUrl, false, { allowSecondPass: false, forceReload: true });
    }
  }

  if (!announce) {
    return;
  }
}

function waitForNextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function waitMs(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Number(ms) || 0);
  });
}

async function retryBlockedViewerLoad(url) {
  const safeUrl = resolveInitialTarget(url);
  const retryPolicy = await getBlockedRetryPolicyForUrl(safeUrl);
  const retryDelayMs = Number(retryPolicy?.blockedRetryDelayMs || 260);
  logPip("pip blocked first-pass, retrying", `url=${safeUrl} delayMs=${String(retryDelayMs)} rule=${String(retryPolicy?.matchedRuleId || "")}`);
  await ensureEmbedRulesForUrl(safeUrl);
  await waitMs(retryDelayMs);
  await setViewerUrl(safeUrl, false, {
    allowSecondPass: false,
    forceReload: true
  });
}

// Send a storage-access trigger to the iframe.
// The content script (storage-access-helper.js) inside the iframe listens
// for this message and calls document.requestStorageAccess().
// This is best-effort: success depends on browser policy and prior grants.
function triggerIframeStorageAccess() {
  const iframeWindow = frame?.contentWindow;
  if (!iframeWindow) return;
  const requestId = `sa-${Date.now()}`;
  logPip(`sending storage-access trigger to iframe (requestId=${requestId})`);
  iframeWindow.postMessage(
    { type: "miniweb-request-storage-access", requestId },
    "*"
  );
}

async function ensureEmbedRulesForUrl(url) {
  try {
    const result = await requestBridge("miniweb-ensure-rules-request", "miniweb-ensure-rules-response", { url });
    if (result?.ok !== true) {
      throw new Error(String(result?.error || "unknown"));
    }
    return true;
  } catch (error) {
    logPip("ensure embed rules failed", String(error?.message || error));
    return false;
  }
}

async function syncSiteCookiesForUrl(url) {
  try {
    const result = await requestBridge("miniweb-sync-site-cookies-request", "miniweb-sync-site-cookies-response", {
      url,
      topLevelSite: window.location.origin
    });
    if (result?.ok !== true) {
      throw new Error(String(result?.error || "unknown"));
    }
    const errorPreview = Array.isArray(result?.sampleErrors)
      ? result.sampleErrors.slice(0, 3).join(" | ")
      : "";
    logPip("sync site cookies detail", `url=${url} rule=${String(result?.matchedRuleId || "")} topLevelSite=${String(result?.usedTopLevelSite || "")} synced=${String(result?.synced || 0)} failed=${String(result?.failed || 0)} skipped=${String(result?.skipped === true)} sampleErrors=${errorPreview}`);
    return true;
  } catch (error) {
    logPip("sync site cookies failed", String(error?.message || error));
    return false;
  }
}

async function shouldDoubleOpenForUrl(url) {
  try {
    const result = await requestBridge("miniweb-should-double-open-request", "miniweb-should-double-open-response", { url });
    if (result?.ok !== true) {
      return { shouldDoubleOpen: false, matchedRuleId: "" };
    }
    return {
      shouldDoubleOpen: result.shouldDoubleOpen === true,
      matchedRuleId: String(result.matchedRuleId || "")
    };
  } catch {
    return { shouldDoubleOpen: false, matchedRuleId: "" };
  }
}

async function openUrlExternallyWithFallback(url, reason) {
  const safeUrl = resolveInitialTarget(url);
  if (!/^https?:\/\//.test(safeUrl)) {
    return;
  }
  if (autoExternalOpenedUrls.has(safeUrl)) {
    return;
  }

  autoExternalOpenedUrls.add(safeUrl);
  try {
    const result = await requestBridge("miniweb-open-url-request", "miniweb-open-url-response", {
      url: safeUrl,
      reason: String(reason || "frame-blocked")
    });
    if (result?.ok === true) {
      logPip("open external fallback detail", `url=${safeUrl} mode=${String(result?.mode || "popup")}`);
      showStatus(t("launcherOpenedExternally", undefined, "当前站点禁止嵌入，已自动在外部窗口打开。"), false);
      return;
    }
    const err = String(result?.error || "unknown");
    logPip("open external fallback failed", `url=${safeUrl} error=${err}`);
    showStatus(buildOpenFailureHint(safeUrl), true, safeUrl);
  } catch (error) {
    logPip("open external fallback bridge error", String(error?.message || error));
    showStatus(buildOpenFailureHint(safeUrl), true, safeUrl);
  }
}


async function getBlockedRetryPolicyForUrl(url) {
  try {
    const result = await requestBridge(
      "miniweb-get-blocked-retry-policy-request",
      "miniweb-get-blocked-retry-policy-response",
      { url }
    );
    if (result?.ok !== true) {
      return { blockedRetryDelayMs: 260, matchedRuleId: "" };
    }
    const delay = Number(result.blockedRetryDelayMs);
    const normalized = Number.isFinite(delay) ? Math.max(0, Math.min(2000, Math.round(delay))) : 260;
    return {
      blockedRetryDelayMs: normalized,
      matchedRuleId: String(result.matchedRuleId || "")
    };
  } catch {
    return { blockedRetryDelayMs: 260, matchedRuleId: "" };
  }
}

function resolveInitialTarget(url) {
  if (typeof url === "string" && /^https?:\/\//.test(url)) {
    return url;
  }

  return DEFAULT_TARGET_URL;
}

function readBootstrapPayload() {
  const fallback = {
    initialTargetUrl: "",
    pinnedLinks: [],
    pipDebugPlacement: null,
    currentThemeName: "dark"
  };

  try {
    const node = document.getElementById("miniweb-bootstrap-data");
    if (!node) {
      return fallback;
    }
    const parsed = JSON.parse(String(node.textContent || "{}"));
    const left = Number(parsed?.pipDebugPlacement?.left);
    const top = Number(parsed?.pipDebugPlacement?.top);
    const width = Number(parsed?.pipDebugPlacement?.width);
    const height = Number(parsed?.pipDebugPlacement?.height);
    const capturedAt = Number(parsed?.pipDebugPlacement?.capturedAt);
    const pipDebugPlacement = (Number.isFinite(left)
      && Number.isFinite(top)
      && Number.isFinite(width)
      && Number.isFinite(height)
      && Number.isFinite(capturedAt))
      ? {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(width),
        height: Math.round(height),
        capturedAt: Math.round(capturedAt)
      }
      : null;
    return {
      initialTargetUrl: String(parsed?.initialTargetUrl || ""),
      pinnedLinks: Array.isArray(parsed?.pinnedLinks) ? parsed.pinnedLinks : [],
      pipDebugPlacement,
      currentThemeName: normalizeThemeName(parsed?.currentThemeName)
    };
  } catch {
    return fallback;
  }
}

async function syncLinksFromBridge() {
  try {
    const result = await requestBridge("miniweb-sync-links-request", "miniweb-sync-links-response", {});
    if (result?.ok !== true) {
      return [];
    }
    const payload = Array.isArray(result.links) ? result.links : [];
    return normalizeLinks(payload);
  } catch {
    return [];
  }
}

function requestBridge(requestType, responseType, detail) {
  return new Promise((resolve, reject) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    let settled = false;

    const cleanup = () => {
      document.removeEventListener(responseType, onResponse);
      clearTimeout(timer);
    };

    const onResponse = (event) => {
      const payload = event?.detail || {};
      if (payload.requestId !== requestId) {
        return;
      }
      settled = true;
      cleanup();
      resolve(payload);
    };

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      cleanup();
      reject(new Error(`bridge timeout: ${requestType}`));
    }, BRIDGE_TIMEOUT_MS);

    document.addEventListener(responseType, onResponse);
    document.dispatchEvent(new CustomEvent(requestType, {
      detail: {
        requestId,
        ...(detail || {})
      }
    }));
  });
}

function showStatus(message, isError = false, url = "") {
  if (!message) {
    statusCard.classList.add("hidden");
    statusCard.classList.remove("error");
    statusCard.innerHTML = "";
    return;
  }

  statusCard.classList.remove("hidden");
  statusCard.classList.toggle("error", Boolean(isError));

  if (!url) {
    statusCard.textContent = message;
    return;
  }

  const safeText = escapeHtml(message);
  const safeUrl = escapeAttribute(url);
  statusCard.innerHTML = `${safeText}<br/><a href="${safeUrl}" target="_blank" rel="noreferrer">${escapeHtml(t("openInNewTab", undefined, "在新标签页打开"))}</a>`;
}

function trim(value, size) {
  if (value.length <= size) {
    return value;
  }
  return `${value.slice(0, size - 1)}…`;
}

function hash(value) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return `link_${Math.abs(h)}`;
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildFaviconCandidates(link) {
  const candidates = [];

  if (link?.faviconUrl && link.faviconUrl !== DEFAULT_ICON) {
    candidates.push(link.faviconUrl);
  }

  try {
    const pageUrl = String(link?.url || "");
    if (/^https?:\/\//.test(pageUrl)) {
      const parsed = new URL(pageUrl);
      const extFaviconBase = typeof chrome !== "undefined" && chrome.runtime
        ? chrome.runtime.getURL("/_favicon/")
        : "";

      candidates.push(`${parsed.origin}/favicon.svg`);
      candidates.push(`${parsed.origin}/favicon-192x192.png`);
      candidates.push(`${parsed.origin}/android-chrome-192x192.png`);
      candidates.push(`${parsed.origin}/apple-touch-icon-180x180.png`);
      candidates.push(`${parsed.origin}/apple-touch-icon-152x152.png`);

      if (extFaviconBase) {
        const extQuery = new URLSearchParams({
          pageUrl,
          size: "64"
        });
        candidates.push(`${extFaviconBase}?${extQuery.toString()}`);
      }

      candidates.push(`${parsed.origin}/icons/favicon.ico`);
      candidates.push(`${parsed.origin}/favicon-32x32.png`);
      candidates.push(`${parsed.origin}/favicon-16x16.png`);
      candidates.push(`${parsed.origin}/favicon.ico`);
      candidates.push(`${parsed.origin}/favicon.png`);
      candidates.push(`${parsed.origin}/apple-touch-icon.png`);

      const s2Query = new URLSearchParams({
        domain_url: pageUrl,
        sz: "64"
      });
      candidates.push(`https://www.google.com/s2/favicons?${s2Query.toString()}`);
    }
  } catch {
    // Ignore malformed URL and fall back to default icon.
  }

  candidates.push(DEFAULT_ICON);
  return [...new Set(candidates)];
}

function buildOpenFailureHint(url, errorCode = "") {
  if (String(errorCode).includes("ERR_BLOCKED_BY_RESPONSE")) {
    return t("launcherOpenBlockedByResponse", undefined, "页面打开失败：目标站点策略禁止在内嵌窗口中加载（ERR_BLOCKED_BY_RESPONSE）。请使用“在新标签页打开”。");
  }

  const fallback = t("launcherOpenFallback", undefined, "页面打开失败：目标站点拒绝连接或当前网络不可达。请检查协议、端口和服务状态。");

  try {
    const parsed = new URL(resolveInitialTarget(url));
    const host = parsed.hostname;
    const protocol = parsed.protocol;
    const isPrivateIpv4 = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);

    if (isPrivateIpv4) {
      if (protocol === "https:") {
        return t("launcherOpenHttpsHint", [host], `页面打开失败：${host} 当前可能未启用 HTTPS 服务。可尝试切换为 HTTP 或补全正确端口。`);
      }
      if (!parsed.port) {
        return t("launcherOpenConnRefusedHost", [host], `页面打开失败：${host} 返回拒绝连接。请确认目标服务已启动并监听正确端口（如 :80/:8080）。`);
      }
      return t("launcherOpenConnRefusedPort", [host, parsed.port], `页面打开失败：${host}:${parsed.port} 返回拒绝连接。请检查服务进程、防火墙或局域网路由。`);
    }
  } catch {
    // Keep fallback hint for malformed URL.
  }

  return fallback;
}
