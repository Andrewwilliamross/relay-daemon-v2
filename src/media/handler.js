/**
 * Media file handling and download
 * Manages media file operations for outbound messages
 */
const fsPromises = require('fs/promises');
const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');
const { validateMediaFile } = require('./validator');
const { supabaseClient } = require('../supabase/client');
const https = require('https');
const http = require('http');

// Media storage directory
const MEDIA_DIR = '/tmp/imsg_media/';

/**
 * Ensure media directory exists
 * @returns {Promise<void>}
 */
async function ensureMediaDirExists() {
  try {
    await fsPromises.mkdir(MEDIA_DIR, { recursive: true });
  } catch (error) {
    logger.error('Failed to create media directory', { error });
    throw error;
  }
}

/**
 * Generate a unique filename for media
 * @param {string} originalUrl - Original media URL
 * @param {string} mimeType - Media MIME type
 * @returns {string} - Unique filename
 */
function generateUniqueFilename(originalUrl, mimeType) {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 10);
  
  // Get extension from URL or MIME type
  let extension = path.extname(originalUrl);
  
  if (!extension) {
    // Derive extension from MIME type if not in URL
    const mimeExtensionMap = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/heic': '.heic',
      'image/heif': '.heif',
      'video/mp4': '.mp4',
      'video/quicktime': '.mov',
      'audio/mpeg': '.mp3',
      'audio/mp4': '.m4a',
      'audio/x-m4a': '.m4a'
    };
    
    extension = mimeExtensionMap[mimeType] || '.bin';
  }
  
  return `${timestamp}_${randomString}${extension}`;
}

/**
 * Download media file from URL
 * @param {string} url - Media URL
 * @param {string} destPath - Destination file path
 * @returns {Promise<void>}
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const fileStream = fs.createWriteStream(destPath);
    
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: ${response.statusCode}`));
        return;
      }
      
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
    }).on('error', (error) => {
      fsPromises.unlink(destPath).catch(() => {});
      reject(error);
    });
  });
}

/**
 * Download and validate media from Supabase
 * @param {string} mediaUrl - URL of media in Supabase storage
 * @param {string} mediaType - MIME type of media
 * @returns {Promise<Object>} - Result with local file path
 */
async function downloadAndValidateMedia(mediaUrl, mediaType) {
  try {
    await ensureMediaDirExists();
    
    const filename = generateUniqueFilename(mediaUrl, mediaType);
    const filePath = path.join(MEDIA_DIR, filename);
    
    logger.info('Downloading media file', { mediaUrl, mediaType, filePath });
    
    // Download the file
    await downloadFile(mediaUrl, filePath);
    
    // Validate the downloaded file
    const validationResult = await validateMediaFile(filePath, mediaType);
    
    if (!validationResult.valid) {
      logger.error('Media validation failed', validationResult);
      await fsPromises.unlink(filePath).catch(err => {
        logger.error('Failed to delete invalid media file', { error: err });
      });
      
      return {
        success: false,
        ...validationResult
      };
    }
    
    return {
      success: true,
      filePath
    };
  } catch (error) {
    logger.error('Media download failed', { error, mediaUrl });
    return {
      success: false,
      reason: 'DOWNLOAD_FAILED',
      error: error.message
    };
  }
}

module.exports = {
  downloadAndValidateMedia,
  ensureMediaDirExists,
  MEDIA_DIR
};
