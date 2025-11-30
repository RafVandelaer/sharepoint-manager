/**
 * Audit Configuration
 * Security and compliance settings for audit logging
 */

module.exports = {
  // Data retention (days)
  AUDIT_RETENTION_DAYS: 730, // 2 years for compliance
  
  // Hash salt for user anonymization (CHANGE IN PRODUCTION!)
  AUDIT_SALT: process.env.AUDIT_SALT || 'sharepoint-manager-audit-v1-2025',
  
  // Feature flags
  ENABLE_USER_TRACKING: true,
  ENABLE_ADMIN_ACCESS_LOG: true,
  ENABLE_ANOMALY_DETECTION: true,
  
  // Anomaly detection thresholds
  ANOMALY_DETECTION: {
    failedLoginThreshold: 5,      // Alert if >5 failures in 24h
    scanSpikeMultiplier: 3,       // Alert if scans >3x daily average
    cleanupErrorThreshold: 10     // Alert if >10 cleanup errors in 24h
  },
  
  // Admin session settings
  ADMIN_SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
  ADMIN_TOKEN_TTL_MS: 60 * 60 * 1000,       // 1 hour
  
  // Export limits
  MAX_EXPORT_ROWS: 100000,
  
  // Privacy settings
  HASH_LENGTH: 16, // Characters to keep from SHA-256 hash
  
  // Archive settings
  ARCHIVE_COMPRESSION: false, // Set to true to gzip old archives
  ARCHIVE_SPLIT_SIZE_MB: 50   // Split archives larger than 50MB
};
