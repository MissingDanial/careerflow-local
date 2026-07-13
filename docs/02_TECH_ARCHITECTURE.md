# JoB_Find 技术架构

## 1. 架构原则

- 本地优先：简历、照片、经历库、API Key、投递记录默认只保存在用户本机。
- 开源友好：MIT 许可证，避免引入许可证冲突。
- 复用优先：优先使用成熟库完成 Web 后端、Agent 编排、DOCX、PDF、数据库和浏览器自动化。
- Agent 职责隔离：写简历的 Agent 不能审核自己的输出。
- 自动化和授权分离：Agent 做判断和准备，执行器做点击、上传和记录。
- 错误透明：每一步失败都要抛出结构化错误，便于用户和开发者调试。

## 2. 推荐技术栈

| 层级 | 推荐技术 | 说明 |
|---|---|---|
| 后端 | Python + FastAPI | 本地 API、任务编排、文件管理 |
| Agent 编排 | LangGraph 或轻量状态机 | MVP 可先自研状态机，复杂分支稳定后迁移 LangGraph |
| LLM 调用 | OpenAI-compatible client | 用户配置 `base_url`、`api_key`、`model` |
| 数据库 | SQLite | 单用户本地部署足够稳定 |
| ORM/迁移 | `node:sqlite` + ordered SQL migrations | 当前使用 `DatabaseSync`，按版本迁移并在升级前备份 |
| 简历 DOCX | python-docx/docxtpl | 固定模板填充 |
| PDF 导出 | LibreOffice headless | 本地 DOCX 转 PDF |
| 浏览器接入 | Tampermonkey MVP | 快速验证 BOSS 网页流程 |
| 后续扩展 | Chrome Extension | 更适合产品化 |
| 控制台前端 | React + Vite | 配置、审批、记录、调试视图 |
| 导出 | CSV + openpyxl | 投递记录复盘 |
| 测试 | pytest + Playwright | 后端和浏览器流程测试 |

## 3. 总体架构

```text
BOSS Zhipin Web
  |
  | DOM read / user-authorized actions
  v
Tampermonkey / Chrome Extension
  |
  | localhost HTTP/WebSocket
  v
FastAPI Local Backend
  |
  |-- Agent Orchestrator
  |     |-- ProfileAgent
  |     |-- DiscoveryAgent
  |     |-- ScreeningAgent
  |     |-- ResumeAgent
  |     |-- AuditAgent
  |     `-- ApprovalAgent
  |
  |-- DocumentRenderer
  |-- Browser Task API
  |-- ApplicationLogger
  |-- ExportService
  |
  v
