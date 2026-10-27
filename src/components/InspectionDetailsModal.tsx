import React, { useState } from "react";
import { X, Calendar, User, ClipboardCheck, AlertTriangle, CheckCircle2, Image as ImageIcon } from "lucide-react";
import { Inspection } from "../types";

interface InspectionDetailsModalProps {
  inspection: Inspection;
  onClose: () => void;
}

export const InspectionDetailsModal: React.FC<InspectionDetailsModalProps> = ({
  inspection,
  onClose,
}) => {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const formattedDate = inspection.createdAt?.toDate().toLocaleDateString("es-ES", { day: '2-digit', month: 'short', year: 'numeric' }) || "";
  const formattedTime = inspection.createdAt?.toDate().toLocaleTimeString("es-ES", { hour: '2-digit', minute: '2-digit' }) || "";

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{inspection.templateTitle}</h2>
            {inspection.equipmentName && (
              <p className="text-sm font-medium text-indigo-600 mt-1 flex items-center">
                <ClipboardCheck className="w-4 h-4 mr-1.5" />
                {inspection.equipmentName}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Info Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <div className="flex items-center gap-3 bg-white p-4 rounded-xl border border-slate-200">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Inspector</p>
                <p className="font-semibold text-slate-900">{inspection.workerName}</p>
                {inspection.workerDni && <p className="text-xs text-slate-500">DNI: {inspection.workerDni}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3 bg-white p-4 rounded-xl border border-slate-200">
              <div className="w-10 h-10 rounded-full bg-slate-50 text-slate-600 flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Fecha y Hora</p>
                <p className="font-semibold text-slate-900">{formattedDate}</p>
                <p className="text-xs text-slate-500">{formattedTime}</p>
              </div>
            </div>
          </div>

          {/* Results Checklist */}
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 px-1">
            Respuestas del Checklist
          </h3>
          
          <div className="space-y-4">
            {inspection.results.map((result, idx) => (
              <div 
                key={idx} 
                className={`p-4 rounded-xl border ${result.isIssue ? 'bg-red-50/30 border-red-100' : 'bg-white border-slate-200'}`}
              >
                <div className="flex gap-3">
                  <div className="shrink-0 mt-0.5">
                    {result.isIssue ? (
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 leading-snug">
                      {result.question}
                    </p>
                    
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                       <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${result.isIssue ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                         Respuesta: {String(result.answer)}
                       </span>
                    </div>

                    {result.comment && (
                      <div className="mt-3 p-3 bg-white/60 rounded-lg text-sm text-slate-700 italic border border-slate-100">
                        "{result.comment}"
                      </div>
                    )}

                    {/* Photos */}
                    {(result.photoUrl || (result.photos && result.photos.length > 0)) && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {result.photoUrl && !result.photos && (
                           <button
                             onClick={() => setSelectedPhoto(result.photoUrl!)}
                             className="relative group w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-100"
                           >
                             <img src={result.photoUrl} alt="Evidencia" className="w-full h-full object-cover" />
                             <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                               <ImageIcon className="w-6 h-6 text-white" />
                             </div>
                           </button>
                        )}
                        {result.photos?.map((photo, pIdx) => (
                          <button
                            key={pIdx}
                            onClick={() => setSelectedPhoto(photo.url)}
                            className="relative group w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-100"
                          >
                            <img src={photo.url} alt="Evidencia" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <ImageIcon className="w-6 h-6 text-white" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Signature */}
          <div className="mt-8 p-6 bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center justify-center">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Firma del Inspector</p>
            {inspection.signatureUrl ? (
               <img src={inspection.signatureUrl} alt="Firma" className="max-h-24 object-contain" />
            ) : inspection.signatureBase64 ? (
               <img src={inspection.signatureBase64} alt="Firma" className="max-h-24 object-contain" />
            ) : (
               <p className="text-sm text-slate-500 italic">No hay firma registrada</p>
            )}
          </div>
        </div>
      </div>

      {/* Photo Zoom Modal */}
      {selectedPhoto && (
        <div 
          className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setSelectedPhoto(null)}
        >
          <button 
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-black/50 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedPhoto(null);
            }}
          >
            <X className="w-6 h-6" />
          </button>
          <img 
            src={selectedPhoto} 
            alt="Evidencia ampliada" 
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};
