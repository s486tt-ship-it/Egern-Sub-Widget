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
  if (family === "systemSmall") return buildSmallWidget(config, items);

  const displayLimit = family === "systemExtraLarge" ? 8 : family === "systemLarge" ? 6 : 4;
  const displayItems = items.slice(0, displayLimit);

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
      buildListCard(displayItems),
      items.length > displayItems.length
        ? {
            type: "text",
            text: `还有 ${items.length - displayItems.length} 个订阅未显示`,
            font: { size: 11, weight: "medium" },
            textColor: "#7C8193",
            maxLines: 1,
          }
        : { type: "spacer", length: 0 },
    ],
  };
}

function buildSmallWidget(config, items) {
  const item = items[0];
  return {
    type: "widget",
    padding: 14,
    gap: 10,
    backgroundGradient: {
      colors: ["#F7F8FC", "#ECEFF7"],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 },
    },
    children: [
      buildHeader(config.title),
      item ? buildMainCard(item) : buildEmptyWidget(config),
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
        font: { size: 16, weight: "semibold" },
        textColor: "#151821",
        maxLines: 1,
        minScale: 0.7,
      },
      { type: "spacer" },
      {
        type: "date",
        date: new Date().toISOString(),
        format: "time",
        font: { size: 12, weight: "semibold" },
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
          font: { size: 15, weight: "semibold" },
          textColor: "#151821",
          maxLines: 1,
        },
        {
          type: "text",
          text: item.errorText,
          font: { size: 12, weight: "medium" },
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
    direction: "column",
    gap: 10,
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    shadowColor: "#ABB3C733",
    shadowRadius: 10,
    shadowOffset: { x: 0, y: 4 },
    children: [
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 12,
        children: [
          buildPercentBadge(item),
          {
            type: "stack",
            direction: "column",
            gap: 5,
            flex: 1,
            children: [
              {
                type: "text",
                text: item.name,
                font: { size: 15, weight: "semibold" },
                textColor: "#151821",
                maxLines: 1,
                minScale: 0.6,
              },
              {
                type: "text",
                text: `已用 ${item.usedText} / ${item.totalText}`,
                font: { size: 12, weight: "medium" },
                textColor: "#5C6272",
                maxLines: 2,
                minScale: 0.7,
              },
            ],
          },
        ],
      },
      buildProgressBarStack(item.ratio),
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
            font: { size: 11, weight: "medium" },
            textColor: "#7C8193",
          },
    ],
  };
}

function buildListCard(items) {
  return {
    type: "stack",
    direction: "column",
    gap: 8,
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    shadowColor: "#ABB3C733",
    shadowRadius: 10,
    shadowOffset: { x: 0, y: 4 },
    children: items.map((item) => buildCompactRow(item)),
  };
}

function buildCompactRow(item) {
  if (!item.ok) {
    return {
      type: "stack",
      direction: "row",
      alignItems: "center",
      gap: 10,
      padding: [6, 0, 6, 0],
      children: [
        buildMiniPercent(item.name, "ERR", "#D04545"),
        {
          type: "stack",
          direction: "column",
          gap: 2,
          flex: 1,
          children: [
            {
              type: "text",
              text: item.name,
              font: { size: 13, weight: "semibold" },
              textColor: "#151821",
              maxLines: 1,
            },
            {
              type: "text",
              text: item.errorText,
              font: { size: 10, weight: "medium" },
              textColor: "#D04545",
              maxLines: 1,
              minScale: 0.7,
            },
          ],
        },
      ],
    };
  }

  const meta = [];
  if (item.expireText) meta.push(item.expireText);
  if (item.resetText) meta.push(`重置 ${item.resetText}`);

  return {
    type: "stack",
    direction: "row",
    alignItems: "center",
    gap: 10,
    padding: [6, 0, 6, 0],
    children: [
      buildMiniPercent(item.name, item.percentText, gaugeColor(item.ratio)),
      {
        type: "stack",
        direction: "column",
        gap: 3,
        flex: 1,
        children: [
          {
            type: "stack",
            direction: "row",
            alignItems: "center",
            children: [
              {
                type: "text",
                text: item.name,
                font: { size: 13, weight: "semibold" },
                textColor: "#151821",
                maxLines: 1,
                minScale: 0.7,
              },
              { type: "spacer" },
              {
                type: "text",
                text: item.percentText,
                font: { size: 11, weight: "bold" },
                textColor: gaugeColor(item.ratio),
                maxLines: 1,
              },
            ],
          },
          buildCompactProgressBar(item.ratio),
          {
            type: "text",
            text: `${item.usedText} / ${item.totalText}${meta.length ? `  ·  ${meta.join("  ·  ")}` : ""}`,
            font: { size: 10, weight: "medium" },
            textColor: "#6E7588",
            maxLines: 1,
            minScale: 0.65,
          },
        ],
      },
    ],
  };
}

