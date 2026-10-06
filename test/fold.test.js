/**
 * dsh-deepseek-cost 宿主折叠逻辑冒烟测试(纯 Node,无 Cordis 依赖)。
 * 运行:node test/fold.test.js
 */
import assert from 'node:assert/strict';
import {
  createDeepseekCostProjectionDefinition,
} from '../lib/projection.js';
import {
  DEFAULT_PRICING,
  classifyPeriod,
  normalizePricing,
  priceUsage,
  roundCost,
} from '../lib/pricing.js';
import {
  buildDefaultHolidayRanges,
  computedHolidayRanges,
  isHolidayDate,
  solarToLunar,
} from '../lib/holidays.js';

const pricing = normalizePricing();
const holder = { pricing };

// —— classifyPeriod:官方公告,工作日北京时间 9:00–12:00、14:00–18:00
//    为高峰,其余(含午间空档与夜间)为低谷;周六/周日与中国法定
//    节假日全天低谷 ——
// 2026-08-24 是周一。
assert.equal(classifyPeriod(pricing, Date.UTC(2026, 7, 24, 2, 0, 0)), 'peak'); // 北京 10:00(上午窗)
assert.equal(classifyPeriod(pricing, Date.UTC(2026, 7, 24, 4, 0, 0)), 'offpeak'); // 北京 12:00(端点不含)
assert.equal(classifyPeriod(pricing, Date.UTC(2026, 7, 24, 5, 0, 0)), 'offpeak'); // 北京 13:00(午间空档)
assert.equal(classifyPeriod(pricing, Date.UTC(2026, 7, 24, 6, 0, 0)), 'peak'); // 北京 14:00(下午窗)
assert.equal(classifyPeriod(pricing, Date.UTC(2026, 7, 24, 10, 0, 0)), 'offpeak'); // 北京 18:00(端点不含)
assert.equal(classifyPeriod(pricing, Date.UTC(2026, 7, 24, 0, 0, 0)), 'offpeak'); // 北京 08:00(09:00 前)
assert.equal(classifyPeriod(pricing, Date.UTC(2026, 7, 24, 15, 0, 0)), 'offpeak'); // 北京 23:00(夜间)
assert.equal(classifyPeriod(pricing, Date.UTC(2026, 7, 23, 19, 0, 0)), 'offpeak'); // 北京周一 03:00
assert.equal(classifyPeriod(pricing, Date.UTC(2026, 7, 22, 6, 0, 0)), 'offpeak'); // 周六 14:00 北京
assert.equal(classifyPeriod(pricing, Date.UTC(2026, 7, 23, 2, 0, 0)), 'offpeak'); // 周日 10:00 北京
// 法定节假日全天低谷(2026 官方安排):
assert.equal(classifyPeriod(pricing, Date.UTC(2026, 9, 1, 6, 0, 0)), 'offpeak'); // 2026-10-01 国庆(周四)14:00
assert.equal(classifyPeriod(pricing, Date.UTC(2026, 1, 20, 6, 0, 0)), 'offpeak'); // 2026-02-20 春节假期(周五)14:00
assert.equal(classifyPeriod(pricing, Date.UTC(2026, 9, 8, 6, 0, 0)), 'peak'); // 2026-10-08 假期后(周四)14:00
// 农历算法兜底:2027 春节初一(农历正月初一)应判低谷
{
  let cny2027 = null;
  for (let d = 15; d <= 31; d++) {
    const r = solarToLunar(2027, 1, d);
    if (r.lMonth === 1 && r.lDay === 1) { cny2027 = { m: 1, d }; break; }
  }
  if (!cny2027) {
    for (let d = 1; d <= 28; d++) {
      const r = solarToLunar(2027, 2, d);
      if (r.lMonth === 1 && r.lDay === 1) { cny2027 = { m: 2, d }; break; }
    }
  }
  assert.ok(cny2027, '2027 春节初一可计算');
  assert.equal(
    classifyPeriod(pricing, Date.UTC(2027, cny2027.m - 1, cny2027.d, 6, 0, 0)),
    'offpeak',
    '2027 春节初一(算法兜底)应为低谷'
  );
}
// 节假日工具函数
assert.equal(isHolidayDate('2026-10-05', pricing.peak.holidays), true);
assert.equal(isHolidayDate('2026-10-08', pricing.peak.holidays), false);
assert.ok(computedHolidayRanges(2099).length > 0, '2099 年有兜底节假日');
assert.ok(buildDefaultHolidayRanges().some((r) => r.start === '2099-01-01'), '默认表覆盖到 2099');
// 旧版 startHour/endHour 单窗口配置自动转换为 windows
const legacy = normalizePricing({ peak: { startHour: 8, endHour: 23 } });
assert.deepEqual(legacy.peak.windows, [{ start: 8, end: 23 }]);
assert.equal(classifyPeriod(legacy, Date.UTC(2026, 7, 24, 3, 0, 0)), 'peak'); // 北京 11:00 落旧窗口
// 关闭峰谷后全部 offpeak
assert.equal(classifyPeriod(normalizePricing({ peak: { enabled: false } }), Date.UTC(2026, 7, 24, 6, 0, 0)), 'offpeak');

