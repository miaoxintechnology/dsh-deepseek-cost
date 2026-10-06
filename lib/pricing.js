/**
 * DeepSeek API 定价表与费用计算。
 *
 * 价格参考官方文档:https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
 * 修改价格时只需编辑本文件中的 DEFAULT_PRICING —— 插件在每次启动时读取它,
 * 无需改动其他代码。
 *
 * 计费规则:
 *  - 所有价格均为“每百万 tokens”的人民币(CNY)价格。
 *  - input(cache miss)   = 未命中缓存的输入(inputTokens)
 *  - input(cache hit)    = 命中缓存的输入(cacheReadTokens)
 *  - output              = 输出(outputTokens)
 *  - cacheWriteTokens(DeepSeek 适配器通常不产生)按 cache miss 价格计。
 *  - 峰谷定价:工作日北京时间 9:00–12:00、14:00–18:00 为高峰时段
 *    (peak.windows,半开区间),其余时间为空闲(低谷)时段;
 *    高峰价 = 低谷价 × peak.multiplier;周六/周日与中国法定节假日
 *    全天按低谷计费(官方公告;节假日表见 lib/holidays.js,内置精确
 *    数据 + 农历算法兜底至 2099 + 运行时 CDN 自动更新)。
 *  - 每个用量样本按事件发生时刻(北京时间)归入高峰或低谷桶。
 */
import {
  buildDefaultHolidayRanges,
  isHolidayDate,
} from './holidays.js';

/** 官方定价页(展示与核对用)。 */
export const PRICING_SOURCE =
  'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';

/**
 * 默认定价配置(低谷价,CNY / 1M tokens)。
 *
 * 每个模型的字段:
 *  - input:    输入价格(缓存未命中)
 *  - cacheHit: 输入价格(缓存命中)
 *  - output:   输出价格
 *
 * 模型匹配规则:先按模型名精确匹配;精确匹配失败时,按“模型名以 family
 * 前缀开头”匹配 familyFallback;再失败则视为未知模型(不计费,并在
 * 展示中标注“未定价”)。
 */
export const DEFAULT_PRICING = {
  /** 计费币种。 */
  currency: 'CNY',
  /** 峰谷定价规则。 */
  peak: {
    /** 是否启用峰谷定价。 */
    enabled: true,
    /** 高峰价 = 低谷价 × multiplier(官方公告确认高峰翻倍)。 */
    multiplier: 2,
    /**
     * 高峰时段窗口(北京时间,半开区间 [start, end))。官方公告:
     * 周一至周五 9:00–12:00、14:00–18:00 为高峰时段,其余时间为
     * 空闲(低谷)时段;周六、周日全天按低谷计费。
     */
    windows: [
      { start: 9, end: 12 },
      { start: 14, end: 18 },
    ],
    /** 周末(周六/周日)是否全天按低谷计费(官方公告确认)。 */
    weekendOffpeak: true,
    /**
     * 中国法定节假日区间(闭区间,'YYYY-MM-DD' 起止),全天按低谷计费。
     * 默认值 = 内置 2026 官方安排 + 农历算法兜底(2027–2099);
     * 运行时由宿主插件每天从 CDN 拉取 holiday-cn 精确数据自动覆盖。
     */
    holidays: buildDefaultHolidayRanges(),
  },
  /** 按模型名精确匹配的价格表。 */
  models: {
    // —— V4 系列:官方价目表(2026-08,低谷价,CNY / 百万 tokens)—— ——
    // deepseek-v4-flash:            输入未命中 1.5 / 命中 0.05 / 输出 4.5
    // deepseek-v4-pro:              输入未命中 4.5 / 命中 0.15 / 输出 13.5
    // deepseek-v4-flash-vision-exp: 同 v4-flash
    // 高峰价 = 低谷价 × 2(官方高峰档与上表完全吻合)。
    'deepseek-v4-flash': { input: 1.5, cacheHit: 0.05, output: 4.5 },
    'deepseek-v4-pro': { input: 4.5, cacheHit: 0.15, output: 13.5 },
    'deepseek-v4-flash-vision-exp': { input: 1.5, cacheHit: 0.05, output: 4.5 },
    // 版本化模型名别名(DeepSeek-V4-Flash-0731 / DeepSeek-V4-Pro-0813):
    'deepseek-v4-flash-0731': { input: 1.5, cacheHit: 0.05, output: 4.5 },
    'deepseek-v4-pro-0813': { input: 4.5, cacheHit: 0.15, output: 13.5 },
    // —— 以下为 2026-08-17 调价前的旧模型占位价;官方页若仍列有
    //    deepseek-chat / deepseek-reasoner 的新价格,请按页面更新 ——
    'deepseek-chat': { input: 2, cacheHit: 0.5, output: 8 },
    'deepseek-reasoner': { input: 4, cacheHit: 1, output: 16 },
  },
  /**
   * 按模型名前缀匹配的价格表(用于同一家族的新版本号)。
   * 注:V4 系列为精确条目(含 -0731/-0813 版本化别名),故意不做前缀
   * 兜底 —— 未来新版本号(如 -0901)不会静默沿用旧价,而是显示
   * “未定价”徽标,提醒你到官方页面核对后在上方 models 中添加。
   */
  familyFallback: {
    'deepseek-chat': 'deepseek-chat',
    'deepseek-reasoner': 'deepseek-reasoner',
  },
  /** 视为 DeepSeek 官方 API 的 provider 名称匹配(正则)。 */
  providerPattern: 'deepseek',
};

