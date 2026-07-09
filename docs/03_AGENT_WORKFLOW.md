# JoB_Find Agent 工作流设计

## 1. Agent 数量与职责

稳定版默认 6 个 Agent：

| Agent | 职责 | 是否可自动执行 | 关键约束 |
|---|---|---:|---|
| ProfileAgent | 与用户对话，补全真实经历库 | 否 | 只记录用户确认过的事实 |
| DiscoveryAgent | 根据目标岗位扩展搜索方向 | 是 | 扩展必须可解释、可关闭 |
| ScreeningAgent | 岗位筛选、匹配评分、风险评分 | 是 | 不能直接决定投递 |
| ResumeAgent | 根据 JD 定制简历 | 是 | 只能使用真实经历库 |
| AuditAgent | 独立审核简历真实性和风险 | 是 | 必须独立于 ResumeAgent |
| MessageAgent | 生成 BOSS 打招呼草稿 | 是 | 只能生成文本和 dry-run 任务 |
| ApprovalAgent | 综合结果决定自动投递、人工确认或跳过 | 是 | 受用户配置和审核结果约束 |

非 Agent 执行模块：

| 模块 | 职责 |
|---|---|
| BrowserExecutor | DOM 读取、上传、点击、异常上报 |
| DocumentRenderer | DOCX/PDF 生成、页数检查、差异文件保存 |
| ApplicationLogger | 数据库记录、事件日志、导出 |

## 2. 总体工作流

```text
User Setup
  -> ProfileAgent
  -> Job Collection
  -> DiscoveryAgent
  -> ScreeningAgent
  -> ResumeAgent
  -> DocumentRenderer
  -> AuditAgent
  -> ApprovalAgent
  -> BrowserExecutor
  -> ApplicationLogger
```

Agent 层不得直接操作 BOSS 页面。所有 BOSS 页面读取、点击、打招呼、上传或投递动作都必须通过 BrowserExecutor 的结构化任务执行，并把结果写回状态机。BOSS 平台层的已知约束见 [06_BOSS_PLATFORM_LOGIC.md](06_BOSS_PLATFORM_LOGIC.md)。

## 3. ProfileAgent

### 3.1 目标

将用户上传的基础简历转为可验证、可复用、可约束的真实经历库。

### 3.2 输入

```json
{
  "resume_text": "...",
  "parsed_resume": {},
  "user_target": {
    "job_types": ["internship", "campus"],
    "cities": [],
    "directions": []
  }
}
```

### 3.3 输出

```json
{
  "profile_summary": "",
  "experience_library": [
    {
      "id": "exp_project_001",
      "type": "project",
      "title": "",
      "facts": [],
      "skills": [],
      "evidence": "",
      "proficiency": "familiar",
      "allowed_rewrites": [],
      "forbidden_claims": []
    }
  ],
  "missing_questions": [],
  "risk_notes": []
}
```

### 3.4 规则

- 不能把用户没有确认过的内容写入事实库。
- 对模糊经历必须追问。
- 技能熟练度要区分：了解、熟悉、熟练、可独立完成。
- 量化成果必须有来源。

### 3.5 Career context skill

M10.2a 新增项目内 skill：`.agents/skills/career-retrospective-to-job/`。

它是 ProfileAgent 的上游规则，不是新的投递 Agent，也不是简历改写 Agent。使用场景是用户上传简历、项目材料或通过对话复盘经历时，先生成或更新 `career_agent_context.md`，再把可疑似事实转成 `PENDING profile_fact_drafts` 或追问项。

执行边界：

- `career_agent_context.md` 可以记录职业定位、项目素材、角色族群、技能边界、简历版本策略和简历高压线。
- 它不能把未确认内容写入 `profile_experiences`、`profile_skills` 或 `profile_constraints`。
- 它不能让 ResumeAgent 直接读取 `PENDING` 草稿作为事实。
- 它必须把“用户自评”“解释/定位”“待确认事实”“禁止声称内容”分开。
- 后续 ResumeAgent 只能使用正式事实库和已确认约束；如需使用上下文中的新材料，必须先走 confirm/reject。

推荐接入顺序：

```text
resume_sources.raw_text / project artifacts / interview answers
-> career-retrospective-to-job
-> career_agent_context.md
-> profile_fact_drafts(PENDING) + missing questions
-> user confirmation
-> confirmed profile facts
-> ScreeningAgent / ResumeAgent / AuditAgent
```

### 3.6 M10.2d ProfileAgent career context

M10.2d adds the first backend ProfileAgent execution slice:

