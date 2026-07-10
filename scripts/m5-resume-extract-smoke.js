#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { Document, Packer, Paragraph, TextRun } = require("docx");
const { extractResumeSource } = require("../server/src/resume-extractor");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m5-extract-api-"));
  try {
    const directResult = await runDirectExtractorChecks();
    const apiResult = await runApiChecks(dataDir);
    const wiring = runWiringChecks();
    const checks = {
      ...directResult.checks,
      ...apiResult.checks,
      ...wiring.checks
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      directResult: directResult.summary,
      apiResult: apiResult.summary
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function runDirectExtractorChecks() {
  const docxBuffer = await createDocxBuffer([
    "Candidate resume",
    "Built a local Boss Find capture workflow."
  ]);
  const pdfBuffer = createSimplePdf([
    "PDF Candidate Resume",
    "Screening agent evidence text"
  ]);
  const textBuffer = Buffer.from("Plain resume text\nNode.js SQLite Chrome Extension", "utf8");

  const docx = await extractResumeSource({
    fileName: "resume.docx",
    contentBase64: docxBuffer.toString("base64")
  });
  const pdf = await extractResumeSource({
    fileName: "resume.pdf",
    contentBase64: pdfBuffer.toString("base64")
  });
  const text = await extractResumeSource({
    fileName: "resume.txt",
    contentBase64: textBuffer.toString("base64")
  });

  let rejectsUnknownType = false;
  try {
    await extractResumeSource({
      fileName: "resume.exe",
      contentBase64: textBuffer.toString("base64")
    });
  } catch {
    rejectsUnknownType = true;
  }

  return {
    checks: {
      extractsDocxText: docx.sourceType === "docx"
        && docx.rawText.includes("Candidate resume")
        && docx.metadata.extraction.extractor === "mammoth",
      extractsPdfText: pdf.sourceType === "pdf"
        && pdf.rawText.includes("PDF Candidate Resume")
        && pdf.metadata.extraction.extractor === "unpdf"
        && pdf.parsed.pageCount === 1,
      extractsPlainText: text.sourceType === "text"
        && text.rawText.includes("Node.js SQLite"),
      rejectsUnknownResumeFileType: rejectsUnknownType
    },
    summary: {
      docxTextLength: docx.rawText.length,
      pdfTextLength: pdf.rawText.length,
      textTextLength: text.rawText.length
    }
  };
}

async function runApiChecks(dataDir) {
  const port = 25000 + Math.floor(Math.random() * 1000);
  const server = spawn(process.execPath, ["server/src/server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      BOSS_DATA_DIR: dataDir,
      BOSS_SKIP_LEGACY_IMPORT: "1",
      PORT: String(port)
    },
    stdio: ["ignore", "ignore", "ignore"]
  });

  try {
    await waitForHealth(port);
    const docxBuffer = await createDocxBuffer([
      "API Candidate",
      "Maintained a resume fact library."
    ]);
    const pdfBuffer = createSimplePdf([
      "API PDF Resume",
      "Contains product workflow evidence"
    ]);
    const textBuffer = Buffer.from("API text resume\nProfileAgent input", "utf8");

    const docx = await requestJson(port, "POST", "/api/profile/resume-sources/extract", {
      fileName: "api-resume.docx",
      contentBase64: docxBuffer.toString("base64"),
      metadata: { importedBy: "m5-resume-extract-smoke" }
    });
    const pdf = await requestJson(port, "POST", "/api/profile/resume-sources/extract", {
      fileName: "api-resume.pdf",
      contentBase64: pdfBuffer.toString("base64")
    });
    const text = await requestJson(port, "POST", "/api/profile/resume-sources/extract", {
      fileName: "api-resume.txt",
      contentBase64: textBuffer.toString("base64")
    });
    const resumes = await requestJson(port, "GET", "/api/profile/resume-sources?limit=10");
    const stats = await requestJson(port, "GET", "/api/stats");

    let apiRejectsUnsupportedFile = false;
    try {
      await requestJson(port, "POST", "/api/profile/resume-sources/extract", {
        fileName: "bad.bin",
        contentBase64: Buffer.from("bad", "utf8").toString("base64")
      });
    } catch {
      apiRejectsUnsupportedFile = true;
    }

    const checks = {
      apiExtractsAndStoresDocx: docx.ok === true
        && docx.resumeSource.sourceType === "docx"
        && docx.resumeSource.rawText.includes("API Candidate")
        && docx.resumeSource.metadata.extraction.extractor === "mammoth",
      apiExtractsAndStoresPdf: pdf.ok === true
        && pdf.resumeSource.sourceType === "pdf"
        && pdf.resumeSource.rawText.includes("API PDF Resume")
        && pdf.resumeSource.metadata.extraction.extractor === "unpdf",
      apiExtractsAndStoresText: text.ok === true
        && text.resumeSource.rawText.includes("ProfileAgent input"),
      apiListsExtractedSources: resumes.totalResumeSources === 3
        && resumes.resumeSources.length === 3,
      apiStatsCountsExtractedSources: stats.resumeSourceCount === 3,
      apiRejectsUnsupportedResumeFile: apiRejectsUnsupportedFile
    };

    return {
      checks,
      summary: {
        resumeSources: resumes.totalResumeSources,
        docxTextLength: docx.textLength,
        pdfTextLength: pdf.textLength,
        textTextLength: text.textLength
      }
    };
  } finally {
    server.kill();
    await waitForExit(server);
  }
}

function runWiringChecks() {
  const serverJs = read("server/src/server.js");
  const extractorJs = read("server/src/resume-extractor.js");
  const packageJson = read("package.json");
  return {
    checks: {
      serverExposesExtractEndpoint: serverJs.includes("/api/profile/resume-sources/extract")
        && serverJs.includes("extractResumeSource"),
      extractorUsesSelectedLibraries: extractorJs.includes("mammoth")
        && extractorJs.includes("unpdf")
        && extractorJs.includes("MAX_RESUME_FILE_BYTES"),
      packageRunsExtractSmoke: packageJson.includes("m5:resume:smoke")
        && packageJson.includes("check:syntax")
    }
  };
}

async function createDocxBuffer(lines) {
  const doc = new Document({
    sections: [{
      children: lines.map((line) => new Paragraph({
        children: [new TextRun(line)]
      }))
    }]
  });
  return Packer.toBuffer(doc);
}

function createSimplePdf(lines) {
  const stream = [
    "BT",
    "/F1 12 Tf",
    "72 720 Td",
    "16 TL",
    ...lines.map((line) => `(${escapePdfText(line)}) Tj T*`),
    "ET"
  ].join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream\nendobj\n`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += object;
  }
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

function escapePdfText(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function requestJson(port, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : "";
    const request = http.request({
      host: "127.0.0.1",
      port,
      method,
      path: pathname,
      headers: data ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      } : {}
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = null;
        try {
          parsed = JSON.parse(text || "{}");
        } catch {
          parsed = { raw: text };
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(parsed.error || `HTTP ${response.statusCode}`));
          return;
        }
        resolve(parsed);
      });
    });
    request.on("error", reject);
    if (data) {
      request.write(data);
    }
    request.end();
  });
}

async function waitForHealth(port) {
  const deadline = Date.now() + 8000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await requestJson(port, "GET", "/health");
      return;
    } catch (error) {
      lastError = error;
      await sleep(150);
    }
  }
  throw lastError || new Error("Timed out waiting for server");
}

function waitForExit(processHandle) {
  return new Promise((resolve) => {
    processHandle.once("exit", resolve);
    setTimeout(resolve, 1500);
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
