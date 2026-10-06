/**
 * dsh-deepseek-cost —— DeepSeek API 费用统计插件(宿主端入口)。
 *
 * 一个插件类承担两块职责:
 *  1. 会话投影单元 `deepseekCost`(逻辑在 lib/projection.js):自动读取
 *     模型名称、provider 上报用量与事件时段,按官方价格表与峰谷规则
 *     (高峰窗口 + 周末/法定节假日谷价)计算费用;
 *  2. DeepSeek 官方余额查询 Remote 服务 `deepseekBalance`:用 DSH 已
 *     配置的 DeepSeek API Key 调用官方 GET /user/balance,客户端面板
 *     通过 Remote 读取并显示账户余额。
 *
 * 节假日数据三层策略(见 lib/holidays.js):内置 2026 官方安排 +
 * 农历算法兜底(2027–2099)+ 运行时每 24h 从 CDN 拉取 holiday-cn
 * 精确数据自动覆盖;拉取失败静默回退,不影响运行。
 */
import {
  Remote,
  TypertRemoteService,
} from '@deepseek-ai/dsh-typert-protocol';
import { normalizePricing } from './pricing.js';
import {
  createDeepseekCostProjectionDefinition,
  DEEPSEEK_COST_PROJECTION_KEY,
} from './projection.js';
import { replaceYearWithJson } from './holidays.js';

// —— TypeScript 装饰器运行时助手(与 tsdown 编译产物一致)——
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
  var useValue = arguments.length > 2;
  for (var i = 0; i < initializers.length; i++) {
    value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
  }
  return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
  function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
  var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
  var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
  var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
  var _, done = false;
  for (var i = decorators.length - 1; i >= 0; i--) {
    var context = {};
    for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
    for (var p in contextIn.access) context.access[p] = contextIn.access[p];
    context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
    var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
    if (result === void 0) continue;
    if (result === null || typeof result !== "object") throw new TypeError("Object expected");
    if (_ = accept(result.get)) descriptor.get = _;
    if (_ = accept(result.set)) descriptor.set = _;
    if (_ = accept(result.init)) initializers.unshift(_);
    else if (_ = accept(result.value)) descriptor[key] = _;
  }
  if (target) Object.defineProperty(target, contextIn.name, descriptor);
  done = true;
};

/** holiday-cn 精确数据的 CDN 镜像(jsdelivr,国内可达;{year} 为占位符)。 */
const HOLIDAY_CDN_URL =
  'https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/{year}.json';

/** 官方余额接口。 */
const BALANCE_URL = 'https://api.deepseek.com/user/balance';

/** 包名(Remote 描述符与客户端 bundle 保持一致)。 */
export const PACKAGE_NAME = 'dsh-deepseek-cost';