- `server/src/profile-agent.js` builds `career_agent_context.md` from current profile data, resume sources, confirmed experiences/skills/constraints, pending fact drafts, and optional user answers.
- `POST /api/profile/career-context` runs the generation step and writes the local markdown file.
- `GET /api/profile/career-context` reads the last generated file.
- The step records `agent_runs` and `workflow_events`; unresolved missing questions are surfaced as warning workflow errors.

Boundary:

- It does not confirm `PENDING profile_fact_drafts`.
- It does not write new confirmed experiences or skills.
- It does not advance application state.
- It does not create browser tasks or any real BOSS action.

### 3.7 M10.2e ProfileAgent settings UI

M10.2e exposes the backend career-context slice in the Chrome Extension settings page:

- Background proxy messages: `GET_CAREER_CONTEXT` and `GENERATE_CAREER_CONTEXT`.
- Backend endpoints: `GET /api/profile/career-context` and `POST /api/profile/career-context`.
- Settings UI panel: `ProfileAgent 职业经历上下文`.
- Visible data: generated file state, byte size, update time, agent run ID, markdown preview, and missing questions.
- Q&A input: the panel renders missing questions as textareas and can call `GENERATE_CAREER_CONTEXT` with `{ id, answer }` entries.

After generation, the settings page refreshes workflow errors/events. Missing questions should therefore appear both in the ProfileAgent panel and in the `Workflow progress` correction queue.

Answered question IDs are removed from the next missing-question list by ProfileAgent, and the answers are rendered into `career_agent_context.md`. This is only a context-building aid. It is not the same as confirming an experience, skill, metric, or constraint into the formal profile tables.

Boundary remains unchanged:

- No pending fact is confirmed from the extension UI.
- No profile fact table is mutated except through the backend ProfileAgent generation contract.
- No application state transition is executed.
- No `browser_tasks` row is created.
- No BOSS tab, content script, greeting, upload, or submission action is triggered.

## 4. DiscoveryAgent

### 4.1 目标

在用户允许岗位扩展时，生成相邻岗位方向和搜索关键词。

### 4.2 输入

```json
{
  "user_target": {},
  "experience_library": [],
  "search_config": {
    "allow_expansion": true,
    "job_keywords": [],
    "excluded_keywords": []
  }
}
```

### 4.3 输出

```json
{
  "expanded_keywords": [
    {
      "keyword": "数据产品实习",
      "reason": "用户项目经历包含数据分析和产品需求梳理",
      "distance": "near",
      "enabled_by_default": true
    }
  ],
  "excluded_expansions": []
}
```

### 4.4 规则

- 扩展岗位必须与真实经历库有证据连接。
- 用户关闭扩展时不得执行。
- 明显偏离目标方向的扩展必须默认关闭。

## 5. ScreeningAgent

### 5.1 目标

对岗位进行用户排斥方向门禁、硬条件过滤、软条件评分、风险判断。

### 5.2 输入

```json
{
  "job": {
    "title": "",
    "company": "",
    "city": "",
    "salary": "",
    "jd_text": "",
    "already_contacted": false
  },
  "user_rules": {},
  "experience_library": [],
  "profile_constraints": [
    {
      "rule_type": "excluded_direction",
      "content": "销售",
      "severity": "blocker"
    }
  ]
}
```

### 5.3 输出

```json
{
  "match_score": 82,
  "risk_score": 18,
  "recommendation": "auto_prepare",
  "hard_conditions": [
    {
      "name": "city",
      "passed": true,
      "reason": "岗位城市符合用户选择"
    }
  ],
  "matched_points": [],
  "risk_points": [],
  "resume_strategy": [],
  "metadata": {
    "riskGate": {}
  },
  "requires_user_confirmation": false
}
```

### 5.4 推荐值

- `auto_prepare`: 高匹配，进入简历生成。
- `review_needed`: 需要人工确认或补充判断。
- `skip`: 跳过。

### 5.5 规则

- `JobRiskGate` 在匹配评分前运行，读取 `profile_constraints.rule_type = excluded_direction` 和 `user_rules.excludedDirections`。
- 命中高风险排斥方向时直接返回 `recommendation = skip`、`match_score = 0`、`risk_score = 100`，并把命中方向、关键词和 JD 片段写入 `metadata.riskGate`。
- 高风险门禁命中后不再计算岗位适配分，也不进入 LLM 评分。
- 已沟通 HR 默认跳过。
- 启用的硬条件失败时默认跳过。
- ScreeningAgent 不允许直接执行投递。

## 6. ResumeAgent

### 6.1 目标

根据岗位 JD 从真实经历库中选择、重排和改写内容，生成固定模板所需字段。

