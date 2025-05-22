/**
 * Implements M5: Media Type Whitelist Enforcement
 * Validates media files before processing
 */
const path = require('path');
const fs = require('fs/promises');
const { logger } = require('../utils/logger');

// Whitelist of supported MIME types and extensions
const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a'
];

const SUPPORTED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.heic', '.heif', '.gif',
  '.mp4', '.mov', '.m4v', '.mp3', '.m4a'
];

/**
 * Validates media type against whitelist
 * @param {string} mimeType - MIME type to validate
 * @returns {boolean} - Whether the MIME type is supported
 */
function isValidMimeType(mimeType) {
  return SUPPORTED_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Validates file extension against whitelist
 * @param {string} filePath - Path to file
 * @returns {boolean} - Whether the file extension is supported
 */
function isValidFileExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

/**
 * Validates media file before processing
 * @param {string} filePath - Path to media file
 * @param {string} mimeType - Reported MIME type from Supabase
 * @returns {Promise<Object>} - Validation result
 */
async function validateMediaFile(filePath, mimeType) {
  try {
    // Check if file exists
    await fs.access(filePath);
    
    // Validate file extension
    const isValidExt = isValidFileExtension(filePath);
    if (!isValidExt) {
      logger.warn(`Unsupported file extension: ${path.extname(filePath)}`);
      return { 
        valid: false, 
        reason: 'UNSUPPORTED_EXTENSION' 
      };
    }
    
    // Validate MIME type
    const isValidMime = isValidMimeType(mimeType);
    if (!isValidMime) {
      logger.warn(`Unsupported MIME type: ${mimeType}`);
      return { 
        valid: false, 
        reason: 'UNSUPPORTED_MIME_TYPE' 
      };
    }
    
    // Check file size (max 100MB)
    const stats = await fs.stat(filePath);
    const MAX_SIZE = 100 * 1024 * 1024; // 100MB
    
    if (stats.size > MAX_SIZE) {
      logger.warn(`File too large: ${stats.size} bytes`);
      return { 
        valid: false, 
        reason: 'FILE_TOO_LARGE',
        size: stats.size
      };
    }
    
    return { valid: true };
  } catch (error) {
    logger.error('Media validation error', { error, filePath });
    return { 
      valid: false, 
      reason: 'VALIDATION_ERROR',
      error: error.message
    };
  }
}

module.exports = {
  validateMediaFile,
  isValidMimeType,
  isValidFileExtension,
  SUPPORTED_MIME_TYPES,
  SUPPORTED_EXTENSIONS
};