// —— priceUsage 数学 ——
const usage = priceUsage(pricing, { inputTokens: 1000, cacheReadTokens: 4000, outputTokens: 500 }, 'deepseek-chat', 'peak');
assert.equal(usage.cost, 0.016); // (1000*2+4000*0.5+500*8)/1e6*2
const family = priceUsage(pricing, { inputTokens: 100, outputTokens: 100 }, 'deepseek-chat-2026', 'offpeak');
assert.equal(family.priced, true);
assert.equal(family.matchedModel, 'deepseek-chat');
const unknown = priceUsage(pricing, { inputTokens: 100, outputTokens: 100 }, 'some-other-model', 'offpeak');
assert.equal(unknown.priced, false);
assert.equal(unknown.cost, 0);

// —— 官方 V4 价目表(2026-08,高峰 = 低谷 × 2)—— ——
// v4-pro 高峰:1M 输入未命中 + 1M 输出 = 9 + 27
assert.equal(priceUsage(pricing, { inputTokens: 1e6, outputTokens: 1e6 }, 'deepseek-v4-pro', 'peak').cost, 36);
// v4-pro 低谷:1M 缓存命中 = 0.15
assert.equal(priceUsage(pricing, { cacheReadTokens: 1e6 }, 'deepseek-v4-pro', 'offpeak').cost, 0.15);
// v4-flash 低谷:1M 输入未命中 = 1.5;缓存命中 = 0.05;输出 = 4.5
assert.equal(priceUsage(pricing, { inputTokens: 1e6 }, 'deepseek-v4-flash', 'offpeak').cost, 1.5);
assert.equal(priceUsage(pricing, { cacheReadTokens: 1e6 }, 'deepseek-v4-flash', 'offpeak').cost, 0.05);
assert.equal(priceUsage(pricing, { outputTokens: 1e6 }, 'deepseek-v4-flash', 'offpeak').cost, 4.5);
// v4-flash 高峰:1M 输入未命中 = 3.0
assert.equal(priceUsage(pricing, { inputTokens: 1e6 }, 'deepseek-v4-flash', 'peak').cost, 3.0);
// 版本化别名与 vision-exp
assert.equal(priceUsage(pricing, { inputTokens: 1e6 }, 'deepseek-v4-flash-0731', 'offpeak').cost, 1.5);
assert.equal(priceUsage(pricing, { inputTokens: 1e6 }, 'deepseek-v4-pro-0813', 'peak').cost, 9.0);
assert.equal(priceUsage(pricing, { inputTokens: 1e6 }, 'deepseek-v4-flash-vision-exp', 'offpeak').cost, 1.5);

// —— 投影折叠 ——
const def = createDeepseekCostProjectionDefinition(holder);
let state = def.init();
assert.equal(def.stateVersion, 2, 'v2:节假日规则参与时段分类,旧缓存重折');

function ev(type, data, time) {
  return { type, seq: 0, time, data };
}

// 1) 路由
state = def.apply(state, ev('request/context', { provider: 'deepseek-official', model: 'deepseek-chat' }, 0));
assert.deepEqual(state.route, { provider: 'deepseek-official', model: 'deepseek-chat' });

const peakTime = Date.UTC(2026, 7, 24, 6, 0, 0); // 北京周一 14:00(高峰)
const offTime = Date.UTC(2026, 7, 23, 19, 0, 0); // 北京周一 03:00(低谷)

