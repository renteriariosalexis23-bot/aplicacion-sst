import React, { createContext, useContext, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  onAuthStateChanged,
  User,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase";
import { UserProfile } from "./types";
import { isMainAdmin } from "./constants/admin";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isPendingActivation: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPendingActivation, setIsPendingActivation] = useState(false);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (currentUser) {
        const docRef = doc(db, "users", currentUser.uid);

        // Listen for real-time updates to the profile
        unsubscribeProfile = onSnapshot(
          docRef,
          async (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data() as UserProfile;
              const isAdmin =
                isMainAdmin(currentUser.email);

              // Force employer role for admin email if it's not already set
              if (isAdmin && data.role !== "employer") {
                await updateDoc(docRef, { role: "employer" });
                // The onSnapshot will trigger again with the updated role
                return;
              }

              if (data.status === "blocked") {
                await signOut(auth);
                setUser(null);
                setProfile(null);
                setIsPendingActivation(false);
              } else {
                setProfile(data);
                setIsPendingActivation(
                  data.role === "worker" && !data.companyRuc,
                );
              }
              setLoading(false);
            } else {
              // Create default profile if it doesn't exist
              const isAdmin =
                isMainAdmin(currentUser.email);

              // List of emails that should be supervisors by default
              const supervisorEmails = [
                "jeremy.fergunzon09@gmail.com",
                // Agrega aquí más correos de supervisores si lo necesitas
              ];
              const isSupervisor = supervisorEmails.includes(
                currentUser.email || "",
              );

              const newProfile: UserProfile = {
                uid: currentUser.uid,
                email: currentUser.email || "",
                displayName: currentUser.displayName || "",
                role: isAdmin
                  ? "employer"
                  : isSupervisor
                    ? "supervisor"
                    : "worker",
                createdAt: Timestamp.now() as any,
              };
              await setDoc(docRef, newProfile);
              // onSnapshot will trigger again with the new profile
            }
          },
          (error) => {
            console.error("Error listening to profile:", error);
            setLoading(false);
          },
        );
      } else {
        setProfile(null);
        setIsPendingActivation(false);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code === "auth/popup-blocked" || error.code === "auth/web-storage-unsupported") {
         console.log("Popup blocked or not supported, falling back to redirect...");
         try {
           await signInWithRedirect(auth, googleProvider);
           return;
         } catch(e) {
           console.error("Redirect login failed", e);
         }
      }
      if (
        error.code === "auth/cancelled-popup-request" ||
        error.code === "auth/popup-closed-by-user"
      ) {
        // User closed the popup, this is normal behavior
        console.log("Login popup closed by user.");
      } else if (error.code === "auth/popup-blocked") {
        toast.error(
          "El navegador bloqueó la ventana emergente de inicio de sesión. Por favor, permite las ventanas emergentes para este sitio.",
        );
      } else if (error.code === "auth/network-request-failed") {
        console.error("Network error during auth:", error);
        toast.error(
          "Error de red al intentar iniciar sesión. Esto puede deberse a adblockers, VPN o red.",
        );
      } else {
        console.error("Error logging in:", error);
        toast.error(
          `Error al iniciar sesión: ${error.message || "Error desconocido"}`,
        );
      }
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, isPendingActivation, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
