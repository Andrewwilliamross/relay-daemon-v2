/**
 * Supabase client configuration and initialization
 */
const { createClient } = require('@supabase/supabase-js');
const { logger } = require('../utils/logger');
require('dotenv').config();

// Validate required environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  logger.critical('Missing required Supabase environment variables', {
    SUPABASE_URL_SET: !!SUPABASE_URL,
    SUPABASE_KEY_SET: !!SUPABASE_KEY
  });
  throw new Error('Missing required Supabase environment variables. Please set SUPABASE_URL and SUPABASE_KEY.');
}

// Initialize Supabase client
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

/**
 * Test Supabase connectivity
 * @returns {Promise<boolean>} Whether connection is successful
 */
async function testConnection() {
  try {
    const { data, error } = await supabaseClient
      .from('logs')
      .select('id')
      .limit(1);
    
    if (error) {
      logger.error('Supabase connection test failed', { error });
      return false;
    }
    
    logger.info('Supabase connection test successful');
    return true;
  } catch (error) {
    logger.error('Supabase connection test error', { error });
    return false;
  }
}

module.exports = {
  supabaseClient,
  testConnection
};
