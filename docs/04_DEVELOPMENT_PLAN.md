# JoB_Find 分阶段开发计划

本文是当前项目的主开发路线图。M1 已经完成 BOSS 浏览器执行层的技术选型，M2-M12 已建立从岗位采集、用户画像、Agent 简历闭环到本地执行包和投递结果证据的主流程。

截至 2026-07-14，M13“质量基线与可回放工作流”、M15 ProfileAgent 持久化对话、M16 真实模型质量闭环、M16.1 Shadow 评审基础均已完成；M17/M17.1 已完成多意向岗位队列、本地启动器、后端模型配置、四阶段工作台、画像简历上传和人工联系/投递记录。M14 真实动作 canary 仅保留为默认关闭的内部实验，普通用户主路径不提供自动打招呼、上传或投递。

## 0. 开发原则

- 先验证 BOSS 浏览器执行器，再投入业务层实现。
- 后端工作流和 Agent 层不要绑定某一个浏览器执行框架。
- BOSS 层通过 `BrowserExecutor` 抽象承载，下面可以挂多个 adapter。
- Chrome Extension 作为 BOSS 主执行器，依赖用户正常浏览器登录态和内容脚本读取可见页面。
- Firecrawl 仅作为 scrape-only 辅助候选，不承载 BOSS 主交互。
- Local Playwright 不作为 BOSS 主执行器；后续只在用户确认的文件上传/投递入口实验中评估。
- Agent 输出必须结构化、可校验、可回放。
- 自动投递默认关闭；任何真实对外动作都必须可审计、可停止。
- 遇到验证码、登录失效、页面风控或选择器失效时暂停，不绕过。

## 1. 当前基线

当前已经存在：

- Chrome Manifest V3 插件：`extension/`
- Node 本地后端：`server/`
- 岗位采集、自动打开详情补齐 JD、自动同步后端
- SQLite 本地库：`server/data/boss_find.sqlite3`
- 文档体系：PRD、架构、Agent workflow、BOSS 平台逻辑

当前不足：

- M16 已覆盖真实模型稳定性、token、延迟和同一输入多次采样方差；模型单价尚未配置，因此还不能给出可信的实际费用。
- 固定样本仍需持续吸收真实但匿名化的误筛、漏筛、JD 必要项识别和 claim/Audit 失败案例。
- 真实 BOSS 页面仍是最大平台风险，选择器和风控行为必须继续通过人工登录环境验证。

## 2. 阶段总览

| 阶段 | 名称 | 目标 |
|---|---|---|
| M0 | 文档和边界收敛 | 清理无效文档，明确当前架构和路线图 |
| M1 | BrowserExecutor 技术选型 POC | 已收敛：Chrome Extension 承担 BOSS 主执行器 |
| M2 | SQLite 本地入库 | 在执行器路线明确后，建立岗位资料库 |
| M3 | BOSS 采集质量闭环 | 基于选定执行器稳定列表、详情、搜索上下文、去重和诊断 |
| M4 | 工作流状态机 | 建立 applications、browser_tasks、browser_events |
| M5 | 用户画像与真实经历库 | 上传简历、解析、补全经历库和边界 |
| M6 | Agent 岗位筛选 | 根据岗位、公司、用户规则输出评分和 shortlist |
| M7 | 简历定制与审核 | 生成岗位版简历，独立审核真实性和风险 |
| M8 | 打招呼与沟通解锁 POC | 验证 Firecrawl 或 fallback 是否能低人工介入完成沟通动作 |
| M9 | 投递执行 POC 与复盘 | 验证投递入口、简历上传/选择、投递结果记录 |
| M10 | Agent 编排与可观测闭环 | 用持久化节点契约和 LangGraph 跑通岗位版简历工作流 |
| M11 | DOCX 与本地执行包 | 固化模板、渲染 QA、执行包和人工检查清单 |
| M14 | 真实动作金丝雀 | 用短时授权、单岗位、一次尝试和 DOM 回读验证真实打招呼 |
| M15 | ProfileAgent 长期画像 | 用持久化多轮对话、草稿确认和版本修订维护上游画像 |
| M16 | 真实模型 Agent 质量闭环 | 接入严格模型节点、遥测、评测持久化和多次采样质量门禁 |
| M16.1 | 真实岗位 Shadow 评审 | 用本地真实 JD 做受预算约束的重复筛选，并持久化人工纠正 |
| M12 | 投递结果证据 | 只读识别并记录当前 BOSS 页面结果，不推进真实动作 |
| M13 | 质量基线与可回放工作流 | 建立 CI、迁移、不可变输入、状态不变量和 Agent 评测集 |

## 3. M0 文档和边界收敛

### 目标

把项目从“临时采集插件”收敛为“本地求职工作流系统”的清晰路线，并明确技术选型 POC 前置。

### 交付物

- README 项目入口。
- PRD、技术架构、Agent workflow、BOSS 平台逻辑文档。
- 当前开发计划。
- 删除重复、过时、和当前代码严重冲突的文档。

### 验收标准

- 新读者能从 README 理解当前能运行什么、未来要做什么。
- 文档不再同时推荐互相冲突的 MVP 路线。
- BOSS 层约束有独立文档承载。
- 开发计划明确 M1 先做 BrowserExecutor 技术选型。

## 4. M1 BrowserExecutor 技术选型 POC

### 目标

在真实或准真实 BOSS 场景中验证浏览器执行层可行性，决定后续 M2/M8/M9 的主执行器。不要在这个阶段先做 SQLite、Agent 或简历生成。

### 候选执行器

```text
BrowserExecutor
  |-- FirecrawlAdapter       优先验证
  |-- ChromeExtensionAdapter 当前原型和 fallback
  `-- LocalPlaywrightAdapter 文件上传/复杂动作兜底