### 6.2 输入

```json
{
  "job": {},
  "screening": {},
  "experience_library": [],
  "template_schema": {}
}
```

### 6.3 输出

```json
{
  "resume_fields": {
    "summary": "",
    "skills": [],
    "projects": [],
    "education": [],
    "awards": []
  },
  "source_mapping": [
    {
      "resume_field": "projects[0].description",
      "experience_id": "exp_project_001",
      "source_fact": "..."
    }
  ],
  "diff_summary": [],
  "compression_notes": [],
  "unsupported_claims": []
}
```

### 6.4 规则

ResumeAgent 可以：

- 调整项目顺序。
- 改写表达方式。
- 强化与 JD 对应的真实经历。
- 删除或压缩无关内容。
- 生成岗位专属求职摘要。

ResumeAgent 不可以：

- 编造实习。
- 编造项目。
- 编造公司。
- 编造技术栈。
- 编造奖项。
- 编造量化成果。
- 把“了解”改成“精通”。
- 使用 `PENDING` fact draft 作为事实；必须等用户确认写入正式经历库或技能库。

### 6.5 当前实现

M7.1 先实现规则版 ResumeAgent：

- 输入来自 `getApplicationResumeInput`，包含 application、job、最新 screening、正式 profile facts。
- 输出写入 `resume_versions`。
- `source_mapping` 必须指向 `profile_experiences`、`profile_skills` 或 profile 级摘要。
- 默认用 `docx` 生成固定结构 DOCX 文件。
- 只推进 application 到 `RESUME_DRAFTED`。
- M7.2 已在扩展设置详细页接入手动触发入口：候选来自 `GET /api/resume-candidates`，扩展侧固定 `mode:rules` 和 `renderDocx:true`，只生成本地草稿，不触发 BOSS 页面动作。
- M7.3 已在扩展设置详细页接入只读详情面板，展示 `resume_fields`、`diff_summary`、`source_mapping` 和 `unsupported_claims`；查看详情不会改变 application 状态。
- M7.4 已在扩展设置详细页接入受限本地编辑：用户只能改摘要、技能、项目 bullet、奖项和编辑原因；保存会创建新的 `resume_versions` 记录并重新渲染 DOCX，不覆盖旧版本，不允许编辑 source mapping 或新增无证据经历。

## 7. AuditAgent

### 7.1 目标

独立检查 ResumeAgent 输出是否真实、可靠、格式合规、风险可控。

### 7.2 输入

```json
{
  "job": {},
  "experience_library": [],
  "resume_fields": {},
  "source_mapping": [],
  "render_metadata": {
    "page_count": 2
  }
}
```

### 7.3 输出

```json
{
  "truthfulness_passed": true,
  "format_passed": true,
  "page_limit_passed": true,
  "unsupported_claims": [],
  "exaggeration_risk": "low",
  "job_fit_review": "good",
  "risk_score_adjustment": 0,
  "recommendation": "approve"
}
```

### 7.4 规则

- 必须逐条检查 `source_mapping`。
- 发现 unsupported claim 必须阻断自动投递。
- 页数超过 2 页必须退回 ResumeAgent 压缩。
- 中等及以上真实性风险必须要求用户确认。

### 7.5 当前实现

M7.1 先实现规则版 AuditAgent：

- 输入为 `resume_versions` 中的 `resume_fields`、`source_mapping`、`unsupported_claims` 和渲染元数据。
- 输出写入 `resume_audits`。
- `approve` 会把 application 推进到 `RESUME_AUDITED`。
- `revise` 或 `block` 会要求用户复核，不进入打招呼、上传或投递。
- M7.2 已在扩展设置详细页接入手动审核入口：扩展侧固定 `mode:rules`，默认审核最近未审核草稿；审核结果只写入 `resume_audits` 和 application 状态，不创建 `SEND_GREETING`、`UPLOAD_RESUME` 或 `SUBMIT_APPLICATION` 任务。
- M7.3 已在扩展设置详细页接入只读审核详情，展示真实性、格式、页数、夸大风险、证据问题和阻断原因；审批动作仍未开放。
- M7.4 已开放本地审批：只有 `APPROVED` 简历版本可以写入 `metadata.localApproval`，并将 application 最多推进到 `GREETING_READY`；该动作只表示“用户认可此简历可进入打招呼准备”，不会创建真实 BOSS 页面任务。

## 8. ApprovalAgent

### 8.1 目标

根据用户配置、筛选结果、审核结果和投递状态，决定下一步动作。

### 8.2 输入

