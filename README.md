# dsh-deepseek-cost

一个用于 DeepSeek Harness(DSH)Web 聊天页的 **DeepSeek API 费用统计插件**。它在输入框下方的统计行里实时显示当前会话(任务)累计消耗的 DeepSeek API 费用,点击可展开按模型、按峰谷时段的明细。

## 功能

- **自动读取模型名称**:从会话日志的 `request/context` 路由事件和 `compaction/summary` 事件中自动识别每个请求实际使用的 provider 与模型;
- **自动读取用量**:折叠每个步骤的 provider 上报 token 用量(`assistant/message` / usage 块 / 压缩总结调用),同一步骤的早期样本与最终样本按“后到替换”合并,不重复计数;
- **自动读取时段并峰谷计费**:按每个用量事件的时间戳(北京时间)自动归入高峰/低谷桶 —— 工作日高峰时段(9:00–12:00、14:00–18:00)价格翻倍,其余时间、周末与中国法定节假日全天按低谷计费(官方公告);
- **节假日自动更新**:节假日表三层策略 —— 内置 2026 官方放假安排 + 农历算法兜底(2027–**2099**)+ 运行时每 24 小时从 CDN 自动拉取 holiday-cn 精确数据覆盖,拉取失败静默回退内置数据;
- **自动计算费用**:按官方定价页的价格表(CNY / 百万 tokens)计算输入(缓存未命中)、输入(缓存命中)、输出三部分的费用并汇总;
- **账户余额显示**:点开明细面板即调用 DeepSeek 官方 `GET /user/balance` 接口(复用 DSH 已配置的 API Key)显示账户余额与可用状态,支持一键刷新;查询失败仅显示错误提示,不影响费用统计;
- **实时显示**:注册会话投影单元 `deepseekCost`,通过框架的 `session/projection` 推送实时到达页面,零额外网络请求;
- **当前时段徽标**:按当前时刻(北京时间)实时判定峰谷 —— 峰时显示 **梁文峰　请注意钱包安全**,谷时显示 **梁文谷　请放心大胆使用**,每分钟自动翻转(跨 9:00/12:00/14:00/18:00、周末与节假日边界无需刷新页面);
- **未定价模型显式标注**:价格表中不存在的模型(例如未来的新版本号)会显示“未定价/部分未定价”徽标,而不是悄悄按错误价格计费。

## 界面

输入框下方的统计行(composer dock)中会出现:

```
DeepSeek ¥0.0356 时段:梁文峰　请注意钱包安全   ← 峰时(工作日 9:00–12:00、14:00–18:00)
DeepSeek ¥0.0356 时段:梁文谷　请放心大胆使用   ← 谷时(其余时段与周末)
```

时段徽标按当前时刻实时判定,每分钟自动翻转;未启用峰谷定价时隐藏。

点击后展开明细面板:

- 总计 + 峰/谷拆分(峰 ¥x / 谷 ¥x);
- **账户余额**:官方 /user/balance 实时查询,显示 ¥xx.xx + 可用状态 + 刷新按钮;
- 计费时段(本会话第一个到最后一个用量样本的时间);
- 按模型的表格:模型、输入(未命中)、缓存命中、输出、费用;
- 官方定价页链接。

## 安装(给别人用)

### 环境要求

- 已安装 DeepSeek Harness(`dsh` 命令可用),且使用 **web** profile(`dsh web` 启动的那套);
- 方式一/二需要系统里有 `pnpm`(Node 22+ 可通过 `corepack enable pnpm` 获得);
- 方式四不需要 pnpm、不需要网络。

### 方式一:从本地目录安装(推荐,拿到插件文件夹即可)

```bash
dsh plugin --profile web add /path/to/dsh-deepseek-cost
dsh web   # 重启后生效
```

`dsh plugin` 会把 pnpm 参数转发到 web profile 目录执行安装,并自动把
`dsh-deepseek-cost` 追加进 `dsh.profile.bundles`(依赖 `zod` 由 pnpm 一并装好)。

### 方式二:从 Git 仓库安装