```

### POC 任务

#### POC-1 登录态与 profile

验证 Firecrawl 是否能：

- 打开 BOSS 登录页或已登录页。
- 通过 persistent profile 保存 cookies/localStorage/session。
- 在后续任务中复用登录态。
- 遇到登录失效时返回明确状态，而不是静默失败。

验收：

- 能复用登录态打开 BOSS 搜索页。
- 失败时能判断 `LOGIN_REQUIRED` 或 `CAPTCHA_REQUIRED`。

#### POC-2 M2 岗位和 JD 获取

验证 Firecrawl 是否能：

- 打开指定搜索页。
- 等待列表渲染。
- 读取岗位卡片。
- 逐个打开详情或点击列表项。
- 抽取完整 JD。
- 输出结构化 JSON。

验收：

- 一次任务至少获取 10 个有效岗位。
- 至少 8 个岗位有完整或可用 JD。
- 任务输出包含 title、company、salary、location、detail_url、description。
- 失败项有明确原因。

#### POC-3 M7 打招呼动作

验证 Firecrawl 是否能：

- 打开岗位详情或聊天入口。
- 定位打招呼输入/按钮。
- 填入由后端提供的 greeting 文本。
- 在“发送前”停住或以 dry-run 模式验证按钮状态。
- 在用户明确允许时执行发送并返回页面结果。

验收：

- 能稳定定位打招呼入口。
- 能填入文本。
- 默认不自动发送。
- 发送动作有明确用户授权开关。

#### POC-4 M8/M9 投递入口与文件上传

验证 Firecrawl 是否能：

- 检测是否已解锁简历投递。
- 找到投递/上传/选择简历入口。
- 判断 BOSS 在线简历、附件简历、上传文件三种路径。
- 验证能否上传本地生成的 DOCX/PDF。

验收：

- 能判断 `RESUME_LOCKED` 或 `RESUME_UNLOCKED`。
- 能定位投递入口。
- 文件上传路径必须 POC 成功后才能把 Firecrawl 作为 M9 主执行器。
- 如果文件上传不稳定，M9 使用 LocalPlaywrightAdapter。

### M1 交付物

- `docs/07_BROWSER_EXECUTOR_POC.md`
- `docs/08_FIRECRAWL_DECISION.md`
- 最小 `BrowserExecutor` 接口草案：`server/src/browser-executor/types.js`。
- FirecrawlAdapter POC 脚本：`server/src/browser-executor/firecrawl-adapter.js`、`server/src/browser-executor/firecrawl-tasks.js`、`scripts/m1-firecrawl-poc.js`。
- POC 结果记录：成功、失败、阻塞点、下一步决策。

### M1 决策门

M1 结束必须给出明确决策：

| 决策 | 条件 | 后续 |
|---|---|---|
| Firecrawl 主执行器 | POC-1/2/3 成功，POC-4 可行或有清晰路径 | M3/M8/M9 优先 FirecrawlAdapter |
| Firecrawl + LocalPlaywright 混合 | M2/M7 成功，文件上传或投递不稳定 | M3/M8 Firecrawl，M9 LocalPlaywright |
| Chrome Extension 主执行器 | Firecrawl 登录态或风控不可接受 | 强化现有 Extension |
| LocalPlaywright 主执行器 | Firecrawl hosted/self-host 不适合，但本地自动化可行 | 建 LocalPlaywrightAdapter |

### M1 当前阶段性结论

截至当前 POC：

- Firecrawl API key 已配置成功。
- Firecrawl profile 持久化自检通过，证明 Firecrawl profile 和 interact 基础链路可用。
- Firecrawl scrape-only 对 `m.zhipin.com` 可返回可读 markdown，说明普通内容抓取能力存在。
- 但 BOSS profile-check / interact 路径出现 `ERR_ABORTED` 或最终落到 `about:blank`，尚不能证明 Firecrawl 能承载 BOSS 登录态、点击详情、打招呼和投递入口检测。
- Firecrawl profile 同时写入会有 writer lock，后续 Firecrawl 辅助任务必须串行。
- LocalPlaywright POC 能检测到本机 Edge 并打开受控浏览器，但 BOSS 将受控 profile 引导到登录/安全验证页。
- 用户完成登录后，受控浏览器出现登录界面失效、浏览器闪烁并自动关闭的现象；这被视为 BOSS 风控或受控浏览器不稳定信号，M1 不再继续把 LocalPlaywright 作为主执行器推进。
- Chrome Extension 已经从真实 BOSS 页面同步出 33 条岗位，其中 15 条带可用 JD、30 条符合岗位形态，满足 M1 采集和 JD 阈值。

当前决策：

```text
Firecrawl = scrape-only 辅助候选
ChromeExtensionAdapter = BOSS 主执行器
LocalPlaywrightAdapter = 后续文件上传/投递入口实验候选，不走 M1 主路径
```

除非后续 Firecrawl 能在 BOSS profile-check 上读到真实岗位页面并稳定执行 interact，否则不要把 Firecrawl 作为 BOSS 主执行器。

M1 收尾命令：

```powershell
npm run poc:firecrawl:report
npm run poc:local:report
npm run poc:extension:report
```

预期结论：

- `poc:firecrawl:report` 输出 `scrape_only_candidate`。
- `poc:local:report` 输出 `local_playwright_not_primary_candidate`。
- `poc:extension:report` 输出 `chrome_extension_primary_candidate`。

### M1 停止线

- 不做验证码绕过。
- 不绕过登录。
- 不做反检测、指纹伪装或隐藏请求重放。
- 不在未确认前真实发送打招呼或投递。
- 不为 POC 大规模触发 BOSS 动作。

## 5. M2 SQLite 本地入库

### 目标

将当前 `server/data/jobs.json` 升级为 SQLite 本地数据库，为后续状态机和 Agent 层提供稳定数据基础。

当前实现采用 Node.js `node:sqlite` 的 `DatabaseSync`，避免在 Windows 本地原型阶段引入 `better-sqlite3`/`sqlite3` 的 native 安装和编译成本。Node 当前仍会输出 ExperimentalWarning，后续如果要发布给更多用户，可以再切换到 `better-sqlite3` 或封装兼容层。

### 交付物

- SQLite 数据文件：`server/data/boss_find.sqlite3`。
- 数据库初始化逻辑：`server/src/sqlite-store.js`。
- `POST /api/jobs/sync` 已改为 upsert 到 SQLite。
- 保留 `GET /api/jobs` 和 `GET /api/jobs.csv`。
- 新增 `GET /api/stats`。
- 首次启动会从旧 `jobs.json` 导入历史数据，并过滤非岗位入口。

### 建议表

- `capture_batches`：已实现。
- `companies`：已实现。
- `jobs`：已实现。
- `job_snapshots`：已实现。
- `job_tags`：已实现。
- `job_welfare`：已实现。

### 验收标准

- 扩展同步后，岗位写入 SQLite。
- 重复同步同一岗位不会产生重复主记录。
- JD 更完整时能更新主记录，同时保留 snapshot。
- CSV 导出仍可用。
- `npm run check` 通过。
- `npm run m2:sqlite:smoke` 通过。

当前验证结果：

- 旧 `server/data/jobs.json` 已导入 SQLite。
- 主库有效岗位为 30 条，带 JD 岗位为 15 条。
- 非岗位噪声为 0 条。
- `job_snapshots` 已记录导入快照。

## 6. M3 BOSS 采集质量闭环

### 目标

基于 M1 选定的执行器，让“岗位及岗位描述资料获取”稳定可诊断，达到 Agent 可用的数据质量。

### 交付物

- 采集批次上下文：城市、关键词、岗位类型、搜索 URL。
- 列表采集字段质量统计。
- 自动详情补齐任务结果统计。
- selector diagnostics 或执行器 diagnostics。
- 无效岗位过滤和重复 URL 归一化。

当前已实现：

- 扩展同步 payload 携带 `pages[*].diagnostics`、`selectorCounts`、`searchContext` 和页面登录/验证码状态。
- SQLite 新增 `capture_quality`，记录每批 `validJobs`、`describedJobs`、`descriptionCoverage`、`requiredFieldCoverage`、缺失字段统计和 selector counts。
- SQLite 新增 `browser_events`，记录 `LOGIN_REQUIRED`、`CAPTCHA_REQUIRED`、`SELECTOR_CHANGED` 等浏览器侧事件。
- 后端新增 `GET /api/quality`。
- 后端新增 `GET /api/events`，可按时间倒序读取最近浏览器异常事件。
- 后端新增 `GET /api/jobs/missing-descriptions`，形成 description 不足岗位的只读待补 JD 队列。
- 后端新增 `GET /api/jobs/keys`，返回已入库岗位 key；扩展启动自动补齐前会合并后端已完成 JD key 和本地缓存 key，减少刷新 BOSS 页面后的重复点击。
- 验证脚本：`npm run m3:quality:smoke`。
- 扩展设置详细页新增“采集质量”面板，展示 JD 覆盖率、字段完整率、无效项、异常摘要、最近异常事件列表和待补 JD 岗位预览；popup 只保留主操作和简要状态。
- 自动补齐描述改为可续跑逻辑：从扩展缓存读取已有 JD 岗位，跳过已补齐和本次已尝试岗位，并在 BOSS 列表没有新目标时滚动触发懒加载。
- 自动补齐弹窗新增过程诊断：显示可见岗位、待点击目标、已跳过数量、滚动次数、最后动作和最后处理岗位，用于定位 BOSS 懒加载停滞、重复跳过或详情采集失败。
- 自动补齐新增阻塞态：检测到登录失效、验证码/安全验证或疑似选择器漂移时暂停任务，标记 blocked/blockingReason，并交给用户处理，不继续滚动或点击。
- 验证脚本：`npm run m3:popup:smoke`。
- 验证脚本：`npm run m3:events:smoke`。
- 验证脚本：`npm run m3:missing:smoke`。
- 验证脚本：`npm run m3:autocrawl:smoke`。
- 验证脚本：`npm run m3:keys:smoke`。

### 验收标准

- 当前 BOSS 搜索条件下可采集至少 10 条有效岗位。
- 每条有效岗位尽量包含 title、company、salary、location、detail_url。
- 自动补齐后，目标岗位有 description；重复点击自动补齐时不会回到第一个已补齐岗位重跑。
- 选择器或交互失败时后端能看到诊断事件。
- 数据库中 description 不足的岗位能形成待补 JD 队列，供下一步补齐任务使用。
- 不执行真实打招呼、上传简历、投递动作。

当前真实库基线：

- 有效岗位 30 条。
- 带 JD 岗位 15 条。
- JD 覆盖率 50%。
- 必需字段覆盖率 100%。
- 非岗位噪声 0 条。

## 7. M4 工作流状态机

### 目标

把岗位从“数据库记录”升级为“可推进的求职工作流”。

### 交付物

- `applications` 表。
- `application_events` 表。
- `browser_tasks` 表。
- `browser_events` 表。
- 状态转移服务。
- 调试接口。

当前已实现的最小切片：

- SQLite 新增 `applications` 与 `application_events`。
- 岗位同步时自动创建 application。
- 无完整 JD 的岗位进入 `LIST_CAPTURED`，补齐 JD 后推进到 `DETAIL_CAPTURED`。
- 后端新增 `GET /api/applications` 与 `GET /api/application-events`。
- 后端新增 `POST /api/applications/:id/transition`，所有后续 Agent 和浏览器任务都应通过受控状态转移推进 application，不直接改表。
- 验证脚本：`npm run m4:applications:smoke`。
- SQLite 新增 `browser_tasks`，用于记录发送给 Chrome Extension/BrowserExecutor 的任务意图和执行结果。
- 后端新增 `GET /api/browser-tasks`、`POST /api/browser-tasks`、`GET /api/browser-tasks/:id`、`POST /api/browser-tasks/:id/transition`。
- 后端新增 `POST /api/browser-tasks/claim`，原子领取一个 `QUEUED` 任务并推进到 `RUNNING`，避免扩展重复处理同一任务。
- 浏览器任务状态先收敛为 `QUEUED`、`RUNNING`、`SUCCEEDED`、`FAILED`、`CANCELED`；任务类型先覆盖 `CAPTURE_DETAIL`、`SEND_GREETING`、`REFRESH_CONVERSATION`、`CHECK_RESUME_UNLOCK`、`UPLOAD_RESUME`、`SUBMIT_APPLICATION`。
- Chrome Extension popup 收敛为“开始岗位信息采集 / 暂停 / 重试”三个主操作；“开始”和“重试”把当前页采集、同步、入队和当前页 `CAPTURE_DETAIL` 队列处理串成一个用户触发动作。
- 原有任务诊断、采集质量、最近异常、待补 JD 和最近采集预览迁移到设置详细页。
- `POST /api/browser-tasks/claim` 支持按 `sourceUrl/pageUrl` 过滤，避免当前页面误领取其它 BOSS 页面或历史页面生成的任务。
- 后端创建任务时会尝试用 payload 的 `jobId/detailUrl/sourceKey` 自动绑定 application，并跳过同一 application + taskType 下仍处于 `QUEUED/RUNNING` 的重复任务。
- 后端新增 `GET /api/browser-tasks/diagnostics`，汇总任务 `QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELED` 计数、失败原因分布、最近任务和最近失败任务。
- `CAPTURE_DETAIL` 失败会带结构化 `errorCode`，当前覆盖 `LOGIN_REQUIRED`、`SECURITY_CHECK`、`SELECTOR_CHANGED`、`JOB_NOT_VISIBLE`、`DETAIL_EMPTY`、`TASK_PAGE_MISMATCH`、`BROWSER_TASK_FAILED`。
- 浏览器任务 transition 到 `FAILED` 时会自动写入 `browser_events`，用于复盘 BOSS 页面层问题。
- Chrome Extension popup 只展示任务简要状态；设置详细页展示待处理、执行中、成功、失败、最近失败原因和最近任务记录。
- M4.6 新增当前页队列治理：`GET /api/browser-tasks` 和 `GET /api/browser-tasks/diagnostics` 支持 `sourceUrl/pageUrl` 过滤，设置详细页可以单独查看最近 BOSS 页面的待处理、执行中、失败、已取消任务。
- M4.6 新增 `POST /api/browser-tasks/cancel` 与 `POST /api/browser-tasks/requeue`，用于显式取消当前页 `QUEUED/RUNNING` 任务、恢复当前页 `FAILED/CANCELED` 任务；该操作只改任务状态，不删除历史任务和失败结果。
- M4.6 调整 popup “重试”语义：优先恢复当前页失败/取消的 `CAPTURE_DETAIL` 任务并继续处理；如果没有可恢复任务，再重新扫描当前可见岗位并生成新任务。
- `SEND_GREETING`、`UPLOAD_RESUME`、`SUBMIT_APPLICATION` 等真实动作当前仍不自动执行，必须等后续 dry-run、审批和安全停止线补齐。
- 验证脚本：`npm run m4:browser-tasks:smoke`。
- 验证脚本：`npm run m4:extension-task:smoke`。
- 验证脚本：`npm run m4:queue-hygiene:smoke`。

### 建议状态

```text
DISCOVERED
LIST_CAPTURED
DETAIL_CAPTURED
SCORED
SHORTLISTED
RESUME_DRAFTED
RESUME_AUDITED
GREETING_READY
GREETING_SENT
CHAT_OPENED
RESUME_UNLOCKED
SUBMISSION_READY
SUBMITTED
SKIPPED
NEEDS_USER_REVIEW
NEEDS_MANUAL_ACTION
FAILED
```

### 验收标准

- 新岗位导入后能自动创建或关联 application。
- 详情补齐后状态能到 `DETAIL_CAPTURED`。
- 错误能进入 `NEEDS_MANUAL_ACTION` 或 `FAILED`。
- 每次状态变化可追溯。
- 浏览器任务能入队、查询、从 `QUEUED` 推进到 `RUNNING`/`SUCCEEDED`/`FAILED`，并保留 result/error。
- Chrome Extension 能手动领取一个 `CAPTURE_DETAIL` 任务并回写结果；真实打招呼、上传和投递仍不自动执行。
- 失败任务能形成可读诊断和 `browser_events`，用于判断是登录、安全校验、selector、当前页不可见还是 JD 为空。
- 当前页队列可以单独诊断、取消待处理任务、恢复失败任务；跨页面历史队列不会被当前页面误处理。

## 8. M5 用户画像与真实经历库

### 目标

建立简历改写的事实边界，避免 Agent 编造经历。

### 交付物

- 简历上传接口。
- DOCX/PDF 文本提取。
- 用户基础画像表。
- 真实经历库表。
- ProfileAgent 对话式补全。
- 禁止扩写/允许改写规则。

当前 M5.1 已实现的最小切片：

- SQLite 新增 `candidate_profiles`、`resume_sources`、`profile_experiences`、`profile_skills`、`profile_constraints`。
- 后端新增 `GET /api/profile` 与 `PUT /api/profile`，用于维护用户目标、摘要、所在地和求职方向。
- 后端新增 `GET/POST /api/profile/resume-sources`，支持 JSON/纯文本简历导入，保存原始文本、解析结果占位和 metadata。
- 后端新增 `GET/POST /api/profile/experiences`，保存真实经历事实、技能、证据、允许改写和禁止声称内容。
- 后端新增 `GET/POST /api/profile/skills` 与 `GET/POST /api/profile/constraints`，把技能熟练度和简历改写边界结构化。
- `GET /api/stats` 新增 profile/resume/experience/skill/constraint 计数。
- 验证脚本：`npm run m5:profile:smoke`。

M5.1 暂不做：

- DOCX/PDF 文件解析。
- 自动从简历生成完整经历库。
- ProfileAgent 追问。
- 任何简历自动改写。

### 验收标准

- 用户可上传基础简历。
- 系统可提取文本并生成经历库草稿。
- ProfileAgent 能提出缺失问题。
- 用户确认后，经历事实可被 ResumeAgent 引用。

M5.1 当前验收：

- 用户画像可读写。
- 原始简历文本可入库。
- 经历事实、技能和禁止声称内容可结构化保存。
- 后续 Agent 能从 `GET /api/profile` 读取事实库作为输入。

M5.2 已实现的最小切片：

- 新增 `server/src/resume-extractor.js`，封装简历文件文本抽取和文件大小/类型校验。
- 新增 `POST /api/profile/resume-sources/extract`，接收 `{ fileName, contentBase64, metadata? }`，支持 `.docx`、`.pdf`、`.txt`、`.md`。
- DOCX 使用 `mammoth.extractRawText`，PDF 使用 `unpdf.extractText`；抽取结果保存到既有 `resume_sources`，不新增表。
- `parsed_json` 记录抽取状态、文本长度、PDF 页数和 warnings；`metadata_json.extraction` 记录 extractor、原始文件名、文件大小和抽取时间。
- 验证脚本：`npm run m5:resume:smoke`。

M5.2 暂不做：

- multipart/form-data 上传 UI。
- DOC/PPT/XLS/图片 OCR。
- 自动把简历文本拆成真实经历库；后续必须经过 ProfileAgent 追问和用户确认。
- 自动生成或改写投递简历。

M5.2 当前验收：

- DOCX/PDF/TXT 简历可抽取文本并入库。
- 不支持的文件类型会被拒绝。
- `GET /api/stats` 能反映新入库 resume source 数量。

M5.3 已实现的最小切片：

- 新增 `profile_fact_drafts` 表，承载从简历原文生成但尚未确认的事实草稿。
- 新增 `server/src/profile-draft-generator.js`，用保守启发式从简历原文识别 experience、skill 和 question 草稿；它不是最终 ProfileAgent，只是给后续追问提供初始材料。
- 新增 `POST /api/profile/resume-sources/:id/drafts`，从指定 resume source 生成待确认草稿，并按 resume source、类型、标题和证据文本去重。
- 新增 `GET /api/profile/fact-drafts`、`GET /api/profile/fact-drafts/:id`、`POST /api/profile/fact-drafts/:id/confirm`、`POST /api/profile/fact-drafts/:id/reject`。
- 确认 `experience` 草稿后写入 `profile_experiences`；确认 `skill` 草稿后写入 `profile_skills`；`question` 草稿只能 reject 或后续由 ProfileAgent 消化，不能直接进入事实库。
- `GET /api/profile` 返回 `pendingFactDrafts`，`GET /api/stats` 新增 `factDraftCount` 和 `pendingFactDraftCount`。
- SQLite schema version 升级到 4。
- 验证脚本：`npm run m5:drafts:smoke`。

M5.3 暂不做：

- LLM ProfileAgent 对话。
- 自动确认草稿。
- 把草稿直接交给 ResumeAgent 使用。
- 复杂中文简历版式解析和跨段落语义合并。

M5.3 当前验收：

- 已入库简历原文可生成待确认草稿。
- 重复生成不会创建重复草稿。
- 草稿确认后才会进入正式经历/技能库。
- 草稿拒绝会保留状态和原因。

## 9. M6 Agent 岗位筛选

### 目标

基于完整 JD、公司信息、用户规则和经历库，对岗位进行匹配评分和风险识别。

### 交付物

- ScreeningAgent 输入输出 Schema。
- 硬条件过滤规则。
- 匹配分、风险分、推荐等级。
- 评分证据和风险证据。
- shortlist 审批入口。

当前 M6.1 已实现的最小切片：

- 新增 `server/src/screening-agent.js`，先提供规则评分基线，并支持可选 OpenAI-compatible LLM 评分。
- 新增 `server/src/model-client.js`，从环境变量或 `gpt5.5.txt` 读取模型配置；默认支持 Responses API，也保留 Chat Completions 兼容路径。
- SQLite schema version 升级到 5。
- 新增 `agent_runs` 表，记录 Agent 名称、application、step、输入摘要、输出、错误码、错误信息、fallback 标记和执行时间。
- 新增 `screenings` 表，记录 match score、risk score、recommendation、硬条件、匹配点、风险点、简历策略、置信度和 provider。
- 新增 `POST /api/applications/:id/screen`，对单个 application 执行 ScreeningAgent，并把结果写入 `screenings`。
- 新增 `GET /api/screenings` 和 `GET /api/agent-runs`。
- `mode:rules` 使用确定性规则评分；`mode:auto` 在模型不可用时降级规则评分并留痕；`mode:llm` 不静默降级，失败会记录 agent run 并把 application 推进到 `NEEDS_USER_REVIEW`。
- ScreeningAgent 当前只推进 application 到 `SCORED`、`SHORTLISTED`、`SKIPPED` 或 `NEEDS_USER_REVIEW`，不触发简历生成、打招呼或投递。
- 验证脚本：`npm run m6:screening:smoke`。

当前 M6.3 已实现的风险门禁切片：

- 新增 `server/src/job-risk-gate.js`，在岗位适配评分和 LLM 评分前先判断 JD 是否命中用户排斥方向。
- `profile_constraints.rule_type` 新增 `excluded_direction`，用于记录用户不想去的方向，例如销售、直播、保险、房产、客服或自定义方向。
- `POST /api/applications/:id/screen` 支持通过 `userRules.excludedDirections` 临时传入排斥方向。
- 命中高风险门禁时直接生成 `provider = risk_gate` 的 screening：`matchScore = 0`、`riskScore = 100`、`recommendation = skip`，application 推进到 `SKIPPED`，不再计算岗位适配情况。
- 命中的方向、关键词和 JD 片段写入 `screenings.metadata.riskGate`，便于设置页、timeline 和后续调试查看。
- 批量筛选支持 `riskGateOnly`：只判断新排斥方向是否命中，命中才写入 `risk_gate/skip` 并跳过岗位；未命中不重新计算岗位适配分，也不改写原 application 状态。
- 验证脚本：`npm run m6:risk-gate:smoke`。

M6.1 暂不做：

- 批量筛选 UI。
- LangGraph 编排。
- ResumeAgent 自动接续。
- 自动打招呼、上传简历或投递。

### 验收标准

- 至少 10 个岗位能输出结构化评分。
- 硬条件失败默认跳过。
- 用户明确排斥方向命中高风险时，必须在适配评分前跳过。
- 公司信息不足时输出不确定性，而不是臆测。
- ScreeningAgent 不直接触发简历生成或投递。

M6.1 当前验收：

- 单个 application 可通过 API 触发筛选。
- 规则评分结果可落库并推进状态。
- agent run 可回放。
- 强制 LLM 且配置缺失时会失败留痕，并转入 `NEEDS_USER_REVIEW`。
- `npm run check` 和 `npm run m6:screening:smoke` 通过。

当前 M6.2 已实现的最小切片：

- 新增 `GET /api/screening-candidates`，默认返回 `DETAIL_CAPTURED`、JD 长度达标且尚未筛选的 application。
- 新增 `POST /api/applications/screen-batch`，支持按候选列表或显式 `applicationIds` 顺序筛选一批 application。
- 批量筛选默认 `mode:rules`，避免误触发批量 LLM 调用；只有显式传 `mode:auto` 或 `mode:llm` 才会使用模型路径。
- 批量筛选支持 `continueOnError`，失败项会保留结构化错误和 failed agent run，不阻断已成功项落库。
- 验证脚本：`npm run m6:screening-batch:smoke`。

M6.2 暂不做：

- 后台异步批量队列。
- 并发模型调用。
- 根据筛选结果自动生成简历。

M6.2 当前验收：

- 可查询待筛选候选。
- 可批量规则筛选并写入 `screenings`/`agent_runs`。
- 已筛选岗位默认不会重复进入候选列表。
- 批量强制 LLM 失败时能逐项失败留痕。
- `npm run m6:screening-batch:smoke` 通过。

当前 M6.3 已实现的最小切片：

- 扩展设置详细页新增“岗位筛选”卡片，展示待筛选候选、最近筛选结果和最近 Agent 运行记录。
- 扩展后台新增 `GET_SCREENING_CANDIDATES`、`GET_SCREENINGS`、`GET_AGENT_RUNS` 和 `SCREEN_APPLICATION_BATCH` 代理消息。
- 设置页可手动触发“规则批量筛选”，固定默认 `mode:rules`，避免从扩展侧误触发批量 LLM 调用。
- 设置页新增 JD 风险门禁配置：用户可开启门禁、输入“销售、直播”等排斥方向，并点击“按新风险规则重筛”。该按钮会保存门禁设置，并用 `riskGateOnly:true`、`includeAlreadyScreened:true` 重扫 `DETAIL_CAPTURED/SCORED/SHORTLISTED/NEEDS_USER_REVIEW`，只排除命中风险门禁的岗位。
- 验证脚本：`npm run m6:options-screening:smoke`。

M6.3 暂不做：

- 筛选结果人工审批流。
- 分页、排序、筛选条件编辑。
- 从筛选结果直接进入简历生成。
- 任何 BOSS 页面打招呼、投递或上传动作。

M6.3 当前验收：

- 设置页能看到筛选候选、结果和 agent run。
- 批量规则筛选能从扩展消息链路触发并回看结果。
- 扩展侧不暴露 LLM API Key。
- `npm run check` 和 `npm run m6:options-screening:smoke` 通过。

## 10. M7 简历定制与审核

### 目标

为 shortlist 岗位生成岗位版简历，并用独立审核 Agent 阻断虚假或高风险内容。

### 交付物

- ResumeAgent。
- AuditAgent。
- 固定 DOCX 模板。
- DOCX/PDF 输出。
- diff 摘要。
- 简历版本表。
- 审核结果表。

### 验收标准

- 推荐岗位能生成 DOCX/PDF。
- 简历不超过 2 页。
- diff 能说明修改了哪些模块。
- AuditAgent 能识别 unsupported claims。
- 审核失败会阻断后续动作。

当前 M7.1 已实现的最小切片：

- 新增 `server/src/resume-agent.js`，规则模式下根据已确认经历库、技能库、筛选结果和 JD 生成结构化岗位版简历。
- 新增 `server/src/audit-agent.js`，规则模式下检查 source mapping、unsupported claims、页数估算、筛选推荐和真实性风险。
- 新增 `server/src/document-renderer.js`，复用现有 MIT `docx` 依赖生成固定结构 DOCX。
- 新增 `resume_versions` 和 `resume_audits` 表，schema version 升级到 6。
- 新增 `POST /api/applications/:id/prepare-resume`、`GET /api/resume-versions`、`GET /api/resume-versions/:id`、`POST /api/resume-versions/:id/audit`、`GET /api/resume-audits`、`GET /api/resume-audits/:id`。
- `prepare-resume` 只推进到 `RESUME_DRAFTED`，审核通过只推进到 `RESUME_AUDITED`；不会触发打招呼、上传或投递。
- 验证脚本：`npm run m7:resume-audit:smoke`。

M7.1 暂不做：

- PDF 导出。
- Word 模板占位符编辑器。
- LLM 版本 ResumeAgent/AuditAgent。
- 审批 UI。
- 根据审核结果自动打招呼、上传或投递。

M7.1 当前验收：

- 推荐岗位可生成结构化简历版本并落库。
- 可生成本地 DOCX 文件。
- AuditAgent 能审核并写入 audit 记录。
- application 最远只进入 `RESUME_AUDITED`。
- `npm run check` 和 `npm run m7:resume-audit:smoke` 通过。

当前 M7.2 已实现的最小切片：

- 新增 `GET /api/resume-candidates`，默认返回 `SHORTLISTED`、最新 screening 推荐为 `auto_prepare`、JD 长度达标且尚未生成简历版本的 application。
- 扩展后台新增 `GET_RESUME_CANDIDATES`、`GET_RESUME_VERSIONS`、`GET_RESUME_AUDITS`、`PREPARE_RESUME` 和 `AUDIT_RESUME` 代理消息。
- 扩展设置详细页新增“简历定制与审核”卡片，展示可定制候选、最近简历版本和最近审核记录。
- 设置页可手动触发“规则生成简历”和“规则审核草稿”；扩展侧固定 `mode:rules`，生成简历时固定 `renderDocx:true`。
- 验证脚本：`npm run m7:options-resume:smoke`。

M7.2 暂不做：

- 简历内容编辑器。
- 人工审批流。
- 自动选择多个候选批量生成简历。
- LLM 版 ResumeAgent/AuditAgent 从扩展侧触发。
- 任何 BOSS 页面打招呼、上传简历或投递动作。

M7.2 当前验收：

- 设置页能看到简历候选、版本和审核记录。
- 设置页可以从第一个可定制候选生成本地 DOCX 简历版本。
- 设置页可以审核第一个未审核草稿并刷新状态。
- 扩展侧不持有模型 API Key，不触发浏览器投递任务。
- `npm run check`、`npm run m7:resume-audit:smoke` 和 `npm run m7:options-resume:smoke` 通过。

当前 M7.3 已实现的最小切片：

- 扩展后台新增 `GET_RESUME_VERSION` 和 `GET_RESUME_AUDIT` 详情读取消息。
- 设置详细页的最近简历版本和最近审核记录支持点击查看详情。
- 简历详情面板展示 `resume_fields`、项目/经历要点、技能、`diff_summary`、`compression_notes`、`source_mapping`、`unsupported_claims` 和最新审核风险。
- 生成简历后自动打开新版本详情；审核草稿后自动打开审核详情。
- 验证脚本：`npm run m7:options-detail:smoke`。

M7.3 暂不做：

- 简历字段编辑。
- 审批通过/拒绝按钮。
- 多版本 diff 对比。
- PDF 预览。
- 任何 BOSS 页面打招呼、上传简历或投递动作。

M7.3 当前验收：

- 用户能从设置页查看生成简历的正文结构和证据映射。
- 用户能从设置页查看审核风险和阻断原因。
- 详情查看只读，不改变 application 状态。
- `npm run check` 和 `npm run m7:options-detail:smoke` 通过。

当前 M7.4 已实现的最小切片：

- 新增 `POST /api/resume-versions/:id/revise`，允许基于已有简历版本做受限本地编辑，保存为新的 `resume_versions` 记录。
- 受限编辑范围只包含求职摘要、技能、项目/经历 bullet、奖项/证书和编辑原因；source mapping、经历元数据、公司/项目事实不在前端编辑器中开放。
- 保存修订版后重新渲染本地 DOCX，旧版本不覆盖，`metadata.revisedFromVersionId` 保留版本来源。
- 新增 `POST /api/resume-versions/:id/approve-local`，只允许对 `APPROVED` 简历版本做本地审批。
- 本地审批写入 `metadata.localApproval` 和 `RESUME_LOCALLY_APPROVED` application event，最多把 application 推进到 `GREETING_READY`。
- 本地审批不会创建 `SEND_GREETING`、`UPLOAD_RESUME` 或 `SUBMIT_APPLICATION` browser task。
- 扩展后台新增 `REVISE_RESUME` 和 `APPROVE_RESUME_LOCAL`，设置详细页新增简历编辑器和“本地审批通过”按钮。
- 验证脚本：`npm run m7:resume-approval:smoke`。

M7.4 暂不做：

- 多版本可视化 diff。
- PDF 预览或导出。
- 使用 LLM 自动改写用户手动输入。
- 真实 BOSS 打招呼、上传简历或投递动作。

M7.4 当前验收：

- 用户能在设置页基于当前简历版本编辑摘要、技能、项目 bullet 和奖项。
- 保存后生成新版本并重新渲染 DOCX，旧版本仍可追溯。
- 只有审核通过的版本能本地审批。
- 本地审批只推进到 `GREETING_READY`，并确认没有生成浏览器动作任务。
- `npm run check`、`npm run m7:options-detail:smoke` 和 `npm run m7:resume-approval:smoke` 通过。

## 11. M8 打招呼与沟通解锁

### 目标

把 BOSS 的真实流程建模出来：先打招呼，再根据聊天或按钮状态判断是否解锁投递。

### 执行器策略

- 如果 M1 证明 Firecrawl 可行，优先用 FirecrawlAdapter。
- 如果 Firecrawl 只能采集但不能稳定执行沟通动作，使用 ChromeExtensionAdapter 或 LocalPlaywrightAdapter。
- 默认 dry-run，不真实发送。

### 交付物

- MessageAgent。
- `conversations` 表。
- `messages` 表。
- 打招呼任务。
- 沟通状态刷新任务。
- 投递解锁检测。

### 验收标准

- 对 shortlist 岗位能生成结构化打招呼语。
- 默认停在发送前确认点。
- 用户确认后可以由执行器发送。
- 发送成功/失败有事件记录。
- 系统能识别或记录是否进入可投递状态。

当前 M8.1 已实现的最小切片：

- 新增规则版 `server/src/message-agent.js`，基于岗位、最新筛选、已审批简历版本和已确认画像生成 BOSS 打招呼草稿。
- 新增 `conversations` 和 `messages` 表，schema version 升级到 7。
- 新增 `GET /api/messages` 和 `POST /api/applications/:id/prepare-greeting`。
- `prepare-greeting` 只接受 `APPROVED` 且已有 `metadata.localApproval.approved` 的简历版本；不会绕过 M7 审核和本地审批。
- 生成草稿后创建 `SEND_GREETING` browser task，但 payload 固定 `dryRun:true`、`requiresUserConfirmation:true`。
- application 仍停在 `GREETING_READY`；不会推进到 `GREETING_SENT`，也不会创建 `UPLOAD_RESUME` 或 `SUBMIT_APPLICATION`。
- 扩展后台新增 `GET_MESSAGES` 和 `PREPARE_GREETING`；设置详细页新增“打招呼 dry-run”卡片，展示最近草稿和 dry-run 任务。
- 验证脚本：`npm run m8:greeting-dry-run:smoke`。

M8.1 暂不做：

- 在 BOSS 页面填入或发送打招呼语。
- 读取聊天记录或检测投递解锁状态。
- 批量生成或批量发送。
- 频率限制、冷却时间和每日上限。
- LLM 版 MessageAgent。

M8.1 当前验收：

- 只有已本地审批的审核通过简历版本可以生成打招呼草稿。
- 草稿写入 `messages`，并有对应 `conversations` 记录。
- 只创建 `SEND_GREETING` dry-run browser task。
- 不改变 `GREETING_READY` 之后的状态，不创建上传或投递任务。
- `npm run check` 和 `npm run m8:greeting-dry-run:smoke` 通过。

当前 M8.2 已实现的最小切片：

- Chrome Extension content script 已接入 `SEND_GREETING` dry-run 执行路径。
- 设置详细页新增 `Run SEND_GREETING dry-run` 动态入口，可从已打开的 BOSS 标签页领取 `SEND_GREETING` 任务并发送给 content script。
- content script 会先校验当前 BOSS 页面、登录/安全验证状态和岗位匹配；不匹配时以 `PAGE_MISMATCH`、`LOGIN_REQUIRED`、`SECURITY_CHECK` 等失败码回写。
- 页面侧只允许发送前填入验证：尝试找到安全聊天入口和输入框，填入草稿并高亮输入框/发送按钮；不会点击发送按钮。
- `SEND_GREETING` 任务 payload 增加 `jobId/title/company/detailUrl/sourceUrl`，便于按当前 BOSS 页领取和诊断。
- 验证脚本：`npm run m8:extension-send-greeting:smoke`。

M8.2 暂不做：

- 真实点击发送。
- 绕过验证码、登录失效、风控或 F1/DevTools 限制。
- 批量打招呼、频率控制、每日上限。
- 聊天记录读取、对方回复检测、投递解锁检测。

M8.2 当前验收：

- `SEND_GREETING` dry-run 可以进入页面侧执行链路。
- 失败必须 fail closed，并有结构化错误码和诊断。
- dry-run 成功只代表“文本已填入且发送按钮可见”，不会推进 application 到 `GREETING_SENT`。
- `npm run check`、`npm run m8:greeting-dry-run:smoke` 和 `npm run m8:extension-send-greeting:smoke` 通过。

当前 M8.3 已实现的最小切片：

- 新增 `GET /api/conversations`，用于查看 `conversations` 只读刷新后的状态快照。
- `transitionBrowserTask` 在 `REFRESH_CONVERSATION` / `CHECK_RESUME_UNLOCK` 成功后，会把页面只读结果写入 `conversations.metadata.lastResult`。
- `REFRESH_CONVERSATION` 明确读到会话已打开时，可把 application 从 `GREETING_READY` 或 `GREETING_SENT` 推进到 `CHAT_OPENED`；这不等于记录真实 `GREETING_SENT`。
- `CHECK_RESUME_UNLOCK` 明确读到简历/投递入口已解锁时，可把 application 从 `CHAT_OPENED` 推进到 `RESUME_UNLOCKED`。
- 扩展设置详细页动态新增 `Queue REFRESH_CONVERSATION`、`Queue CHECK_RESUME_UNLOCK` 和 `Run read-only BOSS task`，复用 browser task 队列和 `RUN_BROWSER_TASK` 通道。
- content script 对两类任务只读 DOM，检测页面不匹配、登录失效、安全验证，并返回 `readOnly.noRealBossAction=true`、`clicked/uploaded/submitted=false`。
- 验证脚本：`npm run m8:read-only-conversation:smoke`。

M8.3 暂不做：

- 真实点击发送。
- 真实上传简历、选择附件简历或点击投递。
- 把 `RESUME_UNLOCKED` 自动推进到 `SUBMISSION_READY`。
- 自动判断对方回复语义或批量跟进。

M8.3 当前验收：

- 只读任务可以排队、领取、发送到 BOSS content script 并回写结果。
- 会话/解锁快照可通过 `GET /api/conversations` 读取。
- 只读证据最多推进到 `CHAT_OPENED` / `RESUME_UNLOCKED`，不创建上传或投递任务。
- `npm run check`、M8.1/M8.2 smoke 和 `npm run m8:read-only-conversation:smoke` 通过。

当前 M8.4 已实现的最小切片：

- `REFRESH_CONVERSATION` 成功回写后，会把 `conversation.messages` 和 `conversation.recentMessages` 归档到 `messages`。
- 归档消息的 `channel` 为 `boss_chat`，`status` 为 `CAPTURED`，`provider` 为 `browser_executor`，metadata 记录 `browserTaskId`、`sourceTimestamp` 和 `readOnly:true`。
- 消息按方向、文本和页面时间戳去重，避免多次刷新重复入库。
- `GET /api/messages` 现在同时可看到 MessageAgent 草稿和页面只读聊天快照。
- 验证脚本仍为 `npm run m8:read-only-conversation:smoke`，已增加消息归档和去重断言。

M8.4 暂不做：

- 完整 IM 历史同步。
- 消息语义判断和自动跟进。
- 用聊天内容直接触发上传或投递。

当前 M8.5 已实现的最小切片：

- 新增后端规则判定 `communicationAssessment`，写入 `conversations.metadata`。
- 基于已归档 `boss_chat/CAPTURED` 和 `boss_greeting` 消息识别 `RESUME_REQUESTED`、`RECRUITER_REPLIED`、`WAITING_FOR_REPLY`、`CHAT_OPENED_NO_MESSAGES`、`CONVERSATION_UNKNOWN`。
- `RESUME_REQUESTED` 优先级最高，可由对方消息里的简历请求关键词或页面简历入口已解锁触发。
- 扩展设置详细页会在会话列表显示沟通状态标签，例如“对方要求简历”“对方已回复”“等待对方回复”。
- 验证脚本仍为 `npm run m8:read-only-conversation:smoke`，已覆盖简历请求和等待回复两类判定。

M8.5 暂不做：

- LLM 语义分类。
- 自动跟进话术生成。
- 基于 `RESUME_REQUESTED` 自动上传或投递。
- 频率控制和冷却策略。

当前 M8.6 已实现的最小切片：

- 新增 `nextActionRecommendation`，写入 `conversations.metadata`。
- 基于 `communicationAssessment`、当前 application 状态和 `resumeUnlock` 生成下一步建议。
- 当前建议覆盖 `PREPARE_RESUME_UPLOAD_DRY_RUN`、`REVIEW_RECRUITER_REPLY`、`WAIT_FOR_REPLY`、`REFRESH_CONVERSATION_LATER`、`REFRESH_CONVERSATION`。
- 每条建议包含 `priority`、`reason`、`requiresUserConfirmation`、`noRealBossAction`、`allowedTaskTypes`、`blockedTaskTypes`。
- 扩展设置详细页会展示下一步建议标签。
- 验证脚本仍为 `npm run m8:read-only-conversation:smoke`，已覆盖简历请求 -> 上传 dry-run 建议、等待回复 -> 等待建议。

M8.6 暂不做：

- 创建 `UPLOAD_RESUME` browser task。
- 创建 `SUBMIT_APPLICATION` browser task。
- 自动发送跟进消息。
- 每日频控和冷却队列。

## 12. M9 投递执行与复盘

### 目标

在用户确认或严格规则允许下完成投递，并形成可复盘记录。

当前 M9.1-M9.5 已实现的前置切片：

- Chrome Extension content script 接入 `UPLOAD_RESUME` dry-run。
- 设置详细页新增 `Queue UPLOAD_RESUME dry-run`，复用 browser task 队列和 `Run read-only BOSS task` 执行入口。
- dry-run 只检测上传/选择简历入口、`input[type=file]`、accept 类型、候选按钮和页面诊断。
- dry-run 结果写入 browser task result、`UPLOAD_RESUME_DRY_RUN` application event 和 `conversations.metadata.lastUploadDryRun`。
- dry-run 明确返回 `fileSelected:false`、`uploaded:false`、`submitted:false`、`noRealBossAction:true`。
- 验证脚本：`npm run m9:upload-resume-dry-run:smoke`。
- Chrome Extension content script 接入 `SUBMIT_APPLICATION` dry-run。
- 设置详细页新增 `Queue SUBMIT_APPLICATION dry-run`，并通过 `Run read-only BOSS task` 领取和运行。
- dry-run 只检测投递/确认候选、锁定信号、确认弹窗线索和页面匹配状态。
- dry-run 结果写入 browser task result、`SUBMIT_APPLICATION_DRY_RUN` application event 和 `conversations.metadata.lastSubmitDryRun`。
- dry-run 明确返回 `clickedSubmit:false`、`confirmed:false`、`submitted:false`、`uploaded:false`、`noRealBossAction:true`，不会推进到 `SUBMISSION_READY` 或 `SUBMITTED`。
- 验证脚本：`npm run m9:submit-application-dry-run:smoke`。
- 后端新增 `submissionReadiness` gate，把 `lastUploadDryRun`、`lastSubmitDryRun`、`communicationAssessment` 和 `resumeUnlock` 合并成 `READY_FOR_MANUAL_REVIEW`、`INSUFFICIENT_EVIDENCE` 或 `BLOCKED`。
- 每次上传/投递 dry-run 成功回写后写入 `SUBMISSION_READINESS_ASSESSED` application event，并更新 `nextActionRecommendation`。
- 扩展设置页会展示投递准备度和“复核投递准备度/处理投递阻断”建议。
- 验证脚本：`npm run m9:submission-readiness:smoke`。
- 后端新增 `GET /api/submission-readiness`，从 conversations metadata 派生投递准备复核队列。
- 队列支持按 `READY_FOR_MANUAL_REVIEW`、`INSUFFICIENT_EVIDENCE`、`BLOCKED` 或 `ALL` 过滤。
- 扩展后台代理 `GET_SUBMISSION_READINESS_QUEUE`，设置详细页展示最近投递准备复核项。
- 验证脚本：`npm run m9:submission-readiness-queue:smoke`。
- 后端新增 `POST /api/submission-readiness/:applicationId/review`，本地写入投递准备复核决策。
- 决策包括 `APPROVED_FOR_MANUAL_EXECUTION`、`REFRESH_REQUIRED` 和 `BLOCKED`，写入 `conversations.metadata.submissionReadinessReview` 和 `SUBMISSION_READINESS_REVIEWED` application event。
- 扩展设置页在投递准备复核队列中提供“本地复核通过 / 需要刷新 / 阻断”动作。
- 验证脚本：`npm run m9:submission-readiness-review:smoke`。

M9.5 暂不做：

- 设置 input 文件。
- 点击上传按钮。
- 创建真实上传任务。
- 点击投递。
- 确认投递弹窗。
- 将 application 推进到 `SUBMISSION_READY` 或 `SUBMITTED`。
- 用 readiness 自动触发真实上传或真实投递。
- 在复核队列里直接执行真实上传/投递。
- 让 `APPROVED_FOR_MANUAL_EXECUTION` 自动推进 `SUBMISSION_READY`。
- Native Messaging / Playwright 文件选择。

### 执行器策略

- 如果 Firecrawl 文件上传 POC 成功，可继续用 FirecrawlAdapter。
- 如果 Firecrawl 文件上传不稳定，M9 使用 LocalPlaywrightAdapter。
- Chrome Extension 可作为人工辅助和状态读取 fallback。

### 交付物

- 投递审批界面或接口。
- 投递任务。
- 简历选择/上传流程。
- 投递结果事件。
- CSV/Excel 导出。
- 失败重试和人工处理入口。

### 验收标准

- 用户确认后能完成一次投递记录闭环。
- 每次投递有完整 application event。
- 失败能看到明确错误码。
- 可导出投递记录。

## 13. 推荐实施顺序

1. 完成 M0 文档收敛。
2. 开始 M1 BrowserExecutor POC。
3. 验证 Firecrawl 登录态/profile。
4. 验证 Firecrawl 采集 10 个岗位和 JD。
5. 验证 Firecrawl 打招呼 dry-run。
6. 验证投递入口和文件上传路径。
7. 根据 M1 决策门确定主执行器。
8. 做 SQLite 入库。
9. 做采集质量闭环。
10. 做状态机。
11. 做用户画像和经历库。
12. 做 Agent 筛选、简历生成、审核。
13. 做打招呼、沟通解锁、投递执行。

## 14. 当前下一步

当前 M1-M8.1 已完成主路线验证、工作流队列、简历原文抽取、待确认事实草稿、单条/批量岗位筛选、简历生成与审核、扩展设置页的简历详情查看、受限本地编辑、本地审批，以及打招呼 dry-run 草稿和任务。下一步应继续做：

```text
Chrome Extension 领取 SEND_GREETING dry-run 并在页面侧做发送前定位/填入验证
-> 用户确认后再允许单条真实发送
-> 沟通状态/投递解锁检测 POC
```

后端任务队列只表达“要浏览器做什么”，真实 BOSS 页面动作仍由用户已登录的 Chrome Extension 执行；验证码、登录失效、风控提示必须暂停并交给用户处理。

## M10.1 WorkflowOrchestrator 编排计划

当前 M9 已完成到本地投递准备复核决策。M10.1 的目标是先建立后端可解释编排计划，而不是立即放开真实上传或真实投递。

交付物：
- `server/src/workflow-orchestrator.js`: 确定性规划器，读取已有证据，输出阶段状态、下一步动作、阻断原因和证据摘要。
- `GET /api/applications/:id/workflow-plan`: 只读计划。
- `POST /api/applications/:id/workflow-plan`: 将计划持久化为 `agent_runs`，agentName 为 `WorkflowOrchestrator`。
- `scripts/m10-workflow-orchestrator-smoke.js`: 从筛选、简历、审计、本地审批、打招呼 dry-run、会话证据、上传/投递 dry-run 到本地 readiness review 的计划链路验证。

当前边界：
- 不创建真实 `SEND_GREETING_REAL`、`UPLOAD_RESUME_REAL`、`SUBMIT_APPLICATION_REAL`。
- 不由编排计划自动创建 browser task。
- 不推进 application 到 `SUBMISSION_READY` 或 `SUBMITTED`。
- 浏览器插件仍只负责 BOSS 页面任务；LLM key 仍只在后端。

验收标准：
- `npm run m10:workflow-orchestrator:smoke` 通过。
- `npm run check` 包含 `server/src/workflow-orchestrator.js` 和 M10 smoke。
- 持久化 workflow plan 只增加 `agent_runs`，不增加 browser task，不改变 application status。

M10 后续计划：
- M10.2 增加简历/JD 适配评估节点：`JDRequirementExtractor`、`ResumeFitEvaluator`。
- M10.3 增加真实性与投递策略节点：`ClaimVerifier`、`SubmissionPolicyGate`。
- M10.4 已引入 LangGraph.js，把 ScreeningAgent -> ResumeAgent -> ResumeFitEvaluator -> ClaimVerifier -> ResumeRevisionAgent -> re-check -> AuditAgent 的本地简历闭环迁移成显式图。

## M10.2a Career Context / ProfileAgent 前置层

用户提供的 `career-retrospective-to-job` 初稿已经收敛为项目内 skill：`.agents/skills/career-retrospective-to-job/`。

目标不是直接生成投递简历，而是在 ResumeAgent 之前建立更稳定的职业上下文：

```text
用户上传简历 / 项目材料 / 补充访谈
-> career-retrospective-to-job
-> career_agent_context.md
-> PENDING profile_fact_drafts / missing questions
-> 用户确认或拒绝
-> profile_experiences / profile_skills / profile_constraints
-> ScreeningAgent / ResumeAgent / AuditAgent
```

交付物：

- `.agents/skills/career-retrospective-to-job/SKILL.md`：触发条件、规则和工作流。
- `references/context_template.md`：`career_agent_context.md` 模板。
- `references/interview_questions.md`：分轮追问问题。
- `references/role_clusters.md`：岗位族群判断参考。
- `references/resume_boundaries.md`：简历真实性和禁止声称规则。
- `examples/career_agent_context.example.md`：示例上下文。
- `scripts/m10-career-skill-smoke.js`：检查 skill 文件和文档契约。

边界：

- `career_agent_context.md` 是事实源候选和策略上下文，不是正式事实库。
- `PENDING` 草稿仍不能被 ResumeAgent 使用。
- 任何新经历、技能、指标或边界都必须经过 confirm/reject 后才能进入正式表。
- 该切片不新增数据库表，不改变 application 状态，不创建 BOSS browser task。

验收：

- `npm run m10:career-skill:smoke` 通过。
- `npm run check` 包含 `scripts/m10-career-skill-smoke.js`。
- README、Agent workflow、开发计划和开源复用文档都明确 `career-retrospective-to-job` 的位置和边界。
## M10.2d ProfileAgent Career Context Persistence

Goal: make the first ProfileAgent step executable and inspectable before adding a full chat UI.

Delivered:

- New deterministic module: `server/src/profile-agent.js`.
- New APIs:
  - `POST /api/profile/career-context`
  - `GET /api/profile/career-context`
- Default local output: `server/data/career_context/career_agent_context.md`.
- The generator reads resume sources, confirmed experiences, skills, constraints, pending fact drafts, and optional user answers.
- The API records `agent_runs` and `workflow_events`; missing questions are visible as warning workflow errors.
- No schema migration is required for this slice.
- Smoke test: `scripts/m10-profile-agent-smoke.js`.

Acceptance:

- A profile bundle can produce a normal Chinese `career_agent_context.md`.
- Pending fact drafts are represented as `expression-risk` context, not confirmed facts.
- `POST /api/profile/career-context` writes the local file and returns missing questions.
- `GET /api/profile/career-context` reads the generated file.
- Agent run, workflow event, and warning/error observability records are persisted.
- No application status is changed, no browser task is created, and no BOSS action is triggered.
- `npm run m10:profile-agent:smoke` passes.
- `npm run check` includes `server/src/profile-agent.js` and `scripts/m10-profile-agent-smoke.js`.

Boundary:

- This slice does not implement ProfileAgent chat UI.
- This slice does not call an LLM.
- This slice does not auto-confirm resume-derived facts.
- This slice does not feed pending facts into ResumeAgent as confirmed evidence.

## M10.2e ProfileAgent Settings UI

Goal: make the ProfileAgent career-context step usable from the Chrome Extension settings page without touching BOSS pages.

Delivered:

- Background proxy messages:
  - `GET_CAREER_CONTEXT`
  - `GENERATE_CAREER_CONTEXT`
- Settings page panel: `ProfileAgent 职业经历上下文`.
- The panel can refresh the current `career_agent_context.md`, generate a new local file, show file metadata, preview markdown, and list missing questions.
- The panel can render missing questions as answer textareas and call ProfileAgent with `{ id, answer }` entries through `带回答重新生成`.
- After generation, the page refreshes workflow errors/events so open questions remain visible in the correction queue.
- Static smoke test: `scripts/m10-options-profile-agent-smoke.js`.

Acceptance:

- User can generate/read `server/data/career_context/career_agent_context.md` from extension settings.
- Missing questions are visible in the ProfileAgent panel.
- User can answer missing questions and regenerate `career_agent_context.md`; answered question IDs are removed from the next missing-question list.
- Workflow warnings/errors are refreshed after generation.
- The extension does not confirm `PENDING profile_fact_drafts`.
- The extension does not advance application status.
- The extension does not create `browser_tasks` or trigger any BOSS page/content-script action.
- `npm run m10:options-profile-agent:smoke` passes.
- `npm run check` includes `scripts/m10-options-profile-agent-smoke.js`.

Next after this slice:

- Add a true ProfileAgent Q&A surface that lets the user answer missing questions.
- Keep confirmation of extracted facts as an explicit backend/profile action, not as a side effect of generating markdown.
- Feed only confirmed profile facts into JD scoring and resume generation.

## M10.2f Profile Fact Confirmation

Goal: let ProfileAgent Q&A answers become reviewable profile facts without bypassing the existing confirmation boundary.

Delivered:

- New backend API:
  - `POST /api/profile/career-context/fact-drafts`
- `server/src/services/profile-service.js` owns answer-to-draft generation and `PROFILE_FACT_DRAFTS_GENERATED` workflow events.
- `server/src/sqlite-store.js` exposes generic `createProfileFactDrafts(input)` and keeps `createProfileFactDraftsFromResumeSource` as a resume-source wrapper.
- Answer mapping:
  - target roles -> `constraint` draft
  - excluded/risk directions -> `constraint` draft
  - skills -> `skill` drafts
  - project/experience answers -> `experience` draft
- Duplicates are skipped for both resume-source drafts and ProfileAgent answer drafts with no `resume_source_id`.
- Smoke test: `scripts/m10-profile-fact-confirmation-smoke.js`.
- The ProfileAgent settings UI now has a `待确认事实草稿` panel that can:
  - generate fact drafts from current answer textareas
  - refresh pending drafts
  - confirm/reject each draft explicitly
  - refresh workflow logs after generation or review actions
- Mocked browser UI smoke test: `scripts/m10-options-profile-facts-ui-smoke.js`.

Acceptance:

- ProfileAgent answers can generate `PENDING profile_fact_drafts`.
- Re-running the same answers skips duplicates.
- `POST /api/profile/fact-drafts/:id/confirm` still writes confirmed facts into the formal profile tables.
- `POST /api/profile/fact-drafts/:id/reject` rejects drafts without writing facts.
- Workflow logs expose `PROFILE_FACT_DRAFTS_GENERATED`.
- `npm run m10:profile-facts:smoke` passes.
- `npm run m10:options-profile-facts:smoke` passes.
- `npm run m10:options-profile-facts-ui:smoke` passes.
- `npm run check` includes `scripts/m10-profile-fact-confirmation-smoke.js`.
- `npm run check` includes `scripts/m10-options-profile-facts-smoke.js`.
- `npm run check` includes `scripts/m10-options-profile-facts-ui-smoke.js`.

Boundary:

- This slice does not auto-confirm answer-derived facts.
- This slice does not run JD screening, resume generation, browser tasks, BOSS actions, upload, or submission.

## M10.2g Editable Fact Confirmation / Context Refresh

Goal: make ProfileAgent answer-derived facts usable before they become resume evidence, without forcing users to accept raw generated drafts.

Delivered:

- Settings page fact draft cards render editable fields before confirmation:
  - `experience`: title, role, facts, skills
  - `skill`: name, category, proficiency
  - `constraint`: ruleType, content, severity
- Confirm sends edited `content` through the existing `POST /api/profile/fact-drafts/:id/confirm` payload.
- Confirm/reject marks career context as stale instead of silently treating the old markdown as current.
- `事实变更后重新生成上下文` runs `POST /api/profile/career-context` from the settings page and clears the stale warning after success.
- The Playwright UI smoke validates edited confirm payloads, stale context warning, regeneration, and no BOSS/browser task side effects.

Acceptance:

- User can edit a pending draft before confirming it into formal profile facts.
- Confirm payload includes the edited fields.
- Confirm/reject does not trigger BOSS actions, JD screening, resume generation, upload, or submission.
- Career context stale state is visible after fact changes.
- `npm run m10:options-profile-facts-ui:smoke` passes.
- `npm run check` includes the UI smoke syntax check.

## M10.2h Persistent Profile Context Lifecycle

Goal: make ProfileAgent a reusable upstream profile builder, not a per-application workflow node.

Delivered:

- `GET /api/profile/career-context` now returns backend freshness with `MISSING`, `FRESH`, or `STALE`.
- Freshness is calculated from the persisted `career_agent_context.md` timestamp and the latest SQLite profile change across `candidate_profiles`, `resume_sources`, `profile_experiences`, `profile_skills`, `profile_constraints`, and `profile_fact_drafts`.
- The settings page shows whether the context is reusable, stale, or missing, including the latest profile change source/time.
- Confirming or rejecting a fact draft no longer relies only on a page-local stale flag; a refreshed settings page can recover stale state from the backend.
- The ProfileAgent smoke covers `MISSING -> FRESH -> STALE -> FRESH` and statically asserts that the per-application `ResumeWorkflowGraph` does not import/run ProfileAgent.

Lifecycle:

- Run ProfileAgent for first onboarding, resume/material imports, user Q&A, fact confirmation/rejection, and target/constraint changes.
- Do not run ProfileAgent for every JD scoring, resume draft, fit evaluation, claim check, or one-click application workflow.
- Per-job agents consume the persisted SQLite profile and generated context snapshot.

Acceptance:

- `GET /api/profile/career-context` exposes durable freshness.
- `ProfileAgent` is absent from the LangGraph per-job node list and imports.
- Refreshing the settings page after profile fact changes still shows stale context.
- `npm run m10:profile-agent:smoke` passes.
- `npm run check` includes the updated smoke syntax check.

## M10.2i Dedicated ProfileAgent Portal

Goal: give users one explicit place to talk to ProfileAgent and change persistent profile material, instead of mixing profile maintenance with per-job workflows.

Delivered:

- The settings page panel is now labeled `ProfileAgent 画像入口`.
- The header includes a direct `画像入口` anchor for quick access.
- The panel includes `主动补充或修改画像`, where users can add/correct experiences, project metrics, target roles, skills, or excluded directions.
- Active profile updates are sent as `profile_user_update` answers to the existing fact-draft generation path.
- Generated items remain `PENDING profile_fact_drafts`; only explicit confirm/reject changes the formal profile library.
- No BOSS browser task, JD scoring, resume generation, upload, greeting, or submission is triggered from this portal.

Acceptance:

- The ProfileAgent portal is discoverable from the top of the settings page.
- The portal can stage user-entered profile changes as pending drafts.
- Dedicated portal actions do not call application workflow or browser task messages.
- `npm run m10:options-profile-agent:smoke` passes.
- `npm run m10:options-profile-facts-ui:smoke` passes.

## M10.2b Observability Hooks / Error Correction

Goal: make backend execution progress, warnings, and errors inspectable and correctable before expanding agent orchestration.

Deliverables:

- SQLite schema v8 adds `workflow_events`.
- `agent_runs` start/finish/failure now write durable workflow events.
- `browser_tasks` queue/claim/transition/failure/cancel/requeue now write durable workflow events.
- `screenApplicationsBatch` writes batch start, per-item success/failure, and final summary progress.
- Persisted `WorkflowOrchestrator` plans write plan start/success progress records.
- New APIs:
  - `GET /api/applications/:id/timeline`
  - `GET /api/workflow-events`
  - `GET /api/workflow-errors`
  - `POST /api/workflow-errors/:id/resolve`
- `GET /api/stats` exposes `workflowEventCount` and `openWorkflowErrorCount`.

Acceptance:

- Timeline can show application event, agent run, browser task, workflow progress, and failure records for a single application.
- Error queue exposes unresolved warning/error records with source type, source id, message, error code, and metadata.
- Resolving or ignoring an error is explicit and does not retry work or change application/browser task state.
- `npm run m10:observability:smoke` passes.
- `npm run check` includes `scripts/m10-observability-smoke.js`.

Boundary:

- This milestone adds observability only.
- It does not introduce LangGraph.
- It does not create real `SEND_GREETING`, `UPLOAD_RESUME`, or `SUBMIT_APPLICATION` actions.
- It does not bypass BOSS login, captcha, security checks, or Chrome Extension execution boundaries.

## M10.2c Extension Observability UI

Goal: make the M10.2b observability hooks visible and correctable from the Chrome Extension settings page.

Deliverables:

- Extension background proxies:
  - `GET_WORKFLOW_EVENTS`
  - `GET_WORKFLOW_ERRORS`
  - `GET_APPLICATION_TIMELINE`
  - `RESOLVE_WORKFLOW_ERROR`
- Settings page `Workflow progress` panel:
  - open workflow error count
  - recent workflow event count
  - open workflow error list
  - recent workflow event list
  - per-application timeline view
  - explicit `RESOLVED` / `IGNORED` actions
- Static smoke test: `scripts/m10-options-observability-smoke.js`.

Acceptance:

- Main diagnostics refresh also refreshes workflow errors and events.
- A workflow error can load its application timeline.
- A workflow error can be marked `RESOLVED` or `IGNORED`.
- Resolving or ignoring an error does not create browser tasks, rerun agents, or advance application state.
- `npm run m10:options-observability:smoke` passes.
- `npm run check` includes `scripts/m10-options-observability-smoke.js`.

Boundary:

- This is UI and background proxy wiring only.
- It does not add a new UI dependency.
- It does not retry work implicitly.
- It does not create real `SEND_GREETING`, `UPLOAD_RESUME`, or `SUBMIT_APPLICATION` actions.

## M10.3a Resume/JD Fit Evaluation

Goal: make "does the generated resume match this JD" a testable backend node before AuditAgent and before any delivery workflow.

Deliverables:

- New deterministic agent: `server/src/resume-fit-evaluator.js`.
- SQLite schema v9 table: `resume_fit_evaluations`.
- New APIs:
  - `POST /api/resume-versions/:id/evaluate-fit`
  - `GET /api/resume-fit-evaluations`
  - `GET /api/resume-fit-evaluations/:id`
- `GET /api/stats` includes `resumeFitEvaluationCount`.
- `WorkflowOrchestrator` adds `RESUME_FIT_EVALUATION` between `RESUME_DRAFT` and `RESUME_AUDIT`.
- `scripts/m10-resume-fit-evaluator-smoke.js` validates store, API, workflow plan, stats, agent run, and workflow events.
- Chrome Extension settings page exposes recent fit evaluations, an `Evaluate JD fit` action, and a resume-detail fit result panel.
- `scripts/m10-options-resume-fit-smoke.js` validates the extension/background wiring and the no-browser-task boundary.

Acceptance:

- JD requirements are extracted into structured skill/responsibility items.
- A resume version receives coverage score, fit level, coverage items, blockers, and revision recommendations.
- Fit evaluation is persisted and list/read APIs work.
- Agent run and workflow event are recorded.
- Application status remains unchanged after fit evaluation.
- No browser task is created and no BOSS action is triggered.
- `npm run m10:resume-fit:smoke` passes.
- `npm run m10:options-resume-fit:smoke` passes.
- `npm run check` includes the evaluator and smoke script.

Boundary:

- This slice does not replace `AuditAgent`; it only checks JD coverage.
- This slice does not verify claim truthfulness; `AuditAgent` and later `ClaimVerifier` remain responsible for source-backed truth checks.
- This slice does not approve submission readiness.
- This slice does not introduce LangGraph.

## M10.3b Claim Verification

Goal: make "is the generated resume source-backed and safe to audit" a testable backend node between ResumeFitEvaluator and AuditAgent.

Deliverables:

- New deterministic agent: `server/src/claim-verifier.js`.
- SQLite schema v10 table: `resume_claim_verifications`.
- New APIs:
  - `POST /api/resume-versions/:id/verify-claims`
  - `GET /api/resume-claim-verifications`
  - `GET /api/resume-claim-verifications/:id`
- `GET /api/stats` includes `resumeClaimVerificationCount`.
- `WorkflowOrchestrator` adds `RESUME_CLAIM_VERIFICATION` between `RESUME_FIT_EVALUATION` and `RESUME_AUDIT`.
- Chrome Extension settings page exposes recent claim checks, a `Verify claims` action, and a resume-detail claim verification panel.
- `scripts/m10-claim-verifier-smoke.js` validates store, API, workflow plan, stats, agent run, and workflow events.
- `scripts/m10-options-claim-verifier-smoke.js` validates the extension/background wiring and the no-browser-task boundary.

Acceptance:

- Resume claims are extracted from summary, skills, projects, awards, and project bullets.
- Each claim is classified as `SUPPORTED`, `WEAK`, `UNSUPPORTED`, or `NEEDS_USER_CONFIRMATION`.
- Unsupported and high-impact unconfirmed claims produce recommendations.
- The workflow blocks AuditAgent until claim verification exists and has no blocking unsupported claims.
- Application status remains unchanged after claim verification.
- No browser task is created and no BOSS action is triggered.
- `npm run m10:claim-verifier:smoke` passes.
- `npm run m10:options-claim-verifier:smoke` passes.
- `npm run check` includes the verifier and smoke scripts.

Boundary:

- This slice does not make final submission decisions.
- This slice does not use pending profile fact drafts.
- This slice does not auto-edit the resume; revision remains a separate step.
- This slice does not introduce LangGraph.

## M10.3c Resume Revision From Checks

Goal: make the "revise after fit/claim checks" loop local, auditable, and testable before adding LangGraph or any delivery automation.

Deliverables:

- New deterministic agent: `server/src/resume-revision-agent.js`.
- New API:
  - `POST /api/resume-versions/:id/revise-from-checks`
- Reuse the existing `resume_versions` table instead of adding a new schema table.
- `createResumeVersion` now supports a no-status-change creation path for checked revisions.
- `WorkflowOrchestrator` routes `REVISE_RESUME_FOR_JD_FIT` and `REVISE_OR_CONFIRM_RESUME_CLAIMS` to `/revise-from-checks`.
- Chrome Extension settings page exposes `Revise from checks` and opens the newly created version.
- `scripts/m10-resume-revision-agent-smoke.js` validates store, API, workflow plan, agent run, workflow event, no browser task, and no application status advancement.
- `scripts/m10-options-resume-revision-smoke.js` validates extension/background wiring and the no-browser-task boundary.

Acceptance:

- A checked revision creates a new resume version and preserves the old version.
- Revision metadata links to the base resume version, fit evaluation, and claim verification.
- Unsupported claims can be removed; weak or unconfirmed claims can be softened.
- Missing JD evidence can only be surfaced from confirmed local profile facts or skills.
- The workflow requires the new version to be re-evaluated and re-verified before audit.
- Application status remains unchanged after revision.
- No browser task is created and no BOSS action is triggered.
- `npm run m10:resume-revision:smoke` passes.
- `npm run m10:options-resume-revision:smoke` passes.
- `npm run check` includes the revision agent and smoke scripts.

Boundary:

- This slice does not introduce LangGraph.

## M10.4 LangGraph Resume Workflow

Goal: introduce LangGraph only after the resume fit, claim verification, and revision nodes have stable persisted contracts.

Delivered:

- Added official `@langchain/langgraph` dependency.
- Added `server/src/resume-workflow-graph.js`.
- Added backend API:
  - `POST /api/applications/:id/resume-workflow-graph`
- Graph flow:

```text
load_context
-> screen_application
-> prepare_resume
-> evaluate_fit
-> verify_claims
-> decide_revision
   |-- revise_resume -> evaluate_fit -> verify_claims -> decide_revision
   `-- audit_resume
```

