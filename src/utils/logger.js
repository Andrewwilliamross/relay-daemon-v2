/**
 * Implements M3: Structured Logging Utility & PII Redaction
 * Provides JSON-formatted logs with PII redaction
 */
const winston = require('winston');
const { redactPII } = require('./pii-redactor');

// Custom format for structured JSON logs
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create PII redaction transform
const redactionFormat = winston.format((info) => {
  // Apply PII redaction to message and any metadata
  info.message = redactPII(info.message);
  
  // Redact PII in metadata objects
  if (info.error && typeof info.error === 'object') {
    if (info.error.message) {
      info.error.message = redactPII(info.error.message);
    }
    if (info.error.stack) {
      info.error.stack = redactPII(info.error.stack);
    }
  }
  
  // Redact other metadata fields that might contain PII
  ['recipient', 'sender', 'text', 'content', 'message'].forEach(field => {
    if (info[field]) {
      info[field] = redactPII(info[field]);
    }
  });
  
  return info;
})();

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    redactionFormat,
    jsonFormat
  ),
  defaultMeta: { service: 'imessage-relay-daemon' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // File transport
    new winston.transports.File({ 
      filename: 'imessage-relay-daemon.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    })
  ]
});

// Add Supabase transport if enabled (will be implemented later)
// if (process.env.ENABLE_SUPABASE_LOGGING !== 'false') {
//   logger.add(new SupabaseTransport({ level: 'info' }));
// }

// Add convenience method for critical errors
logger.critical = function(message, meta = {}) {
  this.error(message, { ...meta, critical: true });
};

module.exports = { logger };
