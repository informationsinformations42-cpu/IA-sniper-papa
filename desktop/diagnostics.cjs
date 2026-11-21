const fs = require("node:fs");
const path = require("node:path");

const MAX_DIAGNOSTIC_LOG_BYTES = 1024 * 1024;

function appendDiagnosticLog(logPath, event, details = {}, maxBytes = MAX_DIAGNOSTIC_LOG_BYTES) {
  const logDirectory = path.dirname(logPath);
  const backupPath = `${logPath}.1`;
  const entry = `${JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    details
  })}\n`;
  fs.mkdirSync(logDirectory, { recursive: true });

  let currentSize = 0;
  try {
    currentSize = fs.statSync(logPath).size;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (currentSize + Buffer.byteLength(entry) > maxBytes && currentSize > 0) {
    try {
      fs.unlinkSync(backupPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    fs.renameSync(logPath, backupPath);
  }
  fs.appendFileSync(logPath, entry, { mode: 0o600 });
  return logPath;
}

module.exports = { appendDiagnosticLog };