Rules:

- Graph orchestration remains local-first and backend-owned.
- Graph does not create BOSS browser tasks.
- Graph does not send greetings, upload files, or submit applications.
- `UNSUPPORTED` claims block audit until revision removes them or `maxRevisions` is exhausted.
- `NEEDS_USER_CONFIRMATION` claims can continue to audit as risk evidence, but they remain visible for manual review.

Document rendering:

- `DocumentRenderer` now records optional `photoPath` and `referenceDocxPath` in render metadata.
- Generated DOCX can include a local photo.
- Exact Word template cloning is not implemented; the current scope is a stable local DOCX output flow with reference-template metadata.

Validation:

```powershell
npm run check
npm run m10:langgraph-resume:smoke
npm run m10:options-resume-workflow:smoke
```

Sample validation now uses an embedded anonymous career context by default. Private validation files can be injected locally with:

- `BOSS_FIND_SAMPLE_CAREER_CONTEXT`
- `BOSS_FIND_SAMPLE_REFERENCE_DOCX`
- `BOSS_FIND_SAMPLE_PHOTO`

Those private files are local-only and must not be committed.

Latest verified result:

- Graph completed.
- Final application status reached `RESUME_AUDITED`.
- Agent runs included `ScreeningAgent`, `ResumeAgent`, `ResumeFitEvaluator`, `ClaimVerifier`, `ResumeRevisionAgent`, and `AuditAgent`.
- DOCX output was generated with photo/reference metadata.
- Workflow events captured graph and node progress.

