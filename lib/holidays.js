/**
 * 中国法定节假日数据与计算 —— DeepSeek 峰谷定价的“节假日谷价”依据。
 *
 * 官方规则(2026-08):周末(含调休上班的周末)与中国法定节假日全天按
 * 空闲(低谷)时段计费。
 *
 * 三层数据策略:
 *  1. 内置精确数据:2026 年官方放假安排(国务院办公厅通知,holiday-cn
 *     数据集同源核验);
 *  2. 农历算法兜底:用农历数据表(1900–2100)计算 2027–2099 年每年的
 *     法定节假日(元旦 1 天、春节 3 天、清明、劳动节 1 天、端午 1 天、
 *     中秋 1 天、国庆 3 天)并转成日期区间;未公布的年份按“法定核心
 *     日”近似,调休桥接日由第 3 层补齐;
 *  3. 运行时自动更新:宿主插件启动时及每 24 小时从 CDN 拉取
 *     holiday-cn 精确数据(jsdelivr 镜像,国内可达),覆盖对应年份的
 *     近似区间;拉取失败时静默回退内置数据,绝不影响插件运行。
 */

/** 农历数据表 1900–2100(每年一个编码:闰月与大小月信息)。 */
export const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6, // 1970-1979
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050-2059
  0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060-2069
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070-2079
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080-2089
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a4d0, 0x0d150, 0x0f252, // 2090-2099
  0x0d520, // 2100
];

/** 闰月月份(0 = 无闰月)。 */
export function leapMonthOf(year) {
  return LUNAR_INFO[year - 1900] & 0xf;
}

/** 闰月天数(0/29/30)。 */
export function leapDaysOf(year) {
  return leapMonthOf(year) ? (LUNAR_INFO[year - 1900] & 0x10000 ? 30 : 29) : 0;
}

/** 农历某年某月(非闰)的天数。 */
export function monthDaysOf(year, month) {
  return LUNAR_INFO[year - 1900] & (0x10000 >> month) ? 30 : 29;
}

/** 农历某年总天数。 */
export function lunarYearDays(year) {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    if (LUNAR_INFO[year - 1900] & i) sum += 1;
  }
  return sum + leapDaysOf(year);
}

/**
 * 公历 → 农历(仅返回 {lYear, lMonth, lDay, isLeap},足够节假日计算)。
 * 有效区间 1900-01-31 ~ 2100-12-31。
 */
export function solarToLunar(year, month, day) {
  let offset =
    (Date.UTC(year, month - 1, day) - Date.UTC(1900, 0, 31)) / 86400000;
  let i = 1900;
  let temp = 0;
  for (; i < 2101 && offset > 0; i++) {
    temp = lunarYearDays(i);
    offset -= temp;
  }
  if (offset < 0) {
    offset += temp;
    i -= 1;
  }
  const lunarYear = i;
  const leap = leapMonthOf(lunarYear);
  let isLeap = false;
  for (i = 1; i < 13 && offset > 0; i++) {
    if (leap > 0 && i === leap + 1 && !isLeap) {
      i -= 1;
      isLeap = true;
      temp = leapDaysOf(lunarYear);
    } else {
      temp = monthDaysOf(lunarYear, i);
    }
    if (isLeap && i === leap + 1) isLeap = false;
    offset -= temp;
  }
  if (offset === 0 && leap > 0 && i === leap + 1) {
    if (isLeap) {
      isLeap = false;
    } else {
      isLeap = true;
      i -= 1;
    }
  }
  if (offset < 0) {
    offset += temp;
    i -= 1;
  }
  return { lYear: lunarYear, lMonth: i, lDay: offset + 1, isLeap };
}

function pad2(value) {
  return (value < 10 ? '0' : '') + value;
}

