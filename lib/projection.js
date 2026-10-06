/**
 * dsh-deepseek-cost —— 会话投影单元(纯折叠逻辑,不依赖宿主包)。
 *
 * 对会话事件日志做纯函数折叠:
 *  - `request/context` 读取当前路由(provider + model);
 *  - `assistant/chunk`(usage 块)与 `assistant/message`(usage 字段)读取
 *    每个步骤的 provider 上报用量,同一 (turn, step) 样本“后到替换”;
 *  - `compaction/summary` 读取压缩总结调用的用量(自带 provider/model);
 *  - 每个样本按事件时间(北京时间)与峰谷规则(高峰窗口 + 周末/法定
 *    节假日谷价)归入高峰/低谷桶,按官方价格表计算费用。
 *
 * 状态不可变更新:对无关事件返回原引用(零下游工作);对相关事件返回
 * 新的状态对象(驱动变更通知)。
 */
import { z } from 'zod';
import {
  PRICING_SOURCE,
  classifyPeriod,
  isDeepseekProvider,
  priceUsage,
  roundCost,
} from './pricing.js';

/** 投影单元键名(客户端用 `useProjection('deepseekCost')` 读取)。 */
export const DEEPSEEK_COST_PROJECTION_KEY = 'deepseekCost';

function emptyBuckets() {
  return {
    provider: null,
    inputPeak: 0,
    inputOff: 0,
    readPeak: 0,
    readOff: 0,
    writePeak: 0,
    writeOff: 0,
    outPeak: 0,
    outOff: 0,
    firstTime: null,
    lastTime: null,
  };
}

function initialState() {
  return {
    /** 最新 request/context 路由。 */
    route: null,
    /** 最近一次样本,键为 `${turn}:${step}` 或 `compaction:${id}`。 */
    samples: {},
    /** model → 累计桶。 */
    models: {},
    /** model 的插入顺序。 */
    order: [],
  };
}

/**
 * 把一个样本(token 桶)按 sign(+1/-1)并入 models 表。
 * models 表已被调用方浅拷贝;被触碰的 model 桶在此处拷贝后再变更。
 */
function mergeSample(models, sample, sign) {
  const model =
    typeof sample.model === 'string' && sample.model.length > 0
      ? sample.model
      : 'unknown';
  const existing = models[model];
  const buckets = existing ? { ...existing } : emptyBuckets();
  if (typeof sample.provider === 'string' && sample.provider.length > 0) {
    buckets.provider = sample.provider;
  }
  const peak = sample.period === 'peak';
  buckets.inputPeak += sign * (peak ? sample.input : 0);
  buckets.inputOff += sign * (peak ? 0 : sample.input);
  buckets.readPeak += sign * (peak ? sample.cacheRead : 0);
  buckets.readOff += sign * (peak ? 0 : sample.cacheRead);
  buckets.writePeak += sign * (peak ? sample.cacheWrite : 0);
  buckets.writeOff += sign * (peak ? 0 : sample.cacheWrite);
  buckets.outPeak += sign * (peak ? sample.output : 0);
  buckets.outOff += sign * (peak ? 0 : sample.output);
  models[model] = buckets;
  return existing === undefined ? [model] : [];
}

/** 把一个用量事件折叠进状态(同键样本替换,不重复计数)。 */
function foldUsage(pricing, state, event, key, usage, model, provider) {
  if (!usage || typeof usage !== 'object') return state;
  const input = Number.isFinite(usage.inputTokens) ? usage.inputTokens : 0;
  const cacheRead = Number.isFinite(usage.cacheReadTokens)
    ? usage.cacheReadTokens
    : 0;
  const cacheWrite = Number.isFinite(usage.cacheWriteTokens)
    ? usage.cacheWriteTokens
    : 0;
  const output = Number.isFinite(usage.outputTokens) ? usage.outputTokens : 0;
  if (input === 0 && cacheRead === 0 && cacheWrite === 0 && output === 0) {
    return state;
  }

  const models = { ...state.models };
  const samples = { ...state.samples };
  let order = state.order;

  const previous = samples[key];
  if (previous) {
    mergeSample(models, previous, -1);
  }

  const sample = {
    model,
    provider,
    period: classifyPeriod(pricing, event.time),
    input,
    cacheRead,
    cacheWrite,
    output,
  };
  samples[key] = sample;

  const added = mergeSample(models, sample, +1);
  if (added.length > 0) {
    order = [...order, ...added];
  }
  const buckets = models[sample.model];
  buckets.firstTime =
    buckets.firstTime === null
      ? event.time
      : Math.min(buckets.firstTime, event.time);
  buckets.lastTime =
    buckets.lastTime === null ? event.time : Math.max(buckets.lastTime, event.time);

  return {
    route: state.route,
    samples,
    models,
    order,
  };
}