Current M10.5 delivered settings-page entry:

- Chrome Extension background proxies `RUN_RESUME_WORKFLOW_GRAPH` to `POST /api/applications/:id/resume-workflow-graph`.
- Settings page adds `一键跑简历闭环`; if a resume detail is selected it uses that application, otherwise it uses the first eligible resume candidate.
- Screening candidates, screening results, and resume candidates expose per-row `一键简历闭环` actions, so the user can run the loop for a selected job.
- The action refreshes resume diagnostics, screening diagnostics, workflow errors/events, and application timeline, then opens the generated resume version detail when available.
- Errors are written by graph/node telemetry to `workflow_events` and become visible in the settings page `Workflow progress` panel.
- The extension action does not create browser tasks, send greetings, upload files, submit applications, mark local approval, or mark submission readiness.

## M10.5 Backend Service Structure

Goal: reduce `server.js` growth before adding ProfileAgent fact confirmation and later submission policy logic.

Delivered:

- Added `server/src/services/profile-service.js`.
  - Owns `GET/POST /api/profile/career-context` service behavior.
  - Owns ProfileAgent agent-run logging.
  - Owns `CAREER_CONTEXT_GENERATED` / `CAREER_CONTEXT_FAILED` workflow events.
- Added `server/src/services/resume-workflow-service.js`.
  - Owns `POST /api/applications/:id/resume-workflow-graph` payload mapping.
  - Keeps generated DOCX output default under `server/data/generated_resumes`.
