import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup as firebaseSignInWithPopup, 
  signOut as firebaseSignOut, 
  onAuthStateChanged as firebaseOnAuthStateChanged 
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export function signInWithPopup(authInstance = auth, provider = googleProvider) {
  return firebaseSignInWithPopup(authInstance, provider);
}

export function signOut(authInstance = auth) {
  return firebaseSignOut(authInstance);
}

export function onAuthStateChanged(authInstance = auth, callback: (user: any) => void) {
  return firebaseOnAuthStateChanged(authInstance, callback);
}

