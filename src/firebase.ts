import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  getFirestore, initializeFirestore,
  enableIndexedDbPersistence,
  getDocFromServer,
  doc,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, { experimentalForceLongPolling: true }, firebaseConfig.firestoreDatabaseId);

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code == "failed-precondition") {
    console.warn(
      "Multiple tabs open, persistence can only be enabled in one tab at a a time.",
    );
  } else if (err.code == "unimplemented") {
    console.warn(
      "The current browser does not support all of the features required to enable persistence",
    );
  }
});

export const auth = getAuth(app);
export const storage = getStorage(app);

// Validate Connection to Firestore
async function testConnection() {
  try {
    // We use getDocFromServer to force a network request and bypass cache
    await getDocFromServer(doc(db, "test", "connection"));
    console.log("Firestore connection successful");
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("the client is offline") ||
        error.message.includes("unavailable"))
    ) {
      console.error(
        "Firestore connection failed. Please check your Firebase configuration or internet connection.",
      );
    }
    // Skip logging for other errors, as this is simply a connection test.
  }
}
testConnection();

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
});
