function buildProfileCheckCode() {
  return `
await page.waitForLoadState('domcontentloaded').catch(() => {});
await page.waitForTimeout(1200);
const result = await page.evaluate(() => {
  const text = document.body ? document.body.innerText || "" : "";
  const lowerUrl = location.href.toLowerCase();
  const loginRequired = /login|signin|passport/.test(lowerUrl) || /登录|注册|扫码登录|手机号登录/.test(text);
  const captchaRequired = /security|captcha|verify/.test(lowerUrl) || /验证码|安全验证|滑块|请完成验证|异常访问|访问过于频繁|请稍候|人机验证|访问验证/.test(text);
  const jobCardCount = document.querySelectorAll(".job-card-box,.job-card-wrapper,.job-primary,[class*='job-card']").length;
  const detailLinkCount = document.querySelectorAll("a[href*='job_detail']").length;
  return {
    url: location.href,
    title: document.title,
    loginRequired,
    captchaRequired,
    jobCardCount,
    detailLinkCount,
    bodySample: text.replace(/\\s+/g, " ").slice(0, 500)
  };
});
JSON.stringify(result);
`;
}

function buildCollectJobsCode({ maxJobs = 10, delayMs = 1400 } = {}) {
  const options = JSON.stringify({
    maxJobs: Number(maxJobs),
    delayMs: Number(delayMs)
  });

  return `
await page.waitForLoadState('domcontentloaded').catch(() => {});
await page.waitForTimeout(1500);
const result = await page.evaluate(async (options) => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const textOf = (el) => clean(el ? el.innerText || el.textContent || "" : "");
  const hrefOf = (root) => {
    const link = root.matches?.("a[href]") ? root : root.querySelector?.("a[href*='job_detail'],a[href]");
    if (!link) return "";
    try { return new URL(link.getAttribute("href"), location.href).toString(); } catch { return link.getAttribute("href") || ""; }
  };
  const jobIdOf = (url) => {
    const match = String(url || "").match(/\\/job_detail\\/([^/?#]+?)(?:\\.html)?(?:[?#]|$)/);
    return match ? match[1] : "";
  };
  const firstText = (root, selectors) => {
    for (const selector of selectors) {
      const node = root.querySelector?.(selector);
      const text = textOf(node);
      if (text) return text;
    }
    return "";
  };
  const pickTexts = (root, selectors) => {
    const values = [];
    for (const selector of selectors) {
      root.querySelectorAll?.(selector).forEach((node) => {
        const value = textOf(node);
        if (value && value.length <= 80) values.push(value);
      });
    }
    return Array.from(new Set(values)).slice(0, 40);
  };
  const detailText = () => {
    const selectors = [
      ".job-detail-container",
      ".job-detail",
      ".job-detail-box",
      ".job-sec",
      ".detail-content",
      ".job-detail-body",
      "[class*='job-detail']",
      "[class*='detail-content']"
    ];
    let best = "";
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((node) => {
        const value = textOf(node);
        if (value.length > best.length) best = value;
      });
    }
    return best;
  };
  const inferDescription = () => {
    const selectors = [
      ".job-sec-text",
      ".job-description",
      ".job-detail-section .text",
      ".detail-content .text",
      "[class*='job-sec-text']",
      "[class*='description']",
      "[class*='desc']"
    ];
    const candidates = [];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((node) => {
        const value = textOf(node);
        if (value.length > 30) candidates.push(value);
      });
    }
    if (candidates.length) {
      return candidates.sort((a, b) => b.length - a.length)[0];
    }
    return detailText();
  };
  const selectors = [
    ".job-card-box",
    ".rec-job-list .job-card-box",
    ".job-card-wrapper",
    ".job-card-body",
    ".job-primary",
    ".job-list-box li",
    "[class*='job-card']",
    "[class*='job-primary']"
  ];
  const seenElements = new Set();
  const cards = [];
  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((node) => {
      if (!seenElements.has(node) && textOf(node).length > 10) {
        seenElements.add(node);
        cards.push(node);
      }
    });
  }
  document.querySelectorAll("a[href*='job_detail']").forEach((link) => {
    const card = link.closest(".job-card-box,.job-card-wrapper,.job-card-body,.job-primary,li,[class*='job-card']") || link;
    if (!seenElements.has(card) && textOf(card).length > 10) {
      seenElements.add(card);
      cards.push(card);
    }
  });

  const selectorCounts = {};
  for (const selector of selectors) selectorCounts[selector] = document.querySelectorAll(selector).length;
  selectorCounts["a[href*='job_detail']"] = document.querySelectorAll("a[href*='job_detail']").length;

  const jobs = [];
  const failures = [];
  const limit = Math.min(cards.length, options.maxJobs || 10);
  for (let index = 0; index < limit; index += 1) {
    const card = cards[index];
    const rawText = textOf(card);
    const detailUrl = hrefOf(card);
    const title = firstText(card, [".job-name", ".job-title", ".name", "[class*='job-name']", "[class*='job-title']", "a[href*='job_detail']"]);
    const company = firstText(card, [".company-name", ".company-text", "[class*='company-name']", "[class*='company'] a", "a[href*='/gongsi/']"]);
    const salary = firstText(card, [".salary", ".red", "[class*='salary']"]);
    const locationText = firstText(card, [".job-area", "[class*='job-area']", "[class*='location']"]);
    const clickable = card.querySelector?.("a[href*='job_detail'],.job-name,.job-title,[class*='job-name'],[class*='job-title']") || card;
    try {
      clickable.scrollIntoView({ block: "center", inline: "nearest" });
      clickable.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
      clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      clickable.click();
      await sleep(options.delayMs || 1400);
      jobs.push({
        jobId: jobIdOf(detailUrl),
        title,
        company,
        salary,
        location: locationText,
        detailUrl,
        description: inferDescription(),
        tags: pickTexts(card, [".tag-list span", ".job-tags span", "[class*='tag'] span", "[class*='labels'] span"]),
        rawText: rawText.slice(0, 3000)
      });
    } catch (error) {
      failures.push({
        index,
        title,
        detailUrl,
        error: error.message || String(error)
      });
    }
  }

  return {
    url: location.href,
    title: document.title,
    selectorCounts,
    cardsFound: cards.length,
    jobs,
    failures
  };
}, ${options});
JSON.stringify(result);
`;
}

