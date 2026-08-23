/**
 * dsh-deepseek-cost 宿主端类型声明。
 * 把 `deepseekCost` 键合并进会话投影类型表,供 TypeScript 消费者使用。
 */
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection';

/** 单个模型的行:token 桶合计与费用。 */
export interface DeepseekCostModelRow {
  /** 模型名(provider 侧的模型 id)。 */
  model: string;
  /** 路由 provider。 */
  provider: string | null;
  /** 输入 tokens(缓存未命中)。 */
  inputMissTokens: number;
  /** 输入 tokens(缓存命中)。 */
  cacheHitTokens: number;
  /** 缓存写入 tokens(按未命中价格计)。 */
  cacheWriteTokens: number;
  /** 输出 tokens。 */
  outputTokens: number;
  /** 该模型总费用。 */
  cost: number;
  /** 高峰时段费用。 */
  costPeak: number;
  /** 低谷时段费用。 */
  costOffpeak: number;
  /** 是否有匹配的价格条目。 */
  priced: boolean;
  /** 命中的价格条目模型名。 */
  matchedModel: string | null;
  /** 该模型第一个用量样本的时间(epoch ms)。 */
  firstTime: number | null;
  /** 该模型最后一个用量样本的时间(epoch ms)。 */
  lastTime: number | null;
}

/** `deepseekCost` 投影单元的值(客户端 `useProjection('deepseekCost')` 读取)。 */
export interface DeepseekCostProjection {
  version: 1;
  /** 币种(默认 'CNY')。 */
  currency: string;
  /** 价格参考来源 URL。 */
  pricingSource: string;
  /** 总费用。 */
  totalCost: number;
  /** 高峰时段总费用。 */
  costPeak: number;
  /** 低谷时段总费用。 */
  costOffpeak: number;
  /** 是否启用峰谷定价。 */
  peakEnabled: boolean;
  /** 高峰价格倍数。 */
  peakMultiplier: number;
  /** 峰谷窗口配置(客户端按北京时间判定“当前时段”用)。 */
  peakConfig: {
    /** 高峰窗口(半开区间 [start, end));官方:工作日 9–12、14–18。 */
    windows: { start: number; end: number }[];
    weekendOffpeak: boolean;
  };
  /** 计费时段起点(epoch ms);无用量时为 null。 */
  periodStart: number | null;
  /** 计费时段终点(epoch ms);无用量时为 null。 */
  periodEnd: number | null;
  /** 按模型拆分。 */
  models: DeepseekCostModelRow[];
  /** 未匹配到价格的模型名。 */
  unpricedModels: string[];
}

/** 投影单元的内部状态(纯 JSON)。 */
export interface DeepseekCostState {
  route: { provider: string; model: string } | null;
  samples: Record<string, DeepseekCostSample>;
  models: Record<string, DeepseekCostBuckets>;
  order: string[];
}

export interface DeepseekCostSample {
  model: string;
  provider: string;
  period: 'peak' | 'offpeak';
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

export interface DeepseekCostBuckets {
  provider: string | null;
  inputPeak: number;
  inputOff: number;
  readPeak: number;
  readOff: number;
  writePeak: number;
  writeOff: number;
  outPeak: number;
  outOff: number;
  firstTime: number | null;
  lastTime: number | null;
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** DeepSeek API 费用统计:按模型的用量、峰谷费用与计费时段。 */
    deepseekCost: DeepseekCostProjection;
  }
}

/** 插件配置(可在 cordis.patch.yml 的 config: 中覆盖部分定价)。 */
export interface DeepseekCostConfig {
  pricing?: {
    currency?: string;
    peak?: {
      enabled?: boolean;
      multiplier?: number;
      startHour?: number;
      endHour?: number;
      weekendOffpeak?: boolean;
    };
    models?: Record<string, { input: number; cacheHit: number; output: number }>;
    familyFallback?: Record<string, string>;
    providerPattern?: string;
  };
}

export declare const DEEPSEEK_COST_PROJECTION_KEY: 'deepseekCost';
export declare function createDeepseekCostProjectionDefinition(
  pricing: unknown
): ProjectionDefinition<'deepseekCost', DeepseekCostState>;
export declare class DeepseekCostProjection {
  static inject: string[];
  constructor(ctx: any, config?: DeepseekCostConfig): void;
}
export default DeepseekCostProjection;
