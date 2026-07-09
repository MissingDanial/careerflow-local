const path = require("path");
const mammoth = require("mammoth");
const { extractText, getDocumentProxy } = require("unpdf");

const MAX_RESUME_FILE_BYTES = 6 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown"]);

async function extractResumeSource(input = {}) {
  const fileName = cleanFileName(input.fileName || input.filename || "");
  if (!fileName) {
    throw extractionError(400, "fileName is required");
  }

  const extension = path.extname(fileName).toLowerCase();
  const sourceType = normalizeSourceType(input.sourceType || input.type || extension.replace(".", ""));
  const buffer = decodeBase64File(input.contentBase64 || input.base64 || "");
  const extractedAt = new Date().toISOString();
  let result;

  if (extension === ".docx" || sourceType === "docx") {
    result = await extractDocx(buffer);
  } else if (extension === ".pdf" || sourceType === "pdf") {
    result = await extractPdf(buffer);
  } else if (TEXT_EXTENSIONS.has(extension) || sourceType === "text" || sourceType === "markdown") {
    result = extractTextFile(buffer, sourceType);
  } else {
    throw extractionError(400, "Unsupported resume file type. Supported types: .docx, .pdf, .txt, .md");
  }

  const rawText = normalizeExtractedText(result.text);
  if (!rawText) {
    throw extractionError(422, "No extractable resume text found");
  }

  return {
    sourceType: result.sourceType,
    fileName,
    rawText,
    parsed: {
      extractionStatus: "extracted",
      textLength: rawText.length,
      pageCount: result.pageCount || null,
      warnings: result.warnings || []
    },
    metadata: {
      ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      extraction: {
        extractor: result.extractor,
        sourceType: result.sourceType,
        originalFileName: fileName,
        fileSizeBytes: buffer.length,
        textLength: rawText.length,
        pageCount: result.pageCount || null,
        warningCount: (result.warnings || []).length,
        extractedAt
      }
    }
  };
}

async function extractDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return {
    sourceType: "docx",
    extractor: "mammoth",
    text: result.value || "",
    warnings: normalizeMammothMessages(result.messages || [])
  };
}

async function extractPdf(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const result = await extractText(pdf, { mergePages: true });
  await safeDestroyPdf(pdf);
  return {
    sourceType: "pdf",
    extractor: "unpdf",
    text: Array.isArray(result.text) ? result.text.join("\n") : result.text || "",
    pageCount: Number(result.totalPages || 0),
    warnings: []
  };
}

function extractTextFile(buffer, sourceType) {
  const normalizedSourceType = sourceType === "markdown" ? "markdown" : "text";
  return {
    sourceType: normalizedSourceType,
    extractor: "plain-text",
    text: buffer.toString("utf8"),
    warnings: []
  };
}

function decodeBase64File(value) {
  const text = String(value || "").trim();
  if (!text) {
    throw extractionError(400, "contentBase64 is required");
  }

  const base64 = text.includes(",") && /^data:/i.test(text)
    ? text.slice(text.indexOf(",") + 1)
    : text;
  if (!/^[A-Za-z0-9+/=\r\n_-]+$/.test(base64)) {
    throw extractionError(400, "contentBase64 is not valid base64");
  }

  const normalized = base64.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const buffer = Buffer.from(normalized, "base64");
  if (!buffer.length) {
    throw extractionError(400, "contentBase64 decoded to an empty file");
  }
  if (buffer.length > MAX_RESUME_FILE_BYTES) {
    throw extractionError(413, `Resume file is too large. Max ${MAX_RESUME_FILE_BYTES} bytes`);
  }
  return buffer;
}

function normalizeSourceType(value) {
  const type = String(value || "").toLowerCase().trim();
  if (type === "md") {
    return "markdown";
  }
  return new Set(["docx", "pdf", "text", "markdown"]).has(type) ? type : "";
}

function normalizeExtractedText(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeMammothMessages(messages) {
  return messages.map((message) => ({
    type: String(message.type || "warning"),
    message: String(message.message || "")
  })).filter((message) => message.message);
}

async function safeDestroyPdf(pdf) {
  try {
    if (pdf && typeof pdf.destroy === "function") {
      await pdf.destroy();
    }
  } catch {
    // Best-effort cleanup; extraction already succeeded.
  }
}

function cleanFileName(value) {
  return path.basename(String(value || "").replace(/\\/g, "/")).trim();
}

function extractionError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  extractResumeSource,
  MAX_RESUME_FILE_BYTES
};