SQLite + Local Files
```

## 4. 模块职责

### 4.1 BrowserExecutor

职责：

- 读取 BOSS 直聘网页岗位列表和详情。
- 判断是否已沟通过 HR。
- 将岗位数据发送给本地后端。
- 接收投递任务。
- 执行上传简历、填写打招呼语、点击投递。
- 遇到验证码、登录异常、页面变化时停止并上报。

限制：

- 不保存 API Key。
- 不绕过验证码。
- 不规避平台风控。
- 不在用户未授权时执行投递。

补充说明：

- BOSS 层应被实现为 `BossAdapter / BrowserExecutor`，只负责读取页面事实和执行被授权动作。
- 完整投递链路必须建模打招呼、沟通状态、投递解锁、简历选择/上传等中间状态。
- 当前已知 BOSS 平台层问题见 [06_BOSS_PLATFORM_LOGIC.md](06_BOSS_PLATFORM_LOGIC.md)。

### 4.2 Local Backend

职责：

- 暴露本地 API。
- 管理用户配置、经历库、岗位、简历版本、投递记录。
- 调度 Agent 工作流。
- 生成 DOCX/PDF。
- 输出审批结果。
- 提供日志和导出能力。

SQLite schema 管理：

- `server/migrations/001_*.sql` 至当前 `SCHEMA_VERSION` 必须连续存在。
- `schema_migrations` 保存 migration 名称、checksum、状态、执行耗时和时间。
- `PRAGMA user_version` 是运行时兼容版本，不能由单个 SQL 文件直接修改。
- 现有数据库发生 migration 或历史基线化前，先通过 `VACUUM INTO` 写入同目录 `backups/`。
- migration 失败恢复升级前数据库；禁止继续使用集中式 `applySchema()`。
- schema v11 的 `011_workflow_input_snapshots.sql` 新增业务级不可变运行输入，不依赖 LangGraph checkpoint 表。
- schema v12 的 `012_application_transition_invariants.sql` 新增 application transition 幂等键和 browser task 过期、尝试次数、claim token 字段。

不可变工作流输入：

- `profile_snapshots` 保存一次运行使用的完整用户画像 bundle 和 SHA-256 content hash。
- `job_snapshots` 继续承载岗位采集历史，并为每次工作流额外写入精确的 JD/job payload。
- `workflow_runs` 保存一次图运行的生命周期、最终输出、错误和 replay 来源。
- `workflow_input_snapshots` 一对一绑定 workflow run，保存 profile/job snapshot IDs、application、user rules、execution/render options、脱敏后的 model config、graph/prompt/agent version 和 input hash。

Profile Conversation & Memory v2：

- `profile_dialog_sessions` 保存独立画像访谈的标题、状态、增量摘要、未决问题、冲突和脱敏模型配置。
- `profile_dialog_messages` 保存 user/assistant 消息、模型失败、重试来源和对应 `agent_run`；用户消息在模型调用前提交。
- `profile_fact_drafts` 增加 `CREATE/UPDATE`、目标 entity 和来源 session/message；模型不能直接写正式画像表。
- `profile_entity_revisions` 在用户确认草稿时保存 before/after JSON。
- `profile_context_versions` 保存结构化上下文、Markdown、profile/content hash 和来源会话。
- 会话记忆、正式画像事实和单岗位 workflow snapshot 是三个独立层次，不能互相替代。
- `agent_runs.workflow_run_id` 将 Screening、Resume、Fit、Claim、Revision、Audit 节点绑定到同一组输入；对应 snapshot/version 字段冗余保存，便于审计查询。
- API Key、token、secret、authorization 和 password 类字段在入库前剔除。
- `POST /api/workflow-runs/:id/replay` 是内存 dry replay，不调用持久化写方法，不改变 application，不创建 browser task。

业务快照与 LangGraph checkpoint 的职责不同：前者保证“这次 Agent 看到了什么”可追溯，后者用于图执行暂停/恢复。当前只实现业务快照；节点级断点恢复留给后续独立阶段。

Application 状态迁移：

- `ApplicationTransitionService` 是唯一允许执行 `UPDATE applications` 的模块。
- 状态边由显式 transition map 校验，禁止服务自行拼接或跳过中间状态。
- Screening、Resume、Audit、job sync、local approval 和 read-only browser result 先写事实，再把事实 ID 作为 typed evidence 请求迁移。
- typed evidence 不只检查记录存在：job sync 必须引用包含当前岗位快照的 capture batch，screening recommendation 必须与目标状态一致，failure source 必须属于当前 application 且确实处于失败状态。
- `application_events.idempotency_key` 对同一 application 唯一；同一 key 的相同回调直接返回历史结果，不重复写 application/workflow event。
- operator override 只用于明确的本地人工/调试迁移，必须记录 actor、rationale 和显式 idempotency key，且不能推进 `GREETING_SENT`、`SUBMISSION_READY`、`SUBMITTED`。

Browser task 执行租约：

- 新任务默认带过期时间和最大尝试次数。
- claim 时增加 `attempt_count`、写入 `last_attempt_at`，并生成随机 `claim_token`。
- 扩展回写终态时携带 claim token；第二次及后续尝试没有 token 或 token 已过期时拒绝回调。
- 相同终态和相同 result 的重复回调幂等返回；冲突结果返回 409。
- 过期任务先转为 `FAILED/TASK_EXPIRED`，不再应用 application 状态副作用。
- 失败任务只有在 `attempt_count < max_attempts` 时可重排；过期任务必须显式 `refreshExpiry`。

Agent 固定评测：

- `evaluation/fixtures/m13-agent-evaluation.v1.json` 是匿名人工标签基线，包含画像、JD、风险预期、岗位顺序、必要项状态、claim probe 和 Audit probe。
- `server/src/agent-evaluation-runner.js` 直接调用生产 Agent 函数的 rules mode；它不启动 HTTP 服务、不读写 SQLite、不生成 DOCX、不读取真实用户文件，也不调用外部模型。
- 每次评测计算数据集 SHA-256，并记录 `GRAPH_VERSION`、`PROMPT_VERSION`、`AGENT_VERSION`、provider 和无外部调用的模型模式。
- 指标包括风险 recall/precision、pairwise 岗位排序、Screening 决策、JD 必要项识别/状态、生成 claim 支持率、人工 claim verdict 和 Audit 一致性。
- JSON/Markdown 报告默认写入被忽略的 `server/data/agent-evaluation/`；任一指标低于数据集阈值时 CLI 返回非零退出码。
- `m13:agent-evaluation:smoke` 使用临时目录，并通过故意漂移的内存标签验证回归门禁会失败且能返回样本 ID。

### 4.3 Agent Orchestrator

职责：

- 按状态机执行 Agent。
- 校验每个 Agent 的 JSON 输出。
- 管理重试、失败、人工介入。
- 记录每次 Agent 输入输出摘要。

MVP 可以使用自研状态机：

```text
NEW_JOB
-> SCREENING
-> SKIPPED | RESUME_DRAFTING
-> AUDITING
-> APPROVAL
-> WAITING_USER | READY_TO_APPLY | SKIPPED
-> APPLYING
-> APPLIED | FAILED | NEEDS_MANUAL_ACTION
```

### 4.4 DocumentRenderer

职责：

- 使用固定 DOCX 模板渲染简历。
- 控制两页以内。
- 转换为 PDF。
- 保存 `diff.md` 和生成元数据。

失败处理：

- 模板字段缺失：抛出 `TEMPLATE_FIELD_MISSING`。
- DOCX 生成失败：抛出 `DOCX_RENDER_FAILED`。
- PDF 转换失败：抛出 `PDF_CONVERT_FAILED`。
- 页数超限：抛出 `RESUME_PAGE_LIMIT_EXCEEDED`，交给 ResumeAgent 压缩内容。

## 5. 本地目录建议

```text
JoB_Find/
  backend/
    app/
      agents/
      api/
      core/
      db/
      documents/
      services/
      schemas/
    tests/
  browser/
    tampermonkey/
    extension/
  frontend/
  templates/
    resume_standard.docx
  data/
    .gitkeep
  docs/
  README.md
  LICENSE
  pyproject.toml
  config.example.yaml