function buildPercentBadge(item) {
  return {
    type: "stack",
    direction: "column",
    gap: 2,
    padding: [10, 12, 10, 12],
    backgroundColor: "#F2F5FB",
    borderRadius: 18,
    children: [
      {
        type: "text",
        text: item.percentText,
        font: { size: 22, weight: "bold" },
        textColor: gaugeColor(item.ratio),
        maxLines: 1,
      },
      {
        type: "text",
        text: "USED",
        font: { size: 10, weight: "semibold" },
        textColor: "#98A0B3",
        maxLines: 1,
      },
    ],
  };
}

function buildMiniPercent(_name, percentText, color) {
  return {
    type: "stack",
    direction: "column",
    alignItems: "center",
    gap: 1,
    padding: [6, 8, 6, 8],
    backgroundColor: "#F2F5FB",
    borderRadius: 14,
    children: [
      {
        type: "text",
        text: percentText,
        font: { size: 11, weight: "bold" },
        textColor: color,
        maxLines: 1,
      },
    ],
  };
}

function buildCompactProgressBar(ratio) {
  const filledFlex = Math.max(1, Math.round(clamp(ratio, 0, 1) * 100));
  const emptyFlex = Math.max(1, 100 - filledFlex);

  return {
    type: "stack",
    direction: "row",
    height: 6,
    backgroundColor: "#E8ECF5",
    borderRadius: 999,
    children: [
      {
        type: "stack",
        flex: filledFlex,
        height: 6,
        backgroundColor: gaugeColor(ratio),
        borderRadius: 999,
        children: [],
      },
      {
        type: "stack",
        flex: emptyFlex,
        height: 6,
        backgroundColor: "#00000000",
        children: [],
      },
    ],
  };
}

function buildProgressBarStack(ratio) {
  const filledFlex = Math.max(1, Math.round(clamp(ratio, 0, 1) * 100));
  const emptyFlex = Math.max(1, 100 - filledFlex);

  return {
    type: "stack",
    direction: "column",
    gap: 6,
    children: [
      {
        type: "stack",
        direction: "row",
        height: 8,
        backgroundColor: "#E8ECF5",
        borderRadius: 999,
        children: [
          {
            type: "stack",
            flex: filledFlex,
            height: 8,
            backgroundColor: gaugeColor(ratio),
            borderRadius: 999,
            children: [],
          },
          {
            type: "stack",
            flex: emptyFlex,
            height: 8,
            backgroundColor: "#00000000",
            children: [],
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
        font: { size: 10, weight: "medium" },
        textColor: "#8C92A3",
        maxLines: 1,
      },
      {
        type: "text",
        text: value,
        font: { size: 12, weight: "semibold" },
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
          font: { size: 11, weight: "medium" },
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
        font: { size: 12, weight: "semibold" },
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
        type: "text",
        text: item.percentText,
        font: { size: 16, weight: "bold" },
        textColor: "#FFFFFF",
        textAlign: "center",
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
            type: "stack",
            direction: "column",
            gap: 2,
            children: [
              {
                type: "text",
                text: item.percentText,
                font: { size: 16, weight: "bold" },
                textColor: "#FFFFFF",
                maxLines: 1,
              },
              {
                type: "text",
                text: item.name,
                font: { size: 11, weight: "semibold" },
                textColor: "#FFFFFF",
                maxLines: 1,
              },
            ],
          },
          {
            type: "stack",
            direction: "column",
            gap: 2,
            flex: 1,
            children: [
              {
                type: "text",
                text: `${item.usedText} / ${item.totalText}`,
                font: { size: 10, weight: "medium" },
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
            font: { size: 15, weight: "semibold" },
            textColor: "#151821",
            maxLines: 2,
          },
          {
            type: "text",
            text: "支持 10 组机场名称、订阅链接和重置日",
            font: { size: 12, weight: "medium" },
            textColor: "#7C8193",
            maxLines: 2,
          },
        ],
      },
    ],
  };
}

function gaugeColor(ratio) {
  if (ratio >= 0.9) return "#F05C4E";
  if (ratio >= 0.75) return "#F6A63A";
  return "#6B8CFF";
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
