import { useEffect } from "react";
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";

export const useEquipmentAlerts = () => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();

  useEffect(() => {
    if (!profile || !selectedCompany) return;
    
    const checkAlerts = async () => {
      try {
        const q = query(
          collection(db, "equipment"),
          where("companyRuc", "==", selectedCompany.ruc)
        );
        
        const snap = await getDocs(q);
        const today = new Date();
        const fifteenDaysFromNow = new Date();
        fifteenDaysFromNow.setDate(today.getDate() + 15);
        
        const updates = snap.docs.map(async (d) => {
          const data = d.data();
          let needsUpdate = false;
          let newExpNotified = data.expirationNotifiedUsers || [];
          let newHydroNotified = data.hydrostaticNotifiedUsers || [];
          
          if (data.expirationDate) {
             const expDate = new Date(data.expirationDate);
             if (expDate <= fifteenDaysFromNow && !newExpNotified.includes(profile.uid)) {
                await addDoc(collection(db, "notifications"), {
                   userId: profile.uid,
                   companyRuc: selectedCompany.ruc,
                   title: "⚠️ Vencimiento de Equipo",
                   message: `El equipo ${data.codigoInterno || data.name} vencerá el ${data.expirationDate}.`,
                   read: false,
                   link: "/equipments",
                   createdAt: serverTimestamp(),
                });
                newExpNotified = [...newExpNotified, profile.uid];
                needsUpdate = true;
             }
          }
          
          if (data.hydrostaticTestDate) {
             const hydroDate = new Date(data.hydrostaticTestDate);
             if (hydroDate <= fifteenDaysFromNow && !newHydroNotified.includes(profile.uid)) {
                await addDoc(collection(db, "notifications"), {
                   userId: profile.uid,
                   companyRuc: selectedCompany.ruc,
                   title: "🔧 Prueba Hidrostática",
                   message: `El equipo ${data.codigoInterno || data.name} requiere prueba hidrostática para el ${data.hydrostaticTestDate}.`,
                   read: false,
                   link: "/equipments",
                   createdAt: serverTimestamp(),
                });
                newHydroNotified = [...newHydroNotified, profile.uid];
                needsUpdate = true;
             }
          }
          
          if (needsUpdate) {
            await updateDoc(doc(db, "equipment", d.id), {
               expirationNotifiedUsers: newExpNotified,
               hydrostaticNotifiedUsers: newHydroNotified
            });
          }
        });
        
        await Promise.all(updates);
      } catch (err) {
        console.error("Error checking equipment alerts:", err);
      }
    };
    
    checkAlerts();
  }, [profile?.uid, selectedCompany?.ruc]);
};
