/**
 * AppleScript module index
 * Provides a unified interface for AppleScript operations
 */
const { appleScriptQueue } = require('./queue');
const { executeAppleScript, executeInlineAppleScript } = require('./executor');
const { logger } = require('../utils/logger');

/**
 * Send a text message via iMessage
 * @param {string} recipient - Phone number or email of recipient
 * @param {string} text - Message text to send
 * @returns {Promise<string>} - Result of the operation
 */
async function sendTextMessage(recipient, text) {
  logger.info('Sending text message', { 
    recipient,
    messageLength: text.length
  });
  
  return appleScriptQueue.enqueue('send_text', {
    recipient,
    text
  });
}

/**
 * Send a media message via iMessage
 * @param {string} recipient - Phone number or email of recipient
 * @param {string} filePath - Absolute path to media file
 * @param {string} text - Optional message text to accompany media
 * @returns {Promise<string>} - Result of the operation
 */
async function sendMediaMessage(recipient, filePath, text = '') {
  logger.info('Sending media message', { 
    recipient,
    filePath,
    hasText: text.length > 0
  });
  
  return appleScriptQueue.enqueue('send_media', {
    recipient,
    filePath,
    text
  });
}

/**
 * Check if Messages.app is running
 * @returns {Promise<boolean>} - Whether Messages.app is running
 */
async function isMessagesRunning() {
  try {
    const result = await appleScriptQueue.enqueueInline(`
      tell application "System Events"
        return (exists process "Messages")
      end tell
    `);
    return result.trim() === 'true';
  } catch (error) {
    logger.error('Error checking if Messages.app is running', { error });
    return false;
  }
}

/**
 * Start Messages.app if not running
 * @returns {Promise<boolean>} - Whether Messages.app was started successfully
 */
async function startMessagesApp() {
  try {
    await appleScriptQueue.enqueueInline(`
      tell application "Messages"
        activate
      end tell
    `);
    return true;
  } catch (error) {
    logger.error('Error starting Messages.app', { error });
    return false;
  }
}

module.exports = {
  sendTextMessage,
  sendMediaMessage,
  isMessagesRunning,
  startMessagesApp,
  appleScriptQueue
};
