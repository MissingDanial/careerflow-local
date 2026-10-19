# CareerFlow Local

[![CI](https://github.com/MissingDanial/careerflow-local/actions/workflows/ci.yml/badge.svg)](https://github.com/MissingDanial/careerflow-local/actions/workflows/ci.yml)

**简体中文** | [English](README.md)

面向 BOSS 直聘的本地求职工作台：采集职位、整理个人经历、筛选岗位，并基于已确认的事实生成定制 DOCX 简历。

打招呼、上传简历和最终投递由用户在 BOSS 页面完成。采集遇到登录、验证码或安全校验时，需要用户处理。

## 主要功能

- **岗位管理**：采集完整职位描述，按求职意向分队列，支持筛选。
- **个人画像**：导入 DOCX、PDF、TXT 或 Markdown 简历，通过对话补充经历并确认事实。
- **简历准备**：筛选岗位，基于已确认的经历生成定制 DOCX，并保留简历版本。
- **质量检查**：查看岗位匹配、事实依据、渲染和审核结果。
- **进度记录**：保存简历版本，手动记录未联系、已打招呼和已投递状态。

## 快速开始

需要 **Node.js 24+**（使用 `node:sqlite`）、npm，以及 Chrome 或 Edge。

### 1. 安装并启动

```sh
git clone https://github.com/MissingDanial/careerflow-local.git
cd careerflow-local
npm ci
npm run server
```

保持终端开启。默认后端地址为 `http://127.0.0.1:8787`，访问 [健康检查](http://127.0.0.1:8787/health)应看到 `ok: true`。

### 2. 加载浏览器扩展

打开 `chrome://extensions/` 或 `edge://extensions/`，开启开发者模式，点击“加载已解压的扩展程序”，选择仓库中的 `extension` 目录。

Windows 用户也可在加载扩展后运行 `npm run native:install`，重新加载扩展，即可通过弹窗中的“启动后端”按钮启动服务。

### 3. 配置模型

打开扩展设置，在“基础模型服务”中填写 OpenAI 兼容服务的 Base URL、模型、协议和 API Key，保存并测试连接。

岗位采集和纯规则检查无需模型；画像对话和模型生成简历需要可用的模型服务。

## 使用流程

1. 打开工作台的“个人经历”，导入简历并确认提取的事实。
2. 登录 BOSS，进入岗位列表，在扩展中选择意向队列并开始采集；保持标签页可见。
3. 在工作台筛选岗位、生成定制简历，并查看匹配、事实与审核结果。
4. 查看生成的 DOCX 和检查结果，处理需要人工确认的内容，再前往 BOSS 页面完成投递。

## 本地数据

默认数据目录为 `server/data/`，已被 Git 忽略：

- `boss_find.sqlite3`：岗位、画像和工作流记录。
- `generated_resumes/`：生成的 DOCX 简历。
- `model-provider.local.json`：模型设置及 API Key。

请勿提交凭据、数据库或个人简历。使用模型时，相关职位描述和画像内容会发送给所选模型供应商。

更新代码后，重启后端并重新加载扩展；数据库升级会使用现有自动备份与迁移机制。

## 开发与文档

```sh
npm run check
npm run test:ci
```

- [产品需求](docs/01_PRD.md)
- [技术架构与配置](docs/02_TECH_ARCHITECTURE.md)
- [Agent 工作流与错误处理](docs/03_AGENT_WORKFLOW.md)
- [开发计划和里程碑历史](docs/04_DEVELOPMENT_PLAN.md)
- [BOSS 平台约束](docs/06_BOSS_PLATFORM_LOGIC.md)

[MIT License](LICENSE)