```bash
dsh plugin --profile web add github:miaoxintechnology/dsh-deepseek-cost
dsh web
```

> 网络受限(无法访问 GitHub)时:
> - 改用 Gitee 等国内镜像仓库:
>   `dsh plugin --profile web add https://gitee.com/<用户名>/dsh-deepseek-cost.git`;
> - 或直接用离线安装包(见下方「跨设备安装」),完全不需要任何 Git 服务。

本插件**没有任何构建/安装脚本**(无 `prepare`/`build`),因此不需要
`allowBuilds` 授权;如果 pnpm 仍提示,按提示把 key 加入
`~/.dsh/profiles/web/pnpm-workspace.yaml` 的 `allowBuilds` 后重试。

#### 发布到 GitHub(作者侧)

仓库:<https://github.com/miaoxintechnology/dsh-deepseek-cost>(分支 `main`,标签 `v0.1.2`)

1. 本地推送:

   ```bash
   cd dsh-deepseek-cost
   git remote add origin https://github.com/miaoxintechnology/dsh-deepseek-cost.git
   git push -u origin main --tags
   ```

2. GitHub 连不上时,推一份到 Gitee 即可(国内直连稳定):

   ```bash
   git remote add gitee https://gitee.com/<你的用户名>/dsh-deepseek-cost.git
   git push gitee main --tags
   ```

3. 之后任意设备即可按上方方式二安装;更新插件后 `git push` 新提交,
   其它设备 `dsh plugin --profile web update dsh-deepseek-cost` 即可升级。

> 仓库已内置 `.gitignore`(排除 `node_modules/`、构建产物),首次提交
> 即含全部源码、测试与文档,`zod` 依赖由 pnpm 按 `package.json` 自动
> 安装。

### 方式三:从 npm 安装(发布到 npm 后)

```bash
dsh plugin --profile web add dsh-deepseek-cost
dsh web
```

### 方式四:手动安装(无 pnpm / 离线)

1. 把整个插件目录复制到 web profile 的 node_modules 下:

   ```
   ~/.dsh/profiles/web/node_modules/dsh-deepseek-cost\
   ├── package.json
   ├── cordis.patch.yml
   └── lib\  (index.js / client.js / pricing.js / *.d.ts)
   ```

2. 编辑 `~/.dsh/profiles/web/package.json`,在 `dsh.profile.bundles`
   数组末尾追加 `"dsh-deepseek-cost"`。

3. **确认 zod 可解析**:插件运行依赖 `zod@4`。若 profile 里已装过其它
   依赖 zod 的插件(如 `dsh-ai-prompt-optimizer`),顶层 node_modules
   里已有 hoisted 的 zod,无需处理;否则把 `zod@4` 一并复制到
   `~/.dsh/profiles/web/node_modules/zod`(或直接连插件目录自带的
   `node_modules` 一起复制)。

4. 重启:`dsh web`。

### 跨设备安装

