# BOSS 平台层逻辑与开发约束

> 本文描述 M17.1 的当前产品边界。系统采集页面信息并打开岗位链接；打招呼、简历上传和投递均由用户在 BOSS 页面人工完成。

## 1. BOSS 层定位

BOSS 层只负责：

1. 读取用户当前浏览器中已经登录、已经渲染的岗位列表和详情。
2. 在采集过程中按顺序打开当前已加载岗位，使详情区域渲染完整 JD。
3. 将结构化岗位、页面诊断和采集进度同步到本地后端。
4. 从工作台打开用户选中的岗位详情 URL。

BOSS 层不负责：

- 决定岗位是否匹配。
- 生成或审核简历。
- 点击打招呼或发送消息。
- 选择、上传或确认简历文件。
- 点击投递、确认或提交。
- 绕过登录、验证码、安全验证、频率限制或反爬机制。
- 获取、转发或保存 BOSS Cookie/session。

Agent 和工作流只处理本地数据，不能把评分、审核、Shadow 结果或本地审批转化为 BOSS 写动作。

## 2. 当前技术选型

~~~text
用户正常 Chrome/Edge 登录会话
-> Chrome MV3 content script 读取列表和详情 DOM
-> extension background 负责同步、队列上下文和页面导航
-> Node.js 本地后端
-> SQLite、Agent、DOCX 和日志

Native Messaging Host
-> 仅探测或启动固定的本地后端
~~~

### 2.1 Chrome MV3 是主路径

Chrome Extension 是当前唯一通过真实 BOSS 岗位和 JD 采集验证的主执行器：

- 运行在用户正常登录的页面内。
- 不依赖 F1、DevTools 或控制台。
- 后端不需要持有 BOSS 登录态。
- 可以读取已经渲染的 DOM，并逐项触发详情加载。
- 页面变化时可以上报选择器和字段诊断。

扩展不具有任意本地命令执行能力，也不执行当前产品边界外的真实 BOSS 写动作。

### 2.2 Native Host 不是 BrowserExecutor

Native Messaging Host 只接受 STATUS 和 START_BACKEND：

- 启动路径固定为本仓库 server/src/server.js。
- 不接受 shell 字符串、任意路径或任意参数。
- 不读取 BOSS DOM，不操作浏览器标签页。
- 不读取模型 API Key。

它解决的是“用户一键启动本地服务”，不是登录态自动化或平台交互。

### 2.3 Firecrawl 只作为辅助候选

Firecrawl 的 profile 持久化和普通 scrape 能力可用于公开或静态页面补充，但实测没有证明它能稳定承载 BOSS 登录态详情交互。它不作为当前登录页面的岗位/JD 主采集器，也不用于打招呼、上传或投递。

### 2.4 Playwright 不作为运行时主路径

Local Playwright 受控 profile 曾被 BOSS 引导到登录或安全验证，登录后还出现页面失效和浏览器关闭。当前仅保留在测试或隔离 POC 范围，不进入普通用户主流程。

## 3. 已知页面逻辑

### 3.1 登录态只能由用户浏览器持有

BOSS 页面依赖用户会话。后端不能假设可直接请求 BOSS 页面或内部接口。

处理规则：

- 采集前检查当前标签页、域名和登录态线索。
- 登录失效、验证码或安全验证立即暂停并记录。
- 用户处理后显式重试，不自动绕过或循环刷新。

### 3.2 完整 JD 需要激活岗位详情

列表卡片通常只有标题、公司、薪资、城市和标签。详情区域只有在岗位被点击或打开后才会刷新，因此采集必须按页面实际顺序逐项处理。

处理规则：

- LIST_CAPTURED 允许缺少完整 JD。
- 只有可用描述达到当前质量门槛时才进入 DETAIL_CAPTURED。
- 工作台主列表只展示完整 JD。
- 待补 JD 单独统计、可继续补齐或从当前队列批量移除。

### 3.3 页面加载会改变可见岗位集合

BOSS 可能在浏览到第 10 个岗位后又加载到 15 个岗位，也可能使用虚拟列表、推荐位或滚动加载。因此“一次看到的列表”不是完整搜索结果。

处理规则：

- 当前版本只承诺处理当前页面已经加载的岗位。
- 每轮重新枚举可见卡片，并把新出现的稳定岗位键追加到待处理集合。
- 不把“页面当前不可见”直接解释为岗位已删除。
- 不承诺抓取搜索结果总量。

### 3.4 再次补齐不能重置到第一个岗位

再次点击开始或重试时，采集器必须从未完成项继续，而不是清空进度后回到第一个已采集岗位。

恢复规则：

