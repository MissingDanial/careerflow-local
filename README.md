# CareerFlow Local

[![CI](https://github.com/MissingDanial/careerflow-local/actions/workflows/ci.yml/badge.svg)](https://github.com/MissingDanial/careerflow-local/actions/workflows/ci.yml)

**English** | [简体中文](README.zh-CN.md)

A local job application workbench for BOSS Zhipin. Collect job descriptions, organize your experience, shortlist jobs, and generate tailored DOCX resumes from confirmed facts.

Users send greetings, upload resumes, and submit applications on BOSS themselves. Collection requires user intervention when login, CAPTCHA, or security checks appear.

## Features

- **Job queues:** collect complete descriptions, organize jobs by career direction, and filter the list.
- **Candidate profile:** import DOCX, PDF, TXT, or Markdown resumes, discuss your experience, and confirm extracted facts.
- **Resume preparation:** screen jobs, generate tailored DOCX resumes from confirmed experience, and keep version history.
- **Quality checks:** inspect job fit, supporting facts, rendering, and audit results.
- **Progress tracking:** keep resume versions and manually record contact and application status.

## Quick Start

Requires **Node.js 24+** (for `node:sqlite`), npm, and Chrome or Edge.

### 1. Install and start

```sh
git clone https://github.com/MissingDanial/careerflow-local.git
cd careerflow-local
npm ci
npm run server
```

Keep the terminal open. The backend defaults to `http://127.0.0.1:8787`; the [health check](http://127.0.0.1:8787/health) should return `ok: true`.

### 2. Load the extension

Open `chrome://extensions/` or `edge://extensions/`, enable Developer mode, select **Load unpacked**, and choose the repository's `extension` directory.

On Windows, you can also run `npm run native:install` after loading the extension. Reload it to use the popup's `启动后端` button to start the backend.

### 3. Configure a model

Open the extension settings, then `基础模型服务`. Enter an OpenAI-compatible service's Base URL, model, protocol, and API key. Save and test the connection.

Collection and rule-only checks work without a model. Profile conversations and model-generated resumes require an available model service.

## Usage

1. Open `个人经历` in the workbench, import your resume, and confirm the extracted facts.
2. Sign in to BOSS, open a job list, select an intent queue in the extension, and start collection. Keep the tab visible.
3. Screen jobs and generate tailored resumes in the workbench, then inspect fit, fact-checking, and audit results.
4. Review the DOCX and check results, address items requiring confirmation, then complete the application on BOSS.

## Local Data

The default data directory is `server/data/`, which is ignored by Git:

- `boss_find.sqlite3`: jobs, profiles, and workflow records.
- `generated_resumes/`: generated DOCX resumes.
- `model-provider.local.json`: model settings and API keys.

Do not commit credentials, databases, or personal resumes. Model use sends relevant job descriptions and profile content to your chosen provider.

After updating, restart the backend and reload the extension. Database upgrades use the existing automatic backup and migration process.

## Development and Documentation

```sh
npm run check
npm run test:ci
```

- [Product requirements](docs/01_PRD.md)
- [Technical architecture and configuration](docs/02_TECH_ARCHITECTURE.md)
- [Agent workflow and error handling](docs/03_AGENT_WORKFLOW.md)
- [Development plan and milestone history](docs/04_DEVELOPMENT_PLAN.md)
- [BOSS platform constraints](docs/06_BOSS_PLATFORM_LOGIC.md)

[MIT License](LICENSE)
