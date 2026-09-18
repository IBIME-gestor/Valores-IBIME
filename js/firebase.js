/* Conexión con Firebase. Todo por CDN: no hay nada que instalar. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut, onAuthStateChanged, setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, writeBatch, serverTimestamp, onSnapshot, increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { firebaseConfig, DOMINIO_INSTITUCIONAL } from "./config.js";

export const app = initializeApp(firebaseConfig);

/* Caché en el dispositivo: si se va el internet un momento, la app sigue
   respondiendo y las asistencias se sincronizan al volver la señal. */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export const auth = getAuth(app);
auth.useDeviceLanguage();
setPersistence(auth, browserLocalPersistence).catch(() => {});

const provider = new GoogleAuthProvider();
provider.setCustomParameters(
  DOMINIO_INSTITUCIONAL ? { hd: DOMINIO_INSTITUCIONAL, prompt: "select_account" }
                        : { prompt: "select_account" }
);

/* Safari en iOS bloquea ventanas emergentes con frecuencia: si falla,
   se cambia solo a redirección. */
export async function entrar() {
  try {
    return await signInWithPopup(auth, provider);
  } catch (e) {
    const caeEnRedirect = [
      "auth/popup-blocked", "auth/popup-closed-by-user",
      "auth/cancelled-popup-request", "auth/operation-not-supported-in-this-environment"
    ].includes(e.code);
    if (caeEnRedirect) return signInWithRedirect(auth, provider);
    throw e;
  }
}

export const salir = () => signOut(auth);

export {
  getRedirectResult, onAuthStateChanged,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, writeBatch, serverTimestamp, onSnapshot, increment
};