/** 把一个模型桶渲染为 wire 值。 */
function viewModel(pricing, model, buckets) {
  const peakUsage = {
    inputTokens: buckets.inputPeak + buckets.writePeak,
    cacheReadTokens: buckets.readPeak,
    outputTokens: buckets.outPeak,
  };
  const offUsage = {
    inputTokens: buckets.inputOff + buckets.writeOff,
    cacheReadTokens: buckets.readOff,
    outputTokens: buckets.outOff,
  };
  const peak = priceUsage(pricing, peakUsage, model, 'peak');
  const off = priceUsage(pricing, offUsage, model, 'offpeak');
  const priced = peak.priced || off.priced;
  return {
    model,
    provider: buckets.provider,
    inputMissTokens: buckets.inputPeak + buckets.inputOff,
    cacheHitTokens: buckets.readPeak + buckets.readOff,
    cacheWriteTokens: buckets.writePeak + buckets.writeOff,
    outputTokens: buckets.outPeak + buckets.outOff,
    cost: roundCost(peak.cost + off.cost),
    costPeak: roundCost(peak.cost),
    costOffpeak: roundCost(off.cost),
    priced,
    matchedModel: priced ? peak.matchedModel ?? off.matchedModel : null,
    firstTime: buckets.firstTime,
    lastTime: buckets.lastTime,
  };
}

function viewState(pricing, state) {
  const models = [];
  let totalCost = 0;
  let costPeak = 0;
  let costOffpeak = 0;
  let periodStart = null;
  let periodEnd = null;
  const unpricedModels = [];
  for (const model of state.order) {
    const row = viewModel(pricing, model, state.models[model]);
    if (!row.priced) unpricedModels.push(model);
    totalCost += row.cost;
    costPeak += row.costPeak;
    costOffpeak += row.costOffpeak;
    if (row.firstTime !== null) {
      periodStart =
        periodStart === null ? row.firstTime : Math.min(periodStart, row.firstTime);
      periodEnd =
        periodEnd === null ? row.lastTime : Math.max(periodEnd, row.lastTime);
    }
    models.push(row);
  }
  return {
    version: 2,
    currency: pricing.currency,
    pricingSource: PRICING_SOURCE,
    totalCost: roundCost(totalCost),
    costPeak: roundCost(costPeak),
    costOffpeak: roundCost(costOffpeak),
    peakEnabled: pricing.peak.enabled === true,
    peakMultiplier: Number.isFinite(pricing.peak.multiplier)
      ? pricing.peak.multiplier
      : 1,
    /** 峰谷窗口与节假日配置,供客户端判定“当前时段”。 */
    peakConfig: {
      windows: (Array.isArray(pricing.peak.windows) ? pricing.peak.windows : [])
        .filter((w) => Number.isFinite(w?.start) && Number.isFinite(w?.end))
        .map((w) => ({ start: w.start, end: w.end })),
      weekendOffpeak: pricing.peak.weekendOffpeak !== false,
      holidays: (Array.isArray(pricing.peak.holidays) ? pricing.peak.holidays : [])
        .filter((h) => typeof h?.start === 'string' && typeof h?.end === 'string')
        .map((h) => ({ start: h.start, end: h.end })),
    },
    periodStart,
    periodEnd,
    models,
    unpricedModels,
  };
}

const projectionSchema = z.object({
  version: z.number(),
  currency: z.string(),
  pricingSource: z.string(),
  totalCost: z.number(),
  costPeak: z.number(),
  costOffpeak: z.number(),
  peakEnabled: z.boolean(),
  peakMultiplier: z.number(),
  peakConfig: z.object({
    windows: z.array(z.object({ start: z.number(), end: z.number() })),
    weekendOffpeak: z.boolean(),
    holidays: z.array(z.object({ start: z.string(), end: z.string() })),
  }),
  periodStart: z.number().nullable(),
  periodEnd: z.number().nullable(),
  models: z.array(
    z.object({
      model: z.string(),
      provider: z.string().nullable(),
      inputMissTokens: z.number(),
      cacheHitTokens: z.number(),
      cacheWriteTokens: z.number(),
      outputTokens: z.number(),
      cost: z.number(),
      costPeak: z.number(),
      costOffpeak: z.number(),
      priced: z.boolean(),
      matchedModel: z.string().nullable(),
      firstTime: z.number().nullable(),
      lastTime: z.number().nullable(),
    })
  ),
  unpricedModels: z.array(z.string()),
});

