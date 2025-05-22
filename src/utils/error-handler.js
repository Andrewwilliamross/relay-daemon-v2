/**
 * Centralized error handling utilities
 * Provides consistent error handling across the application
 */
const { logger } = require('./logger');

/**
 * Error types for the application
 */
const ErrorTypes = {
  BOOTSTRAP: 'BOOTSTRAP_ERROR',
  APPLESCRIPT: 'APPLESCRIPT_ERROR',
  SUPABASE: 'SUPABASE_ERROR',
  MEDIA: 'MEDIA_ERROR',
  DATABASE: 'DATABASE_ERROR',
  NETWORK: 'NETWORK_ERROR',
  PERMISSION: 'PERMISSION_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR'
};

/**
 * Application-specific error class
 */
class AppError extends Error {
  constructor(message, type = ErrorTypes.UNKNOWN, details = {}) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
  
  /**
   * Convert to JSON for logging
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Handle an error with consistent logging and optional recovery action
 * @param {Error} error - The error to handle
 * @param {string} context - Context where the error occurred
 * @param {Object} metadata - Additional metadata for logging
 * @param {Function} recoveryAction - Optional recovery function to execute
 * @returns {Promise<any>} - Result of recovery action or null
 */
async function handleError(error, context, metadata = {}, recoveryAction = null) {
  // Normalize error to AppError
  const appError = error instanceof AppError 
    ? error 
    : new AppError(error.message, ErrorTypes.UNKNOWN, { originalError: error.toString() });
  
  // Log the error with context
  logger.error(`Error in ${context}: ${appError.message}`, {
    error: appError,
    context,
    ...metadata
  });
  
  // Execute recovery action if provided
  if (recoveryAction && typeof recoveryAction === 'function') {
    try {
      logger.info(`Attempting recovery for error in ${context}`);
      return await recoveryAction(appError);
    } catch (recoveryError) {
      logger.error(`Recovery failed for error in ${context}`, {
        originalError: appError,
        recoveryError
      });
      return null;
    }
  }
  
  return null;
}

/**
 * Create a retry wrapper for async functions
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Function} - Wrapped function with retry logic
 */
function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    exponentialBackoff = true,
    retryCondition = () => true,
    onRetry = () => {}
  } = options;
  
  return async (...args) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
        
        // Check if we should retry
        if (attempt <= maxRetries && retryCondition(error)) {
          // Calculate delay with exponential backoff if enabled
          const delay = exponentialBackoff
            ? retryDelay * Math.pow(2, attempt - 1)
            : retryDelay;
          
          logger.info(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms`, {
            function: fn.name,
            error: error.message
          });
          
          // Execute onRetry callback
          await onRetry(error, attempt);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // We've exhausted retries or condition says don't retry
          throw lastError;
        }
      }
    }
  };
}

/**
 * Create a circuit breaker for functions that might fail repeatedly
 * @param {Function} fn - Function to protect
 * @param {Object} options - Circuit breaker options
 * @returns {Function} - Protected function
 */
function withCircuitBreaker(fn, options = {}) {
  const {
    failureThreshold = 5,
    resetTimeout = 30000,
    fallback = null
  } = options;
  
  let failures = 0;
  let circuitOpen = false;
  let lastFailureTime = null;
  
  return async (...args) => {
    // Check if circuit is open
    if (circuitOpen) {
      // Check if reset timeout has elapsed
      if (lastFailureTime && Date.now() - lastFailureTime > resetTimeout) {
        // Allow one request through to test if the issue is resolved
        circuitOpen = false;
        logger.info(`Circuit breaker reset for ${fn.name}`);
      } else {
        logger.warn(`Circuit open for ${fn.name}, using fallback`);
        return fallback ? fallback(...args) : null;
      }
    }
    
    try {
      const result = await fn(...args);
      // Reset failures on success
      failures = 0;
      return result;
    } catch (error) {
      failures++;
      lastFailureTime = Date.now();
      
      logger.warn(`Function ${fn.name} failed, failures: ${failures}/${failureThreshold}`, {
        error: error.message
      });
      
      // Open circuit if threshold reached
      if (failures >= failureThreshold) {
        circuitOpen = true;
        logger.error(`Circuit breaker opened for ${fn.name} after ${failures} failures`);
      }
      
      // If fallback is provided, use it
      if (fallback) {
        return fallback(...args);
      }
      
      throw error;
    }
  };
}

module.exports = {
  AppError,
  ErrorTypes,
  handleError,
  withRetry,
  withCircuitBreaker
};