- Added `server/src/server-utils.js`.
  - Shared `httpError`, `structuredError`, and `summarizeProfileForTrace`.
- `server.js` remains the native Node HTTP router and delegates to services.
- No new routing framework was adopted; `router`, `find-my-way`, and similar packages were checked, but migration cost is not justified for this slice.
- Static smoke test: `scripts/m10-backend-structure-smoke.js`.

Acceptance:

- Existing ProfileAgent and LangGraph API contracts remain unchanged.
- `server.js` no longer owns the moved `generateCareerContext` implementation.
- `server.js` no longer builds `runResumeWorkflowGraph` options inline.
- New service files are included in `npm run check`.
- `npm run m10:backend-structure:smoke` passes.

Next:

- Extend the ProfileAgent settings UI so answered questions can submit fact drafts and let the user confirm/reject them from one place.
- Later submission policy and real-action gates should get their own service module before adding more routes.

## M11.1 Resume Template Registry / Skill-backed DOCX Output

Goal: turn the DOCX resume output from an ad hoc fixed renderer into a controllable template contract backed by the project skill.

Scope:

- Add `server/src/resume-template-registry.js` as the local template registry.
- Make `resume-to-word-campus-product-v1` the default template.
- Keep `boss-find-fixed-docx-v1` as a legacy compatibility template.
- Update `DocumentRenderer` so template metadata is persisted with each rendered resume:
  - `template`
  - `templateLabel`
  - `templateSkill`
  - `templateOrder`
  - `showSummarySection`
  - `showSkillsSection`