```

用户运行后生成的数据建议默认放在：

```text
data/
  config.local.yaml
  job_find.sqlite3
  uploads/
  applications/
  logs/
  exports/
```

`data/` 默认加入 `.gitignore`，避免误提交简历、照片、API Key 和投递记录。

## 6. 配置设计

建议提供 `config.example.yaml`：

```yaml
llm:
  provider: openai_compatible
  base_url: ""
  api_key: ""
  model: "gpt-5.5"
  timeout_seconds: 60
  temperature: 0.2

application:
  auto_apply: false
  high_match_threshold: 85
  medium_match_threshold: 60
  low_risk_threshold: 20
  medium_risk_threshold: 50
  max_resume_pages: 2
  skip_contacted_hr: true
  require_user_confirm_for_medium_risk: true

search:
  allow_expansion: true
  target_job_types:
    - internship
    - campus
  cities: []
  job_keywords: []
  expansion_keywords: []
  excluded_keywords: []
  company_blacklist: []

documents:
  resume_template_path: "templates/resume_standard.docx"
  output_dir: "data/applications"
  export_dir: "data/exports"

browser:
  target_site: "boss_zhipin_web"
  action_timeout_seconds: 20
  stop_on_captcha: true
  stop_on_login_required: true
```

## 7. 数据模型草案

### 7.1 users

单用户本地部署也可以保留 users 表，便于后续扩展：

- id
- display_name
- created_at
- updated_at

### 7.2 profiles

- id
- user_id
- source_resume_path
- photo_path
- structured_profile_json
- evidence_library_json
- created_at
- updated_at

### 7.3 jobs

- id
- source
- source_url
- title
- company
- city
- salary
- jd_text
- hr_name
- hr_status
- already_contacted
- raw_payload_json
- created_at
- updated_at

### 7.4 screenings

- id
- job_id
- match_score
- risk_score
- hard_conditions_json
- matched_points_json
- risk_points_json
- recommendation
- agent_trace_id
- created_at

### 7.5 resume_versions

- id
- application_id
- screening_id
- agent_run_id
- version_number
- status
- provider
- resume_fields_json
- source_mapping_json
- diff_summary_json
- compression_notes_json
- unsupported_claims_json
- render_metadata_json
- file_path
- file_format
- metadata_json
- created_at
- updated_at

### 7.6 resume_audits

- id
- resume_version_id
- agent_run_id
- status
- provider
- truthfulness_passed
- format_passed
- page_limit_passed
- exaggeration_risk
- unsupported_claims_json
- source_issues_json
- job_fit_review
- risk_score_adjustment
- recommendation
- requires_user_confirmation
- render_metadata_json
- risk_flags_json
- metadata_json
- created_at

### 7.7 applications

- id
- job_id
- resume_version_id
- approval_mode
- approval_result
- application_status
- submitted_at
- error_code
- error_message
- created_at
- updated_at

### 7.8 events

- id
- entity_type
- entity_id
- event_type
- severity
- message
- payload_json
- created_at

## 8. API 草案

### 8.1 配置

- `GET /api/config`
- `PUT /api/config`
- `POST /api/config/test-llm`

### 8.2 简历与经历库

- `POST /api/profile/upload`
- `GET /api/profile`
- `PUT /api/profile`
- `POST /api/profile/agent-chat`

### 8.3 岗位

- `POST /api/jobs/import`
- `GET /api/jobs`
- `GET /api/jobs/{job_id}`
- `POST /api/jobs/{job_id}/screen`

### 8.4 简历生成

- `POST /api/jobs/{job_id}/prepare-application`
- `GET /api/resumes/{resume_id}`
- `POST /api/resumes/{resume_id}/rerender`

### 8.5 审批和投递

- `POST /api/applications/{application_id}/approve`
- `POST /api/applications/{application_id}/reject`
- `GET /api/browser-tasks`
- `POST /api/browser-tasks`
- `POST /api/browser-tasks/claim`
- `GET /api/browser-tasks/{task_id}`
- `POST /api/browser-tasks/{task_id}/transition`
- `POST /api/browser/events`

### 8.6 导出

- `GET /api/exports/applications.csv`
- `GET /api/exports/applications.xlsx`

## 9. Agent 输出校验

所有 Agent 输出必须：

- 使用 JSON。
- 通过 Pydantic Schema 校验。
- 包含 `confidence`。
- 包含 `reasons`。
- 包含 `risk_flags`。
- 包含 `requires_user_confirmation`。
- 失败时返回结构化错误。

示例错误：

```json
{
  "error": {
    "code": "AGENT_OUTPUT_SCHEMA_INVALID",
    "message": "ScreeningAgent returned invalid JSON",
    "agent": "ScreeningAgent",
    "step": "screen_job",
    "retryable": true,
    "raw_output_path": "data/logs/agent_traces/trace_001.txt"
  }
}
```

## 10. 安全与隐私

- `.env`、`config.local.yaml`、`data/` 必须被 `.gitignore`。
- 浏览器脚本不得持有 LLM API Key。
- 日志中默认不打印完整 API Key。
- 用户文件默认不上传远端。
- OpenAI-compatible 模型调用会把必要文本发送到用户配置的模型服务，README 需要提示用户自行评估供应商隐私政策。

## 11. 测试策略

- 单元测试：配置读取、Schema 校验、评分规则、决策规则。
- 集成测试：上传简历到生成 DOCX/PDF 的完整链路。
- Agent mock 测试：用固定 LLM 响应验证状态机。
- 浏览器测试：使用本地 HTML fixture 模拟 BOSS 页面结构。
- 回归测试：已沟通 HR 跳过、验证码暂停、PDF 转换失败、页数超限。

## 12. 实施建议

第一阶段先实现后端核心状态机和文档生成，不急着做漂亮前端。原因是项目价值主要取决于经历库、岗位筛选、简历改写和审核是否可靠。浏览器投递可以先做最小闭环，等规则稳定后再迁移 Chrome Extension。
