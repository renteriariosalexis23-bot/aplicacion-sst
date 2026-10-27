import React from "react";
import { Link } from "react-router-dom";
import { FileSignature, AlertTriangle } from "lucide-react";
import { useAuth } from "../../AuthContext";

interface SignerBannerProps {
  className?: string;
}

// Muestra con qué nombre y DNI se firmará. Los datos salen siempre del perfil
// de quien está conectado y no se pueden editar desde aquí.
export const SignerBanner: React.FC<SignerBannerProps> = ({ className = "" }) => {
  const { profile } = useAuth();
  const missingDni = !profile?.dni;

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${
        missingDni ? "border-amber-200 bg-amber-50" : "border-blue-100 bg-blue-50"
      } ${className}`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ${
            missingDni ? "text-amber-600" : "text-blue-600"
          }`}
        >
          {missingDni ? <AlertTriangle className="h-5 w-5" /> : <FileSignature className="h-5 w-5" />}
        </div>
        <p className="text-sm text-slate-700">
          Firmarás como <b className="text-slate-900">{profile?.displayName || "—"}</b>
          {" · "}DNI{" "}
          <b className={missingDni ? "text-amber-700" : "text-slate-900"}>
            {profile?.dni || "sin registrar"}
          </b>
        </p>
      </div>
      <Link
        to="/profile"
        className={`shrink-0 text-xs font-bold hover:underline ${missingDni ? "text-amber-700" : "text-blue-700"}`}
      >
        {missingDni ? "Registra tu DNI en Mi Perfil →" : "¿Datos incorrectos? Corrígelos en Mi Perfil →"}
      </Link>
    </div>
  );
};
