const { setupLogger } = require('../utils/logger');
const { executeAppleScript } = require('../applescript/executor');
const { downloadAndValidateMedia } = require('../media/handler');

const logger = setupLogger();

async function processIncomingMessage(message, { supabase, mediaHandler, appleScriptQueue }) {
    logger.info('Processing incoming message:', { messageId: message.id });

    try {
        // Update message status to processing
        await supabase
            .from('messages_in')
            .update({ status: 'processing' })
            .eq('id', message.id);

        // Handle media attachments if present
        if (message.has_attachments && message.attachments) {
            for (const attachment of message.attachments) {
                try {
                    const mediaResult = await downloadAndValidateMedia(attachment.url, mediaHandler);
                    if (!mediaResult.success) {
                        logger.error('Failed to process media attachment:', {
                            messageId: message.id,
                            attachmentId: attachment.id,
                            error: mediaResult.error
                        });
                    }
                } catch (error) {
                    logger.error('Error processing media attachment:', {
                        messageId: message.id,
                        attachmentId: attachment.id,
                        error
                    });
                }
            }
        }

        // Update message status to processed
        await supabase
            .from('messages_in')
            .update({ status: 'processed' })
            .eq('id', message.id);

        logger.info('Successfully processed incoming message:', { messageId: message.id });
    } catch (error) {
        logger.error('Error processing incoming message:', {
            messageId: message.id,
            error
        });

        // Update message status to failed
        await supabase
            .from('messages_in')
            .update({
                status: 'failed',
                error: error.message
            })
            .eq('id', message.id);
    }
}

async function processOutgoingMessage(message, { supabase, mediaHandler, appleScriptQueue }) {
    logger.info('Processing outgoing message:', { messageId: message.id });

    try {
        // Update message status to processing
        await supabase
            .from('messages_out')
            .update({ status: 'processing' })
            .eq('id', message.id);

        // Queue AppleScript command to send message
        await appleScriptQueue.enqueue(async () => {
            try {
                // Handle media if present
                let mediaPath = null;
                if (message.media_url) {
                    const mediaResult = await downloadAndValidateMedia(message.media_url, mediaHandler);
                    if (!mediaResult.success) {
                        throw new Error(`Failed to process media: ${mediaResult.error}`);
                    }
                    mediaPath = mediaResult.filePath;
                }

                // Execute AppleScript to send message
                const script = `
                    tell application "Messages"
                        set targetService to 1st service whose service type = iMessage
                        set targetBuddy to buddy "${message.recipient}" of targetService
                        send "${message.text}" to targetBuddy
                        ${mediaPath ? `send POSIX file "${mediaPath}" to targetBuddy` : ''}
                    end tell
                `;

                await executeAppleScript(script);

                // Update message status to sent
                await supabase
                    .from('messages_out')
                    .update({ status: 'sent' })
                    .eq('id', message.id);

                logger.info('Successfully sent outgoing message:', { messageId: message.id });
            } catch (error) {
                logger.error('Error sending message via AppleScript:', {
                    messageId: message.id,
                    error
                });

                // Update message status to failed
                await supabase
                    .from('messages_out')
                    .update({
                        status: 'failed',
                        error: error.message
                    })
                    .eq('id', message.id);

                throw error;
            }
        });
    } catch (error) {
        logger.error('Error processing outgoing message:', {
            messageId: message.id,
            error
        });

        // Update message status to failed
        await supabase
            .from('messages_out')
            .update({
                status: 'failed',
                error: error.message
            })
            .eq('id', message.id);
    }
}

module.exports = {
    processIncomingMessage,
    processOutgoingMessage
}; 