```json
{
  "config": {
    "auto_apply": false,
    "high_match_threshold": 85,
    "low_risk_threshold": 20
  },
  "job": {},
  "screening": {},
  "audit": {}
}
```

### 8.3 输出

```json
{
  "decision": "wait_user_confirmation",
  "reason": "auto_apply is disabled",
  "allowed_actions": ["approve", "reject", "regenerate_resume"],
  "message_to_user": ""
}
```

### 8.4 决策枚举

- `auto_apply`
- `wait_user_confirmation`
- `skip`
- `regenerate_resume`
- `needs_manual_action`

### 8.5 规则

- 默认不自动投递。
- 用户未开启自动投递时，只能进入人工确认。
- AuditAgent 未通过时不得自动投递。
- 已沟通 HR 不得重复投递。
- 遇到异常必须进入 `needs_manual_action`。
- 当前 M7.4 的 Approval 仍是确定性本地规则：`APPROVED` 简历版本 + 用户点击本地审批，才允许进入 `GREETING_READY`。真实 `SEND_GREETING`、`UPLOAD_RESUME`、`SUBMIT_APPLICATION` 仍属于后续 BrowserExecutor 任务，不由 Agent 直接触发。

### 8.6 当前 MessageAgent 实现

M8.1 先实现规则版 MessageAgent：

- 输入来自 `getApplicationGreetingInput`，包含 application、job、最新 screening、已本地审批的 `APPROVED` resume version 和正式 profile facts。
- 输出写入 `messages`，并确保存在对应 `conversations`。
- 同步创建一个 `SEND_GREETING` browser task，但 payload 固定 `dryRun:true` 和 `requiresUserConfirmation:true`。
- application 不会从 `GREETING_READY` 推进到 `GREETING_SENT`。
- MessageAgent 不读取 BOSS 页面、不填输入框、不点击发送。
- 当前扩展设置详细页可以生成草稿、查看 dry-run 任务，并触发 `SEND_GREETING` 页面侧 dry-run：BrowserExecutor 只做岗位匹配、输入框定位、文本填入和发送按钮可见性诊断，不点击发送。
- dry-run 成功不会把 application 推进到 `GREETING_SENT`；真实发送仍需要后续 BrowserExecutor 切片和明确授权。

M8.3 增加只读状态刷新：

- `REFRESH_CONVERSATION` 由 BrowserExecutor/content script 读取当前 BOSS 页面会话状态、消息数量、HR 名称和页面诊断。
- `CHECK_RESUME_UNLOCK` 由 BrowserExecutor/content script 读取当前页面是否出现可用的简历/投递相关入口。
- 这两个任务只读 DOM，结果写入 `conversations.metadata.lastResult`，并可把 application 推进到 `CHAT_OPENED` 或 `RESUME_UNLOCKED`。
- Agent 不根据草稿或简历审核自行推断解锁；必须依赖 BrowserExecutor 的页面证据或后续人工确认。
- 只读刷新不会推进到 `SUBMISSION_READY`，也不会创建 `UPLOAD_RESUME` 或 `SUBMIT_APPLICATION`。

M8.4 增加只读消息归档：

- `REFRESH_CONVERSATION` 返回的 `conversation.recentMessages` / `conversation.messages` 会归档到 `messages` 表。
- 归档消息固定为 `channel=boss_chat`、`status=CAPTURED`、`provider=browser_executor`。
- 去重键为方向、文本和页面时间戳；没有时间戳时同方向同文本只保留一条。
- 这些消息是页面快照，供后续 MessageAgent/投递解锁判断参考；不得把它当成完整 IM 同步，也不得单独触发上传或投递。

M8.5 增加沟通状态判定：

- 后端基于归档消息和只读页面信号生成 `conversations.metadata.communicationAssessment`。
- 当前规则状态包括 `RESUME_REQUESTED`、`RECRUITER_REPLIED`、`WAITING_FOR_REPLY`、`CHAT_OPENED_NO_MESSAGES`、`CONVERSATION_UNKNOWN`。
- `RESUME_REQUESTED` 可由对方消息中的“发/投/传/请简历”、`resume` 等关键词，或页面简历入口已解锁触发。
- `RECRUITER_REPLIED` 仅表示读到入站消息，不代表可以投递。
- `WAITING_FOR_REPLY` 表示已发出/捕获出站消息但未读到对方回复，后续应等待或人工处理。
- 该判定只服务后续策略，不会触发上传、投递或自动跟进。

M8.6 增加下一步建议：

