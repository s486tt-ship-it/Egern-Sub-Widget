/*
 * Egern subscription widget.
 * Version: 4.0.0
 */

const MAX_SUBSCRIPTIONS = 10;
const DEFAULT_TITLE = "机场订阅信息";

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

export default async function (ctx) {
  const config = parseEnv(ctx.env || {});
  const activeSlots = config.slots.filter((slot) => slot.url).slice(0, MAX_SUBSCRIPTIONS);

  if (!activeSlots.length) {
    return buildEmptyWidget(config);
  }

  const items = [];
  for (const slot of activeSlots) {
    items.push(await loadSubscription(ctx, slot));
  }

  return buildWidget(ctx, config, items);
}

function parseEnv(env) {
  const slots = [];

  for (let index = 1; index <= MAX_SUBSCRIPTIONS; index += 1) {
    slots.push({
      name: sanitizeTemplateValue(env[`NAME${index}`]),
      url: sanitizeTemplateValue(env[`URL${index}`]),
      resetDay: sanitizeTemplateValue(env[`RESET_DAY${index}`]),
    });
  }

  normalizeShiftedSlots(slots);

  return {
    title: sanitizeTemplateValue(env.TITLE) || DEFAULT_TITLE,
    slots,
  };
}

async function loadSubscription(ctx, slot) {
  const name = slot.name || inferNameFromUrl(slot.url);
  const resetDay = normalizeResetDay(slot.resetDay);

  try {
    const info = await fetchSubscriptionInfo(ctx, slot.url);
    const used = Number(info.upload || 0) + Number(info.download || 0);
    const total = Number(info.total || 0);
    const ratio = total > 0 ? clamp(used / total, 0, 1) : 0;

    return {
      ok: true,
      name,
      used,
      total,
      usedText: bytesToSize(used),
      totalText: bytesToSize(total),
      ratio,
      percentText: `${(ratio * 100).toFixed(1)}%`,
      expireText: info.expire ? formatDate(info.expire) : "",
      resetText: resetDay ? `${getRemainingDays(resetDay)} 天` : "",
    };
  } catch (error) {
    return {
      ok: false,
      name,
      errorText: String(error || "获取失败"),
    };
  }
}

