"use strict";

// Replaces buffer-equal-constant-time@1.0.1 (pulled in by jwa), whose module
// body reads SlowBuffer.prototype and crashes on Node 25+.
const { Buffer } = require("node:buffer");
const { timingSafeEqual } = require("node:crypto");

function bufferEq(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

const origBufEqual = Buffer.prototype.equal;

bufferEq.install = function install() {
  Buffer.prototype.equal = function equal(that) {
    return bufferEq(this, that);
  };
};

bufferEq.restore = function restore() {
  Buffer.prototype.equal = origBufEqual;
};

module.exports = bufferEq;
