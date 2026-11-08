import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle2, XCircle, Loader2, FileText, Building2, CalendarDays, UserRound, Users } from "lucide-react";
import { db } from "../firebase";
import { applyBrand, resolveBrand } from "../utils/brand";

interface VerificationRecord {
  kind: string;
  title?: string;
  companyName: string;
  companyRuc: string;
  people?: { role: string; name: string; dni?: string }[];
  issuedAt?: { toDate: () => Date };
  issuedByName?: string;
}

// Página pública (sin iniciar sesión) que abre el código QR impreso en cada PDF.
export const VerifyDocument: React.FC = () => {
  const { id } = useParams();
  const [state, setState] = useState<"loading" | "found" | "missing">("loading");
  const [record, setRecord] = useState<VerificationRecord | null>(null);

  useEffect(() => {
    if (!id) {
      setState("missing");
      return;
    }
    getDoc(doc(db, "pdf_verifications", id))
      .then((snap) => {
        if (!snap.exists()) {
          setState("missing");
          return;
        }
        const data = snap.data() as VerificationRecord;
        setRecord(data);
        applyBrand(resolveBrand({ businessName: data.companyName } as any));
        setState("found");
      })
      .catch(() => setState("missing"));
  }, [id]);

  const brand = resolveBrand(record ? ({ businessName: record.companyName } as any) : null);
  const issued = record?.issuedAt?.toDate ? record.issuedAt.toDate() : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="brand-gradient px-4 py-5 sm:py-6">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-4">
          {record ? (
            <img src={brand.logoWhite} alt={record.companyName} className="h-9 w-auto max-w-[180px] object-contain sm:h-11" />
          ) : (
            <span className="text-sm font-bold text-white">Seguridad y Salud en el Trabajo</span>
          )}
          <span className="text-right text-xs font-semibold text-white/85">Verificación de documentos</span>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-6 sm:py-10">
        {state === "loading" && (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium">Buscando el documento…</p>
          </div>
        )}

        {state === "missing" && (
          <div className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
            <XCircle className="mx-auto mb-3 h-12 w-12 text-red-600" />
            <h1 className="text-xl font-bold text-slate-900">Documento no encontrado</h1>
            <p className="mt-2 text-sm text-slate-600">
              Este código no corresponde a ningún documento generado por el sistema. Si el PDF muestra este código,
              puede haber sido alterado o no ser auténtico.
            </p>
            {id && <p className="mt-4 break-all font-mono text-xs text-slate-400">Código: {id}</p>}
          </div>
        )}

        {state === "found" && record && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-emerald-100 bg-emerald-50 px-5 py-4">
              <CheckCircle2 className="h-9 w-9 shrink-0 text-emerald-600" />
              <div>
                <h1 className="text-lg font-bold leading-tight text-emerald-900">Documento auténtico</h1>
                <p className="text-xs text-emerald-800">Fue generado en el sistema de SST con los datos de abajo.</p>
              </div>
            </div>

            <dl className="divide-y divide-slate-100 px-5">
              <Row icon={FileText} label="Documento">
                <b className="text-slate-900">{record.kind}</b>
                {record.title && <span className="mt-0.5 block text-slate-600">{record.title}</span>}
              </Row>
              <Row icon={Building2} label="Empresa">
                {record.companyName || "—"}
                {record.companyRuc && <span className="block text-slate-500">RUC {record.companyRuc}</span>}
              </Row>
              <Row icon={CalendarDays} label="Emitido">
                {issued ? format(issued, "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es }) : "—"}
              </Row>
              {record.people && record.people.length > 0 && (
                <Row icon={Users} label="Personas en el documento">
                  <ul className="space-y-1.5">
                    {record.people.map((p, i) => (
                      <li key={i}>
                        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{p.role}</span>
                        {p.name}
                        {p.dni && <span className="text-slate-500"> · DNI {p.dni}</span>}
                      </li>
                    ))}
                  </ul>
                </Row>
              )}
              {record.issuedByName && (
                <Row icon={UserRound} label="Generado por">
                  {record.issuedByName}
                </Row>
              )}
            </dl>

            <p className="border-t border-slate-100 bg-slate-50 px-5 py-4 text-xs leading-relaxed text-slate-600">
              Compare estos datos con el PDF que tiene en sus manos. Si algo no coincide, el documento pudo ser
              modificado después de generarse. Por privacidad, del DNI solo se muestran los 3 últimos dígitos.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

const Row: React.FC<{ icon: React.ElementType; label: string; children: React.ReactNode }> = ({ icon: Icon, label, children }) => (
  <div className="flex gap-3 py-4">
    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
    <div className="min-w-0 flex-1">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-800">{children}</dd>
    </div>
  </div>
);
