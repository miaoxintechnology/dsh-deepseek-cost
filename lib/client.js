window.__ModuleLoader__.load({
  id: 'dsh-deepseek-cost',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var reactModule = require('react');
    // 外壳的模块加载器可能返回 ES 模块命名空间(带 default),也可能直接
    // 返回 CJS exports —— 两种形态都兼容。
    var React = reactModule && reactModule.default && reactModule.default.createElement
      ? reactModule.default
      : reactModule;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var createElement = React.createElement;

    // —— 样式策略:v0.1.2 起全部使用内联样式 ——
    // 不再向 document.head 注入 <style>:新版 DSH 对插件注入的样式表有
    // 接管/清理机制,部分环境(新机器 + 新版本)下注入的样式不会生效,
    // 导致徽标变灰框、面板退化为页面内的一堆文字链接。内联样式不受
    // 该机制影响,任何 DSH 版本与浏览器下都稳定。

    function formatCost(value, currency) {
      var symbol = currency === 'USD' ? '$' : '\u00A5';
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return symbol + '0.00';
      }
      var fixed = value.toFixed(6);
      // 保留至少 2 位小数,最多 6 位,去掉末尾多余的 0。
      var match = /^(\d+)\.(\d*)$/.exec(fixed);
      if (!match) return symbol + fixed;
      var intPart = match[1];
      var frac = match[2].replace(/0+$/, '');
      frac = frac.length < 2 ? frac + '00'.slice(0, 2 - frac.length) : frac;
      return symbol + intPart + '.' + frac;
    }

    function formatTokens(n) {
      if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) return '0';
      if (n < 1000) return String(Math.round(n));
      var units = [
        [1e12, 'T'],
        [1e9, 'B'],
        [1e6, 'M'],
        [1e3, 'K'],
      ];
      for (var i = 0; i < units.length; i++) {
        if (n >= units[i][0]) {
          var v = n / units[i][0];
          return (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + units[i][1];
        }
      }
      return String(Math.round(n));
    }

    function formatTime(ms) {
      if (typeof ms !== 'number' || !Number.isFinite(ms)) return '\u2014';
      var d = new Date(ms);
      var p = function (x) { return (x < 10 ? '0' : '') + x; };
      return (
        d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
        ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
      );
    }

    /** 内联样式常量(颜色优先取宿主主题变量,取不到时用暗色兜底)。 */
    var S = {
      root: {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
      },
      chip: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '2px 8px',
        border: '1px solid var(--ds-border, rgba(127,127,127,.45))',
        borderRadius: '999px',
        font: 'inherit',
        fontSize: '11px',
        lineHeight: '16px',
        cursor: 'pointer',
        background: 'transparent',
        color: 'var(--ds-text-secondary, #c9c9c9)',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      },
      chipCost: {
        fontWeight: 600,
        color: 'var(--ds-text, #ececec)',
      },
      chipSplit: {
        opacity: 0.75,
      },
      chipPeriod: {
        fontWeight: 600,
      },
      chipPeriodPeak: {
        fontWeight: 600,
        color: '#ff9a5c',
      },
      chipPeriodOffpeak: {
        fontWeight: 600,
        color: '#57c98b',
      },
      badge: {
        fontSize: '10px',
        padding: '0 5px',
        borderRadius: '6px',
        background: 'rgba(255,180,60,.18)',
        color: '#ffb43c',
        marginLeft: '4px',
        whiteSpace: 'nowrap',
      },
      panel: {
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        right: 0,
        zIndex: 1000,
        minWidth: '300px',
        maxWidth: '420px',
        padding: '10px 12px',
        borderRadius: '10px',
        border: '1px solid var(--ds-border, rgba(127,127,127,.35))',
        background: 'var(--ds-panel-bg, #1d1d1f)',
        color: 'var(--ds-text, #ececec)',
        boxShadow: '0 8px 24px rgba(0,0,0,.4)',
        fontSize: '12px',
        lineHeight: 1.5,
        textAlign: 'left',
        whiteSpace: 'nowrap',
      },
      panelTotalRow: {
        display: 'flex',
        alignItems: 'baseline',
        gap: '8px',
        marginBottom: '8px',
      },
      panelTotalValue: {
        fontSize: '16px',
        fontWeight: 600,
        color: 'var(--ds-text, #ececec)',
      },
      panelMeta: {
        color: 'var(--ds-text-secondary, #a8a8a8)',
        fontSize: '11px',
        margin: '4px 0 8px',
      },
      table: {
        width: '100%',
        borderCollapse: 'collapse',
      },
      th: {
        textAlign: 'right',
        padding: '3px 6px',
        whiteSpace: 'nowrap',
        color: 'var(--ds-text-secondary, #a8a8a8)',
        fontWeight: 500,
        fontSize: '11px',
      },
      thFirst: {
        textAlign: 'left',
        padding: '3px 6px 3px 0',
        whiteSpace: 'nowrap',
        color: 'var(--ds-text-secondary, #a8a8a8)',
        fontWeight: 500,
        fontSize: '11px',
      },
      td: {
        textAlign: 'right',
        padding: '3px 6px',
        whiteSpace: 'nowrap',
      },
      tdFirst: {
        textAlign: 'left',
        padding: '3px 6px 3px 0',
        whiteSpace: 'nowrap',
      },
      trWithBorder: {
        borderTop: '1px solid var(--ds-border, rgba(127,127,127,.25))',
      },
      link: {
        color: 'var(--ds-text-secondary, #a8a8a8)',
        textDecoration: 'none',
      },
    };

    /**
     * 用投影值下发的峰谷窗口配置判定“当前时刻”(北京时间)的时段。
     * @returns {'peak'|'offpeak'|null} null = 未启用峰谷定价。
     */
    function currentPeriod(value) {
      if (!value || value.peakEnabled !== true || !value.peakConfig) return null;
      var cfg = value.peakConfig;
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        weekday: 'short',
        hour: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date());
      var weekday = '';
      var hour = 0;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'weekday') weekday = parts[i].value;
        if (parts[i].type === 'hour') hour = Number(parts[i].value);
      }
      if (cfg.weekendOffpeak && (weekday === 'Sat' || weekday === 'Sun')) {
        return 'offpeak';
      }
      // 多窗口判定(官方:工作日 9:00–12:00、14:00–18:00);
      // 兼容旧版 startHour/endHour 单窗口值。
      var windows = Array.isArray(cfg.windows) && cfg.windows.length > 0
        ? cfg.windows
        : Number.isFinite(cfg.startHour) && Number.isFinite(cfg.endHour)
          ? [{ start: cfg.startHour, end: cfg.endHour }]
          : null;
      if (!windows) return 'offpeak';
      for (var i = 0; i < windows.length; i++) {
        var s = windows[i].start;
        var e = windows[i].end;
        var inWindow = e > s ? hour >= s && hour < e : hour >= s || hour < e;
        if (inWindow) return 'peak';
      }
      return 'offpeak';
    }

    /**
     * 时段花名:
     * 峰时 “梁文峰　　请注意钱包安全”,谷时 “梁文谷　　请放心大胆使用”。
     */
    function periodName(period) {
      if (period === 'peak') {
        return '\u6881\u6587\u5CF0\u3000\u3000\u8BF7\u6CE8\u610F\u94B1\u5305\u5B89\u5168';
      }
      if (period === 'offpeak') {
        return '\u6881\u6587\u8C37\u3000\u3000\u8BF7\u653E\u5FC3\u5927\u80C6\u4F7F\u7528';
      }
      return null;
    }

    function CostChip(props) {
      var useProjection = props.useProjection;
      var value = useProjection ? useProjection('deepseekCost') : undefined;
      var openState = useState(false);
      var open = openState[0];
      var setOpen = openState[1];
      // 每分钟 tick 一次,让时段徽标跨 9:00/12:00/14:00/18:00 与周末
      // 边界自动翻转。
      var tickState = useState(0);
      var tick = tickState[0];
      var setTick = tickState[1];
      useEffect(function () {
        var id = setInterval(function () {
          setTick(function (t) { return t + 1; });
        }, 60 * 1000);
        return function () { clearInterval(id); };
      }, []);
      void tick;

      if (!value || !Array.isArray(value.models)) {
        return null;
      }
      var hasUsage = value.models.length > 0;

      var currency = value.currency || 'CNY';
      var peakEnabled = value.peakEnabled === true;
      var period = currentPeriod(value);
      var periodLabel = periodName(period);
      var split = '';
      if (peakEnabled) {
        split =
          '\u5CF0 ' + formatCost(value.costPeak, currency) +
          ' / \u8C37 ' + formatCost(value.costOffpeak, currency);
      }
      var unpriced = Array.isArray(value.unpricedModels) && value.unpricedModels.length > 0;

      var rows = value.models.map(function (row, index) {
        var name = row.model;
        if (!row.priced) name += '\uFF08\u672A\u5B9A\u4EF7\uFF09';
        var rowStyle = index === 0 ? undefined : S.trWithBorder;
        return createElement(
          'tr',
          { key: row.model, style: rowStyle },
          createElement('td', { style: S.tdFirst }, name),
          createElement('td', { style: S.td }, formatTokens(row.inputMissTokens)),
          createElement('td', { style: S.td }, formatTokens(row.cacheHitTokens)),
          createElement('td', { style: S.td }, formatTokens(row.outputTokens)),
          createElement('td', { style: S.td }, formatCost(row.cost, currency))
        );
      });

      var periodSpan = periodLabel
        ? createElement(
            'span',
            {
              style: period === 'peak' ? S.chipPeriodPeak : S.chipPeriodOffpeak,
            },
            '\u65F6\u6BB5\uFF1A' + periodLabel
          )
        : null;

      return createElement(
        'div',
        { style: S.root },
        createElement(
          'button',
          {
            type: 'button',
            style: S.chip,
            title:
              'DeepSeek API \u8D39\u7528\uFF08\u672C\u4F1A\u8BDD\u7D2F\u8BA1\uFF09\uFF1A' +
              (hasUsage
                ? value.models
                    .map(function (m) {
                      return (
                        m.model + ' ' + formatCost(m.cost, currency) +
                        (m.priced ? '' : '\uFF08\u672A\u5B9A\u4EF7\uFF09')
                      );
                    })
                    .join('\uFF0C')
                : '\u6682\u65E0\u7528\u91CF') +
              '\uFF1B\u5F53\u524D\u65F6\u6BB5\uFF1A' +
              (periodLabel ?? '\u5CF0\u8C37\u672A\u542F\u7528'),
            onClick: function () {
              setOpen(!open);
            },
          },
          createElement('span', null, 'DeepSeek'),
          createElement(
            'span',
            { style: S.chipCost },
            formatCost(value.totalCost, currency)
          ),
          periodSpan,
          unpriced
            ? createElement('span', { style: S.badge }, '\u90E8\u5206\u672A\u5B9A\u4EF7')
            : null
        ),
        open
          ? createElement(
              'div',
              { style: S.panel },
              createElement(
                'div',
                { style: S.panelTotalRow },
                createElement('span', { style: S.panelTotalValue }, formatCost(value.totalCost, currency)),
                createElement('span', { style: S.chipSplit }, split)
              ),
              createElement(
                'div',
                { style: S.panelMeta },
                '\u8BA1\u8D39\u65F6\u6BB5\uFF1A' +
                  formatTime(value.periodStart) + ' \u2013 ' + formatTime(value.periodEnd)
              ),
              periodLabel
                ? createElement(
                    'div',
                    { style: S.panelMeta },
                    '\u5F53\u524D\u65F6\u6BB5\uFF1A' +
                      periodLabel +
                      (period === 'peak' ? '\uFF08\u9AD8\u5CF0\u4EF7\uFF09' : '\uFF08\u4F4E\u8C37\u4EF7\uFF09')
                  )
                : null,
              hasUsage
                ? createElement(
                    'table',
                    { style: S.table },
                    createElement(
                      'thead',
                      null,
                      createElement(
                        'tr',
                        null,
                        createElement('th', { style: S.thFirst }, '\u6A21\u578B'),
                        createElement('th', { style: S.th }, '\u8F93\u5165\uFF08\u672A\u547D\u4E2D\uFF09'),
                        createElement('th', { style: S.th }, '\u7F13\u5B58\u547D\u4E2D'),
                        createElement('th', { style: S.th }, '\u8F93\u51FA'),
                        createElement('th', { style: S.th }, '\u8D39\u7528')
                      )
                    ),
                    createElement('tbody', null, rows)
                  )
                : createElement(
                    'div',
                    { style: S.panelMeta },
                    '\u6682\u65E0\u7528\u91CF\u8BB0\u5F55'
                  ),
              createElement(
                'div',
                { style: { color: S.panelMeta.color, fontSize: S.panelMeta.fontSize, marginTop: '8px' } },
                '\u4EF7\u683C\u53C2\u8003\uFF1A',
                createElement(
                  'a',
                  {
                    style: S.link,
                    href: value.pricingSource || 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
                    target: '_blank',
                    rel: 'noreferrer noopener',
                  },
                  'DeepSeek API \u5B98\u65B9\u5B9A\u4EF7'
                )
              )
            )
          : null
      );
    }

    var inject = ['slots'];

    async function apply(ctx) {
      var disposers = [];
      try {
        disposers.push(
          ctx.slots.inject('conversation.composer.dock', function () {
            return ctx.slots.register(
              {
                name: 'conversation.composer.dock',
                id: 'deepseek-cost',
                order: 50,
                label: 'DeepSeek API \u8D39\u7528',
              },
              CostChip
            );
          })
        );
      } catch (error) {
        for (var i = disposers.length - 1; i >= 0; i--) {
          try { disposers[i](); } catch (e) { /* noop */ }
        }
        throw error;
      }
      return async function () {
        for (var i = disposers.length - 1; i >= 0; i--) {
          try { disposers[i](); } catch (e) { /* noop */ }
        }
      };
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
