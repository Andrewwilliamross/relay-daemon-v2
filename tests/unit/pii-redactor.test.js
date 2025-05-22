/**
 * Unit tests for PII redaction utility
 */
require('../setup');
const { describe, it } = require('mocha');
const { redactPII } = require('../../src/utils/pii-redactor');

describe('PII Redactor Module', () => {
  describe('redactPII', () => {
    it('should redact phone numbers in various formats', () => {
      const testCases = [
        'Call me at 555-123-4567 tomorrow',
        'My number is (555) 123-4567',
        'Contact: +1 555 123 4567',
        'Text 5551234567 for more info'
      ];
      
      testCases.forEach(text => {
        const redacted = redactPII(text);
        expect(redacted).to.include('***-***-XXXX');
        expect(redacted).not.to.include('555');
      });
    });
    
    it('should redact email addresses', () => {
      const testCases = [
        'My email is user@example.com',
        'Contact us at support@company.co.uk',
        'Send to: test.user+tag@gmail.com'
      ];
      
      testCases.forEach(text => {
        const redacted = redactPII(text);
        expect(redacted).to.include('[REDACTED_EMAIL]');
        expect(redacted).not.to.include('@');
      });
    });
    
    it('should redact names', () => {
      const testCases = [
        'John Smith will call you',
        'Meeting with Jane Doe tomorrow',
        'Project lead: Robert Johnson'
      ];
      
      testCases.forEach(text => {
        const redacted = redactPII(text);
        expect(redacted).to.include('[REDACTED_NAME]');
      });
    });
    
    it('should redact message content in JSON', () => {
      const json = '{"id": 123, "message": "This is a private message with sensitive info"}';
      
      const redacted = redactPII(json);
      expect(redacted).to.include('"message": "[REDACTED_MESSAGE_CONTENT]"');
      expect(redacted).not.to.include('private message');
    });
    
    it('should handle null or non-string inputs', () => {
      expect(redactPII(null)).to.equal(null);
      expect(redactPII(undefined)).to.equal(undefined);
      expect(redactPII(123)).to.equal(123);
      expect(redactPII({})).to.deep.equal({});
    });
    
    it('should not redact content in debug mode', () => {
      const text = 'Call John Smith at 555-123-4567 or email john@example.com';
      const options = { debugMode: true };
      
      const redacted = redactPII(text, options);
      expect(redacted).to.equal(text);
    });
    
    it('should respect selective redaction options', () => {
      const text = 'Call John Smith at 555-123-4567 or email john@example.com';
      
      // Only redact phone numbers
      const options1 = { 
        redactPhones: true,
        redactEmails: false,
        redactNames: false
      };
      
      const redacted1 = redactPII(text, options1);
      expect(redacted1).to.include('***-***-XXXX');
      expect(redacted1).to.include('john@example.com');
      expect(redacted1).to.include('John Smith');
      
      // Only redact emails
      const options2 = { 
        redactPhones: false,
        redactEmails: true,
        redactNames: false
      };
      
      const redacted2 = redactPII(text, options2);
      expect(redacted2).to.include('555-123-4567');
      expect(redacted2).to.include('[REDACTED_EMAIL]');
      expect(redacted2).to.include('John Smith');
    });
  });
});
