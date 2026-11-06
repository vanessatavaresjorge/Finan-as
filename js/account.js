import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  EmailAuthProvider, reauthenticateWithCredential,
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { terminate, clearIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';
import { auth, db } from './firebase.js';
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

// Terminar sessão on this device: sign out, then delete the household data kept in this
// device's Firestore cache and reload, so a fresh Firestore instance starts empty.
export async function logoutAndWipe() {
  await logout();
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    // Another open tab may still use the cache; the sign-out itself is done.
  }
  location.reload();
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