/**
 * 归一化 peak 配置:合并覆盖,并兼容旧的 startHour/endHour 单窗口写法
 * (自动转换为单窗口 windows 数组)。
 * @param {object} [override] - 对 DEFAULT_PRICING.peak 的覆盖。
 * @returns {object} 归一化后的 peak 配置。
 */
export function normalizePeak(override) {
  const merged = { ...DEFAULT_PRICING.peak, ...(override ?? {}) };
  const windowsProvided =
    Array.isArray(override?.windows) && override.windows.length > 0;
  const legacyProvided =
    Number.isFinite(merged.startHour) && Number.isFinite(merged.endHour);
  // 显式提供 windows 时直接用;仅提供旧式 startHour/endHour 时,
  // 旧配置优先于默认窗口,转换为单窗口 windows 数组。
  if (!windowsProvided && legacyProvided) {
    merged.windows = [{ start: merged.startHour, end: merged.endHour }];
  }
  // 节假日表:显式提供时整体替换;否则保留默认(内置+算法兜底)。
  if (Array.isArray(override?.holidays)) {
    merged.holidays = override.holidays;
  }
  return merged;
}

/**
 * 归一化配置:把用户配置(可选)与默认配置合并。
 * @param {object} [overrides] - 对 DEFAULT_PRICING 的覆盖(部分字段)。
 * @returns {object} 归一化后的完整配置。
 */
export function normalizePricing(overrides) {
  const merged = {
    currency: overrides?.currency ?? DEFAULT_PRICING.currency,
    peak: normalizePeak(overrides?.peak),
    models: { ...DEFAULT_PRICING.models, ...(overrides?.models ?? {}) },
    familyFallback: {
      ...DEFAULT_PRICING.familyFallback,
      ...(overrides?.familyFallback ?? {}),
    },
    providerPattern:
      overrides?.providerPattern ?? DEFAULT_PRICING.providerPattern,
  };
  return merged;
}

/**
 * 解析一个模型名对应的价格条目。
 * @param {object} pricing - normalizePricing 的结果。
 * @param {string} model - 模型名。
 * @returns {{ entry: {input:number,cacheHit:number,output:number}|null, matched: string|null }}
 */
