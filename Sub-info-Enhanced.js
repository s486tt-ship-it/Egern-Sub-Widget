/*
 * Subscription widget script.
 * Reworked for up to 10 subscriptions with direct URL input
 * and Widget DSL layout for Egern iOS widgets.
 * Version: 3.0.0
 */

const SLOT_SEPARATOR = "<<EgernPanelSlot>>";
const FIELD_SEPARATOR = "<<EgernPanelField>>";
const MAX_SUBSCRIPTIONS = 10;
const DEFAULT_PANEL_TITLE = "机场订阅信息";
const MAX_RENDER_BY_FAMILY = {
  systemSmall: 1,
  systemMedium: 1,
  systemLarge: 3,
  systemExtraLarge: 4,
  accessoryRectangular: 1,
  accessoryInline: 1,
  accessoryCircular: 1,
};

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
    $done(buildErrorWidget(context, "请至少填写一个机场订阅链接。"));
    return;
  }

  const sections = [];
  for (const slot of slots) {
    sections.push(await buildSubscriptionData(slot));
  }

  $done(buildWidget(context, sections));
})();

function parseArguments(argument) {
  const fallback = {
    panelTitle: DEFAULT_PANEL_TITLE,
    hideUpdateTime: false,
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
      panelTitle: normalizePanelTitle(metaParams.panel_title) || DEFAULT_PANEL_TITLE,
      hideUpdateTime: isOnValue(metaParams.hide_update_time),
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
    panelTitle: normalizePanelTitle(params.panel_title) || DEFAULT_PANEL_TITLE,
    hideUpdateTime: isOnValue(params.hide_update_time),
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

async function buildSubscriptionData(slot) {
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
    used,
    total,
    ratio,
    percentText: `${(ratio * 100).toFixed(1)}%`,
    usedText: bytesToSize(used),
    totalText: bytesToSize(total),
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

function buildWidget(context, items) {
  const family = typeof $widgetFamily === "string" ? $widgetFamily : "systemMedium";
  const limit = MAX_RENDER_BY_FAMILY[family] || 1;
  const visibleItems = items.slice(0, limit);
  const remainingCount = Math.max(0, items.length - visibleItems.length);
  const headerText = context.hideUpdateTime
    ? context.panelTitle
    : `${context.panelTitle} | ${formatClock(new Date())}`;

  const children = [
    {
      type: "text",
      text: headerText,
      font: { size: 16, weight: "semibold" },
      textColor: "#F5F5F7",
      maxLines: 1,
      minScale: 0.65,
    },
    { type: "spacer", length: 14 },
  ];

  visibleItems.forEach((item, index) => {
    children.push(buildSubscriptionStack(item, index === 0 && visibleItems.length === 1));
    if (index !== visibleItems.length - 1) {
      children.push({ type: "spacer", length: 12 });
    }
  });

  if (remainingCount > 0) {
    children.push({ type: "spacer", length: 10 });
    children.push({
      type: "text",
      text: `还有 ${remainingCount} 个订阅未显示`,
      font: { size: 12, weight: "medium" },
      textColor: "#8E8E93",
      maxLines: 1,
    });
  }

  return {
    type: "widget",
    padding: 16,
    gap: 0,
    backgroundColor: "#1C1C1E",
    children,
  };
}

function buildErrorWidget(context, message) {
  return {
    type: "widget",
    padding: 16,
    gap: 10,
    backgroundColor: "#1C1C1E",
    children: [
      {
        type: "text",
        text: context.panelTitle || DEFAULT_PANEL_TITLE,
        font: { size: 16, weight: "semibold" },
        textColor: "#F5F5F7",
        maxLines: 1,
      },
      {
        type: "text",
        text: message,
        font: { size: 14, weight: "medium" },
        textColor: "#FF9F8F",
      },
    ],
  };
}

function buildSubscriptionStack(item, emphasizeGauge) {
  if (item.error) {
    return {
      type: "stack",
      direction: "column",
      gap: 6,
      padding: 12,
      backgroundColor: "#2C2C2E",
      borderRadius: 18,
      children: [
        {
          type: "text",
          text: item.name,
          font: { size: 15, weight: "semibold" },
          textColor: "#FFFFFF",
          maxLines: 1,
        },
        {
          type: "text",
          text: item.error,
          font: { size: 12, weight: "medium" },
          textColor: "#FF9F8F",
          maxLines: 3,
          minScale: 0.7,
        },
      ],
    };
  }

  const gaugeSize = emphasizeGauge ? 88 : 64;
  const detailGap = emphasizeGauge ? 7 : 5;
  const metaParts = [];
  if (item.expireText) metaParts.push(`到期 ${item.expireText}`);
  if (item.resetText) metaParts.push(`重置 ${item.resetText}`);

  return {
    type: "stack",
    direction: "row",
    alignItems: "center",
    gap: 14,
    padding: 12,
    backgroundColor: "#2C2C2E",
    borderRadius: 20,
    children: [
      {
        type: "image",
        src: buildGaugeDataUri(item.percentText, item.ratio),
        width: gaugeSize,
        height: gaugeSize,
      },
      {
        type: "stack",
        direction: "column",
        gap: detailGap,
        flex: 1,
        children: [
          {
            type: "text",
            text: item.name,
            font: { size: emphasizeGauge ? 20 : 15, weight: "semibold" },
            textColor: "#FFFFFF",
            maxLines: 1,
            minScale: 0.6,
          },
          {
            type: "text",
            text: `已用 ${item.usedText} / ${item.totalText}`,
            font: { size: emphasizeGauge ? 14 : 12, weight: "medium" },
            textColor: "#D7D7DB",
            maxLines: 1,
            minScale: 0.6,
          },
          {
            type: "text",
            text: metaParts.length ? metaParts.join("  ·  ") : `使用率 ${item.percentText}`,
            font: { size: emphasizeGauge ? 13 : 11, weight: "medium" },
            textColor: "#A1A1AA",
            maxLines: 1,
            minScale: 0.6,
          },
        ],
      },
    ],
  };
}

function buildGaugeDataUri(percentText, ratio) {
  const size = 220;
  const stroke = 18;
  const radius = 84;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamp(ratio, 0, 1));
  const ringColor = gaugeColor(ratio);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="#3A3A3C" stroke-width="${stroke}" opacity="0.55"/>
  <circle
    cx="${center}"
    cy="${center}"
    r="${radius}"
    fill="none"
    stroke="${ringColor}"
    stroke-width="${stroke}"
    stroke-linecap="round"
    stroke-dasharray="${circumference}"
    stroke-dashoffset="${dashOffset}"
    transform="rotate(-90 ${center} ${center})"
  />
  <text
    x="50%"
    y="48%"
    text-anchor="middle"
    font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    font-size="32"
    font-weight="700"
    fill="#FFFFFF"
  >${percentText}</text>
  <text
    x="50%"
    y="63%"
    text-anchor="middle"
    font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    font-size="16"
    font-weight="600"
    letter-spacing="3"
    fill="#9A9AA2"
  >USED</text>
</svg>`.trim();

  return toSvgDataUri(svg);
}

function gaugeColor(ratio) {
  if (ratio >= 0.9) return "#FF6B6B";
  if (ratio >= 0.75) return "#FFB74D";
  return "#7AA7FF";
}

function toSvgDataUri(svg) {
  if (typeof btoa === "function") {
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