async function fetchSubscriptionInfo(ctx, url) {
  const attempts = buildRequestAttempts(url);
  const errors = [];

  for (const attempt of attempts) {
    try {
      const response = await ctx.http[attempt.method](attempt.url, {
        headers: attempt.headers,
        timeout: 12000,
      });

      if (response.status < 200 || response.status >= 400) {
        throw new Error(`HTTP ${response.status}`);
      }

      const headerValue = response.headers.get("subscription-userinfo");
      if (!headerValue) {
        throw new Error("subscription-userinfo missing");
      }

      return parseSubscriptionUserInfo(headerValue);
    } catch (error) {
      errors.push(`[${attempt.method.toUpperCase()}] ${attempt.url} -> ${String(error)}`);
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
  if (!isLikelyUrl(url)) return "";
  if (new RegExp(`([?&])${escapeRegExp(key)}=`).test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
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

function buildWidget(ctx, config, items) {
  const family = ctx.widgetFamily || "systemMedium";
  if (family === "accessoryInline") return buildInlineWidget(config, items);
  if (family === "accessoryCircular") return buildCircularWidget(config, items);
  if (family === "accessoryRectangular") return buildRectangularWidget(config, items);

  const displayItems = family === "systemLarge" || family === "systemExtraLarge" ? items.slice(0, 2) : items.slice(0, 1);

  return {
    type: "widget",
    padding: 16,
    gap: 12,
    backgroundGradient: {
      colors: ["#F7F8FC", "#ECEFF7"],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 },
    },
    children: [
      buildHeader(config.title),
      ...displayItems.map((item) => buildMainCard(item)),
      items.length > displayItems.length
        ? {
            type: "text",
            text: `还有 ${items.length - displayItems.length} 个订阅未显示`,
            font: { size: "caption1", weight: "medium" },
            textColor: "#7C8193",
            maxLines: 1,
          }
        : { type: "spacer", length: 0 },
    ],
  };
}

function buildHeader(title) {
  return {
    type: "stack",
    direction: "row",
    alignItems: "center",
    children: [
      {
        type: "text",
        text: title,
        font: { size: "headline", weight: "semibold" },
        textColor: "#151821",
        maxLines: 1,
        minScale: 0.7,
      },
      { type: "spacer" },
      {
        type: "date",
        date: new Date().toISOString(),
        format: "time",
        font: { size: "caption1", weight: "semibold" },
        textColor: "#7C8193",
      },
    ],
  };
}

function buildMainCard(item) {
  if (!item.ok) {
    return {
      type: "stack",
      direction: "column",
      gap: 8,
      padding: 16,
      backgroundColor: "#FFFFFF",
      borderRadius: 22,
      shadowColor: "#ABB3C733",
      shadowRadius: 10,
      shadowOffset: { x: 0, y: 4 },
      children: [
        {
          type: "text",
          text: item.name,
          font: { size: "headline", weight: "semibold" },
          textColor: "#151821",
          maxLines: 1,
        },
        {
          type: "text",
          text: item.errorText,
          font: { size: "caption1", weight: "medium" },
          textColor: "#D04545",
          maxLines: 3,
          minScale: 0.7,
        },
      ],
    };
  }

  const chips = [];
  if (item.expireText) chips.push(buildChip("到期", item.expireText));
  if (item.resetText) chips.push(buildChip("重置", item.resetText));

  return {
    type: "stack",
    direction: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    shadowColor: "#ABB3C733",
    shadowRadius: 10,
    shadowOffset: { x: 0, y: 4 },
    children: [
      {
        type: "image",
        src: buildGaugeDataUri(item.percentText, item.ratio),
        width: 92,
        height: 92,
      },
      {
        type: "stack",
        direction: "column",
        gap: 8,
        flex: 1,
        children: [
          {
            type: "text",
            text: item.name,
            font: { size: "title3", weight: "semibold" },
            textColor: "#151821",
            maxLines: 1,
            minScale: 0.65,
          },
          {
            type: "text",
            text: `已用 ${item.usedText} / ${item.totalText}`,
            font: { size: "subheadline", weight: "medium" },
            textColor: "#5C6272",
            maxLines: 2,
            minScale: 0.7,
          },
          chips.length
            ? {
                type: "stack",
                direction: "row",
                gap: 8,
                children: chips,
              }
            : {
                type: "text",
                text: `使用率 ${item.percentText}`,
                font: { size: "caption1", weight: "medium" },
                textColor: "#7C8193",
              },
        ],
      },
    ],
  };
}

function buildChip(label, value) {
  return {
    type: "stack",
    direction: "column",
    gap: 2,
    padding: [8, 10, 8, 10],
    backgroundColor: "#F2F5FB",
    borderRadius: 14,
    children: [
      {
        type: "text",
        text: label,
        font: { size: "caption2", weight: "medium" },
        textColor: "#8C92A3",
        maxLines: 1,
      },
      {
        type: "text",
        text: value,
        font: { size: "caption1", weight: "semibold" },
        textColor: "#20242F",
        maxLines: 1,
      },
    ],
  };
}

function buildInlineWidget(config, items) {
  const item = items[0];
  if (!item || !item.ok) {
    return {
      type: "widget",
      backgroundColor: "#00000000",
      children: [
        {
          type: "text",
          text: `${config.title} 获取失败`,
          font: { size: "caption2", weight: "medium" },
          textColor: "#FFFFFF",
        },
      ],
    };
  }

  return {
    type: "widget",
    backgroundColor: "#00000000",
    children: [
      {
        type: "text",
        text: `${item.name} ${item.percentText}`,
        font: { size: "caption1", weight: "semibold" },
        textColor: "#FFFFFF",
        maxLines: 1,
      },
    ],
  };
}

function buildCircularWidget(config, items) {
  const item = items[0];
  if (!item || !item.ok) {
    return {
      type: "widget",
      backgroundColor: "#151821",
      padding: 10,
      children: [
        {
          type: "text",
          text: "ERR",
          font: { size: "caption1", weight: "bold" },
          textColor: "#FFFFFF",
        },
      ],
    };
  }

  return {
    type: "widget",
    padding: 8,
    backgroundColor: "#151821",
    children: [
      {
        type: "image",
        src: buildGaugeDataUri(item.percentText, item.ratio, {
          background: "#232734",
          foreground: gaugeColor(item.ratio),
          textColor: "#FFFFFF",
          subTextColor: "#B3B9C8",
          size: 180,
          stroke: 16,
          fontSize: 34,
          subFontSize: 14,
        }),
        width: 58,
        height: 58,
      },
    ],
  };
}

function buildRectangularWidget(config, items) {
  const item = items[0];
  if (!item || !item.ok) {
    return {
      type: "widget",
      padding: 12,
      backgroundColor: "#151821",
      children: [
        {
          type: "text",
          text: `${config.title}\n获取失败`,
          font: { size: "caption1", weight: "semibold" },
          textColor: "#FFFFFF",
        },
      ],
    };
  }

  return {
    type: "widget",
    padding: 12,
    gap: 8,
    backgroundColor: "#151821",
    children: [
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 10,
        children: [
          {
            type: "image",
            src: buildGaugeDataUri(item.percentText, item.ratio, {
              background: "#232734",
              foreground: gaugeColor(item.ratio),
              textColor: "#FFFFFF",
              subTextColor: "#B3B9C8",
              size: 180,
              stroke: 16,
              fontSize: 34,
              subFontSize: 14,
            }),
            width: 48,
            height: 48,
          },
          {
            type: "stack",
            direction: "column",
            gap: 2,
            flex: 1,
            children: [
              {
                type: "text",
                text: item.name,
                font: { size: "caption1", weight: "semibold" },
                textColor: "#FFFFFF",
                maxLines: 1,
              },
              {
                type: "text",
                text: `${item.usedText} / ${item.totalText}`,
                font: { size: "caption2", weight: "medium" },
                textColor: "#B3B9C8",
                maxLines: 1,
              },
            ],
          },
        ],
      },
    ],
  };
}

function buildEmptyWidget(config) {
  return {
    type: "widget",
    padding: 18,
    gap: 10,
    backgroundGradient: {
      colors: ["#F7F8FC", "#ECEFF7"],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 },
    },
    children: [
      buildHeader(config.title),
      {
        type: "stack",
        direction: "column",
        gap: 8,
        padding: 16,
        backgroundColor: "#FFFFFF",
        borderRadius: 22,
        children: [
          {
            type: "text",
            text: "请先在模块参数中填写订阅链接",
            font: { size: "headline", weight: "semibold" },
            textColor: "#151821",
            maxLines: 2,
          },
          {
            type: "text",
            text: "支持 10 组机场名称、订阅链接和重置日",
            font: { size: "subheadline", weight: "medium" },
            textColor: "#7C8193",
            maxLines: 2,
          },
        ],
      },
    ],
  };
}

function buildGaugeDataUri(percentText, ratio, theme) {
  const settings = {
    size: 220,
    stroke: 18,
    fontSize: 34,
    subFontSize: 14,
    background: "#E7ECF6",
    foreground: gaugeColor(ratio),
    textColor: "#1C2230",
    subTextColor: "#8C92A3",
    ...theme,
  };

  const radius = (settings.size - settings.stroke) / 2 - 4;
  const center = settings.size / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamp(ratio, 0, 1));
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${settings.size}" height="${settings.size}" viewBox="0 0 ${settings.size} ${settings.size}">
  <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${settings.background}" stroke-width="${settings.stroke}" />
  <circle
    cx="${center}"
    cy="${center}"
    r="${radius}"
    fill="none"
    stroke="${settings.foreground}"
    stroke-width="${settings.stroke}"
    stroke-linecap="round"
    stroke-dasharray="${circumference}"
    stroke-dashoffset="${dashOffset}"
    transform="rotate(-90 ${center} ${center})"
  />
  <text x="50%" y="49%" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="${settings.fontSize}" font-weight="700" fill="${settings.textColor}">${percentText}</text>
  <text x="50%" y="63%" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="${settings.subFontSize}" font-weight="600" letter-spacing="2" fill="${settings.subTextColor}">USED</text>
</svg>`.trim();

  return `data:image/svg+xml;base64,${base64Encode(svg)}`;
}

function gaugeColor(ratio) {
  if (ratio >= 0.9) return "#F05C4E";
  if (ratio >= 0.75) return "#F6A63A";
  return "#6B8CFF";
}

function base64Encode(input) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = utf8Encode(input);
  let output = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;

    output += chars[(triple >> 18) & 63];
    output += chars[(triple >> 12) & 63];
    output += i + 1 < bytes.length ? chars[(triple >> 6) & 63] : "=";
    output += i + 2 < bytes.length ? chars[triple & 63] : "=";
  }

  return output;
}

function utf8Encode(input) {
  const bytes = [];
  for (const char of input) {
    const code = char.codePointAt(0);
    if (code <= 0x7f) {
      bytes.push(code);
    } else if (code <= 0x7ff) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code <= 0xffff) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return bytes;
}

function sanitizeTemplateValue(value) {
  const text = String(value || "").trim();
  if (/^\{\{\{[^}]+\}\}\}$/.test(text)) return "";
  if (/^机场\d+$/i.test(text)) return "";
  if (/^订阅链接\d+$/i.test(text)) return "";
  if (/^可选$/i.test(text)) return "";
  return text;
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

function normalizeResetDay(value) {
  const resetDay = parseInt(value, 10);
  return Number.isFinite(resetDay) && resetDay > 0 && resetDay <= 31 ? resetDay : null;
}

function inferNameFromUrl(url) {
  const matched = String(url).match(/^https?:\/\/([^\/?#]+)/i);
  return matched ? matched[1] : "未命名订阅";
}

function isLikelyUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function escapeRegExp(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