1. 读取当前页面稳定岗位键。
2. 合并扩展本地 checkpoint 和后端当前队列状态。
3. 跳过已具有完整 JD 的岗位。
4. 跳过当前队列中已成功同步的 active 成员。
5. 从第一个仍缺 JD 或上次失败的岗位继续。
6. 页面新增岗位追加到队尾，不改变已完成项。

暂停只停止继续点击，不清空成功、失败和待处理状态。重试只处理可重试失败和新出现岗位。

### 3.5 刷新页面不能制造重复岗位

刷新 BOSS 页面可能重新加载同一岗位列表。去重必须分两层：

- 全局层：jobs 和 applications 依据规范化岗位 URL、岗位 ID 和稳定字段复用。
- 队列层：application_queue_items 依据 queue_id + application_id 复用。

结果：

- 同一岗位在当前队列重复采集时更新快照并跳过重复成员。
- 同一岗位采集到另一个意向队列时复用全局实体，仅新增队列成员。
- URL 中 securityId、ka 等易变参数不能单独作为稳定身份。

### 3.6 公司信息可能不完整

公司规模、融资、行业和招聘者信息可能分散在卡片、详情、公司页和沟通页。

处理规则：

- 只保存当前页面稳定可读字段。
- 缺失字段表示未知，不表示负面事实。
- Agent 必须把公司信息不足作为不确定性，而不是自动降低真实性。

### 3.7 BOSS 的联系与投递存在平台前置条件

很多岗位需要先打招呼或双方沟通后才开放简历入口。该规则意味着“生成简历成功”不等于“可以投递”。

当前处理：

- 系统展示岗位 URL 和 DOCX 路径。
- 用户人工打开岗位、打招呼、沟通、上传和投递。
- 用户在工作台记录未联系、已打招呼或已投递。
- 系统不推断 BOSS 是否已经接受投递。

### 3.8 文件上传受浏览器安全限制

网页内容脚本不能静默把任意本地路径放入文件选择框。Native Host 的存在也不改变当前产品边界。

当前处理：

- DocumentRenderer 只输出本地 DOCX。
- 工作台展示路径，用户自行选择文件。
- 不把本地文件路径发送给 BOSS 以外的服务。

## 4. 采集状态与算法

### 4.1 单轮采集

~~~text
选择当前意向队列
-> 枚举当前已加载岗位卡片
-> 生成稳定岗位键并去重
-> 跳过已完成项
-> 逐项打开详情
-> 等待详情与目标岗位匹配
-> 提取字段和 selector diagnostics
-> 完整 JD 同步后端
-> 继续处理新出现或未完成岗位
~~~

每个岗位处理必须有限时、间隔和最大数量。参数放在设置页：

- 最大本地缓存岗位数。
- 最多补齐岗位数。
- 自动点击间隔。

### 4.2 同步规则

- 完整 JD 采集成功后立即同步到当前队列。
- 同步使用幂等写入，重复请求不能重复创建岗位。
- 缺 JD 岗位保留在待补集合，不进入完整 JD 工作台主列表。
- 同步失败保留本地 checkpoint 和错误上下文，允许重试。
- 切换意向队列后，新采集结果必须写入新队列，不能沿用旧队列 ID。

### 4.3 停止条件

出现以下情况必须暂停：

- 登录失效。
- 验证码或安全验证。
- 页面域名或岗位不匹配。
- 详情区域长时间未加载。
- 关键选择器全部失效。
- 用户点击暂停。

不得通过高频刷新、模拟 DevTools、注入反检测代码或更换指纹绕过停止条件。

## 5. 队列和删除语义

- 新建意向岗位队列时不复制其他队列成员。
- 默认队列保存历史回填数据且不可归档。
- 删除自定义意向使用 archived_at，不硬删除全局岗位、application、筛选、简历或日志。
- 多选“移出队列”只把 application_queue_items.state 改为 REMOVED。
- “清理待补 JD”只移除当前队列中描述不足的成员。
- 被移除成员后续是否恢复必须由显式重新采集或添加动作触发。
- 队列级 trusted_at 只绕过该队列的风险方向门禁，不影响其他队列。

## 6. 状态所有权

### 6.1 本地工作流状态

applications.status 表示本地证据流：

~~~text
LIST_CAPTURED
-> DETAIL_CAPTURED
-> SCORED | SHORTLISTED | SKIPPED | NEEDS_USER_REVIEW
-> RESUME_DRAFTED
-> RESUME_AUDITED | NEEDS_USER_REVIEW
-> GREETING_READY
~~~

历史兼容状态 GREETING_SENT、CHAT_OPENED、RESUME_UNLOCKED、SUBMISSION_READY 和 SUBMITTED 仍存在于 schema 和 transition service，但当前普通用户流程不会由扩展自动推进。所有 applications.status 更新必须经过 ApplicationTransitionService，并提供合法证据。

