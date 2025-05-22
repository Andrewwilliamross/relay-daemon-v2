/**
 * Implements P0 Priority: AppleScript Serialization
 * Ensures only one AppleScript execution at a time
 */
const { logger } = require('../utils/logger');
const { executeAppleScript, executeInlineAppleScript } = require('./executor');

class AppleScriptQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.mutex = Promise.resolve();
  }
  
  /**
   * Adds an AppleScript task to the queue
   * @param {string} scriptName - Name of the AppleScript to execute
   * @param {Object} params - Parameters to pass to the script
   * @returns {Promise} - Resolves when the script execution is complete
   */
  async enqueue(scriptName, params = {}) {
    return new Promise((resolve, reject) => {
      // Add task to queue
      this.queue.push({
        scriptName,
        params,
        resolve,
        reject,
        attempts: 0,
        maxAttempts: 3
      });
      
      logger.debug(`Task added to AppleScript queue: ${scriptName}`, { 
        queueDepth: this.queue.length 
      });
      
      // Start processing if not already in progress
      if (!this.processing) {
        this.processQueue();
      }
    });
  }
  
  /**
   * Adds an inline AppleScript task to the queue
   * @param {string} script - AppleScript code to execute
   * @returns {Promise} - Resolves when the script execution is complete
   */
  async enqueueInline(script) {
    return new Promise((resolve, reject) => {
      // Add task to queue
      this.queue.push({
        inline: true,
        script,
        resolve,
        reject,
        attempts: 0,
        maxAttempts: 3
      });
      
      logger.debug(`Inline script task added to AppleScript queue`, { 
        queueDepth: this.queue.length 
      });
      
      // Start processing if not already in progress
      if (!this.processing) {
        this.processQueue();
      }
    });
  }
  
  /**
   * Processes the queue one task at a time
   */
  async processQueue() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }
    
    this.processing = true;
    const task = this.queue.shift();
    
    // Use mutex to ensure only one execution at a time
    this.mutex = this.mutex.then(async () => {
      try {
        if (task.inline) {
          logger.debug(`Executing inline AppleScript`, { 
            queueDepth: this.queue.length + 1,
            attempt: task.attempts + 1
          });
          
          const result = await executeInlineAppleScript(task.script);
          task.resolve(result);
        } else {
          logger.debug(`Executing AppleScript: ${task.scriptName}`, { 
            queueDepth: this.queue.length + 1,
            attempt: task.attempts + 1
          });
          
          const result = await executeAppleScript(task.scriptName, task.params);
          task.resolve(result);
        }
      } catch (error) {
        const scriptInfo = task.inline ? 'inline script' : task.scriptName;
        logger.error(`AppleScript execution failed: ${scriptInfo}`, { error });
        
        // Retry logic
        if (task.attempts < task.maxAttempts) {
          task.attempts++;
          logger.info(`Retrying AppleScript: ${scriptInfo} (Attempt ${task.attempts}/${task.maxAttempts})`);
          this.queue.unshift(task); // Put back at front of queue
        } else {
          task.reject(error);
        }
      }
      
      // Process next task
      this.processQueue();
    }).catch(error => {
      logger.error('Error in AppleScript queue processing', { error });
      // Continue processing the queue even if there was an error
      this.processQueue();
    });
  }
  
  /**
   * Gets the current queue depth
   * @returns {number} - Number of tasks in queue
   */
  getQueueDepth() {
    return this.queue.length;
  }
  
  /**
   * Clears the queue (for shutdown or reset)
   * @param {string} reason - Reason for clearing the queue
   */
  clearQueue(reason = 'unknown') {
    const queueSize = this.queue.length;
    
    if (queueSize > 0) {
      logger.warn(`Clearing AppleScript queue with ${queueSize} remaining tasks`, { reason });
      
      // Reject all pending tasks
      this.queue.forEach(task => {
        task.reject(new Error(`Task cancelled: ${reason}`));
      });
      
      this.queue = [];
    }
  }
}

// Singleton instance
const appleScriptQueue = new AppleScriptQueue();

module.exports = { appleScriptQueue };
