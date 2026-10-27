import React, { useState } from "react";
import { format } from "date-fns";
import { Loader2, Calendar, Clock, CheckCircle } from "lucide-react";
import { CommitteeAgreement } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface Props {
  agreements: (CommitteeAgreement & { meetingId: string; meetingDate: string })[];
  onUpdateStatus: (meetingId: string, agreementId: string, newStatus: "pending" | "in_progress" | "completed") => void;
  isAdmin: boolean;
}

export const CommitteeAgreementsKanban: React.FC<Props> = ({ agreements, onUpdateStatus, isAdmin }) => {
  const [draggedItem, setDraggedItem] = useState<{ meetingId: string; agreementId: string } | null>(null);

  const columns: { id: "pending" | "in_progress" | "completed"; title: string; color: string; icon: React.ReactNode }[] = [
    { id: "pending", title: "Pendiente", color: "bg-orange-50 border-orange-200 text-orange-700", icon: <Clock className="w-5 h-5 text-orange-500" /> },
    { id: "in_progress", title: "En Proceso", color: "bg-blue-50 border-blue-200 text-blue-700", icon: <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 4, ease: "linear" }}><div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent" /></motion.div> },
    { id: "completed", title: "Completado", color: "bg-green-50 border-green-200 text-green-700", icon: <CheckCircle className="w-5 h-5 text-green-500" /> },
  ];

  const handleDragStart = (e: React.DragEvent, meetingId: string, agreementId: string) => {
    if (!isAdmin) return;
    setDraggedItem({ meetingId, agreementId });
    e.dataTransfer.setData("text/plain", JSON.stringify({ meetingId, agreementId }));
    e.dataTransfer.effectAllowed = "move";
    // Slight delay to allow visual styling of dragging item
    setTimeout(() => {
      const el = e.target as HTMLElement;
      if (el && el.style) {
         el.style.opacity = '0.5';
      }
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedItem(null);
    const el = e.target as HTMLElement;
    if (el && el.style) {
      el.style.opacity = '1';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!isAdmin) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, status: "pending" | "in_progress" | "completed") => {
    if (!isAdmin) return;
    e.preventDefault();
    try {
      const dataStr = e.dataTransfer.getData("text/plain");
      if (dataStr) {
        const data = JSON.parse(dataStr);
        if (data.meetingId && data.agreementId) {
          onUpdateStatus(data.meetingId, data.agreementId, status);
        }
      } else if (draggedItem) {
        onUpdateStatus(draggedItem.meetingId, draggedItem.agreementId, status);
      }
    } catch (err) {
      console.error("Drop error", err);
    }
    setDraggedItem(null);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full min-h-[500px]">
      {columns.map((col) => (
        <div
          key={col.id}
          className={`flex flex-col rounded-xl border-2 \${col.color} bg-white overflow-hidden shadow-sm`}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, col.id)}
        >
          <div className={`px-4 py-3 border-b-2 \${col.color.split(' ')[1]} \${col.color.split(' ')[0]} flex items-center justify-between`}>
            <div className="flex items-center gap-2 font-bold">
              {col.icon}
              {col.title}
            </div>
            <span className="bg-white px-2 py-0.5 rounded-full text-xs font-bold shadow-sm">
              {agreements.filter((a) => a.status === col.id).length}
            </span>
          </div>
          
          <div className="flex-1 p-3 flex flex-col gap-3 bg-slate-50/50 overflow-y-auto">
            <AnimatePresence>
              {agreements
                .filter((a) => a.status === col.id)
                .map((agreement) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={agreement.id}
                    draggable={isAdmin}
                    onDragStart={((e: any) => handleDragStart(e, agreement.meetingId, agreement.id)) as any}
                    onDragEnd={handleDragEnd as any}
                    className={`bg-white p-4 rounded-lg shadow-sm border border-slate-200 cursor-grab active:cursor-grabbing hover:border-blue-300 transition-colors \${draggedItem?.agreementId === agreement.id ? 'ring-2 ring-blue-500 opacity-50' : ''}`}
                  >
                    <p className="text-sm font-semibold text-slate-800 mb-2 leading-tight">
                      {agreement.task}
                    </p>
                    
                    <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-slate-100">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">Responsable:</span>
                        <span className="text-slate-700 font-semibold bg-slate-100 px-2 py-0.5 rounded">
                          {agreement.responsibleName}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">Límite:</span>
                        <span className={`font-semibold flex items-center gap-1 \${new Date(agreement.deadline) < new Date() && agreement.status !== 'completed' ? 'text-red-600' : 'text-slate-700'}`}>
                          <Calendar className="w-3 h-3" />
                          {format(new Date(agreement.deadline), "dd/MM/yyyy")}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
            </AnimatePresence>
            {agreements.filter((a) => a.status === col.id).length === 0 && (
              <div className="h-full flex flex-col items-center justify-center p-6 text-slate-400 text-center border-2 border-dashed border-slate-200 rounded-lg">
                <p className="text-sm font-medium">Sin acuerdos</p>
                {agreements.length > 0 && isAdmin ? (
                  <p className="text-xs mt-1">Arrastra una tarjeta aquí</p>
                ) : agreements.length === 0 ? (
                  <p className="text-xs mt-1">Los acuerdos se agregan al crear un Acta de Reunión</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
