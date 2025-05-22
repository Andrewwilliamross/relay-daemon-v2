/**
 * Implements M2: Cloud-Local GUID Mapping Sync
 * Synchronizes iMessage chat GUIDs with Supabase threads table
 */
const { logger } = require('../utils/logger');
const { supabaseClient } = require('./client');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs/promises');
const path = require('path');

// Promisify exec
const execPromise = util.promisify(exec);

// Path to chat.db (would be configured properly in production)
const CHAT_DB_PATH = path.join(process.env.HOME || '/tmp', 'Library/Messages/chat.db');

/**
 * Execute SQL query on chat.db
 * @param {string} query - SQL query to execute
 * @returns {Promise<Array>} - Query results
 */
async function queryChatDb(query) {
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
    logger.error('Error querying chat.db', { error, query });
    throw error;
  }
}

/**
 * Get all chat threads from chat.db
 * @returns {Promise<Array>} - Chat threads
 */
async function getChatThreads() {
  const query = `
    SELECT 
      c.ROWID as chat_id,
      c.guid as chat_guid,
      c.display_name,
      c.chat_identifier,
      c.service_name,
      c.style as chat_style,
      GROUP_CONCAT(h.id, ',') as handle_ids
    FROM 
      chat c
    LEFT JOIN 
      chat_handle_join chj ON c.ROWID = chj.chat_id
    LEFT JOIN 
      handle h ON chj.handle_id = h.ROWID
    GROUP BY 
      c.ROWID
    ORDER BY 
      c.ROWID DESC;
  `;
  
  return queryChatDb(query);
}

/**
 * Get chat participants for a specific chat
 * @param {number} chatId - Chat ROWID
 * @returns {Promise<Array>} - Chat participants
 */
async function getChatParticipants(chatId) {
  const query = `
    SELECT 
      h.id as identifier,
      h.service as service_name,
      h.country as country_code,
      h.uncanonicalized_id as original_identifier
    FROM 
      handle h
    JOIN 
      chat_handle_join chj ON h.ROWID = chj.handle_id
    WHERE 
      chj.chat_id = ${chatId};
  `;
  
  return queryChatDb(query);
}

/**
 * Sync chat threads with Supabase
 * @returns {Promise<Object>} - Sync results
 */
async function syncThreads() {
  try {
    logger.info('Starting chat thread synchronization');
    
    // Get all chat threads from chat.db
    const chatThreads = await getChatThreads();
    logger.info(`Found ${chatThreads.length} chat threads in chat.db`);
    
    let inserted = 0;
    let updated = 0;
    let failed = 0;
    
    // Process each chat thread
    for (const thread of chatThreads) {
      try {
        // Get participants for this chat
        const participants = await getChatParticipants(thread.chat_id);
        
        // Prepare thread data for Supabase
        const threadData = {
          chat_guid: thread.chat_guid,
          display_name: thread.display_name || null,
          chat_identifier: thread.chat_identifier,
          service_name: thread.service_name,
          is_group: thread.chat_style === 43, // 43 is group chat
          participants: participants.map(p => ({
            identifier: p.identifier,
            service: p.service_name
          })),
          last_synced: new Date().toISOString()
        };
        
        // Check if thread already exists in Supabase
        const { data: existingThread, error: fetchError } = await supabaseClient
          .from('threads')
          .select('id')
          .eq('chat_guid', thread.chat_guid)
          .maybeSingle();
        
        if (fetchError) {
          logger.error('Error checking for existing thread', { 
            error: fetchError, 
            chat_guid: thread.chat_guid 
          });
          failed++;
          continue;
        }
        
        if (existingThread) {
          // Update existing thread
          const { error: updateError } = await supabaseClient
            .from('threads')
            .update(threadData)
            .eq('id', existingThread.id);
          
          if (updateError) {
            logger.error('Error updating thread', { 
              error: updateError, 
              thread_id: existingThread.id 
            });
            failed++;
          } else {
            updated++;
          }
        } else {
          // Insert new thread
          const { error: insertError } = await supabaseClient
            .from('threads')
            .insert(threadData);
          
          if (insertError) {
            logger.error('Error inserting thread', { 
              error: insertError, 
              chat_guid: thread.chat_guid 
            });
            failed++;
          } else {
            inserted++;
          }
        }
      } catch (error) {
        logger.error('Error processing chat thread', { 
          error, 
          chat_id: thread.chat_id 
        });
        failed++;
      }
    }
    
    const results = { total: chatThreads.length, inserted, updated, failed };
    logger.info('Chat thread synchronization complete', results);
    return results;
  } catch (error) {
    logger.error('Thread synchronization failed', { error });
    throw error;
  }
}

module.exports = {
  syncThreads,
  getChatThreads,
  getChatParticipants
};
