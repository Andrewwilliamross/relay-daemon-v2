/**
 * Outbound message processing
 * Handles messages from Supabase to iMessage
 */
const { logger } = require('../utils/logger');
const { supabaseClient } = require('./client');
const { downloadAndValidateMedia } = require('../media/handler');
const { appleScriptQueue } = require('../applescript/queue');
const { sendTextMessage, sendMediaMessage } = require('../applescript');

/**
 * Process an outbound message from Supabase
 * @param {Object} message - Message data from Supabase
 * @returns {Promise<Object>} - Processing result
 */
async function processOutboundMessage(message) {
  try {
    logger.info('Processing outbound message', { 
      message_id: message.id,
      thread_id: message.thread_id,
      has_media: !!message.media_url
    });
    
    // Update message status to processing
    await updateMessageStatus(message.id, 'processing');
    
    // Get thread information from Supabase
    const { data: thread, error: threadError } = await supabaseClient
      .from('threads')
      .select('*')
      .eq('id', message.thread_id)
      .maybeSingle();
    
    if (threadError || !thread) {
      logger.error('Failed to fetch thread information', { 
        error: threadError, 
        thread_id: message.thread_id 
      });
      await updateMessageStatus(message.id, 'failed', 'Thread not found');
      return { success: false, error: 'Thread not found' };
    }
    
    // Determine recipient
    const recipient = thread.chat_identifier || thread.display_name;
    if (!recipient) {
      logger.error('No valid recipient found for thread', { thread_id: thread.id });
      await updateMessageStatus(message.id, 'failed', 'No valid recipient');
      return { success: false, error: 'No valid recipient' };
    }
    
    // Process based on message type
    if (message.media_url) {
      // Media message
      const mediaResult = await processMediaMessage(message, recipient);
      return mediaResult;
    } else {
      // Text-only message
      const textResult = await processTextMessage(message, recipient);
      return textResult;
    }
  } catch (error) {
    logger.error('Error processing outbound message', { 
      error, 
      message_id: message.id 
    });
    
    await updateMessageStatus(message.id, 'failed', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Process a text-only message
 * @param {Object} message - Message data
 * @param {string} recipient - Message recipient
 * @returns {Promise<Object>} - Processing result
 */
async function processTextMessage(message, recipient) {
  try {
    // Send the message via AppleScript
    await sendTextMessage(recipient, message.text);
    
    // Update message status to sent
    await updateMessageStatus(message.id, 'sent');
    
    logger.info('Text message sent successfully', { message_id: message.id });
    return { success: true };
  } catch (error) {
    logger.error('Failed to send text message', { 
      error, 
      message_id: message.id 
    });
    
    await updateMessageStatus(message.id, 'failed', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Process a media message
 * @param {Object} message - Message data
 * @param {string} recipient - Message recipient
 * @returns {Promise<Object>} - Processing result
 */
async function processMediaMessage(message, recipient) {
  try {
    // Download and validate media
    const mediaResult = await downloadAndValidateMedia(
      message.media_url,
      message.media_type
    );
    
    if (!mediaResult.success) {
      logger.error('Media validation failed', { 
        message_id: message.id,
        reason: mediaResult.reason
      });
      
      await updateMessageStatus(
        message.id, 
        'failed', 
        `Media validation failed: ${mediaResult.reason}`
      );
      
      return { success: false, error: mediaResult.reason };
    }
    
    // Send the media message via AppleScript
    await sendMediaMessage(recipient, mediaResult.filePath, message.text || '');
    
    // Update message status to sent
    await updateMessageStatus(message.id, 'sent');
    
    logger.info('Media message sent successfully', { message_id: message.id });
    return { success: true, filePath: mediaResult.filePath };
  } catch (error) {
    logger.error('Failed to send media message', { 
      error, 
      message_id: message.id 
    });
    
    await updateMessageStatus(message.id, 'failed', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Update message status in Supabase
 * @param {string} messageId - Message ID
 * @param {string} status - New status
 * @param {string} errorMessage - Optional error message
 * @returns {Promise<void>}
 */
async function updateMessageStatus(messageId, status, errorMessage = null) {
  try {
    const updateData = {
      status,
      updated_at: new Date().toISOString()
    };
    
    if (errorMessage) {
      updateData.error = errorMessage;
    }
    
    const { error } = await supabaseClient
      .from('messages_out')
      .update(updateData)
      .eq('id', messageId);
    
    if (error) {
      logger.error('Failed to update message status', { 
        error, 
        message_id: messageId 
      });
    }
  } catch (error) {
    logger.error('Error updating message status', { 
      error, 
      message_id: messageId 
    });
  }
}

module.exports = {
  processOutboundMessage,
  updateMessageStatus
};
