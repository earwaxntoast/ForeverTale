import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'forevertale.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function writeLog(level: LogLevel, category: string, message: string, data?: unknown): void {
  const timestamp = formatTimestamp();
  let logLine = `[${timestamp}] [${level}] [${category}] ${message}`;

  if (data !== undefined) {
    try {
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      logLine += `\n${dataStr}`;
    } catch {
      logLine += `\n[Unable to serialize data]`;
    }
  }

  logLine += '\n' + '='.repeat(80) + '\n';

  // Write to file
  fs.appendFileSync(LOG_FILE, logLine);

  // Also write to console for immediate visibility
  if (level === 'ERROR') {
    console.error(logLine);
  } else if (level === 'WARN') {
    console.warn(logLine);
  }
}

export const logger = {
  debug: (category: string, message: string, data?: unknown) => writeLog('DEBUG', category, message, data),
  info: (category: string, message: string, data?: unknown) => writeLog('INFO', category, message, data),
  warn: (category: string, message: string, data?: unknown) => writeLog('WARN', category, message, data),
  error: (category: string, message: string, data?: unknown) => writeLog('ERROR', category, message, data),

  // Get the log file path for reference
  getLogPath: () => LOG_FILE,

  // Clear the log file
  clear: () => {
    fs.writeFileSync(LOG_FILE, `[${formatTimestamp()}] Log cleared\n${'='.repeat(80)}\n`);
  },
};

export default logger;
