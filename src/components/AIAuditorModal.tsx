import React, { useState, useEffect } from "react";
import { Loader2, X, Bot, ShieldAlert, CheckCircle, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface AIAuditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataSummary: any;
}

export const AIAuditorModal: React.FC<AIAuditorModalProps> = ({ isOpen, onClose, dataSummary }) => {
  const [loading, setLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !auditResult && !loading) {
      runAudit();
    }
  }, [isOpen]);

  const runAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const prompt = `Eres un auditor experto en normativas de Seguridad y Salud en el Trabajo (Ley 29783 - Perú). 
Analiza los siguientes indicadores de cumplimiento de la empresa y devuelve un JSON estructurado con el análisis.

Datos de la empresa a analizar:
${JSON.stringify(dataSummary, null, 2)}

Tu respuesta debe ser un JSON estricto con la siguiente estructura:
{
  "score": número del 0 al 100 de cumplimiento general,
  "highRisks": [{"finding": "descripción de la no conformidad grave", "recommendation": "acción inmediata recomendada"}],
  "warnings": [{"finding": "descripción de la advertencia", "recommendation": "acción sugerida"}],
  "compliances": [{"finding": "descripción del buen cumplimiento"}],
  "executiveSummary": "Resumen ejecutivo del estado de la empresa"
}`;

      const response = await fetch('/api/gemini/generate-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      let data;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await response.json();
      } else {
        const textResponse = await response.text();
        console.error("Respuesta no JSON:", textResponse.substring(0, 200));
        setError("El servidor no devolvió JSON (posible error 404 o de Vercel).");
        return;
      }
      
      if (!response.ok) {
        setError(data.error || 'Ocurrió un error en el servidor.');
        return;
      }
      
      setAuditResult(data);
    } catch (e: any) {
      console.error("Error fetching audit route:", e);
      setError(`Ocurrió un error al contactar al servidor: ${e.message || 'Inténtalo de nuevo.'}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[999] overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col pointer-events-auto my-8">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10 shrink-0">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold flex items-center gap-2 text-sky-900">
              <Bot className="w-6 h-6 text-blue-600" />
              Auditoría Inteligente (IA)
            </h2>
            <p className="text-sm text-slate-500 font-medium">Análisis predictivo de cumplimiento legal (Ley 29783)</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors self-start"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto min-h-0 flex-1">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4 text-sm font-medium">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
              <p className="text-lg font-medium text-slate-700">Analizando indicadores de SST...</p>
              <p className="text-sm text-slate-500 mt-2 text-center max-w-md">Cruzando datos de IPERC, exámenes médicos, capacitaciones y comité con la normativa vigente.</p>
            </div>
          ) : auditResult ? (
            <div className="space-y-8 animate-in fade-in duration-500">
              {/* Score Header */}
              <div className="flex flex-col md:flex-row items-center gap-6 bg-slate-50 p-6 rounded-xl border border-slate-100">
                <div className="relative shrink-0">
                  <svg className="w-32 h-32 transform -rotate-90">
                    <circle cx="64" cy="64" r="56" className="stroke-slate-200" strokeWidth="12" fill="none" />
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      className={`stroke-current ${auditResult.score >= 80 ? 'text-green-500' : auditResult.score >= 50 ? 'text-amber-500' : 'text-red-500'}`}
                      strokeWidth="12"
                      fill="none"
                      strokeDasharray="351.86"
                      strokeDashoffset={(351.86 * (100 - auditResult.score)) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center flex-col">
                    <span className="text-3xl font-black text-slate-800">{auditResult.score}%</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Resumen Ejecutivo</h3>
                  <div className="text-slate-600 leading-relaxed text-sm">
                    {auditResult.executiveSummary}
                  </div>
                </div>
              </div>

              {/* High Risks */}
              {auditResult.highRisks?.length > 0 && (
                <div className="space-y-3">
                  <h4 className="flex items-center gap-2 font-bold text-red-700 text-lg border-b border-red-100 pb-2">
                    <XCircle className="w-5 h-5" />
                    Riesgos Altos (Infracciones Graves)
                  </h4>
                  <div className="grid gap-3">
                    {auditResult.highRisks.map((risk: any, i: number) => (
                      <div key={i} className="bg-red-50 border border-red-100 p-4 rounded-lg flex flex-col gap-2">
                        <p className="font-semibold text-red-900">{risk.finding}</p>
                        <div className="bg-white/60 p-3 rounded text-sm text-red-800">
                          <span className="font-bold mr-1">🤖 Recomendación IA:</span>
                          {risk.recommendation}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {auditResult.warnings?.length > 0 && (
                <div className="space-y-3">
                  <h4 className="flex items-center gap-2 font-bold text-amber-700 text-lg border-b border-amber-100 pb-2">
                    <AlertTriangle className="w-5 h-5" />
                    Advertencias de Mejora
                  </h4>
                  <div className="grid gap-3">
                    {auditResult.warnings.map((warn: any, i: number) => (
                      <div key={i} className="bg-amber-50 border border-amber-100 p-4 rounded-lg flex flex-col gap-2">
                        <p className="font-semibold text-amber-900">{warn.finding}</p>
                        <div className="bg-white/60 p-3 rounded text-sm text-amber-800">
                          <span className="font-bold mr-1">🤖 Recomendación IA:</span>
                          {warn.recommendation}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Compliances */}
              {auditResult.compliances?.length > 0 && (
                <div className="space-y-3">
                  <h4 className="flex items-center gap-2 font-bold text-green-700 text-lg border-b border-green-100 pb-2">
                    <CheckCircle className="w-5 h-5" />
                    Criterios en Cumplimiento
                  </h4>
                  <ul className="grid gap-2">
                    {auditResult.compliances.map((comp: any, i: number) => (
                      <li key={i} className="flex items-start gap-2 bg-green-50 p-3 rounded-lg border border-green-100">
                        <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                        <span className="text-green-900 font-medium text-sm">{comp.finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0 rounded-b-2xl">
           <button
            onClick={() => runAudit()}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Re-evaluar
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            Cerrar Informe
          </button>
        </div>
      </div>
    </div>
  );
};