- Expose a compact DOCX template selector in the Chrome Extension settings page and pass it through `renderOptions.templateName` when running `一键跑简历闭环`.
- Show rendered template metadata in the resume detail panel so template/debug state is visible without opening the generated DOCX.
- Add `GET /api/resume-templates` so the extension loads template options from the backend registry rather than treating the HTML select as the source of truth.
- Persist the selected template in extension settings as `resumeTemplateName`.
- Use the selected template for both manual `规则生成简历` and graph-based `一键跑简历闭环`.
- Update `.agents/skills/resume-to-word/SKILL.md` so the Word resume skill owns the default section order and suppression rules.

Default resume-to-word template behavior:

- Header first.
- Education before internships/projects.
- Internships and projects carry JD evidence.
- No standalone `求职摘要`, `核心匹配点`, `技能关键词`, or `补充经历` section by default.
- Skills are embedded in project bullets or compact project capability lines.
- Hard target remains 2 pages or less.

Out of scope:

- Exact Word template cloning.
- Drag-and-drop visual template editor.
- PDF export.
- Replacing the current `docx` library with a templating engine.

Validation:

```powershell
npm run m11:resume-template:smoke
npm run m10:langgraph-resume:smoke
npm run check
```

Acceptance:

- Default DOCX render records `template = resume-to-word-campus-product-v1`.
- Default DOCX render records `templateSkill = resume-to-word`.
- Default DOCX text puts `教育经历` before `项目经历`.
- Default DOCX does not render standalone `求职摘要` or `技能` headings.
- Settings page one-click resume workflow can choose the default or legacy DOCX template.
- Settings page template choices are loaded from `GET /api/resume-templates`.
- Selected template survives settings-page refresh through `chrome.storage.local`.
- Manual rules resume generation and one-click graph generation use the same selected template.
- Resume detail displays template label, template skill, section order, and summary/skills visibility.
- Legacy `boss-find-fixed-docx-v1` remains available and still renders standalone summary/skills sections.

## M11.2 DOCX Render QA

Goal: make generated DOCX files testable after rendering, so the local resume workflow can catch broken output before the user sends or uploads a file.

Delivered:

- Added `server/src/resume-render-qa.js`.
- `DocumentRenderer` runs DOCX render QA after writing the file and attaches `renderQuality` to the render result.
- `sqlite-store.attachResumeFile` persists the QA object inside `resume_versions.renderMetadata` without a schema change.
- `AuditAgent` reads `renderMetadata.renderQuality`, adds `Render QA:` risk flags for hard failures, records `renderQualityPassed`, and blocks approval when QA failed.
- Chrome Extension resume detail displays a `DOCX QA` section with pass/fail status, estimated pages, extracted text length, and warnings.
- Added `scripts/m11-render-qa-smoke.js`.
- M10 LangGraph smoke now verifies render QA is persisted on the resume version and reflected in audit metadata.

QA checks:

- DOCX text extraction succeeds.
- Template metadata is present.
- Expected headings are present for sections that have content and should render.
- Section order matches the selected template.
- Default template suppresses standalone `求职摘要` and `技能` headings.
- Estimated page count stays within `maxPages`.
- Known headings do not contain mojibake.

Important rule:

- `requiredFieldsPresent` remains visible in `checks` and warnings, but content completeness alone is not a DOCX render hard failure. Render QA should block malformed output, wrong template behavior, or page/layout policy failure, not a usable resume that simply has no awards section.

Validation:

```powershell
npm run m11:render-qa:smoke
npm run m11:resume-template:smoke
npm run m10:langgraph-resume:smoke
npm run m10:options-resume-workflow:smoke
```

Acceptance:

- Default and legacy DOCX renders have `renderQuality.ok = true`.
- Bad section order and standalone default-template skills headings are detected.
- AuditAgent blocks failed render QA and records `renderQualityPassed = false`.
- LangGraph-generated resume versions persist `renderMetadata.renderQuality`.
- Successful LangGraph sample flow reaches `RESUME_AUDITED`.
- Settings page detail can show DOCX QA metadata without opening Word.

## M11.3 Local Execution Package

Goal: close the current local workflow loop after submission readiness review without enabling real BOSS execution.

Delivered:

- Added `server/src/services/execution-package-service.js`.
- Added `GET /api/applications/:id/execution-package` for read-only package preview.
- Added `POST /api/applications/:id/execution-package` for package preparation, local JSON/Markdown archive writing, plus `EXECUTION_PACKAGE_PREPARED` workflow event.
- Updated `WorkflowOrchestrator` final action `PREPARE_MANUAL_EXECUTION_PACKAGE` to point at the execution-package endpoint.
- Added Chrome Extension settings-page action `Prepare execution package` and local package detail rendering.
- Added `scripts/m11-execution-package-smoke.js`.

Ready gate:

- Approved and locally approved DOCX resume.
- DOCX render QA has no hard failure.
- Latest audit approved.
- Greeting draft exists.
- SEND_GREETING dry-run succeeded.
- UPLOAD_RESUME and SUBMIT_APPLICATION dry-run evidence is ready and safe.
- Submission readiness is `READY_FOR_MANUAL_REVIEW`.
- Local review is `APPROVED_FOR_MANUAL_EXECUTION`.

Safety boundary:

- No browser task creation.
- No application status transition.
- No real send/upload/submit action.
- Package output includes `realActionsBlocked`.
- Package archives are written under the backend data directory, not to the extension.

Validation:

```powershell
npm run m11:execution-package:smoke
```

Acceptance:

- GET returns a package with blockers before local readiness review approval.
- GET returns `READY_FOR_MANUAL_EXECUTION` after all local gates pass.
- POST records `EXECUTION_PACKAGE_PREPARED`.
- POST returns archive JSON/Markdown paths and records them in workflow event metadata.
- POST does not create browser tasks and does not move the application to `SUBMITTED`.
- Extension settings page can render the package summary and blockers.

## M11.4 Execution Package Validation and Review Gate

Goal: make the local execution package reviewable and auditable before any future manual or real BOSS execution step is discussed.

Delivered:

- Added a narrow `validateExecutionPackage` contract in `server/src/services/execution-package-service.js`.
- `GET /api/applications/:id/execution-package` now attaches validation results to the preview package.
- `POST /api/applications/:id/execution-package` validates the package after archive writing and stores validation metadata in `EXECUTION_PACKAGE_PREPARED`.
- Added `POST /api/applications/:id/execution-package/review` for local review decisions:
  - `APPROVED_FOR_MANUAL_EXECUTION`
  - `REFRESH_REQUIRED`
  - `BLOCKED`
- Review decisions are recorded as `EXECUTION_PACKAGE_REVIEWED` workflow events.
- The Chrome Extension settings page shows validation failures/warnings and exposes package review actions inside the execution-package detail area.

Validation contract:

- Package version, application id, status, job identity, and manual steps must be present.
- `noRealBossAction` must be `true`.
- `createsBrowserTasks` must be `false`.
- `noBrowserTaskCreated` must be `true`.
- `realActionsBlocked` must include `SEND_GREETING_REAL`, `UPLOAD_RESUME_REAL`, and `SUBMIT_APPLICATION_REAL`.
- Ready packages must include approved DOCX, local resume approval, DOCX QA pass, approved audit, greeting draft, dry-run evidence, submission readiness, and local readiness approval.
- Prepared packages must have existing JSON and Markdown archive paths.

Safety boundary:

- Review records do not create browser tasks.
- Review records do not advance application status.
- Review records do not upload, send, confirm, submit, or mark the application as submitted.
- Approval is blocked if the execution package is not ready or validation fails.

Validation:

```powershell
npm run m11:execution-package:smoke
```

Acceptance:

- Unsafe package mutations fail validation.
- Ready prepared packages validate successfully with archive files present.
- Package review records `EXECUTION_PACKAGE_REVIEWED`.
- Review does not create browser tasks and does not change application status.
- Extension settings page can show validation state and submit review decisions.

## M11.5 Manual Execution Checklist Ledger

Goal: after a package is prepared and approved, give the user a local checklist ledger for recording manual execution progress without enabling automated BOSS actions.

Delivered:

- Added `GET /api/applications/:id/execution-checklist`.
- Added `POST /api/applications/:id/execution-checklist`.
- Checklist steps are derived only from the execution package `manualSteps`.
- Step records are stored as `EXECUTION_CHECKLIST_STEP_RECORDED` workflow events.
- The Chrome Extension settings page renders the checklist under the execution package detail and can record `DONE`, `FAILED`, `BLOCKED`, or `NEEDS_REFRESH`.

Rules:

- Manual progress can be recorded only after the execution package review is accepted as `APPROVED_FOR_MANUAL_EXECUTION`.
- Unknown step actions are rejected.
- Step records keep `noRealBossAction: true`, `createsBrowserTasks: false`, and `noBrowserTaskCreated: true`.
- Recording a checklist step does not create browser tasks.
- Recording a checklist step does not advance application status or mark the application as submitted.

Validation:

```powershell
npm run m11:execution-package:smoke
```

Acceptance:

- Checklist reads return package review state, blockers, step list, and progress.
- Step records create only `EXECUTION_CHECKLIST_STEP_RECORDED` workflow events.
- Checklist progress updates after a recorded step.
- Browser task count and application status stay unchanged.
- Extension settings page can display and record checklist step decisions.

## M12.1/M12.2 Submission Evidence Closed Loop

Goal: after the local execution package and manual checklist exist, record what the user can see on the current BOSS page without adding real BOSS automation.

Delivered:

- Added `server/src/services/submission-result-service.js`.
- Added `GET /api/applications/:id/submission-evidence`.
- Added `POST /api/applications/:id/submission-evidence`.
- Added `SUBMISSION_EVIDENCE_RECORDED` workflow events.
- Added content-script `READ_SUBMISSION_PAGE_RESULT` for read-only visible-page result detection.
- Added background proxy messages `GET_SUBMISSION_EVIDENCE` and `RECORD_SUBMISSION_EVIDENCE`.
- Added settings-page controls: `Read current BOSS result`, `Record result evidence`, and `submissionEvidenceDetail`.
- Added `scripts/m12-submission-evidence-smoke.js`.

Acceptance:

- Manual/page evidence can be written and fetched for one application.
- The latest evidence includes status, confidence, signals, blockers, and safety metadata.
- Writing evidence creates only a workflow event.
- Browser task count stays unchanged.
- Application status stays unchanged.
- Extension detection is read-only and does not call `CREATE_BROWSER_TASK`.

Validation:

```powershell
npm run m12:submission-evidence:smoke
npm run m11:execution-package:smoke
```

## 13. M13 质量基线与可回放工作流

### 目标

在继续扩展真实 BOSS 发送、上传或投递能力之前，先让仓库、数据库和 Agent 结果具备可验证、可升级、可回放的工程基线。

### M13.1 仓库基线、测试分层与 CI

状态：已完成。

交付物：

- `scripts/check-js-syntax.js` 自动发现项目 JavaScript 文件，替代 `package.json` 中容易漏项的手工文件清单。
- `scripts/test-tiers.js` 和 `scripts/run-test-tier.js` 将 52 个既有 smoke 加 M13 基线 smoke 分为 `baseline`、`profile`、`agents`、`extension`、`workflow` 五层。
- `scripts/m13-repository-baseline-smoke.js` 检查敏感文件忽略规则、必需源码/文档、受控 schema 版本、测试归类和 CI 契约。
- `.github/workflows/ci.yml` 在 Node.js 24 环境执行 `npm ci`、安装 Playwright Chromium，并运行完整 `npm run test:ci`。
- 保留 `npm run check` 兼容入口，并新增 `check:syntax`、`test:profile`、`test:agents`、`test:extension`、`test:workflow`、`test:baseline` 和 `test:ci`。

验收标准：

- 新增 `.js` 文件无需手改 `package.json` 即进入语法检查。
- 每个 `m*:smoke` 必须且只能归入一个测试层级。
- `.env`、模型配置、SQLite、DOCX、PDF、日志和 `server/data` 运行数据不能被提交。
- 扩展 UI smoke 可复用系统 Chrome/Edge 或 Playwright 安装的 Chromium。
- `npm run check`、`npm run test:baseline` 和 `npm run test:ci` 通过。

### M13.2 SQLite 有序迁移

状态：已完成。

交付物：

- 新增 `server/migrations/001_*.sql` 至 `010_*.sql`，按岗位采集、质量、application、浏览器任务、用户画像、Agent、简历、可观测、fit、claim 的依赖顺序建库。
- 新增 `server/src/sqlite-migrations.js`，验证 migration 文件连续性、命名、事务边界和 checksum。
- 新增 `schema_migrations` 审计表，记录版本、名称、SHA-256 checksum、`BASELINED/APPLIED`、执行耗时和时间。
- 旧数据库在 schema 或迁移元数据变化前使用 SQLite `VACUUM INTO` 写入 `backups/*.backup.sqlite3`。
- 每个 migration 独立运行在 `BEGIN IMMEDIATE` 事务中，成功后才写入历史并推进 `PRAGMA user_version`。
- migration 失败时关闭连接、删除当前 WAL/SHM、恢复升级前备份；新建库失败则删除半成品数据库。
- `getStats()` 暴露本次 `migrationStatus`，包含起止版本、应用/基线化版本、备份路径和耗时。
- 删除集中式 `applySchema()`，后续 schema 变更只能新增顺序 migration。
- 新增 `scripts/m13-sqlite-migrations-smoke.js`。

