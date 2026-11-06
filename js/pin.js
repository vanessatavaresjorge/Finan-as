// Access code: hashing (PBKDF2-SHA-256), lockout and relock rules. Works in Node and browsers.
export const MAX_FAILS = 5;
export const WAIT_MS = 30000;
export const RELOCK_MS = 60000;
const ITERATIONS = 100000;

const enc = new TextEncoder();
const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin, salt, iter) {
  const key = await globalThis.crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return new Uint8Array(bits);
}

export function isValidPin(pin) {
  return typeof pin === 'string' && /^[0-9]{6}$/.test(pin);
}

export async function hashPin(pin) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITERATIONS);
  return { pinHash: toB64(hash), pinSalt: toB64(salt), pinIter: ITERATIONS };
}

export async function verifyPin(pin, rec) {
  const { pinHash, pinSalt, pinIter } = rec || {};
  if (!pinHash || !pinSalt || !pinIter) return false;
  try {
    const expected = fromB64(pinHash);
    const actual = await derive(pin, fromB64(pinSalt), pinIter);
    let diff = expected.length ^ actual.length;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ (expected[i] ?? 0);
    return diff === 0;
  } catch {
    return false;
  }
}

export function lockoutState(rec, now) {
  const until = rec?.until ?? 0;
  if (until > now) return { blocked: true, waitSeconds: Math.ceil((until - now) / 1000) };
  return { blocked: false, waitSeconds: 0 };
}

export function registerFailure(rec, now) {
  const fails = (rec?.fails ?? 0) + 1;
  if (fails >= MAX_FAILS) return { fails: 0, until: now + WAIT_MS };
  return { fails, until: rec?.until ?? 0 };
}

export function registerSuccess() {
  return { fails: 0, until: 0 };
}

export function shouldRelock(hiddenAt, now) {
  return hiddenAt != null && now - hiddenAt > RELOCK_MS;
}
