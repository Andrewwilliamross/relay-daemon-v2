const { setupLogger } = require('../utils/logger');

const logger = setupLogger();

async function setupPollingFallback(supabase, { onMessage, interval = 5000 }) {
    logger.info('Setting up polling fallback');

    let isRunning = false;
    let lastPollTime = null;

    async function poll() {
        if (!isRunning) return;

        try {
            const now = new Date();
            const query = supabase
                .from('messages_in')
                .select('*')
                .eq('status', 'received')
                .order('received_at', { ascending: true });

            if (lastPollTime) {
                query.gt('received_at', lastPollTime.toISOString());
            }

            const { data: messages, error } = await query;

            if (error) {
                throw error;
            }

            if (messages && messages.length > 0) {
                logger.info(`Polling found ${messages.length} new messages`);
                for (const message of messages) {
                    await onMessage(message);
                }
            }

            lastPollTime = now;
        } catch (error) {
            logger.error('Error during polling:', error);
        }

        // Schedule next poll
        setTimeout(poll, interval);
    }

    // Start polling
    isRunning = true;
    poll();

    // Return cleanup function
    return {
        stop: () => {
            logger.info('Stopping polling fallback');
            isRunning = false;
        }
    };
}

module.exports = {
    setupPollingFallback
}; 