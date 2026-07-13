# JoB_Find 开源复用调研

## 1. 调研原则

根据项目规则，编码前需要先搜索可复用方案，避免重复造轮子。本轮调研覆盖 GitHub 和 npm，关键词包括：

- BOSS 直聘 自动投递
- BOSS 直聘 打招呼
- BOSS 直聘 爬虫
- boss zhipin auto apply
- zhipin selenium
- boss jobseeker

结论：GitHub 上有若干相关项目，npm 没有发现成熟、直接适配 BOSS 闭环的包。JoB_Find 应复用成熟通用库，参考相关项目思路，但不直接复制许可证不兼容项目代码。

当前最新路线已经调整为：先做 M1 BrowserExecutor 技术选型 POC，再决定 M2 SQLite 和后续 Agent 层。下面早期关于 Tampermonkey/FastAPI 的 MVP 建议仅保留为历史调研背景；当前可运行原型是 Chrome MV3 Extension + Node 本地后端，M1 首选验证 Firecrawl，LocalPlaywright 作为复杂动作兜底。

## 2. 候选项目

### 2.1 impengpong/jitou

链接：[https://github.com/impengpong/jitou](https://github.com/impengpong/jitou)

定位：AI 自动投递相关产品/工具。

可借鉴点：

- 产品流程。
- 自动投递体验。
- 用户授权和岗位队列设计。

不建议直接采用原因：

- 仓库版本和当前产品状态可能不一致。
- 更适合作为产品体验参考，不适合作为代码底座。

集成方式：

- 仅参考流程，不复制代码。

### 2.2 czc6666/czc-good-job

链接：[https://github.com/czc6666/czc-good-job](https://github.com/czc6666/czc-good-job)

定位：BOSS 求职自动化相关脚本/后端项目。

可借鉴点：

- Tampermonkey + 本地后端的 MVP 形态。
- 单用户本地化流程。
- 岗位筛选和投递辅助的边界。

适配度：

- 与 JoB_Find 的 MVP 路线高度接近。

风险：

- 需要检查许可证。
- 即使许可证兼容，也建议只参考架构和交互，不直接复制业务代码。

集成方式：

- 参考浏览器脚本和后端分工。
- 自行实现 JoB_Find 的 Agent、Schema、日志和审批流程。

### 2.3 aliu-ronin/boss-jobseeker

链接：[https://github.com/aliu-ronin/boss-jobseeker](https://github.com/aliu-ronin/boss-jobseeker)

定位：BOSS 求职 Chrome Extension。

可借鉴点：

- Chrome Extension 形态。
- AI 评分、自动投递、调试模式等产品功能。
- 纯浏览器侧交互设计。

风险：

- 仓库许可证需要确认。若为 GPL-3.0，则不应复制代码进入 MIT 项目。
- 浏览器端保存敏感配置的方式需要谨慎评估。

集成方式：

- 参考 Extension 用户体验和调试功能。
- JoB_Find MVP 先用 Tampermonkey，稳定后再迁移 Chrome Extension。

### 2.4 xiarongwen/boss-auto-job

链接：[https://github.com/xiarongwen/boss-auto-job](https://github.com/xiarongwen/boss-auto-job)

定位：Python 自动化求职项目。

可借鉴点：

- Python 后端自动化组织方式。
- 搜索、匹配、简历优化、发送等模块划分。

风险：

- 若项目强调绕过检测或规避平台风控，不符合 JoB_Find 的边界。
- 不能复用任何绕过验证码、绕过登录或规避风控的实现。

集成方式：

- 仅参考模块划分。
- 不引入风控规避逻辑。

### 2.5 liuyoujia123/boss-agent

链接：[https://github.com/liuyoujia123/boss-agent](https://github.com/liuyoujia123/boss-agent)

定位：Playwright + Agent 的 BOSS 自动化原型。

可借鉴点：

- Agent 参与岗位匹配和投递流程。
- SQLite 记录。
- Playwright 自动化思路。

风险：

- 项目成熟度需要进一步评估。
- 如果直接使用 Playwright 登录态自动化，维护成本可能高于 Tampermonkey MVP。

集成方式：

- 参考状态记录和 Agent 拆分思路。
- MVP 仍优先使用浏览器脚本读取当前用户页面。

### 2.6 jhcoco/bosszp

链接：[https://github.com/jhcoco/bosszp](https://github.com/jhcoco/bosszp)

定位：BOSS 直聘岗位爬虫和数据分析。

可借鉴点：

- 岗位字段建模。
- 数据分析和职位统计。

不适合作为主底座原因：

- 重点是数据采集和分析，不是简历定制与投递。
- 页面和反爬逻辑可能已过时。

集成方式：

- 参考岗位字段，不复制爬虫实现。

## 3. 通用库复用建议

### 3.0 BrowserExecutor

- Firecrawl：M1 首选验证，重点是 profile、interact、岗位详情采集、打招呼 dry-run、投递入口检测。
- @mendable/firecrawl-js：官方 Node SDK，许可证 MIT。POC 阶段暂用 REST 直连，稳定后可换 SDK。
- Playwright：文件上传、复杂本地浏览器控制、Firecrawl 不适合时的兜底。当前 npm `playwright` 版本 1.61.1，许可证 Apache-2.0，已作为 devDependency 引入。
- Chrome Extension Manifest V3：当前已实现原型，继续作为 fallback 和页面状态读取工具。
- 不采用 patchright/undetected 类方案，因为其定位是规避检测，不符合本项目停止线。

### 3.1 后端

当前仓库后端是 Node.js 标准库 HTTP 服务，不切换到 Python/FastAPI。M2 SQLite 选型如下：

- `node:sqlite`：当前采用。Node.js v24.12.0 本机已验证 `DatabaseSync` 可用；无额外 npm 依赖，无 native 安装步骤，适合当前单用户本地原型。
- `better-sqlite3`：成熟、MIT、同步 API 简洁，是后续发布版的首选替换候选；本阶段未采用，主要因为它仍是 native addon，Windows 环境可能遇到预编译/编译链问题。
- `sqlite3`：BSD-3-Clause，异步 callback 风格，依赖 native bindings；本阶段不采用。

集成方式：直接使用 `node:sqlite` 封装在 `server/src/sqlite-store.js`，不复制第三方代码。当前 Node 仍会输出 ExperimentalWarning；若后续要面向更广泛环境发布，再切换为 `better-sqlite3` 或做双实现兼容层。

M4 browser_tasks 队列复用检查：

- BullMQ / Bull：成熟、MIT、社区验证强，但依赖 Redis，当前单用户本地原型引入成本高。
- better-queue / Bottleneck：可做本地任务调度或限流，但更偏 Node 后台 worker；本项目的 BOSS 页面动作必须由用户已登录的 Chrome Extension 执行，不能让后端 worker 直接执行。
- XState：成熟、MIT，适合复杂状态机；当前 application/browser task 转移仍是小型显式状态表，直接引入会增加迁移成本。后续当 Agent、浏览器任务、审批流并发交织后再评估。

当前选择：不引入外部队列库，先用 SQLite `browser_tasks` 表持久化任务意图、状态、结果和错误。集成方式是后端 API 入队/查询/回写，Chrome Extension 后续领取执行；不复制第三方队列代码。

M4 Chrome Extension 任务领取复用检查：

- `webextension-polyfill`：成熟、轻量，但许可证是 MPL-2.0；当前扩展已经直接使用 Chrome MV3 promise API，收益不足以抵消新增依赖和许可证评估成本。
- `@webext-pegasus/rpc`：适合复杂扩展模块间 RPC，但当前只有 popup -> background -> content 三段消息，原生 `chrome.runtime.sendMessage` 和 `chrome.tabs.sendMessage` 足够。
- Workbox Background Sync 类方案：适合离线请求重放，不适合让用户已登录的 BOSS 页面执行点击和采集动作。
- npm `qified` / `yocto-queue` / `grouped-queue` / `seq-queue`：能提供通用队列或顺序执行结构，但不能解决“只处理当前 BOSS 页面已加载岗位、点击后采集详情、再回写后端”的页面上下文约束。
- GitHub `chrome extension task queue content script` 精确搜索未找到可直接复用且维护明确的项目；当前功能更像业务编排，不是通用扩展框架问题。

当前选择：继续用原生 MV3 message passing。后端通过 `POST /api/browser-tasks/claim` 原子领取任务；扩展 popup 提供人工触发入口和“生成并处理当前页队列”组合入口，content script 先只执行 `CAPTURE_DETAIL`，真实打招呼、上传和投递动作暂不自动化。

M4.5 浏览器任务诊断和失败分类复用检查：

- npm `seq-queue` / `grouped-queue` / `asap` / `queue-microtask` / `setimmediate`：只能提供顺序执行、任务调度或事件循环能力，不负责 BOSS 页面状态判断、失败原因归类、任务回写和 `browser_events` 复盘。
- GitHub `chrome extension task retry diagnostics content script` 精确搜索未找到可直接复用且维护明确的项目。

当前选择：不引入外部 retry/diagnostics 框架。诊断能力直接贴在现有 `browser_tasks`、`browser_events`、Chrome MV3 message passing 和 content-script 执行结果上，失败码先收敛为 `LOGIN_REQUIRED`、`SECURITY_CHECK`、`SELECTOR_CHANGED`、`JOB_NOT_VISIBLE`、`DETAIL_EMPTY`、`TASK_PAGE_MISMATCH`、`BROWSER_TASK_FAILED`。

M4.5 popup/options UI 收敛复用检查：

- `webextension-polyfill`：仍然可以简化 Promise 风格 API，但当前项目已稳定使用原生 MV3 message passing，引入后不会减少主界面复杂度。
- GitHub `chrome extension popup options settings ui` 搜索到的多为新项目模板或带构建链路的 boilerplate，迁移成本高，且不能复用当前 BOSS 任务状态和后端诊断接口。
- npm Kendo/Material popup 类库偏通用 UI 组件，和当前无构建、原生 HTML/CSS/JS 扩展结构不匹配。

当前选择：继续使用原生 HTML/CSS/JS。popup 只保留开始、暂停、重试和简要状态；设置详细页承载后端配置、任务诊断、采集质量、异常事件、待补 JD 和最近采集预览。

M4.6 队列治理与登录恢复复用检查：

- GitHub `node sqlite task queue retry cancel jobs`、npm `sqlite job queue retry cancel Node.js`、GitHub `Chrome extension content script task queue retry`：未找到能直接复用且同时满足“SQLite 持久化、按当前 BOSS 页面过滤、由用户已登录扩展执行、保留 application/browser_events 审计链”的成熟项目。
- BullMQ / Bull / Bee-Queue：社区成熟，但依赖 Redis 和后端 worker。当前任务不能由后端直接执行 BOSS 页面动作，因此不采用。
- Bottleneck / p-queue：适合节流和内存队列，不能覆盖本项目需要的本地持久化、状态审计、按 `sourceUrl` 恢复/取消和浏览器页面上下文过滤。
- XState：仍作为后续复杂工作流候选；M4.6 只是 `browser_tasks` 的显式状态治理，引入完整状态机库会增加迁移成本。

当前选择：沿用 SQLite `browser_tasks`，复用通用队列系统的模式而不是引入依赖：显式 scope、显式 cancel、显式 requeue、失败原因聚合和只读诊断。集成方式是新增 `POST /api/browser-tasks/cancel`、`POST /api/browser-tasks/requeue`，并让 `GET /api/browser-tasks` 与 `GET /api/browser-tasks/diagnostics` 支持 `sourceUrl/pageUrl` 过滤；Chrome Extension popup 的“重试”先恢复当前页失败/取消任务，再决定是否重新扫描当前页。

M5.1 用户画像与事实库复用检查：

- GitHub / npm `resume parser Node.js docx pdf` 搜索到的完整简历解析项目多偏旧、字段不可控，或包含外部社交页面抽取，不适合作为本地事实库的第一层可信底座。
- `mammoth`：成熟 DOCX 文本提取候选，适合 M5.2 解析 `.docx`，当前 M5.1 不引入，避免在事实库 schema 未稳定前耦合文件解析。
- `pdf-parse`：常用 PDF 文本提取候选，适合 M5.2 解析 `.pdf`，但 PDF 简历版式差异大，解析结果需要人工确认后才能进入事实库。
- `officeparser`：可覆盖多种 Office/PDF 文档，适合作为后续统一文本提取候选；当前不引入，避免一次性扩大依赖面。

当前选择：M5.1 先自研最小事实库数据模型和 JSON/纯文本导入 API，不引入文件解析库。集成方式是将 `candidate_profiles`、`resume_sources`、`profile_experiences`、`profile_skills`、`profile_constraints` 落到 SQLite；后续 M5.2 再选择 `mammoth`/`pdf-parse`/`officeparser` 中的一个或组合做文件文本提取，并要求用户确认后再写入真实经历库。

M5.2 简历文件文本抽取复用检查：

- npm/GitHub 已复核 `mammoth`、`pdf-parse`、`unpdf`、`officeparser`、`office-text-extractor` 和完整 resume-parser 类项目。
- `mammoth@1.12.0`：BSD-2-Clause，GitHub `mwilliamson/mammoth.js`，2026-03 仍更新。选择用于 `.docx` 原始文本抽取，社区验证充分，API 明确，只负责抽文本，不替系统猜简历事实。
- `unpdf@1.6.2`：MIT，GitHub `unjs/unpdf`，2026-04 仍更新。选择用于 `.pdf` 文本抽取，基于 PDF.js 的现代封装，文本抽取不需要 `@napi-rs/canvas`，比 `pdf-parse@2` 更适合 Windows 本地原型分发。
- `pdf-parse@2.4.5`：Apache-2.0，功能成熟，但依赖 `pdfjs-dist` 与 `@napi-rs/canvas`，会扩大安装面；暂作为备选，不引入。
- `officeparser@7.2.3`：MIT，覆盖 DOCX/PDF/PPTX/XLSX/RTF 等多格式，能力更大，但会一次性扩大解析边界；当前只需要简历文本抽取，所以暂不引入。
- `office-text-extractor@4.0.0`：ISC，内部仍依赖 `mammoth`、`pdf-parse`、`xlsx` 等，抽象层收益不足，且引入依赖更多；不采用。
- 完整 resume-parser 项目：仍不采用。原因是字段抽取规则不可控，可能把不确定解析结果直接变成“事实”，不符合本项目事实库和简历改写边界。

当前选择：直接依赖 `mammoth` + `unpdf`，集成在 `server/src/resume-extractor.js`；API 通过 `POST /api/profile/resume-sources/extract` 接收 base64 文件内容，抽取后写入现有 `resume_sources`。不复制第三方代码，不做自动经历结构化，后续 ProfileAgent 再基于原文追问和确认。

M5.3 Profile fact draft 复用检查：

- npm `resume parser skills extractor javascript`、`resume section parser node` 搜索结果没有找到能直接满足“只生成待确认草稿、不把解析结果当事实”的成熟库。多数结果是通用 parser、文档抽取、HTML/CSV/AST 工具，和本项目的事实边界不匹配。
- GitHub `resume parser skills extraction javascript`、`resume section parser node`、`profile fact extraction resume agent` 搜索没有找到维护状态、许可证和业务边界都适合直接引入的项目。
- 完整 resume-parser 仍不采用：它们倾向于直接输出结构化字段，容易把不确定文本变成事实，和“用户确认后才进入经历库”的边界冲突。

当前选择：自研最小 `profile_fact_drafts` 草稿层和 `server/src/profile-draft-generator.js` 启发式生成器。集成方式是从 `resume_sources.raw_text` 生成 `PENDING` 草稿，再通过 confirm/reject API 进入正式 `profile_experiences` / `profile_skills` 或保留为追问项。后续 LLM ProfileAgent 应复用这层状态机，而不是绕过它直接写事实库。

M6.3 JD 风险门禁复用检查：

- npm 搜索 `job description classifier risk`、`resume job matching` 等关键词，结果主要是通用队列、glob matcher、评估库或无关分类器，没有找到适配“中文 JD + 用户排斥方向 + 本地可解释跳过”的成熟包。
- GitHub 搜索 `job description classifier resume matching risk screening Node.js`、`job matching resume screening agent job description scoring`、`Chinese job description classifier recruitment risk keywords`，结果多是简历/JD 匹配 demo 或通用招聘分析项目，没有可直接复用到当前 SQLite、`profile_constraints` 和 `ScreeningAgent` 状态机的实现。

当前选择：不新增依赖，新增本地 `server/src/job-risk-gate.js`。集成方式是复用 `profile_constraints`，新增 `excluded_direction` 规则类型；`ScreeningAgent` 在规则评分和 LLM 评分前先执行 `JobRiskGate`。命中高风险时直接写 `provider = risk_gate` 的 screening 并推进到 `SKIPPED`，同时把命中方向、关键词和 JD 片段保存在 `screenings.metadata.riskGate`。

### 3.2 LLM

- LangGraph.js：MIT，适合复杂多 Agent 状态机和 ResumeAgent/AuditAgent 循环；M6.1 只是单节点 ScreeningAgent，当前不引入，避免把业务状态机和编排框架过早耦合。后续 M7 出现“生成 -> 审核 -> 退回修改 -> 人工介入”循环后再评估。
- OpenAI Agents JS SDK：MIT，适合多 Agent workflow；当前 M6.1 只需要一个可回放的筛选步骤，直接引入会增加依赖和抽象面，暂不采用。
- Zod：MIT，适合 TypeScript schema 校验；当前仓库是无构建 Node.js/CommonJS 原型，M6.1 先用本地 normalize/validate 函数约束输出。后续如果迁移 TypeScript 或复杂 JSON Schema 增多，再引入。
- OpenAI-compatible HTTP：当前选择。新增 `server/src/model-client.js`，从环境变量或 `gpt5.5.txt` 读取 `base_url`、`model`、`wire_api` 和 `OPENAI_API_KEY`，默认走 Responses API，也保留 Chat Completions 兼容路径。
- ScreeningAgent：当前选择。新增 `server/src/screening-agent.js`，先用规则评分保证本地可运行；`mode:auto` 可在模型不可用时降级规则评分，`mode:llm` 则失败留痕并进入人工复核。

集成方式：不复制第三方 Agent 框架代码，不新增 LangGraph/OpenAI Agents/Zod 依赖。先把 `agent_runs`、`screenings`、`POST /api/applications/:id/screen` 和 smoke test 跑通；编排框架等 M7 多 Agent 循环真实出现后再引入。

M8.1 打招呼草稿复用检查：

- GitHub `job application message generator javascript` 搜索没有找到维护状态、许可证和业务形态都适合直接引入的项目。
- npm `message template job application` 搜索结果主要是通用 message/template、UI 或无关构建包，不适合 BOSS 打招呼业务。
- `@sendbird/uikit-message-template` 等消息模板库面向聊天 UI 模板渲染，不解决岗位、简历版本、审核状态和 BrowserExecutor dry-run 边界。
- `bottleneck` 这类限流库可作为后续频率控制候选；M8.1 只生成单条 dry-run 任务，暂不引入。

当前选择：不引入外部消息模板或自动化库。新增规则版 `MessageAgent`，复用已有 `agent_runs`、`browser_tasks`、application 状态机，并新增最小 `conversations/messages` 表。集成方式是 `POST /api/applications/:id/prepare-greeting` 生成草稿和 `SEND_GREETING` dry-run 任务；真实发送、频率限制和沟通状态刷新留到后续 POC。

M8.2 `SEND_GREETING` 页面侧 dry-run 复用检查：

- GitHub `chrome extension form filler content script textarea dispatchEvent`、`webextension form filler content script` 搜索未找到维护明确且可直接复用到 BOSS 发送前确认流程的项目。
- npm `webextension form filler` 主要返回 `webextension-polyfill`、测试 mock、表单 UI/React 组件和通用 DOM 工具；它们不解决 BOSS 页面岗位匹配、聊天入口定位、安全验证诊断和“只填入不发送”的业务边界。
- `webextension-polyfill` 仍只是浏览器 API 兼容层；当前 MV3 promise API 已可用，引入后不能降低 BOSS DOM 自动化风险。
- React Hook Form、textarea/autosize、Kendo/Ant Design 类组件只适合自有 UI，不适合注入第三方页面。

当前选择：不引入外部表单填充库。M8.2 在 content script 内实现最小 dry-run：按 `SEND_GREETING` 任务校验岗位，检测登录/安全验证，寻找安全聊天入口和输入框，填入文本并高亮输入框/发送按钮，但不点击发送。集成方式是 options 页领取 `SEND_GREETING` 任务并通过 `RUN_BROWSER_TASK` 发给当前 BOSS 标签页，结果通过 `POST /api/browser-tasks/:id/transition` 回写。

M8.3 `REFRESH_CONVERSATION` / `CHECK_RESUME_UNLOCK` 只读状态刷新复用检查：

- npm 搜索：`webextension scrape chat messages dom button state`，结果主要是 DOM 测试、聊天 SDK 或通用组件包，不适合在第三方 BOSS 页面稳定判断会话状态和简历入口。
- GitHub 搜索：`chrome extension content script chat messages scrape button state in:name,description`、`webextension content script button state scraper in:name,description`，未找到可直接复用且维护活跃的 BOSS/Zhipin 会话状态读取项目。
- Firecrawl 仍不作为 BOSS 主执行器；它适合 scrape-only 辅助，不适合读取用户当前 Chrome 登录态中的聊天入口和按钮解锁状态。

当前选择：不引入新依赖。M8.3 继续沿用 Chrome MV3 content script 的原生 DOM 只读探测，新增 `REFRESH_CONVERSATION` 和 `CHECK_RESUME_UNLOCK` 两类 browser task，由 options 页排队/领取/执行并通过后端任务状态回写。该实现只读取页面、置信度打分和错误诊断，不点击发送、不上传、不投递。

M8.4 会话消息归档复用检查：

- npm 搜索：`webextension conversation scraper messages content-script`，结果主要是 `webextension-polyfill`、扩展通信库、通用 scraper 或第三方聊天 SDK，不解决 BOSS 页面消息 DOM 抽取、方向判断和本地去重入库。
- GitHub 搜索：`webextension conversation messages scraper content script`、`chrome extension chat messages scraper content script DOM`，未找到能直接复用到 BOSS/Zhipin 当前页会话消息归档的成熟项目。

当前选择：不引入新依赖。复用 M8.3 已有 content script 抽取出的 `conversation.recentMessages/messages`，在后端 `transitionBrowserTask` 成功回写时归档为 `messages` 表的 `boss_chat/CAPTURED` 记录，并用方向、文本和页面时间戳去重。

M8.5 沟通状态判定复用检查：

- GitHub 搜索：`conversation status classifier message intent rules JavaScript chat messages resume request`、`chat message intent classifier JavaScript rules conversation status`，结果偏通用意图分类/LLM 零样本框架，迁移到本地招聘会话小状态机的成本高。
- npm 搜索：`message intent classifier chat conversation rules JavaScript`，结果偏通用 NLP、聊天 SDK 或扩展工具，不提供 BOSS 求职上下文里的“对方已回复/要求简历/等待回复”确定性状态。

当前选择：不引入新依赖。M8.5 在后端使用本地规则判定 `communicationAssessment`，优先覆盖稳定、可解释的状态：`RESUME_REQUESTED`、`RECRUITER_REPLIED`、`WAITING_FOR_REPLY`、`CHAT_OPENED_NO_MESSAGES`。后续如要扩展到 LLM 语义分类，应保持为后端 Agent 能力，不放入浏览器插件。

M8.6 下一步建议复用检查：

- GitHub 搜索：`conversation next action recommendation workflow rules JavaScript chat messages`、`chat workflow next step recommendation rules JavaScript`，结果偏通用规则引擎或客服 bot workflow，没有直接适配当前 application 状态机和 BOSS 只读边界。
- npm 搜索：`workflow recommendation rules engine JavaScript message intent`，可见 `json-rules-engine`、`rule-engine-js` 等通用规则引擎，但 M8.6 只有少量确定性映射，引入依赖会增加配置和迁移成本。

当前选择：不引入新依赖。M8.6 用后端本地函数把 `communicationAssessment` 映射为 `nextActionRecommendation`，显式写出 `allowedTaskTypes` 和 `blockedTaskTypes`，确保建议不会被误执行为真实上传或投递。

M9.1 `UPLOAD_RESUME` dry-run 复用检查：

- GitHub 搜索：`Chrome extension file upload dry run content script input type file detection`、`webextension content script file upload input detection dry run`，未找到适合直接集成到 BOSS 当前页、且只做上传入口诊断不执行文件选择的项目。
- npm 搜索：`webextension file upload input detector content-script`，结果包含 `cypress-file-upload`、`tus-js-client`、`@zag-js/file-upload` 等测试/上传/组件库，不适合第三方页面只读 dry-run 诊断。

当前选择：不引入新依赖。M9.1 继续复用 Chrome MV3 content script，原生读取 `input[type=file]`、上传候选按钮和页面诊断；结果只写 browser task、application event 和 conversation metadata，不选择文件、不上传、不投递。

M9.2 `SUBMIT_APPLICATION` dry-run 复用检查：

- GitHub 搜索：`webextension content script submit button detector dry run`、`Chrome extension content script detect submit button form submit GitHub`、`"chrome extension" "submit button" "content script"`、`"webextension" "form submit" "content script"`，结果为空或偏向通用扩展/表单自动提交项目，不能直接用于 BOSS 当前页投递入口的只读诊断。
- npm 搜索：`webextension form submit detector dry-run content-script`，结果主要是 `webextension-polyfill`、`form-data`、设备/resize/barcode detector、表单提交库等，不满足“只诊断、不点击、不确认、不提交”的页面内 dry-run 边界。

当前选择：不引入新依赖。M9.2 继续复用 Chrome MV3 content script、已有 browser task 队列和后端 application event 机制，原生读取投递/确认候选、锁定信号和确认弹窗线索；结果只写 browser task、`SUBMIT_APPLICATION_DRY_RUN` event 和 `conversations.metadata.lastSubmitDryRun`，不点击投递、不确认、不提交。

M9.3 `submissionReadiness` 投递准备度 gate 复用检查：

- GitHub 搜索：`submission readiness checklist state machine JavaScript`、`workflow readiness assessment application status JavaScript`、`dry run readiness gate state machine browser task`，未找到适合直接复用本项目 dry-run 证据、application event 和 BOSS 边界的成熟项目。
- npm 搜索：`javascript state machine readiness workflow gate`，结果包含 `javascript-state-machine`、`xstate`、`@xstate/fsm`、`zustand` 等状态/工作流库。它们适合复杂状态编排，但 M9.3 只是把已有 `lastUploadDryRun`、`lastSubmitDryRun` 和只读会话证据映射成本地准备度结论，引入状态机库会增加迁移成本。

当前选择：不引入新依赖。M9.3 在后端新增确定性 `assessSubmissionReadiness` 函数，继续复用 conversation metadata、`nextActionRecommendation` 和 application event 机制；结论只用于人工复核和后续 POC，不触发真实上传或真实投递。

M9.4 投递准备复核队列复用检查：

- GitHub 搜索：`review queue workflow readiness JavaScript local queue`、`application review queue state machine JavaScript`、`approval queue workflow JavaScript local-first`，未找到能直接复用本项目 conversation metadata 和 dry-run 证据的轻量项目。
- npm 搜索：`approval review queue workflow javascript`，结果以 `p-queue`、`queue-microtask`、`tinyqueue`、`js-queue` 等通用队列/任务调度库为主。这些库解决异步执行排队，不解决“从本地 evidence 派生复核列表、保持无真实 BOSS 动作”的业务队列。

当前选择：不引入新依赖。M9.4 用 SQLite store 派生查询实现 `getSubmissionReadinessQueue`，复用 `conversations.metadata.submissionReadiness`、`lastUploadDryRun`、`lastSubmitDryRun` 和 extension options 动态 UI；队列只展示复核项，不执行真实动作。

M9.5 投递准备本地复核决策复用检查：

- GitHub 搜索：`local approval workflow review decision JavaScript metadata event audit`、`approval decision queue local-first JavaScript review workflow`、`review decision audit event workflow JavaScript`，结果偏向通用审批系统、CI/CD 网关或治理运行时，不能直接复用当前 local-first metadata/event 模型。
- npm 搜索：`approval workflow review decision audit event javascript`，结果包含 `@stacksona/sdk`、`n8n-nodes-stacksona`、`patchwork-os` 等外部审批/治理工具，集成会引入外部策略面和运行时，不符合当前只写本地 SQLite 审计的边界。

当前选择：不引入新依赖。M9.5 复用 `conversations.metadata` 和 `application_events`，新增 `reviewSubmissionReadiness` 本地方法和扩展页按钮；复核决策只用于审计和后续 POC，不触发真实 BOSS 动作。

### 3.3 文档生成

- python-docx：基础 DOCX 操作。
- docxtpl：模板填充。
- LibreOffice headless：DOCX 到 PDF。
- pypdf：PDF 页数检查。

### 3.4 浏览器

- Tampermonkey：MVP。
- Chrome Extension Manifest V3：稳定版。
- Playwright：测试或可选自动化，不作为 MVP 首选。

### 3.5 导出

- csv：标准库导出。
- openpyxl：Excel 友好导出。

## 4. 选择建议

### 4.1 MVP 选择

历史建议曾考虑采用：

```text
Tampermonkey + FastAPI + SQLite + OpenAI-compatible LLM + DOCX/PDF Renderer
```

原因：

当前不再把它作为立即实施路线，原因是仓库已经有 Chrome MV3 + Node 原型，且用户现在明确要求先跑通 Firecrawl/BrowserExecutor 技术选型。后续若 Chrome MV3 维护成本过高，Tampermonkey 仍可作为轻量 fallback 思路。

### 4.2 暂不采用

暂不采用完整 Playwright 全自动控制作为主路线。

原因：

- 登录态、验证码、风控和页面变化维护成本高。
- 对开源用户的环境要求更高。
- 容易偏离合规边界。

暂不采用纯浏览器端 LLM 调用。

原因：

- API Key 暴露风险更高。
- 简历文件和投递记录管理不如本地后端稳。

## 5. 许可证策略

- 项目主许可证：MIT。
- 可以直接依赖 MIT、Apache-2.0、BSD 等兼容许可证库。
- GPL 项目只能参考思路，不能复制代码进入主仓库。
- 如果未来要集成 GPL 代码，必须在文档和许可证上重新评估，不建议第一版这样做。

## 6. 后续调研任务

正式编码前建议补充：

1. 检查每个候选 GitHub 项目的许可证。
2. 检查候选项目最近更新时间和 issue 活跃度。
3. 拉取最接近 MVP 的项目，在隔离目录阅读，不复制代码。
4. 明确哪些功能复用通用库，哪些业务逻辑自研。
5. 将复用决策写入 `docs/adr/`。

## M10.1 WorkflowOrchestrator 复用检查

M10.1 编码前重新检查了 Agent/Workflow 编排候选：

- `@langchain/langgraph@1.4.7`：MIT，GitHub `langchain-ai/langgraphjs`，适合多 Agent 图、循环、人工闸门和可恢复执行。当前不引入，原因是 M10.1 只需要确定性计划和审计记录，还没有稳定到需要图运行时的循环。
- `xstate@5.32.4`：MIT，GitHub `statelyai/xstate`，适合复杂状态机和状态图可视化。当前不引入，原因是仓库已有 application/browser task 显式状态机，M10.1 是证据读取与下一步建议，不需要替换状态运行时。
- `javascript-state-machine@3.1.0`：MIT，GitHub `jakesgordon/javascript-state-machine`，轻量有限状态机。当前不引入，原因是它只能表达状态转移，不能直接解决 Agent 证据编排、BOSS dry-run 证据和人工 gate。
- `@openai/agents@0.13.0`：MIT，GitHub `openai/openai-agents-js`，适合多 Agent workflow。当前不引入，原因是项目已经有后端模型配置与 `agent_runs` 记录，M10.1 先保持本地 deterministic planner，避免让 runtime 抽象先于业务图稳定。

当前选择：自研最小 `server/src/workflow-orchestrator.js`。集成方式是直接读取现有 SQLite snapshot，输出 `workflow-plan`，可选写入 `agent_runs`。不新增依赖，不复制第三方代码。

后续触发 LangGraph.js 的条件：
- ResumeAgent -> AuditAgent -> revise -> re-audit -> human gate 成为常规循环。
- JDRequirementExtractor、ResumeFitEvaluator、ClaimVerifier、SubmissionPolicyGate 需要可恢复、多轮、分支执行。
- 需要把每次循环节点的输入输出作为稳定 trace 展示给用户。

## M10.2a Career context skill 复用检查

M10.2a 编码前检查了简历解析、职业上下文和 job-application agent 方向的复用候选：

- npm `resume-parser@1.1.0`：ISC，定位是把 Resume/CV 解析为 JSON，但最近版本非常旧，字段和事实边界不可控；它倾向直接生成结构化结果，不能表达本项目需要的 `PENDING` 草稿、用户确认、禁止声称和后续 Agent 使用规则，因此不采用。
- npm `@santifer/career-ops@1.17.0`：MIT，定位是完整 AI job search pipeline，社区和更新状态比零散 demo 好，但它是完整工作流安装器，迁移成本高，会和本仓库已有 Chrome Extension、SQLite、application 状态机、`agent_runs` 和 BOSS dry-run 边界重叠；当前只参考“职业求职流水线需要前置上下文”的思路，不直接集成。
- JSON Resume / jsonresume theme 生态：适合标准简历 schema 和渲染，但它解决的是“简历数据如何展示”，不是“如何从用户经历中建立待确认事实源、真实性边界和 JD 改写规则”，因此暂不引入。
- GitHub `agentic-job-application`、`job-application-copilot-Multi-Agent-Resume-Tailor`、`Resume-Tailoring-Agent-for-Job-Applications`、`groq-job-application-agent`、`job-application-agent` 等搜索结果：多为 2025-2026 年新项目，星标少、许可证不完整或偏端到端 demo；它们可以参考模块命名，但不适合复制进当前本地优先、BOSS 页面动作受限、事实确认优先的项目。

当前选择：不新增 npm 依赖，不复制外部项目代码。把用户提供的 `career-retrospective-to-job` 草案收敛为项目内 skill，落在 `.agents/skills/career-retrospective-to-job/`。集成方式是让它成为 ProfileAgent 上游规则：先产出 `career_agent_context.md`，再生成 `PENDING profile_fact_drafts` 和 missing questions，经用户确认后才写入正式 `profile_experiences` / `profile_skills` / `profile_constraints`。

验证方式：`npm run m10:career-skill:smoke` 检查 skill 文件、引用文件和文档契约；`npm run check` 纳入该烟测脚本的语法检查。
## M10.2b Observability hooks reuse check

M10.2b coding started with reuse checks for workflow progress hooks, persistent event logs, and error queues:

- npm `emittery@2.0.0`: MIT, modern async event emitter. Rejected for direct integration because it is in-memory pub/sub; it does not provide a durable local audit trail, timeline API, or user-resolvable error queue.
- npm `hookified@3.0.1`: MIT, event/middleware hook system. Rejected for direct integration because the current need is persisted progress and correction records, not extensible runtime middleware.
- npm `p-event@7.1.0`: MIT, useful for waiting on emitted events in tests or async flows. Rejected because it does not solve persistent workflow inspection.
- npm `@hapi/podium@5.0.2`, `component-emitter`, and similar emitters: useful generic notification primitives, but add no value over Node built-ins for the current backend.
- npm `@sap/audit-logging`: audit logging package, but geared toward SAP platform integration and licensing/runtime assumptions that do not match the local-first SQLite backend.
- GitHub searches for `workflow events sqlite node`, `audit trail sqlite node workflow`, and `error queue sqlite node` did not find a mature lightweight project matching this repo's combination of Node stdlib HTTP server, SQLite `node:sqlite`, BOSS browser-task evidence, and local correction workflow.

Selected approach: do not add a dependency. Reuse the existing SQLite evidence model and add `workflow_events` as a thin durable hook table. Integration is direct backend store methods plus read APIs:

- `recordWorkflowEvent`
- `getApplicationTimeline`
- `getWorkflowErrors`
- `resolveWorkflowError`

This keeps progress and errors queryable after process restart, preserves the local-first boundary, and avoids introducing a runtime event framework before LangGraph/XState is justified by actual multi-agent loops.

## M10.2c Extension observability UI reuse check

M10.2c coding started with reuse checks for a Chrome Extension / vanilla JavaScript workflow log and timeline viewer:

- npm `vis-timeline@8.5.1`: mature and maintained timeline visualization. Rejected because the settings page only needs compact recent events, open errors, and a single application timeline list; adding a canvas/DOM timeline library would increase MV3 bundle and styling cost without improving correction workflow.
- npm `chrome-trace-event@1.0.4`: useful for emitting Chrome trace event files. Rejected because it generates trace data and does not provide an extension options UI or SQLite-backed correction queue.
- npm `@dev-plugins/vanilla-log-viewer@0.4.0`: vanilla JavaScript log viewer example. Rejected because it targets Expo/devtools plugin logs, not MV3 settings pages, workflow events, or manual error resolution.
- npm React timeline/collapsible packages such as `react-calendar-timeline` and `react-vertical-timeline-component`: rejected because the extension settings page is intentionally static HTML/CSS/JS and the repo does not use React in the extension.
- GitHub searches for `chrome extension log viewer timeline vanilla javascript`, `browser extension error log viewer javascript`, and `vanilla javascript workflow timeline log viewer` did not find a small maintained project that fits this repo's MV3 options page, backend-proxied APIs, and local correction boundary.

Selected approach: do not add a dependency. Reuse the existing MV3 options page, `renderList`, and background `backendJson` proxy. Integration is direct message handlers plus a `Workflow progress` card:

- `GET_WORKFLOW_EVENTS`
- `GET_WORKFLOW_ERRORS`
- `GET_APPLICATION_TIMELINE`
- `RESOLVE_WORKFLOW_ERROR`

This keeps the UI inspectable, avoids frontend framework migration, and preserves the rule that resolving an error does not implicitly retry work or execute BOSS actions.

## M10.3a Resume/JD fit evaluation reuse check

M10.3a coding started with reuse checks for resume/JD matching and ATS scoring:

- GitHub `srbhr/Resume-Matcher`: mature directionally relevant project for resume-vs-JD score, keyword highlighting, and suggestions. Rejected for direct integration because it is a larger Python/ATS application with its own parsing, UI, and scoring stack; migrating it would duplicate this repo's local SQLite application workflow, `resume_versions`, `agent_runs`, and BOSS dry-run boundaries.
- GitHub / topics searches for `resume job description matcher JavaScript`, `ATS resume job description matching JavaScript`, and `JD requirement extractor resume fit evaluator JavaScript` surfaced mostly small demos, hosted AI apps, Python notebooks, or full web products rather than a compact Node module that can plug into this backend's evidence model.
- npm `@getkrafter/resume-toolkit@1.6.0`: close in feature naming, with deterministic resume scoring and ATS keyword matching. Rejected for now because the current slice needs a narrow backend node tied to generated `resume_versions`, source mapping, workflow events, and local policy flags. Pulling in a broader toolkit would add another resume data model before this repo's own evaluation contract is stable.
- JSON Resume ecosystem packages such as `@jsonresume/types`, `resumed`, and `resume-toolkit` are useful for resume schema/rendering, but they do not solve JD coverage evaluation or this repo's application workflow gate.
- React/Puter.js AI resume analyzers and similar GitHub projects are UI/cloud-app oriented and conflict with the backend-owned secrets and local-first boundary.

Selected approach: do not add a dependency. Add a small deterministic `ResumeFitEvaluator` in `server/src/resume-fit-evaluator.js`, persist its result in `resume_fit_evaluations`, and expose read/run APIs:

- `POST /api/resume-versions/:id/evaluate-fit`
- `GET /api/resume-fit-evaluations`
- `GET /api/resume-fit-evaluations/:id`

This keeps M10.3a focused on one auditable contract: JD requirements, coverage items, blockers, recommendations, and policy flags. It can later be replaced or augmented by LLM/embedding scoring once the table and workflow gate are stable.

Follow-up reuse check for the Chrome Extension settings UI:

- GitHub/npm searches for `chrome extension resume matcher dashboard`, `resume jd matcher chrome extension UI`, and `resume job description matcher JavaScript` did not find a small maintained package that fits the existing MV3 options page and local backend proxy pattern.
- Existing resume matcher projects remain too large or cloud/UI oriented for this thin control surface.

Selected approach: do not add a dependency. Reuse `extension/src/options.html`, `extension/src/options.js`, `renderList`, and the background `backendJson` proxy. Integration is direct message handlers:

- `GET_RESUME_FIT_EVALUATIONS`
- `EVALUATE_RESUME_FIT`

The settings UI can inspect and run the backend evaluator, but it must not create browser tasks or execute any BOSS page action.

## M10.3b ClaimVerifier reuse check

M10.3b coding started with reuse checks for resume claim extraction and source-backed verification:

- GitHub searches for `resume claim verifier evidence mapping`, `resume claim extraction verification agent JavaScript`, and `resume claim fact check` surfaced general fact-checking, receipt/evidence tools, or full resume products rather than a compact local module that can plug into this repo's `resume_versions.sourceMapping`, confirmed profile facts, and SQLite workflow events.
- npm searches for `resume claim parser verifier evidence` did not find a maintained Node package for local resume claim verification with source mapping.
- General LLM fact-checking projects were rejected for now because they depend on web evidence or provider-specific pipelines, while this milestone must be deterministic, local-first, and auditable before adding model-based claim checks.

Selected approach: do not add a dependency. Add a small deterministic `ClaimVerifier` in `server/src/claim-verifier.js`, persist results in `resume_claim_verifications`, and expose read/run APIs:

- `POST /api/resume-versions/:id/verify-claims`
- `GET /api/resume-claim-verifications`
- `GET /api/resume-claim-verifications/:id`

Chrome Extension settings reuses the existing MV3 options page and background `backendJson` proxy through:

- `GET_RESUME_CLAIM_VERIFICATIONS`
- `VERIFY_RESUME_CLAIMS`

This keeps the truthfulness gate local and inspectable, while leaving future LLM or embedding-based verification as a replaceable scoring layer after the table/API contract stabilizes.

## M10.3c ResumeRevisionAgent reuse check

M10.3c coding started with reuse checks for resume/JD rewriting and agentic resume tailoring:

- GitHub [`ramansrivastava/resume-tailoring-agent`](https://github.com/ramansrivastava/resume-tailoring-agent) / CrewAI-style projects: useful as a multi-agent reference for research, writing, and critique roles. Rejected for direct integration because they are Python app workflows with their own agent runtime, prompt structure, and document model; migration would bypass this repo's `resume_versions`, `sourceMapping`, `agent_runs`, and local SQLite audit trail.
- GitHub [`SherLock707/TailorCV`](https://github.com/SherLock707/TailorCV): useful as an Ollama/Markdown resume-tailoring reference. Rejected because it targets a standalone local app flow and does not enforce this repo's confirmed-fact gate, claim verification records, or BOSS action boundary.
- GitHub [`nakshatra-garg/resume-tailor-agent`](https://github.com/nakshatra-garg/resume-tailor-agent) / LangChain + Streamlit variants: useful as UI/product references for JD-driven tailoring. Rejected because they are full apps, generally provider/UI coupled, and do not plug into the current Chrome Extension + Node backend + SQLite workflow.
- GitHub [`Yurui-Feng/Resume-Tailor-Agent-using-strands`](https://github.com/Yurui-Feng/Resume-Tailor-Agent-using-strands) and Chrome Extension oriented examples: useful for seeing browser-assisted resume tailoring UX. Rejected because this milestone must keep model/provider work in the backend and cannot place resume rewriting authority in the browser.
- GitHub [`unikill066/smart-agentic-ats-resume`](https://github.com/unikill066/smart-agentic-ats-resume) and similar ATS resume optimizers: useful for future scoring ideas, but rejected for direct integration because their data model and scoring assumptions do not preserve local `sourceMapping` or the no-fabrication revision policy.
- GitHub [`srbhr/resume-matcher`](https://github.com/srbhr/resume-matcher): more mature and relevant as a resume/JD tailoring harness, but still too broad for this slice because it brings its own application harness and scoring model. Keep it as a future reference once the local evidence and revision contract is stable.
- npm search for `resume tailor job description` and `resume rewrite job description` mostly returned generic resume schema, CLI, scheduler, or unrelated packages. `@jsonresume/types` and `resuml` are useful for schema/rendering, not evidence-bound revision from fit/claim checks.

Selected approach: do not add a dependency and do not copy external code. Add a deterministic `ResumeRevisionAgent` in `server/src/resume-revision-agent.js` that reuses the repo's existing artifacts:

- input: base `resume_versions`, latest `resume_fit_evaluations`, latest `resume_claim_verifications`, confirmed profile facts and skills
- output: a new `resume_versions` row through the existing versioning path
- trace: `agent_runs` plus `workflow_events`
- UI: existing MV3 options page plus background backend proxy

This keeps the revision loop evidence-bound and replaceable. Later, if LangGraph.js is introduced, `ResumeRevisionAgent` can become one graph node without changing the persisted version/audit contract.

## M10.4 LangGraph resume workflow reuse check

M10.4 coding started with reuse checks for local graph orchestration:

- `@langchain/langgraph@1.4.7`: MIT, official LangGraph.js package from GitHub `langchain-ai/langgraphjs`. Selected because it directly provides `StateGraph`, `Annotation`, `START`, and `END` for local in-process graph execution, and the current resume loop now has real branches and a revision cycle.
- `@langchain/langgraph-sdk@1.9.25`: MIT, official SDK for LangGraph API. Rejected for this slice because the project does not need a hosted LangGraph service or remote thread API.
- `@langchain/langgraph-checkpoint-sqlite@1.0.3`: MIT, official checkpoint package. Rejected for this slice because Boss Find already persists durable state in its own SQLite tables (`agent_runs`, `workflow_events`, `resume_versions`, `resume_fit_evaluations`, `resume_claim_verifications`, `resume_audits`). Adding a second checkpoint store would duplicate state before resume graph recovery is required.
- `@langchain/langgraph-ui` / `@langchain/react`: rejected because the current UI is a Chrome Extension settings page, not a LangGraph web console.

Selected approach:

- Add only `@langchain/langgraph`.
- Keep existing deterministic agents as graph nodes instead of rewriting them.
- Keep persistence in existing SQLite tables and `workflow_events`.
- Add `server/src/resume-workflow-graph.js` plus `POST /api/applications/:id/resume-workflow-graph`.
- Validate with `npm run m10:langgraph-resume:smoke` using local sample files.

Boundary:

- LangGraph orchestrates local resume output only.
- It does not own BOSS browser actions.
- It does not create `SEND_GREETING`, `UPLOAD_RESUME`, or `SUBMIT_APPLICATION` tasks.
- It does not bypass the existing local approval and dry-run gates.

## M11.1 Resume template registry reuse check

M11.1 coding started with reuse checks for DOCX resume template generation and template engines:

- Existing `docx@9.7.1`: MIT, GitHub `dolanmiu/docx`. Selected for this slice because the repo already uses it successfully for local DOCX rendering, it needs no new data model, and it keeps template behavior inside auditable JavaScript.
- `docxtemplater@3.69.0`: MIT, GitHub `open-xml-templating/docxtemplater`. Useful when filling real Word `.docx` templates with placeholders. Rejected for now because M11.1 needs a stable section contract and render metadata before adding a second template syntax and template-file lifecycle.
- `docx-templates@4.15.0`: MIT, GitHub `guigrpa/docx-templates`. Useful for report-style Word templates. Rejected for now for the same reason: the project does not yet need external template authoring, and adding it would make resume source mapping harder to inspect.
- `@mohtasham/md-to-docx`, `markdown-docx`, `remark-docx`, and HTML-to-DOCX packages are useful for Markdown/HTML conversion, but they do not directly solve the required resume section policy: education first, project evidence second, no standalone summary/skills section by default, and metadata recorded per render.

Selected approach:

- Do not add a dependency.
- Keep `docx` as the rendering library.
- Add `server/src/resume-template-registry.js` as the local template registry.
- Make `resume-to-word-campus-product-v1` the default template and bind it to `.agents/skills/resume-to-word/SKILL.md`.
- Keep `boss-find-fixed-docx-v1` as a legacy compatibility template.
- Expose the registry through `GET /api/resume-templates`; the extension loads select options from this endpoint and passes the chosen key as `renderOptions.templateName`.
- Validate with `npm run m11:resume-template:smoke`.

Boundary:

- M11.1 does not clone arbitrary Word templates.
- M11.1 does not add PDF export.
- M11.1 does not add a visual template editor.
- Future template-file support can introduce `docxtemplater` or `docx-templates` after the registry/API contract is stable.
- `slim-select`, `tom-select`, React select libraries, and `webextension-polyfill` were not adopted for the settings selector. A native `<select>` backed by the backend registry is enough and avoids adding a build/runtime dependency to the MV3 extension.

## M11.2 DOCX render QA reuse check

M11.2 coding started with reuse checks for validating generated DOCX output after render:

- Existing `mammoth@1.12.0`: BSD-2-Clause, GitHub `mwilliamson/mammoth.js`. Selected because the repo already uses it for DOCX text extraction, and its raw-text extraction API is exactly what render QA needs: verify that the generated Word file can be opened as text and contains the expected section contract.
- `docx-preview`: useful for browser-side DOCX-to-HTML preview. Rejected for backend render QA because the current need is not a visual preview surface; it is a deterministic server-side text/heading/policy check after `docx` writes the file.
- `officeparser@7.2.3`: MIT, broad Office parser/generator that can parse many file types and produce richer AST/output. Rejected for this slice because M11.2 only needs DOCX raw text and heading checks; adopting a broader parser would increase migration surface without improving the immediate QA contract.
- ZIP-level packages such as `adm-zip` / `yauzl`: useful for inspecting `.docx` internals but rejected because they would force this project to hand-roll WordprocessingML parsing for headings and text extraction.

Selected approach:

- Reuse existing `mammoth.extractRawText`.
- Add `server/src/resume-render-qa.js` as a narrow QA module.
- Persist QA results in existing `resume_versions.renderMetadata.renderQuality`; no schema change.
- Surface the same metadata in the extension resume detail page.
- Let `AuditAgent` block only hard render failures, while keeping content completeness warnings visible for correction.

Validation:

```powershell
npm run m11:render-qa:smoke
npm run m10:langgraph-resume:smoke
```

Sources checked:

- [mammoth.js](https://github.com/mwilliamson/mammoth.js/)
- [docx-preview npm](https://www.npmjs.com/package/docx-preview)
- [officeParser](https://github.com/harshankur/officeParser)

## M11.3 Local execution package reuse check

M11.3 coding started with reuse checks for workflow execution packaging and durable orchestration:

- `@langchain/langgraph@1.4.7`: already in the repo and useful for the resume-generation graph. Rejected for the execution package slice because this step only assembles already persisted evidence and records one workflow event; no graph transitions or retries are needed.
- `@hatchet-dev/typescript-sdk@1.24.3`: mature background task orchestration. Rejected because the execution package must not create jobs/tasks or introduce an external worker/runtime.
- `@convex-dev/workflow@0.4.4`: durable Convex workflow component. Rejected because it requires Convex runtime semantics and would move this local-first SQLite slice away from the existing backend.
- `@dbos-inc/dbos-sdk@4.23.6`, `durable-functions@3.4.0`, `@dapr/durabletask-js@1.0.0`, and `@aws/durable-execution-sdk-js@2.1.0`: useful for durable execution, cloud/server workflow engines, or external workflow runners. Rejected because M11.3 is a local read/prepare artifact, not a long-running distributed execution.
- `jsonfile@6.2.1`, `comment-json@5.0.0`, and `eta@4.6.0`: useful for generalized JSON file helpers or templating. Rejected because Node's built-in `fs.writeFileSync` plus a small Markdown renderer is enough for this fixed local archive, and adding a template engine would expand the surface without improving control.

Current choice:

- Reuse existing `getApplicationWorkflowSnapshot`, `planApplicationWorkflow`, browser-task dry-run evidence, conversations metadata, and `workflow_events`.
- Add a narrow `ExecutionPackageService` with no new dependency and no schema change.
- Write JSON and Markdown archives with built-in `fs` so each prepared package is locally inspectable.
- Integrate via direct backend endpoints and the existing Chrome Extension background proxy.

Validation:

```powershell
npm run m11:execution-package:smoke
```

## M11.4 Execution package validation reuse check

M11.4 coding started with reuse checks for schema and package validation:

- `ajv@8.20.0`: mature JSON Schema validator, MIT, GitHub `ajv-validator/ajv`. Rejected for now because the execution package contract is a small local business-safety object, and the important rules are semantic checks such as "must not create browser tasks", "real actions remain blocked", and "archive files exist".
- `jsonschema@1.5.0`: established JSON Schema validator, MIT, GitHub `tdegrunt/jsonschema`. Rejected for the same reason: the current validation surface is not primarily generic JSON Schema shape validation.
- `z-schema@12.4.0`: current JSON Schema validator with broad draft support. Rejected because adding a dependency would not reduce the handwritten BOSS safety checks.
- Error-formatting helpers such as `better-ajv-errors` / `@segment/ajv-human-errors` were not adopted because the current UI needs short business failure codes rather than generalized schema error prose.

Selected approach:

- Do not add a dependency.
- Add `validateExecutionPackage` as a narrow pure function inside `ExecutionPackageService`.
- Validate root fields, safety flags, blocked real actions, ready-package evidence, and local archive file existence.
- Store validation output in execution-package responses and workflow event metadata.
- Add `POST /api/applications/:id/execution-package/review` using the existing `workflow_events` table instead of adding a review table.

Future trigger to adopt Ajv:

- If execution packages become externally shared artifacts or versioned public contracts, move the shape checks to JSON Schema and keep BOSS safety checks as custom semantic validators.

Validation:

```powershell
npm run m11:execution-package:smoke
```

## M11.5 Manual execution checklist reuse check

M11.5 coding started with reuse checks for checklist/progress/state-machine helpers:

- `xstate` / `@xstate/fsm`: mature finite-state-machine tooling. Rejected for this slice because the checklist is not a new workflow engine; it is a small ledger over already prepared package steps.
- `javascript-state-machine`, `finity`, and `little-state-machine`: useful for local state machines. Rejected because adding another state layer would duplicate existing `workflow_events` and `WorkflowOrchestrator` responsibilities.
- `@editorjs/checklist`: useful for rich-text checklist editing. Rejected because the extension needs fixed package-derived steps, not user-authored document blocks.
- `@zag-js/progress` and UI progress packages: useful for reusable UI widgets. Rejected because the MV3 settings page already uses simple DOM rendering and needs no component runtime.

Selected approach:

- Do not add a dependency.
- Reuse existing `manualSteps` from the execution package.
- Reuse `workflow_events` as the durable ledger.
- Add narrow service methods `readChecklist` and `recordChecklistStep`.
- Keep all records local and marked `noRealBossAction`, `createsBrowserTasks: false`, and `noBrowserTaskCreated`.

Validation:

```powershell
npm run m11:execution-package:smoke
```

## M12 Submission evidence reuse check

M12 coding started with reuse checks for page result/status detection and evidence recording:

- `webextension-polyfill`: mature Promise wrapper for Chrome/Firefox extension APIs. Rejected because this MV3 extension already uses direct `chrome.*` APIs and adding a polyfill would not improve result classification.
- Generic MutationObserver/page-monitor examples from GitHub: useful for detecting text changes, but rejected because M12 only needs an explicit user-triggered read of the current BOSS page, not background monitoring.
- Readability/DOM text extraction helpers: useful for article extraction, but rejected because BOSS result detection depends on short business signals, existing conversation/upload/submit dry-run snapshots, and blocker diagnostics rather than article text parsing.
- NLP/full-text packages from npm search: rejected because the status vocabulary is small and must stay explainable for audit logs.

Selected approach:

- Do not add a dependency.
- Reuse the existing content script DOM access, page diagnostics, conversation snapshot, resume unlock snapshot, upload dry-run snapshot, and submit dry-run snapshot.
- Reuse `workflow_events` as the durable evidence ledger instead of creating a new table in this slice.
- Keep all records marked `noRealBossAction: true`, `createsBrowserTasks: false`, and `noBrowserTaskCreated: true`.

Validation:

```powershell
npm run m12:submission-evidence:smoke
```

## M13.1 Repository quality and CI reuse check

M13.1 coding started with GitHub/npm reuse checks for Node CI and test-script orchestration:

- `actions/checkout@v6`: selected as the official GitHub repository checkout action.
- `actions/setup-node@v6`: selected as the official Node.js setup action, with Node.js 24 and npm dependency caching.
- `npm-run-all2`: maintained cross-platform npm-script orchestration and useful when a project needs parallel or wildcard script execution. Rejected for this slice because the repository needs deterministic sequential smoke execution, fail-fast output, and explicit tier membership checks; a small built-in Node runner covers those requirements without another dependency.
- Node's built-in `child_process.spawnSync`: selected for syntax and tier runners because it works with the existing individual npm scripts and preserves their exit codes and output.
- Playwright's installed Chromium executable: reused by `findBrowserExecutable()` after the CI workflow installs Chromium, while retaining local Chrome/Edge discovery for Windows development.

Integration:

- Direct GitHub Actions usage in `.github/workflows/ci.yml`.
- No new npm package.
- `scripts/check-js-syntax.js` discovers JavaScript files.
- `scripts/test-tiers.js` is the source of truth for smoke test ownership.
- `scripts/run-test-tier.js` runs tiers sequentially.
- `scripts/m13-repository-baseline-smoke.js` validates repository invariants and that every milestone smoke is assigned exactly once.

Validation:

```powershell
npm run check
npm run test:baseline
npm run test:ci
```

Sources checked:

- [actions/checkout](https://github.com/actions/checkout)
- [actions/setup-node](https://github.com/actions/setup-node)
- [npm-run-all2](https://github.com/bcomnes/npm-run-all2)

## M13.2 SQLite migration reuse check

M13.2 coding started with reuse checks for ordered SQLite migrations and backup/recovery:

- `umzug`: mature framework-agnostic migration runner with custom storage support. Rejected because this repository would still need a custom synchronous `node:sqlite` storage adapter, backup lifecycle, and failure restoration around it.
- `knex`: mature SQL query builder with migration CLI. Rejected because it requires adding Knex plus a supported SQLite driver and would replace more of the current direct `DatabaseSync` access than this migration slice needs.
- Node.js `node:sqlite`: selected because it is already the repository database runtime and keeps initialization synchronous.
- SQLite `VACUUM INTO`: selected for pre-migration backups because it creates a consistent standalone SQLite database while the source connection is open.
- `PRAGMA user_version`: retained as the runtime compatibility version; `schema_migrations` adds names, checksums, status, duration, and timestamps for auditability.

Selected approach:

- Do not add an npm dependency.
- Store ordered SQL under `server/migrations/`.
- Validate a contiguous `001` through current `SCHEMA_VERSION` sequence before changing a database.
- Reject migration files that manage their own transaction or `user_version`.
- Execute each migration in `BEGIN IMMEDIATE`, record SHA-256 checksum, then advance `user_version`.
- Back up an existing database before pending migrations or migration-history bootstrap.
- Restore the backup on failure and keep the backup file for inspection.

Validation:

```powershell
npm run m2:sqlite:smoke
npm run m13:sqlite-migrations:smoke
npm run test:ci
```

Sources checked:

- [Node.js SQLite](https://nodejs.org/api/sqlite.html)
- [SQLite VACUUM INTO](https://sqlite.org/lang_vacuum.html#vacuuminto)
- [SQLite user_version](https://sqlite.org/pragma.html#pragma_user_version)
- [Umzug](https://github.com/sequelize/umzug)
- [Knex migrations](https://knexjs.org/guide/migrations.html)

## M13.3 Immutable workflow input reuse check

M13.3 coding started with GitHub/npm checks for LangGraph persistence, SQLite checkpointing, and event stores:

- Official LangGraph persistence/checkpointing: useful for thread state, interrupts, time travel, and resuming graph execution. Not adopted in M13.3 because this slice needs a business audit record of the exact profile/JD/version manifest before any node runs.
- `@langchain/langgraph-checkpoint-sqlite`: official SQLite checkpointer candidate. Deferred because graph replay can re-execute downstream nodes and their side effects, while the current requirement is a read-only comparison replay that must not create screenings, resumes, audits, files, or browser tasks.
- `evtstore`: SQLite-backed Node event store candidate. Rejected because introducing a second event-store abstraction would duplicate the existing `workflow_events`, direct `node:sqlite` runtime, and ordered migration system.
- Existing `node:sqlite`, `job_snapshots`, `agent_runs`, and LangGraph node functions: selected for direct reuse.

Selected approach:

- Do not add an npm dependency.
- Keep business input snapshots separate from future LangGraph runtime checkpoints.
- Add `profile_snapshots`, `workflow_runs`, and `workflow_input_snapshots` through migration 011.
- Reuse `job_snapshots` for workflow-owned JD snapshots.
- Attach one immutable manifest to every graph `agent_run`.
- Store only sanitized model configuration metadata.
- Implement `POST /api/workflow-runs/:id/replay` as an in-memory dry replay with output comparison and zero persistent writes.

Validation:

```powershell
npm run m13:workflow-inputs:smoke
npm run m10:langgraph-resume:smoke
npm run test:ci
```

Sources checked:

- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangGraph replay](https://docs.langchain.com/oss/javascript/langgraph/use-time-travel)
- [LangGraph SQLite checkpointer](https://www.npmjs.com/package/@langchain/langgraph-checkpoint-sqlite)
- [evtstore](https://www.npmjs.com/package/evtstore)

## M13.4 Application transition reuse check

M13.4 coding started with GitHub/npm checks for JavaScript state-machine runtimes:

- `xstate@5.32.4`: mature MIT statechart/actor runtime with active maintenance and strong fit for complex in-memory orchestration. Rejected for this slice because the hard requirement is SQLite-transactional evidence ownership, idempotency keys, task expiry, and callback leases; adopting XState would not replace those persistence rules and would duplicate the existing explicit transition map.
- `javascript-state-machine@3.1.0`: smaller finite-state-machine package. Rejected because its maintenance is substantially older and it still does not provide database evidence validation, transactional event writes, or browser-task lease semantics.
- Existing explicit transition map, ordered migrations, `node:sqlite`, `application_events`, and `workflow_events`: selected for direct reuse.

Selected approach:

- Do not add an npm dependency.
- Move the existing application graph into one `ApplicationTransitionService`.
- Keep transition policy synchronous and transaction-owned by the existing SQLite store.
- Validate typed evidence against persisted rows before changing state.
- Add application-scoped idempotency keys through migration 012.
- Add browser task expiry, attempts, and claim tokens in the same migration.
- Make the extension return the current claim token with every task completion callback.
- Treat identical terminal callbacks as successful no-op replay and conflicting/stale callbacks as HTTP 409.

Validation:

```powershell
npm run m13:application-transitions:smoke
npm run test:workflow
npm run test:ci
```

Sources checked:

- [XState](https://github.com/statelyai/xstate)
- [XState npm](https://www.npmjs.com/package/xstate)
- [javascript-state-machine](https://github.com/jakesgordon/javascript-state-machine)
- [javascript-state-machine npm](https://www.npmjs.com/package/javascript-state-machine)

## M13.5 Agent evaluation reuse check

M13.5 coding started with GitHub/npm searches for `LLM evaluation`, `agent evaluation`, `TypeScript eval`, and local fixture runners. Metadata was checked on 2026-07-10:

- `promptfoo/promptfoo` (`promptfoo@0.121.18`, 23k+ GitHub stars): the most mature general candidate, with provider orchestration, assertions, red-team checks, and reports. Rejected for the M13.5 core because the npm package has a large dependency surface and the project would still need custom cross-case ranking, claim-evidence ownership, Audit consistency, input hashing, and version-manifest logic.
- `confident-ai/deepeval` (`deepeval@0.1.31`, 16k+ GitHub stars): mature Python ecosystem and active project, but the TypeScript package is comparatively new and brings OpenAI, telemetry, Sentry, and reporting dependencies. It is better suited to later LLM-as-judge evaluation than the no-key deterministic CI baseline.
- `langchain-ai/langsmith-sdk` (`langsmith@0.8.1`, 900+ GitHub stars): integrates naturally with LangGraph and is a strong later option for hosted datasets, traces, and model comparisons. Rejected for the required baseline because its main value depends on an external service, while M13.5 must remain local, anonymous, and runnable without credentials.
- `mattpocock/evalite` (`evalite@0.19.0`, 1.6k+ GitHub stars): the closest TypeScript code-first candidate. Rejected because it would add Vitest, Fastify, and native `better-sqlite3` beside the repository's existing Node 24 runner and `node:sqlite` stack, while all business scorers still require custom code.
- Existing production Agent functions, version constants, built-in `crypto`, JSON fixtures, and the M13 test-tier runner: selected for direct reuse.

Selected approach:

- Do not add an npm dependency for the deterministic baseline.
- Store anonymous, versioned fixtures under `evaluation/fixtures/`.
- Call production `JobRiskGate`, `ScreeningAgent`, `ResumeAgent`, `ResumeFitEvaluator`, `ClaimVerifier`, and `AuditAgent` directly in rules mode.
- Produce local JSON and Markdown reports with dataset SHA-256, provider/model mode, graph/prompt/agent versions, thresholds, metrics, and failed sample IDs.
- Keep the dataset/report contract framework-neutral so a later promptfoo, DeepEval, or LangSmith adapter can consume the same cases for live-model evaluation.

Validation:

```powershell
npm run agent:evaluate
npm run m13:agent-evaluation:smoke
npm run test:agents
npm run test:ci
```

Sources checked:

- [promptfoo](https://github.com/promptfoo/promptfoo)
- [DeepEval](https://github.com/confident-ai/deepeval)
- [LangSmith SDK](https://github.com/langchain-ai/langsmith-sdk)
- [Evalite](https://github.com/mattpocock/evalite)

## M15.1 Profile conversation memory reuse check

M15.1 coding started with GitHub/npm searches for `LangGraph`, `agent memory`, and `langgraph sqlite checkpoint`. Metadata was checked on 2026-07-11:

- `langchain-ai/langgraphjs` (3.1k+ GitHub stars) and `@langchain/langgraph@1.4.7`: actively maintained official graph runtime and already used by this repository. Reused for the existing resume graph, but not added to each ProfileAgent turn because a request/response interview turn does not need a graph checkpoint.
- `@langchain/langgraph-checkpoint-sqlite@1.0.3`: official, actively maintained SQLite checkpointer. Deferred because graph state/checkpoints do not model user confirmation, canonical profile entities, conflict resolution, or before/after fact revisions.
- `mem0ai/mem0` (60k+ GitHub stars, `mem0ai@3.0.13`): mature general memory layer. Rejected for this phase because embeddings, semantic retrieval, and an additional memory abstraction add migration cost without replacing the domain profile schema.
- `TencentCloud/TencentDB-Agent-Memory` (8.4k+ GitHub stars): validated local multi-tier memory reference. Rejected because adopting another complete memory subsystem would duplicate the current local SQLite source of truth and Node runtime.
- Existing `model-client`, `node:sqlite`, ordered migrations, `agent_runs`, `workflow_events`, `profile_fact_drafts`, and project-local career Skill: selected for direct reuse.

Selected approach:

- Add domain-owned session/message tables instead of a generic vector memory service.
- Load `.agents/skills/career-retrospective-to-job/` at model runtime.
- Persist user messages before model requests and expose explicit retry.
- Require strict JSON for reply, drafts, questions, conflicts, and summary patch.
- Keep model writes behind the existing pending draft confirmation gate.
- Version generated career context by profile and content hash.
- Re-evaluate LangGraph SQLite checkpoints only if the interview becomes a branching, interruptible graph.

Validation:

```powershell
npm run m15:profile-conversation:smoke
npm run m15:options-profile-conversation:smoke
npm run test:ci
```

Sources checked:

- [LangGraph.js](https://github.com/langchain-ai/langgraphjs)
- [LangGraph SQLite checkpointer](https://www.npmjs.com/package/@langchain/langgraph-checkpoint-sqlite)
- [Mem0](https://github.com/mem0ai/mem0)
- [TencentDB Agent Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory)

## M16 Real-model Agent quality reuse check

M16 reuse checks were refreshed on 2026-07-12 with GitHub and npm metadata:

- `openai/openai-node` / `openai@6.46.0`: 11k+ GitHub stars, Apache-2.0, active updates, official Responses/Chat client and usage/error types. Selected as a direct npm dependency.
- `colinhacks/zod` / `zod@4.4.3`: 43k+ GitHub stars, MIT, active updates, no runtime dependency tree. Selected for strict Agent output contracts.
- `langchain-ai/langchainjs` / `@langchain/openai@1.5.5`: 17k+ GitHub stars and active maintenance. The OpenAI adapter was rejected for this slice because it already depends on the same `openai` and Zod packages, while the repository needs provider telemetry and retry semantics below LangGraph rather than another message abstraction. Existing `@langchain/langgraph` remains the orchestrator.
- `promptfoo`, DeepEval, LangSmith, and Evalite from the M13.5 check remain useful report/provider frameworks. They were not adopted because risk recall, pairwise job ranking, confirmed-fact ownership, claim support, Audit monotonicity, and SQLite evaluation history are project-domain metrics that still require the local runner.
- Official `ResponsesWS` plus `ws@8.21.0` was tested because the configured provider advertised WebSocket-only Responses. The current Cloudflare path returned HTTP 426 to standard WebSocket upgrades, so Chat compatibility was selected and `ws` was removed instead of retaining an unused dependency.

Selected integration:

- Install `openai` and `zod` directly.
- Keep LangGraph responsible only for node routing and workflow state.
- Keep one backend-owned model client responsible for config precedence, provider transport, JSON extraction, Zod validation, retries, request hashes, usage, latency, optional cost, and sanitized errors.
- Support provider-compatible JSON-string-wrapped Chat responses by unwrapping exactly one object layer before normal validation.
- Persist only sanitized model config and telemetry; never persist API keys, prompts, failed output bodies, resume files, or local credential paths in evaluation reports.
- Reuse the M13 anonymous fixture for both deterministic CI and repeated live-model runs.
- Keep real-model evaluation outside CI because it requires credentials, external availability, time, and token spend.

### M16.1 human feedback and Shadow review

Candidates checked on 2026-07-13:

- `argilla-io/argilla`: LLM/data feedback collaboration, Apache-2.0, 5k+ GitHub stars. Rejected because it requires a separate Python service and data model.
- `HumanSignal/label-studio`: general annotation platform, Apache-2.0, 27k+ stars. Rejected as too broad and operationally heavy for one local job-review workflow.
- `langfuse/langfuse`: LLM observability, evaluation, and feedback, 31k+ stars. Rejected because it adds an external service and a second runtime data store.
- `comet-ml/opik`: Agent tracing and evaluation, Apache-2.0, 20k+ stars. Rejected for the same deployment and data-ownership cost.
- `promptfoo/promptfoo`: MIT, 23k+ stars, mature declarative prompt/Agent evaluation. Rejected as the core Shadow runner because application state, deterministic risk gates, confirmed-fact ownership, and evidence-bound recommendations remain project-specific.

Selected integration: reuse the common pattern of versioned inputs, per-sample outcomes, human labels, and failure-case promotion without adding a runtime dependency. M16.1 stores this contract in the existing Node/SQLite backend and renders it in options advanced diagnostics. A non-`CORRECT` review becomes a local promotion candidate; anonymization and fixed-dataset edits remain explicit later steps.

Provider finding:

- The local credential file selected `gpt-5.5/responses`, but the provider returned 502 for HTTP Responses and 426 for WebSocket upgrades.
- `gpt-5.4` Chat produced truncated long JSON at roughly 100 completion tokens even when token-limit parameters were supplied.
- `gpt-5.4-mini/chat` completed long structured output and the full 9-job x 3-sample evaluation. This is a local provider compatibility result, not a universal OpenAI model recommendation.
- The first unpaced formal run preserved a failed evaluation after repeated 502s. The passing run used a 2500 ms minimum interval, three retries, and exponential 5xx backoff, demonstrating that provider availability is measured separately from Agent output quality.

Validation:

```powershell
npm run m16:real-model-agents:smoke
npm run m16:agent-quality-evaluation:smoke
npm run m16:options-agent-quality:smoke
npm run agent:evaluate:real -- --samples 3 --delay-ms 2500
```

Sources checked:

- [OpenAI Node SDK](https://github.com/openai/openai-node)
- [OpenAI npm](https://www.npmjs.com/package/openai)
- [Zod](https://github.com/colinhacks/zod)
- [Zod npm](https://www.npmjs.com/package/zod)
- [LangChain.js](https://github.com/langchain-ai/langchainjs)
- [LangChain OpenAI npm](https://www.npmjs.com/package/@langchain/openai)
- [ws](https://github.com/websockets/ws)
