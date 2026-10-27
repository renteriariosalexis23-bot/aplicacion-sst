import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { notifyAllEmployers } from "../utils/notifications";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { CommitteeEvent } from "../types";
import { Loader2, Plus, Trash2, Calendar as CalendarIcon, Users, FileSearch, ShieldCheck, Check } from "lucide-react";
import toast from "react-hot-toast";
import { motion } from "motion/react";
import { format, getMonth, getYear, parseISO, isSameMonth } from "date-fns";
import { es } from "date-fns/locale";
import { isMainAdmin } from "../constants/admin";

interface Props {
  onCreateMeeting?: (date: string, type: "ordinaria" | "extraordinaria") => void;
}

export const CommitteeCalendarTab: React.FC<Props> = ({ onCreateMeeting }) => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();
  const [events, setEvents] = useState<CommitteeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [type, setType] = useState<"meeting" | "inspection" | "audit" | "other">("meeting");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdmin = ["employer", "super_admin", "gerencia"].includes(profile?.role || "") || isMainAdmin(profile?.email);
  
  // Current view month
  const [viewDate, setViewDate] = useState(new Date());

  useEffect(() => {
    if (!selectedCompany) return;

    const qEvents = query(
      collection(db, "committee_events"), 
      where("companyRuc", "==", selectedCompany.ruc),
      orderBy("date", "asc")
    );
    
    const unsubscribe = onSnapshot(qEvents, (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as CommitteeEvent)));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedCompany]);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    setSaving(true);
    try {
      await addDoc(collection(db, "committee_events"), {
        title,
        date,
        type,
        description,
        companyRuc: selectedCompany.ruc,
        createdAt: serverTimestamp()
      });
      toast.success("Evento programado");
      setIsModalOpen(false);
      setTitle("");
      setDescription("");
      setType("meeting");
    } catch (err) {
      console.error(err);
      toast.error("Error al programar evento");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Eliminar este evento del cronograma?")) return;
    try {
      await deleteDoc(doc(db, "committee_events", id));
      toast.success("Evento eliminado");
    } catch (err) {
      console.error(err);
      toast.error("Error al eliminar");
    }
  };

  const getEventIcon = (type: string) => {
    switch(type) {
      case "meeting": return <Users className="w-5 h-5 text-blue-500" />;
      case "inspection": return <FileSearch className="w-5 h-5 text-orange-500" />;
      case "audit": return <ShieldCheck className="w-5 h-5 text-purple-500" />;
      default: return <CalendarIcon className="w-5 h-5 text-slate-500" />;
    }
  };

  const getEventColor = (type: string) => {
    switch(type) {
      case "meeting": return "border-blue-200 bg-blue-50";
      case "inspection": return "border-orange-200 bg-orange-50";
      case "audit": return "border-purple-200 bg-purple-50";
      default: return "border-slate-200 bg-slate-50";
    }
  };

  const months = Array.from({ length: 12 }, (_, i) => new Date(getYear(viewDate), i, 1));

  if (loading) return <div className="py-12 text-center text-slate-500">Cargando cronograma...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h3 className="font-bold text-slate-800 text-lg flex items-center">
            <CalendarIcon className="w-5 h-5 mr-2 text-indigo-600" />
            Cronograma Anual del Comité
          </h3>
          <p className="text-sm text-slate-500">Planificación de reuniones, inspecciones y auditorías ({getYear(viewDate)})</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={getYear(viewDate)}
            onChange={(e) => setViewDate(new Date(parseInt(e.target.value), 0, 1))}
            className="px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 font-medium"
          >
            {[0, 1, 2].map(offset => {
              const y = new Date().getFullYear() + offset - 1;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
          {isAdmin && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              <Plus className="w-4 h-4 mr-2" />
              Programar
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {months.map((monthDate, idx) => {
          const monthEvents = events.filter(e => isSameMonth(parseISO(e.date), monthDate));
          const isCurrentMonth = isSameMonth(monthDate, new Date());
          
          return (
            <div key={idx} className={`bg-white rounded-xl border \${isCurrentMonth ? 'border-indigo-300 shadow-md ring-1 ring-indigo-50' : 'border-slate-200 shadow-sm'} overflow-hidden flex flex-col h-full`}>
              <div className={`px-4 py-3 border-b flex justify-between items-center \${isCurrentMonth ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'}`}>
                <h4 className={`font-bold capitalize \${isCurrentMonth ? 'text-indigo-800' : 'text-slate-700'}`}>
                  {format(monthDate, "MMMM", { locale: es })}
                </h4>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full \${monthEvents.length > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500'}`}>
                  {monthEvents.length}
                </span>
              </div>
              <div className="p-3 flex-1 flex flex-col gap-2 min-h-[120px]">
                {monthEvents.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-sm text-slate-400 italic">
                    Sin programación
                  </div>
                ) : (
                  monthEvents.map(event => (
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      key={event.id} 
                      className={`p-3 rounded-lg border \${getEventColor(event.type)} relative group`}
                    >
                      <div className="flex gap-3">
                        <div className="mt-0.5 shrink-0">
                          {getEventIcon(event.type)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 leading-tight">{event.title}</p>
                          <p className="text-xs font-semibold text-slate-500 mt-1">
                            {format(parseISO(event.date), "dd MMM", { locale: es })}
                          </p>
                          {event.description && (
                            <p className="text-xs text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">{event.description}</p>
                          )}

                      {isAdmin && event.type === "meeting" && onCreateMeeting && (
                        <button
                          onClick={() => onCreateMeeting(event.date, event.title.toLowerCase().includes("extraordinaria") ? "extraordinaria" : "ordinaria")}
                          className="w-full mt-3 flex items-center justify-center px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 hover:text-blue-800 rounded-md text-xs font-bold transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Crear Acta
                        </button>
                      )}

                        </div>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(event.id!)}
                          className="absolute top-2 right-2 p-1.5 bg-white text-red-400 hover:text-red-600 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-bold text-slate-800">Programar Actividad</h3>
            </div>
            
            <form onSubmit={handleAddEvent} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Título</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ej. Reunión Ordinaria Enero"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Actividad</label>
                <select
                  value={type}
                  onChange={(e: any) => setType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  <option value="meeting">Reunión de Comité</option>
                  <option value="inspection">Inspección Planeada</option>
                  <option value="audit">Auditoría Interna</option>
                  <option value="other">Otra Actividad</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Programada</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción (Opcional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  rows={3}
                  placeholder="Detalles sobre los objetivos o temas a tratar..."
                />
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !title}
                  className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center"
                >
                  {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Guardando...</> : <><Check className="w-4 h-4 mr-2" /> Guardar Programación</>}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};
