#!/usr/bin/env node

const { setupLogger } = require('./utils/logger');
const { validateEnvironment } = require('./core/bootstrap');
const { startMessageMonitor } = require('./core/messageMonitor');
const { initializeSupabase } = require('./supabase/client');
const { setupMediaHandler } = require('./media/handler');
const { setupAppleScriptQueue } = require('./applescript/queue');
const { loadConfig } = require('./config/loader');

async function main() {
    try {
        // Initialize logger
        const logger = setupLogger();
        logger.info('Starting iMessage Relay Daemon v2');

        // Load configuration
        const config = loadConfig();
        logger.info('Configuration loaded');

        // Validate environment and permissions
        await validateEnvironment();
        logger.info('Environment validation passed');

        // Initialize Supabase client
        const supabase = await initializeSupabase(config);
        logger.info('Supabase client initialized');

        // Setup media handler
        const mediaHandler = await setupMediaHandler(config);
        logger.info('Media handler initialized');

        // Setup AppleScript queue
        const appleScriptQueue = setupAppleScriptQueue();
        logger.info('AppleScript queue initialized');

        // Start message monitoring
        await startMessageMonitor({
            supabase,
            mediaHandler,
            appleScriptQueue,
            config
        });
        logger.info('Message monitoring started');

        // Handle graceful shutdown
        process.on('SIGTERM', async () => {
            logger.info('Received SIGTERM signal');
            await appleScriptQueue.shutdown();
            process.exit(0);
        });

        process.on('SIGINT', async () => {
            logger.info('Received SIGINT signal');
            await appleScriptQueue.shutdown();
            process.exit(0);
        });

    } catch (error) {
        console.error('Fatal error during startup:', error);
        process.exit(1);
    }
}

main(); 