### 6.2 人工外部状态

applications.manual_status 只记录用户声明的外部进度：

- NOT_CONTACTED：未联系。
- GREETED：已打招呼。
- APPLIED：已投递。

更新 manual_status：

- 只写窄字段和 MANUAL_APPLICATION_STATUS_UPDATED workflow event。
- 不改变 applications.status。
- 不创建 browser task。
- 不证明 BOSS 已接受或成功处理动作。

### 6.3 队列成员状态

application_queue_items.state 只表示某 application 是否在某队列中处于 ACTIVE 或 REMOVED。它不代表岗位关闭、筛选失败或已投递。

## 7. 页面诊断要求

每次失败至少记录：

- 页面 URL 和标题。
- 当前岗位稳定键和目标岗位稳定键。
- 列表、详情和关键选择器命中数。
- 失败步骤、等待时长和错误码。
- 登录、验证码、安全验证和岗位关闭线索。
- 当前队列 ID、采集批次和 checkpoint 摘要。

错误分类必须区分：

- LOGIN_REQUIRED。
- CAPTCHA_REQUIRED。
- SECURITY_CHECK_REQUIRED。
- SELECTOR_CHANGED。
- DETAIL_CAPTURE_FAILED。
- PAGE_JOB_MISMATCH。
- BACKEND_UNAVAILABLE。
- SYNC_FAILED。
- NEEDS_MANUAL_ACTION。

最近异常和待补 JD 在 UI 中默认可折叠。标记错误已解决不能自动重试或推进状态。

## 8. 历史兼容实验边界

M8-M12 曾建立只读会话检测、上传/投递入口 dry-run、执行包和人工 checklist；M14 曾建立单岗位真实打招呼 canary。当前规则是：

- 普通用户界面不显示这些实验入口。
- M14 canary 默认关闭，不作为当前产品能力。
- SEND_GREETING_REAL、UPLOAD_RESUME_REAL 和 SUBMIT_APPLICATION_REAL 不属于 M17/M17.1 主流程。
- Shadow 评审只评价 Agent 输出，不授权 BOSS 动作。
- execution package、dry-run 或本地 review 不能推进真实外部状态。
- 后续如果重新评估真实动作，必须单独立项、单独威胁建模、单独验收，不能从当前工作台直接放开。

### 8.1 历史本地协议索引

以下名称仍被数据库、兼容 API 和回归测试引用，但相关入口在 M17 普通用户界面中隐藏：

- M9.3 submissionReadiness：根据上传/投递入口 dry-run 生成的本地 metadata；只表示是否有足够证据供人工复核。
- M9.4 /api/submission-readiness：历史复核队列；读取派生数据，不创建上传或投递任务。
- M9.5：把 APPROVED_FOR_MANUAL_EXECUTION、REFRESH_REQUIRED 或 BLOCKED 写入本地复核记录；不触发 BOSS 动作。
- M10.1 WorkflowOrchestrator：汇总本地证据并建议下一步；不打开页面、不创建真实动作任务。
- M11.5 manual execution checklist：记录用户自报的本地步骤，不证明平台侧动作成功。
- M12.1/M12.2 SUBMISSION_EVIDENCE_RECORDED：保存只读页面线索或用户确认；不点击页面，也不自动把 application 标记为已投递。

这些历史协议的 noRealBossAction 约束继续生效。当前工作台使用更简单的 manual_status 作为用户进度台账，不依赖上述链路完成主流程。

## 9. Firecrawl 与反爬结论

Firecrawl 可以复用在公开静态资料抓取、HTML 清洗或独立研究任务中，但不能解决以下当前核心问题：

- 用户本地 Chrome 登录态。
- 只有激活岗位后才刷新的详情 DOM。
- BOSS 安全验证和动态列表状态。
- 浏览器本地文件选择。
- 当前产品要求的人工打招呼和投递边界。

因此主路径保持 Chrome MV3 + 本地后端。不得引入 patchright、undetected 或指纹伪装方案来规避平台检测。

## 10. 验收清单

- 不打开 DevTools 也能采集当前页面完整 JD。
- 再次开始或重试时跳过已完成岗位，并从未完成项继续。
- 页面新增岗位可追加处理，不清空原进度。
- 刷新页面不会产生重复全局岗位或当前队列成员。
- 切换队列后采集、统计和删除都严格作用于新队列。
- 完整 JD 自动同步后端，待补 JD 不进入主工作台。
- 登录、验证、选择器和同步错误可定位并重试。
- 工作台只打开岗位 URL，不点击打招呼、上传或投递。
- manual_status 更新不改变 applications.status。
- Native Host 只能执行 STATUS 和 START_BACKEND。
