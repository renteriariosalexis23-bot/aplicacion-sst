import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, updateDoc, doc, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { Drill, BrigadeMember, UserProfile } from "../types";
import { Loader2, Calendar, Users, FileText, AlertTriangle, Plus, Trash2, ShieldAlert, Clock, Play } from "lucide-react";

import { PageHeader } from "./ui/PageHeader";
import { uploadToCloudinary } from "../utils/cloudinary";
import { generateDrillReportPDF } from "../utils/pdfGenerator";
import { notifyAllWorkers } from "../utils/notifications";

export const Drills: React.FC = () => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();
  const ruc = selectedCompany?.ruc || profile?.companyRuc;
  
  const [activeTab, setActiveTab] = useState<"drills" | "brigades">("drills");
  
  // Data State
  const [drills, setDrills] = useState<Drill[]>([]);
  const [brigadeMembers, setBrigadeMembers] = useState<BrigadeMember[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);

  // Modals state
  const [showDrillModal, setShowDrillModal] = useState(false);
  const [showBrigadeModal, setShowBrigadeModal] = useState(false);

  // Form State - Drills
  const [drillTitle, setDrillTitle] = useState("");
  const [drillDate, setDrillDate] = useState("");
  const [drillType, setDrillType] = useState<Drill["type"]>("Sismo");
  const [drillTime, setDrillTime] = useState("");
  const [drillParticipants, setDrillParticipants] = useState("");
  const [drillEvaluation, setDrillEvaluation] = useState("");
  
  // Form State - Brigade
  const [brigadeUid, setBrigadeUid] = useState("");
  const [brigadeType, setBrigadeType] = useState<BrigadeMember["brigadeType"]>("Primeros Auxilios");
  const [brigadeRole, setBrigadeRole] = useState<BrigadeMember["role"]>("Miembro");
  const [brigadeContact, setBrigadeContact] = useState("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ruc) return;

    const drillsQ = query(collection(db, "drills"), where("companyRuc", "==", ruc));
    const unsubscribeDrills = onSnapshot(drillsQ, (snapshot) => {
      const drillsData: Drill[] = [];
      snapshot.forEach((doc) => drillsData.push({ id: doc.id, ...doc.data() } as Drill));
      setDrills(drillsData.sort((a,b) => b.date?.seconds - a.date?.seconds));
    });

    const brigadesQ = query(collection(db, "brigade_members"), where("companyRuc", "==", ruc));
    const unsubscribeBrigades = onSnapshot(brigadesQ, (snapshot) => {
      const brigadesData: BrigadeMember[] = [];
      snapshot.forEach((doc) => brigadesData.push({ id: doc.id, ...doc.data() } as BrigadeMember));
      setBrigadeMembers(brigadesData);
    });

    const usersQ = query(collection(db, "users"), where("companyRuc", "==", ruc));
    const unsubscribeUsers = onSnapshot(usersQ, (snapshot) => {
      const usersData: UserProfile[] = [];
      snapshot.forEach((doc) => usersData.push({ ...doc.data() } as UserProfile));
      setUsers(usersData);
    });

    return () => {
      unsubscribeDrills();
      unsubscribeBrigades();
      unsubscribeUsers();
    };
  }, [ruc]);

    const [uploadingDrillId, setUploadingDrillId] = useState<string | null>(null);

  const handleFileUpload = async (drillId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ruc) return;

    setUploadingDrillId(drillId);
    try {
      const url = await uploadToCloudinary(file);
      const drillRef = doc(db, "drills", drillId);
      const drill = drills.find(d => d.id === drillId);
      const updatedPhotos = [...(drill?.photos || []), { url, name: file.name, type: file.type }];
      await updateDoc(drillRef, { photos: updatedPhotos });
      toast.success("Evidencia subida correctamente");
    } catch (error) {
      console.error("Error uploading evidence", error);
      toast.error("Error al subir evidencia");
    } finally {
      setUploadingDrillId(null);
      e.target.value = ""; // Reset input
    }
  };

  const handleCreateDrill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruc) return;
    setLoading(true);

    try {
      const dDate = new Date(drillDate);
      if (isNaN(dDate.getTime()) || dDate.getFullYear() > 9999) {
        toast.error("La fecha ingresada es inválida. Verifique el año.");
        setLoading(false);
        return;
      }

      const newDrill: Drill = {
        companyRuc: ruc,
        title: drillTitle,
        date: Timestamp.fromDate(dDate),
        type: drillType,
        evacuationTimeSeconds: parseInt(drillTime) || 0,
        participantsCount: parseInt(drillParticipants) || 0,
        evaluation: drillEvaluation,
        photos: [],
        createdAt: Timestamp.now()
      };

      
      await addDoc(collection(db, "drills"), newDrill);
      
      // Notify all workers about the upcoming drill
      await notifyAllWorkers(
        "Nuevo Simulacro Programado",
        `Se ha programado un nuevo simulacro de tipo ${newDrill.type} para el ${newDrill.date}. Por favor revisar los detalles.`,
        "/drills",
        ruc
      );

      setShowDrillModal(false);
      resetDrillForm();
    } catch (error) {
      console.error(error);
      toast.error("Error al guardar el simulacro.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddBrigadeMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruc || !brigadeUid) return;
    setLoading(true);

    const user = users.find(u => u.uid === brigadeUid);
    if (!user) {
        setLoading(false);
        return;
    }

    try {
      const newMember: BrigadeMember = {
        companyRuc: ruc,
        uid: user.uid,
        name: user.displayName,
        brigadeType,
        role: brigadeRole,
        contact: brigadeContact
      };

      await addDoc(collection(db, "brigade_members"), newMember);
      setShowBrigadeModal(false);
      resetBrigadeForm();
    } catch (error) {
       console.error(error);
       toast.error("Error al agregar a la brigada.");
    } finally {
      setLoading(false);
    }
  };

  const deleteDrill = async (id: string) => {
    if (confirm("¿Estás seguro de eliminar este simulacro?")) {
      try {
        await deleteDoc(doc(db, "drills", id));
        toast.success("Simulacro eliminado exitosamente.");
      } catch (e) {
        toast.error("Error al eliminar el simulacro.");
      }
    }
  };

  const deleteBrigadeMember = async (id: string) => {
    if (confirm("¿Estás seguro de remover a esta persona de la brigada?")) {
      try {
        await deleteDoc(doc(db, "brigade_members", id));
        toast.success("Brigadista removido exitosamente.");
      } catch (e) {
        toast.error("Error al remover brigadista.");
      }
    }
  };

  const resetDrillForm = () => {
    setDrillTitle("");
    setDrillDate("");
    setDrillType("Sismo");
    setDrillTime("");
    setDrillParticipants("");
    setDrillEvaluation("");
  };

  const resetBrigadeForm = () => {
     setBrigadeUid("");
     setBrigadeType("Primeros Auxilios");
     setBrigadeRole("Miembro");
     setBrigadeContact("");
  };

  const formatSeconds = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
  };

  if (!["employer", "super_admin", "gerencia"].includes(profile?.role || "")) {
      return <div className="p-8 text-center text-red-500">No tienes acceso a este módulo.</div>;
  }

  return (
    <div className="w-full max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <PageHeader
        title="Simulacros y Brigadas"
        description="Gestiona las brigadas de emergencia y registra los simulacros realizados."
        icon={AlertTriangle}
        color="sky"
        actions={
          <div className="mt-4 sm:mt-0 flex space-x-3">
            {activeTab === "drills" ? (
              <button
                onClick={() => setShowDrillModal(true)}
                className="bg-white text-sky-700 rounded-lg px-4 py-2 flex items-center text-sm font-medium hover:bg-sky-50 shadow-sm border border-transparent"
              >
                <Plus className="w-4 h-4 mr-2" />
                Registrar Simulacro
              </button>
            ) : (
              <button
                onClick={() => setShowBrigadeModal(true)}
                className="bg-white text-sky-700 rounded-lg px-4 py-2 flex items-center text-sm font-medium hover:bg-sky-50 shadow-sm border border-transparent"
              >
                <Plus className="w-4 h-4 mr-2" />
                Añadir Brigadista
              </button>
            )}
          </div>
        }
      />

      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-max mb-6">
        <button
          onClick={() => setActiveTab("drills")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "drills"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Simulacros Programados / Realizados
        </button>
        <button
          onClick={() => setActiveTab("brigades")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "brigades"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Directorio de Brigadas
        </button>
      </div>

      {activeTab === "drills" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {drills.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                    No hay simulacros registrados aún.
                </div>
            ) : (
                <ul className="divide-y divide-slate-200">
                    {drills.map((drill) => (
                        <li key={drill.id} className="p-6 hover:bg-slate-50 transition-colors">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 inline-flex items-center gap-2">
                                        {drill.title}
                                        <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded-full font-medium">
                                            {drill.type}
                                        </span>
                                    </h3>
                                    <p className="text-sm text-slate-500 mt-1 flex items-center">
                                        <Calendar className="w-4 h-4 mr-1 text-slate-400" />
                                        {new Date(drill.date.toDate()).toLocaleDateString()}
                                    </p>
                                    <div className="mt-4 flex flex-wrap gap-4">
                                        <div className="flex flex-col bg-slate-100 px-3 py-2 rounded-md">
                                            <span className="text-xs text-slate-500 font-medium">Evacuación</span>
                                            <span className="text-sm font-bold text-slate-700 flex items-center gap-1">
                                                <Clock className="w-4 h-4 text-blue-500"/>
                                                {formatSeconds(drill.evacuationTimeSeconds)}
                                            </span>
                                        </div>
                                        <div className="flex flex-col bg-slate-100 px-3 py-2 rounded-md">
                                            <span className="text-xs text-slate-500 font-medium">Participantes</span>
                                            <span className="text-sm font-bold text-slate-700 flex items-center gap-1">
                                                <Users className="w-4 h-4 text-blue-500"/>
                                                {drill.participantsCount} personas
                                            </span>
                                        </div>
                                    </div>
                                    {drill.evaluation && (
                                         <div className="mt-4 bg-blue-50 border border-blue-100 p-3 rounded-md max-w-2xl">
                                             <p className="text-sm font-medium text-blue-900 mb-1">Evaluación / Notas:</p>
                                             <p className="text-sm text-blue-800 whitespace-pre-wrap">{drill.evaluation}</p>
                                         </div>
                                    )}
                                </div>
                                <button onClick={() => deleteDrill(drill.id!)} className="text-red-500 hover:bg-red-50 p-2 rounded-md transition-colors h-fit" title="Eliminar Simulacro">
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                            
                            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-4">
                              <div className="flex gap-2">
                                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors">
                                  {uploadingDrillId === drill.id ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Subiendo...</> : "Adjuntar Evidencia"}
                                  <input type="file" className="hidden" accept=".pdf,image/*" onChange={(e) => handleFileUpload(drill.id!, e)} disabled={uploadingDrillId === drill.id} />
                                </label>
                                <button
                                  onClick={() => generateDrillReportPDF(drill, selectedCompany?.businessName || "")}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                                >
                                  Generar Acta PDF
                                </button>
                              </div>
                              {drill.photos && drill.photos.length > 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-slate-500">Evidencias ({drill.photos.length}):</span>
                                  <div className="flex -space-x-2 overflow-hidden">
                                    {drill.photos.map((photo, i) => (
                                      <a key={i} href={photo.url} target="_blank" rel="noreferrer" title={photo.name} className="inline-block w-8 h-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-xs overflow-hidden relative z-10 hover:z-20">
                                        {photo.type?.startsWith("image/") ? <img src={photo.url} alt="" className="w-full h-full object-cover" /> : <FileText className="w-4 h-4 text-slate-500" />}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
      )}

      {activeTab === "brigades" && (
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
             {brigadeMembers.length === 0 ? (
                 <div className="p-8 text-center text-slate-500">
                     No hay brigadistas registrados.
                 </div>
             ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                     {brigadeMembers.map((member) => (
                         <div key={member.id} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col relative">
                             <div className={`h-2 w-full ${
                                 member.brigadeType === 'Primeros Auxilios' ? 'bg-red-500' :
                                 member.brigadeType === 'Contra Incendios' ? 'bg-orange-500' :
                                 member.brigadeType === 'Evacuación' ? 'bg-green-500' : 'bg-slate-500'
                             }`}></div>
                             <div className="p-5 flex-1 bg-white">
                                 <button onClick={() => deleteBrigadeMember(member.id!)} className="absolute top-4 right-4 text-slate-400 hover:text-red-500 transition-colors">
                                     <Trash2 className="w-4 h-4" />
                                 </button>
                                 <div className="inline-flex items-center gap-2 mb-3">
                                     <ShieldAlert className="w-5 h-5 text-blue-600" />
                                     <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{member.brigadeType}</span>
                                 </div>
                                 <h3 className="text-lg font-bold text-slate-900 truncate">{member.name}</h3>
                                 <div className="mt-2 flex flex-col gap-1.5">
                                     <div className="flex items-center text-sm">
                                         <span className="font-semibold text-slate-700 w-16">Rol:</span>
                                         <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${member.role === 'Líder' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'}`}>{member.role}</span>
                                     </div>
                                     <div className="flex items-center text-sm">
                                         <span className="font-semibold text-slate-700 w-16">Contacto:</span>
                                         <span className="text-slate-600">{member.contact || '-'}</span>
                                     </div>
                                 </div>
                             </div>
                         </div>
                     ))}
                 </div>
             )}
         </div>
      )}

      {/* MODALS */}
      {showDrillModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
               <h2 className="text-lg font-bold text-slate-900">Registrar Simulacro</h2>
            </div>
            <form onSubmit={handleCreateDrill} className="p-6 space-y-4">
               <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Simulacro</label>
                  <input type="text" value={drillTitle} onChange={e => setDrillTitle(e.target.value)} required className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" placeholder="Ej. Simulacro Nacional de Sismo"/>
               </div>
               <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label>
                      <input type="date" value={drillDate} onChange={e => setDrillDate(e.target.value)} max="9999-12-31" required className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"/>
                   </div>
                   <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                      <select value={drillType} onChange={e => setDrillType(e.target.value as Drill["type"])} required className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                          <option value="Sismo">Sismo</option>
                          <option value="Incendio">Incendio</option>
                          <option value="Evacuación Médica">Evacuación Médica</option>
                          <option value="Derrame">Derrame</option>
                          <option value="Otro">Otro</option>
                      </select>
                   </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tiempo de Evacuación (Segundos)</label>
                      <input type="number" min="0" value={drillTime} onChange={e => setDrillTime(e.target.value)} required className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" placeholder="Ej. 120"/>
                   </div>
                   <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">N° de Participantes</label>
                      <input type="number" min="0" value={drillParticipants} onChange={e => setDrillParticipants(e.target.value)} required className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" placeholder="Ej. 45"/>
                   </div>
               </div>
               <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Evaluación y Observaciones</label>
                  <textarea value={drillEvaluation} onChange={e => setDrillEvaluation(e.target.value)} className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" rows={3} placeholder="¿Qué salió bien y qué puede mejorar?"></textarea>
               </div>
               
               <div className="mt-6 flex justify-end space-x-3">
                 <button type="button" onClick={() => setShowDrillModal(false)} className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-md font-medium">Cancelar</button>
                 <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50">
                    {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Guardando...</> : "Guardar Simulacro"}
                 </button>
               </div>
            </form>
          </div>
        </div>
      )}

      {showBrigadeModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
               <h2 className="text-lg font-bold text-slate-900">Aceptar Brigadista</h2>
            </div>
            <form onSubmit={handleAddBrigadeMember} className="p-6 space-y-4">
               <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Trabajador</label>
                  <select value={brigadeUid} onChange={e => setBrigadeUid(e.target.value)} required className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                      <option value="">Seleccione un trabajador...</option>
                      {users.map(u => (
                          <option key={u.uid} value={u.uid}>{u.displayName}</option>
                      ))}
                  </select>
               </div>
               <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Brigada</label>
                  <select value={brigadeType} onChange={e => setBrigadeType(e.target.value as BrigadeMember["brigadeType"])} required className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                      <option value="Primeros Auxilios">Primeros Auxilios</option>
                      <option value="Evacuación">Evacuación</option>
                      <option value="Contra Incendios">Contra Incendios</option>
                      <option value="Otra">Otra</option>
                  </select>
               </div>
               <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                      <select value={brigadeRole} onChange={e => setBrigadeRole(e.target.value as BrigadeMember["role"])} required className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                          <option value="Líder">Líder</option>
                          <option value="Miembro">Miembro</option>
                      </select>
                   </div>
                   <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono / Anexo</label>
                      <input type="text" value={brigadeContact} onChange={e => setBrigadeContact(e.target.value)} className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" placeholder="Opcional"/>
                   </div>
               </div>
               
               <div className="mt-6 flex justify-end space-x-3">
                 <button type="button" onClick={() => setShowBrigadeModal(false)} className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-md font-medium">Cancelar</button>
                 <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50">
                    {loading ? "Añadiendo..." : "Añadir a Brigada"}
                 </button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
