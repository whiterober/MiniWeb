(function () {
  "use strict";

  const iconsEl = document.getElementById("icons");
  const emptyEl = document.getElementById("empty");
  const statusEl = document.getElementById("status");
  const switchPipBtn = document.getElementById("switchPip");
  const pinCurrentBtn = document.getElementById("pinCurrent");
  const deleteCurrentBtn = document.getElementById("deleteCurrent");
  const DEFAULT_ICON =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23e2e8f0'/%3E%3Cpath d='M18 22h28v20H18z' fill='%2394a3b8'/%3E%3Ccircle cx='26' cy='30' r='3' fill='%23e2e8f0'/%3E%3C/svg%3E";

  let linksCache = [];

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
    const main = document.querySelector("main.strip");
    const actionStrip = document.querySelector("section.action-strip");
    const iconsStrip = document.querySelector("section.icons-strip");

    document.title = t("actionTitle", undefined, "MiniWeb");
    if (main) main.setAttribute("aria-label", t("popupMainAria", undefined, "MiniWeb 原生横栏"));
    if (actionStrip) actionStrip.setAttribute("aria-label", t("popupActionStripAria", undefined, "快捷操作"));
    if (iconsStrip) iconsStrip.setAttribute("aria-label", t("popupIconsStripAria", undefined, "已固定链接"));

    switchPipBtn.title = t("popupSwitchPipTitle", undefined, "切到 PiP");
    pinCurrentBtn.title = t("popupPinCurrentTitle", undefined, "加入当前页");
    deleteCurrentBtn.title = t("popupDeleteCurrentTitle", undefined, "删除当前页");

    emptyEl.textContent = t("popupEmptyText", undefined, "无");
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || "runtime error"));
          return;
        }
        resolve(response || {});
      });
    });
  }

  function setStatus(text) {
    statusEl.textContent = String(text || "");
  }

  function buildFavicon(url) {
    try {
      return `${new URL(url).origin}/favicon.ico`;
    } catch {
      return "";
    }
  }

  function renderLinks(links) {
    linksCache = Array.isArray(links) ? links : [];
    iconsEl.textContent = "";

    if (!linksCache.length) {
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;

    for (const item of linksCache) {
      if (!item || typeof item.url !== "string" || !item.url) {
        continue;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "icon-btn";
      button.title = String(item.title || item.url);
      button.setAttribute("role", "listitem");

      const img = document.createElement("img");
      img.alt = "";
      img.src = String(item.faviconUrl || buildFavicon(item.url));
      img.referrerPolicy = "no-referrer";
      img.loading = "lazy";
      img.addEventListener("error", () => {
        img.src = DEFAULT_ICON;
      }, { once: true });

      button.appendChild(img);
      button.addEventListener("click", async () => {
        setStatus(t("popupStatusOpening", undefined, "正在打开 Popup..."));
        try {
          const response = await sendMessage({
            type: "miniweb-action-open-popup-target",
            url: item.url,
            keepActionPopupVisible: true
          });
          if (!response || response.ok !== true) {
            throw new Error(response?.error || "open popup failed");
          }
          setStatus(t("popupStatusOpened", undefined, "已打开"));
        } catch (error) {
          setStatus(t("popupStatusOpenFailed", [String(error?.message || error)], `打开失败：${String(error?.message || error)}`));
        }
      });

      iconsEl.appendChild(button);
    }
  }

  async function getActiveTab() {
    const response = await sendMessage({ type: "miniweb-get-active-tab" });
    if (!response || response.ok !== true) {
      throw new Error(response?.error || "active tab unavailable");
    }
    return response;
  }

  async function reloadLinks() {
    const response = await sendMessage({ type: "miniweb-get-links" });
    const links = Array.isArray(response)
      ? response
      : (Array.isArray(response?.links) ? response.links : []);
    renderLinks(links);
  }

  switchPipBtn.addEventListener("click", async () => {
    setStatus(t("popupStatusSwitchingPip", undefined, "正在切到 PiP..."));
    try {
      const active = await getActiveTab();
      const fallback = linksCache.find((item) => typeof item?.url === "string" && item.url);
      const targetUrl = String(active?.url || fallback?.url || "");
      const response = await sendMessage({ type: "miniweb-action-open-pip-target", url: targetUrl });
      if (!response || response.ok !== true) {
        throw new Error(response?.error || "open pip failed");
      }
      setStatus(t("popupStatusSwitchedPip", undefined, "已切到 PiP"));
    } catch (error) {
      setStatus(t("popupStatusSwitchFailed", [String(error?.message || error)], `切换失败：${String(error?.message || error)}`));
    }
  });

  pinCurrentBtn.addEventListener("click", async () => {
    setStatus(t("popupStatusPinning", undefined, "正在加入当前页..."));
    try {
      const response = await sendMessage({ type: "miniweb-pin-active-tab" });
      if (!response || response.ok !== true) {
        throw new Error(response?.error || "pin failed");
      }
      renderLinks(response.links || []);
      setStatus(t("popupStatusPinned", undefined, "已加入当前页"));
    } catch (error) {
      setStatus(t("popupStatusPinFailed", [String(error?.message || error)], `加入失败：${String(error?.message || error)}`));
    }
  });

  deleteCurrentBtn.addEventListener("click", async () => {
    setStatus(t("popupStatusDeleting", undefined, "正在删除当前页..."));
    try {
      const response = await sendMessage({ type: "miniweb-delete-active-tab" });
      if (!response || response.ok !== true) {
        throw new Error(response?.error || "delete failed");
      }
      renderLinks(response.links || []);
      setStatus(t("popupStatusDeleted", undefined, "已删除当前页"));
    } catch (error) {
      setStatus(t("popupStatusDeleteFailed", [String(error?.message || error)], `删除失败：${String(error?.message || error)}`));
    }
  });

  void reloadLinks().catch((error) => {
    setStatus(t("popupStatusLoadFailed", [String(error?.message || error)], `加载失败：${String(error?.message || error)}`));
  });

  applyStaticI18n();
})();
