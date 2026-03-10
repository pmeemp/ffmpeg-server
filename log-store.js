const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "render-logs.json");
const MAX_RENDER_LOGS = 100;

function ensureLogFile() {
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, "[]", "utf8");
  }
}

function readLogs() {
  ensureLogFile();

  try {
    const raw = fs.readFileSync(LOG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeLogs(logs) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2), "utf8");
}

function addRenderLog({
  status = "info",
  fileName = "",
  mode = "",
  message = "",
  source = "server",
}) {
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: String(status || "info").trim().toLowerCase(),
    fileName: String(fileName || "").trim(),
    mode: String(mode || "").trim(),
    message: String(message || "").trim(),
    source: String(source || "server").trim(),
    createdAt: new Date().toISOString(),
  };

  const logs = readLogs();
  logs.unshift(entry);
  writeLogs(logs.slice(0, MAX_RENDER_LOGS));

  return entry;
}

module.exports = {
  addRenderLog,
  readLogs,
};
