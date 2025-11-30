/**
 * Logging Service - Track user actions and system events
 * Provides structured logging for auditing and debugging
 */

const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logsDir = path.join(__dirname, '..', 'logs');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  /**
   * Get current timestamp in ISO format
   */
  getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Format log entry
   */
  formatLogEntry(level, category, action, data) {
    return {
      timestamp: this.getTimestamp(),
      level,
      category,
      action,
      ...data
    };
  }

  /**
   * Write to log file
   */
  writeToFile(filename, entry) {
    const logFile = path.join(this.logsDir, filename);
    const logLine = JSON.stringify(entry) + '\n';
    
    fs.appendFile(logFile, logLine, (err) => {
      if (err) {
        console.error('Failed to write to log file:', err);
      }
    });
  }

  /**
   * Write to console with color coding
   */
  writeToConsole(entry) {
    const colors = {
      INFO: '\x1b[36m',    // Cyan
      SUCCESS: '\x1b[32m', // Green
      WARNING: '\x1b[33m', // Yellow
      ERROR: '\x1b[31m',   // Red
      AUDIT: '\x1b[35m'    // Magenta
    };
    const reset = '\x1b[0m';
    const color = colors[entry.level] || reset;
    
    const { timestamp, level, category, action, ...data } = entry;
    const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
    
    console.log(`${color}[${timestamp}] [${level}] [${category}] ${action}${dataStr}${reset}`);
  }

  /**
   * Main log method
   */
  log(level, category, action, data = {}) {
    // Security: Sanitize sensitive data before logging
    const sanitizedData = this.sanitizeSensitiveData(data);
    
    const entry = this.formatLogEntry(level, category, action, sanitizedData);
    
    // Write to console
    this.writeToConsole(entry);
    
    // Write to daily log file
    const today = new Date().toISOString().split('T')[0];
    this.writeToFile(`app-${today}.log`, entry);
    
    // Write to category-specific log file
    if (category) {
      this.writeToFile(`${category.toLowerCase()}-${today}.log`, entry);
    }
  }

  /**
   * Log tenant configuration events
   */
  logTenantConfig(action, sessionId, data = {}) {
    this.log('AUDIT', 'TENANT', action, {
      sessionId,
      ...data
    });
  }

  /**
   * Log authentication events
   */
  logAuth(action, sessionId, data = {}) {
    this.log('AUDIT', 'AUTH', action, {
      sessionId,
      ...data
    });
  }

  /**
   * Log cleanup/scan operations
   */
  logCleanup(action, sessionId, data = {}) {
    this.log('INFO', 'CLEANUP', action, {
      sessionId,
      ...data
    });
  }

  /**
   * Log cleanup results
   */
  logCleanupResult(sessionId, siteId, result, dryRun = false) {
    this.log(result.success ? 'SUCCESS' : 'ERROR', 'CLEANUP', 
      dryRun ? 'DRY_RUN_COMPLETED' : 'CLEANUP_COMPLETED', {
      sessionId,
      siteId,
      filesProcessed: result.filesProcessed || 0,
      versionsRemoved: result.versionsRemoved || 0,
      errors: result.errors || 0,
      duration: result.duration || 0,
      error: result.error
    });
  }

  /**
   * Log versioning changes
   */
  logVersioning(action, sessionId, data = {}) {
    this.log('INFO', 'VERSIONING', action, {
      sessionId,
      ...data
    });
  }

  /**
   * Log API requests
   */
  logApiRequest(method, path, sessionId, data = {}) {
    this.log('INFO', 'API', `${method} ${path}`, {
      sessionId,
      ...data
    });
  }

  /**
   * Log errors
   */
  logError(category, action, error, sessionId = null, data = {}) {
    this.log('ERROR', category, action, {
      sessionId,
      error: error.message,
      stack: error.stack,
      ...data
    });
  }

  /**
   * Log warnings
   */
  logWarning(category, action, message, sessionId = null, data = {}) {
    this.log('WARNING', category, action, {
      sessionId,
      message,
      ...data
    });
  }

  /**
   * Get logs for a specific date and category
   */
  getLogs(date = null, category = null) {
    const dateStr = date || new Date().toISOString().split('T')[0];
    const filename = category 
      ? `${category.toLowerCase()}-${dateStr}.log`
      : `app-${dateStr}.log`;
    
    const logFile = path.join(this.logsDir, filename);
    
    if (!fs.existsSync(logFile)) {
      return [];
    }

    const content = fs.readFileSync(logFile, 'utf-8');
    return content.split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(entry => entry !== null);
  }

  /**
   * Get logs for a specific session
   */
  getSessionLogs(sessionId, date = null) {
    const logs = this.getLogs(date);
    return logs.filter(entry => entry.sessionId === sessionId);
  }

  /**
   * Clean up old log files (older than X days)
   */
  cleanupOldLogs(daysToKeep = 30) {
    const files = fs.readdirSync(this.logsDir);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    files.forEach(file => {
      if (!file.endsWith('.log')) return;
      
      const filePath = path.join(this.logsDir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.mtime < cutoffDate) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old log file: ${file}`);
      }
    });
  }

  /**
   * Security: Sanitize sensitive data from log entries
   */
  sanitizeSensitiveData(data) {
    if (!data || typeof data !== 'object') return data;
    
    const sanitized = { ...data };
    const sensitiveKeys = ['clientSecret', 'password', 'token', 'accessToken', 'secret', 'apiKey', 'bearer'];
    
    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      
      // Redact sensitive keys
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } 
      // Truncate sessionId for privacy
      else if (key === 'sessionId' && typeof sanitized[key] === 'string' && sanitized[key].length > 16) {
        sanitized[key] = sanitized[key].substring(0, 8) + '...';
      }
      // Truncate clientId to first 8 chars
      else if (key === 'clientId' && typeof sanitized[key] === 'string' && sanitized[key].length > 16) {
        sanitized[key] = sanitized[key].substring(0, 8) + '...';
      }
      // Recursively sanitize nested objects
      else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeSensitiveData(sanitized[key]);
      }
    }
    
    return sanitized;
  }
}

// Export singleton instance
module.exports = new Logger();
