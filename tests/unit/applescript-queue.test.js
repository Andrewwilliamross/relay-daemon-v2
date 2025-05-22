/**
 * Unit tests for AppleScript queue module
 */
const { describe, it, beforeEach, afterEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { logger } = require('../../src/utils/logger');
const assert = require('assert');

let appleScriptQueue;
let executeAppleScriptStub;
let executeInlineAppleScriptStub;
let loggerStub;

function resetQueue(queue) {
  queue.clearQueue('test reset');
  queue.queue = [];
  queue.processing = false;
  queue.mutex = Promise.resolve();
}

describe('AppleScript Queue Module', () => {
  beforeEach(() => {
    // Stub executor methods
    executeAppleScriptStub = sinon.stub();
    executeInlineAppleScriptStub = sinon.stub();

    // Stub logger methods
    loggerStub = {
      debug: sinon.stub(logger, 'debug'),
      info: sinon.stub(logger, 'info'),
      error: sinon.stub(logger, 'error'),
      warn: sinon.stub(logger, 'warn')
    };

    // Proxyquire the queue module with executor stubs
    const proxied = proxyquire('../../src/applescript/queue', {
      './executor': {
        executeAppleScript: executeAppleScriptStub,
        executeInlineAppleScript: executeInlineAppleScriptStub,
        '@noCallThru': true
      }
    });
    appleScriptQueue = proxied.appleScriptQueue;
    resetQueue(appleScriptQueue);
  });

  afterEach(() => {
    sinon.restore();
    resetQueue(appleScriptQueue);
  });

  describe('enqueue', () => {
    it('should execute AppleScript and resolve with result', async () => {
      // Setup successful execution
      executeAppleScriptStub.resolves('OK');

      const result = await appleScriptQueue.enqueue('test_script', { param1: 'value1' });

      expect(result).to.equal('OK');
      expect(executeAppleScriptStub.calledOnce).to.be.true;
      expect(executeAppleScriptStub.firstCall.args[0]).to.equal('test_script');
      expect(executeAppleScriptStub.firstCall.args[1]).to.deep.equal({ param1: 'value1' });
    });

    it('should retry failed AppleScript execution', async () => {
      // Setup failed execution followed by success
      executeAppleScriptStub.onFirstCall().rejects(new Error('execution failed'));
      executeAppleScriptStub.onSecondCall().resolves('OK');

      const result = await appleScriptQueue.enqueue('test_script');

      expect(result).to.equal('OK');
      expect(executeAppleScriptStub.calledTwice).to.be.true;
      expect(loggerStub.error.calledOnce).to.be.true;
      expect(loggerStub.info.calledWith(sinon.match(/Retrying AppleScript/))).to.be.true;
    });

    it('should reject after maximum retry attempts', async () => {
      // Setup consistently failed execution
      const error = new Error('execution failed');
      executeAppleScriptStub.rejects(error);

      try {
        await appleScriptQueue.enqueue('test_script');
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.equal('execution failed');
        expect(executeAppleScriptStub.callCount).to.equal(4); // Initial + 3 retries
        expect(loggerStub.error.callCount).to.equal(4);
      }
    });
  });

  describe('enqueueInline', () => {
    it('should execute inline AppleScript and resolve with result', async () => {
      // Setup successful execution
      executeInlineAppleScriptStub.resolves('Messages');

      const result = await appleScriptQueue.enqueueInline('tell application "Messages" to get name');

      expect(result).to.equal('Messages');
      expect(executeInlineAppleScriptStub.calledOnce).to.be.true;
      expect(executeInlineAppleScriptStub.firstCall.args[0]).to.equal('tell application "Messages" to get name');
    });
  });

  describe('serialization', () => {
    it('should process AppleScript tasks one at a time', async () => {
      // Setup delayed executions to test serialization
      const results = ['OK1', 'OK2', 'OK3'];
      let callCount = 0;

      executeAppleScriptStub.callsFake(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(results[callCount++]);
          }, 50);
        });
      });

      // Queue multiple tasks
      const promise1 = appleScriptQueue.enqueue('script1');
      const promise2 = appleScriptQueue.enqueue('script2');
      const promise3 = appleScriptQueue.enqueue('script3');

      // Wait for all to complete
      const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

      // Verify results
      expect(result1).to.equal('OK1');
      expect(result2).to.equal('OK2');
      expect(result3).to.equal('OK3');

      // Verify execution order
      const calls = executeAppleScriptStub.getCalls();
      expect(calls[0].args[0]).to.equal('script1');
      expect(calls[1].args[0]).to.equal('script2');
      expect(calls[2].args[0]).to.equal('script3');

      // Verify each call completed before the next started
      expect(executeAppleScriptStub.calledThrice).to.be.true;
    });
  });

  describe('clearQueue', () => {
    it('should clear pending tasks and reject them', async () => {
      // Setup a delayed execution for the first task
      executeAppleScriptStub.callsFake(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve('OK'), 100);
        });
      });

      // Queue multiple tasks
      const promise1 = appleScriptQueue.enqueue('script1');
      const promise2 = appleScriptQueue.enqueue('script2');
      const promise3 = appleScriptQueue.enqueue('script3');

      // Clear the queue after a short delay
      setTimeout(() => {
        appleScriptQueue.clearQueue('test shutdown');
      }, 50);

      // First task should succeed, others should be rejected
      await promise1;

      // Handle rejections synchronously
      const results = await Promise.allSettled([promise2, promise3]);
      
      // Verify results
      assert.strictEqual(results[0].status, 'rejected', 'Promise 2 should be rejected');
      assert.strictEqual(results[0].reason.message, 'Task cancelled: test shutdown', 'Promise 2 should have correct error message');
      
      assert.strictEqual(results[1].status, 'rejected', 'Promise 3 should be rejected');
      assert.strictEqual(results[1].reason.message, 'Task cancelled: test shutdown', 'Promise 3 should have correct error message');

      assert.strictEqual(executeAppleScriptStub.calledOnce, true, 'Should only execute first script');
      assert.strictEqual(loggerStub.warn.calledWith(sinon.match(/Clearing AppleScript queue/)), true, 'Should log queue clearing');
    });
  });
});
