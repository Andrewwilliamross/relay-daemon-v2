const sinon = require('sinon');
// Install fake timers before any other imports
let clock = sinon.useFakeTimers();

/**
 * Integration tests for Supabase Realtime with fallback
 */
const { describe, it, beforeEach, afterEach } = require('mocha');
const proxyquire = require('proxyquire');
const { logger } = require('../../src/utils/logger');
// Commenting out Chai temporarily for these tests
// const chai = require('chai');
// const expect = chai.expect;
const assert = require('assert');

describe('Supabase Realtime Manager Integration', () => {
  let supabaseStub;
  let channelStub;
  let loggerStub;
  let messageHandlerStub;
  // let clock; // Already defined at top
  let realtimeManagerInstanceForTest;
  let pollPendingMessagesStub;
  
  beforeEach(() => {
    // Use fake timers (already set at top)
    // clock = sinon.useFakeTimers();

    // Setup stubs
    channelStub = {
      on: sinon.stub().returnsThis(),
      subscribe: sinon.stub().callsFake(function(callback) {
        // Store the callback for later use
        channelStub.subscribeCallback = (status) => {
          if (callback) {
            callback(status);
          }
        };
        return channelStub;
      }),
      unsubscribe: sinon.stub()
    };
    
    supabaseStub = {
      channel: sinon.stub().returns(channelStub),
      from: sinon.stub().returnsThis(),
      select: sinon.stub().returnsThis(),
      eq: sinon.stub().returnsThis(),
      order: sinon.stub().returnsThis()
    };
    
    // Create message handler stub
    messageHandlerStub = sinon.stub().resolves();
    
    // Create logger stub object
    loggerStub = {
      info: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub(),
      warn: sinon.stub()
    };

    // Load the RealtimeManager class with stubbed dependencies
    const { RealtimeManager } = proxyquire('../../src/supabase/realtime', {
      './client': {
        supabaseClient: supabaseStub
      },
      '../utils/logger': {
        logger: loggerStub
      }
    });

    // Create a new instance for testing with injected dependencies
    realtimeManagerInstanceForTest = new RealtimeManager({
      supabaseClientInstance: supabaseStub,
      loggerInstance: loggerStub
    });

    // Create pollPendingMessages stub on the test instance
    pollPendingMessagesStub = sinon.stub(realtimeManagerInstanceForTest, 'pollPendingMessages').callsFake(async () => {
      // Simulate finding and processing messages
      const mockData = {
        data: [
          { id: 'msg1', thread_id: 'thread1', text: 'Hello', status: 'pending' },
          { id: 'msg2', thread_id: 'thread2', text: 'World', status: 'pending' }
        ],
        error: null
      };
      
      if (mockData && mockData.data) {
        for (const message of mockData.data) {
          await messageHandlerStub(message);
        }
        loggerStub.info(`Polling found ${mockData.data.length} pending messages`);
      }
      return Promise.resolve();
    });
  });
  
  afterEach(() => {
    // Restore all stubs and timers
    sinon.restore();
    clock.restore();
  });
  
  describe('initialize', () => {
    it('should setup Realtime subscription', async () => {
      await realtimeManagerInstanceForTest.initialize(messageHandlerStub);
      
      assert.strictEqual(supabaseStub.channel.calledWith('messages_out_changes'), true, 'Should create channel with correct name');
      assert.strictEqual(channelStub.on.calledWith('postgres_changes'), true, 'Should setup postgres changes listener');
      assert.strictEqual(channelStub.subscribe.called, true, 'Should subscribe to channel');
    });
    
    it('should start polling if Realtime subscription fails', async () => {
      // Setup Supabase to return error on select
      supabaseStub.order.returns({
        data: [],
        error: null
      });
      
      // Make subscribe callback trigger error
      channelStub.subscribe.callsFake(callback => {
        callback('CHANNEL_ERROR');
        return channelStub;
      });
      
      await realtimeManagerInstanceForTest.initialize(messageHandlerStub);
      
      // Yield to event loop and tick clock
      await Promise.resolve();
      clock.tick(0);
      
      const currentPollingState = realtimeManagerInstanceForTest.isPolling;
      assert.strictEqual(currentPollingState, true, `Assertion failed: Expected isPolling to be true, but got ${currentPollingState}`);
      assert.strictEqual(loggerStub.error.calledWith('Realtime subscription error'), true, 'Should log subscription error');
    });
  });
  
  describe('Realtime subscription', () => {
    it('should process messages received via Realtime', async () => {
      await realtimeManagerInstanceForTest.initialize(messageHandlerStub);
      
      // Simulate receiving a message via Realtime
      const payload = {
        new: {
          id: 'msg123',
          thread_id: 'thread456',
          text: 'Hello world',
          status: 'pending'
        }
      };
      
      // Get the handler function that was registered with on()
      const onHandler = channelStub.on.firstCall.args[2];
      await onHandler(payload);
      
      assert.strictEqual(messageHandlerStub.calledWith(payload.new), true, 'Should process received message');
      assert.strictEqual(loggerStub.debug.calledWith('Received Realtime message'), true, 'Should log received message');
    });
    
    it('should switch to polling if Realtime connection fails', async () => {
      // Setup initial state
      await realtimeManagerInstanceForTest.initialize(messageHandlerStub);
      
      // Simulate successful initial connection
      channelStub.subscribeCallback('SUBSCRIBED');
      await new Promise(resolve => setImmediate(resolve));
      
      // Verify initial state
      assert.strictEqual(realtimeManagerInstanceForTest.isRealtimeConnected, true, 'isRealtimeConnected should be true initially');
      assert.strictEqual(realtimeManagerInstanceForTest.isPolling, false, 'isPolling should be false initially');
      
      // Simulate Realtime connection failure
      channelStub.subscribeCallback('CHANNEL_ERROR');
      
      // Yield to event loop and tick clock
      await Promise.resolve();
      clock.tick(0);
      
      const currentPollingState = realtimeManagerInstanceForTest.isPolling;
      assert.strictEqual(currentPollingState, true, `Assertion failed: Expected isPolling to be true, but got ${currentPollingState}`);
      assert.strictEqual(loggerStub.error.calledWith('Realtime subscription error'), true, 'Should log subscription error');
    });
  });
  
  describe('Polling fallback', () => {
    it('should poll for pending messages at regular intervals', async () => {
      // Create a synchronous version of pollPendingMessages for this test
      pollPendingMessagesStub.restore();
      pollPendingMessagesStub = sinon.stub(realtimeManagerInstanceForTest, 'pollPendingMessages').callsFake(() => {
        // Synchronously simulate processing
        messageHandlerStub({ id: 'msg1', thread_id: 'thread1', text: 'Hello', status: 'pending' });
        messageHandlerStub({ id: 'msg2', thread_id: 'thread2', text: 'World', status: 'pending' });
        loggerStub.info('Polling found 2 pending messages (SYNC STUB)');
      });

      // Initialize and force polling mode
      await realtimeManagerInstanceForTest.initialize(messageHandlerStub);
      
      // Verify initial state
      assert.strictEqual(realtimeManagerInstanceForTest.isPolling, false, 'isPolling should be false initially');
      
      // Trigger polling mode by simulating subscription callback
      const subscribeCallback = channelStub.subscribe.firstCall.args[0];
      subscribeCallback('CHANNEL_ERROR');
      
      // Yield to event loop and tick clock
      await Promise.resolve();
      clock.tick(0);
      
      const currentPollingState = realtimeManagerInstanceForTest.isPolling;
      assert.strictEqual(currentPollingState, true, `Assertion failed: Expected isPolling to be true, but got ${currentPollingState}`);
      assert.strictEqual(pollPendingMessagesStub.called, true, 'pollPendingMessages should be called');
      assert.strictEqual(messageHandlerStub.calledTwice, true, 'messageHandler should be called twice');
    });
    
    it('should switch back to Realtime when connection is restored', async () => {
      await realtimeManagerInstanceForTest.initialize(messageHandlerStub);
      
      // Force switch to polling mode
      realtimeManagerInstanceForTest.isRealtimeConnected = false;
      realtimeManagerInstanceForTest.startPolling();
      
      // Verify polling is active
      assert.strictEqual(realtimeManagerInstanceForTest.isPolling, true, 'isPolling should be true');
      
      // Simulate Realtime connection restoration
      channelStub.subscribeCallback('SUBSCRIBED');
      
      // Allow async state changes to complete
      await Promise.resolve();
      
      // Verify state after restoration
      assert.strictEqual(realtimeManagerInstanceForTest.isRealtimeConnected, true, 'Realtime should be connected');
      assert.strictEqual(realtimeManagerInstanceForTest.isPolling, false, 'Polling should be stopped');
      assert.strictEqual(loggerStub.info.calledWith('Stopping polling fallback, Realtime connection restored'), true, 'Should log polling stopped');
    });
  });
});