/** 内部折叠状态 schema —— DSH 0.1.1-rc.2+ 用 `stateSchema` 校验持久化状态。 */
const stateSchema = z.object({
  route: z
    .object({ provider: z.string(), model: z.string() })
    .nullable(),
  samples: z.record(
    z.string(),
    z.object({
      model: z.string(),
      provider: z.string(),
      period: z.enum(['peak', 'offpeak']),
      input: z.number(),
      cacheRead: z.number(),
      cacheWrite: z.number(),
      output: z.number(),
    })
  ),
  models: z.record(
    z.string(),
    z.object({
      provider: z.string().nullable(),
      inputPeak: z.number(),
      inputOff: z.number(),
      readPeak: z.number(),
      readOff: z.number(),
      writePeak: z.number(),
      writeOff: z.number(),
      outPeak: z.number(),
      outOff: z.number(),
      firstTime: z.number().nullable(),
      lastTime: z.number().nullable(),
    })
  ),
  order: z.array(z.string()),
});

/**
 * 构造投影单元定义(纯函数,便于测试)。
 *
 * 同时兼容两代 DSH 会话投影契约:
 *  - DSH 0.1.1-rc.2+:stateSchema + wire:{ viewSchema, view };
 *  - DSH 0.1.0-rc.7:顶层 schema + view。
 * @param {{ pricing: object }} pricingHolder - 定价配置持有者(运行时
 *  节假日自动更新会替换 holder.pricing,折叠与视图每次读取最新配置)。
 */
export function createDeepseekCostProjectionDefinition(pricingHolder) {
  const view = (state) => viewState(pricingHolder.pricing, state);
  return {
    key: DEEPSEEK_COST_PROJECTION_KEY,
    // —— DSH 0.1.1-rc.2+ 契约 ——
    stateSchema,
    wire: {
      viewSchema: projectionSchema,
      view,
    },
    // —— DSH 0.1.0-rc.7 旧契约(兼容) ——
    schema: projectionSchema,
    view,
    // v2:节假日谷价规则参与时段分类,旧缓存按新规则整体重折。
    stateVersion: 2,
    init: initialState,
    apply(state, event) {
      const pricing = pricingHolder.pricing;
      switch (event.type) {
        case 'request/context': {
          const provider = event.data?.provider;
          const model = event.data?.model;
          if (typeof provider !== 'string' || typeof model !== 'string') {
            return state;
          }
          const route = { provider, model };
          if (
            state.route &&
            state.route.provider === provider &&
            state.route.model === model
          ) {
            return state;
          }
          return { ...state, route };
        }
        case 'assistant/chunk': {
          const chunk = event.data?.chunk;
          if (!chunk || chunk.type !== 'usage' || !chunk.usage) return state;
          const { turn, step } = event.data;
          if (!Number.isInteger(turn) || !Number.isInteger(step)) return state;
          const route = state.route;
          if (!route || !isDeepseekProvider(pricing, route.provider)) return state;
          return foldUsage(
            pricing,
            state,
            event,
            `${turn}:${step}`,
            chunk.usage,
            route.model,
            route.provider
          );
        }
        case 'assistant/message': {
          const usage = event.data?.usage;
          if (!usage) return state;
          const { turn, step } = event.data;
          if (!Number.isInteger(turn) || !Number.isInteger(step)) return state;
          const route = state.route;
          if (!route || !isDeepseekProvider(pricing, route.provider)) return state;
          return foldUsage(
            pricing,
            state,
            event,
            `${turn}:${step}`,
            usage,
            route.model,
            route.provider
          );
        }
        case 'compaction/summary': {
          const usage = event.data?.usage;
          if (!usage) return state;
          const provider = event.data?.provider;
          const model = event.data?.model;
          if (!isDeepseekProvider(pricing, provider)) return state;
          const key = `compaction:${event.data?.compactionId ?? event.seq}`;
          return foldUsage(pricing, state, event, key, usage, model, provider);
        }
        default:
          return state;
      }
    },
  };
}
