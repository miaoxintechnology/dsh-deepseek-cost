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
      if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
      var d = new Date(ms);
      var p = function (x) { return (x < 10 ? '0' : '') + x; };
      return (
        d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
        ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
      );
    }

    var STYLE_ID = 'dsh-deepseek-cost-styles';
    function installStyles() {
      if (document.getElementById(STYLE_ID)) return;
      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = [
        '.dsc-root { position: relative; display: inline-flex; align-items: center; }',
        '.dsc-chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; ' +
          'border: 1px solid var(--ds-border, rgba(127,127,127,.3)); border-radius: 999px; ' +
          'font-size: 11px; line-height: 16px; cursor: pointer; background: transparent; ' +
          'color: var(--ds-text-secondary, inherit); user-select: none; }',
        '.dsc-chip:hover { background: var(--ds-hover, rgba(127,127,127,.12)); }',
        '.dsc-chip__cost { font-weight: 600; color: var(--ds-text, inherit); }',
        '.dsc-chip__split { opacity: .75; }',
        '.dsc-chip__period { font-weight: 600; }',
        '.dsc-chip__period--peak { color: #ff9a5c; }',
        '.dsc-chip__period--offpeak { color: #57c98b; }',
        '.dsc-panel { position: absolute; bottom: calc(100% + 8px); right: 0; z-index: 1000; ' +
          'min-width: 300px; max-width: 420px; padding: 10px 12px; border-radius: 10px; ' +
          'border: 1px solid var(--ds-border, rgba(127,127,127,.3)); ' +
          'background: var(--ds-panel-bg, #1e1e1e); color: var(--ds-text, #eee); ' +
          'box-shadow: 0 8px 24px rgba(0,0,0,.35); font-size: 12px; line-height: 1.5; }',
        '.dsc-panel__title { font-weight: 600; margin: 0 0 8px; font-size: 13px; }',
        '.dsc-panel__total { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }',
        '.dsc-panel__total b { font-size: 16px; }',
        '.dsc-panel__meta { color: var(--ds-text-secondary, #aaa); font-size: 11px; margin: 4px 0 8px; }',
        '.dsc-table { width: 100%; border-collapse: collapse; }',
        '.dsc-table th, .dsc-table td { text-align: right; padding: 3px 6px; white-space: nowrap; }',
        '.dsc-table th { color: var(--ds-text-secondary, #aaa); font-weight: 500; font-size: 11px; }',
        '.dsc-table th:first-child, .dsc-table td:first-child { text-align: left; padding-left: 0; }',
        '.dsc-table tr { border-top: 1px solid var(--ds-border, rgba(127,127,127,.2)); }',
        '.dsc-table tr:first-child { border-top: none; }',
        '.dsc-badge { font-size: 10px; padding: 0 5px; border-radius: 6px; ' +
          'background: rgba(255,180,60,.18); color: #ffb43c; margin-left: 4px; }',
        '.dsc-link { color: var(--ds-text-secondary, #aaa); text-decoration: none; }',
        '.dsc-link:hover { text-decoration: underline; }',
      ].join('\n');
      document.head.appendChild(style);
    }

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
      // 每分钟 tick 一次,让时段徽标跨 9:00 / 23:00 / 周末边界自动翻转。
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

      var rows = value.models.map(function (row) {
        var name = row.model;
        if (!row.priced) name += '\uFF08\u672A\u5B9A\u4EF7\uFF09';
        return React.createElement(
          'tr',
          { key: row.model },
          React.createElement('td', null, name),
          React.createElement('td', null, formatTokens(row.inputMissTokens)),
          React.createElement('td', null, formatTokens(row.cacheHitTokens)),
          React.createElement('td', null, formatTokens(row.outputTokens)),
          React.createElement('td', null, formatCost(row.cost, currency))
        );
      });

      return React.createElement(
        'div',
        { className: 'dsc-root' },
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'dsc-chip',
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
          React.createElement('span', null, 'DeepSeek'),
          React.createElement(
            'span',
            { className: 'dsc-chip__cost' },
            formatCost(value.totalCost, currency)
          ),
          periodLabel
            ? React.createElement(
                'span',
                {
                  className:
                    'dsc-chip__period dsc-chip__period--' + period,
                },
                '\u65F6\u6BB5\uFF1A' + periodLabel
              )
            : null,
          unpriced
            ? React.createElement('span', { className: 'dsc-badge' }, '\u90E8\u5206\u672A\u5B9A\u4EF7')
            : null
        ),
        open
          ? React.createElement(
              'div',
              { className: 'dsc-panel' },
              React.createElement(
                'div',
                { className: 'dsc-panel__total' },
                React.createElement('b', null, formatCost(value.totalCost, currency)),
                React.createElement('span', { className: 'dsc-chip__split' }, split)
              ),
              React.createElement(
                'div',
                { className: 'dsc-panel__meta' },
                '\u8BA1\u8D39\u65F6\u6BB5\uFF1A' +
                  formatTime(value.periodStart) + ' \u2013 ' + formatTime(value.periodEnd)
              ),
              periodLabel
                ? React.createElement(
                    'div',
                    { className: 'dsc-panel__meta' },
                    '\u5F53\u524D\u65F6\u6BB5\uFF1A' +
                      periodLabel +
                      (period === 'peak' ? '\uFF08\u9AD8\u5CF0\u4EF7\uFF09' : '\uFF08\u4F4E\u8C37\u4EF7\uFF09')
                  )
                : null,
              hasUsage
                ? React.createElement(
                    'table',
                    { className: 'dsc-table' },
                    React.createElement(
                      'thead',
                      null,
                      React.createElement(
                        'tr',
                        null,
                        React.createElement('th', null, '\u6A21\u578B'),
                        React.createElement('th', null, '\u8F93\u5165\uFF08\u672A\u547D\u4E2D\uFF09'),
                        React.createElement('th', null, '\u7F13\u5B58\u547D\u4E2D'),
                        React.createElement('th', null, '\u8F93\u51FA'),
                        React.createElement('th', null, '\u8D39\u7528')
                      )
                    ),
                    React.createElement('tbody', null, rows)
                  )
                : React.createElement(
                    'div',
                    { className: 'dsc-panel__meta' },
                    '\u6682\u65E0\u7528\u91CF\u8BB0\u5F55'
                  ),
              React.createElement(
                'div',
                { className: 'dsc-panel__meta', style: { marginTop: '8px' } },
                '\u4EF7\u683C\u53C2\u8003\uFF1A',
                React.createElement(
                  'a',
                  {
                    className: 'dsc-link',
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
      installStyles();
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