1. **搬运插件文件夹**:把整个 `dsh-deepseek-cost` 目录(至少包含
   `package.json`、`cordis.patch.yml`、`lib\`;连同 `node_modules\zod`
   一起复制则离线也能装)拷贝到目标设备 —— U 盘、网盘、局域网共享、
   或打包成 zip(官方分发包即含 zod,单文件 1MB 左右)。

2. **在目标设备上安装**(任选):
   - 有 pnpm:把文件夹放到目标设备任意路径,执行
     `dsh plugin --profile web add <该路径>` —— pnpm 自动装依赖并写
     入该设备的 `dsh.profile.bundles`;
   - 无 pnpm / 离线:按上文「方式四:手动安装」操作 —— 复制文件夹到
     目标设备的 `~/.dsh/profiles/web/node_modules\` 下、在
     `~/.dsh/profiles/web/package.json` 的 `bundles` 里追加
     `"dsh-deepseek-cost"`,重启即可(Windows 的 `~/.dsh` 即
     `C:\Users\<用户>\.dsh`)。

3. 目标设备需已装好 DSH 且至少启动过一次 `dsh web`(profile 已初始化)。

4. **不要**把本机 profile 目录下的 `package.json` / `pnpm-lock.yaml`
   直接拷到别的设备(里面有本机的绝对路径,如 `file:F:/…` 依赖);
   搬运的只有插件文件夹本身。

5. 重启 `dsh web` 后按「验证安装」一节确认。

> 设备很多时,把插件推到 GitHub 仓库或发布到 npm(方式二/三),每台
> 设备一条命令即可安装。

### 验证安装

```bash
dsh --profile web --dump-config | grep deepseek-cost
# 应看到:
# == dsh-deepseek-cost
# - id: deepseek-cost
#   name: dsh-deepseek-cost
```

重启后打开任意会话并产生一次模型回答,输入框下方统计行即出现
`DeepSeek ¥…` 徽标。也可以在「设置 → 插件」中看到
`dsh-deepseek-cost` 处于 active 状态。

### 卸载

```bash
dsh plugin --profile web remove dsh-deepseek-cost
dsh web   # 重启
```

手动安装的卸载:删除 `node_modules/dsh-deepseek-cost` 目录、从
`dsh.profile.bundles` 中移除该条目,然后重启。

## 价格表维护(重要)

价格表在 `lib/pricing.js` 的 `DEFAULT_PRICING` 中,一行一个模型:

```js
models: {
  'deepseek-v4-flash':    { input: 1.5, cacheHit: 0.05, output: 4.5 },
  'deepseek-v4-pro':      { input: 4.5, cacheHit: 0.15, output: 13.5 },
  'deepseek-chat':        { input: 2,   cacheHit: 0.5,  output: 8 },
  'deepseek-reasoner':    { input: 4,   cacheHit: 1,    output: 16 },
},
```

字段含义(每百万 tokens 的 **低谷价**,人民币):

| 字段 | 含义 |
|---|---|
| `input` | 输入价格(缓存未命中) |
| `cacheHit` | 输入价格(缓存命中) |
| `output` | 输出价格 |

峰谷规则(默认):

- 高峰时段:工作日北京时间 `9:00–12:00`、`14:00–18:00`(`peak.windows`,半开区间,官方公告);
- 高峰价 = 低谷价 × 2(`peak.multiplier`,官方公告确认);
- 周六、周日全天按低谷价计费(`peak.weekendOffpeak`);
- **中国法定节假日全天按低谷价计费**(`peak.holidays`,闭区间表)。内置 2026
  官方放假安排(国务院办公厅通知),2027–2099 用农历算法兜底计算法定
  核心日(元旦/春节 3 天/清明/劳动节/端午/中秋/国庆 3 天),并每 24
  小时自动从 CDN 拉取 holiday-cn 精确数据覆盖对应年份(含调休桥接日),
  拉取失败静默回退内置数据。可在配置中整体替换:
  `peak.holidays: [{ start: '2027-01-01', end: '2027-01-01' }, ...]`。

> ✅ **V4 系列已内置官方价目表**(2026-08 峰谷定价,低谷价,¥/百万 tokens):
>
> | 模型 | 输入(未命中) | 输入(命中) | 输出 |
> |---|---|---|---|
> | deepseek-v4-flash | 1.5 | 0.05 | 4.5 |
> | deepseek-v4-pro | 4.5 | 0.15 | 13.5 |
> | deepseek-v4-flash-vision-exp | 1.5 | 0.05 | 4.5 |
>
> 高峰价 = 低谷价 × 2,与官方高峰档完全一致;周末(周六日)全天低谷。
> 版本化别名(`deepseek-v4-flash-0731`、`deepseek-v4-pro-0813`)同样内置。
>
> ⚠ `deepseek-chat` / `deepseek-reasoner` 仍为 2026-08-17 调价前的占位价;
> 官方页若列有二者的新价格,请按页面更新 `lib/pricing.js` 的 `models` 表。
> 未匹配的模型不会被静默计费,而是显示“未定价”徽标。

也可以在 `cordis.patch.yml` 的 `config:` 中覆盖定价(与上表结构相同):

```yaml
- insert:
    - id: deepseek-cost
      name: 'dsh-deepseek-cost'
      config:
        pricing:
          peak: { windows: [{ start: 9, end: 12 }, { start: 14, end: 18 }] }   # 例如:调整高峰窗口
          models:
            deepseek-v4-flash-0901: { input: 1.5, cacheHit: 0.05, output: 4.5 }  # 例如:为新版本号定价
```

## 工作原理

宿主端(`lib/index.js`)注册一个 [会话投影单元](https://github.com/deepseek-ai/deepseek-harness) `deepseekCost`,对会话事件日志做纯函数折叠:

| 事件 | 作用 |
|---|---|
| `request/context` | 记录当前路由(provider + model) |
| `assistant/chunk`(usage 块) | 该步骤的早期用量样本 |
| `assistant/message`(usage 字段) | 该步骤的最终用量样本(替换早期样本) |
| `compaction/summary` | 压缩总结调用的用量(按事件自带 provider/model 归属) |

每个样本按事件时间(北京时间)归入峰/谷桶;投影值由框架负责推送、持久化缓存与页面基线,客户端(`lib/client.js`)只需 `useProjection('deepseekCost')` 读取并渲染 —— 插件本身零额外网络与存储接线。

> **版本兼容**:投影定义同时声明两代会话投影契约 —— DSH ≥ 0.1.1 的
> `stateSchema + wire:{viewSchema, view}` 与 DSH 0.1.0-rc.7 的顶层
> `schema + view`,升级/降级 DSH 都无需改插件。DSH 0.1.1 起宿主侧
> 投影契约变了:旧版只传 `schema`/`view` 会导致快照校验失败、投影值
> 到不了页面,表现为“插件装了但界面没东西”。

## 开发

```bash
node test/fold.test.js   # 折叠逻辑冒烟测试(纯 Node,无 Cordis 依赖)
```

## 更新日志

### v0.3.0

- **节假日谷价(自动更新,兜底至 2099)**:按官方公告,中国法定节假日
  全天低谷。三层策略:内置 2026 官方放假安排 + 农历算法(1900–2100
  农历表)计算 2027–2099 法定核心日 + 每 24h 从 CDN 拉取 holiday-cn
  精确数据自动覆盖(失败静默回退)。投影状态版本升至 v2,旧缓存按新
  规则整体重折;
- **DeepSeek 官方余额查询**:宿主新增 `deepseekBalance` Remote 服务,
  复用 DSH 已配置的 API Key 调用官方 `GET /user/balance`;明细面板
  显示账户余额 + 可用状态 + 刷新按钮,查询失败只显示错误提示;
- 重构:折叠逻辑拆到 `lib/projection.js`(无宿主依赖,可独立测试);
  credentials 服务鸭子类型调用,不引入额外宿主包依赖。

### v0.2.3 / v0.2.x

- 兼容 DSH 0.2.0(`dsh-client-runtime` 移除后更新 `dsh.client.inject`
  与 peer 依赖策略);GitHub 发布工作流与 npm Trusted Publishing(OIDC)。

### v0.1.2

- **修复新机器/新版本 DSH 下 UI 样式失效**:徽标变灰框、时段颜色消失、
  详情面板退化成页面内一堆文字链接。原因:新版 DSH 对插件注入的
  `<style>` 样式表有接管/清理机制,注入样式不再可靠;本版起 UI 全部
  改为**内联样式**,不依赖任何注入样式表,所有版本通用;
- 移除样式注入与 hover 依赖,UI 与宿主主题变量解耦(缺省暗色兜底)。

### v0.1.1

- 会话投影契约适配 DSH 0.1.1(`stateSchema + wire`,兼容旧版 `schema + view`);
- 官方峰谷窗口:工作日 9:00–12:00、14:00–18:00,周末低谷;
- V4 官方价目表(flash / pro / vision-exp);峰谷徽标文案(梁文峰/梁文谷)。

### v0.1.0

- 首个版本:会话投影自动折叠模型名称/用量/时段,按官方价格计费,
  费用徽标 + 明细面板。

## License

[MIT](./LICENSE)
