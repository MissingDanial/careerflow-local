# BOSS 平台层逻辑问题与开发约束

本文记录 JoB_Find 在 BOSS 直聘网页端闭环中已经遇到或明确预期会遇到的平台层问题。它的目的不是罗列 BOSS 内部接口，而是把 BOSS 侧抽象成一个受登录态、页面状态和平台规则约束的 `BossAdapter / BrowserExecutor`，方便后续开发时把 Agent 决策和网页执行解耦。

## 1. BOSS 层定位

BOSS 层只负责两类事情：

1. 读取用户当前浏览器中已经登录、已经渲染的页面信息。
2. 在用户授权或系统任务允许的前提下执行页面动作，例如打开详情、发送打招呼语、检查沟通状态、上传或选择简历、点击投递。

BOSS 层不负责：

- 岗位是否值得投递。
- 简历应该如何修改。
- 是否允许自动投递。
- 生成虚假内容、绕过验证码、绕过登录或规避风控。

这些判断必须属于后端状态机和 Agent 层。

## 1.1 BrowserExecutor 技术选型

当前优先级不是继续扩展数据库或 Agent，而是先验证哪个执行器能稳定承载 BOSS 页面流程：

```text
BrowserExecutor
  |-- ChromeExtensionAdapter BOSS 主执行器
  |-- FirecrawlAdapter       scrape-only 辅助候选
  `-- LocalPlaywrightAdapter 后续文件上传/投递入口实验候选
