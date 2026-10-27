import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useCompany } from "../CompanyContext";
import { useAuth } from "../AuthContext";

export const QRLanding: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { setSelectedCompanyRuc, loading: companyLoading } = useCompany();
  const { profile } = useAuth();

  const type = searchParams.get("type");
  const id = searchParams.get("id");

  useEffect(() => {
    const verifyQR = async () => {
      if (companyLoading) return;
      if (!type || !id) {
        setError("Código QR inválido. Faltan parámetros.");
        return;
      }

      try {
        let exists = false;
        let companyRuc = "";
        let inspectionTemplateId = "";
        
        if (type === "equipment") {
          const docRef = doc(db, "equipment", id);
          const docSnap = await getDoc(docRef);
          exists = docSnap.exists();
          if (exists) {
            companyRuc = docSnap.data().companyRuc;
            inspectionTemplateId = docSnap.data().inspectionTemplateId || "";
          }
        } else if (type === "report") {
          const docRef = doc(db, "reports", id);
          const docSnap = await getDoc(docRef);
          exists = docSnap.exists();
          if (exists) companyRuc = docSnap.data().companyRuc;
        } else if (type === "register") {
          const docRef = doc(db, "mandatory_registers", id);
          const docSnap = await getDoc(docRef);
          exists = docSnap.exists();
          if (exists) companyRuc = docSnap.data().companyRuc;
        } else {
          setError("Tipo de código QR no reconocido.");
          return;
        }

        if (!exists) {
          setError("El elemento asociado a este código QR no existe o fue eliminado.");
          return;
        }

        if (companyRuc) {
          if (["employer", "super_admin", "gerencia"].includes(profile?.role || "")) {
            setSelectedCompanyRuc(companyRuc);
          } else {
            // Role is employee/worker or other
            if (profile?.companyRuc && profile.companyRuc !== companyRuc) {
              setError("Acceso denegado: Este código QR pertenece a otra empresa. No tienes permisos para escanearlo o gestionarlo.");
              return;
            }
          }
        }

        // Redirect to the appropriate page
        setTimeout(() => {
          if (type === "equipment") {
            if (inspectionTemplateId) {
              navigate(`/inspections?eq=${id}`);
            } else {
              navigate(`/preuse?eq=${id}`);
            }
          } else if (type === "report") {
            navigate(`/reports?id=${id}`);
          } else if (type === "register") {
            navigate(`/mandatory-registers?id=${id}`);
          }
        }, 1500);
      } catch (err) {
        console.error("Error verifying QR:", err);
        setError("Error al verificar el código QR. Intente nuevamente.");
      }
    };

    verifyQR();
  }, [type, id, navigate, profile, setSelectedCompanyRuc, companyLoading]);

  if (error) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Código Inválido</h2>
        <p className="text-slate-600 mb-6">{error}</p>
        <button
          onClick={() => navigate("/")}
          className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition"
        >
          Volver al Inicio
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-6">
        <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center animate-pulse">
          <ShieldCheck className="w-10 h-10" />
        </div>
        <div className="absolute -bottom-2 -right-2 bg-white rounded-full p-1 shadow-sm">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      </div>
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Verificando Código QR...</h2>
      <p className="text-slate-600 max-w-md mx-auto">
        Estamos comprobando la autenticidad del registro en nuestra base de datos. Serás redirigido en un momento.
      </p>
    </div>
  );
};
