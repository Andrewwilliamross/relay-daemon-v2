/**
 * Implements M4: Supabase Realtime Fallback Redundancy
 * Manages Realtime subscription with polling fallback
 */
const { supabaseClient } = require('./client');
const { logger } = require('../utils/logger');

class RealtimeManager {
  constructor({ 
    setIntervalFunc = global.setInterval, 
    clearIntervalFunc = global.clearInterval, 
    supabaseClientInstance = supabaseClient,
    loggerInstance = logger 
  } = {}) {
    this.subscription = null;
    this.pollingInterval = null;
    this.pollingFrequency = 5000; // 5 seconds
    this.isPolling = false;
    this.isRealtimeConnected = false;
    this.lastPollTime = null;
    this.messageHandler = null;
    
    // Store injected dependencies
    this.setInterval = setIntervalFunc;
    this.clearInterval = clearIntervalFunc;
    this.supabaseClient = supabaseClientInstance;
    this.logger = loggerInstance;
  }
  
  /**
   * Initialize Realtime subscription and setup fallback
   * @param {Function} messageHandler - Function to process new messages
   */
  async initialize(messageHandler) {
    if (!messageHandler || typeof messageHandler !== 'function') {
      throw new Error('Message handler must be a function');
    }
    
    this.messageHandler = messageHandler;
    this.logger.info('Initializing Supabase Realtime connection');
    
    try {
      // Setup Realtime subscription
      this.setupRealtimeSubscription();
      
      // Initial check for pending messages (in case any were missed)
      try {
        await this.pollPendingMessages();
      } catch (pollError) {
        this.logger.error('Initial poll failed, but continuing with Realtime subscription', { error: pollError });
        // Don't start polling here, only on subscription failure
      }
    } catch (error) {
      this.logger.error('Failed to initialize Realtime connection', { error });
      // Start polling as fallback
      this.startPolling();
    }
  }
  
  /**
   * Setup Realtime subscription to messages_out table
   */
  setupRealtimeSubscription() {
    this.subscription = this.supabaseClient
      .channel('messages_out_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages_out',
          filter: 'status=eq.pending'
        },
        (payload) => {
          this.logger.debug('Received Realtime message', { 
            message_id: payload.new.id,
            thread_id: payload.new.thread_id
          });
          
          // Process the new outbound message
          if (this.messageHandler) {
            this.messageHandler(payload.new);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.logger.info('Realtime subscription active');
          this.isRealtimeConnected = true;
          
          // Stop polling if it was active as fallback
          if (this.isPolling) {
            this.stopPolling();
          }
        } else if (status === 'CHANNEL_ERROR') {
          this.logger.error('Realtime subscription error');
          this.isRealtimeConnected = false;
          
          // Start polling as fallback
          if (!this.isPolling) {
            this.startPolling();
          }
        }
      });
  }
  
  /**
   * Start polling for pending messages
   */
  startPolling() {
    try {
      if (this.isPolling) {
        return;
      }

      this.isPolling = true;
      
      // Clear any existing interval
      if (this.pollingInterval) {
        this.clearInterval(this.pollingInterval);
        this.pollingInterval = null;
      }
      
      // Use an arrow function for the interval callback
      this.pollingInterval = this.setInterval(() => {
        this.pollPendingMessages();
      }, this.pollingFrequency);
      
      // Verify the interval was set up correctly
      if (!this.pollingInterval) {
        this.logger.error('Failed to set up polling interval');
      }
    } catch (error) {
      this.logger.error('Error during polling setup', { error });
      throw error; // Re-throw to ensure test fails if there's an error
    }
  }
  
  /**
   * Stop polling for pending messages
   */
  stopPolling() {
    if (this.pollingInterval) {
      this.clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isPolling = false;
    this.logger.info('Stopping polling fallback, Realtime connection restored');
  }
  
  /**
   * Poll for pending messages in Supabase
   */
  async pollPendingMessages() {
    try {
      this.lastPollTime = new Date();
      
      // Query for pending messages
      const { data, error } = await this.supabaseClient
        .from('messages_out')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      
      if (error) {
        throw error;
      }
      
      if (data && data.length > 0) {
        this.logger.info(`Polling found ${data.length} pending messages`);
        
        // Process each pending message
        for (const message of data) {
          if (this.messageHandler) {
            await this.messageHandler(message);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error polling for pending messages', { error });
    }
  }
  
  /**
   * Check health of Realtime connection
   * @returns {Object} - Health status information
   */
  getHealthStatus() {
    return {
      realtimeConnected: this.isRealtimeConnected,
      isPolling: this.isPolling,
      lastPollTime: this.lastPollTime,
      pollingFrequency: this.pollingFrequency
    };
  }
  
  /**
   * Cleanup resources on shutdown
   */
  shutdown() {
    this.logger.info('Shutting down Realtime manager');
    
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
    
    if (this.pollingInterval) {
      this.clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    this.isPolling = false;
    this.isRealtimeConnected = false;
  }
}

// Singleton instance using default dependencies
const realtimeManager = new RealtimeManager();

module.exports = { 
  RealtimeManager, // Export the class for testing
  realtimeManager  // Export the singleton for app use
};
