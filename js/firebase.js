// Firebase SDK setup. Only this file, account.js and store-firestore.js import the SDK.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAk3frD7Io4tRo_hglbrZWFeTYMHi8jzAY',
  authDomain: 'finananca-f548a.firebaseapp.com',
  projectId: 'finananca-f548a',
  storageBucket: 'finananca-f548a.firebasestorage.app',
  messagingSenderId: '771704672245',
  appId: '1:771704672245:web:4dac8fa2992ff2a1481abc',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Local cache: changes are saved on the device at once and sent when there is a connection.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
