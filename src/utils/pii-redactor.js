/**
 * PII redaction utility for structured logging
 * Implements part of M3: Structured Logging Utility & PII Redaction
 */

// Regular expressions for identifying PII
const PII_PATTERNS = {
  // Phone numbers in various formats
  PHONE: /(\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
  
  // Email addresses
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  
  // Names (basic pattern - will need refinement)
  NAME: /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g,
  
  // Apple IDs (typically email addresses)
  APPLE_ID: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  
  // Message content (will be fully redacted unless debug mode)
  MESSAGE_CONTENT: /"message":\s*"[^"]+"/g
};

/**
 * Redacts PII from the provided text
 * @param {string} text - Text to redact
 * @param {Object} options - Redaction options
 * @returns {string} - Redacted text
 */
function redactPII(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  
  const { 
    debugMode = false,
    redactPhones = true,
    redactEmails = true,
    redactNames = true,
    redactMessageContent = true
  } = options;
  
  let redactedText = text;
  
  // Skip aggressive redaction in debug mode
  if (debugMode) {
    return redactedText;
  }
  
  // Redact phone numbers
  if (redactPhones) {
    redactedText = redactedText.replace(PII_PATTERNS.PHONE, '***-***-XXXX');
  }
  
  // Redact email addresses
  if (redactEmails) {
    redactedText = redactedText.replace(PII_PATTERNS.EMAIL, '[REDACTED_EMAIL]');
  }
  
  // Redact names
  if (redactNames) {
    redactedText = redactedText.replace(PII_PATTERNS.NAME, '[REDACTED_NAME]');
  }
  
  // Redact message content
  if (redactMessageContent) {
    redactedText = redactedText.replace(
      PII_PATTERNS.MESSAGE_CONTENT, 
      '"message": "[REDACTED_MESSAGE_CONTENT]"'
    );
  }
  
  return redactedText;
}

module.exports = { redactPII };