- 后端基于 `communicationAssessment`、application 当前状态和只读 `resumeUnlock` 生成 `conversations.metadata.nextActionRecommendation`。
- 当前建议包括 `PREPARE_RESUME_UPLOAD_DRY_RUN`、`REVIEW_RECRUITER_REPLY`、`WAIT_FOR_REPLY`、`REFRESH_CONVERSATION_LATER`、`REFRESH_CONVERSATION`。
- `PREPARE_RESUME_UPLOAD_DRY_RUN` 只是建议后续进入上传 dry-run POC，不会创建 `UPLOAD_RESUME` 或 `SUBMIT_APPLICATION`。
- `blockedTaskTypes` 会显式记录仍被禁止的真实动作，防止策略建议被误读为执行授权。

M9.1 增加上传入口 dry-run：

- `UPLOAD_RESUME` 当前只允许作为 dry-run 页面诊断任务。
- BrowserExecutor/content script 只读取上传按钮、简历动作候选和 `input[type=file]` 状态。
- dry-run 结果会记录 `fileSelected:false`、`uploaded:false`、`submitted:false`。
- 该结果可用于判断后续是否值得做 Playwright/Native Messaging 文件选择 POC，但不触发真实上传。

M9.2 增加投递入口 dry-run：

- `SUBMIT_APPLICATION` 当前只允许作为 dry-run 页面诊断任务。
- BrowserExecutor/content script 只读取投递/确认候选、锁定信号、确认弹窗线索和页面匹配状态。
- dry-run 结果会记录 `clickedSubmit:false`、`confirmed:false`、`submitted:false`、`uploaded:false`。
- 结果写入 browser task、`SUBMIT_APPLICATION_DRY_RUN` application event 和 `conversations.metadata.lastSubmitDryRun`，但不会推进到 `SUBMISSION_READY` 或 `SUBMITTED`。

M9.3 增加投递准备度 gate：

- 后端会把 `lastUploadDryRun`、`lastSubmitDryRun`、`communicationAssessment` 和 `resumeUnlock` 合并评估为 `conversations.metadata.submissionReadiness`。
- 当前状态包括 `READY_FOR_MANUAL_REVIEW`、`INSUFFICIENT_EVIDENCE` 和 `BLOCKED`。
- 每次上传/投递 dry-run 成功回写后，后端都会写入 `SUBMISSION_READINESS_ASSESSED` application event。
- 该 gate 只更新 metadata、event 和下一步建议，不创建真实上传/投递任务，不推进到 `SUBMISSION_READY` 或 `SUBMITTED`。

M9.4 增加投递准备复核队列：

- `GET /api/submission-readiness` 从 conversations metadata 派生复核队列，不新增执行任务表。
- 队列支持按 `READY_FOR_MANUAL_REVIEW`、`INSUFFICIENT_EVIDENCE`、`BLOCKED` 或 `ALL` 过滤。
- 扩展设置页展示最近待复核项和下一步建议，帮助人工决定是否继续真实上传/投递 POC。
- 队列只是复核入口，不创建真实上传/投递任务，不推进 application 状态。

M9.5 增加本地复核决策：

- `POST /api/submission-readiness/:applicationId/review` 只写本地复核结论。
- 当前决策包括 `APPROVED_FOR_MANUAL_EXECUTION`、`REFRESH_REQUIRED` 和 `BLOCKED`。
- 结果写入 `conversations.metadata.submissionReadinessReview` 和 `SUBMISSION_READINESS_REVIEWED` application event。
- 这些决策仍不创建真实上传/投递任务，不推进到 `SUBMISSION_READY` 或 `SUBMITTED`。

## 9. Agent 错误处理

### 9.1 错误结构

```json
{
  "code": "SCREENING_AGENT_FAILED",
  "agent": "ScreeningAgent",
  "step": "score_job",
  "message": "LLM request timeout",
  "retryable": true,
  "severity": "error",
  "context": {
    "job_id": "job_001",
    "trace_id": "trace_001"
  }
}
```

### 9.2 常见错误码

| 错误码 | 含义 | 处理 |
|---|---|---|
| `LLM_CONFIG_INVALID` | 模型配置错误 | 提示用户检查配置 |
| `LLM_REQUEST_FAILED` | 模型请求失败 | 重试或进入人工处理 |
| `AGENT_OUTPUT_SCHEMA_INVALID` | Agent 输出不符合 Schema | 自动重试一次，仍失败则记录 |
| `PROFILE_EVIDENCE_MISSING` | 经历库证据不足 | 要求用户补充 |
| `UNSUPPORTED_RESUME_CLAIM` | 简历出现无证据内容 | 阻断自动投递 |
| `RESUME_PAGE_LIMIT_EXCEEDED` | 简历超过 2 页 | 回到 ResumeAgent 压缩 |
| `BROWSER_CAPTCHA_REQUIRED` | 出现验证码 | 暂停，用户处理 |
| `BROWSER_LOGIN_REQUIRED` | 登录失效 | 暂停，用户处理 |
| `BROWSER_SELECTOR_CHANGED` | 页面结构变化 | 记录 DOM 快照或提示更新选择器 |
| `APPLICATION_UPLOAD_FAILED` | 上传简历失败 | 记录并允许重试 |

