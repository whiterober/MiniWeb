(function () {
  "use strict";

  // 常量
  const SITE_FIX_CONFIG_KEY = "siteFixRulesConfigV1";
  const AUTO_HIDE_SITES_KEY = "autoHideSitesV1";
  const NO_MAIN_FRAME_REWRITE_KEY = "noMainFrameRewriteHostsV1";
  const DEFAULT_NO_MAIN_FRAME_REWRITE_HOSTS = ["qq.xx.com"];
  const DEFAULT_AUTO_HIDE_SITE_PATTERNS = ["(^|\\.)gemini\\.google\\.com$"];

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
  const CLAUDE_NEW_BUTTON_SELECTORS = [
    "button[data-testid=\"pin-sidebar-toggle\"]",
    "button[aria-label=\"Use incognito\"]"
  ];

  // DOM 节点
  const rulesListEl    = document.getElementById("rulesList");
  const addRuleBtn     = document.getElementById("addRule");
  const resetBtn       = document.getElementById("resetDefaults");
  const saveBtn        = document.getElementById("saveRules");
  const statusEl       = document.getElementById("status");
  const rulesJsonEl    = document.getElementById("rulesJson");
  const syncFromJsonBtn = document.getElementById("syncFromJson");
  const manualAddUrlEl = document.getElementById("manualAddUrl");
  const manualAddTitleEl = document.getElementById("manualAddTitle");
  const manualAddStatusEl = document.getElementById("manualAddStatus");
  const manualAddSubmitBtn = document.getElementById("manualAddSubmit");

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
    document.title = t("optionsPageTitle", undefined, "MiniWeb 扩展选项");
    document.getElementById("headTitle").textContent = t("optionsHeaderTitle", undefined, "MiniWeb 扩展选项");
    document.getElementById("headDesc").textContent = t("optionsHeaderDesc", undefined, "MiniWeb 扩展的配置页。下方可管理站点修复规则，解决特定网页与图标栏的兼容问题。");
    document.getElementById("guideTitle").textContent = t("optionsGuideTitle", undefined, "扩展说明");
    document.getElementById("guideIntro").textContent = t("optionsGuideIntro", undefined, "MiniWeb 是一个右键菜单启动的常用网页启动器，你可以把常用页面固定为图标并在小窗中快速切换。");
    document.getElementById("guideEntry").textContent = t("optionsGuideEntry", undefined, "入口：在任意网页点右键，菜单中选“当前页加入 MiniWeb”，即可将当前页固定为图标。");
    document.getElementById("guidePin").textContent = t("optionsGuidePin", undefined, "固定链接：支持右键菜单直接固定当前页，也可在本页最下方“手动加入链接”处填写网址加入。");
    document.getElementById("guideOpen").textContent = t("optionsGuideOpen", undefined, "点击图标：在小窗内切换到该链接。若站点限制内嵌加载，内容区会显示错误提示，此时可改用 Ctrl+点击或右键图标方式打开。");
    document.getElementById("guideCtrlClick").textContent = t("optionsGuideCtrlClick", undefined, "Ctrl（Mac 为 Cmd）+ 点击图标：直接在浏览器新标签页打开链接，可绕过内嵌限制。");
    document.getElementById("guideContextPip").textContent = t("optionsGuideContextPip", undefined, "右键图标栏中的图标：在置顶小窗中打开该链接（置顶小窗始终浮在所有窗口最上层）。");
    document.getElementById("guideDelete").textContent = t("optionsGuideDelete", undefined, "删除链接：鼠标移到小窗左上角的 MiniWeb 图标上，会出现减号按钮；点击后长按即可删除当前选中的链接（长按设计为防止误操作）。");
    document.getElementById("guideShortcut").textContent = t("optionsGuideShortcut", undefined, "快捷键：默认 Ctrl+Shift+M，可快速打开或切换 MiniWeb；可在 Chrome 设置 → 扩展 → 快捷键 中自定义修改。");
    document.getElementById("guideTips").textContent = t("optionsGuideTips", undefined, "站点修复规则：下方规则区用于解决特定页面“顶部被图标栏遮挡”或动态内容样式失效等问题，普通用户无需修改。");
    rulesListEl.setAttribute("aria-label", t("optionsRulesListAria", undefined, "规则列表"));
    addRuleBtn.textContent = t("optionsAddRuleBtn", undefined, "＋ 添加站点规则");
    resetBtn.textContent = t("optionsResetBtn", undefined, "恢复默认");
    saveBtn.textContent = t("optionsSaveBtn", undefined, "保存所有配置");
    document.getElementById("advSummary").textContent = t("optionsAdvancedSummary", undefined, "高级：直接编辑 JSON");
    rulesJsonEl.setAttribute("aria-label", t("optionsRulesJsonAria", undefined, "站点修复规则 JSON"));
    syncFromJsonBtn.textContent = t("optionsSyncFromJsonBtn", undefined, "从 JSON 导入到上方卡片");
    document.getElementById("manualTitle").textContent = t("optionsManualTitle", undefined, "手动加入链接");
    document.getElementById("manualDesc").textContent = t("optionsManualDesc", undefined, "当目标网页屏蔽右键菜单时，可在这里直接把链接加入 MiniWeb。");
    document.getElementById("manualAddUrlLabel").textContent = t("optionsManualUrlLabel", undefined, "页面地址");
    document.getElementById("manualAddTitleLabel").textContent = t("optionsManualTitleLabel", undefined, "显示名称");
    manualAddTitleEl.setAttribute("placeholder", t("optionsManualTitlePlaceholder", undefined, "可选，不填则使用地址"));
    manualAddSubmitBtn.textContent = t("optionsManualSubmitBtn", undefined, "加入 MiniWeb");
  }

  // 内存状态（UI 实时反映，保存时才写入 storage）
  let workingRules = [];

  // 工具函数
  function setStatus(text, type) {
    statusEl.textContent = String(text || "");
    statusEl.classList.remove("ok", "error");
    if (type) { statusEl.classList.add(type); }
  }

  function normalizeSelectors(input) {
    if (!Array.isArray(input)) { return []; }
    return input.map((s) => String(s || "").trim()).filter(Boolean);
  }

  function selectorsToText(arr) {
    return normalizeSelectors(arr).join("\n");
  }

  function textToSelectors(text) {
    return String(text || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function genId() {
    return "rule-" + Math.random().toString(36).slice(2, 8);
  }

  function safeRegexTest(pattern) {
    try { new RegExp(pattern, "i"); return true; }
    catch { return false; }
  }

  function normalizeBlockedRetryDelayMs(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return 260;
    }
    return Math.max(0, Math.min(2000, Math.round(n)));
  }

  function setManualAddStatus(text, type) {
    manualAddStatusEl.textContent = String(text || "");
    manualAddStatusEl.classList.remove("ok", "error");
    if (type) {
      manualAddStatusEl.classList.add(type);
    }
  }

  function normalizeHttpUrl(input) {
    const raw = String(input || "").trim();
    if (!raw) {
      return "";
    }
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return "";
      }
      return u.toString();
    } catch {
      return "";
    }
  }

  async function addManualPinnedLink() {
    const url = normalizeHttpUrl(manualAddUrlEl.value);
    const title = String(manualAddTitleEl.value || "").trim();

    if (!url) {
      setManualAddStatus(t("optionsManualInvalidUrl", undefined, "请输入合法的 http/https 地址"), "error");
      manualAddUrlEl.focus();
      return;
    }

    setManualAddStatus(t("optionsManualAdding", undefined, "正在加入..."));
    try {
      const response = await chrome.runtime.sendMessage({
        type: "miniweb-overlay-pin-current",
        url,
        title
      });
      if (!response?.ok) {
        throw new Error(String(response?.error || t("optionsManualAddFailed", undefined, "加入失败")));
      }
      setManualAddStatus(t("optionsManualAdded", undefined, "已加入 MiniWeb"), "ok");
      manualAddUrlEl.value = "";
      manualAddTitleEl.value = "";
    } catch (error) {
      setManualAddStatus(t("optionsManualAddFailedWithReason", [String(error?.message || error)], `加入失败：${String(error?.message || error)}`), "error");
    }
  }

  function escHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function ensureDefaultRulesPresent(rules) {
    let changed = false;
    const list = Array.isArray(rules)
      ? rules.map((item) => {
          if (!item || typeof item !== "object") {
            return item;
          }
          const ruleId = String(item.id || "").trim();
          const selectors = normalizeSelectors(item.selectors);
          if (ruleId === "claude-new-body" && selectors.length === 1 && selectors[0].toLowerCase() === "body") {
            changed = true;
            return { ...item, selectors: [...CLAUDE_NEW_BUTTON_SELECTORS] };
          }
          return {
            ...item,
            forceFloating: item.forceFloating === true,
            disableContextMenuPip: item.disableContextMenuPip === true,
            cookieSyncEnabled: item.cookieSyncEnabled !== false,
            doubleOpenCompensation: item.doubleOpenCompensation === true,
            blockedRetryDelayMs: normalizeBlockedRetryDelayMs(item.blockedRetryDelayMs)
          };
        })
      : [];
    const existingIds = new Set(list.map((item) => String(item?.id || "")).filter(Boolean));

    for (const rule of DEFAULT_SITE_FIX_RULES) {
      const ruleId = String(rule?.id || "");
      if (!ruleId || existingIds.has(ruleId)) {
        continue;
      }
      list.push({ ...rule });
      existingIds.add(ruleId);
      changed = true;
    }

    return { rules: list, changed };
  }

  function ensureFloatingRuleId(base, index) {
    const slug = String(base || "floating")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    return `floating-${slug || "site"}-${index}`;
  }

  function escapeRegexLiteral(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildHostnameRegexPattern(host) {
    const safeHost = String(host || "").trim().toLowerCase();
    return `(^|\\.)${escapeRegexLiteral(safeHost).replace(/\\\./g, "\\.")}$`;
  }

  function inferHostnameFromRule(rule) {
    if (!rule || String(rule.matchType || "") !== "hostnameRegex") {
      return "";
    }

    const raw = String(rule.pattern || "").trim();
    if (!raw) {
      return "";
    }

    const directHost = raw.toLowerCase();
    if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(directHost)) {
      return directHost;
    }

    const wrapped = raw.match(/^\(\^\|\\\.\)([a-zA-Z0-9\\.-]+)\$$/);
    if (!wrapped || !wrapped[1]) {
      return "";
    }

    const host = String(wrapped[1]).replace(/\\\./g, ".").toLowerCase();
    return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(host) ? host : "";
  }

  function createDirectOpenRuleForHost(host, index) {
    const safeHost = String(host || "").trim().toLowerCase();
    return {
      id: `direct-open-${safeHost.replace(/[^a-z0-9]+/g, "-") || String(index)}`,
      enabled: true,
      matchType: "hostnameRegex",
      pattern: buildHostnameRegexPattern(safeHost),
      selectors: [],
      useForEachRoot: false,
      useObserver: false,
      forceFloating: false,
      noMainFrameRewrite: true,
      disableContextMenuPip: false,
      cookieSyncEnabled: true,
      doubleOpenCompensation: false,
      blockedRetryDelayMs: 260,
      _name: t("optionsDirectOpenPrefix", [safeHost], `直接打开：${safeHost}`)
    };
  }

  function mergeNoRewriteHostsIntoRules(rules, hosts) {
    const list = Array.isArray(rules)
      ? rules.map((item) => ({
          ...item,
          noMainFrameRewrite: item?.noMainFrameRewrite === true,
          disableContextMenuPip: item?.disableContextMenuPip === true,
          cookieSyncEnabled: item?.cookieSyncEnabled !== false,
          doubleOpenCompensation: item?.doubleOpenCompensation === true,
          blockedRetryDelayMs: normalizeBlockedRetryDelayMs(item?.blockedRetryDelayMs)
        }))
      : [];
    const normalizedHosts = Array.isArray(hosts)
      ? hosts.map((h) => String(h || "").trim().toLowerCase()).filter(Boolean)
      : [];

    let changed = false;
    const coveredHosts = new Set();

    for (const rule of list) {
      const host = inferHostnameFromRule(rule);
      if (!host) {
        continue;
      }
      if (normalizedHosts.includes(host)) {
        coveredHosts.add(host);
        if (rule.noMainFrameRewrite !== true) {
          rule.noMainFrameRewrite = true;
          changed = true;
        }
      }
    }

    normalizedHosts.forEach((host, index) => {
      if (coveredHosts.has(host)) {
        return;
      }
      list.push(createDirectOpenRuleForHost(host, index + 1));
      changed = true;
    });

    return { rules: list, changed };
  }

  function collectNoRewriteHostsFromRules(rules) {
    const hostSet = new Set();
    for (const rule of Array.isArray(rules) ? rules : []) {
      if (rule?.noMainFrameRewrite !== true) {
        continue;
      }
      const host = inferHostnameFromRule(rule);
      if (host) {
        hostSet.add(host);
      }
    }
    return [...hostSet];
  }

  function mergeLegacyFloatingPatternsIntoRules(rules, patterns) {
    const list = Array.isArray(rules) ? [...rules] : [];
    const normalizedPatterns = Array.isArray(patterns)
      ? patterns.map((p) => String(p || "").trim()).filter(Boolean)
      : [];
    if (normalizedPatterns.length === 0) {
      return { rules: list, changed: false };
    }

    let changed = false;
    const existingIds = new Set(list.map((item) => String(item?.id || "")).filter(Boolean));

    normalizedPatterns.forEach((pattern, index) => {
      const hit = list.find((item) =>
        item && typeof item === "object" && item.enabled !== false &&
        String(item.matchType || "hostnameRegex") === "hostnameRegex" &&
        String(item.pattern || "").trim() === pattern
      );

      if (hit) {
        if (hit.forceFloating !== true) {
          hit.forceFloating = true;
          changed = true;
        }
        return;
      }

      let nextId = ensureFloatingRuleId(pattern, index);
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
        _name: t("optionsFloatingPageName", undefined, "浮层页面")
      });
      changed = true;
    });

    return { rules: list, changed };
  }

  // 从卡片 DOM 读出一条规则对象
  function readCardRule(card) {
    const enabledEl   = card.querySelector(".rule-enabled");
    const nameEl      = card.querySelector(".rule-name");
    const matchTypeEl = card.querySelector(".rule-matchtype");
    const patternEl   = card.querySelector(".rule-pattern");
    const selectorsEl = card.querySelector(".rule-selectors");
    const shadowDomEl = card.querySelector(".rule-shadow-dom");
    const observerEl  = card.querySelector(".rule-observer");
    const forceFloatingEl = card.querySelector(".rule-force-floating");
    const noMainFrameRewriteEl = card.querySelector(".rule-no-mainframe");
    const disableContextMenuPipEl = card.querySelector(".rule-disable-context-pip");
    const cookieSyncEnabledEl = card.querySelector(".rule-cookie-sync-enabled");
    const doubleOpenCompensationEl = card.querySelector(".rule-double-open-compensation");
    const blockedRetryDelayEl = card.querySelector(".rule-blocked-retry-delay");

    return {
      id:            card.dataset.ruleId || genId(),
      enabled:       Boolean(enabledEl?.checked),
      matchType:     String(matchTypeEl?.value || "hostnameRegex"),
      pattern:       String(patternEl?.value || "").trim(),
      selectors:     textToSelectors(selectorsEl?.value),
      useForEachRoot: Boolean(shadowDomEl?.checked),
      useObserver:    Boolean(observerEl?.checked),
      forceFloating:  Boolean(forceFloatingEl?.checked),
      noMainFrameRewrite: Boolean(noMainFrameRewriteEl?.checked),
      disableContextMenuPip: Boolean(disableContextMenuPipEl?.checked),
      cookieSyncEnabled: cookieSyncEnabledEl ? Boolean(cookieSyncEnabledEl.checked) : true,
      doubleOpenCompensation: Boolean(doubleOpenCompensationEl?.checked),
      blockedRetryDelayMs: normalizeBlockedRetryDelayMs(blockedRetryDelayEl?.value),
      _name:         String(nameEl?.value || "").trim()
    };
  }

  // 校验单条规则，返回错误信息数组（空 = 无错）
  function validateRule(rule) {
    const errors = [];
    if (!rule.enabled) { return errors; }

    if (!rule.pattern) {
      errors.push(t("optionsRulePatternEmpty", undefined, "“匹配内容”不能为空"));
    } else if (!safeRegexTest(rule.pattern)) {
      errors.push(t("optionsRulePatternInvalid", undefined, "“匹配内容”正则不合法，请检查特殊字符"));
    }

    const hasCustomBlockedRetryDelay = normalizeBlockedRetryDelayMs(rule.blockedRetryDelayMs) !== 260;
    if (rule.selectors.length === 0 && !rule.forceFloating && !rule.noMainFrameRewrite && !rule.disableContextMenuPip && !rule.cookieSyncEnabled && !rule.doubleOpenCompensation && !hasCustomBlockedRetryDelay) {
      errors.push(t("optionsRuleSelectorsRequired", undefined, "“CSS 选择器”至少填一行"));
    }

    return errors;
  }

  // 把错误信息显示到卡片
  function showCardErrors(card, errors) {
    const errEl = card.querySelector(".rule-error");
    if (!errEl) { return; }
    if (errors.length === 0) {
      errEl.hidden = true;
      errEl.textContent = "";
      card.classList.remove("has-error");
    } else {
      errEl.hidden = false;
      errEl.textContent = errors.join("\uFF1B");
      card.classList.add("has-error");
    }
  }

  // 卡片渲染
  function createRuleCard(rule) {
    const card = document.createElement("div");
    card.className = "rule-card" + (rule.enabled ? "" : " is-disabled");
    card.dataset.ruleId = rule.id || genId();

    const displayName = rule._name || rule.id || t("optionsRuleNew", undefined, "新规则");

    card.innerHTML = `
      <div class="card-head">
        <div class="toggle-wrap">
          <label class="toggle" title="${rule.enabled ? t("optionsRuleEnabledTitle", undefined, "已启用（点击禁用）") : t("optionsRuleDisabledTitle", undefined, "已禁用（点击启用）")}">
            <input type="checkbox" class="rule-enabled" ${rule.enabled ? "checked" : ""}>
            <span class="toggle-track"></span>
          </label>
        </div>
        <input type="text" class="rule-name" placeholder="${escHtml(t("optionsRuleNamePlaceholder", undefined, "规则名称（方便识别）"))}" value="${escHtml(displayName)}">
        <button type="button" class="rule-delete">${escHtml(t("optionsRuleDelete", undefined, "删除"))}</button>
      </div>
      <div class="card-body">
        <div class="field-row">
          <label>${escHtml(t("optionsRuleMatchTypeLabel", undefined, "匹配方式"))}</label>
          <select class="rule-matchtype">
            <option value="hostnameRegex" ${rule.matchType === "hostnameRegex" ? "selected" : ""}>${escHtml(t("optionsRuleMatchHost", undefined, "域名匹配"))}</option>
            <option value="hrefRegex"     ${rule.matchType === "hrefRegex"     ? "selected" : ""}>${escHtml(t("optionsRuleMatchHref", undefined, "网址包含（支持路径）"))}</option>
          </select>
        </div>
        <div class="field-row">
          <label>${escHtml(t("optionsRulePatternLabel", undefined, "匹配内容"))}</label>
          <input type="text" class="rule-pattern" value="${escHtml(rule.pattern)}"
            placeholder="${escHtml(t("optionsRulePatternPlaceholder", undefined, "如: chat\\.deepseek\\.com 或 zashboard"))}">
        </div>
        <p class="field-hint">${escHtml(t("optionsRuleHint", undefined, "域名匹配：直接填域名即可，如 chat.deepseek.com。网址包含：填关键词或正则，如 zashboard。"))}</p>
        <div class="field-row">
          <label>${escHtml(t("optionsRuleSelectorsLabel", undefined, "CSS 选择器"))}</label>
          <textarea class="rule-selectors" rows="3"
            placeholder="${escHtml(t("optionsRuleSelectorsPlaceholder", undefined, "每行一个，如：\n.main-header\napp-header"))}">${escHtml(selectorsToText(rule.selectors))}</textarea>
        </div>
        <details class="adv-card">
          <summary>${escHtml(t("optionsRuleAdvancedSummary", undefined, "高级选项"))}</summary>
          <div class="adv-card-body">
            <label class="checkbox-row">
              <input type="checkbox" class="rule-shadow-dom" ${rule.useForEachRoot ? "checked" : ""}>
              ${escHtml(t("optionsRuleObserver", undefined, "MutationObserver 自动补样式（页面动态加载时仍持续生效）"))}
            </label>
            <label class="checkbox-row">
              <input type="checkbox" class="rule-observer" ${rule.useObserver ? "checked" : ""}>
              ${escHtml(t("optionsRuleObserver", undefined, "MutationObserver 自动补样式（页面动态加载时仍持续生效）"))}
            </label>
            <label class="checkbox-row">
              <input type="checkbox" class="rule-force-floating" ${rule.forceFloating ? "checked" : ""}>
              ${escHtml(t("optionsRuleForceFloating", undefined, "图标栏始终使用浮层样式（fixed）"))}
            </label>
            <label class="checkbox-row">
              <input type="checkbox" class="rule-no-mainframe" ${rule.noMainFrameRewrite ? "checked" : ""}>
              ${escHtml(t("optionsRuleNoMainframe", undefined, "直接打开模式（主框架不改写请求/响应头）"))}
            </label>
            <label class="checkbox-row">
              <input type="checkbox" class="rule-disable-context-pip" ${rule.disableContextMenuPip ? "checked" : ""}>
              ${escHtml(t("optionsRuleDisableContextPip", undefined, "禁用图标右键打开 PiP（右键仅提示，不执行）"))}
            </label>
            <label class="checkbox-row">
              <input type="checkbox" class="rule-cookie-sync-enabled" ${rule.cookieSyncEnabled !== false ? "checked" : ""}>
              ${escHtml(t("optionsRuleCookieSync", undefined, "启用 PiP Cookie 同步（实验性）"))}
            </label>
            <label class="checkbox-row">
              <input type="checkbox" class="rule-double-open-compensation" ${rule.doubleOpenCompensation ? "checked" : ""}>
              ${escHtml(t("optionsRuleDoubleOpen", undefined, "启用二次打开补偿（Popup + PiP）"))}
            </label>
            <div class="field-row" style="margin-top:8px;">
              <label>${escHtml(t("optionsRuleBlockedRetryLabel", undefined, "首跳阻止重试延迟(ms)"))}</label>
              <input type="number" class="rule-blocked-retry-delay" min="0" max="2000" step="10" value="${normalizeBlockedRetryDelayMs(rule.blockedRetryDelayMs)}">
            </div>
          </div>
        </details>
        <div class="rule-error" hidden></div>
      </div>
    `;

    // 启用开关 <-> 卡片灰显
    card.querySelector(".rule-enabled").addEventListener("change", (e) => {
      card.classList.toggle("is-disabled", !e.target.checked);
    });

    // 删除
    card.querySelector(".rule-delete").addEventListener("click", () => {
      if (confirm(t("optionsRuleDeleteConfirm", [displayName], `确定删除规则“${displayName}”？`))) {
        card.remove();
        syncJsonFromCards();
      }
    });

    // 实时校验 + JSON 同步
    card.querySelectorAll("input, select, textarea").forEach((el) => {
      el.addEventListener("input", () => {
        const r = readCardRule(card);
        showCardErrors(card, validateRule(r));
        syncJsonFromCards();
      });
      el.addEventListener("change", () => {
        const r = readCardRule(card);
        showCardErrors(card, validateRule(r));
        syncJsonFromCards();
      });
    });

    return card;
  }

  // 列表渲染
  function renderRulesList(rules) {
    rulesListEl.textContent = "";
    if (!rules || rules.length === 0) {
      const empty = document.createElement("div");
      empty.className = "rules-empty";
      empty.textContent = t("optionsRulesEmpty", undefined, "暂无规则。点击下方“添加站点规则”按钮创建第一条规则。");
      rulesListEl.appendChild(empty);
      return;
    }
    for (const rule of rules) {
      rulesListEl.appendChild(createRuleCard(rule));
    }
  }

  // JSON 高级区域同步
  function syncJsonFromCards() {
    const rules = collectAllCards();
    rulesJsonEl.value = JSON.stringify(rules, null, 2);
  }

  function collectAllCards() {
    const cards = rulesListEl.querySelectorAll(".rule-card");
    const rules = [];
    for (const card of cards) {
      const r = readCardRule(card);
      rules.push({
        id: r.id,
        enabled: r.enabled,
        matchType: r.matchType,
        pattern: r.pattern,
        selectors: r.selectors,
        useForEachRoot: r.useForEachRoot,
        useObserver: r.useObserver,
        forceFloating: r.forceFloating,
        noMainFrameRewrite: r.noMainFrameRewrite,
        disableContextMenuPip: r.disableContextMenuPip,
        cookieSyncEnabled: r.cookieSyncEnabled,
        doubleOpenCompensation: r.doubleOpenCompensation,
        blockedRetryDelayMs: normalizeBlockedRetryDelayMs(r.blockedRetryDelayMs),
        _name: r._name
      });
    }
    return rules;
  }

  // 规则校验（全量）
  function validateAllCards() {
    const cards = rulesListEl.querySelectorAll(".rule-card");
    let hasError = false;
    for (const card of cards) {
      const r = readCardRule(card);
      const errors = validateRule(r);
      showCardErrors(card, errors);
      if (errors.length > 0) { hasError = true; }
    }
    return !hasError;
  }

  // 存储读写
  async function loadRules() {
    setStatus(t("optionsLoading", undefined, "正在加载配置..."));
    try {
      const result = await chrome.storage.local.get([SITE_FIX_CONFIG_KEY, AUTO_HIDE_SITES_KEY, NO_MAIN_FRAME_REWRITE_KEY]);
      const raw = result?.[SITE_FIX_CONFIG_KEY];
      const legacyFloatingPatterns = result?.[AUTO_HIDE_SITES_KEY];
      const noRewriteHosts = Array.isArray(result?.[NO_MAIN_FRAME_REWRITE_KEY])
        ? result[NO_MAIN_FRAME_REWRITE_KEY].filter((h) => typeof h === "string" && h)
        : [...DEFAULT_NO_MAIN_FRAME_REWRITE_HOSTS];
      let rules;
      let changed = false;
      if (Array.isArray(raw) && raw.length > 0) {
        const merged = ensureDefaultRulesPresent(raw);
        rules = merged.rules;
        changed = merged.changed;
      } else {
        rules = [...DEFAULT_SITE_FIX_RULES];
        changed = true;
      }
      const migrated = mergeLegacyFloatingPatternsIntoRules(rules, legacyFloatingPatterns);
      rules = migrated.rules;
      changed = changed || migrated.changed;
      const mergedNoRewrite = mergeNoRewriteHostsIntoRules(rules, noRewriteHosts);
      rules = mergedNoRewrite.rules;
      changed = changed || mergedNoRewrite.changed;
      if (changed) {
        await chrome.storage.local.set({ [SITE_FIX_CONFIG_KEY]: rules });
        if (Array.isArray(legacyFloatingPatterns) && legacyFloatingPatterns.length > 0) {
          await chrome.storage.local.remove(AUTO_HIDE_SITES_KEY);
        }
      }
      workingRules = rules;
      renderRulesList(workingRules);
      syncJsonFromCards();
      setStatus(t("optionsLoaded", undefined, "已加载"), "ok");
    } catch (error) {
      workingRules = [...DEFAULT_SITE_FIX_RULES];
      renderRulesList(workingRules);
      syncJsonFromCards();
      setStatus(t("optionsLoadFailed", [String(error?.message || error)], `读取失败，已加载默认配置：${String(error?.message || error)}`), "error");
    }
  }

  async function saveRules() {
    if (!validateAllCards()) {
      setStatus(t("optionsFixErrorsFirst", undefined, "请先修正红色标记的错误"), "error");
      return;
    }
    setStatus(t("optionsSaving", undefined, "正在保存..."));
    try {
      const rules = collectAllCards();
      const noRewriteHosts = collectNoRewriteHostsFromRules(rules);
      await chrome.storage.local.set({
        [SITE_FIX_CONFIG_KEY]: rules,
        [NO_MAIN_FRAME_REWRITE_KEY]: noRewriteHosts
      });
      rulesJsonEl.value = JSON.stringify(rules, null, 2);
      setStatus(t("optionsSaved", undefined, "保存成功，打开的目标页面将在 1 秒内自动应用新规则"), "ok");
    } catch (error) {
      setStatus(t("optionsSaveFailed", [String(error?.message || error)], `保存失败：${String(error?.message || error)}`), "error");
    }
  }

  // 事件绑定
  addRuleBtn.addEventListener("click", () => {
    const newRule = {
      id: genId(),
      enabled: true,
      matchType: "hostnameRegex",
      pattern: "",
      selectors: [],
      useForEachRoot: false,
      useObserver: false,
      forceFloating: false,
      disableContextMenuPip: false,
      cookieSyncEnabled: true,
      doubleOpenCompensation: false,
      blockedRetryDelayMs: 260,
      _name: t("optionsRuleNew", undefined, "新规则")
    };
    const card = createRuleCard(newRule);
    const empty = rulesListEl.querySelector(".rules-empty");
    if (empty) { empty.remove(); }
    rulesListEl.appendChild(card);
    card.querySelector(".rule-name")?.focus();
    syncJsonFromCards();
  });

  resetBtn.addEventListener("click", () => {
    if (confirm(t("optionsResetConfirm", undefined, "确定恢复默认规则？当前所有修改将丢失。"))) {
      renderRulesList([...DEFAULT_SITE_FIX_RULES]);
      syncJsonFromCards();
      setStatus(t("optionsResetDone", undefined, "已恢复默认模板，点击“保存所有配置”后生效"), "ok");
    }
  });

  saveBtn.addEventListener("click", () => { void saveRules(); });

  syncFromJsonBtn.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(String(rulesJsonEl.value || "[]"));
      if (!Array.isArray(parsed)) { throw new Error(t("optionsJsonMustArray", undefined, "必须是数组")); }
      renderRulesList(parsed);
      setStatus(t("optionsJsonImported", undefined, "已从 JSON 导入到卡片，记得点《保存所有配置》"), "ok");
    } catch (error) {
      setStatus(t("optionsJsonParseFailed", [String(error?.message || error)], `JSON 解析失败：${String(error?.message || error)}`), "error");
    }
  });

  manualAddSubmitBtn.addEventListener("click", () => {
    void addManualPinnedLink();
  });
  manualAddUrlEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void addManualPinnedLink();
    }
  });
  manualAddTitleEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void addManualPinnedLink();
    }
  });

  // 启动
  applyStaticI18n();
  void loadRules();
})();