```

M1 实测后，Chrome Extension 是当前唯一满足真实 BOSS 岗位/JD 获取阈值的主路径。它运行在用户正常登录的浏览器页面内，不依赖 DevTools，也不要求后端持有 BOSS session。

Firecrawl profile 持久化和普通 scrape 能力可用，但 BOSS interact/profile-check 没有证明能稳定承载登录态和页面交互，因此只作为 scrape-only 辅助候选。LocalPlaywright 能打开本地 Edge，但受控 profile 被 BOSS 引导到登录/安全验证；用户完成登录后又出现登录界面失效、浏览器闪烁并自动关闭的现象，因此不作为主执行器推进。

技术选型 POC 的详细计划见 [04_DEVELOPMENT_PLAN.md](04_DEVELOPMENT_PLAN.md)，实际操作手册见 [07_BROWSER_EXECUTOR_POC.md](07_BROWSER_EXECUTOR_POC.md)，Firecrawl 选型记录见 [08_FIRECRAWL_DECISION.md](08_FIRECRAWL_DECISION.md)。

## 2. 当前已知平台逻辑问题

### 2.1 登录态只能由用户浏览器持有

BOSS 页面依赖用户登录态。后端不应该直接持有、复用或转发用户 cookie/session。当前合理路径是 Chrome Extension 内容脚本读取当前页面 DOM，并将结构化结果传给本地后端。

开发影响：

- 后端不能假设自己能直接请求 BOSS 页面或接口。
- BOSS 采集任务必须有浏览器在线且页面处于有效登录态。
- 登录失效、验证码、账号异常必须进入 `needs_manual_action`，不能自动绕过。

### 2.2 搜索条件是批次上下文，不只是岗位字段

用户会先筛选城市、求职类型、关键词、薪资、公司规模、行业等条件。很多条件不一定完整出现在岗位卡片里，但会影响后续解释“为什么采到这批岗位”。

开发影响：

- 每次采集需要保存 `capture_batch`。
- 批次要记录搜索页 URL、页面标题、关键词、城市、岗位类型、筛选条件快照。
- 岗位本身只保存岗位事实；搜索条件作为 `capture_batches.search_context_json` 或类似字段保存。

### 2.3 职位描述通常需要打开详情后才完整

列表页通常只能拿到岗位标题、公司、薪资、城市和部分标签。完整职位描述需要点击某个岗位，使右侧详情或详情页渲染后再读取。

开发影响：

- `jobs` 表不能要求初次采集就有完整 JD。
- 岗位状态需要区分 `LIST_CAPTURED` 与 `DETAIL_CAPTURED`。
- 自动补齐描述应作为显式任务运行，带限速、最大数量、可停止、失败记录。
- 页面结构变化时需要记录 selector diagnostics，而不是静默失败。

### 2.4 当前列表不是完整搜索结果

BOSS 列表可能存在分页、滚动加载、虚拟列表、推荐位、广告位、重复卡片和非岗位入口。

开发影响：

- MVP 只承诺采集“当前已加载列表”。
- 后续如果做翻页/滚动，需要建模为多个 `capture_batch` 或 batch 内多个 page segment。
- 必须做 URL 归一化和重复过滤，尤其是 `securityId`、`ka` 等易变参数。
- 明显非岗位项，例如“职位搜索”“查看更多信息”，要在导入前过滤。

### 2.5 公司信息可能分散在多个页面

公司名、融资阶段、规模、行业、工商信息、招聘者身份等信息可能分散在岗位卡片、详情页、公司页和聊天页。

开发影响：

- 第一版只保存能从列表和详情页稳定拿到的公司字段。
- 公司信息应建独立 `companies` 表，允许后续增量补齐。
- Agent 打分时必须标注公司信息不足带来的不确定性，不能把缺失字段当成负面事实。

### 2.6 已沟通状态会影响投递策略

PRD 中已有“跳过已沟通 HR”的规则。但在 BOSS 上，已沟通状态可能体现在列表标签、按钮状态、聊天入口或历史会话里，不一定在岗位列表里稳定存在。

开发影响：

- `already_contacted` 应作为可空/置信度字段，而不是简单布尔常量。
- 需要保存 HR/Boss 身份线索，例如招聘者名称、职位、头像文本、聊天入口 URL。
- 对已沟通状态不确定的岗位，应进入人工确认或后续会话检查任务。

### 2.7 打招呼后才可能解锁简历投递

BOSS 的求职流程不是“看到岗位 -> 直接投递”。很多场景下需要先打招呼，双方沟通或对方响应后，才允许投递附件简历或进一步操作。

开发影响：

- 投递状态机必须包含沟通阶段。
- `GREETING_READY`、`GREETING_SENT`、`CHAT_OPENED`、`RESUME_UNLOCKED`、`SUBMISSION_READY` 不能合并成一个 `APPLYING`。
- MessageAgent 生成打招呼语后，BrowserExecutor 只是执行和回报结果。
- 是否已解锁投递，需要浏览器侧检测按钮状态、聊天状态或页面提示，并写回后端。
- 当前 M8.2 支持 `SEND_GREETING` dry-run：扩展可在 BOSS 页面校验岗位匹配、定位聊天输入框、填入招呼语并确认发送按钮可见，但不会点击发送。只有后续 BrowserExecutor 明确完成真实发送并回写成功后，才允许推进到 `GREETING_SENT`。
- 当前 M8.3-M9.5 支持 `REFRESH_CONVERSATION` / `CHECK_RESUME_UNLOCK` 只读刷新、`UPLOAD_RESUME` dry-run、`SUBMIT_APPLICATION` dry-run、本地 `submissionReadiness` gate、投递准备复核队列和本地复核决策：扩展只读取当前页面 DOM，若明确看到聊天状态或简历入口，可回写 `CHAT_OPENED` / `RESUME_UNLOCKED`，并把近期聊天快照归档为 `messages` 的 `boss_chat/CAPTURED` 记录。后端会基于归档消息生成 `communicationAssessment`、`nextActionRecommendation` 和 `submissionReadiness`，用于区分对方已回复、要求简历、仍在等待回复、投递准备证据是否齐全。`UPLOAD_RESUME` dry-run 只诊断上传入口和文件 input，不选择文件、不上传、不投递；`SUBMIT_APPLICATION` dry-run 只诊断投递/确认候选、锁定信号和确认弹窗线索，不点击投递、不确认、不提交；`submissionReadiness`、复核队列和本地复核决策只写 metadata/event 或派生列表，不会推进到 `SUBMISSION_READY` 或 `SUBMITTED`。

### 2.8 简历上传/选择不是普通后端 API

本地后端可以生成 DOCX/PDF，但浏览器页面上的文件上传动作受浏览器安全限制。内容脚本通常不能静默把本地任意文件路径塞进文件选择框。用户可能还需要选择 BOSS 在线简历、附件简历或重新上传。

开发影响：

- 简历生成完成不等于可以自动上传。
- MVP 应先采用“生成文件 + 展示路径 + 用户确认/手动选择”的方式。
- 当前 M7.4 的本地审批只表示用户确认某个已审核通过的简历版本可进入下一阶段；它不会上传文件、不会点击投递，也不会创建上传或投递任务。
- 如果未来要自动上传，可能需要评估 Playwright 控制浏览器、Chrome Extension 特定权限、Native Messaging 或人工文件选择流程。
- `resume_versions` 要记录本地文件路径、导出格式和是否已被用户确认用于投递。

### 2.9 投递动作必须可审计、可停止

投递会真实影响用户求职账号和对外沟通。即使 Agent 评分很高，也不能把投递当作普通后台任务静默执行。

开发影响：

- 默认自动投递必须关闭。
- 自动投递只允许在用户明确开启、岗位高匹配低风险、AuditAgent 通过、状态已解锁投递时执行。
- 每次发送打招呼语、上传简历、点击投递都要写入 `browser_events` 和 `application_events`。
- 遇到验证码、登录失效、按钮不可用、页面不匹配时立即暂停任务。
- 从 `RESUME_AUDITED` 到 `GREETING_READY` 可以由本地审批推进；从 `GREETING_READY` 往后的 `GREETING_SENT`、`CHAT_OPENED`、`RESUME_UNLOCKED`、`SUBMISSION_READY` 和 `SUBMITTED` 必须来自明确的 BrowserExecutor 结果或后续人工确认，不能由简历审批或 MessageAgent 草稿隐式推进。

### 2.10 BOSS 页面适配器必须可诊断

BOSS 页面 DOM 可能频繁变化。选择器失败、字段错位、详情未加载、弹窗遮挡等问题都应能被定位。

开发影响：

- 内容脚本应上报 selector counts、页面 URL、页面标题、短文本样本、失败步骤。
- 后端应保留 `browser_events` 或 `adapter_events`。
- 自动任务需要 task id，便于从后端追踪到浏览器动作。
- 不能把 Agent 判断失败和页面动作失败混在一个错误码里。

## 3. 建议状态机

岗位主流程建议至少包含：

```text
DISCOVERED
-> LIST_CAPTURED
-> DETAIL_CAPTURED
-> SCORED
-> SHORTLISTED | SKIPPED | NEEDS_USER_REVIEW
-> RESUME_DRAFTED
-> RESUME_AUDITED
-> GREETING_READY
-> GREETING_SENT
-> CHAT_OPENED
-> RESUME_UNLOCKED
-> SUBMISSION_READY
-> SUBMITTED
```

异常状态：

```text
LOGIN_REQUIRED
CAPTCHA_REQUIRED
SELECTOR_CHANGED
DETAIL_CAPTURE_FAILED
GREETING_FAILED
RESUME_UPLOAD_BLOCKED
SUBMISSION_FAILED
NEEDS_MANUAL_ACTION
```

关键原则：

- BOSS 层负责把页面事实推进到状态机。
- Agent 层负责提出建议和生成内容。
- Approval/Workflow 层负责决定是否允许进入下一动作。

## 4. 建议数据对象

第一版 SQLite 可以先围绕这些对象设计：

- `capture_batches`：一次搜索页采集批次，含搜索上下文。
- `jobs`：岗位最新主记录。
- `job_snapshots`：岗位每次采集快照。
- `companies`：公司主记录，允许后续增量补齐。
- `applications`：岗位投递工作流主记录。
- `conversations`：BOSS 沟通状态、HR/Boss 线索、解锁状态。
- `messages`：打招呼语和聊天内容快照，需注意隐私。
- `browser_tasks`：发送给浏览器执行器的任务。
- `browser_events`：浏览器执行器上报的动作和异常。
- `resume_versions`：针对岗位生成的简历版本。

## 5. 推荐开发顺序

### 阶段 A：岗位资料完整采集

- 采集搜索上下文。
- 采集当前列表岗位。
- 自动打开详情补齐 JD。
- 本地 SQLite 入库。
- 保留 selector diagnostics 和导入质量统计。

### 阶段 B：Agent 筛选和 shortlist

- ScreeningAgent 基于完整 JD、用户规则、公司信息置信度输出评分。
- 不触发任何 BOSS 写动作。
- 用户可以确认 shortlist。

### 阶段 C：简历生成和审核

- ResumeAgent 生成岗位版简历。
- AuditAgent 审核真实性和格式。
- 生成 DOCX/PDF 与 diff。
- 用户确认简历版本；当前实现为本地审批，只推进到 `GREETING_READY`，不创建 BOSS 页面动作任务。

### 阶段 D：打招呼与沟通状态

- MessageAgent 生成打招呼语。
- 当前实现先生成 `SEND_GREETING` dry-run 任务；用户确认后由 BrowserExecutor 发送的能力仍是后续 POC。
- 当前实现可通过 `REFRESH_CONVERSATION` 手动只读刷新沟通状态。
- 当前实现会把 `REFRESH_CONVERSATION` 读到的近期消息快照去重归档，但不保证覆盖完整聊天历史。
- 当前实现会生成 `communicationAssessment`，但这个判定只是策略输入，不是投递授权。
- 当前实现会生成 `nextActionRecommendation`，但建议只用于界面提示和后续 POC，不会自动创建上传或投递任务。
- 当前实现可通过 `CHECK_RESUME_UNLOCK` 手动只读检测是否解锁简历投递。
- 当前实现可通过 `UPLOAD_RESUME` dry-run 手动检测上传入口，但不会选择本地文件或点击上传。
- 当前实现可通过 `SUBMIT_APPLICATION` dry-run 手动检测投递入口和确认弹窗线索，但不会点击投递、确认或提交。
- 当前实现会基于上传/投递 dry-run 证据生成 `submissionReadiness`，但该结论只用于人工复核和后续 POC，不会触发真实动作。
- 当前实现可通过 `GET /api/submission-readiness` 查看投递准备复核队列，但队列项不会自动变成真实上传/投递任务。
- 当前实现可通过 `POST /api/submission-readiness/:applicationId/review` 写入本地复核决策，但决策不会自动触发真实上传、投递或状态推进。

### 阶段 E：投递执行

- `RESUME_UNLOCKED` 后进入 `SUBMISSION_READY`。
- MVP 先人工确认投递。
- 稳定后再允许小范围、可配置、可审计的自动投递。

## 6. 仍需用户确认的问题

后续在你补充 Agent 业务逻辑时，需要一起明确：

1. 求职类型的枚举：实习、校招、社招、兼职、远程等如何定义。
2. 城市和岗位扩展策略：是否允许跨城市、远程岗位、相邻岗位方向。
3. 公司信息优先级：公司规模、融资阶段、行业、外包/培训风险如何影响评分。
4. 打招呼策略：是否每个岗位都生成个性化招呼语，是否需要人工确认。
5. 简历投递方式：BOSS 在线简历、附件简历、PDF/DOCX 上传分别如何处理。
6. 自动动作边界：哪些动作必须人工确认，哪些动作未来可自动执行。
7. 频率限制：每批最大打招呼/投递数量、每日上限、失败后冷却时间。

## M10.1 WorkflowOrchestrator 与 BOSS 边界

M10.1 新增的 `WorkflowOrchestrator` 只属于后端计划层，不属于 BOSS 页面执行层。

它可以做：
- 读取 application、JD、screening、resume version、audit、conversation、browser task、submission readiness 等本地证据。
- 生成阶段状态、下一步建议、阻断原因和证据摘要。
- 把计划写入 `agent_runs` 作为审计记录。

它不能做：
- 不能直接点击 BOSS 页面。
- 不能创建真实打招呼、真实上传、真实投递任务。
- 不能把 `APPROVED_FOR_MANUAL_EXECUTION` 自动转成 `SUBMISSION_READY` 或 `SUBMITTED`。
- 不能绕过 `UPLOAD_RESUME` / `SUBMIT_APPLICATION` dry-run 和本地复核。

因此 M10.1 之后的真实动作边界仍然是：
```text
Agent/WorkflowOrchestrator -> 只产出建议和本地记录
BrowserExecutor/Chrome Extension -> 只执行明确排队的页面任务
Human review -> 决定是否进入任何真实外部动作 POC
```

后续如果实现自动上传或自动投递，必须新增独立 POC、独立开关、独立事件记录和失败恢复策略，不能复用 M10.1 的计划 API 直接执行。
## M10.2b Observability and BOSS boundary

M10.2b adds `workflow_events`, timeline APIs, and an error queue. This is an audit and correction layer, not a BOSS execution layer.

Allowed:

- Record backend agent progress and failures.
- Record browser task queue, claim, success, failure, cancel, and retry events.
- Show a single-application timeline across workflow events, application events, agent runs, and browser tasks.
- Mark an error as `RESOLVED` or `IGNORED` after the user or developer has corrected the cause.

Not allowed:

- Resolving an error must not automatically retry a browser task.
- Resolving an error must not advance application status.
- Timeline or workflow error APIs must not create `SEND_GREETING`, `UPLOAD_RESUME`, or `SUBMIT_APPLICATION` tasks.
- Observability APIs must not bypass Chrome Extension execution, login state, captcha, security checks, or BOSS page restrictions.

The intended correction loop is:

```text
failure recorded
-> inspect timeline / workflow-errors
-> fix selector, login, profile fact, model config, or input data
-> mark event RESOLVED or IGNORED
-> explicitly rerun the safe API or requeue the browser task when appropriate
```

M10.2c exposes this loop in the Chrome Extension settings page through the `Workflow progress` panel. The panel can display open errors, recent workflow events, and a single application's merged timeline, but it remains read/correction-only. `RESOLVED` and `IGNORED` update local observability metadata only; they must not trigger BOSS page clicks, uploads, submissions, browser task retries, or application state advancement.

## M10.3a Resume/JD Fit and BOSS boundary

`ResumeFitEvaluator` is a backend-only evaluation node. It reads the local JD and the local generated resume version, writes `resume_fit_evaluations`, `agent_runs`, and `workflow_events`, and then stops.

M10.3a also exposes this node in the Chrome Extension settings page. `Evaluate JD fit` calls the local backend evaluator through the background script and renders the latest fit score, blockers, recommendations, and policy beside the resume detail. This remains a local evaluation action only.

Allowed:

- Extract JD requirements from locally stored job descriptions.
- Score resume coverage against the JD.
- Produce revision recommendations for missing or weak coverage.
- Let `WorkflowOrchestrator` decide whether the next safe step is resume revision or `AuditAgent`.

Not allowed:

- It must not open or click BOSS pages.
- It must not create `SEND_GREETING`, `UPLOAD_RESUME`, or `SUBMIT_APPLICATION` browser tasks.
- It must not create any browser task from the settings page fit action.
- It must not advance application status.
- It must not mark a resume as truthful, approved, ready to upload, or ready to submit.

## M10.3b Claim Verification and BOSS boundary

`ClaimVerifier` is a backend-only truthfulness/evidence node. It reads the local resume version, source mappings, and confirmed profile facts, writes `resume_claim_verifications`, `agent_runs`, and `workflow_events`, and then stops.

M10.3b also exposes this node in the Chrome Extension settings page. `Verify claims` calls the local backend verifier through the background script and renders unsupported claims, user-confirmation needs, recommendations, and evidence summaries beside the resume detail.

Allowed:

- Extract claims from local resume fields.
- Compare claims against local `sourceMapping`, confirmed experiences, and confirmed skills.
- Mark claims as `SUPPORTED`, `WEAK`, `UNSUPPORTED`, or `NEEDS_USER_CONFIRMATION`.
- Let `WorkflowOrchestrator` decide whether the next safe step is revision/confirmation or `AuditAgent`.

Not allowed:

- It must not use pending profile fact drafts.
- It must not open or click BOSS pages.
- It must not create browser tasks.
- It must not trigger `SEND_GREETING`, `UPLOAD_RESUME`, or `SUBMIT_APPLICATION`.
- It must not advance application status.
- It must not mark final submission readiness.

## M10.3c Resume Revision and BOSS boundary

`ResumeRevisionAgent` is a backend-only local resume versioning node. It reads a base resume version, latest fit evaluation, latest claim verification, and confirmed profile evidence, then creates a new local resume version.

Allowed:

- Create a new `resume_versions` row from the previous local version.
- Remove unsupported claims or soften weak/unconfirmed claims.
- Surface JD-relevant evidence only when it exists in confirmed profile facts or skills.
- Record `agent_runs` and `workflow_events`.
- Let `WorkflowOrchestrator` require fit re-evaluation and claim re-verification for the new version.

Not allowed:

- It must not overwrite the old resume version.
- It must not use pending profile fact drafts.
- It must not open, click, scroll, or inspect BOSS pages.
- It must not create any browser task.
- It must not trigger `SEND_GREETING`, `UPLOAD_RESUME`, or `SUBMIT_APPLICATION`.
- It must not advance application status.
- It must not mark the resume as audited, approved, locally approved, submission-ready, or submitted.

The safe loop after this milestone is:

```text
ResumeFitEvaluator / ClaimVerifier blocks audit
-> ResumeRevisionAgent creates a new local version
-> ResumeFitEvaluator reruns on the new version
-> ClaimVerifier reruns on the new version
-> AuditAgent only after those gates pass
```