## 10. Trace 要求

每个 Agent 调用保存：

- agent_name
- step
- input_summary
- output_json
- schema_validation_result
- token_usage 如果模型返回
- latency_ms
- error 如果有
- created_at

敏感字段如 API Key 不得进入 trace。

## 11. MVP Agent 配置

第一版可先实现 4 个 Agent：

```text
ProfileAgent
ScreeningAgent
ResumeAgent
AuditAgent
```

ApprovalAgent 可先用确定性规则实现，后续升级为 Agent。DiscoveryAgent 可先使用配置关键词和简单规则，稳定后再启用 LLM。

## 12. 稳定版 Agent 配置

稳定版启用 6 个 Agent：

```text
ProfileAgent
DiscoveryAgent
ScreeningAgent
ResumeAgent
AuditAgent
ApprovalAgent
```

## 13. 高级版可选 Agent

后续可以新增：

- MessageAgent：生成 BOSS 打招呼语。
- ReviewAgent：复盘投递效果，优化岗位筛选规则。
- TemplateAgent：根据用户经历建议不同简历模板，但 MVP 不启用。

## 14. M10.1 WorkflowOrchestrator

M10.1 新增 `WorkflowOrchestrator`，定位不是新的业务 Agent，而是后端编排计划层。它只读取已有证据并输出下一步，不直接运行 ScreeningAgent/ResumeAgent/AuditAgent，也不创建真实 BOSS 动作。

当前输入来自 `getApplicationWorkflowSnapshot`：
- application 与完整 JD。
- 最新 screening。
- 最新 resume version 与对应 audit。
- 最新 conversation、greeting draft、browser task。
- `conversations.metadata` 里的 `communicationAssessment`、`submissionReadiness` 和 `submissionReadinessReview`。

当前输出包括：
- `stages`: `JOB_READY`、`SCREENING`、`RESUME_DRAFT`、`RESUME_AUDIT`、`LOCAL_APPROVAL`、`GREETING_DRAFT`、`CONVERSATION_REFRESH`、`UPLOAD_DRY_RUN`、`SUBMIT_DRY_RUN`、`SUBMISSION_READINESS`、`LOCAL_READINESS_REVIEW`、`EXECUTION_PACKAGE`。
- `nextAction`: 当前最应该执行的一步。
- `blockedReasons`: 阻断原因。
- `evidenceSummary`: 供 UI 或后续 Agent 解释用的证据摘要。
- `noRealBossAction: true` 与 `noBrowserTaskCreated: true`。

API：
- `GET /api/applications/:id/workflow-plan`: 只读计划。
- `POST /api/applications/:id/workflow-plan`: 把计划写入 `agent_runs`，agentName 为 `WorkflowOrchestrator`，不创建 browser task，不推进状态。

M10.4 已在简历闭环中引入 LangGraph。`WorkflowOrchestrator` 仍保留为“读证据、给下一步建议”的计划层；LangGraph 只负责运行本地 agent 节点，不替代 application 状态机、browser_tasks 或 BOSS 页面 dry-run。

已迁入 LangGraph 的循环：

```text
ScreeningAgent -> ResumeAgent -> ResumeFitEvaluator -> ClaimVerifier -> ResumeRevisionAgent -> re-check -> AuditAgent
```

仍不迁入 LangGraph 的部分：BOSS 打招呼、上传、投递、submission readiness 和真实浏览器动作。这些仍通过 browser_tasks、dry-run 和人工复核边界控制。
## 15. M10.2b Observability Hooks

M10.2b adds a persistent observability layer before introducing heavier graph orchestration:

- `workflow_events` is the durable hook table for progress, warnings, errors, and manual correction notes.
- Agent runs write `AGENT_RUN_STARTED`, `AGENT_RUN_SUCCEEDED`, and `AGENT_RUN_FAILED`.
- Browser tasks write queue, claim, transition, failure, cancel, and requeue events.
- Batch screening writes batch start, item success/failure, and final summary events.
- `WorkflowOrchestrator` writes plan start/success events when a plan is persisted.

APIs:

