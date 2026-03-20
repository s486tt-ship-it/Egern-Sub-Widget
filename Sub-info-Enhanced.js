/*
 * Subscription panel script.
 * Reworked for up to 10 subscriptions with direct URL input
 * and panel-friendly card layout for Egern.
 * Version: 3.1.0
 */

const SLOT_SEPARATOR = "<<EgernPanelSlot>>";
const FIELD_SEPARATOR = "<<EgernPanelField>>";
const MAX_SUBSCRIPTIONS = 10;
const DEFAULT_PANEL_TITLE = "";
const DEFAULT_PANEL_ICON = "";
const DEFAULT_PANEL_COLOR = "#4F86FF";
const DEFAULT_BACKGROUND_COLOR = "#F5F5F7";

const REQUEST_PROFILES = [
  {
    method: "head",
    headers: {
      "User-Agent": "Quantumult%20X/1.5.2",
      Accept: "*/*",
    },
  },
  {
    method: "get",
    headers: {
      "User-Agent": "clash-verge-rev/2.3.1",
      Accept: "application/x-yaml,text/plain,*/*",
      "Profile-Update-Interval": "24",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  },
  {
    method: "get",
    headers: {
      "User-Agent": "clash-verge/v2.0.0",
      Accept: "application/x-yaml,text/plain,*/*",
      "Profile-Update-Interval": "24",
    },
  },
  {
    method: "get",
    headers: {
      "User-Agent": "mihomo/1.19.3",
      Accept: "application/x-yaml,text/plain,*/*",
      "Profile-Update-Interval": "24",
    },
  },
];

const rawArgument = typeof $argument === "string" ? $argument.trim() : "";

(async () => {
  const context = parseArguments(rawArgument);
  const slots = context.slots.filter((slot) => slot.url).slice(0, MAX_SUBSCRIPTIONS);

  if (!slots.length) {
    $done(buildPanelPayload(context, context.panelTitle, "请至少填写一个机场订阅链接。"));
    return;
  }

  const sections = [];
  for (const slot of slots) {
    sections.push(await buildPanelSection(slot));
  }

  $done(buildPanelPayload(context, buildPanelTitle(context), buildPanelContent(sections)));
})();

function buildPanelPayload(context, title, content) {
  const payload = {
    title,
    content,
    "background-color": context.backgroundColor,
    style: "standard",
  };

  if (context.panelIcon) {
    payload.icon = context.panelIcon;
    payload["icon-color"] = context.panelColor;
  }

  return payload;
}

function parseArguments(argument) {
  const fallback = {
    panelTitle: DEFAULT_PANEL_TITLE,
    hideUpdateTime: false,
    panelIcon: DEFAULT_PANEL_ICON,
    panelColor: DEFAULT_PANEL_COLOR,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    slots: [],
  };

  if (!argument) return fallback;

  const payloadIndex = argument.indexOf("payload=");
  if (payloadIndex !== -1) {
    const metaPart = payloadIndex > 0 ? argument.slice(0, payloadIndex - 1) : "";
    const metaParams = parseKeyValueArgument(metaPart);
    const payload = argument.slice(payloadIndex + "payload=".length);
    const slots = parseSlotPayload(payload);
    normalizeShiftedSlots(slots);
    return {
      panelTitle: normalizePanelTitle(metaParams.panel_title),
      hideUpdateTime: isOnValue(metaParams.hide_update_time),
      panelIcon: DEFAULT_PANEL_ICON,
      panelColor: DEFAULT_PANEL_COLOR,
      backgroundColor: DEFAULT_BACKGROUND_COLOR,
      slots,
    };
  }

  const params = parseKeyValueArgument(argument);
  const slots = [];

  if (params.url) {
    slots.push({
      name: sanitizeTemplateValue(params.title || params.name || ""),
      url: sanitizeTemplateValue(params.url),
      resetDay: sanitizeTemplateValue(params.reset_day || params.resetDay || ""),
    });
  }

  for (let index = 1; index <= MAX_SUBSCRIPTIONS; index += 1) {
    slots.push({
      name: sanitizeTemplateValue(
        params[`title${index}`] ||
          params[`name${index}`] ||
          params[`NAME${index}`] ||
          params[`机场名称${index}`] ||
          ""
      ),
      url: sanitizeTemplateValue(
        params[`url${index}`] || params[`URL${index}`] || params[`订阅链接${index}`] || ""
      ),
      resetDay: sanitizeTemplateValue(
        params[`resetDay${index}`] ||
          params[`reset_day${index}`] ||
          params[`RESET_Day${index}`] ||
          params[`重置日${index}`] ||
          ""
      ),
    });
  }

  normalizeShiftedSlots(slots);

  return {
    panelTitle: normalizePanelTitle(params.panel_title),
    hideUpdateTime: isOnValue(params.hide_update_time),
    panelIcon: "",
    panelColor: params.panel_color || DEFAULT_PANEL_COLOR,
    backgroundColor: params.background_color || DEFAULT_BACKGROUND_COLOR,
    slots,
  };
}

function parseSlotPayload(payload) {
  if (!payload) return [];

  return payload
    .split(SLOT_SEPARATOR)
    .map((entry) => {
      const [name = "", url = "", resetDay = ""] = entry.split(FIELD_SEPARATOR);
      return {
        name: sanitizeTemplateValue(name),
        url: sanitizeTemplateValue(url),
        resetDay: sanitizeTemplateValue(resetDay),
      };
    })
    .filter((slot) => slot.name || slot.url || slot.resetDay);
}

function parseKeyValueArgument(argument) {
  const result = {};
  const matcher = /(?:^|&)([^=&]+)=([^&]*)/g;
  let match;

  while ((match = matcher.exec(argument))) {
    result[match[1]] = safeDecode(match[2]);
  }

  return result;
}

function safeDecode(value) {
  if (typeof value !== "string") return "";
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function sanitizeTemplateValue(value) {
  const decoded = safeDecode(value).trim();
  if (/^\{\{\{[^}]+\}\}\}$/.test(decoded)) return "";
  if (/^机场\d+$/i.test(decoded)) return "";
  if (/^订阅链接\d+$/i.test(decoded)) return "";
  if (/^重置日\d+$/i.test(decoded)) return "";
  return decoded;
}

function normalizePanelTitle(value) {
  if (typeof value !== "string") return "";
  return safeDecode(value).trim();
}

function isOnValue(value) {
  return String(value || "").trim().toLowerCase() === "on";
}

function buildPanelTitle(context) {
  const parts = [];
  if (context.panelTitle) parts.push(context.panelTitle);
  if (!context.hideUpdateTime) parts.push(formatClock(new Date()));
  return parts.join(" | ");
}

function normalizeShiftedSlots(slots) {
  for (let index = 0; index < slots.length - 1; index += 1) {
    const current = slots[index];
    const next = slots[index + 1];

    if (!current || !next) continue;
    if (!current.resetDay || normalizeResetDay(current.resetDay)) continue;
    if (!isLikelyUrl(next.name) || next.url) continue;

    next.url = next.name;
    next.name = current.resetDay;
    current.resetDay = "";
  }
}

function isLikelyUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

async function buildPanelSection(slot) {
  const name = slot.name || inferNameFromUrl(slot.url);
  const resetDay = normalizeResetDay(slot.resetDay);
  const [error, info] = await fetchSubscriptionInfo(slot.url)
    .then((data) => [null, data])
    .catch((err) => [err, null]);

  if (error || !info) {
    return {
      name,
      error: `获取失败：${String(error || "subscription-userinfo missing")}`,
    };
  }

  const used = Number(info.upload || 0) + Number(info.download || 0);
  const total = Number(info.total || 0);
  const ratio = total > 0 ? clamp(used / total, 0, 1) : 0;
  return {
    name,
    usedText: bytesToSize(used),
    totalText: bytesToSize(total),
    percentText: `${(ratio * 100).toFixed(1)}%`,
    progressBar: buildProgressBar(ratio),
    expireText: info.expire ? formatDate(info.expire) : "",
    resetText: resetDay ? `${getRemainingDays(resetDay)} 天` : "",
  };
}

async function fetchSubscriptionInfo(url) {
  const attempts = buildRequestAttempts(url);
  const errors = [];

  for (const attempt of attempts) {
    try {
      const userInfo = await requestUserInfo(attempt);
      if (userInfo) return parseSubscriptionUserInfo(userInfo);
    } catch (error) {
      errors.push(`[${attempt.method.toUpperCase()}] ${attempt.url} -> ${error}`);
    }
  }

  throw new Error(errors[errors.length - 1] || "request failed");
}

function buildRequestAttempts(url) {
  const variants = buildUrlVariants(url);
  const attempts = [];

  for (const variant of variants) {
    for (const profile of REQUEST_PROFILES) {
      attempts.push({
        url: variant,
        method: profile.method,
        headers: profile.headers,
      });
    }
  }

  return attempts;
}

function buildUrlVariants(url) {
  const variants = [];
  const seen = {};
  const append = (candidate) => {
    if (!candidate || seen[candidate]) return;
    seen[candidate] = true;
    variants.push(candidate);
  };

  append(url);
  append(withQueryParam(url, "flag", "clash"));
  append(withQueryParam(url, "flag", "meta"));
  append(withQueryParam(url, "target", "clash"));
  append(withQueryParam(url, "target", "clash-meta"));
  append(withQueryParam(url, "client", "clash-verge-rev"));

  return variants;
}

function withQueryParam(url, key, value) {
  if (!url) return url;
  if (!isLikelyUrl(url)) return "";
  if (new RegExp(`([?&])${escapeRegExp(key)}=`).test(url)) return url;
  return `${url}${url.indexOf("?") === -1 ? "?" : "&"}${key}=${encodeURIComponent(value)}`;
}

function escapeRegExp(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function requestUserInfo(request) {
  return new Promise((resolve, reject) => {
    const client = $httpClient[request.method];
    if (typeof client !== "function") {
      reject(`unsupported method: ${request.method}`);
      return;
    }

    client(
      {
        url: request.url,
        headers: request.headers,
      },
      (error, response) => {
        if (error || !response) {
          reject(error || "empty response");
          return;
        }

        if (response.status < 200 || response.status >= 400) {
          reject(`HTTP ${response.status}`);
          return;
        }

        const headerKey = Object.keys(response.headers || {}).find(
          (key) => key.toLowerCase() === "subscription-userinfo"
        );

        if (!headerKey || !response.headers[headerKey]) {
          reject("subscription-userinfo missing");
          return;
        }

        resolve(response.headers[headerKey]);
      }
    );
  });
}

function parseSubscriptionUserInfo(headerValue) {
  const pairs = String(headerValue).match(/\w+=[\d.eE+-]+/g) || [];
  return Object.fromEntries(
    pairs.map((item) => {
      const [key, value] = item.split("=");
      return [key, Number(value)];
    })
  );
}

function normalizeResetDay(value) {
  const resetDay = parseInt(value, 10);
  return Number.isFinite(resetDay) && resetDay > 0 && resetDay <= 31 ? resetDay : null;
}

function inferNameFromUrl(url) {
  const matched = String(url).match(/^https?:\/\/([^\/?#]+)/i);
  return matched ? matched[1] : "未命名订阅";
}

function getRemainingDays(resetDay) {
  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let resetDate = new Date(currentYear, currentMonth, resetDay);
  if (currentDay >= resetDay) {
    resetDate = new Date(currentYear, currentMonth + 1, resetDay);
  }

  const delta = resetDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(delta / (24 * 60 * 60 * 1000)));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildProgressBar(ratio) {
  const total = 10;
  const filled = Math.max(0, Math.min(total, Math.round(ratio * total)));
  return `${"●".repeat(filled)}${"○".repeat(total - filled)}`;
}

function bytesToSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, power)).toFixed(power === 0 ? 0 : 2)} ${units[power]}`;
}

function formatDate(expireValue) {
  const timestamp = Number(expireValue);
  const date = new Date(timestamp > 1e12 ? timestamp : timestamp * 1000);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatClock(date) {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function buildPanelContent(items) {
  if (!items.length) return "暂无可显示内容";

  const primary = items[0];
  const extraCount = Math.max(0, items.length - 1);

  if (primary.error) {
    return [
      `主订阅  ${primary.name}`,
      primary.error,
      extraCount > 0 ? `另有 ${extraCount} 个订阅未展示` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const meta = [];
  if (primary.expireText) meta.push(`到期 ${primary.expireText}`);
  if (primary.resetText) meta.push(`重置 ${primary.resetText}`);

  return [
    `${primary.name}    ${primary.percentText}`,
    primary.progressBar,
    `已用 ${primary.usedText} / ${primary.totalText}`,
    meta.join("  ·  "),
    extraCount > 0 ? `另有 ${extraCount} 个订阅，可在编辑页切换查看` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
