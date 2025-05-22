/**
 * Unit tests for the bootstrap module
 */
const { describe, it, beforeEach, afterEach } = require('mocha');
const sinon = require('sinon');
const chai = require('chai');
const expect = chai.expect;
const proxyquire = require('proxyquire');

describe('Bootstrap Module', () => {
  let loggerInfoStub;
  let loggerErrorStub;
  let loggerCriticalStub;
  let mockExecPromise;
  let fsStubs;
  let bootstrap;
  
  beforeEach(() => {
    // Stub logger methods
    loggerInfoStub = sinon.stub(require('../../src/utils/logger').logger, 'info');
    loggerErrorStub = sinon.stub(require('../../src/utils/logger').logger, 'error');
    loggerCriticalStub = sinon.stub(require('../../src/utils/logger').logger, 'critical');
    
    // Create mock execPromise
    mockExecPromise = sinon.stub();
    
    // Create fs stubs
    fsStubs = {
      mkdir: sinon.stub().resolves(),
      writeFile: sinon.stub().resolves(),
      unlink: sinon.stub().resolves(),
      access: sinon.stub().resolves()
    };

    // Use proxyquire to load bootstrap with mocked dependencies
    bootstrap = proxyquire('../../src/core/bootstrap', {
      '../utils/shell-executor': { 
        execPromise: mockExecPromise,
        '@noCallThru': true 
      },
      'fs/promises': {
        mkdir: fsStubs.mkdir,
        writeFile: fsStubs.writeFile,
        unlink: fsStubs.unlink,
        access: fsStubs.access,
        '@noCallThru': true
      }
    });
  });
  
  afterEach(() => {
    sinon.restore();
  });
  
  describe('checkMessagesRunning', () => {
    it('should return success when Messages.app is running', async () => {
      mockExecPromise.withArgs('ps aux | grep -v grep | grep "/Applications/Messages.app" || true')
        .resolves({ stdout: '/Applications/Messages.app\n' });
      
      const result = await bootstrap.checkMessagesRunning();
      expect(result.success).to.be.true;
      expect(result.message).to.equal('Messages.app running check');
      expect(result.details).to.equal('Messages.app is running');
    });
    
    it('should return failure when Messages.app is not running', async () => {
      mockExecPromise.withArgs('ps aux | grep -v grep | grep "/Applications/Messages.app" || true')
        .resolves({ stdout: '' });
      
      const result = await bootstrap.checkMessagesRunning();
      expect(result.success).to.be.false;
      expect(result.message).to.equal('Messages.app running check');
      expect(result.details).to.equal('Messages.app is not running');
    });

    it('should handle errors gracefully', async () => {
      mockExecPromise.withArgs('ps aux | grep -v grep | grep "/Applications/Messages.app" || true')
        .rejects(new Error('Command failed'));
      
      const result = await bootstrap.checkMessagesRunning();
      expect(result.success).to.be.false;
      expect(result.message).to.equal('Messages.app running check failed');
      expect(result.error).to.equal('Command failed');
    });
  });
  
  describe('checkAutomationPermissions', () => {
    it('should return success when automation permissions are granted', async () => {
      mockExecPromise.withArgs('osascript /tmp/check_permissions.scpt')
        .resolves({ stdout: 'true\n' });
      
      const result = await bootstrap.checkAutomationPermissions();
      expect(result.success).to.be.true;
      expect(result.message).to.equal('Automation permissions check');
      expect(result.details).to.equal('Automation permissions granted');
    });

    it('should return failure when automation permissions are not granted', async () => {
      mockExecPromise.withArgs('osascript /tmp/check_permissions.scpt')
        .resolves({ stdout: 'false\n' });
      
      const result = await bootstrap.checkAutomationPermissions();
      expect(result.success).to.be.false;
      expect(result.message).to.equal('Automation permissions check');
      expect(result.details).to.equal('Automation permissions not granted');
    });

    it('should handle errors gracefully', async () => {
      mockExecPromise.withArgs('osascript /tmp/check_permissions.scpt')
        .rejects(new Error('Not authorized'));
      
      const result = await bootstrap.checkAutomationPermissions();
      expect(result.success).to.be.false;
      expect(result.message).to.equal('Automation permissions check failed');
      expect(result.error).to.equal('Not authorized');
    });
  });
  
  describe('runBootstrapChecks', () => {
    it('should return success when all checks pass', async () => {
      // Setup all checks to pass
      mockExecPromise.withArgs('ps aux | grep -v grep | grep "/Applications/Messages.app" || true')
        .resolves({ stdout: '/Applications/Messages.app\n' });
      mockExecPromise.withArgs('osascript /tmp/check_permissions.scpt')
        .resolves({ stdout: 'true\n' });
      
      const result = await bootstrap.runBootstrapChecks();
      
      expect(result.success).to.be.true;
      expect(result.message).to.equal('Bootstrap checks completed');
      expect(result.details).to.equal('All checks passed');
      expect(result.checks).to.have.lengthOf(4);
      expect(result.checks.every(check => check.success)).to.be.true;
    });
    
    it('should return failure when any critical check fails', async () => {
      // Setup Messages.app check to fail
      mockExecPromise.withArgs('ps aux | grep -v grep | grep "/Applications/Messages.app" || true')
        .resolves({ stdout: '' });
      mockExecPromise.withArgs('osascript /tmp/check_permissions.scpt')
        .resolves({ stdout: 'true\n' });
      
      const result = await bootstrap.runBootstrapChecks();
      
      expect(result.success).to.be.false;
      expect(result.message).to.equal('Bootstrap checks failed');
      expect(result.details).to.equal('Messages.app is not running');
      expect(result.checks).to.have.lengthOf(4);
      expect(result.checks.some(check => !check.success)).to.be.true;
    });

    it('should handle errors gracefully', async () => {
      // Setup an error in one of the checks
      mockExecPromise.withArgs('ps aux | grep -v grep | grep "/Applications/Messages.app" || true')
        .rejects(new Error('Command failed'));
      mockExecPromise.withArgs('osascript /tmp/check_permissions.scpt')
        .resolves({ stdout: 'true\n' });
      
      const result = await bootstrap.runBootstrapChecks();
      
      expect(result.success).to.be.false;
      expect(result.message).to.equal('Bootstrap checks failed');
      expect(result.details).to.equal('Command failed');
      expect(result.checks).to.have.lengthOf(4);
      expect(result.checks.some(check => !check.success)).to.be.true;
    });
  });
});
