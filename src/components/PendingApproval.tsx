import React from "react";
import { Loader2, Clock, ShieldCheck, LogOut } from "lucide-react";
import { useAuth } from "../AuthContext";

export const PendingApproval: React.FC = () => {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-amber-100 rounded-full mb-6">
          <Clock className="w-10 h-10 text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">¡Bienvenido!</h1>
        <p className="text-slate-600 mb-6">
          Estamos configurando tu acceso a la empresa. Un administrador revisará
          tu solicitud en breve.
        </p>
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex items-center justify-center gap-3 mb-8">
          <ShieldCheck className="w-5 h-5 text-sky-600" />
          <p className="text-sm text-slate-500">
            Tu cuenta está pendiente de aprobación.
          </p>
        </div>

        <button
          onClick={() => logout()}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
};