// 2) usage 块先到(部分),随后同 (turn,step) 的 assistant/message 替换之 —— 不重复计数
state = def.apply(
  state,
  ev('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 600, outputTokens: 0 } } }, peakTime)
);
state = def.apply(
  state,
  ev('assistant/message', { turn: 1, step: 1, message: {}, usage: { inputTokens: 1000, cacheReadTokens: 4000, outputTokens: 500 } }, peakTime)
);

// 3) 第二个步骤(低谷)
state = def.apply(
  state,
  ev('assistant/message', { turn: 2, step: 1, message: {}, usage: { inputTokens: 2000, outputTokens: 1000 } }, offTime)
);

// 4) 压缩总结(低谷,自报模型)
state = def.apply(
  state,
  ev('compaction/summary', { compactionId: 'c1', provider: 'deepseek-official', model: 'deepseek-chat', usage: { inputTokens: 3000, outputTokens: 200 } }, offTime)
);

// 5) 非 DeepSeek provider 的路由与消息 —— 忽略
state = def.apply(state, ev('request/context', { provider: 'pi-ai', model: 'pi-ai-1' }, offTime));
state = def.apply(
  state,
  ev('assistant/message', { turn: 3, step: 1, message: {}, usage: { inputTokens: 9999, outputTokens: 9999 } }, offTime)
);

const view = def.view(state);
assert.equal(view.currency, 'CNY');
assert.equal(view.totalCost, 0.0356);
assert.equal(view.costPeak, 0.016);
assert.equal(view.costOffpeak, 0.0196);
assert.deepEqual(view.peakConfig.windows, [
  { start: 9, end: 12 },
  { start: 14, end: 18 },
]);
assert.equal(view.peakConfig.weekendOffpeak, true);
assert.ok(
  view.peakConfig.holidays.some(
    (h) => h.start === '2026-10-01' && h.end === '2026-10-07'
  ),
  'wire 携带 2026 国庆节假日区间'
);
assert.ok(view.peakConfig.holidays.length > 100, 'wire 携带算法兜底至 2099 的节假日表');
assert.equal(view.models.length, 1);
const row = view.models[0];
assert.equal(row.model, 'deepseek-chat');
assert.equal(row.inputMissTokens, 6000); // 1000 + 2000 + 3000
assert.equal(row.cacheHitTokens, 4000);
assert.equal(row.outputTokens, 1700); // 500 + 1000 + 200
assert.equal(row.priced, true);
assert.equal(view.periodStart, offTime);
assert.equal(view.periodEnd, peakTime);
assert.equal(view.unpricedModels.length, 0);

// 6) 未知模型:不计费但保留 tokens 与标注
let s2 = def.init();
s2 = def.apply(s2, ev('request/context', { provider: 'deepseek-official', model: 'brand-new-model' }, offTime));
s2 = def.apply(
  s2,
  ev('assistant/message', { turn: 1, step: 1, message: {}, usage: { inputTokens: 500, outputTokens: 100 } }, offTime)
);
const v2 = def.view(s2);
assert.equal(v2.totalCost, 0);
assert.equal(v2.unpricedModels.length, 1);
assert.equal(v2.models[0].outputTokens, 100);

// 7) V4 全链路折叠:1M 输入未命中 + 1M 缓存命中 + 1M 输出,高峰
//    = (1.5×2 + 0.05×2 + 4.5×2) = 3 + 0.1 + 9 = 12.1
let s3 = def.init();
s3 = def.apply(s3, ev('request/context', { provider: 'deepseek-official', model: 'deepseek-v4-flash' }, peakTime));
s3 = def.apply(
  s3,
  ev('assistant/message', { turn: 1, step: 1, message: {}, usage: { inputTokens: 1e6, cacheReadTokens: 1e6, outputTokens: 1e6 } }, peakTime)
);
const v3 = def.view(s3);
assert.equal(v3.totalCost, 12.1);
assert.equal(v3.models[0].model, 'deepseek-v4-flash');
assert.equal(v3.models[0].priced, true);
assert.equal(v3.models[0].matchedModel, 'deepseek-v4-flash');
assert.equal(v3.unpricedModels.length, 0);

// 8) schema 通过解析
const parsed = def.schema.parse(view);
assert.equal(parsed.totalCost, view.totalCost);

// 8b) 新版 DSH(0.1.1-rc.2+)契约:stateSchema 校验折叠状态,
//     wire.view / wire.viewSchema 与旧字段等价
const stateParsed = def.stateSchema.parse(state);
assert.equal(stateParsed.order.length, 1);
assert.equal(stateParsed.models['deepseek-chat'].inputPeak, 1000);
assert.deepEqual(def.wire.view(state), view);
assert.equal(def.wire.viewSchema.parse(view).totalCost, view.totalCost);
assert.equal(def.wire.view(def.init()).models.length, 0);

// 9) 无关事件返回原引用(零下游工作)
const before = state;
const after = def.apply(state, ev('turn/start', { turn: 4 }, offTime));
assert.equal(after, before);

console.log('all fold tests passed');
console.log('sample view:', JSON.stringify(view, null, 2));
console.log('pricing defaults:', JSON.stringify(DEFAULT_PRICING, null, 2));
console.log('roundCost(0.0356) =', roundCost(0.0356));
