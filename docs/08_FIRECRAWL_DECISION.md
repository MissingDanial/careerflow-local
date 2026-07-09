# Firecrawl 选型决策记录

## 1. 当前决策

M1 阶段已完成 Firecrawl 方向的关键验证：Firecrawl 不作为 BOSS 主交互执行器，只保留为 scrape-only 辅助候选。

本项目采用 REST 直连 Firecrawl API 做 POC，而不是一开始引入 SDK 或 MCP。原因是 M1 需要验证的是 BOSS 页面流程是否能跑通，REST 直连更容易控制请求体、结果落盘和诊断字段。

## 2. 复用调研结论

已纳入评估的 Firecrawl 相关项目和包：

| 候选 | 用途 | 结论 |
|---|---|---|
| [firecrawl/firecrawl](https://github.com/firecrawl/firecrawl) | Firecrawl 主项目 | GitHub 当前约 144k stars，AGPL-3.0；作为能力和自托管方向参考，不复制代码 |
| [@mendable/firecrawl-js](https://www.npmjs.com/package/@mendable/firecrawl-js) | 官方 Node SDK | 当前 npm 包为 MIT；后续稳定后可替换 REST 直连 |
| firecrawl-mcp-server | 让 Agent 通过 MCP 调 Firecrawl | 适合 Agent 工具层，不适合作为本项目后端核心执行器 |
| Firecrawl action / interact API | 页面点击、等待、执行脚本、profile | BOSS 页面未验证通过，只保留诊断价值 |
| Chrome Extension 原型 | 已有本地页面采集能力 | M1 主执行器 |
| Local Playwright | 本地浏览器强控制、文件上传 | 受控浏览器登录/风控不稳定，仅保留后续实验 |

暂不复制任何第三方 BOSS 自动化项目代码。那些项目只作为流程和模块拆分参考，避免引入许可证和风控边界问题。

当前本地调研命令：

```powershell
Invoke-RestMethod -Headers @{'User-Agent'='boss-find-codex'} 'https://api.github.com/repos/firecrawl/firecrawl'
Invoke-RestMethod 'https://registry.npmjs.org/@mendable/firecrawl-js/latest'
```

注意：`firecrawl-js` 这个无 scope 包名未找到，实际可用包名是 `@mendable/firecrawl-js`。

## 3. 为什么 Firecrawl 值得先验证

Firecrawl 对 M1 有三个直接价值，即使最终没有成为主执行器：

- 可以用 profile 验证登录态/会话复用。
- 可以用 interact 在页面里点击、等待和执行 Playwright 风格代码，适合验证“点击岗位后获取 JD”。
- 可以把执行结果、stdout/stderr、live view 线索作为诊断数据落盘，便于判断失败原因。

实测后，Firecrawl 仍然适合作为普通页面内容抓取和诊断辅助；但它没有通过 BOSS 主交互执行器门槛。

## 4. 主要风险

| 风险 | 影响 | 应对 |
|---|---|---|
| BOSS 登录态无法可靠迁移到 Firecrawl profile | Firecrawl 不能作为主执行器 | 先跑 `profile-persistence`，再做 BOSS 登录态验证 |
| keyless 模式不可用 | 无 API key 时无法实测 | 当前本机已触发该问题，正式 M1 需要 `FIRECRAWL_API_KEY` |
| BOSS 页面触发验证码或风控 | 任务暂停 | 不绕过，返回 `needs_manual_action` |
| interact API 返回结构变化 | POC 解析失败 | 保留 raw result 和 diagnostics，优先修 adapter |
| 文件上传不稳定 | M9 无法使用 Firecrawl | M9 转 LocalPlaywrightAdapter |
| hosted Firecrawl 对中国站点访问质量不稳定 | 采集失败或速度慢 | 评估 self-host 或本地 Playwright |

## 4.1 当前实测证据

已执行非 BOSS 页面 keyless smoke test：

```powershell
node scripts/m1-firecrawl-poc.js profile-persistence --allowKeyless true --url https://example.com
```

结果文件：

```text
server/data/poc/firecrawl/2026-07-05T05-16-12-692Z-profile-persistence.json
```

结论：

- 请求到达 Firecrawl。
- Firecrawl 拒绝本机 keyless 模式，提示 IP 风险并要求 API key。
- 这不能证明 Firecrawl 技术路线失败，只证明 M1 正式验证必须配置 `FIRECRAWL_API_KEY`。
- 当前 `npm run poc:firecrawl:report` 会把该状态标记为 `needs_api_key`。

随后已通过 Firecrawl agent browser auth 获取 API key，并写入本地 `.env`。已执行 API key 路径 profile 持久化自检：

```powershell
npm run poc:firecrawl -- profile-persistence --url https://example.com
```

成功结果文件：

```text
server/data/poc/firecrawl/2026-07-05T06-33-52-968Z-profile-persistence.json
```

结论：

- `FIRECRAWL_API_KEY` 已可用。
- Firecrawl `/v2/scrape` + interact 调用链可用。
- Firecrawl profile 可以跨两次 session 持久化 localStorage/cookie。
- M1 下一步应进入 BOSS 页面 `profile-check`，验证 BOSS 登录态、验证码/风控信号和 job card 可读性。

已执行 BOSS 页面 `profile-check` 初测：

```powershell
npm run poc:firecrawl -- profile-check --url "https://www.zhipin.com/web/geek/job" --saveProfile true
npm run poc:firecrawl -- profile-check --url "https://www.zhipin.com/" --saveProfile true
npm run poc:firecrawl -- profile-check --url "https://www.zhipin.com/web/geek/job?query=产品经理" --saveProfile false
```

观察：

- `/web/geek/job` 直接返回 `ERR_ABORTED`。
- 首页、移动站、带 query 的岗位页最终输出为 `about:blank`。
- Firecrawl profile 同时 `saveChanges: true` 并发写入会触发 “Only one writer is allowed” 锁。

当前判断：

- Firecrawl 能创建浏览器 session，但 hosted Firecrawl 对 BOSS 页面可读性还没有通过。
- 后续 BOSS profile-check 必须串行运行，不要并行写同一个 profile。
- 若继续得到 `about:blank` 或 `ERR_ABORTED`，应转向 Chrome Extension 或 LocalPlaywright 作为 BOSS 主执行器。
- Firecrawl 官方 support/ask 对 `m.zhipin.com` scrape 结果的诊断提示：底层 scrape 曾返回约 964KB HTML / 116KB markdown，`about:blank` 更像 profile replay/interact browser session 状态，而非 scrape 本身失败。因此新增 `scrape-baseline` 命令单独验证 scrape-only 能力。

当前 `npm run poc:firecrawl:report` 给出的决策为：

```text
scrape_only_candidate
```

阶段性结论：Firecrawl 可保留为 scrape-only 辅助候选；BOSS 主交互执行器应继续验证 Chrome Extension 和 LocalPlaywright。

补充结论：LocalPlaywright 随后也被降级。原因是受控 Edge profile 会被 BOSS 引导到登录/安全验证，用户完成登录后又出现登录界面失效、浏览器闪烁并自动关闭。当前 BOSS 主执行器收敛为 Chrome Extension。

## 5. M1 集成方式

当前集成文件：

```text
server/src/browser-executor/types.js
server/src/browser-executor/firecrawl-adapter.js
server/src/browser-executor/firecrawl-tasks.js
scripts/m1-firecrawl-poc.js
```

命令入口：

```powershell
npm run poc:firecrawl -- plan
npm run poc:firecrawl -- profile-persistence
npm run poc:firecrawl -- profile-check --url "<boss-url>"
npm run poc:firecrawl -- collect-jobs --url "<boss-url>"
npm run poc:firecrawl -- greeting-dry-run --url "<boss-url>"
npm run poc:firecrawl -- resume-gate --url "<boss-url>"
npm run poc:firecrawl:report
```

## 6. 后续决策

M1 当前结论：

1. **Chrome Extension 主执行器**：负责 BOSS 页面岗位/JD 获取、后续页面状态读取和可见页面动作。
2. **Firecrawl scrape-only 辅助**：只用于不依赖登录态/交互的内容抓取实验或辅助诊断。
3. **LocalPlaywright 实验候选**：只在后续文件上传/投递入口需要验证且用户明确同意时启用，不作为主路径。

基于这个结论，可以进入 SQLite 和采集质量闭环开发。
