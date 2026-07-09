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
| ORM/迁移 | SQLModel/SQLAlchemy + Alembic | 后续 schema 演进更稳 |
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
