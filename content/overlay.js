(() => {
  const STORAGE_KEY = "pinnedLinks";
  const ENABLED_KEY = "overlayEnabled";
  const ROOT_ID = "miniweb-overlay-root";
  const DEFAULT_ICON =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23e2e8f0'/%3E%3Cpath d='M18 22h28v20H18z' fill='%2394a3b8'/%3E%3Ccircle cx='26' cy='30' r='3' fill='%23e2e8f0'/%3E%3C/svg%3E";

  let root = null;

  const SYNC_PREF_KEY = "syncEnabledV1";
  let _syncEnabled = true;
  void chrome.storage.local.get(SYNC_PREF_KEY).then((r) => {
    if (SYNC_PREF_KEY in r) { _syncEnabled = r[SYNC_PREF_KEY] !== false; }
  }).catch(() => {});
  function dataStorage() {
    return _syncEnabled ? chrome.storage.sync : chrome.storage.local;
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

  init().catch((error) => {
    console.error("MiniWeb overlay init failed", error);
  });

  async function init() {
    bindRuntimeEvents();

    const state = await dataStorage().get([ENABLED_KEY]);
    if (state[ENABLED_KEY]) {
      await mountOrRefresh();
    }
  }

  function bindRuntimeEvents() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "miniweb-overlay-enable") {
        void enableOverlay();
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" && area !== "sync") {
        return;
      }

      if (area === "local" && SYNC_PREF_KEY in changes) {
        _syncEnabled = changes[SYNC_PREF_KEY].newValue !== false;
      }

      if (changes[ENABLED_KEY]) {
        const enabled = Boolean(changes[ENABLED_KEY].newValue);
        if (enabled) {
          void mountOrRefresh();
        } else {
          unmountOverlay();
        }
      }

      if (changes[STORAGE_KEY] && root) {
        void mountOrRefresh();
      }
    });
  }

  async function enableOverlay() {
    await dataStorage().set({ [ENABLED_KEY]: true });
    await mountOrRefresh();
  }

  async function mountOrRefresh() {
    const state = await dataStorage().get([ENABLED_KEY, STORAGE_KEY]);
    if (!state[ENABLED_KEY]) {
      return;
    }

    const links = Array.isArray(state[STORAGE_KEY]) ? state[STORAGE_KEY] : [];
    renderOverlay(links);
  }

  function renderOverlay(links) {
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      document.documentElement.appendChild(root);
    }

    document.documentElement.classList.add("miniweb-overlay-on");

    root.innerHTML = "";
    const bar = document.createElement("div");
    bar.className = "miniweb-bar";

    const brand = document.createElement("div");
    brand.className = "miniweb-brand";
    brand.textContent = "MiniWeb";

    const linksWrap = document.createElement("div");
    linksWrap.className = "miniweb-links";

    for (const link of links) {
      if (!link || typeof link.url !== "string") {
        continue;
      }

      const button = document.createElement("button");
      button.className = "miniweb-item";
      button.type = "button";
      button.title = `${link.title || link.url}\n${link.url}`;

      const image = document.createElement("img");
      image.src = link.faviconUrl || DEFAULT_ICON;
      image.alt = String(link.title || "link");
      image.onerror = () => {
        image.src = DEFAULT_ICON;
      };

      button.appendChild(image);
      button.addEventListener("click", () => {
        window.location.assign(link.url);
      });

      linksWrap.appendChild(button);
    }

    const actions = document.createElement("div");
    actions.className = "miniweb-actions";

    const pinButton = document.createElement("button");
    pinButton.className = "miniweb-btn";
    pinButton.type = "button";
    pinButton.textContent = t("overlayPinCurrent", undefined, "Pin 当前页");
    pinButton.addEventListener("click", () => {
      void pinCurrentPage();
    });

    const closeButton = document.createElement("button");
    closeButton.className = "miniweb-btn";
    closeButton.type = "button";
    closeButton.textContent = t("overlayClose", undefined, "关闭");
    closeButton.addEventListener("click", () => {
      void dataStorage().set({ [ENABLED_KEY]: false });
    });

    actions.appendChild(pinButton);
    actions.appendChild(closeButton);

    bar.appendChild(brand);
    bar.appendChild(linksWrap);
    bar.appendChild(actions);
    root.appendChild(bar);
  }

  async function pinCurrentPage() {
    const url = window.location.href;
    if (!/^https?:\/\//.test(url)) {
      return;
    }

    const current = await dataStorage().get([STORAGE_KEY]);
    const links = Array.isArray(current[STORAGE_KEY]) ? current[STORAGE_KEY] : [];

    const record = {
      id: `link_${hash(url)}`,
      title: String(document.title || url).slice(0, 180),
      url,
      faviconUrl: getFavicon(url),
      createdAt: Date.now()
    };

    const next = links.filter((item) => item && item.url !== record.url);
    next.unshift(record);
    await dataStorage().set({ [STORAGE_KEY]: next });
  }

  function getFavicon(url) {
    const base = chrome.runtime.getURL("/_favicon/");
    const query = new URLSearchParams({ pageUrl: url, size: "32" });
    return `${base}?${query.toString()}`;
  }

  function hash(input) {
    let h = 0;
    for (let i = 0; i < input.length; i += 1) {
      h = (h << 5) - h + input.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function unmountOverlay() {
    if (root) {
      root.remove();
      root = null;
    }
    document.documentElement.classList.remove("miniweb-overlay-on");
  }
})();