function dateStr(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * 某年清明节(公历 4 月)的近似日:21 世纪为 4 月 4 日或 5 日。
 * 兜底近似直接覆盖 4-04 与 4-05 两天(多算 1 天无副作用;
 * 精确日期由运行时 holiday-cn 数据替换)。
 */
export function qingmingDaysOf(year) {
  return [4, 5];
}

/**
 * 把“天”列表压缩成闭区间列表(相邻日期自动合并)。
 * @param {string[]} days - 'YYYY-MM-DD' 列表。
 * @returns {{start: string, end: string}[]}
 */
export function rangesFromDays(days) {
  const sorted = [...new Set(days)].sort();
  const ranges = [];
  for (const day of sorted) {
    const last = ranges[ranges.length - 1];
    if (last) {
      const t = new Date(
        Date.UTC(
          Number(last.end.slice(0, 4)),
          Number(last.end.slice(5, 7)) - 1,
          Number(last.end.slice(8)) + 1
        )
      );
      const next = dateStr(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
      if (day === next) {
        last.end = day;
        continue;
      }
    }
    ranges.push({ start: day, end: day });
  }
  return ranges;
}

/**
 * 按农历算法计算某年的法定节假日(近似,仅“法定核心日”,不含调休桥接日):
 * 元旦 1 天;春节 3 天(正月初一~初三);清明 1 天;劳动节 1 天;
 * 端午 1 天;中秋 1 天;国庆 3 天。
 * @returns {{start: string, end: string}[]}
 */
export function computedHolidayRanges(year) {
  const days = [];
  // 元旦
  days.push(dateStr(year, 1, 1));
  // 春节:正月初一~初三
  const firstDay = (() => {
    // 春节通常在 1 月底或 2 月:扫描 1-15 ~ 2-28 找正月初一
    for (let d = 15; d <= 31; d++) {
      const r = solarToLunar(year, 1, d);
      if (r.lMonth === 1 && r.lDay === 1) return { m: 1, d };
    }
    for (let d = 1; d <= 28; d++) {
      const r = solarToLunar(year, 2, d);
      if (r.lMonth === 1 && r.lDay === 1) return { m: 2, d };
    }
    return { m: 2, d: 5 };
  })();
  for (let k = 0; k < 3; k++) {
    const t = new Date(Date.UTC(year, firstDay.m - 1, firstDay.d + k));
    days.push(dateStr(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()));
  }
  // 清明(近似 4/4、4/5)
  for (const d of qingmingDaysOf(year)) days.push(dateStr(year, 4, d));
  // 劳动节
  days.push(dateStr(year, 5, 1));
  // 端午:五月初五(公历 5 月下旬 ~ 6 月下旬)
  let duanwuFound = false;
  for (let d = 20; d <= 31; d++) {
    const r = solarToLunar(year, 5, d);
    if (r.lMonth === 5 && r.lDay === 5 && !r.isLeap) {
      days.push(dateStr(year, 5, d));
      duanwuFound = true;
      break;
    }
  }
  if (!duanwuFound) {
    for (let d = 1; d <= 30; d++) {
      const r = solarToLunar(year, 6, d);
      if (r.lMonth === 5 && r.lDay === 5 && !r.isLeap) {
        days.push(dateStr(year, 6, d));
        break;
      }
    }
  }
  // 中秋:八月十五(公历 9 月上旬 ~ 10 月上旬)
  let found = false;
  for (let d = 1; d <= 30; d++) {
    const r = solarToLunar(year, 9, d);
    if (r.lMonth === 8 && r.lDay === 15 && !r.isLeap) {
      days.push(dateStr(year, 9, d));
      found = true;
      break;
    }
  }
  if (!found) {
    for (let d = 1; d <= 10; d++) {
      const r = solarToLunar(year, 10, d);
      if (r.lMonth === 8 && r.lDay === 15 && !r.isLeap) {
        days.push(dateStr(year, 10, d));
        break;
      }
    }
  }
  // 国庆 3 天
  for (let d = 1; d <= 3; d++) days.push(dateStr(year, 10, d));
  return rangesFromDays(days);
}

/** 2026 官方放假安排(国务院办公厅通知;holiday-cn 数据集同源)。 */
export const EXACT_2026_HOLIDAY_RANGES = [
  { start: '2026-01-01', end: '2026-01-03' },
  { start: '2026-02-15', end: '2026-02-23' },
  { start: '2026-04-04', end: '2026-04-06' },
  { start: '2026-05-01', end: '2026-05-05' },
  { start: '2026-06-19', end: '2026-06-21' },
  { start: '2026-09-25', end: '2026-09-27' },
  { start: '2026-10-01', end: '2026-10-07' },
];

/** 兜底算法的年份覆盖范围(含)。 */
export const HOLIDAY_COVER_END_YEAR = 2099;

/**
 * 构建默认可用的节假日区间表:2026 官方精确数据 + 2027–2099 农历算法
 * 近似。每年国务院公布新安排后,运行时自动更新会覆盖对应年份。
 * @returns {{start: string, end: string}[]}
 */
export function buildDefaultHolidayRanges() {
  const ranges = [...EXACT_2026_HOLIDAY_RANGES];
  for (let year = 2027; year <= HOLIDAY_COVER_END_YEAR; year++) {
    ranges.push(...computedHolidayRanges(year));
  }
  return ranges;
}

/**
 * 从 holiday-cn 的年度 JSON 中提取节假日天列表(isOffDay 为 true 的日期)。
 * @param {object} data - holiday-cn JSON。
 * @returns {string[]}
 */
export function holidayDaysFromJson(data) {
  if (!data || !Array.isArray(data.days)) return [];
  return data.days
    .filter((entry) => entry && entry.isOffDay === true && typeof entry.date === 'string')
    .map((entry) => entry.date);
}

/**
 * 用精确数据覆盖某年的近似区间:删掉该年旧区间,并入精确区间。
 * @param {{start: string, end: string}[]} current - 当前区间表。
 * @param {object} data - holiday-cn 年度 JSON。
 * @returns {{start: string, end: string}[]} 新表(引用不变时返回原表)。
 */
export function replaceYearWithJson(current, data) {
  const days = holidayDaysFromJson(data);
  if (days.length === 0) return current;
  const year = String(days[0]).slice(0, 4);
  const kept = current.filter((range) => range.start.slice(0, 4) !== year && range.end.slice(0, 4) !== year);
  return [...kept, ...rangesFromDays(days)];
}

/**
 * 判断一个北京时间日期('YYYY-MM-DD')是否落在节假日区间内。
 * @param {string} date - 'YYYY-MM-DD'。
 * @param {{start: string, end: string}[]} ranges - 闭区间列表。
 * @returns {boolean}
 */
export function isHolidayDate(date, ranges) {
  if (!Array.isArray(ranges)) return false;
  for (const range of ranges) {
    if (date >= range.start && date <= range.end) return true;
    if (date < range.start) break; // 表按年份大致有序,提前退出
  }
  return false;
}
