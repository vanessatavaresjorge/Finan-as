import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  EmailAuthProvider, reauthenticateWithCredential,
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { auth } from './firebase.js';
import { authMessage } from './logic/messages.js';

const fail = code => { throw new Error(authMessage(code)); };
const wrap = promise => promise.catch(e => fail(e?.code));
const clean = email => String(email ?? '').trim();

export function onUser(fn) {
  return onAuthStateChanged(auth, fn);
}

export async function login(email, password) {
  if (!clean(email)) fail('auth/missing-email');
  const cred = await wrap(signInWithEmailAndPassword(auth, clean(email), password));
  return cred.user;
}

export function logout() {
  return wrap(signOut(auth));
}

export async function resetPassword(email) {
  if (!clean(email)) fail('auth/missing-email');
  await wrap(sendPasswordResetEmail(auth, clean(email)));
}

export async function reauth(email, password) {
  const user = auth.currentUser;
  if (!user || !user.email || clean(email).toLowerCase() !== user.email.toLowerCase()) {
    fail('auth/invalid-credential');
  }
  await wrap(reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password)));
}

export function currentEmail() {
  return auth.currentUser?.email ?? null;
}
