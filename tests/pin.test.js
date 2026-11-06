import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidPin, hashPin, verifyPin, lockoutState, registerFailure, registerSuccess, shouldRelock, MAX_FAILS, WAIT_MS, RELOCK_MS } from '../js/pin.js';
import { createDeviceState } from '../js/device-state.js';

test('hash and verify', async () => {
  const r = await hashPin('123456');
  assert.equal(r.pinIter, 100000);
  assert.equal(await verifyPin('123456', r), true);
  assert.equal(await verifyPin('654321', r), false);
  assert.notEqual((await hashPin('123456')).pinSalt, r.pinSalt);
});
test('verifyPin returns false for missing fields', async () => {
  assert.equal(await verifyPin('123456', { pinHash: null, pinSalt: null, pinIter: null }), false);
  assert.equal(await verifyPin('123456', {}), false);
});
test('isValidPin', () => {
  assert.equal(isValidPin('123456'), true); assert.equal(isValidPin('12345a'), false); assert.equal(isValidPin('12345'), false);
  assert.equal(isValidPin('1234567'), false); assert.equal(isValidPin(123456), false);
});
test('lockout after 5 failures for 30 s', () => {
  let rec = null; const t = 1_000_000;
  for (let i = 0; i < 4; i++) rec = registerFailure(rec, t);
  assert.deepEqual(rec, {fails:4, until:0});
  rec = registerFailure(rec, t);
  assert.deepEqual(rec, {fails:0, until:t + 30000});
  assert.deepEqual(lockoutState(rec, t + 1000), {blocked:true, waitSeconds:29});
  assert.equal(lockoutState(rec, t + 30000).blocked, false);
  assert.deepEqual(lockoutState(null, t), {blocked:false, waitSeconds:0});
});
test('registerSuccess and constants', () => {
  assert.deepEqual(registerSuccess(), {fails:0, until:0});
  assert.deepEqual([MAX_FAILS, WAIT_MS, RELOCK_MS], [5, 30000, 60000]);
});
test('relock after more than one minute', () => {
  assert.equal(shouldRelock(null, 5), false);
  assert.equal(shouldRelock(0, 60000), false);
  assert.equal(shouldRelock(0, 60001), true);
});
test('device state survives a new instance', () => {
  const m = new Map(); const storage = {getItem:k => m.get(k) ?? null, setItem:(k, v) => m.set(k, String(v)), removeItem:k => m.delete(k)};
  createDeviceState(storage).setLock('a', {fails:3, until:0});
  assert.deepEqual(createDeviceState(storage).lock('a'), {fails:3, until:0});
  const d = createDeviceState(storage);
  assert.equal(d.lastProfile(), null);
  d.setLastProfile('a'); assert.equal(d.lastProfile(), 'a');
  d.setLastProfile(null); assert.equal(d.lastProfile(), null);
  m.set('fin.lock.b', '{oops'); assert.equal(d.lock('b'), null);
});
test('lockout wait never exceeds 30 s when the clock moved backwards', () => {
  const rec = registerFailure({fails:4, until:0}, 1_000_000);
  // The clock went back one hour after the lock was stored.
  const s = lockoutState(rec, 1_000_000 - 3_600_000);
  assert.equal(s.blocked, true);
  assert.equal(s.waitSeconds, 30);
});
test('device state: a storage that throws never blocks', () => {
  const boom = () => { throw new Error('QuotaExceededError'); };
  const d = createDeviceState({getItem:boom, setItem:boom, removeItem:boom});
  assert.doesNotThrow(() => d.setLastProfile('a'));
  assert.doesNotThrow(() => d.setLastProfile(null));
  assert.doesNotThrow(() => d.setLock('a', {fails:0, until:0}));
  assert.equal(d.lastProfile(), null);
  assert.equal(d.lock('a'), null);
});