- `GET /api/applications/:id/timeline`
- `GET /api/workflow-events`
- `GET /api/workflow-errors`
- `POST /api/workflow-errors/:id/resolve`

The timeline intentionally merges `workflow_events` with existing `application_events`, `agent_runs`, and `browser_tasks`, so older records remain inspectable. Error correction is explicit: resolving an error only updates the workflow event resolution fields; it does not retry a browser task, rerun an agent, or advance application status.

Validation:

```powershell
npm run m10:observability:smoke
```

## 16. M10.2c Extension Observability UI

The Chrome Extension settings page now exposes the M10.2b observability layer:

- `Workflow progress` lists open workflow errors and recent workflow events.
- Each event with an `applicationId` can open that application's merged timeline.
- Open errors can be marked `RESOLVED` or `IGNORED`.

This UI is intentionally a correction surface, not an execution surface. Marking an error resolved does not retry a browser task, rerun an agent, advance application state, or create any BOSS action. The user or developer must explicitly rerun the relevant safe API or requeue a browser task after fixing the underlying issue.

Validation:

```powershell
npm run m10:options-observability:smoke
```

## 17. M10.3a ResumeFitEvaluator

M10.3a adds a deterministic `ResumeFitEvaluator` node between resume drafting and resume audit:

```text
ResumeAgent
-> ResumeFitEvaluator
-> AuditAgent
-> local approval
```

Responsibilities:

- Extract JD requirements into skill/responsibility items.
- Compare those requirements against the generated resume fields.
- Persist coverage score, fit level, coverage items, blockers, and revision recommendations.
- Record `agent_runs` and `workflow_events`.

APIs:

- `POST /api/resume-versions/:id/evaluate-fit`
- `GET /api/resume-fit-evaluations`
- `GET /api/resume-fit-evaluations/:id`

Chrome Extension settings page wiring:

- `GET_RESUME_FIT_EVALUATIONS` reads recent fit evaluations through the background backend proxy.
- `EVALUATE_RESUME_FIT` runs `POST /api/resume-versions/:id/evaluate-fit` for the selected/latest resume version.
- The resume detail panel displays score, fit level, blockers, recommendations, coverage items, and policy flags.
- This UI action is backend-only: it does not create browser tasks, send messages, upload resumes, submit applications, or click BOSS.

Boundaries:

- It does not verify truthfulness; `ClaimVerifier` now performs source-backed claim checks after fit evaluation, and `AuditAgent` remains the broader final resume audit.
- It does not advance application status.
- It does not create browser tasks.
- It does not trigger greeting, upload, or submission.

Validation:

```powershell
npm run m10:resume-fit:smoke
npm run m10:options-resume-fit:smoke
```

## 18. M10.3b ClaimVerifier

M10.3b adds a deterministic `ClaimVerifier` node after resume/JD fit and before resume audit:

```text
ResumeAgent
-> ResumeFitEvaluator
-> ClaimVerifier
-> AuditAgent
-> local approval
```

Inputs:

- Latest `resume_versions` record.
- `resumeFields` and `sourceMapping`.
- Confirmed local profile experiences and skills.

Outputs:

- Claim-level records: `SUPPORTED`, `WEAK`, `UNSUPPORTED`, `NEEDS_USER_CONFIRMATION`.
- Summary counts and truthfulness policy.
- Recommendations for removing, sourcing, confirming, or tightening claims.

APIs:

- `POST /api/resume-versions/:id/verify-claims`
- `GET /api/resume-claim-verifications`
- `GET /api/resume-claim-verifications/:id`

Chrome Extension settings page wiring:

- `GET_RESUME_CLAIM_VERIFICATIONS` reads recent claim verification records.
- `VERIFY_RESUME_CLAIMS` runs the backend verifier for the selected/latest resume version.
- The resume detail panel displays unsupported claims, confirmation needs, recommendations, and claim-level evidence summaries.

Boundaries:

- It does not use pending profile fact drafts.
- It does not create browser tasks.
- It does not advance application status.
- It does not trigger greeting, upload, or submission.
- It does not replace user confirmation for high-impact claims.

Validation:

```powershell
npm run m10:claim-verifier:smoke
npm run m10:options-claim-verifier:smoke
```

## 19. M10.3c ResumeRevisionAgent

M10.3c adds a deterministic `ResumeRevisionAgent` after `ResumeFitEvaluator` and `ClaimVerifier`:

```text
ResumeAgent
-> ResumeFitEvaluator
-> ClaimVerifier
-> ResumeRevisionAgent when checks block audit
-> ResumeFitEvaluator again for the new version
-> ClaimVerifier again for the new version
-> AuditAgent
-> local approval
```

Inputs:

