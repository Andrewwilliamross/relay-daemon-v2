const chai = require('chai');
const sinon = require('sinon');

// Configure chai
chai.config.includeStack = true; // Include stack traces in assertions

// Make expect available globally
global.expect = chai.expect;
global.sinon = sinon;

// Add some helpful test utilities
global.createStub = (obj, method) => {
  const stub = sinon.stub(obj, method);
  return {
    stub,
    restore: () => stub.restore(),
    called: () => expect(stub.called).to.be.true,
    calledWith: (...args) => expect(stub.calledWith(...args)).to.be.true,
    calledOnce: () => expect(stub.calledOnce).to.be.true,
    calledTwice: () => expect(stub.calledTwice).to.be.true,
    neverCalled: () => expect(stub.called).to.be.false,
    calledWithExactly: (...args) => expect(stub.calledWithExactly(...args)).to.be.true,
    calledWithMatch: (...args) => expect(stub.calledWithMatch(...args)).to.be.true,
    calledBefore: (otherStub) => expect(stub.calledBefore(otherStub)).to.be.true,
    calledAfter: (otherStub) => expect(stub.calledAfter(otherStub)).to.be.true,
    getCall: (n) => stub.getCall(n),
    args: () => stub.args,
    firstCall: () => stub.firstCall,
    lastCall: () => stub.lastCall
  };
};

// Export commonly used test utilities
module.exports = {
  expect: chai.expect,
  sinon: sinon,
  createStub
}; 