验收：

- 全新数据库按 001-010 创建，无需备份。
- v7 数据库保留岗位数据并升级到 v10，001-007 记为 `BASELINED`，008-010 记为 `APPLIED`。
- 已是 v10 但没有迁移历史的现有数据库先备份，再基线化 001-010，不重复执行业务 migration。
- 损坏的 010 migration 不推进版本、不保留半成品表，并恢复原 v9 数据库。
- migration 备份保留用于人工检查。
- `npm run m2:sqlite:smoke`、`npm run m13:sqlite-migrations:smoke`、`npm run test:ci` 通过。

### M13.3 不可变工作流输入

状态：已完成。

交付物：

- 新增 schema v11 migration `011_workflow_input_snapshots.sql`。
- 新增 `profile_snapshots`、`workflow_runs`、`workflow_input_snapshots`。
- 复用 `job_snapshots` 保存每次 workflow 使用的精确 JD/job payload。
- `agent_runs` 新增 `workflow_run_id`、`profile_snapshot_id`、`job_snapshot_id`、`prompt_version`、`agent_version`、`model_config_json`、`graph_version`。
- 图开始前一次性持久化 application、profile、job、user rules、execution/render options、脱敏 model config 和版本 manifest。
- Screening、Resume、Fit、Claim、Revision、Audit 节点只读取 frozen workflow input。
- workflow result 持久化到 `workflow_runs.output_json`，失败保存结构化 error。
- 新增 `GET /api/workflow-runs`、`GET /api/workflow-runs/:id` 和 `POST /api/workflow-runs/:id/replay`。
- replay 是 no-write dry replay，按原 input hash 对比当前 Agent 输出，不写业务表、不改变状态、不创建 browser task。
- 新增 `scripts/m13-workflow-input-snapshots-smoke.js`。

验收：

- 同一图运行内全部 Agent run 引用同一组 profile/job snapshot IDs 和版本字段。
- model config 入库前移除 API Key/token/secret。
- 图完成后修改用户画像和 JD，历史 workflow run 的 payload 与 input hash 不变。
- 新图运行生成新的 snapshot IDs，已完成 application 状态不倒退。
- dry replay 从历史输入重跑并与原输出一致，同时数据库计数和 application 状态不变。
- `npm run m13:workflow-inputs:smoke`、`npm run m10:langgraph-resume:smoke`、`npm run test:ci` 通过。

### M13.4 application 状态迁移收敛

状态：已完成。

交付物：

- 新增 schema v12 migration `012_application_transition_invariants.sql`。
- 新增 `server/src/services/application-transition-service.js`，集中拥有 application 状态图、typed evidence 校验、幂等查重、状态写入和 transition workflow event。
- `application_events` 新增 application 级唯一 `idempotency_key`。
- Screening、Resume、Audit、local approval、job sync、read-only browser callback 全部改为“先写事实，再请求迁移”。
- `server/src` 内 `UPDATE applications` 只保留在 `ApplicationTransitionService`。
- operator override 必须写 actor、rationale 和 idempotency key，且不能推进真实发送/投递终态。
- `browser_tasks` 新增 `expires_at`、`attempt_count`、`max_attempts`、`last_attempt_at`、`claim_token`。
- Chrome Extension 在 browser task 回写时携带 claim token。
- 重复终态回调相同则幂等返回，结果冲突或重试旧 token 返回 409。
- 过期任务在 claim/完成前转为 `FAILED/TASK_EXPIRED`；失败任务达到最大尝试次数后不能重排。
- 新增 `scripts/m13-application-transition-invariants-smoke.js` 并纳入 workflow/CI 测试层。

验收：

- 非法状态边和缺少 typed evidence 的迁移均原子失败。
- job sync 批次归属、screening recommendation/目标状态、failure source 类型/归属/失败状态均由专项 smoke 覆盖。
- operator override 缺少显式 idempotency key 时，在状态写入前拒绝。
- 同一 idempotency key 重复提交不新增 application/workflow event；同 key 不同语义返回冲突。
- 重复 read-only browser callback 不重复归档消息、写 readiness 或推进 application。
- application 已进入 `RESUME_UNLOCKED` 后，旧 `CHAT_OPENED` 回调不能使状态倒退。
- retry 后旧 claim token 被拒绝，当前 attempt 保持 `RUNNING`。
- 任务过期和 retry 耗尽均有明确状态、错误码和测试。
- `npm run m13:application-transitions:smoke`、`npm run test:workflow`、`npm run test:ci` 通过。

### M13.5 Agent 评测集

状态：已完成。

交付物：

- 建立版本化、本地匿名的用户画像、JD、claim probe 和 Audit probe 固定样本集；样本包含人工风险标签、预期岗位顺序、JD 必要项状态、允许/禁止 claim 和预期 Audit 结果。
- 新增确定性 Node.js 评测 runner，直接调用生产 `JobRiskGate`、`ScreeningAgent`、`ResumeAgent`、`ResumeFitEvaluator`、`ClaimVerifier` 和 `AuditAgent`，规则模式下不要求模型密钥且不读写真实 SQLite。
- 输出稳定的 JSON 和 Markdown 报告，记录数据集 SHA-256、运行模式、provider、模型元数据、graph/prompt/agent 版本、阈值、逐项指标和失败样本。
- 新增 `m13:agent-evaluation:smoke` 并归入 `test:agents`；默认评测命令在任一质量指标低于阈值时返回非零退出码。
- 风险门禁新增否定语境识别，`不承担销售指标`、`不涉及直播带货` 不再被关键词误杀；同一 JD 中存在后续正向风险职责时仍会阻断。

验收标准：

- 风险门禁同时报告 recall 和 precision，并能区分真实排斥方向与“无需销售/不承担直播职责”等否定语境。
- 同一画像下的岗位匹配分数满足人工标注顺序，报告 pairwise ranking accuracy 和所有逆序样本。
- 人工标注的 JD 必要项能映射到 Fit 评测项，并核对 `covered/weak/missing` 状态。
- 生成简历 claim 支持率达到阈值；人工允许/禁止 claim probe 的判定与标签一致。
- `approve/revise/block` Audit probe 与人工预期一致。
- JSON/Markdown 报告包含相同 run summary、输入快照和失败样本 ID，不包含真实用户姓名、联系方式、私有文件路径或模型密钥。
- `npm run m13:agent-evaluation:smoke`、`npm run test:agents` 和 `npm run test:ci` 通过。

完成结果：

- 固定集包含 2 个匿名画像、9 个岗位、2 个 claim probe 和 3 个 Audit probe。
- 9 项指标全部达到阈值；生成 claim 支持率为 `0.9615`，其余基线指标为 `1.0`。
- 故意修改风险人工标签后，runner 会失败并定位到 `job-sales-blocked`，证明质量门禁不是恒通过检查。
- `npm run check` 通过 103 个 JavaScript 文件；`npm run test:workflow` 通过 27 个 smoke；`npm run test:ci` 通过全部 57 个 smoke。

### 开发顺序

```text
M13.1 仓库基线与 CI
-> M13.2 SQLite 有序迁移
-> M13.3 不可变画像/JD 快照
-> M13.4 状态迁移收敛
-> M13.5 Agent 评测集
-> 再评估真实 BOSS 动作范围
```

## 14. M14 真实动作金丝雀

### M14.1 单岗位真实打招呼授权协议

状态：协议、后端、扩展控制与本地 fixture 验证已完成；真实 BOSS 页面 canary 待用户单独确认后执行。

目标：在不开放批量执行、后台自动发送、真实简历上传或真实投递的前提下，只验证一个用户明确选择岗位的 `SEND_GREETING_REAL` 动作。

实现边界：

- 新增独立任务类型 `SEND_GREETING_REAL`，普通 `POST /api/browser-tasks` 不能直接创建。
- 全局真实动作策略默认关闭；启用必须提供 actor、rationale 和不超过 30 分钟的截止时间。
- 每次授权只绑定一个 application、一个岗位和一条已存在的打招呼草稿，原始授权令牌只返回一次，SQLite 只保存 SHA-256 hash。
- 授权默认 5 分钟失效；入队时再次验证策略、application 状态、消息、岗位、每日额度和 cooldown。
- 第一阶段每日额度固定为 1，任务 `maxAttempts = 1`，失败或过期任务不能重排。
- 内容脚本点击前校验当前页面、岗位 hash 和消息 hash；只允许一次发送按钮点击。
- 点击后必须从 DOM 回读同一条消息并再次校验 hash，后端才将消息写为 `SENT`，并通过 `ApplicationTransitionService` 推进 `GREETING_READY -> GREETING_SENT`。
- 一旦发生“已点击但 DOM 无法确认”，授权进入 `UNCERTAIN`，application 进入 `NEEDS_USER_REVIEW`，绝不自动重试。
- 登录失效、验证码、页面/岗位/消息不匹配和发送按钮缺失均在点击前失败并记录错误。
- 自动化测试只运行本地 SQLite 和拦截的静态 DOM fixture，不访问真实 BOSS，也不产生真实动作。

明确不包含：

- `UPLOAD_RESUME_REAL`。
- `SUBMIT_APPLICATION_REAL`。
- 批量打招呼。
- 页面后台轮询后自动发送。
- 登录、验证码或平台风控绕过。

验收：

- 默认策略下无法创建授权，也无法通过通用 browser-task API 绕过授权创建真实任务。
- 错误令牌、过期令牌、重复消费、超额、cooldown、岗位或消息变化均在任务入队或点击前失败。
- 成功回调必须包含完整 preflight 与 DOM readback 证据；缺失证据时事务回滚，不能写 `SENT/GREETING_SENT`。
- 确认成功只写一次消息、授权、browser task 和 application 终态，重复相同回调幂等。
- uncertain 结果保留可诊断证据，任务不可重排，application 进入人工复核。
- `npm run m14:real-action:smoke`、`npm run m14:extension-real-greeting:smoke`、`npm run test:workflow` 和 `npm run test:ci` 通过。

### M14.1c 用户工作台与诊断收敛

状态：已完成。

目标：把原先平铺 21 个区块、35 个按钮的“设置与诊断”改成面向日常求职流程的 application 工作台，同时保留全部工程诊断和 M14.1 安全协议。

交付物：

- options 页改为 `工作台 / 个人经历 / 设置` 三个 ARIA tab；默认只显示工作台。
- 工作台直接复用既有 `GET /api/applications`，以岗位表为主视图，并根据 application 状态推导唯一 `nextAction`。
- `DETAIL_CAPTURED -> 评估岗位` 只传入当前 `applicationIds`；`SHORTLISTED -> 生成定制简历`；`RESUME_DRAFTED/RESUME_AUDITED -> 查看并审批`；`GREETING_READY -> 准备打招呼/发送一次`。
- 简历详情、受限编辑和本地审批移动到按需打开的审核弹窗；ProfileAgent 保持独立、持久化的个人经历入口。
- 后端同步、岗位偏好和 DOCX 模板保留在设置页；浏览器任务、采集质量、Agent 手动节点、最近异常、待补 JD 和 workflow 日志默认折叠在“高级诊断”。
- 真实打招呼的旧工程控件保留在高级诊断；工作台使用两步确认弹窗，确认后仍调用 M14.1 的短时策略、一次性授权和 `SEND_GREETING_REAL` 单次执行协议。
- 新增 `scripts/m14-options-workspace-ui-smoke.js`，使用 mocked extension API 在桌面和 390px 移动视口验证布局、上下文操作、键盘页签和双确认，不访问 BOSS、不创建 browser task 或真实动作授权。

验收：

- 默认工作台可见按钮固定为 5 个：3 个页签、刷新和 1 个上下文主操作。
- 桌面与移动视口无文档横向溢出、页签/工作区重叠或按钮文本截断。
- 同一主按钮可随 application 状态切换为“评估岗位 / 生成定制简历 / 查看并审批 / 发送一次 / 查看并处理”。
- 高级诊断默认关闭，展开后既有卡片和手动恢复入口仍可使用。
- `npm run m14:options-workspace-ui:smoke`、`npm run test:extension` 和 `npm run test:ci` 通过。

### M14 后续顺序

```text
M14.1 单岗位真实打招呼授权协议
-> M14.1c 用户工作台与诊断收敛
-> M15.1 Profile Conversation & Memory v2
-> M16 真实模型 Agent 质量闭环（已完成）
-> M14.3 简历选择/上传 POC
-> M14.4 单岗位真实投递金丝雀
```

## 15. M15 ProfileAgent 长期画像基础

### M15.1 Profile Conversation & Memory v2

状态：已完成实现与本地模型 fixture/Playwright 验证；真实用户对话质量仍需持续评测。

目标：把 ProfileAgent 从规则问卷升级为可恢复的模型多轮对话，让用户经历、目标和修正可以持续沉淀，同时保证后续简历 Agent 只读取用户确认后的正式画像。

交付物：

- schema v14 migration `014_profile_conversation_memory.sql`：新增 dialog sessions/messages、context versions、entity revisions，并为事实草稿增加 operation、target 和来源消息。
- `server/src/profile-conversation-agent.js`：运行时加载项目内 `career-retrospective-to-job` Skill，调用现有 OpenAI-compatible client，校验严格 JSON 输出。
- `server/src/services/profile-conversation-service.js`：消息先落库、模型调用、摘要合并、草稿生成、失败记录和原消息重试。
- ProfileAgent API：session 列表/创建/详情、发送消息、重试消息、entity revision 查询。
- “个人经历”页以多轮聊天为主入口，展示会话摘要、下一步追问、冲突和待确认草稿；原规则文本入口默认折叠。
- `career_agent_context.md` 生成同步建立 context version，并用 profile/content hash 判断可复用性。
- `CREATE` 草稿确认后新增事实；`UPDATE` 草稿确认后修改指定实体并保存 before/after revision。
- 模型调用失败不自动规则降级，不丢用户消息，也不创建 application/browser task/BOSS 动作。

验收：

- session/message 在刷新和后端重启后可恢复。
- 模型输出只能形成 `PENDING` 草稿，确认前正式画像不变。
- 更新草稿必须绑定现有实体，确认后实体 ID 不变且 revision 可查。
- 模型失败保存 user message、failed assistant message、agent run 和 workflow event；重试不重复 user message。
- context version 保存来源 session/message 和两类 hash，画像变化后状态变为 `STALE`。
- 桌面与 390px 移动端对话、摘要、草稿无横向溢出；UI fixture 不触发 BOSS 动作。
- `npm run m15:profile-conversation:smoke`、`npm run m15:options-profile-conversation:smoke`、`npm run test:profile`、`npm run test:extension` 和 `npm run test:ci` 通过。

明确不包含：

- 向量数据库或跨用户语义检索。
- 把 ProfileAgent 放入每个岗位的 ResumeWorkflowGraph。
- 模型自动确认事实或静默删除正式画像。
- LangGraph checkpoint；只有画像访谈出现复杂分支中断和跨设备恢复需求后再评估。

## 16. M16 真实模型 Agent 质量闭环

状态：已完成实现、fixture smoke、桌面/移动 UI 验证和真实模型正式评测。

### 目标

把 M13 的 rules-mode 回归集升级为可重复的真实模型质量门禁，同时保持事实证据、风险门禁、ProfileAgent 持久化边界和 BOSS 真实动作边界不变。

### 开源复用与技术选型

