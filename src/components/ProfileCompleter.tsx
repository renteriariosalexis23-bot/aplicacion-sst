import React, { useState, useEffect } from "react";
import {
  doc,
  updateDoc,
  query,
  collection,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { Loader2, UserCircle, AlertCircle, LogOut } from "lucide-react";
import { Company } from "../types";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";

export const ProfileCompleter: React.FC = () => {
  const { profile, logout } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || "");
  const [dni, setDni] = useState(profile?.dni || "");
  const [department, setDepartment] = useState(
    profile?.department || (profile?.role === "gerencia" ? "Gerencia General" : "")
  );
  const [customDepartment, setCustomDepartment] = useState("");
  const [isOtherDepartment, setIsOtherDepartment] = useState(false);
  const [position, setPosition] = useState(
    profile?.position || (profile?.role === "gerencia" ? "Gerente General" : "")
  );
  const [companyAreas, setCompanyAreas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.role === "gerencia") {
      if (!department) setDepartment("Gerencia General");
      if (!position) setPosition("Gerente General");
    }
  }, [profile?.role]);

  useEffect(() => {
    if (profile?.companyRuc) {
      // Try to fetch from companies first
      let areasFromCompany: string[] = [];
      const unsubscribeCompany = onSnapshot(query(collection(db, "companies"), where("ruc", "==", profile.companyRuc)), (snapshot) => {
        if (!snapshot.empty) {
          const companyData = snapshot.docs[0].data() as Company;
          if (companyData.areas && companyData.areas.length > 0) {
            areasFromCompany = companyData.areas;
            const areasList = [...companyData.areas];
            if (profile?.role === "gerencia" && !areasList.includes("Gerencia General")) {
              areasList.unshift("Gerencia General");
            }
            setCompanyAreas(areasList.sort());
          }
        }
      });

      // Fallback/Enhancement by fetching from users
      const unsubscribeUsers = onSnapshot(query(collection(db, "users"), where("companyRuc", "==", profile.companyRuc)), (snapshot) => {
        const uniqueAreas = new Set<string>();
        if (profile?.role === "gerencia") {
          uniqueAreas.add("Gerencia General");
        }
        snapshot.forEach(doc => {
           const data = doc.data();
           if (data.department && data.department.trim() !== '') {
              uniqueAreas.add(data.department.trim());
           }
        });
        setCompanyAreas(prev => {
          const combined = Array.from(new Set([...prev, ...Array.from(uniqueAreas)]));
          return combined.sort();
        });
      });

      return () => {
         unsubscribeCompany();
         unsubscribeUsers();
      };
    } else if (profile?.role === "gerencia") {
      setCompanyAreas(["Gerencia General", "Dirección General"]);
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalDepartment = isOtherDepartment ? customDepartment : department;
    
    if (!finalDepartment.trim() || !position.trim() || !displayName.trim() || !dni.trim()) {
      setError("Por favor, completa todos los campos.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await updateDoc(doc(db, "users", profile!.uid), {
        displayName: displayName.trim(),
        dni: dni.trim(),
        department: finalDepartment.trim(),
        position: position.trim(),
      });
      // The profile will update automatically via onSnapshot in AuthContext
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "users");
      setError("Ocurrió un error al guardar tus datos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-sky-100 rounded-full mb-4">
            <UserCircle className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            Completa tu Perfil
          </h1>
          <p className="text-slate-500 mt-2">
            Para continuar, necesitamos que completes tus datos personales y de trabajo.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nombres y Apellidos
            </label>
            <input
              type="text"
              maxLength={150}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 border"
              placeholder="Ej. Juan Pérez"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              DNI / Pasaporte
            </label>
            <input
              type="text"
              maxLength={20}
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              className="w-full rounded-xl border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 border"
              placeholder="Número de documento"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Área / Departamento
            </label>
            {companyAreas.length > 0 ? (
              <div className="space-y-3">
                <select
                  value={isOtherDepartment ? "otra" : department}
                  onChange={(e) => {
                    if (e.target.value === "otra") {
                      setIsOtherDepartment(true);
                      setDepartment("");
                    } else {
                      setIsOtherDepartment(false);
                      setDepartment(e.target.value);
                    }
                  }}
                  className="w-full rounded-xl border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 border bg-white"
                  required={!isOtherDepartment}
                >
                  <option value="">Seleccionar Área</option>
                  {companyAreas.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                  <option value="otra">Otra área...</option>
                </select>
                
                {isOtherDepartment && (
                  <input
                    type="text"
                    maxLength={100}
                    value={customDepartment}
                    onChange={(e) => setCustomDepartment(e.target.value)}
                    className="w-full rounded-xl border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 border animate-in fade-in slide-in-from-top-2"
                    placeholder="Escribe tu área o departamento"
                    required
                  />
                )}
              </div>
            ) : (
              <input
                type="text"
                maxLength={100}
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-xl border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 border"
                placeholder="Ej. Operaciones, Recursos Humanos..."
                required
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Cargo / Puesto
            </label>
            <input
              type="text"
              maxLength={100}
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-full rounded-xl border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 border"
              placeholder="Ej. Técnico de Mantenimiento"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
            >
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Guardando...</> : "Guardar y Continuar"}
            </button>

            <button
              type="button"
              onClick={() => logout()}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all"
            >
              <LogOut className="w-4 h-4" />
              Cerrar Sesión
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
