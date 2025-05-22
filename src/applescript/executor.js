/**
 * AppleScript execution module
 * Handles execution of AppleScript via osascript
 */
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs/promises');
const path = require('path');
const { logger } = require('../utils/logger');

// Promisify exec
const execPromise = util.promisify(exec);

// Path to AppleScript templates
const SCRIPTS_DIR = path.join(__dirname, 'scripts');

/**
 * Execute an AppleScript file with parameters
 * @param {string} scriptName - Name of the script file (without extension)
 * @param {Object} params - Parameters to pass to the script
 * @returns {Promise<string>} - Script execution result
 */
async function executeAppleScriptFile(scriptPath, params = {}) {
  try {
    // Build the osascript command
    let command = `osascript "${scriptPath}"`;
    
    // Add parameters if provided
    if (Object.keys(params).length > 0) {
      const paramStrings = Object.entries(params).map(([key, value]) => {
        // Escape quotes in string values
        if (typeof value === 'string') {
          value = value.replace(/"/g, '\\"');
        }
        return `${key}="${value}"`;
      });
      
      command += ' ' + paramStrings.join(' ');
    }
    
    // Execute the command
    const { stdout, stderr } = await execPromise(command);
    
    if (stderr) {
      logger.warn('AppleScript execution warning', { stderr });
    }
    
    return stdout.trim();
  } catch (error) {
    logger.error('AppleScript execution error', { 
      error: error.message,
      scriptPath,
      params
    });
    throw error;
  }
}

/**
 * Execute an AppleScript by name
 * @param {string} scriptName - Name of the script (without extension)
 * @param {Object} params - Parameters to pass to the script
 * @returns {Promise<string>} - Script execution result
 */
async function executeAppleScript(scriptName, params = {}) {
  // Check if script exists in scripts directory
  const scriptPath = path.join(SCRIPTS_DIR, `${scriptName}.applescript`);
  
  try {
    await fs.access(scriptPath);
    return executeAppleScriptFile(scriptPath, params);
  } catch (error) {
    // If script file doesn't exist, try to execute inline script
    if (error.code === 'ENOENT') {
      logger.error('AppleScript file not found', { scriptName, scriptPath });
      throw new Error(`AppleScript file not found: ${scriptName}`);
    }
    throw error;
  }
}

/**
 * Execute an inline AppleScript
 * @param {string} script - AppleScript code
 * @returns {Promise<string>} - Script execution result
 */
async function executeInlineAppleScript(script) {
  try {
    // Create a temporary file
    const tempFile = path.join('/tmp', `applescript_${Date.now()}.scpt`);
    await fs.writeFile(tempFile, script);
    
    // Execute the script
    const result = await executeAppleScriptFile(tempFile);
    
    // Clean up
    await fs.unlink(tempFile);
    
    return result;
  } catch (error) {
    logger.error('Inline AppleScript execution error', { error: error.message });
    throw error;
  }
}

module.exports = {
  executeAppleScript,
  executeInlineAppleScript
};