- 选用官方 `openai@6.46.0` 负责 OpenAI-compatible transport、错误和 usage 对象。
- 选用 `zod@4.4.3` 负责 Screening、Resume、Fit、Audit 和 Profile conversation 严格输出 Schema。
- 不引入 `@langchain/openai`；现有 LangGraph 继续只负责图编排，模型 transport 保持独立，避免再增加一层消息/回调抽象。
- 不引入 promptfoo/DeepEval/LangSmith 作为核心 runner；复用 M13 匿名数据契约和业务指标，后续可把报告适配到通用框架。
- 评估过官方 Responses WebSocket + `ws`，但当前供应商经 Cloudflare 返回 426，且不应为不可用路径保留依赖，因此最终未引入 `ws`。

### 实现

- `server/src/model-client.js`：Responses/Chat transport、兼容双层 JSON Chat 响应、Zod 校验、请求 hash、usage、reasoning token、延迟、attempt 和可选成本；Schema 与网络错误分类重试，429/5xx 使用指数退避。
- `server/src/agent-output-schemas.js`：五类模型输出契约。
- Screening、Resume、Fit、Revision、Audit 支持 `hybrid/auto/llm/rules`；ClaimVerifier 和 JobRiskGate 保持规则硬门禁。
- ResumeAgent 只接收确认后的 experience/skill ID；每条 bullet 必须绑定确认过的 sourceFact。
- Fit 的 covered/weak 必须引用简历原文；Audit 只能比规则更严格，不能解除 claim、must-have 或 Render QA 阻断。
- Hybrid Screening 使用 70% 确定性证据分 + 30% 模型语义分，风险取高值，推荐由统一阈值生成；原模型分和推荐保留在 metadata。
- schema v15：`agent_runs.model_telemetry_json` 与 `agent_evaluation_runs`。
- API：`GET /api/agent-quality`、`GET /api/agent-evaluations`。
- 设置页：一键闭环模式选择和质量摘要；手动规则工具继续固定为 rules。
- `boss-model.local.json` 作为被忽略的无密钥覆盖层；`boss-model.example.json` 可提交。凭据仍来自环境变量或被忽略的 credential file。

### 真实模型评测

正式命令：

```powershell
npm run agent:evaluate:real -- --samples 3 --delay-ms 2500
```

正式报告：`382ad0764126c5ff`，匿名 fixture 9 岗位 x 3 次，共 27 样本、75 模型节点、574,003 token。

| 指标 | 结果 | 门槛 |
|---|---:|---:|
| structured output success | 1.0000 | >= 0.95 |
| successful samples | 1.0000 | >= 0.90 |
| risk recall / precision | 1.0000 / 1.0000 | >= 1.00 / >= 1.00 |
| ranking pair accuracy | 1.0000 | >= 0.90 |
| Screening recommendation accuracy | 1.0000 | >= 0.75 |
| JD must-have status accuracy | 1.0000 | >= 0.80 |
| generated claim support | 0.966814 | >= 0.95 |
| Audit consistency | 1.0000 | >= 0.80 |
| maximum Screening score stddev | 2.357 | <= 8.0 |
| unsupported claims | 0 | <= 0 |

运行遥测：75/75 模型阶段成功，无 Schema/transport 失败和规则降级；P50/P95 为 6727/12210 ms。模型单价为 0/未配置，不能据此声称费用为零。

一次未退避的正式尝试因供应商连续 502 被正确记录为 `FAILED/AGENT_QUALITY_GATES_FAILED`；增加 2/4/8 秒 5xx 退避、3 次重试和 2500 ms 评测间隔后，第二次正式运行通过。失败记录、metrics、telemetry 和报告均保留，没有被成功记录覆盖。

### 验收

- `npm run m16:real-model-agents:smoke`：模型 Schema 重试、token 持久化、无证据输出阻断、Audit 不可放宽、Chat 双层 JSON 兼容、hybrid score/recommendation policy、browser task 为 0。
- `npm run m16:agent-quality-evaluation:smoke`：11 项指标、重复采样、报告和 SQLite 评测记录。
- `npm run m16:options-agent-quality:smoke`：桌面与 390px 移动设置页、模式保存、质量 API、无 BOSS 动作。
- v14 -> v15 正式 SQLite 自动备份后迁移，备份保存在 `server/data/backups/`。

### 明确不包含

- 不把 ProfileAgent 放入每个岗位图。
- 不让模型绕过风险、claim、must-have、Render QA 或用户事实确认。
- 不创建 BOSS browser task，不打招呼，不上传简历，不投递。
- 不把匿名 fixture 通过等同于真实投递成功率或招聘结果。

### M16.1 真实岗位 Shadow 评审

状态：已完成 schema v16、后端异步 runner/API、追加式人工评审和高级诊断 UI，并通过本地 fixture/API/桌面与移动 UI 验证；首批真实用户 Shadow run 待确认画像具备正式事实后执行。

目标：在不改变岗位流程状态、不创建正式 screening、不触发任何 BOSS 页面动作的前提下，用当前已入库的真实 JD 和用户确认画像验证 ScreeningAgent 的排序、风险判断、稳定性和实际 token 消耗，并把用户纠正沉淀为可晋升到匿名评测集的失败样本。

执行策略：

- 默认选择最近 20 个 JD 完整岗位执行一次 `hybrid` Screening。
- 按首轮结果选出 Top 5，仅为这些岗位补足 3 次采样；默认最多 30 次 Screening，后端同时限制岗位数、Top K、重复数和请求间隔。
- 每个 Shadow run 冻结一份用户画像和每个岗位 JD 快照；运行期间画像或岗位更新不改变历史结果。
- Shadow run 异步执行并持久化 `QUEUED/RUNNING/SUCCEEDED/PARTIAL/FAILED`、逐岗位进度、样本结果、均值、标准差、token、延迟和错误。
- 人工评审标签采用 `CORRECT/FALSE_POSITIVE/FALSE_NEGATIVE/BAD_REASON/RISK_MISSED`，以追加记录保存评审人、修正后的推荐、备注和时间。
- 非 `CORRECT` 标签进入“失败样本候选”，后续经匿名化后再加入 M16 固定评测集；本阶段不自动修改固定集文件。
- 模型单价未配置时以最大调用次数作为预算硬门禁；配置 input/output 单价后再增加美元费用门禁。

明确边界：

- 不写入 `screenings`，不推进或回退 application 状态。
- 不写入 `browser_tasks`，不打开、点击或刷新 BOSS 页面。
- 不把 Shadow 排名直接解释为可投递结论；Top 结果仍需用户复核。
- 不因某个样本失败自动改用真实动作，也不自动重跑整个批次。

交付物：

- schema v16：Shadow run、逐岗位结果和追加式人工评审记录。
- `POST/GET /api/agent-shadow-runs`、单次 run 详情和人工评审 API。
- 设置页“高级诊断”中的单一启动入口、运行进度、Top 岗位和评审控件。
- fixture smoke 覆盖重复采样、排序、方差、失败隔离、人工标签和“无 application/screening/browser task 副作用”。

验收标准：

- fixture 中首轮岗位全部执行，只有 Top K 获得额外采样，调用上限计算正确。
- 同一 run 的所有样本使用同一画像快照和对应 JD 快照。
- 部分模型失败时 run 为 `PARTIAL` 且失败可查看；全部失败时为 `FAILED`。
- 人工标签可追加、可读取最新结论，并能列出失败样本候选。
- Shadow 前后 applications、screenings 和 browser_tasks 数量及状态保持不变。
- 桌面和 390px 移动视口无溢出，Shadow 工具仍位于默认折叠的高级诊断中。

### M17 多岗位队列与本地运行时引导

状态：已完成。岗位采集、用户求职方向和本地后端配置已收敛为普通用户可重复使用的入口，同时保持岗位全局去重、Agent 历史可追溯和 API Key 仅由后端持有。

数据与队列契约：

- `jobs` 继续按 BOSS `jobId`、稳定 `sourceKey` 和标准化详情 URL 全局去重；同一岗位再次采集只更新字段和快照，不新增 application。
- `applications` 继续与岗位一一对应，避免同一岗位因加入多个方向而重复筛选、重复打招呼或重复投递。
- 新增用户岗位队列和队列成员关系。产品、算法等队列引用同一 application；同一岗位允许同时属于多个队列。
- 新建队列后，扩展把当前选中队列 ID 随采集同步请求发送到后端。旧客户端或未选择队列时写入默认队列。
- 工作台的全部岗位、待处理、可推进、需关注和待补 JD 数量只统计当前队列的有效成员。
- 删除采用队列成员软移除，不级联删除岗位、Agent 结果、简历、沟通和投递历史。已从某队列移除的岗位再次采集时保持跳过；加入另一个队列不受影响。

用户界面：

- 工作台支持新建和切换岗位队列，当前队列持久保存在扩展本地设置中。
- 岗位表支持逐项和全选当前可见岗位，并可批量从当前队列移除。
- 待补 JD 面板按当前队列读取，并提供一次确认后的批量软移除。
- 采集弹窗显示当前目标队列；开始采集、暂停和重试继续保持主操作层级。

后端与模型配置：

- 增加只返回脱敏字段的模型配置状态 API，以及需后端授权的保存和连通性测试 API。
- API Key、base URL、model、wire API、超时和重试配置写入被 Git 忽略的后端本地文件；浏览器扩展不持久保存模型 API Key。
- 模型配置修改立即供后续 Agent 调用读取，不要求重启后端；响应、日志和数据库不得包含完整 API Key。

本地启动器：

- Chrome/Edge 扩展不能直接启动本机进程，因此使用标准 Native Messaging，而不是页面脚本、DevTools 或任意命令执行接口。
- Native Host 只接受后端状态和启动命令，实际 Node 路径、项目目录、入口文件和 token 固定在本机配置中，不采信扩展传入的可执行路径。
- 使用 MIT `@yao-pkg/pkg` 生成 Windows host exe；PowerShell 安装器自动发现已加载的扩展 ID，并在当前用户注册 Chrome/Edge Native Messaging Host。
- Native Host 只需安装一次。安装后采集弹窗可一键启动后端；未安装时显示可执行的安装命令，不伪装成启动成功。

验收标准：

- schema 迁移把所有历史 applications 放入默认队列，升级前自动备份，现有流程状态和关联历史不变。
- 同一岗位在同一队列重复同步不增加岗位、application 或有效成员数；跨队列同步只增加成员关系。
- 批量移除只影响当前队列，重复采集不自动恢复已移除成员；待补 JD 批量移除遵守同一规则。
- 模型配置 GET 不返回 API Key，保存后 Agent 配置立即可用，清除 API Key 是显式操作。
- Native Host smoke 验证消息帧、固定命令白名单、后端启动、健康检查和 token 返回；不得支持任意 shell 命令。
- 工作台桌面和 390px 移动视口无横向溢出、控件重叠或文字截断。

### M17 后续顺序

1. 用真实 BOSS 搜索页验证“选择队列 -> 采集完整 JD -> 同队列去重 -> 待补 JD 清理”的普通用户路径。
2. 对当前队列运行风险/匹配筛选和批量 DOCX，人工复核误筛、文件路径、两页限制、Claim 与 Fit 结果。
3. 由用户在打开的 BOSS 页面人工打招呼、上传和投递，工作台只记录 `未联系/已打招呼/已投递`。
4. 把 selector、Agent 和 DOCX 失败样本匿名化后加入固定评测；配置供应商实际单价后再启用费用门禁。

### M17.1 四阶段求职工作台与人工投递边界

状态：已完成。产品逻辑以“采集完整 JD -> 风险与匹配筛选 -> 定制 DOCX -> 用户人工联系/投递”为唯一主路径，打招呼、上传和投递不再作为用户界面的自动动作。

工作台：

- 意向岗位队列支持新建、切换和软删除；默认队列不可删除。新队列为空，采集、筛选、简历和人工状态统计都必须受当前队列约束。
- 采集阶段只向用户展示 JD 长度达到门槛的完整岗位；待补 JD 作为采集暂存数据保留一键清理入口，不进入岗位筛选和简历统计。
- 筛选阶段在工作台填写风险门禁并批量运行。被过滤岗位可在当前队列标记为“信任”并恢复到待筛选状态；信任只绕过用户方向门禁，不伪造匹配分。
- 简历阶段只处理当前队列筛选通过且未生成简历的岗位，分别统计成功和失败；DOCX 输出目录可由用户配置，历史版本路径不被覆盖。
- 人工投递阶段展示岗位详情 URL、最新 DOCX 路径及 `未联系/已打招呼/已投递` 人工状态。打开 BOSS 页面只负责导航，不点击、输入、上传或提交。
- 岗位详情通过统一详情视图展示完整 JD、筛选结果、简历路径和人工状态；岗位批量删除仍是队列成员软移除。

个人画像：

- “个人经历”页增加 DOCX/PDF/TXT/MD 简历上传与文本抽取入口，抽取结果写入 resume source，并生成待确认事实草稿。
- ProfileAgent 多轮对话继续持久化；用户确认事实后点击“整理并保存个人画像”生成版本化 `career_agent_context.md`。
- 提供独立“查看个人画像”入口。画像未确认或已过期时，岗位简历闭环不得把待确认草稿当作正式事实。

设置与运行时：

- 采集弹窗只保留后端状态、目标队列、开始/暂停/重试、完整岗位、待补 JD 和失败数；隐藏本地缓存上限、单次补齐上限和点击间隔。
- 设置页保留后端地址、同步路径、Token、模型服务与 DOCX 输出目录；风险门禁移到工作台。
- 高级区域只展示最近异常、Agent/workflow 执行日志和待补 JD 清理。简历实验工具、打招呼工具、真实动作授权和 Shadow 评审不再暴露给普通用户。

数据与安全：

- 人工联系状态独立于既有 application Agent 状态机，允许用户纠正，但每次修改写入 workflow event；状态修改不代表系统执行了 BOSS 动作。
- 队列删除、岗位移除和待补 JD 清理均为软删除，不删除岗位、筛选、简历、日志或历史证据。
- 重复岗位继续全局合并：同一队列重复采集自动跳过，跨队列首次出现只新增成员；已从该队列移除的岗位不会因重复采集自动恢复。

验收：

- 产品/算法两个队列的完整 JD、筛选结果、简历统计和人工状态互不串联。
- 队列软删除后自动回退到默认队列；同名队列可重新创建且为空。
- 完整 JD 才进入工作台主列表；待补 JD 一键移除不影响其他队列。
- 信任岗位可从风险过滤恢复，后续批量筛选不再命中用户方向门禁。
- DOCX 批量生成只处理当前队列候选，成功/失败可查看，文件写入用户配置目录。
- 从工作台打开岗位不会创建 browser task、真实动作授权、打招呼、上传或投递请求。
- Profile 简历上传、对话、事实确认、画像整理和刷新后查看形成可恢复闭环。
- 桌面与 390px 视口无横向溢出、控件遮挡或文字截断；专项 smoke 和 `npm run test:ci` 通过。

完成记录（2026-07-14）：

- schema v18 已在生产本地库完成 v16 -> v18 迁移，迁移前备份保留 231 个岗位和 231 个 application；迁移后默认队列回填 231 个有效成员，岗位和 application 数量不变。
- Native Host 已使用 `@yao-pkg/pkg@6.21.0` 构建并注册到当前用户 Chrome/Edge；只开放 `STATUS`、`START_BACKEND`，实际后端由 popup 成功启动并通过健康检查。
- 后端模型配置探针使用 `gpt-5.4-mini` Chat 协议单次成功；API 只返回 `hasApiKey`，未返回原始 Key。
- `m17:application-queues:smoke`、`m17:model-config:smoke`、`m17:native-host:smoke`、`m17:popup-runtime:smoke`、`m17:options-queues-runtime:smoke` 均通过。
- options UI 已覆盖四阶段切换、队列新建/归档、跨队列隔离、批量移除、风险信任重筛、人工状态、模型设置、画像简历上传，以及桌面/390px 无溢出和控制台错误为 0。
