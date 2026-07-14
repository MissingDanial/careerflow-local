# Boss Find / JoB_Find

[![CI](https://github.com/MissingDanial/careerflow-local/actions/workflows/ci.yml/badge.svg)](https://github.com/MissingDanial/careerflow-local/actions/workflows/ci.yml)

Boss Find 当前是一个本地优先的 BOSS 直聘求职工作台，围绕“完整 JD 采集、意向岗位队列、Agent 筛选、定制 DOCX、用户人工联系/投递记录”形成单用户本地闭环。

当前仓库里已经有两类内容：

- `extension/` + `server/`：当前可运行的 Chrome MV3 插件和 Node 本地同步后端原型。
- `docs/`：面向完整 JoB_Find 闭环的 PRD、架构、Agent 工作流、开发计划和 BOSS 平台层约束。

## 当前可运行能力

- 在用户已登录的 BOSS 直聘网页中读取当前已渲染岗位列表。
- 自动逐个打开当前列表岗位详情，补齐职位描述。
- 采集后自动同步到本地后端。
- 本地后端以 SQLite 保存岗位数据，并提供 JSON/CSV 查询。
- 本地后端已建立 application 状态机和 browser_tasks 浏览器任务队列基座。
- Chrome Extension 可手动领取一个后端 `CAPTURE_DETAIL` 任务，在当前 BOSS 页面尝试打开对应岗位并回写执行结果。
- 后端已提供 ScreeningAgent、ResumeAgent、ResumeFitEvaluator、ClaimVerifier、ResumeRevisionAgent、AuditAgent；规则模式和真实模型模式共用同一套结构化契约、证据门禁和 LangGraph，可生成岗位版 DOCX 简历、写入版本、评估、校验、修订和审核记录。
- M10.4 已引入官方 `@langchain/langgraph` 作为本地编排层，提供 `ResumeWorkflowGraph` 将筛选、简历生成、JD fit、claim 校验、证据内修订、重新评估和审核串成可追踪闭环。
- M11.1 已新增简历模板注册表，默认 DOCX 模板为 `resume-to-word-campus-product-v1`，由项目内 `resume-to-word` skill 沉淀章节顺序和输出规则；后端 `GET /api/resume-templates` 作为模板列表来源，扩展设置页的一键简历闭环可选择默认模板或旧版模板。
- M11.2 已新增 DOCX Render QA：生成 Word 后自动用 `mammoth.extractRawText` 抽取文本，检查模板元数据、章节顺序、独立摘要/技能段策略、页数估算和可抽取性；QA 元数据随 `renderMetadata.renderQuality` 入库，扩展简历详情页可查看，AuditAgent 会阻断真正的渲染硬失败。
- M11.3 已新增本地执行包：`GET/POST /api/applications/:id/execution-package` 会汇总岗位、已审批 DOCX、DOCX QA、打招呼草稿、只读 dry-run 证据、投递准备复核和手动步骤；POST 会在本地 `execution_packages/` 写 JSON + Markdown 归档并记录 `EXECUTION_PACKAGE_PREPARED` 审计事件，不创建 browser task、不推进状态、不触发 BOSS 真实发送/上传/投递。
- M11.4 adds execution-package validation and review: package responses include `validation`, prepared archives are checked after write, and `POST /api/applications/:id/execution-package/review` records `EXECUTION_PACKAGE_REVIEWED` without creating browser tasks, changing application status, or enabling real BOSS send/upload/submit.
- M11.5 adds a manual execution checklist ledger: `GET/POST /api/applications/:id/execution-checklist` reads package-derived manual steps and records local step decisions as `EXECUTION_CHECKLIST_STEP_RECORDED`, still without creating browser tasks, changing application status, or marking the application submitted.
- M12.1 adds a manual submission evidence ledger: `GET/POST /api/applications/:id/submission-evidence` records `SUBMISSION_EVIDENCE_RECORDED` workflow events for user-confirmed or read-only page evidence, without changing application status or creating browser tasks.
- M12.2 adds read-only BOSS page result detection in the extension settings page: `Read current BOSS result` inspects visible DOM text and existing page snapshots, and `Record result evidence` writes the local evidence event. It does not click, send, upload, confirm, submit, or mark the application submitted.
- M13.1 adds an automatically discovered JavaScript syntax gate, five smoke-test tiers, a repository-baseline smoke, Playwright Chromium fallback, and GitHub Actions CI on Node.js 24.
- M13.2 replaces the centralized SQLite schema block with ordered SQL migrations, checksum history, pre-migration `VACUUM INTO` backups, and automatic restoration after migration failure; the current schema sequence is `001-018`.
- M13.3 adds immutable workflow inputs: each `ResumeWorkflowGraph` run freezes one profile snapshot, one JD snapshot, execution options, sanitized model config, and graph/prompt/agent versions before the first node starts. Every graph `agent_run` references the same snapshot set. `GET /api/workflow-runs/:id` reads the historical run and `POST /api/workflow-runs/:id/replay` performs a no-write dry replay from the frozen inputs.
- M13.4 adds a single `ApplicationTransitionService`: all application status changes now require a legal edge, typed evidence, and an idempotency key where a source fact exists. Schema v12 also adds browser-task expiry, retry limits, claim tokens, and terminal callback deduplication so stale or repeated extension callbacks cannot regress an application or repeat side effects.
- M13.5 adds a local anonymous Agent evaluation baseline. Nine deterministic metrics cover risk-gate recall/precision, job ranking, Screening decisions, JD must-have handling, generated and labeled claim support, and Audit consistency; JSON/Markdown reports carry dataset hashes plus graph/prompt/agent versions and fail CI on threshold regression.
- M14.1 adds a default-off, single-job `SEND_GREETING_REAL` canary. It requires a short-lived global policy, one-time hashed authorization token, one selected `GREETING_READY` application, daily limit 1, `maxAttempts = 1`, page/job/message hash preflight, and post-send DOM readback before `GREETING_SENT`. A click without confirmed readback becomes `UNCERTAIN` and `NEEDS_USER_REVIEW`, never an automatic retry.
- M14.1c 将扩展 options 页收敛为 `工作台 / 个人经历 / 设置` 三个入口。工作台以 application 队列为主视图，每次只显示一个按状态推导的下一步操作；ProfileAgent 独立到个人经历页，任务、Agent 节点、错误日志和旧手动工具默认折叠在高级诊断中。默认工作台只有 5 个可见按钮。
- M15.1 将 ProfileAgent 升级为持久化模型对话入口：后端每轮加载项目内 `career-retrospective-to-job` Skill，保存 session/message/摘要/追问/冲突，模型只生成 `CREATE/UPDATE` 待确认草稿；用户确认后才事务性更新正式画像并保存 before/after 修订。`career_agent_context.md` 同时写入带 profile/content hash 的版本记录，模型失败时保留原用户消息并支持原位重试。
- M16 已接入官方 `openai@6.46.0` 和 `zod@4.4.3`，让 Screening、Resume、Fit、Revision、Audit 使用真实模型严格 JSON 输出；ClaimVerifier 和风险门禁保持确定性。schema v15 保存模型 token/延迟/重试遥测和评测记录，设置页可选择 `hybrid/auto/llm/rules` 并查看最近质量门禁。
- M16.1 新增真实岗位 Shadow 评审：默认对 20 个本地真实 JD 首轮评分，仅为 Top 5 补足 3 次采样，最多 30 次 Screening。schema v16 保存冻结画像/JD、排名、方差、遥测和追加式人工标签；该流程不写正式 screenings、不改变 application 状态，也不创建 browser task。
- M17 新增多意向岗位队列、后端模型配置和 Native Messaging 启动器。`jobs/applications` 继续全局去重，队列通过多对多成员关系隔离产品、算法等方向；删除意向、移出岗位和清理待补 JD 都是软移除。schema v17-v18 保存队列、信任标记和人工联系状态。
- M17.1 将工作台收敛为四个阶段：完整 JD、岗位筛选、定制简历、人工联系与投递。被风险门禁过滤的岗位可在当前队列显式信任后重筛；DOCX 可批量生成并保存到指定目录；系统只打开 BOSS 岗位页面，打招呼、简历上传和投递由用户完成。
- “个人经历”支持 DOCX/PDF/TXT/MD 简历上传、文本抽取和待确认事实草稿；ProfileAgent 多轮对话、事实确认和版本化 `career_agent_context.md` 继续独立持久化。
- 项目内新增 `.agents/skills/career-retrospective-to-job/`，用于把用户上传简历、项目材料和补充对话整理成可复用的 `career_agent_context.md` 上下文，再进入事实草稿确认流。
- 工作台可按当前队列和阶段执行“评估岗位、生成定制简历、查看完整信息、打开岗位页面”等上下文操作；简历详情按需在弹窗中打开，不再平铺所有 Agent 节点按钮。
- 本地审批最多把 application 推进到 `GREETING_READY`，不会创建 `SEND_GREETING`、`UPLOAD_RESUME` 或 `SUBMIT_APPLICATION` 浏览器任务。
- 后端已提供规则版 MessageAgent，可生成打招呼草稿、写入 `conversations/messages`，并创建 `SEND_GREETING` dry-run 任务供发送前确认。
- 扩展设置详细页可领取 `SEND_GREETING` dry-run 任务，在已打开的 BOSS 页面定位匹配岗位并尝试把招呼语填入聊天输入框；它会停在发送前，不点击发送。
- 扩展设置详细页可创建并运行 `REFRESH_CONVERSATION` / `CHECK_RESUME_UNLOCK` 只读任务，读取当前 BOSS 页面会话、近期消息和简历入口状态并回写后端；不会点击发送、上传或投递。
- 不依赖打开控制台，不绕过登录、验证码或平台风控。

当前产品明确不是自动投递器。历史 M14 单岗位真实打招呼 canary 代码仍作为默认关闭的内部兼容实验保留，但普通用户界面不暴露真实打招呼、上传或投递动作，也不把 Agent/Shadow 评测通过视为 BOSS 操作授权。

## Agent 测评基线

M13.5 已建立一套可重复运行的匿名 Agent 固定评测，用来回答三个关键问题：风险岗位能否正确拦截、岗位和简历是否真正匹配、生成内容是否有用户事实支撑。评测器直接调用生产 `JobRiskGate -> ScreeningAgent -> ResumeAgent -> ResumeFitEvaluator -> ClaimVerifier -> AuditAgent`，运行时不读取真实用户数据库、不生成 BOSS 动作，也不需要模型 API Key。

当前固定集包含：

- 2 个匿名候选人画像，覆盖 AI 产品和 Node.js 后端方向。
- 9 个岗位样本，包括强匹配、中等匹配、弱匹配、销售/直播风险和否定语境边界。
- 15 个人工标注 JD 必要项。
- 2 组 claim probe，分别验证允许表述和无事实支撑的夸大表述。
- 3 组 Audit probe，覆盖 `approve`、`revise`、`block`。

最新基线结果：

| 指标 | 结果 | 门槛 | 样本量 |
| --- | ---: | ---: | ---: |
| 风险门禁召回率 | 100.0% | 100.0% | 2 |
| 风险门禁精确率 | 100.0% | 100.0% | 2 |
| 岗位两两排序准确率 | 100.0% | 100.0% | 6 对 |
| Screening 决策准确率 | 100.0% | 100.0% | 9 |
| JD 必要项识别率 | 100.0% | 100.0% | 15 |
| JD 必要项状态准确率 | 100.0% | 80.0% | 15 |
| 生成 claim 事实支持率 | 96.2% | 85.0% | 156 |
| 人工标注 claim 判定准确率 | 100.0% | 100.0% | 6 |
| Audit 结论一致性 | 100.0% | 100.0% | 8 |

评测数据集有稳定 SHA-256，报告同时记录 graph、prompt、agent 版本和失败样本 ID。任何指标低于门槛，命令和 CI 都会返回失败；smoke 还会故意修改一条人工标签，验证门禁确实能定位 `job-sales-blocked`，而不是恒定输出通过。

```powershell
npm run agent:evaluate
npm run m13:agent-evaluation:smoke
npm run m14:real-action:smoke
npm run m14:extension-real-greeting:smoke
npm run m14:options-workspace-ui:smoke
npm run m15:profile-conversation:smoke
npm run m15:options-profile-conversation:smoke
npm run m16:real-model-agents:smoke
npm run m16:agent-quality-evaluation:smoke
npm run m16:options-agent-quality:smoke
npm run m16:shadow-review:smoke
npm run m16:options-shadow-review:smoke
npm run m17:application-queues:smoke
npm run m17:model-config:smoke
npm run m17:native-host:smoke
npm run m17:popup-runtime:smoke
npm run m17:options-queues-runtime:smoke
npm run test:ci
```

运行后会在 `server/data/agent-evaluation/` 生成完整 JSON/Markdown 报告。该目录默认不提交，公开仓库保留匿名固定集、评测代码和上表基线结果。M13 固定基线使用确定性 rules mode，主要用于发现代码、规则和 Agent 契约回归；它不等同于真实 LLM 多次采样质量、真实用户投递成功率或 BOSS 自动化成功率。

### M16 真实模型 Agent 质量闭环（已完成并验证）

- **正式评测**：27 个样本，75/75 个模型节点成功，11/11 项质量门槛全部通过。
- **事实约束**：Claim 支撑率为 96.68%，unsupported claim 为 0。

M16 复用同一匿名数据集，以 `hybrid` 模式对全部 9 个岗位各重复 3 次。正式报告 ID 为 `382ad0764126c5ff`，详细结果如下：

| 指标 | 结果 | 门槛 |
| --- | ---: | ---: |
| 结构化输出成功率 | 100.0% | >= 95.0% |
| 完整样本成功率 | 100.0% | >= 90.0% |
| 风险门禁召回率 / 精确率 | 100.0% / 100.0% | 100.0% / 100.0% |
| 岗位两两排序准确率 | 100.0% | >= 90.0% |
| Screening 决策准确率 | 100.0% | >= 75.0% |
| JD 必要项状态准确率 | 100.0% | >= 80.0% |
| 生成 claim 事实支持率 | 96.68% | >= 95.0% |
| Audit 结论一致性 | 100.0% | >= 80.0% |
| 最大 Screening 评分标准差 | 2.357 | <= 8.0 |
| Unsupported claim | 0 | 0 |

本次正式评测共使用 574,003 token，P50/P95 延迟为 6.7/12.2 秒，75/75 模型节点成功，无规则降级。当前未配置模型单价，因此报告不宣称实际费用；该结果也不代表真实投递成功率。

```powershell
npm run agent:evaluate:real -- --samples 3 --delay-ms 2500
```

真实模型凭据仍从环境变量或被忽略的 `gpt5.5.txt` 读取。项目级非敏感覆盖写在被忽略的 `boss-model.local.json`，仓库提供 `boss-model.example.json`；当前供应商实测可用组合为 `gpt-5.4-mini + chat`。供应商的 `gpt-5.5 + responses` 端点在 Node 后端路径下返回 502/426，不能视为已支持。Chat 兼容层返回双层 JSON 时客户端会受控解包，429/5xx 使用指数退避并记录每次 attempt。

## 目标闭环

计划中的完整流程是：

```text
BOSS 岗位采集
-> 本地入库
-> Agent 岗位匹配评分
-> Agent 简历定制
-> AuditAgent 简历审核
-> 用户审批或规则审批
-> BOSS 打招呼
-> 沟通状态检测
-> 简历投递解锁
-> 投递执行与日志
```

这个闭环需要后续引入 BrowserExecutor 技术选型、SQLite、状态机、Agent Schema、简历文件管理、浏览器任务队列和审批界面。不要把它简单理解成“接 BOSS 所有接口”；更稳的抽象是 `BossAdapter / BrowserExecutor` 执行页面动作，后端工作流和 Agent 层负责判断。

## BOSS 平台层关键约束

BOSS 侧当前最关键的问题：

- 登录态只能由用户浏览器持有，后端不应直接持有 BOSS session。
- 岗位列表通常没有完整 JD，需要打开详情后采集。
- 当前列表不等于完整搜索结果，存在滚动加载、重复项和非岗位入口。
- 打招呼后才可能解锁简历投递，投递不是“看到岗位就点击”的单步动作。
- 简历上传/选择受浏览器安全限制，不能假设内容脚本能静默上传本地文件。
- 页面 DOM 会变化，需要 selector diagnostics 和浏览器事件日志。
- 验证码、登录失效、风控提示必须暂停并交给用户处理。

完整记录见 [docs/06_BOSS_PLATFORM_LOGIC.md](docs/06_BOSS_PLATFORM_LOGIC.md)。

## M1 当前结论

M1 BrowserExecutor POC 已经给出阶段性结论：

- Firecrawl profile 持久化可用，`m.zhipin.com` scrape-only 可读，但 BOSS interact/profile-check 没有证明可稳定承载登录态和页面交互。
- LocalPlaywright 能打开本机 Edge，但受控浏览器 profile 被 BOSS 引导到登录/安全验证；用户完成登录后仍出现登录界面失效、浏览器闪烁并自动关闭的现象，因此不适合作为 M1 主执行器。
- Chrome Extension 已经从真实 BOSS 页面同步出 33 条岗位，其中 15 条带可用 JD，满足 M1 岗位/JD 获取阈值。

当前路线：`ChromeExtensionAdapter` 作为 BOSS 主执行器；Firecrawl 只保留为 scrape-only 辅助候选；LocalPlaywright 只保留为后续用户确认后的文件上传/投递入口实验候选。

M2 已落地：后端现在使用 SQLite，本地库为 `server/data/boss_find.sqlite3`。首次启动会从旧的 `server/data/jobs.json` 导入历史岗位，并过滤非 `/job_detail/` 的公司页噪声。
M3 已完成采集质量闭环和可续跑 JD 补齐。M4 已落地 application 状态机与 browser_tasks 队列基座，并在扩展里提供当前页补 JD 队列的一键生成+处理入口。M5-M7.4 已完成用户画像基础、岗位筛选、岗位版简历生成、审核、详情查看、受限本地编辑和本地审批。M9.5 已完成打招呼草稿、`SEND_GREETING` dry-run、页面侧发送前填入验证、`REFRESH_CONVERSATION` / `CHECK_RESUME_UNLOCK` 只读会话和简历解锁刷新、只读会话消息归档、沟通状态判定、下一步建议生成、`UPLOAD_RESUME` 上传入口 dry-run、`SUBMIT_APPLICATION` 投递入口 dry-run、本地 `submissionReadiness` 投递准备度 gate、投递准备复核队列，以及本地复核决策写入；仍不真实发送、选择文件、上传、确认或投递。M10.4 已把本地简历闭环迁入 LangGraph 编排，但仍只操作本地数据库和 DOCX 文件，不创建真实 BOSS 动作。

## 文档地图

- [docs/01_PRD.md](docs/01_PRD.md)：产品目标、用户流程、功能边界和验收标准。
- [docs/02_TECH_ARCHITECTURE.md](docs/02_TECH_ARCHITECTURE.md)：目标架构、模块职责、数据模型和 API 草案。
- [docs/03_AGENT_WORKFLOW.md](docs/03_AGENT_WORKFLOW.md)：Agent 拆分、输入输出和审核规则。
- [docs/04_DEVELOPMENT_PLAN.md](docs/04_DEVELOPMENT_PLAN.md)：当前唯一主路线图，按阶段拆解开发步骤和验收标准。
- [docs/05_OPEN_SOURCE_REUSE.md](docs/05_OPEN_SOURCE_REUSE.md)：开源复用调研和许可证策略。
- [docs/06_BOSS_PLATFORM_LOGIC.md](docs/06_BOSS_PLATFORM_LOGIC.md)：BOSS 平台层逻辑问题、状态机和开发约束。
- [docs/07_BROWSER_EXECUTOR_POC.md](docs/07_BROWSER_EXECUTOR_POC.md)：M1 BrowserExecutor POC 操作手册。
- [docs/08_FIRECRAWL_DECISION.md](docs/08_FIRECRAWL_DECISION.md)：Firecrawl 选型决策记录。

## 当前原型运行方式

环境要求：Node.js 24+。当前后端使用 `node:sqlite`，Node 低版本无法启动 SQLite 存储。

开发时可直接启动本地后端：

```powershell
npm run server
```

默认地址：

```text
http://127.0.0.1:8787
```

普通用户只需在扩展“设置”中填写模型服务，配置会保存到被 Git 忽略的后端本地文件 `server/data/model-provider.local.json`。环境变量或本机 `gpt5.5.txt` 仍可作为已有凭据来源，`boss-model.local.json` 可覆盖 model、wire API、超时和重试。扩展存储、接口响应、日志和数据库都不保存或返回完整 API Key。

安装扩展后，一次性安装本地启动器：

```powershell
npm run native:build
npm run native:install
```

安装脚本会从 Chrome/Edge 配置中识别已加载的扩展 ID，只注册当前用户的标准 Native Messaging Host。之后 popup 可用“启动后端”启动固定的 `server/src/server.js`；Native Host 只接受 `STATUS` 和 `START_BACKEND`，不提供任意命令执行。

加载 Chrome 插件：

1. 打开 Chrome `chrome://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目的 `extension` 目录。
5. 打开并登录 `https://www.zhipin.com/`。
6. 首次使用先在 popup 启动后端并选择采集目标队列，再使用“开始岗位信息采集 / 暂停 / 重试”。
7. 打开“Boss Find 工作台”，可新建产品、算法等意向队列，并依次处理“完整 JD / 岗位筛选 / 定制简历 / 人工联系与投递”。
8. 在“个人经历”上传简历、与 ProfileAgent 多轮对话、确认画像修改并生成版本化职业上下文；后端和模型配置位于“设置”。

开发检查：

```powershell
npm run check
npm run test:baseline
npm run m13:sqlite-migrations:smoke
npm run test:ci
```

M7 简历生成、审核和本地审批 smoke：

```powershell
npm run m7:resume-audit:smoke
npm run m7:options-detail:smoke
npm run m7:resume-approval:smoke
```

M8/M9 BOSS 执行动作 dry-run smoke：

```powershell
npm run m8:greeting-dry-run:smoke
npm run m8:extension-send-greeting:smoke
npm run m8:read-only-conversation:smoke
npm run m9:upload-resume-dry-run:smoke
npm run m9:submit-application-dry-run:smoke
npm run m9:submission-readiness:smoke
npm run m9:submission-readiness-queue:smoke
npm run m9:submission-readiness-review:smoke
```

M10 LangGraph 简历闭环 smoke：

```powershell
npm run m10:langgraph-resume:smoke
npm run m10:options-resume-workflow:smoke
```

该 smoke 默认使用内置匿名样本，在临时 SQLite 中跑通 `ScreeningAgent -> ResumeAgent -> ResumeFitEvaluator -> ClaimVerifier -> ResumeRevisionAgent -> ResumeFitEvaluator -> ClaimVerifier -> AuditAgent`，并生成本地 DOCX。需要用私有样本验证时，可通过 `BOSS_FIND_SAMPLE_CAREER_CONTEXT`、`BOSS_FIND_SAMPLE_REFERENCE_DOCX`、`BOSS_FIND_SAMPLE_PHOTO` 等环境变量传入本机文件；这些文件不会进入 git。所有处理保持本地执行，不上传外部服务。

M11 简历模板 smoke：

```powershell
npm run m11:resume-template:smoke
npm run m11:render-qa:smoke
npm run m11:execution-package:smoke
```

默认模板 `resume-to-word-campus-product-v1` 采用“页眉 -> 教育经历 -> 项目经历 -> 奖项与证书”的顺序，不单独输出 `求职摘要` 和 `技能` 标题；技能会进入项目能力行或项目 bullet。旧模板 `boss-find-fixed-docx-v1` 仍保留用于兼容和对比。
`m11:render-qa:smoke` 会验证默认模板和旧模板的 DOCX 均可抽取文本，坏顺序或默认模板下的独立技能标题会被 QA 检出，AuditAgent 会把 QA 硬失败转成 `Render QA:` 风险并阻断自动通过。

M1 POC 报告：

```powershell
npm run poc:firecrawl:report
npm run poc:local:report
npm run poc:extension:report
```

## 后端接口

健康检查：

```http
GET /health
```

同步岗位：

```http
POST /api/jobs/sync
Content-Type: application/json
Authorization: Bearer <optional-token>
```

查看结果：

```http
GET /api/jobs
GET /api/jobs.csv
GET /api/stats
GET /api/profile
PUT /api/profile
GET /api/profile/resume-sources
POST /api/profile/resume-sources
POST /api/profile/resume-sources/extract
POST /api/profile/resume-sources/:id/drafts
GET /api/profile/fact-drafts
GET /api/profile/fact-drafts/:id
POST /api/profile/fact-drafts/:id/confirm
POST /api/profile/fact-drafts/:id/reject
GET /api/profile/experiences
POST /api/profile/experiences
GET /api/profile/skills
POST /api/profile/skills
GET /api/profile/constraints
POST /api/profile/constraints
GET /api/quality
GET /api/events
GET /api/applications
GET /api/application-queues
POST /api/application-queues
DELETE /api/application-queues/:id
POST /api/application-queues/:queueId/applications/:applicationId/trust
POST /api/applications/:id/manual-status
GET /api/application-events
POST /api/applications/:id/transition
POST /api/applications/:id/screen
POST /api/applications/:id/resume-workflow-graph
POST /api/applications/screen-batch
GET /api/screening-candidates
GET /api/screenings
GET /api/agent-runs
GET /api/agent-quality
GET /api/agent-evaluations
GET /api/agent-shadow-runs
POST /api/agent-shadow-runs
GET /api/agent-shadow-runs/:id
POST /api/agent-shadow-items/:id/reviews
GET /api/agent-shadow-failures
GET /api/resume-candidates
POST /api/applications/:id/prepare-resume
GET /api/resume-versions
GET /api/resume-versions/:id
POST /api/resume-versions/:id/audit
GET /api/resume-audits
GET /api/resume-audits/:id
GET /api/browser-tasks
POST /api/browser-tasks
POST /api/browser-tasks/claim
POST /api/browser-tasks/cancel
POST /api/browser-tasks/requeue
GET /api/browser-tasks/diagnostics
GET /api/browser-tasks/:id
POST /api/browser-tasks/:id/transition
GET /api/applications/:id/execution-package
POST /api/applications/:id/execution-package
POST /api/applications/:id/execution-package/review
GET /api/applications/:id/execution-checklist
POST /api/applications/:id/execution-checklist
GET /api/applications/:id/submission-evidence
POST /api/applications/:id/submission-evidence
GET /api/jobs/keys
GET /api/jobs/missing-descriptions
GET /api/model-config
PUT /api/model-config
POST /api/model-config/test
```

扩展 popup 只保留后端状态、目标队列、开始岗位信息采集、暂停、重试以及完整岗位/待补 JD/失败数。options 页默认是四阶段岗位工作台；ProfileAgent 位于“个人经历”，后端和模型配置位于“设置”，最近异常与 workflow 日志默认折叠。旧简历实验工具、真实动作授权和 Shadow 评审保留在隐藏兼容区，不面向普通用户。

M5.1 已建立用户画像与真实经历库的后端基础：`GET/PUT /api/profile` 维护用户目标和摘要；`/api/profile/resume-sources` 保存原始简历文本；`/api/profile/experiences`、`/api/profile/skills`、`/api/profile/constraints` 保存经历事实、技能证据和简历改写边界。

M5.2 已新增简历文件文本抽取入口：`POST /api/profile/resume-sources/extract` 接收 `{ "fileName": "resume.docx", "contentBase64": "..." }`，支持 `.docx`、`.pdf`、`.txt`、`.md`，抽取出的原始文本会直接保存到 `resume_sources`。DOCX 使用 `mammoth`，PDF 使用 `unpdf`；当前只做文本抽取和入库，不自动把内容写入真实经历库，后续由 ProfileAgent 追问/确认后再结构化为 experiences、skills 和 constraints。

M5.3 已新增待确认事实草稿层：`POST /api/profile/resume-sources/:id/drafts` 会从某条简历原文生成 `profile_fact_drafts`，类型包括 `experience`、`skill`、`question`。草稿默认 `PENDING`，不会被 ResumeAgent 当成事实使用；用户或后续 ProfileAgent 确认后，`POST /api/profile/fact-drafts/:id/confirm` 才会把 experience/skill 写入正式经历库；`reject` 会保留拒绝记录，便于复盘。

M10.2a 已补充 `career-retrospective-to-job` 项目内 skill：它不是直接写简历，而是指导 ProfileAgent 在用户上传简历和补充对话后沉淀 `career_agent_context.md`，包含职业定位、项目素材库、技能边界、待确认问题、不同岗位简历策略和简历高压线。该上下文只能生成 `PENDING` 草稿或追问项，不能绕过确认流程直接写入正式经历库，也不能被 ResumeAgent 当成已确认事实。

M10.2d 已落地 ProfileAgent 职业上下文生成入口：`POST /api/profile/career-context` 会读取当前 profile、resume_sources、confirmed experiences/skills/constraints 和 `PENDING profile_fact_drafts`，生成正常中文的 `career_agent_context.md`，默认写入 `server/data/career_context/career_agent_context.md`；`GET /api/profile/career-context` 可读取最近一次生成结果。该步骤会写 `agent_runs` 和 `workflow_events`，有待追问问题时会以 warning 形式进入 `workflow-errors` 方便纠错；它不会确认 PENDING 草稿，不会推进 application 状态，也不会创建任何 BOSS browser task。

M10.2b 已补充后端观测和纠错基础：SQLite schema v8 新增 `workflow_events`，`agent_runs`、`browser_tasks`、批量筛选和 `WorkflowOrchestrator` 会写入持久化进度/失败事件。后端新增 `GET /api/applications/:id/timeline`、`GET /api/workflow-events`、`GET /api/workflow-errors` 和 `POST /api/workflow-errors/:id/resolve`，用于查看执行进度、聚合错误、记录人工纠正结果。该层只记录和复盘执行，不创建真实 BOSS 动作。

M10.2c 已把观测层接入 Chrome Extension 设置页：`Workflow progress` 面板会读取未解决 workflow errors、最近 workflow events，并可按 application 查看合并 timeline。错误项支持显式标记 `RESOLVED` 或 `IGNORED`；这个操作只更新 workflow event 的 resolution 字段，不会自动重试 browser task、重跑 agent、推进 application 状态或创建任何真实 BOSS 动作。

M10.3a 已新增 `ResumeFitEvaluator`：在 `ResumeAgent` 生成岗位版简历后，后端可调用 `POST /api/resume-versions/:id/evaluate-fit` 抽取 JD 要求、评估简历覆盖度、记录缺口和修改建议，并写入 SQLite schema v9 的 `resume_fit_evaluations`。该节点会写 `agent_runs` 和 `workflow_events`，`WorkflowOrchestrator` 已把它放在 `RESUME_DRAFT` 与 `RESUME_AUDIT` 之间。评估不会推进 application 状态，不会创建 browser task，也不会触发打招呼、上传或投递。

M10.3b 已新增 `ClaimVerifier`：在 JD fit 之后、AuditAgent 之前，后端可调用 `POST /api/resume-versions/:id/verify-claims` 将简历字段拆成 claim，并用本地 `sourceMapping`、已确认经历和技能做证据校验。结果写入 SQLite schema v10 的 `resume_claim_verifications`，并记录 `agent_runs` 和 `workflow_events`。Chrome Extension 设置页可运行 `Verify claims` 并查看 unsupported / weak / needs confirmation 项；该动作仍然只读本地证据，不推进 application 状态，不创建 browser task，不触发 BOSS 页面动作。

M10.3c 已新增 `ResumeRevisionAgent`：在 `ResumeFitEvaluator` 和 `ClaimVerifier` 之后，后端可调用 `POST /api/resume-versions/:id/revise-from-checks` 基于 JD 缺口和 claim 问题生成新的本地 `resume_versions`。修订只允许使用已确认 profile facts、skills 和原有 `sourceMapping`，会移除 unsupported claims、降调 weak/needs confirmation 表达，并把安全可用的证据重新显性化。它不会覆盖旧版本，不推进 application 状态，不创建 browser task，也不会触发任何 BOSS 页面动作；新版本必须重新跑 fit、claim 和 audit。

M10.4 已新增 `ResumeWorkflowGraph`：后端可调用 `POST /api/applications/:id/resume-workflow-graph`，在一个 LangGraph 本地图中串联 `ScreeningAgent -> ResumeAgent -> ResumeFitEvaluator -> ClaimVerifier -> ResumeRevisionAgent -> 重新评估/校验 -> AuditAgent`。每个图节点都会写入 `workflow_events`，每个业务 agent 仍写入 `agent_runs` 和各自结果表。Graph 只操作本地数据和 DOCX 文件，不创建 browser task，不触发打招呼、上传或投递；`NEEDS_USER_CONFIRMATION` 会进入 audit 风险记录，`UNSUPPORTED` claim 则必须先修订或停止。

M11.1 已新增 `resume-template-registry`：默认 DOCX 输出改为 `resume-to-word-campus-product-v1`，并在 `renderMetadata` 中记录模板 key、模板 skill、章节顺序和摘要/技能段开关。该模板遵守 `.agents/skills/resume-to-word/SKILL.md`：学历优先，实习与项目优先，不默认输出独立求职摘要、核心匹配点、技能关键词或补充经历。旧的 `boss-find-fixed-docx-v1` 仍可通过 `renderOptions.templateName` 指定。后端 `GET /api/resume-templates` 返回 registry 中可用模板；扩展设置页的 DOCX template 选择器启动时会从该接口加载模板，选择会保存到扩展设置，并把选择值传给“规则生成简历”和 `一键跑简历闭环`，生成后的简历详情会展示实际模板元数据。

M11.2 已新增 `resume-render-qa`：`DocumentRenderer` 写出 DOCX 后立即抽取文本并生成 `renderQuality`，包括 `checks`、`blockingChecks`、`warnings`、抽取到的章节标题、估算页数和模板 key。只有 DOCX 不可抽取、模板元数据缺失、有内容章节标题缺失、章节顺序错误、默认模板错误渲染独立摘要/技能标题、页数超限或标题疑似乱码会成为硬失败；缺少非渲染级内容会保留为告警，不会误拦截可用 DOCX。`renderQuality` 随简历版本入库并在设置页详情中显示，AuditAgent 会把硬失败写入风险项并阻断审核通过。

M11.3 已新增本地执行包闭环：`ExecutionPackageService` 读取现有 workflow snapshot，只有在本地审批、打招呼草稿、SEND_GREETING dry-run、UPLOAD_RESUME dry-run、SUBMIT_APPLICATION dry-run、`READY_FOR_MANUAL_REVIEW` 和 `APPROVED_FOR_MANUAL_EXECUTION` 都齐备时才返回 `READY_FOR_MANUAL_EXECUTION`。执行包会列出 `blockers`、`manualSteps`、DOCX 路径、render QA、greeting message、dry-run evidence 和被锁死的真实动作；扩展设置页可点击 `Prepare execution package` 查看结果。POST 会在后端数据目录下写入 `execution_packages/*.json` 和 `execution_packages/*.md` 归档路径，并把路径写入 workflow event metadata。该步骤不创建真实浏览器任务，不把 application 改为 `SUBMITTED`。

M11.4 extends this with a review gate. `validateExecutionPackage` checks the safety contract, required ready-package evidence, blocked real actions, and archive file existence. `POST /api/applications/:id/execution-package/review` records `APPROVED_FOR_MANUAL_EXECUTION`, `REFRESH_REQUIRED`, or `BLOCKED` as `EXECUTION_PACKAGE_REVIEWED`; approval is blocked if validation fails. This remains local review only and still does not create browser tasks, change application status, upload files, send greetings, or submit applications.

M11.5 extends the approved package with a local manual checklist ledger. `GET /api/applications/:id/execution-checklist` returns package review state, manual steps, recorded step decisions, and progress. `POST /api/applications/:id/execution-checklist` records a package-derived step as `DONE`, `SKIPPED`, `FAILED`, `BLOCKED`, or `NEEDS_REFRESH` in `workflow_events`. This is evidence bookkeeping only: it does not click BOSS, upload files, submit applications, create browser tasks, advance application status, or mark anything as submitted.

M6.1 已新增 ScreeningAgent 最小闭环：`POST /api/applications/:id/screen` 会读取完整 JD、已确认的经历/技能/约束和用户目标，生成结构化岗位评分并写入 `screenings`，同时记录 `agent_runs`。默认 `mode:auto`：如果 `gpt5.5.txt` 或环境变量提供了 OpenAI-compatible 配置，会尝试 LLM 评分；模型不可用时降级为规则评分并在 agent run 中留痕。显式 `mode:llm` 不会静默降级，配置或请求失败会记录失败并把 application 推进到 `NEEDS_USER_REVIEW`。`mode:rules` 可用于稳定本地烟测。当前 ScreeningAgent 只推进 `SCORED`、`SHORTLISTED`、`SKIPPED` 或 `NEEDS_USER_REVIEW`，不会触发简历生成、打招呼或投递。

M6.3 已新增 JD 风险门禁：在岗位适配评分前，`JobRiskGate` 会先读取用户排斥方向。可通过 `POST /api/profile/constraints` 写入 `{ "ruleType": "excluded_direction", "content": "销售", "severity": "blocker" }`，也可在筛选请求中临时传 `userRules.excludedDirections`。命中销售、直播等高风险方向时，系统直接生成 `provider: "risk_gate"`、`recommendation: "skip"`、`matchScore: 0`、`riskScore: 100` 的 screening，并把 application 推进到 `SKIPPED`，不会再计算岗位适配分或调用 LLM。

M6.2 已新增批量筛选入口：`GET /api/screening-candidates` 默认返回 `DETAIL_CAPTURED`、JD 长度达标且尚未筛选的 application；`POST /api/applications/screen-batch` 会按顺序筛选一批候选或指定 `applicationIds`。批量接口默认 `mode:rules`，避免无意中批量调用模型；如需模型评分必须显式传 `mode:auto` 或 `mode:llm`。批量执行仍只写 `agent_runs`、`screenings` 和 application 状态，不会触发任何 BOSS 页面动作。

M6.3 已把筛选结果查看接入扩展设置详细页：可查看待筛选候选、最近筛选结果和最近 Agent 运行记录，也可以手动触发一次“规则批量筛选”。设置页还可以开启 JD 风险门禁、填写“销售、直播”等排斥方向，并点击“按新风险规则重筛”；该按钮走 `riskGateOnly` 批量接口，只在命中排斥方向时新增 `risk_gate/skip` 结果并跳过岗位，未命中的岗位不会被重新计算适配分或改写原状态。扩展侧按钮固定走 `mode:rules`，不会默认批量调用 LLM，也不会持有模型 API Key；模型配置仍只属于后端。

M7.1 已新增 ResumeAgent / AuditAgent 最小闭环：`POST /api/applications/:id/prepare-resume` 会基于已确认经历库、技能库、最新筛选结果和当前 JD 生成岗位版结构化简历，写入 `resume_versions`，并默认用已有 MIT `docx` 依赖渲染本地 DOCX 到 `server/data/generated_resumes/`。`POST /api/resume-versions/:id/audit` 会用独立 AuditAgent 检查 source mapping、unsupported claims、页数估算和岗位匹配风险，写入 `resume_audits`。审核通过只推进到 `RESUME_AUDITED`，不会触发打招呼、上传或投递。

M7.2 已把简历定制与审核接入扩展设置详细页：`GET /api/resume-candidates` 默认返回已 shortlist、最新筛选建议为 `auto_prepare` 且尚未生成简历版本的 application；设置页可以查看可定制候选、最近简历版本和最近审核记录，并手动触发“规则生成简历”和“规则审核草稿”。扩展侧固定使用 `mode:rules`，生成本地 DOCX 后只写入后端数据库；不会持有模型 API Key，也不会创建打招呼、上传或投递任务。

M7.3 已在扩展设置详细页补上简历详情查看：点击最近简历版本可读取完整 `resume_fields`、`diff_summary`、`source_mapping` 和最新审核摘要；点击审核记录可查看真实性、格式、页数、夸大风险、证据问题和 unsupported claims。这个阶段只做本地查看与诊断，不提供简历内容编辑、审批通过按钮，也不会进入 BOSS 打招呼或投递。

M8.2 已新增 MessageAgent 与页面侧 dry-run 最小闭环：`POST /api/applications/:id/prepare-greeting` 只接受已审核通过且已本地审批的简历版本，生成一条 BOSS 打招呼草稿，写入 `conversations/messages`，并创建 `SEND_GREETING` dry-run browser task。扩展设置详细页可以查看最近草稿和 dry-run 任务，也可以手动生成下一条草稿；`Run SEND_GREETING dry-run` 会在已打开的 BOSS 页面领取任务、校验当前岗位、尝试填入聊天输入框并高亮输入框/发送按钮。它不会点击发送，application 仍停在 `GREETING_READY`，后续真实发送必须由 BrowserExecutor 明确回写。

M8.3 已新增只读沟通状态刷新：`GET /api/conversations` 可查看最近会话状态；扩展设置详细页可排队并运行 `REFRESH_CONVERSATION` 和 `CHECK_RESUME_UNLOCK`。content script 只读取当前页面 DOM、检测登录/安全验证/页面不匹配并回写结构化结果；若明确读到已进入聊天或简历入口已解锁，后端可把 application 推进到 `CHAT_OPENED` 或 `RESUME_UNLOCKED`。这一阶段不会推进到 `SUBMISSION_READY`，也不会创建 `UPLOAD_RESUME` 或 `SUBMIT_APPLICATION`。

M8.4 在 M8.3 基础上把只读刷新读到的 `conversation.recentMessages/messages` 归档进 `messages` 表，channel 为 `boss_chat`、status 为 `CAPTURED`，并按方向、文本和页面时间戳去重。它用于后续判断沟通上下文，不代表完整聊天记录，也不会触发真实投递动作。

M8.5 在 M8.4 基础上新增确定性沟通状态判定：后端会基于归档消息和只读页面信号生成 `communicationAssessment`，当前状态包括 `RESUME_REQUESTED`、`RECRUITER_REPLIED`、`WAITING_FOR_REPLY`、`CHAT_OPENED_NO_MESSAGES` 和 `CONVERSATION_UNKNOWN`。该结果写入 `conversations.metadata`，供后续投递前判断使用；它本身不会创建上传或投递任务。

M8.6 基于 `communicationAssessment` 新增 `nextActionRecommendation`，当前建议包括 `PREPARE_RESUME_UPLOAD_DRY_RUN`、`REVIEW_RECRUITER_REPLY`、`WAIT_FOR_REPLY`、`REFRESH_CONVERSATION_LATER` 和 `REFRESH_CONVERSATION`。建议结果只写入 `conversations.metadata` 并在扩展设置页展示，不会创建 `UPLOAD_RESUME` 或 `SUBMIT_APPLICATION` 任务。

M9.1 新增 `UPLOAD_RESUME` dry-run：扩展设置页可排队并运行上传入口诊断，content script 只检查当前页面是否存在可用的简历上传/选择入口、`input[type=file]`、accept 类型和候选按钮。结果写入 browser task、application event 和 `conversations.metadata.lastUploadDryRun`；不会点击按钮、不会选择本地文件、不会上传、不会投递。

M9.2 新增 `SUBMIT_APPLICATION` dry-run：扩展设置页可排队并通过同一个 `Run read-only BOSS task` 入口运行投递入口诊断。content script 只检查当前页面是否存在可用投递/确认候选、锁定信号和确认弹窗线索；结果写入 browser task、`SUBMIT_APPLICATION_DRY_RUN` application event 和 `conversations.metadata.lastSubmitDryRun`。它不会点击投递、不会确认弹窗、不会上传、不会把 application 推进到 `SUBMISSION_READY` 或 `SUBMITTED`。

M9.3 新增本地投递准备度 gate：后端会把 `lastUploadDryRun` 和 `lastSubmitDryRun` 合并评估为 `conversations.metadata.submissionReadiness`，状态包括 `READY_FOR_MANUAL_REVIEW`、`INSUFFICIENT_EVIDENCE` 和 `BLOCKED`，并写入 `SUBMISSION_READINESS_ASSESSED` application event。扩展设置页会展示准备度和下一步建议；该 gate 只用于复核和后续 POC，不创建真实上传/投递任务，也不推进 application 状态。

M9.4 新增投递准备复核队列：`GET /api/submission-readiness` 会从 conversations metadata 派生待复核列表，支持按 `READY_FOR_MANUAL_REVIEW`、`INSUFFICIENT_EVIDENCE`、`BLOCKED` 或 `ALL` 过滤。扩展设置页会展示最近的投递准备复核项，包含岗位、公司、application 状态、准备度和下一步建议；它仍然只是本地复核入口，不创建真实任务。

M9.5 新增本地复核决策：`POST /api/submission-readiness/:applicationId/review` 可写入 `APPROVED_FOR_MANUAL_EXECUTION`、`REFRESH_REQUIRED` 或 `BLOCKED` 决策。结果保存到 `conversations.metadata.submissionReadinessReview`，并写入 `SUBMISSION_READINESS_REVIEWED` application event。扩展设置页可在复核队列中点击“本地复核通过 / 需要刷新 / 阻断”；这些动作只记录本地审计，不创建真实浏览器任务，也不推进状态。

`GET /api/jobs/missing-descriptions` 会按当前队列返回 description 低于阈值的岗位。它不会自动跨页面打开历史岗位；用户可在 popup 或诊断区一次确认后把这些成员从当前队列软移除，其他队列和全局岗位/历史数据不受影响。
`GET /api/jobs/keys?described=1` 会返回后端已入库且已有可用 JD 的岗位 key。扩展启动“自动补齐描述”前会把这组 key 与本地扩展缓存合并，避免 BOSS 页面刷新后同一批岗位被重复点开；后端 SQLite upsert 仍然作为最终去重兜底。
`GET /api/applications`、`GET /api/application-events` 和 `POST /api/applications/:id/transition` 是 M4 工作流状态机的最小基座。岗位入库后会自动创建 application；仅列表采集时状态为 `LIST_CAPTURED`，补齐 JD 后推进到 `DETAIL_CAPTURED`。后续 Agent 和浏览器任务应通过 transition API 推进到 `SCORED`、`SHORTLISTED`、`NEEDS_USER_REVIEW` 等状态，而不是直接改表。
`GET /api/browser-tasks`、`POST /api/browser-tasks`、`POST /api/browser-tasks/claim`、`GET /api/browser-tasks/diagnostics`、`GET /api/browser-tasks/:id` 和 `POST /api/browser-tasks/:id/transition` 是浏览器执行器任务队列的最小 API。当前支持的任务类型包括 `CAPTURE_DETAIL`、`SEND_GREETING`、`REFRESH_CONVERSATION`、`CHECK_RESUME_UNLOCK`、`UPLOAD_RESUME`、`SUBMIT_APPLICATION`；任务状态为 `QUEUED`、`RUNNING`、`SUCCEEDED`、`FAILED`、`CANCELED`。这一层只记录“要浏览器做什么”和执行结果，不会在后端绕过 BOSS 登录态或直接调用 BOSS 私有接口。
`GET /api/browser-tasks` 和 `GET /api/browser-tasks/diagnostics` 支持 `sourceUrl/pageUrl` 过滤，用于区分全局任务队列和最近 BOSS 页面队列。`POST /api/browser-tasks/cancel` 可显式取消当前页待处理/执行中任务，`POST /api/browser-tasks/requeue` 可把当前页失败/取消任务恢复为 `QUEUED`；两者都只改变任务状态，不删除历史记录。
扩展 popup 里的“开始岗位信息采集”会先采集并同步当前已加载岗位，随后为当前页缺 JD 岗位入队，再连续处理当前页匹配的 `CAPTURE_DETAIL` 任务。完整岗位信息会直接同步到后端；它不会把数据库里所有缺 JD 的历史岗位都塞进任务队列。BOSS 页面滚动/刷新后加载到更多岗位，再点击开始或重试生成下一批更稳。
“暂停”用于停止正在运行的页面自动补齐；“重试”会优先恢复最近 BOSS 页面的失败/取消 `CAPTURE_DETAIL` 任务并继续处理，如果没有可恢复任务，再重新走当前页采集、同步、入队和当前页队列处理。`SEND_GREETING` 当前只允许 dry-run 任务进入队列；`UPLOAD_RESUME`、`SUBMIT_APPLICATION` 当前也只做 dry-run 页面诊断，真实动作尚未自动执行。
M4.5 开始补任务诊断闭环：`CAPTURE_DETAIL` 失败会分类为 `LOGIN_REQUIRED`、`SECURITY_CHECK`、`SELECTOR_CHANGED`、`JOB_NOT_VISIBLE`、`DETAIL_EMPTY`、`TASK_PAGE_MISMATCH` 或 `BROWSER_TASK_FAILED`，并写入 `browser_events`；设置详细页会展示任务队列待处理/执行中/成功/失败统计和最近失败原因。

当前原型数据默认存储在：

```text
server/data/boss_find.sqlite3
```

旧版 JSON 文件 `server/data/jobs.json` 只作为迁移输入保留。

## 安全边界

- 不绕过验证码。
- 不绕过登录。
- 不规避平台风控。
- 不生成虚假简历内容。
- 不默认开启自动投递。
- `SEND_GREETING_REAL` 默认关闭，只允许一个短时授权岗位，每日最多 1 次且不能重排。
- 发送按钮点击后无法通过 DOM 确认时进入人工复核，不自动再点。
- `UPLOAD_RESUME_REAL` 和 `SUBMIT_APPLICATION_REAL` 仍保持阻断。
- 浏览器端不保存 LLM API Key。
- 简历、照片、经历库、投递记录默认应保存在本地。

## 下一步建议

M1-M16.1 的采集、画像、Agent 与质量基线已经形成；M17/M17.1 已完成多队列、Native Host、模型配置、四阶段工作台、画像简历上传和人工投递记录。下一阶段聚焦真实用户主流程验证，不扩展自动打招呼或自动投递：

```text
真实 BOSS 列表采集到队列并检查完整 JD 覆盖
-> 对选定队列运行风险/匹配筛选并人工复核误筛
-> 批量生成定制 DOCX，检查路径、两页限制、Claim 和 Fit 结果
-> 打开岗位页面，由用户人工联系/上传/投递并记录状态
-> 把失败样本回流到 selector、Agent 和 DOCX 固定评测
```

分层质量检查：

```powershell
npm run check
npm run test:baseline
npm run m13:sqlite-migrations:smoke
npm run m13:workflow-inputs:smoke
npm run m13:application-transitions:smoke
npm run m13:agent-evaluation:smoke
npm run m14:real-action:smoke
npm run m14:extension-real-greeting:smoke
npm run m16:real-model-agents:smoke
npm run m16:agent-quality-evaluation:smoke
npm run m16:options-agent-quality:smoke
npm run test:profile
npm run test:agents
npm run test:extension
npm run test:workflow
npm run test:ci
```

M2 验证：

```powershell
npm run m2:sqlite:smoke
npm run poc:extension:report
```

M3 采集质量验证：

```powershell
npm run m3:quality:smoke
npm run m3:popup:smoke
npm run m3:events:smoke
npm run m3:missing:smoke
npm run m3:autocrawl:smoke
npm run m3:keys:smoke
npm run m4:applications:smoke
npm run m4:browser-tasks:smoke
npm run m4:extension-task:smoke
npm run m5:profile:smoke
npm run m5:drafts:smoke
npm run m6:screening:smoke
npm run m6:screening-batch:smoke
npm run m6:options-screening:smoke
npm run m7:resume-audit:smoke
npm run m7:options-resume:smoke
npm run m7:options-detail:smoke
npm run m10:career-skill:smoke
npm run m10:profile-agent:smoke
npm run m10:options-profile-agent:smoke
npm run m10:observability:smoke
npm run m10:options-observability:smoke
npm run m10:resume-fit:smoke
npm run m10:options-resume-fit:smoke
npm run m10:claim-verifier:smoke
npm run m10:options-claim-verifier:smoke
npm run m10:resume-revision:smoke
npm run m10:options-resume-revision:smoke
```

自动补齐描述现在按“可续跑”逻辑执行：再次点击不会从第一个已采集岗位重新开始，而是基于扩展缓存跳过已有 JD 的岗位，并在当前列表没有新目标时向后滚动，等待 BOSS 懒加载更多岗位。弹窗会同步显示自动补齐诊断信息，包括当前可见岗位数、待点击目标数、已跳过数量、滚动次数、最后动作和最后处理岗位，方便判断是 BOSS 懒加载未继续、列表全是已处理岗位，还是详情打开/采集失败。遇到登录失效、验证码/安全验证或疑似选择器漂移时，自动补齐会进入 blocked 状态并暂停，等待用户处理后再重新开始。

当前真实库质量基线：

```text
validJobs: 30
describedJobs: 15
descriptionCoverage: 0.5
requiredFieldCoverage: 1
invalidJobs: 0
```

## M10.1 WorkflowOrchestrator

M10.1 已开始 Agent 编排层，但先不引入真实 BOSS 动作，也不直接上 LangGraph。当前新增的是后端确定性 `WorkflowOrchestrator`：

- `server/src/workflow-orchestrator.js` 会把 application、JD、筛选、简历版本、审计、本地审批、打招呼草稿、会话状态、上传/投递 dry-run、投递准备复核合并成一张可解释计划。
- `GET /api/applications/:id/workflow-plan` 只读返回当前阶段、下一步动作、阻断原因和证据摘要。
- `POST /api/applications/:id/workflow-plan` 仅把计划写入 `agent_runs`，agentName 为 `WorkflowOrchestrator`，不会创建 browser task，也不会推进 application 状态。
- 当前计划显式阻断 `SEND_GREETING_REAL`、`UPLOAD_RESUME_REAL`、`SUBMIT_APPLICATION_REAL`，真实上传/投递仍保持关闭。

验证：

```powershell
npm run m10:workflow-orchestrator:smoke
```

M10 后续重点是把“简历是否符合 JD、是否真实、是否可投递”拆成可测试节点：JDRequirementExtractor、ResumeFitEvaluator、ClaimVerifier、SubmissionPolicyGate。M10.4 已先把简历生成、评估、校验、修订和审核迁入 LangGraph 本地图；投递 readiness 与真实浏览器动作仍保留在后续阶段，不进入图内自动执行。

## M10.2a Career Context Skill

`career-retrospective-to-job` 已作为项目内 skill 落在 `.agents/skills/career-retrospective-to-job/`。它的定位是 ProfileAgent 的上游事实源生成规则：上传简历和补充访谈先沉淀职业上下文，再产出待确认草稿，最后经用户确认进入正式经历库。

验证：

```powershell
npm run m10:career-skill:smoke
```

## M10.2d ProfileAgent Career Context

- `server/src/profile-agent.js` deterministically builds `career_agent_context.md` from resume sources, confirmed profile facts, skills, constraints, pending fact drafts, and optional user answers.
- `POST /api/profile/career-context` runs ProfileAgent, records `agent_runs` / `workflow_events`, and writes the markdown file unless `writeFile:false` is passed.
- `GET /api/profile/career-context` reads the last generated local file and returns backend freshness: `MISSING` before first generation, `FRESH` when the file is reusable for the current profile snapshot, and `STALE` after confirmed profile facts, resume sources, skills, constraints, or fact drafts change.
- Pending fact drafts remain pending. The generated context may list them as `expression-risk`, but it cannot write them into `profile_experiences` or `profile_skills`.
- Open questions are returned in the API response and also visible through workflow errors.

Lifecycle boundary:

- ProfileAgent is an upstream user-profile builder, not a per-job workflow node.
- Run it during first onboarding, resume/material import, user Q&A, fact confirmation/rejection, or target/constraint changes.
- Do not run it for every JD scoring, resume draft, fit evaluation, claim check, or one-click application workflow.
- Per-job agents read the persisted SQLite profile and `career_agent_context.md` snapshot; they do not rediscover the user profile.

Validation:

```powershell
npm run m10:profile-agent:smoke
```

## M10.2e ProfileAgent Settings UI

- Chrome Extension background now proxies `GET_CAREER_CONTEXT` and `GENERATE_CAREER_CONTEXT` to `/api/profile/career-context`.
- The settings page exposes a dedicated `ProfileAgent 画像入口` panel that can read or generate `career_agent_context.md`, show file metadata/freshness, preview the markdown, and list missing questions.
- The same panel now renders missing questions as answer textareas. `带回答重新生成` sends `{ id, answer }` entries back to ProfileAgent, writes a refreshed local markdown file, and removes answered question IDs from the remaining missing-question list.
- The same entry now includes `主动补充或修改画像`: users can add or correct experience, target-role, skill, or risk-constraint material from one place. The input is converted into `PENDING profile_fact_drafts`; nothing enters the formal profile library until the user confirms a draft.
- Generation refreshes workflow logs so `CAREER_CONTEXT_HAS_OPEN_QUESTIONS` warnings stay visible and correctable in `Workflow progress`.
- These answers are context-generation inputs only: the UI does not confirm pending fact drafts, advance applications, create browser tasks, or touch a logged-in BOSS page.

Validation:

```powershell
npm run m10:options-profile-agent:smoke
```

## M10.2f Profile Fact Confirmation

- `POST /api/profile/career-context/fact-drafts` turns ProfileAgent Q&A answers into `PENDING profile_fact_drafts`.
- Answer-derived drafts reuse the existing confirm/reject endpoints: `POST /api/profile/fact-drafts/:id/confirm` and `POST /api/profile/fact-drafts/:id/reject`.
- Target roles and excluded directions become `constraint` drafts, skills become `skill` drafts, and project/experience answers become `experience` drafts.
- The service records `PROFILE_FACT_DRAFTS_GENERATED` workflow events so the generation step is visible in logs and error correction screens.
- No answer is auto-confirmed. Confirming a draft is still the only path into `profile_experiences`, `profile_skills`, or `profile_constraints`.
- This endpoint does not run the resume workflow, create browser tasks, touch a BOSS page, upload files, or submit applications.
- The settings page now exposes `待确认事实草稿`: it can generate drafts from current ProfileAgent answers, list pending drafts, and explicitly confirm/reject each draft without touching a BOSS page.

Validation:

```powershell
npm run m10:profile-facts:smoke
npm run m10:options-profile-facts:smoke
npm run m10:options-profile-facts-ui:smoke
```

## M10.2g Editable Fact Confirmation

- Pending fact drafts in the settings page now render compact edit fields before confirmation.
- Experience drafts can adjust title, role, facts, and skills; skill drafts can adjust name/category/proficiency; constraint drafts can adjust rule type, content, and severity.
- Confirm sends the edited `content` to `POST /api/profile/fact-drafts/:id/confirm`, reusing the existing backend override contract.
- Confirm/reject makes backend freshness return `STALE` until `career_agent_context.md` is regenerated. The settings page consumes this persisted state, so refreshing the extension page does not lose the stale warning.
- The mocked UI smoke now verifies edited content is sent on confirm and that no BOSS/browser task is created.

## M10.2b Observability Hooks

M10.2b adds persistent hooks for progress, logs, and correctable errors:

- `workflow_events` stores agent, browser task, workflow, progress, warning, and error records.
- `GET /api/applications/:id/timeline` merges `workflow_events` with existing application events, agent runs, and browser tasks.
- `GET /api/workflow-events` lists recent persisted hook events.
- `GET /api/workflow-errors` returns unresolved warning/error records.
- `POST /api/workflow-errors/:id/resolve` marks an error as `RESOLVED` or `IGNORED` with a note.
- Chrome Extension settings page shows open workflow errors, recent workflow events, per-application timelines, and manual resolve/ignore actions.

## M10.3a Resume/JD Fit Evaluation

- `server/src/resume-fit-evaluator.js` extracts JD requirements and evaluates whether a resume version covers them.
- `resume_fit_evaluations` stores coverage score, fit level, JD requirements, coverage items, blockers, recommendations, and policy flags.
- `POST /api/resume-versions/:id/evaluate-fit` runs the evaluator and records `agent_runs` / `workflow_events`.
- `GET /api/resume-fit-evaluations` and `GET /api/resume-fit-evaluations/:id` read evaluations.
- `GET /api/stats` now includes `resumeFitEvaluationCount`.
- The workflow plan now includes `RESUME_FIT_EVALUATION` before `RESUME_AUDIT`.
- Chrome Extension settings now shows recent JD fit evaluations, can run `Evaluate JD fit` for the selected/latest resume version, and renders the latest score, blockers, recommendations, and policy in the resume detail panel.
- The settings action only calls the backend evaluator. It does not create browser tasks, click BOSS, upload a resume, submit an application, or advance application status.
- `GET /api/stats` now includes `workflowEventCount` and `openWorkflowErrorCount`.

## M10.3b Claim Verification

- `server/src/claim-verifier.js` extracts resume claims from summary, skills, projects, awards, and project bullets.
- `resume_claim_verifications` stores claim-level status, evidence, unsupported claims, user-confirmation needs, recommendations, and policy flags.
- `POST /api/resume-versions/:id/verify-claims` runs ClaimVerifier and records `agent_runs` / `workflow_events`.
- `GET /api/resume-claim-verifications` and `GET /api/resume-claim-verifications/:id` read verification records.
- `GET /api/stats` now includes `resumeClaimVerificationCount`.
- `WorkflowOrchestrator` now includes `RESUME_CLAIM_VERIFICATION` between `RESUME_FIT_EVALUATION` and `RESUME_AUDIT`.
- Chrome Extension settings shows recent claim checks, can run `Verify claims`, and renders unsupported/confirmation items in the resume detail panel.
- Claim verification does not approve truthfulness for final submission, create browser tasks, click BOSS, upload resumes, submit applications, or advance application status.

## M10.3c Resume Revision From Checks

- `server/src/resume-revision-agent.js` turns the latest fit/claim results into an evidence-bound resume revision.
- `POST /api/resume-versions/:id/revise-from-checks` runs `ResumeRevisionAgent`, records `agent_runs` / `workflow_events`, and creates a new `resume_versions` row.
- The old resume version is preserved. The new version has `generatedBy: "ResumeRevisionAgent"` metadata and points back to the base version and the checks used.
- `WorkflowOrchestrator` now routes `REVISE_RESUME_FOR_JD_FIT` and `REVISE_OR_CONFIRM_RESUME_CLAIMS` to `/revise-from-checks`.
- Chrome Extension settings exposes `Revise from checks` in the resume panel.
- The revision action does not create browser tasks, click BOSS, upload resumes, submit applications, or advance application status.
- New revision versions must be re-evaluated by `ResumeFitEvaluator`, re-verified by `ClaimVerifier`, then audited before local approval.

## M10.4 LangGraph Resume Workflow

M10.4 introduces official `@langchain/langgraph` as a local orchestration dependency:

- `server/src/resume-workflow-graph.js` defines `ResumeWorkflowGraph`.
- `POST /api/applications/:id/resume-workflow-graph` runs the graph from the backend.
- Chrome Extension settings page exposes `一键跑简历闭环` and per-job `一键简历闭环` actions for selected screening/resume candidates.
- The settings page loads DOCX template options from `GET /api/resume-templates`, persists the selected template in extension settings, and uses it for one-click and manual rules resume generation. Resume details show the rendered template key, backing skill, section order, and summary/skills visibility flags.
- The one-click settings action runs `JD 匹配评分 -> 定制简历生成 -> DOCX 输出 -> 适配度评估 -> claim 校验/必要修订 -> 审核` through the backend graph, then refreshes resume diagnostics, workflow errors/events, and the application timeline.
- `DocumentRenderer` supports optional `photoPath` and `referenceDocxPath` render metadata.
- `npm run m10:langgraph-resume:smoke` validates the full sample flow with the user's career context, reference DOCX, and photo.
- The graph records progress and errors in `workflow_events`; the extension entry does not create browser tasks or real BOSS actions.
- The graph does not import or run ProfileAgent. User profile context must already be persisted; if `GET /api/profile/career-context` reports `STALE` or `MISSING`, regenerate the context before batch JD/resume work instead of rerunning ProfileAgent inside each application flow.

## M10.5 Backend Service Structure

The backend now starts splitting orchestration logic out of the large `server.js` route file without changing API contracts:

- `server/src/services/profile-service.js` owns ProfileAgent career-context read/generate behavior, agent run logging, and `CAREER_CONTEXT_*` workflow events.
- `server/src/services/resume-workflow-service.js` owns the `/resume-workflow-graph` payload-to-LangGraph option mapping, including generated DOCX output directory defaults.
- `server/src/server-utils.js` owns shared HTTP/error trace helpers used by routes and services.
- `server.js` remains the native Node HTTP router for now; it delegates ProfileAgent and ResumeWorkflowGraph work to services.
- No new router dependency was introduced. `router`, `find-my-way`, and similar packages were checked, but a focused service split has lower migration cost for the current native HTTP backend.

Validation:

```powershell
npm run m10:backend-structure:smoke
```

## M13.3 Immutable Workflow Inputs

`ResumeWorkflowGraph` no longer re-reads mutable profile/JD rows at every node. Before `load_context`, the backend creates:

- `profile_snapshots`: the complete confirmed profile bundle used by the run.
- a workflow-owned `job_snapshots` row containing the exact JD/job payload.
- `workflow_runs`: run lifecycle, final output, failure details, and replay source.
- `workflow_input_snapshots`: snapshot IDs, application payload, user rules, execution/render options, sanitized model config, `graph_version`, `prompt_version`, `agent_version`, and SHA-256 `input_hash`.

Every Screening, Resume, Fit, Claim, Revision, and Audit `agent_runs` row stores the same `workflow_run_id`, `profile_snapshot_id`, `job_snapshot_id`, and version manifest. Later edits to the live profile or `jobs` row create new snapshot IDs for a new run and do not alter historical input.

APIs:

```http
GET  /api/workflow-runs?applicationId=:applicationId
GET  /api/workflow-runs/:workflowRunId
POST /api/workflow-runs/:workflowRunId/replay
```

Replay runs the current deterministic Agent code in memory against the historical snapshot and compares screening, resume fields, fit, claim, audit, and stop reason with the original output. It does not write screenings/resumes/audits, change application status, create browser tasks, render files, or execute BOSS actions.

Validation:

```powershell
npm run m13:workflow-inputs:smoke
```

## M13.4 Application Transition Invariants

Application status writes are owned by `server/src/services/application-transition-service.js`. Other store methods first persist a business fact such as a screening, resume version, audit, local approval, job sync, or read-only browser result, then request a transition with typed evidence.

Transition rules:

- Illegal graph edges fail before any status or event write.
- Positive states require persisted evidence owned by the same application.
- `job_sync` evidence must reference a capture batch whose snapshot contains the application's job.
- Screening evidence must agree with the target state: `auto_prepare -> SHORTLISTED`, `skip -> SKIPPED`, and `review_needed -> SCORED`.
- Failure evidence with a persisted source must use a recognized source type and reference a failed fact owned by the same application; an approved resume audit cannot be reused as failure evidence.
- `GREETING_SENT`, `SUBMISSION_READY`, and `SUBMITTED` cannot use operator override evidence.
- `application_events.idempotency_key` prevents a repeated callback from writing a second transition event.
- A duplicate terminal browser callback with the same result returns `idempotent: true`; a conflicting result or stale retry claim token returns HTTP 409.
- Browser tasks have `expiresAt`, `attemptCount`, `maxAttempts`, `lastAttemptAt`, and `claimToken`.
- Expired tasks become `FAILED/TASK_EXPIRED` before claim or completion.
- Failed tasks can only be requeued while attempts remain; an expired task requires explicit expiry refresh.

`POST /api/applications/:id/transition` remains an explicit operator/debug surface. Operator override evidence must include `actor`, `rationale`, and an idempotency key; it still cannot assert real send/submission completion.

Validation:

```powershell
npm run m13:application-transitions:smoke
```

## M13.5 Agent Evaluation Baseline

The versioned anonymous dataset at `evaluation/fixtures/m13-agent-evaluation.v1.json` exercises two profiles, nine jobs, two labeled claim probes, and three Audit probes. The runner calls the production rules implementations directly and makes no external model call, SQLite write, DOCX render, or BOSS action.

Run the quality gate and write local reports:

```powershell
npm run agent:evaluate
```

Reports are written to `server/data/agent-evaluation/m13-agent-evaluation-report.json` and `.md`, which remain ignored by Git. They include the dataset SHA-256, graph/prompt/agent versions, providers, thresholds, metrics, per-case outcomes, and failed sample IDs. A metric below its fixture threshold exits nonzero.

Validation:

```powershell
npm run m13:agent-evaluation:smoke
npm run test:agents
```

Validation:

```powershell
npm run m10:observability:smoke
npm run m10:resume-revision:smoke
npm run m10:options-resume-revision:smoke
```