let DeepseekCostPlugin = (() => {
  let _classSuper = TypertRemoteService;
  let _instanceExtraInitializers = [];
  let _get_decorators;
  return class DeepseekCostPlugin extends _classSuper {
    static {
      const _metadata =
        typeof Symbol === 'function' && Symbol.metadata
          ? Object.create(_classSuper[Symbol.metadata] ?? null)
          : void 0;
      _get_decorators = [Remote('get')];
      __esDecorate(
        this,
        null,
        _get_decorators,
        {
          kind: 'method',
          name: 'get',
          static: false,
          private: false,
          access: { has: (obj) => 'get' in obj, get: (obj) => obj.get },
          metadata: _metadata,
        },
        null,
        _instanceExtraInitializers
      );
      if (_metadata)
        Object.defineProperty(this, Symbol.metadata, {
          enumerable: true,
          configurable: true,
          writable: true,
          value: _metadata,
        });
    }

    static inject = ['sessionProjections'];

    constructor(ctx, config) {
      super(ctx, 'deepseekBalance');
      __runInitializers(this, _instanceExtraInitializers);

      const overrides =
        config && typeof config === 'object' && config.pricing
          ? config.pricing
          : undefined;
      this.baseOverrides = overrides ?? {};
      this.pricingHolder = { pricing: normalizePricing(overrides) };

      const definition = createDeepseekCostProjectionDefinition(this.pricingHolder);
      ctx.effect(
        () => ctx.sessionProjections.register(definition),
        'dsh-deepseek-cost: session projection registration'
      );

      // 节假日自动更新:启动立即拉取一次,之后每 24 小时刷新;全部静默失败。
      this.refreshHolidays().catch(() => {});
      ctx.effect(() => {
        let stopped = false;
        const tick = async () => {
          if (stopped) return;
          await this.refreshHolidays().catch(() => {});
          if (!stopped) this._holidayTimer = setTimeout(tick, 24 * 3600 * 1000);
        };
        this._holidayTimer = setTimeout(tick, 24 * 3600 * 1000);
        return () => {
          stopped = true;
          if (this._holidayTimer !== undefined) clearTimeout(this._holidayTimer);
        };
      }, 'dsh-deepseek-cost: holiday auto-update');
    }

    /** 从 CDN 拉取去年/今年/明年的 holiday-cn 精确数据并覆盖近似区间。 */
    async refreshHolidays() {
      const now = new Date();
      const year = now.getFullYear();
      let updated = this.pricingHolder.pricing.peak.holidays;
      let changed = false;
      for (const y of [year - 1, year, year + 1]) {
        try {
          const res = await fetch(HOLIDAY_CDN_URL.replace('{year}', String(y)), {
            signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) continue;
          const data = await res.json();
          const next = replaceYearWithJson(updated, data);
          if (next !== updated) {
            updated = next;
            changed = true;
          }
        } catch {
          /* 拉取失败:静默回退内置数据 */
        }
      }
      if (changed) {
        this.pricingHolder.pricing = normalizePricing({
          ...this.baseOverrides,
          peak: {
            ...(this.baseOverrides?.peak ?? {}),
            holidays: updated,
          },
        });
      }
    }

    /**
     * 解析 DSH 中配置的 DeepSeek API Key。
     * 鸭子类型调用 credentials 服务(不 import 宿主包,跨版本/跨机器
     * 解析安全;品牌在运行时是普通字符串),环境变量兜底。
     */
    async resolveApiKey() {
      try {
        const credentials = this.ctx.get('credentials');
        if (credentials && typeof credentials.resolve === 'function') {
          const resolved = await credentials.resolve('DEEPSEEK_API_KEY');
          if (
            resolved &&
            typeof resolved.value === 'string' &&
            resolved.value.length > 0
          ) {
            return resolved.value;
          }
        }
      } catch {
        /* credentials 服务不可用时走环境变量 */
      }
      const env = process.env.DEEPSEEK_API_KEY;
      if (typeof env === 'string' && env.length > 0) return env;
      return undefined;
    }

    /** 调用官方 GET /user/balance 查询账户余额(Remote 方法)。 */
    async get() {
      const apiKey = await this.resolveApiKey();
      if (!apiKey) {
        return {
          ok: false,
          error:
            '未找到 DeepSeek API Key:请设置 DEEPSEEK_API_KEY 环境变量,或在模型设置中保存 DeepSeek 官方 Key',
        };
      }
      try {
        const res = await fetch(BALANCE_URL, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          if (res.status === 401) {
            return { ok: false, error: '官方接口返回 401:API Key 无效' };
          }
          return { ok: false, error: `官方接口返回 ${res.status}` };
        }
        const data = await res.json();
        const infos = Array.isArray(data?.balance_infos)
          ? data.balance_infos
          : [];
        const info =
          infos.find((entry) => entry?.currency === 'CNY') ?? infos[0];
        return {
          ok: true,
          isAvailable: data?.is_available === true,
          currency:
            typeof info?.currency === 'string' ? info.currency : 'CNY',
          balance:
            typeof info?.total_balance === 'string'
              ? info.total_balance
              : '0.00',
        };
      } catch (error) {
        return {
          ok: false,
          error: `查询失败:${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  };
})();

export { DEEPSEEK_COST_PROJECTION_KEY };

export default DeepseekCostPlugin;