export function resolveModelPrice(pricing, model) {
  if (typeof model !== 'string' || model.length === 0) {
    return { entry: null, matched: null };
  }
  const exact = pricing.models[model];
  if (exact) return { entry: exact, matched: model };
  for (const [family, target] of Object.entries(pricing.familyFallback)) {
    if (model.startsWith(family)) {
      const entry = pricing.models[target];
      if (entry) return { entry, matched: target };
    }
  }
  return { entry: null, matched: null };
}

/**
 * 判断某 provider 是否属于 DeepSeek 官方 API。
 * @param {object} pricing - normalizePricing 的结果。
 * @param {string|undefined} provider - provider 名。
 * @returns {boolean}
 */
export function isDeepseekProvider(pricing, provider) {
  if (typeof provider !== 'string' || provider.length === 0) return false;
  try {
    return new RegExp(pricing.providerPattern, 'i').test(provider);
  } catch {
    return false;
  }
}

/**
 * 判断一个时刻(epoch ms)是否处于高峰时段。
 * 时区固定为北京时间(Asia/Shanghai)。
 * @param {object} pricing - normalizePricing 的结果。
 * @param {number} timeMs - 事件时间(Unix epoch ms)。
 * @returns {'peak'|'offpeak'}
 */
export function classifyPeriod(pricing, timeMs) {
  if (!pricing.peak.enabled) return 'offpeak';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timeMs));
  let weekday = '';
  let hour = 0;
  let year = 0;
  let month = 0;
  let day = 0;
  for (const part of parts) {
    if (part.type === 'weekday') weekday = part.value;
    if (part.type === 'hour') hour = Number(part.value);
    if (part.type === 'year') year = Number(part.value);
    if (part.type === 'month') month = Number(part.value);
    if (part.type === 'day') day = Number(part.value);
  }
  if (pricing.peak.weekendOffpeak && (weekday === 'Sat' || weekday === 'Sun')) {
    return 'offpeak';
  }
  // 中国法定节假日全天低谷(官方公告)。
  if (
    year > 0 &&
    isHolidayDate(
      `${year}-${(month < 10 ? '0' : '') + month}-${(day < 10 ? '0' : '') + day}`,
      pricing.peak.holidays
    )
  ) {
    return 'offpeak';
  }
  const windows = pricing.peak.windows;
  if (Array.isArray(windows) && windows.length > 0) {
    for (const w of windows) {
      const s = Number(w?.start);
      const e = Number(w?.end);
      if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
      // 半开区间 [start, end);支持跨午夜窗口(如 22:00–06:00)。
      const inWindow = e > s ? hour >= s && hour < e : hour >= s || hour < e;
      if (inWindow) return 'peak';
    }
    return 'offpeak';
  }
  return 'offpeak';
}

/**
 * 为一个用量样本计算费用。
 * @param {object} pricing - normalizePricing 的结果。
 * @param {{inputTokens:number, cacheReadTokens?:number, cacheWriteTokens?:number, outputTokens:number}} usage
 * @param {string} model - 模型名。
 * @param {'peak'|'offpeak'} period - 时段。
 * @returns {{ cost: number, missTokens: number, hitTokens: number, outputTokens: number, priced: boolean, matchedModel: string|null }}
 */
export function priceUsage(pricing, usage, model, period) {
  const missTokens =
    (usage.inputTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
  const hitTokens = usage.cacheReadTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const { entry, matched } = resolveModelPrice(pricing, model);
  if (!entry) {
    return { cost: 0, missTokens, hitTokens, outputTokens, priced: false, matchedModel: null };
  }
  const factor = period === 'peak' ? pricing.peak.multiplier : 1;
  const cost =
    ((missTokens * entry.input + hitTokens * entry.cacheHit + outputTokens * entry.output) / 1_000_000) *
    factor;
  return { cost, missTokens, hitTokens, outputTokens, priced: true, matchedModel: matched };
}

/** 把浮点费用收敛到安全的小数精度,避免浮点噪声。 */
export function roundCost(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1e10) / 1e10;
}
