const { setupLogger } = require('../utils/logger');
const dotenv = require('dotenv');

const logger = setupLogger();

function loadConfig() {
    // Load environment variables from .env file
    dotenv.config();

    // Required configuration
    const requiredVars = [
        'SUPABASE_URL',
        'SUPABASE_KEY'
    ];

    // Check for required environment variables
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Default configuration
    const config = {
        // Supabase configuration
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_KEY: process.env.SUPABASE_KEY,

        // Logging configuration
        LOG_LEVEL: process.env.LOG_LEVEL || 'info',
        ENABLE_SUPABASE_LOGGING: process.env.ENABLE_SUPABASE_LOGGING !== 'false',

        // Polling configuration
        POLLING_INTERVAL: parseInt(process.env.POLLING_INTERVAL || '5000', 10),

        // Media configuration
        MAX_MEDIA_SIZE: parseInt(process.env.MAX_MEDIA_SIZE || '104857600', 10), // 100MB default
        ALLOWED_MEDIA_TYPES: [
            'image/jpeg',
            'image/png',
            'image/gif',
            'video/mp4',
            'video/quicktime',
            'audio/mp4',
            'audio/mpeg'
        ],

        // AppleScript configuration
        MAX_SCRIPT_RETRIES: parseInt(process.env.MAX_SCRIPT_RETRIES || '3', 10),
        SCRIPT_TIMEOUT: parseInt(process.env.SCRIPT_TIMEOUT || '30000', 10), // 30 seconds default

        // Message processing configuration
        BATCH_SIZE: parseInt(process.env.BATCH_SIZE || '10', 10),
        MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '3', 10),
        RETRY_DELAY: parseInt(process.env.RETRY_DELAY || '5000', 10)
    };

    logger.info('Configuration loaded successfully');
    return config;
}

module.exports = {
    loadConfig
}; 