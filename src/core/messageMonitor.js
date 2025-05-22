const { setupLogger } = require('../utils/logger');
const { setupRealtimeSubscription } = require('../supabase/realtime');
const { setupPollingFallback } = require('../supabase/polling');
const { processIncomingMessage } = require('./messageProcessor');
const { processOutgoingMessage } = require('./messageProcessor');

const logger = setupLogger();

async function startMessageMonitor({ supabase, mediaHandler, appleScriptQueue, config }) {
    logger.info('Starting message monitoring');

    // Setup realtime subscription
    const realtimeSubscription = await setupRealtimeSubscription(supabase, {
        onMessage: async (message) => {
            try {
                await processIncomingMessage(message, {
                    supabase,
                    mediaHandler,
                    appleScriptQueue
                });
            } catch (error) {
                logger.error('Error processing incoming message:', error);
            }
        }
    });

    // Setup polling fallback
    const pollingFallback = await setupPollingFallback(supabase, {
        onMessage: async (message) => {
            try {
                await processIncomingMessage(message, {
                    supabase,
                    mediaHandler,
                    appleScriptQueue
                });
            } catch (error) {
                logger.error('Error processing incoming message from polling:', error);
            }
        },
        interval: config.POLLING_INTERVAL || 5000
    });

    // Start monitoring outgoing messages
    const outgoingMonitor = setInterval(async () => {
        try {
            const messages = await supabase
                .from('messages_out')
                .select('*')
                .eq('status', 'pending')
                .limit(10);

            if (messages.data && messages.data.length > 0) {
                for (const message of messages.data) {
                    await processOutgoingMessage(message, {
                        supabase,
                        mediaHandler,
                        appleScriptQueue
                    });
                }
            }
        } catch (error) {
            logger.error('Error processing outgoing messages:', error);
        }
    }, config.POLLING_INTERVAL || 5000);

    // Return cleanup function
    return {
        stop: async () => {
            logger.info('Stopping message monitoring');
            clearInterval(outgoingMonitor);
            await realtimeSubscription.unsubscribe();
            await pollingFallback.stop();
        }
    };
}

module.exports = {
    startMessageMonitor
}; 