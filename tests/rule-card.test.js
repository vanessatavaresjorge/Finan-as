import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleWithin } from '../js/ui/dom.js';

test('exactly on target is within for all three groups', () => {
  assert.equal(ruleWithin('necessidade', 50), true);
  assert.equal(ruleWithin('desejo', 30), true);
  assert.equal(ruleWithin('poupanca', 20), true);
});
test('one point past the target is outside', () => {
  assert.equal(ruleWithin('necessidade', 51), false);
  assert.equal(ruleWithin('desejo', 31), false);
  assert.equal(ruleWithin('poupanca', 19), false);
});
