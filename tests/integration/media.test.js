/**
 * Integration tests for media handling and validation
 */
const { describe, it, beforeEach, afterEach } = require('mocha');
const sinon = require('sinon');
const fsPromises = require('fs/promises');
const fs = require('fs');
const path = require('path');
const { validateMediaFile } = require('../../src/media/validator');
const { downloadAndValidateMedia } = require('../../src/media/handler');
const { logger } = require('../../src/utils/logger');
const http = require('http');
const https = require('https');

describe('Media Handling and Validation Integration', () => {
  let loggerStub;
  let fsStub;
  let httpStub;
  let httpsStub;
  
  beforeEach(() => {
    // Stub logger methods
    loggerStub = {
      info: sinon.stub(logger, 'info'),
      error: sinon.stub(logger, 'error'),
      warn: sinon.stub(logger, 'warn'),
      debug: sinon.stub(logger, 'debug')
    };
    
    // Stub fs methods
    fsStub = {
      mkdir: sinon.stub(fsPromises, 'mkdir').resolves(),
      writeFile: sinon.stub(fsPromises, 'writeFile').resolves(),
      unlink: sinon.stub(fsPromises, 'unlink').resolves(),
      access: sinon.stub(fsPromises, 'access').resolves(),
      stat: sinon.stub(fsPromises, 'stat').resolves({ size: 1024 * 1024 }) // 1MB by default
    };
    
    // Stub http/https get
    const mockResponse = {
      statusCode: 200,
      pipe: sinon.stub(),
      on: sinon.stub().returnsThis()
    };
    
    httpStub = sinon.stub(http, 'get').callsFake((url, callback) => {
      callback(mockResponse);
      return { on: sinon.stub().returnsThis() };
    });
    
    httpsStub = sinon.stub(https, 'get').callsFake((url, callback) => {
      callback(mockResponse);
      return { on: sinon.stub().returnsThis() };
    });
    
    // Stub createWriteStream
    sinon.stub(fs, 'createWriteStream').returns({
      close: sinon.stub(),
      on: sinon.stub().callsFake(function(event, callback) {
        if (event === 'finish') {
          callback();
        }
        return this;
      })
    });
  });
  
  afterEach(() => {
    sinon.restore();
  });
  
  describe('validateMediaFile', () => {
    it('should validate supported file types', async () => {
      const testCases = [
        { path: '/tmp/test.jpg', type: 'image/jpeg', expected: true },
        { path: '/tmp/test.png', type: 'image/png', expected: true },
        { path: '/tmp/test.gif', type: 'image/gif', expected: true },
        { path: '/tmp/test.mp4', type: 'video/mp4', expected: true },
        { path: '/tmp/test.mov', type: 'video/quicktime', expected: true },
        { path: '/tmp/test.mp3', type: 'audio/mpeg', expected: true },
        { path: '/tmp/test.m4a', type: 'audio/mp4', expected: true }
      ];
      
      for (const test of testCases) {
        const result = await validateMediaFile(test.path, test.type);
        expect(result.valid).to.equal(test.expected, `Failed for ${test.path}`);
      }
    });
    
    it('should reject unsupported file types', async () => {
      const testCases = [
        { path: '/tmp/test.exe', type: 'application/octet-stream', reason: 'UNSUPPORTED_EXTENSION' },
        { path: '/tmp/test.jpg', type: 'application/pdf', reason: 'UNSUPPORTED_MIME_TYPE' },
        { path: '/tmp/test.html', type: 'text/html', reason: 'UNSUPPORTED_EXTENSION' }
      ];
      
      for (const test of testCases) {
        const result = await validateMediaFile(test.path, test.type);
        expect(result.valid).to.be.false;
        expect(result.reason).to.equal(test.reason);
      }
    });
    
    it('should reject files that are too large', async () => {
      // Override the stat stub to return a large file size
      fsStub.stat.resolves({ size: 200 * 1024 * 1024 }); // 200MB
      
      const result = await validateMediaFile('/tmp/test.jpg', 'image/jpeg');
      
      expect(result.valid).to.be.false;
      expect(result.reason).to.equal('FILE_TOO_LARGE');
    });
    
    it('should handle file access errors', async () => {
      // Make access throw an error
      fsStub.access.rejects(new Error('File not found'));
      
      const result = await validateMediaFile('/tmp/missing.jpg', 'image/jpeg');
      
      expect(result.valid).to.be.false;
      expect(result.reason).to.equal('VALIDATION_ERROR');
      expect(loggerStub.error.calledWith('Media validation error')).to.be.true;
    });
  });
  
  describe('downloadAndValidateMedia', () => {
    it('should download and validate media successfully', async () => {
      const result = await downloadAndValidateMedia('https://example.com/image.jpg', 'image/jpeg');
      
      expect(result.success).to.be.true;
      expect(result.filePath).to.include('/tmp/imsg_media/');
      expect(result.filePath).to.include('.jpg');
      expect(httpsStub.called).to.be.true;
      expect(loggerStub.info.calledWith('Downloading media file')).to.be.true;
    });
    
    it('should handle HTTP URLs', async () => {
      const result = await downloadAndValidateMedia('http://example.com/image.png', 'image/png');
      
      expect(result.success).to.be.true;
      expect(httpStub.called).to.be.true;
    });
    
    it('should fail for invalid media types', async () => {
      // Override validateMediaFile behavior for this test
      sinon.stub(require('../../src/media/validator'), 'validateMediaFile').resolves({
        valid: false,
        reason: 'UNSUPPORTED_EXTENSION'
      });
      
      const result = await downloadAndValidateMedia('https://example.com/file.exe', 'application/octet-stream');
      
      expect(result.success).to.be.false;
      expect(result.reason).to.equal('UNSUPPORTED_EXTENSION');
      expect(fsStub.unlink.called).to.be.true; // Should clean up invalid file
      expect(loggerStub.error.calledWith('Media validation failed')).to.be.true;
    });
    
    it('should handle download failures', async () => {
      // Make http.get fail
      httpStub.restore();
      httpsStub.restore();
      
      sinon.stub(https, 'get').callsFake((url, callback) => {
        callback({
          statusCode: 404,
          pipe: sinon.stub()
        });
        return { on: sinon.stub().returnsThis() };
      });
      
      const result = await downloadAndValidateMedia('https://example.com/missing.jpg', 'image/jpeg');
      
      expect(result.success).to.be.false;
      expect(result.reason).to.equal('DOWNLOAD_FAILED');
      expect(loggerStub.error.calledWith('Media download failed')).to.be.true;
    });
  });
});
