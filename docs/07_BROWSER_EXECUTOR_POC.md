# M1 BrowserExecutor POC 操作手册

本文记录 M1 阶段如何验证浏览器执行层。M1 的目标不是先做 SQLite 或 Agent，而是先判断 BOSS 页面动作应该由哪个执行器承担。

当前结论：Chrome Extension 是 M1 主执行器；Firecrawl 只保留为 scrape-only 辅助候选；LocalPlaywright 不作为主执行器继续推进。

## 1. 执行器候选

```text
BrowserExecutor
  |-- ChromeExtensionAdapter BOSS 主执行器
  |-- FirecrawlAdapter       scrape-only 辅助候选
  `-- LocalPlaywrightAdapter 后续文件上传/投递入口实验候选
```

当前已实现 FirecrawlAdapter 和 LocalPlaywrightAdapter 的最小 POC 脚本：

```text
server/src/browser-executor/types.js
server/src/browser-executor/firecrawl-adapter.js
server/src/browser-executor/local-playwright-adapter.js
server/src/browser-executor/firecrawl-tasks.js
scripts/m1-firecrawl-poc.js
scripts/m1-local-playwright-poc.js
```

## 2. 环境变量

真实 Firecrawl 调用需要：

```powershell
$env:FIRECRAWL_API_KEY = "<your-firecrawl-api-key>"
```

可选变量：

```powershell
$env:FIRECRAWL_API_URL = "https://api.firecrawl.dev"
$env:FIRECRAWL_PROFILE_NAME = "boss-find-poc"
$env:FIRECRAWL_INTERACT_TIMEOUT_SECONDS = "120"
$env:BOSS_POC_URL = "https://www.zhipin.com/web/geek/job"
```

没有 `FIRECRAWL_API_KEY` 时，只能运行 `plan/help/check`，不会发出真实 Firecrawl 请求。

Firecrawl 文档提到存在无 key 起步能力，但当前本机 keyless smoke test 已被 Firecrawl 拒绝，错误为 IP 风险，需要 API key。因此 M1 正式实测必须配置 `FIRECRAWL_API_KEY`。`--allowKeyless true` 只能用于非 BOSS 页面烟测，不能作为项目路线依据。

当前已通过 Firecrawl agent auth 获取 API key 并写入本地 `.env`。`.env` 不应提交。

## 3. 本地校验

```powershell
npm run check
npm run poc:firecrawl -- plan
node scripts/m1-firecrawl-poc.js help
npm run poc:firecrawl:report
```

本地校验只确认脚本和命令入口可用，不代表 BOSS 页面 POC 已成功。

## 4. POC 命令

### POC-0 profile 持久化自检

先用非 BOSS 页面验证 Firecrawl profile 是否能跨任务保存 localStorage/cookie：

```powershell
npm run poc:firecrawl -- profile-persistence --url "https://example.com"
```

如果只是验证 Firecrawl keyless 是否可用，可以显式传：

```powershell
npm run poc:firecrawl -- profile-persistence --url "https://example.com" --allowKeyless true
```

当前环境下该 keyless 路径已经失败，后续请以 API key 路径为准。

当前 API key 路径已通过，成功结果为：

```text
server/data/poc/firecrawl/2026-07-05T06-33-52-968Z-profile-persistence.json
```

验收：

- `status` 为 `succeeded`。
- `output.persisted` 为 `true`。
- 结果文件中能看到 write/read 两次 scrape id。

如果这个命令失败，先不要做 BOSS 登录态验证，说明 Firecrawl profile 机制或 API 形态还没跑通。

### POC-1 BOSS 登录态与 profile

先跑 scrape-only 基线，确认 Firecrawl 普通 scrape 是否能读取 BOSS 页面内容：

```powershell
npm run poc:firecrawl -- scrape-baseline --url "https://m.zhipin.com/" --waitFor 3000
```

这一步不进入 interact，不代表能点击、登录或自动打开详情。它只用于区分“内容抓取能力”和“浏览器交互能力”。

```powershell
npm run poc:firecrawl -- profile-check --url "https://www.zhipin.com/web/geek/job" --saveProfile true
```

验收：

- 能进入 BOSS 搜索页或用户可登录页面。
- 输出能判断 `loginRequired` / `captchaRequired`。
- 如果最终 URL 是 `about:blank`，视为 Firecrawl 未能读取 BOSS 页面，不能算通过。
- 若需要人工登录，应通过 Firecrawl live view 或后续确认路径完成，不做验证码绕过。

### POC-2 岗位和 JD 获取

```powershell
npm run poc:firecrawl -- collect-jobs --url "<boss-search-url>" --maxJobs 10 --delayMs 1400
```

验收：

- 一次任务至少输出 10 个有效岗位，或明确说明不足原因。
- 至少 8 个岗位有可用 `description`。
- 每条岗位尽量包含 `title/company/salary/location/detailUrl/description`。
- `selectorCounts` 和 `failures` 可用于定位页面结构变化。

### POC-3 打招呼 dry-run

```powershell
npm run poc:firecrawl -- greeting-dry-run --url "<boss-job-or-chat-url>" --text "你好，我对这个岗位比较感兴趣，想进一步了解一下。"
```

默认只定位输入框和按钮、尝试填入文本，不发送。

真实发送被显式确认门拦住，只有同时提供以下参数才会执行：

```powershell
npm run poc:firecrawl -- greeting-dry-run --url "<boss-job-or-chat-url>" --allowSend true --confirmRealAction I_UNDERSTAND_REAL_BOSS_ACTION
```

M1 阶段原则上只做 dry-run。

### POC-4 投递入口与简历解锁检测

```powershell
npm run poc:firecrawl -- resume-gate --url "<boss-job-or-chat-url>"
```

验收：

- 能判断 `resumeLocked` 或 `resumeUnlocked`。
- 能列出投递、简历、上传、附件等相关入口候选。
- 能看到页面是否存在 `input[type=file]`。

文件上传是否交给 Firecrawl，必须等 POC-4 实测后决定。若上传路径不稳定，M9 使用 LocalPlaywrightAdapter。

## 5. 结果文件

所有真实 POC 调用会写入：

```text
server/data/poc/firecrawl/
```

文件名格式：

```text
<timestamp>-<command>.json
```

结果结构统一为：

```json
{
  "executor": "firecrawl",
  "taskType": "collect_jobs",
  "status": "succeeded",
  "input": {},
  "output": {},
  "diagnostics": {},
  "error": null,
  "createdAt": "..."
}
```

`diagnostics` 是 M1 决策关键，不要只看 `output`。需要重点检查 scrape id、live view URL、stdout/stderr、exitCode、killed、selectorCounts 和失败项。

生成汇总报告：

```powershell
npm run poc:firecrawl:report
```

报告会读取 `server/data/poc/firecrawl/` 下的结果文件，并输出当前更接近 Firecrawl 主执行器、Firecrawl+LocalPlaywright 混合、还是 fallback 路线。

当前报告结论为：

```text
status: scrape_only_candidate
route: Firecrawl scrape may help content extraction; ChromeExtensionAdapter or LocalPlaywrightAdapter still needed for BOSS interaction
```

也就是说，Firecrawl 暂时只能作为 BOSS 内容抓取辅助候选，不能作为 BOSS 主交互执行器。

## 6. 决策门

### LocalPlaywright POC

Firecrawl 当前结论是 `scrape_only_candidate` 后，M1 主交互执行器验证切到 LocalPlaywright：

```powershell
npm run poc:local -- detect-browser
npm run poc:local -- profile-check --url "https://www.zhipin.com/web/geek/job"
npm run poc:local:report
```

当前本机检测到 Edge：

```text
C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
```

LocalPlaywright 已能打开真实可见 Edge，并进入 BOSS 登录/安全验证页。随后用户在受控浏览器中完成登录后，出现登录界面失效、浏览器闪烁并自动关闭的现象。该现象视为受控浏览器路径不稳定，不再作为 M1 主执行器继续推进。

当前报告结论应为：

```text
status: local_playwright_not_primary_candidate
route: Use ChromeExtensionAdapter as the BOSS primary executor; keep LocalPlaywright only for later user-approved file-upload experiments.
```

这符合安全边界：遇到登录、验证码、安全验证或受控浏览器异常关闭时暂停，不做反检测、指纹伪装或绕过。

不要为了 M1 继续反复要求用户在 LocalPlaywright profile 中登录。后续只有在文件上传或投递入口必须验证、且用户明确同意时，才重新开启独立 POC。

历史调试命令保留如下：

```powershell
npm run poc:local -- profile-check --url "https://www.zhipin.com/web/geek/job"
```

如果 profile-check 通过，再继续：

```powershell
npm run poc:local -- collect-jobs --url "<boss-search-url>" --maxJobs 10
npm run poc:local -- greeting-dry-run --url "<boss-job-or-chat-url>"
npm run poc:local -- resume-gate --url "<boss-job-or-chat-url>"
```

| 结果 | 决策 |
|---|---|
| 结果 | 决策 |
|---|---|
| Firecrawl scrape 可读，但 interact/profile-check about:blank 或 ERR_ABORTED | Firecrawl 仅保留 scrape-only 辅助 |
| LocalPlaywright 被引导到登录/安全验证，或登录后受控浏览器异常关闭 | LocalPlaywright 不作为主执行器 |
| Chrome Extension 真实页面数据达到 10 岗位、8 JD 阈值 | ChromeExtensionAdapter 作为主执行器 |

### Chrome Extension POC

扩展路径的 M1 报告命令：

```powershell
npm run poc:extension:report
```

当前已验证数据：

```text
status: chrome_extension_primary_candidate
totalJobs: 33
describedJobCount: 15
validJobCount: 30
nonJobLikeCount: 3
```

结论：扩展路径已经满足 M1 岗位/JD 获取阈值。M2/M3 应围绕扩展主路径继续做 SQLite 入库、非岗位过滤、采集批次和诊断事件。

## 7. 停止线

- 不绕过登录。
- 不绕过验证码。
- 不做反检测、指纹伪装或隐藏请求重放。
- 不在未确认前真实发送打招呼或投递。
- 不为 POC 大规模触发 BOSS 动作。