function buildGreetingDryRunCode({ greetingText = "", allowSend = false } = {}) {
  const options = JSON.stringify({
    greetingText: String(greetingText || ""),
    allowSend: Boolean(allowSend)
  });

  return `
await page.waitForLoadState('domcontentloaded').catch(() => {});
await page.waitForTimeout(1500);
const result = await page.evaluate(async (options) => {
  const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const text = document.body ? document.body.innerText || "" : "";
  const captchaRequired = /验证码|安全验证|滑块|请完成验证|异常访问|访问过于频繁/.test(text);
  const loginRequired = /登录|扫码登录|手机号登录/.test(text);
  const inputs = Array.from(document.querySelectorAll("textarea,input[type='text'],[contenteditable='true']"))
    .filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  const buttons = Array.from(document.querySelectorAll("button,a,div,span"))
    .map((node) => ({ node, text: clean(node.innerText || node.textContent || "") }))
    .filter((item) => item.text && /打招呼|立即沟通|沟通|发送|投递/.test(item.text));
  const input = inputs[0] || null;
  let filled = false;
  if (input && options.greetingText) {
    if (input.isContentEditable) {
      input.textContent = options.greetingText;
    } else {
      input.value = options.greetingText;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    filled = true;
  }
  const sendButton = buttons.find((item) => /发送|打招呼|立即沟通/.test(item.text));
  let sent = false;
  if (options.allowSend && sendButton?.node) {
    sendButton.node.click();
    sent = true;
  }
  return {
    url: location.href,
    title: document.title,
    captchaRequired,
    loginRequired,
    inputCount: inputs.length,
    actionButtons: buttons.slice(0, 20).map((item) => item.text),
    filled,
    sent,
    dryRun: !options.allowSend,
    bodySample: text.replace(/\\s+/g, " ").slice(0, 500)
  };
}, ${options});
JSON.stringify(result);
`;
}

function buildResumeGateCheckCode() {
  return `
await page.waitForLoadState('domcontentloaded').catch(() => {});
await page.waitForTimeout(1500);
const result = await page.evaluate(() => {
  const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const text = document.body ? document.body.innerText || "" : "";
  const candidates = Array.from(document.querySelectorAll("button,a,div,span,label"))
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        text: clean(node.innerText || node.textContent || ""),
        disabled: Boolean(node.disabled || node.getAttribute("aria-disabled") === "true"),
        visible: rect.width > 0 && rect.height > 0
      };
    })
    .filter((item) => item.visible && item.text && /投递|简历|上传|附件|发送/.test(item.text))
    .slice(0, 50);
  const fileInputs = Array.from(document.querySelectorAll("input[type='file']")).map((node) => ({
    accept: node.getAttribute("accept") || "",
    disabled: Boolean(node.disabled),
    visible: node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0
  }));
  const lockedSignals = /先沟通|打招呼后|回复后|暂不支持投递|无法投递|需要沟通/.test(text);
  const unlockedSignals = /投递简历|上传简历|附件简历|发送简历|立即投递/.test(text);
  return {
    url: location.href,
    title: document.title,
    resumeLocked: lockedSignals && !unlockedSignals,
    resumeUnlocked: unlockedSignals,
    actionCandidates: candidates,
    fileInputs,
    bodySample: text.replace(/\\s+/g, " ").slice(0, 700)
  };
});
JSON.stringify(result);
`;
}

module.exports = {
  buildProfileCheckCode,
  buildCollectJobsCode,
  buildGreetingDryRunCode,
  buildResumeGateCheckCode
};
