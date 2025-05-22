/**
 * Inbound message processing
 * Handles messages from iMessage to Supabase
 */
const { logger } = require('../utils/logger');
const { supabaseClient } = require('./client');
const fs = require('fs/promises');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

// Promisify exec
const execPromise = util.promisify(exec);

// Path to chat.db (would be configured properly in production)
const CHAT_DB_PATH = path.join(process.env.HOME || '/tmp', 'Library/Messages/chat.db');
const ATTACHMENTS_DIR = path.join(process.env.HOME || '/tmp', 'Library/Messages/Attachments');

// State file to track last processed message
const STATE_FILE = path.join(process.env.HOME || '/tmp', '.imessage_relay_state.json');

/**
 * Load the last processed message state
 * @returns {Promise<Object>} - Last state
 */
async function loadState() {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist or is invalid, return default state
    return {
      lastMessageId: 0,
      lastProcessedTime: new Date(0).toISOString()
    };
  }
}

/**
 * Save the current processing state
 * @param {Object} state - Current state
 * @returns {Promise<void>}
 */
async function saveState(state) {
  try {
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    logger.error('Failed to save state', { error });
  }
}

/**
 * Query for new messages in chat.db
 * @param {number} lastMessageId - ID of last processed message
 * @returns {Promise<Array>} - New messages
 */
async function queryNewMessages(lastMessageId) {
  const query = `
    SELECT 
      m.ROWID as message_id,
      m.guid as message_guid,
      m.text as message_text,
      m.handle_id,
      m.date as message_date,
      m.is_from_me,
      m.cache_has_attachments,
      c.guid as chat_guid,
      h.id as sender_id,
      h.service as service_name
    FROM 
      message m
    JOIN 
      chat_message_join cmj ON m.ROWID = cmj.message_id
    JOIN 
      chat c ON cmj.chat_id = c.ROWID
    LEFT JOIN 
      handle h ON m.handle_id = h.ROWID
    WHERE 
      m.ROWID > ${lastMessageId}
      AND m.is_from_me = 0
    ORDER BY 
      m.ROWID ASC
    LIMIT 100;
  `;
  
  try {
    // Create a temporary file for the query
    const tempQueryFile = path.join('/tmp', `chat_db_query_${Date.now()}.sql`);
    await fs.writeFile(tempQueryFile, query);
    
    // Execute the query using sqlite3
    const { stdout, stderr } = await execPromise(`sqlite3 -json "${CHAT_DB_PATH}" < "${tempQueryFile}"`);
    
    if (stderr) {
      logger.warn('Warning during chat.db query', { stderr });
    }
    
    // Clean up
    await fs.unlink(tempQueryFile);
    
    // Parse the JSON result
    return stdout.trim() ? JSON.parse(stdout) : [];
  } catch (error) {
    logger.error('Error querying chat.db for new messages', { error });
    throw error;
  }
}

/**
 * Query for attachments of a message
 * @param {number} messageId - Message ID
 * @returns {Promise<Array>} - Attachments
 */
async function queryMessageAttachments(messageId) {
  const query = `
    SELECT 
      a.ROWID as attachment_id,
      a.guid as attachment_guid,
      a.filename as attachment_filename,
      a.mime_type,
      a.transfer_name,
      a.total_bytes
    FROM 
      attachment a
    JOIN 
      message_attachment_join maj ON a.ROWID = maj.attachment_id
    WHERE 
      maj.message_id = ${messageId};
  `;
  
  try {
    // Create a temporary file for the query
    const tempQueryFile = path.join('/tmp', `attachment_query_${Date.now()}.sql`);
    await fs.writeFile(tempQueryFile, query);
    
    // Execute the query using sqlite3
    const { stdout, stderr } = await execPromise(`sqlite3 -json "${CHAT_DB_PATH}" < "${tempQueryFile}"`);
    
    if (stderr) {
      logger.warn('Warning during attachment query', { stderr });
    }
    
    // Clean up
    await fs.unlink(tempQueryFile);
    
    // Parse the JSON result
    return stdout.trim() ? JSON.parse(stdout) : [];
  } catch (error) {
    logger.error('Error querying message attachments', { error, messageId });
    throw error;
  }
}

/**
 * Process new inbound messages
 * @returns {Promise<Object>} - Processing results
 */
async function processInboundMessages() {
  try {
    // Load last processed state
    const state = await loadState();
    const lastMessageId = state.lastMessageId;
    
    // Query for new messages
    const newMessages = await queryNewMessages(lastMessageId);
    
    if (newMessages.length === 0) {
      return { processed: 0, withAttachments: 0, failed: 0 };
    }
    
    logger.info(`Found ${newMessages.length} new inbound messages`);
    
    let processed = 0;
    let withAttachments = 0;
    let failed = 0;
    let maxMessageId = lastMessageId;
    
    // Process each message
    for (const message of newMessages) {
      try {
        // Track highest message ID
        if (message.message_id > maxMessageId) {
          maxMessageId = message.message_id;
        }
        
        // Check for attachments
        let attachments = [];
        if (message.cache_has_attachments) {
          attachments = await queryMessageAttachments(message.message_id);
          if (attachments.length > 0) {
            withAttachments++;
          }
        }
        
        // Prepare message data for Supabase
        const messageData = {
          message_guid: message.message_guid,
          chat_guid: message.chat_guid,
          sender_id: message.sender_id,
          service_name: message.service_name,
          text: message.message_text,
          has_attachments: attachments.length > 0,
          attachments: attachments.map(a => ({
            attachment_guid: a.attachment_guid,
            mime_type: a.mime_type,
            filename: a.attachment_filename,
            size_bytes: a.total_bytes
          })),
          received_at: new Date().toISOString(),
          status: 'received'
        };
        
        // Insert message into Supabase
        const { error } = await supabaseClient
          .from('messages_in')
          .insert(messageData);
        
        if (error) {
          logger.error('Failed to insert inbound message to Supabase', { 
            error, 
            message_id: message.message_id 
          });
          failed++;
        } else {
          processed++;
        }
      } catch (error) {
        logger.error('Error processing inbound message', { 
          error, 
          message_id: message.message_id 
        });
        failed++;
      }
    }
    
    // Update state with highest processed message ID
    await saveState({
      lastMessageId: maxMessageId,
      lastProcessedTime: new Date().toISOString()
    });
    
    const results = { processed, withAttachments, failed };
    logger.info('Inbound message processing complete', results);
    return results;
  } catch (error) {
    logger.error('Error in inbound message processing', { error });
    throw error;
  }
}

/**
 * Setup inbound message watcher
 * @param {number} intervalMs - Polling interval in milliseconds
 * @returns {Object} - Watcher control object
 */
function setupInboundWatcher(intervalMs = 5000) {
  let interval = null;
  
  const start = () => {
    if (interval) return;
    
    logger.info(`Starting inbound message watcher (interval: ${intervalMs}ms)`);
    
    interval = setInterval(async () => {
      try {
        await processInboundMessages();
      } catch (error) {
        logger.error('Error in inbound watcher cycle', { error });
      }
    }, intervalMs);
  };
  
  const stop = () => {
    if (!interval) return;
    
    logger.info('Stopping inbound message watcher');
    clearInterval(interval);
    interval = null;
  };
  
  // Start immediately
  start();
  
  return {
    start,
    stop,
    isRunning: () => !!interval
  };
}

module.exports = {
  setupInboundWatcher,
  processInboundMessages,
  loadState,
  saveState
};