- Base `resume_versions` record.
- Latest fit evaluation for that version.
- Latest claim verification for that version.
- Confirmed local profile experiences and skills.

Outputs:

- A new `resume_versions` row, not an overwrite.
- `diffSummary`, `sourceMapping`, `unsupportedClaims`, and metadata linking the revision back to the base version and check ids.
- Workflow event `RESUME_REVISION_PREPARED`.

Rules:

- Remove unsupported claims when no source mapping or confirmed evidence supports them.
- Soften weak or high-impact unconfirmed wording instead of strengthening it.
- Surface missing JD evidence only when it exists in confirmed local profile facts or skills.
- Do not invent new claims, use pending fact drafts, create browser tasks, or change application status.

APIs:

- `POST /api/resume-versions/:id/revise-from-checks`

Chrome Extension settings page wiring:

- `REVISE_RESUME_FROM_CHECKS` runs the backend revision endpoint for the selected/latest resume version.
- `Revise from checks` creates a new local version and opens the new version detail.
- The action is backend-only and cannot click BOSS, upload, submit, or send messages.

Validation:

```powershell
npm run m10:resume-revision:smoke
npm run m10:options-resume-revision:smoke
```

## 20. M10.4 ResumeWorkflowGraph

M10.4 新增 `ResumeWorkflowGraph`，使用官方 `@langchain/langgraph` 在后端本地进程内编排简历闭环。

图节点：

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

节点与已有 agent 的关系：

- `screen_application` 调用 `ScreeningAgent`，写 `screenings` 和 `agent_runs`；其中 `JobRiskGate` 会先排除销售、直播等用户明确不想去的方向。
- `prepare_resume` 调用 `ResumeAgent`，写 `resume_versions` 并可渲染 DOCX。
- `evaluate_fit` 调用 `ResumeFitEvaluator`，写 `resume_fit_evaluations`。
- `verify_claims` 调用 `ClaimVerifier`，写 `resume_claim_verifications`。
- `revise_resume` 调用 `ResumeRevisionAgent`，创建新简历版本，不覆盖旧版本。
- `audit_resume` 调用 `AuditAgent`，写 `resume_audits` 并按既有规则推进到 `RESUME_AUDITED` 或 `NEEDS_USER_REVIEW`。

门禁：

- `UNSUPPORTED` claim 必须先进入 `ResumeRevisionAgent`；超过 `maxRevisions` 后停止，返回 `resume_has_unsupported_claims`。
- `JobRiskGate` 命中高风险排斥方向时，图在 `screen_application` 后直接停止，`stopReason = screening_recommendation_skip`。
- `NEEDS_USER_CONFIRMATION` 不再阻断图进入 `AuditAgent`，但会作为风险和后续人工确认项保留。
- `ResumeFitEvaluator` 的 must-have blocker 仍会阻断 audit，除非修订后消失。
- Graph 不创建 browser task，不发送打招呼，不上传简历，不投递。

观测与错误：

- Graph 启动、完成、失败写入 `RESUME_WORKFLOW_GRAPH_*` workflow events。
- 每个节点启动、成功、失败写入 `RESUME_WORKFLOW_GRAPH_NODE_*` workflow events。
- 每个业务 agent 仍写入自己的 `agent_runs`。
- API 返回 `nodeEvents`、`errors`、`stopReason`、最终 `resumeVersion`、`resumeFitEvaluation`、`resumeClaimVerification`、`resumeAudit` 和 `rendered`。
- Chrome Extension 设置页的 `一键跑简历闭环` / `一键简历闭环` 会刷新 workflow errors/events 和 application timeline，失败节点可从 `Workflow progress` 面板查看并标记处理。

接口：

```http
POST /api/applications/:id/resume-workflow-graph
```

最小请求：

```json
{
  "mode": "rules",
  "maxRevisions": 1,
  "renderDocx": true,
  "renderOptions": {
    "photoPath": "<optional-local-photo-path>",
    "referenceDocxPath": "<optional-local-reference-docx-path>"
  }
}
```

验证：

```powershell
npm run m10:langgraph-resume:smoke
```

该 smoke 默认使用内置匿名样本，在临时 SQLite 中跑通完整本地简历输出流程，并验证生成 DOCX、agent runs、workflow events、fit/claim/audit 记录和 render metadata。需要验证私有样本时，通过 `BOSS_FIND_SAMPLE_CAREER_CONTEXT`、`BOSS_FIND_SAMPLE_REFERENCE_DOCX`、`BOSS_FIND_SAMPLE_PHOTO` 等环境变量传入本机文件；私有样本不应提交到仓库。
