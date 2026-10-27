import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { PageHeader } from "./ui/PageHeader";
import { ImageModal } from "./ui/ImageModal";
import { 
  Users, Plus, Search, Send, Calendar, FileText, CheckCircle, CheckCircle2, Target, CircleDashed, Timer, MessageSquare, Gavel, 
  Clock, AlertTriangle, ArrowRight, Camera, X, Upload, Download, Save, PenTool, Image as ImageIcon,
  ThumbsUp, Trash2, FileCheck, Loader2
} from "lucide-react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, getDocs, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { uploadToCloudinary } from "../utils/cloudinary";
import SignatureCanvas from "react-signature-canvas";
import { generateManagementMeetingPDF } from "../utils/pdfGenerator";
import { useCompany } from "../CompanyContext";
import { useSearchParams } from "react-router-dom";
import { notifyUser, deleteNotificationsByTarget } from "../utils/notifications";
import { ManagementMeeting, ManagementAgreement } from "../types";
import toast from "react-hot-toast";
import { SignerBanner } from "./ui/SignerBanner";

export const ManagementMeetings = () => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();
  const [meetings, setMeetings] = useState<ManagementMeeting[]>([]);
  const [agreements, setAgreements] = useState<ManagementAgreement[]>([]);
  
  const [selectedMeeting, setSelectedMeeting] = useState<ManagementMeeting | null>(null);
  
  const [isCreatingMeeting, setIsCreatingMeeting] = useState(false);
  const [isCreatingAgreement, setIsCreatingAgreement] = useState(false);
  const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(null);
  const [deletingAgreementId, setDeletingAgreementId] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{
    isOpen: boolean; 
    agreementId: string; 
    agreementDescription?: string;
    observations: { text: string; attachmentBase64: string | null }[];
  }>({ 
    isOpen: false, 
    agreementId: "", 
    observations: [{ text: "", attachmentBase64: null }] 
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewImageModal, setViewImageModal] = useState<string | null>(null);
  const [signatureModal, setSignatureModal] = useState<{isOpen: boolean; role: "gerencia" | "sst" | null}>({isOpen: false, role: null});
  const sigCanvas = useRef<SignatureCanvas>(null);
  
  const [evidenceModal, setEvidenceModal] = useState<{
    isOpen: boolean;
    agreementId: string;
    notes: string;
    file: File | null;
    observations?: { text: string; attachmentBase64: string | null; correctionText?: string; correctionFile?: File | null; correctionUrl?: string }[];
  }>({ isOpen: false, agreementId: "", notes: "", file: null, observations: [] });

  const [searchParams] = useSearchParams();

  const [newMeeting, setNewMeeting] = useState<{title: string, date: string, attendees: string, attendeeIds: string[], objective: string, keyPoints: string, decisions: string}>({ title: "", date: "", attendees: "", attendeeIds: [], objective: "", keyPoints: "", decisions: "" });
  const [newAgreement, setNewAgreement] = useState({ description: "", deadline: "", assignedToId: "", assignedToName: "" });
  const [users, setUsers] = useState<any[]>([]);
  useEffect(() => {
    const ruc = (profile?.role === "employer" || profile?.role === "super_admin" || profile?.role === "gerencia") ? selectedCompany?.ruc : profile?.companyRuc;
    if (!ruc && profile?.role !== "super_admin") return;

    let q;
    if (ruc) {
      q = query(collection(db, "users"), where("companyRuc", "==", ruc));
    } else {
      q = query(collection(db, "users"));
    }
    
    getDocs(q).then(snap => {
       const allUsers = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
       const allowedRoles = ["employer", "super_admin", "gerencia"];
       const filteredUsers = allUsers.filter(u => allowedRoles.includes(u.role as string));
       setUsers(filteredUsers);
    });
  }, [profile, selectedCompany]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAgreementId, setUploadingAgreementId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCompany?.ruc) return;

    const qMeetings = query(
      collection(db, "managementMeetings"),
      where("companyRuc", "==", selectedCompany.ruc)
    );
    const unMeetings = onSnapshot(qMeetings, (snap) => {
      setMeetings(snap.docs.map(d => ({ id: d.id, ...d.data() } as ManagementMeeting)).sort((a,b) => b.date.localeCompare(a.date)));
    });

    const qAgreements = query(
      collection(db, "managementAgreements"),
      where("companyRuc", "==", selectedCompany.ruc)
    );
    const unAgreements = onSnapshot(qAgreements, (snap) => {
      setAgreements(snap.docs.map(d => ({ id: d.id, ...d.data() } as ManagementAgreement)));
    });

    return () => { unMeetings(); unAgreements(); };
  }, [selectedCompany]);

  useEffect(() => {
    const meetingId = searchParams.get("meetingId");
    if (meetingId && meetings.length > 0) {
      const meeting = meetings.find(m => m.id === meetingId);
      if (meeting && (!selectedMeeting || selectedMeeting.id !== meeting.id)) {
        setSelectedMeeting(meeting);
      }
    }
  }, [searchParams, meetings, selectedMeeting]);

  // Handle meeting created inside setSelectedMeeting update
  useEffect(() => {
    if (selectedMeeting) {
      const updated = meetings.find(m => m.id === selectedMeeting.id);
      if (updated) setSelectedMeeting(updated);
    }
  }, [meetings]);

  
  const handleSignMeeting = async () => {
    if (!sigCanvas.current || sigCanvas.current.isEmpty() || !selectedMeeting?.id || !signatureModal.role) {
      return toast.error("Debe proporcionar una firma");
    }
    
    const signatureData = sigCanvas.current.getTrimmedCanvas().toDataURL("image/png");
    
    try {
      const updateField = signatureModal.role === "gerencia" ? "gerenciaSignature" : "sstSignature";
      const signerPrefix = signatureModal.role === "gerencia" ? "gerencia" : "sst";
      const updateData: any = {
        [updateField]: signatureData,
        [`${signerPrefix}SignerName`]: profile?.displayName || "",
        [`${signerPrefix}SignerDni`]: profile?.dni || "",
      };
      if (signatureModal.role === "gerencia") {
         updateData.status = "approved";
         updateData.managerApprovedAt = serverTimestamp();
      }
      await updateDoc(doc(db, "managementMeetings", selectedMeeting.id), updateData);
      toast.success(`Acta firmada como ${signatureModal.role === "gerencia" ? "Gerencia" : "SST"}`);
      setSignatureModal({ isOpen: false, role: null });
    } catch (error) {
      toast.error("Error al guardar la firma");
    }
  };

  const handleCreateMeeting = async () => {
    if (!newMeeting.title || !newMeeting.date) return toast.error("Título y fecha obligatorios");
    try {
      const docRef = await addDoc(collection(db, "managementMeetings"), {
        ...newMeeting,
        status: "scheduled",
        companyRuc: selectedCompany?.ruc,
        createdAt: serverTimestamp()
      });

      if (newMeeting.attendeeIds && newMeeting.attendeeIds.length > 0) {
         newMeeting.attendeeIds.forEach((userId) => {
             notifyUser(
               userId, 
               "Nueva Reunión de Gestión", 
               `Has sido invitado a la reunión: ${newMeeting.title}`, 
               `/management-meetings?meetingId=${docRef.id}`, 
               selectedCompany?.ruc, 
               docRef.id
             );
         });
      }

      setIsCreatingMeeting(false);
      setNewMeeting({ title: "", date: "", attendees: "", attendeeIds: [], objective: "", keyPoints: "", decisions: "" });
      toast.success("Reunión registrada");
    } catch (error) {
      toast.error("Error al crear reunión");
    }
  };

  const handleUpdateMeetingStatus = async (meetingId: string, status: "scheduled" | "in_review" | "approved") => {
    try {
      const updateData: any = { status };
      if (status === 'in_review') updateData.feedback = "";
      await updateDoc(doc(db, "managementMeetings", meetingId), updateData);
      toast.success("Estado de reunión actualizado");
    } catch (error) {
      toast.error("Error al actualizar estado");
    }
  };

  const handleCreateAgreement = async () => {
    if (!newAgreement.description) return toast.error("Descripción obligatoria");
    if (!selectedMeeting?.id) return;
    
    try {
      const docRef = await addDoc(collection(db, "managementAgreements"), {
        meetingId: selectedMeeting.id,
        description: newAgreement.description,
        deadline: newAgreement.deadline,
        assignedToId: newAgreement.assignedToId,
        assignedToName: newAgreement.assignedToName,
        status: "pending",
        managerApproved: false,
        evidenceUrls: [],
        companyRuc: selectedCompany?.ruc,
        createdAt: serverTimestamp()
      });

      if (newAgreement.assignedToId) {
         notifyUser(
           newAgreement.assignedToId, 
           "Nuevo Acuerdo Asignado", 
           `Se te ha asignado el acuerdo: ${newAgreement.description}`, 
           `/management-meetings?meetingId=${selectedMeeting.id}`, 
           selectedCompany?.ruc, 
           docRef.id
         );
      }

      setIsCreatingAgreement(false);
      setNewAgreement({ description: "", deadline: "", assignedToId: "", assignedToName: "" });
      toast.success("Acuerdo agregado");
    } catch (error) {
      toast.error("Error al crear acuerdo");
    }
  };

  const handleUpdateAgreementStatus = async (agreementId: string, status: "pending" | "in_progress" | "completed") => {
    try {
      const updateData: any = { status };
      if (status === 'in_progress') {
         // updateData.feedback = "";
      }
      await updateDoc(doc(db, "managementAgreements", agreementId), updateData);
      toast.success("Estado actualizado");
    } catch (error) {
      toast.error("Error al actualizar estado");
    }
  };

  

  const handleRequestCorrection = async () => {
    const validObservations = feedbackModal.observations.filter(obs => obs.text.trim() !== "");
    if (validObservations.length === 0 || !feedbackModal.agreementId) {
      toast.error("Debes ingresar al menos una observación");
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Ensure no undefined values are sent to Firestore
      const cleanObservations = validObservations.map(obs => ({
        text: obs.text || "",
        attachmentBase64: obs.attachmentBase64 || null
      }));

      await updateDoc(doc(db, "managementAgreements", feedbackModal.agreementId), {
        status: "pending",
        observations: cleanObservations,
        feedback: cleanObservations[0].text, // Retrocompatibility if needed
        feedbackAttachment: cleanObservations[0].attachmentBase64 || null, // Retrocompatibility if needed
        managerApproved: false
      });
      toast.success("Observación enviada al responsable");
      setFeedbackModal({ isOpen: false, agreementId: "", observations: [{ text: "", attachmentBase64: null }] });
    } catch (error: any) {
      console.error("Error details:", error);
      toast.error("Error al enviar observación: " + (error?.message || "Error desconocido"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFeedbackFileChange = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    toast.loading("Procesando archivo...", { id: "upload-feedback" });
    
    try {
      const url = await uploadToCloudinary(file);
      setFeedbackModal(prev => {
        const newObservations = [...prev.observations];
        newObservations[index] = { ...newObservations[index], attachmentBase64: url };
        return { ...prev, observations: newObservations };
      });
      toast.success("Archivo adjuntado", { id: "upload-feedback" });
    } catch (error) {
      toast.error("Error al procesar el archivo. Intenta con uno más pequeño.", { id: "upload-feedback" });
    }
  };

  const handleApproveAgreement = async (agreementId: string) => {
    try {
      await updateDoc(doc(db, "managementAgreements", agreementId), { 
        status: "completed",
        managerApproved: true,
        managerApprovedAt: serverTimestamp() 
      });
      toast.success("Acuerdo revisado y conforme");
    } catch (error) {
      toast.error("Error al aprobar acuerdo");
    }
  };

  const confirmDeleteMeeting = async () => {
    if(!deletingMeetingId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      // Eliminar tareas asociadas
      const qAgr = query(collection(db, "managementAgreements"), where("meetingId", "==", deletingMeetingId));
      const snap = await getDocs(qAgr);
      snap.forEach(async (d) => {
        await deleteDoc(doc(db, "managementAgreements", d.id));
        await deleteNotificationsByTarget(d.id);
      });
      
      // Eliminar la reunión
      await deleteDoc(doc(db, "managementMeetings", deletingMeetingId));
      await deleteNotificationsByTarget(deletingMeetingId);

      setSelectedMeeting(null);
      setDeletingMeetingId(null);
      toast.success("Reunión eliminada", { id: "delete-meeting" });
    } catch(e) {
      toast.error("Error al eliminar la reunión", { id: "delete-meeting" });
      setDeletingMeetingId(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  const confirmDeleteAgreement = async () => {
    if(!deletingAgreementId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, "managementAgreements", deletingAgreementId));
      await deleteNotificationsByTarget(deletingAgreementId);
      setDeletingAgreementId(null);
      toast.success("Acuerdo eliminado", { id: "delete-agreement" });
    } catch(e) {
      toast.error("Error al eliminar", { id: "delete-agreement" });
      setDeletingAgreementId(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleUploadEvidenceClick = (agreement: ManagementAgreement) => {
    setEvidenceModal({ 
      isOpen: true, 
      agreementId: agreement.id!, 
      notes: "", 
      file: null,
      observations: agreement.observations ? [...agreement.observations] : []
    });
  };

  const handleEvidenceSubmit = async () => {
    if (!evidenceModal.agreementId) return;

    // Check if at least one file is provided either general or in observations
    const hasGeneralFile = !!evidenceModal.file;
    const hasObservationFiles = evidenceModal.observations && evidenceModal.observations.some(obs => obs.correctionFile);
    
    if (!hasGeneralFile && !hasObservationFiles && (!evidenceModal.observations || evidenceModal.observations.length === 0)) return;

    setIsSubmitting(true);
    toast.loading("Subiendo y optimizando evidencia...", { id: "upload" });
    try {
      const agreement = agreements.find(a => a.id === evidenceModal.agreementId);
      if (agreement && agreement.id) {
         let generalUrl = null;
         if (hasGeneralFile) {
           generalUrl = await uploadToCloudinary(evidenceModal.file!);
         }
         
         const updatedObservations = evidenceModal.observations ? await Promise.all(
           evidenceModal.observations.map(async (obs) => {
             let correctionUrl = obs.correctionUrl;
             if (obs.correctionFile) {
               correctionUrl = await uploadToCloudinary(obs.correctionFile);
             }
             return {
               text: obs.text,
               attachmentBase64: obs.attachmentBase64,
               correctionText: obs.correctionText || "",
               correctionUrl: correctionUrl || null
             };
           })
         ) : [];

         const updatedEvidenceUrls = generalUrl 
           ? [...(agreement.evidenceUrls || []), generalUrl] 
           : (agreement.evidenceUrls || []);

         await updateDoc(doc(db, "managementAgreements", agreement.id), {
           evidenceUrls: updatedEvidenceUrls,
           notes: evidenceModal.notes || agreement.notes || "",
           observations: updatedObservations,
           status: "in_progress",
         });
         toast.success("Evidencia adjuntada y enviada a revisión", { id: "upload" });
      }
      setEvidenceModal({ isOpen: false, agreementId: "", notes: "", file: null, observations: [] });
    } catch (error) {
      toast.error("Error al subir archivo. Intenta con uno más pequeño.", { id: "upload" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewAttachment = (url: string) => {
    const isPdfOrDoc = url.includes('.pdf') || url.includes('.doc') || url.includes('.xls') || url.startsWith('data:application/');
    if (isPdfOrDoc) {
      if (url.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `evidencia_${new Date().getTime()}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        window.open(url, '_blank');
      }
    } else {
      setViewImageModal(url);
    }
  };

  if (selectedMeeting) {
    const meetingAgreements = agreements.filter(a => a.meetingId === selectedMeeting.id);
    const completedAgreements = meetingAgreements.filter(a => a.status === 'completed' || a.managerApproved).length;
    
    return (
      <div className="w-full space-y-6">
        <button 
          onClick={() => setSelectedMeeting(null)}
          className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-2 mb-2"
        >
          &larr; Volver a lista de reuniones
        </button>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-3xl font-black text-slate-800 mb-2">{selectedMeeting.title}</h2>
              <div className="flex gap-4 text-sm text-slate-500">
                <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {selectedMeeting.date}</span>
                <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {selectedMeeting.attendees}</span>
              </div>
            </div>
            <div className="flex gap-3">

               {selectedMeeting.sstSignature && selectedMeeting.gerenciaSignature && (
                 <button 
                   onClick={async () => {
                     // Se abre la pestaña antes de esperar para que el navegador no la bloquee
                     const tab = window.open("", "_blank");
                     const pdfUrl = await generateManagementMeetingPDF(selectedMeeting, meetingAgreements, selectedCompany?.businessName || "");
                     if (tab) tab.location.href = pdfUrl;
                     else window.open(pdfUrl, "_blank");
                   }} 
                   className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700 flex items-center gap-2 shadow-sm"
                   title="Generar Acta PDF"
                 >
                   <FileText className="w-4 h-4" /> Acta PDF
                 </button>
               )}

               {!selectedMeeting.sstSignature && profile?.role !== 'gerencia' && (
                 <button 
                   onClick={() => setSignatureModal({ isOpen: true, role: "sst" })}
                   className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg font-bold text-sm hover:bg-indigo-100 flex items-center gap-2 shadow-sm"
                 >
                   <PenTool className="w-4 h-4" /> Firmar (SST)
                 </button>
               )}
               {selectedMeeting.sstSignature && (
                 <div className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-sm border border-indigo-200">
                   <CheckCircle className="w-4 h-4" /> SST Firmó
                 </div>
               )}
               
               {selectedMeeting.sstSignature && !selectedMeeting.gerenciaSignature && profile?.role === 'gerencia' && (
                 <button 
                   onClick={() => setSignatureModal({ isOpen: true, role: "gerencia" })}
                   className="bg-purple-50 text-purple-700 px-4 py-2 rounded-lg font-bold text-sm hover:bg-purple-100 flex items-center gap-2 shadow-sm"
                 >
                   <PenTool className="w-4 h-4" /> Firmar (Gerencia)
                 </button>
               )}
               {selectedMeeting.gerenciaSignature && (
                 <div className="bg-purple-100 text-purple-700 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-sm border border-purple-200">
                   <CheckCircle className="w-4 h-4" /> Gerencia Firmó
                 </div>
               )}

               {profile?.role !== 'gerencia' && (
                 <button onClick={() => setDeletingMeetingId(selectedMeeting.id!)} className="bg-red-50 text-red-600 px-3 py-2 rounded-lg hover:bg-red-100 transition-colors" title="Eliminar Reunión">
                   <Trash2 className="w-5 h-5" />
                 </button>
               )}
            </div>
          </div>
          
          
          
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100/50">
              <h4 className="flex items-center gap-2 text-sm font-bold text-blue-800 mb-3">
                <Target className="w-4 h-4 text-blue-600" /> Objetivo
              </h4>
              <p className="text-slate-700 text-sm whitespace-pre-line">{selectedMeeting.objective || selectedMeeting.topics || "No especificado"}</p>
            </div>
            <div className="bg-purple-50/50 p-5 rounded-xl border border-purple-100/50">
              <h4 className="flex items-center gap-2 text-sm font-bold text-purple-800 mb-3">
                <MessageSquare className="w-4 h-4 text-purple-600" /> Puntos Clave
              </h4>
              <p className="text-slate-700 text-sm whitespace-pre-line">{selectedMeeting.keyPoints || "No especificado"}</p>
            </div>
            <div className="bg-emerald-50/50 p-5 rounded-xl border border-emerald-100/50">
              <h4 className="flex items-center gap-2 text-sm font-bold text-emerald-800 mb-3">
                <Gavel className="w-4 h-4 text-emerald-600" /> Decisiones
              </h4>
              <p className="text-slate-700 text-sm whitespace-pre-line">{selectedMeeting.decisions || "No especificado"}</p>
            </div>
          </div>
        </div>

        {meetingAgreements.length > 0 && (
          <div className="mt-8 mb-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-end mb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-700">Progreso de Tareas</h4>
                <p className="text-xs text-slate-500">
                  {completedAgreements} de {meetingAgreements.length} tareas validadas
                </p>
              </div>
              <span className="text-lg font-black text-blue-600">
                {Math.round((completedAgreements / meetingAgreements.length) * 100)}%
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${(completedAgreements / meetingAgreements.length) * 100}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className={`h-full ${completedAgreements === meetingAgreements.length ? 'bg-emerald-500' : 'bg-blue-500'}`}
              />
            </div>
            
            {completedAgreements === meetingAgreements.length && meetingAgreements.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-center gap-2 text-emerald-700 font-bold shadow-sm"
              >
                <ThumbsUp className="w-5 h-5" />
                ¡Excelente trabajo! Todas las tareas de esta reunión han sido completadas y validadas.
              </motion.div>
            )}
          </div>
        )}

        <div className="flex justify-between items-end mt-6">
          <div>
            <h3 className="text-2xl font-bold text-slate-800">
              {profile?.role === 'gerencia' ? "Seguimiento de Tareas y Compromisos" : "Tareas y Compromisos (Tus Entregables)"}
            </h3>
            <p className="text-slate-500">Da seguimiento a las tareas derivadas de esta reunión</p>
          </div>
          {profile?.role !== 'gerencia' && (
            <button 
              onClick={() => setIsCreatingAgreement(true)}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm shadow-blue-200"
            >
              <Plus className="w-5 h-5" /> Nueva Tarea
            </button>
          )}
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 15 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.4 }}
          className="space-y-4"
        >
          {meetingAgreements.map((agr, index) => (
            <motion.div 
              key={agr.id} 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow ${agr.managerApproved ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200'}`}
            >
              <div className="flex flex-col md:flex-row gap-6 justify-between">
                <div className="flex-1">
                  <div className="flex justify-between">
                    <h4 className="font-bold text-lg text-slate-800 mb-2">{agr.description}</h4>
                    {profile?.role !== 'gerencia' && (
                      <button onClick={() => setDeletingAgreementId(agr.id!)} className="text-slate-400 hover:text-red-500">
                         <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-4 text-sm text-slate-500 mb-4">
                    <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> Límite: {agr.deadline || 'Sin fecha'}</span>
                  </div>
                  
                  {((agr.observations && agr.observations.length > 0) || agr.feedback) && !agr.managerApproved && (
                    <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex flex-col gap-3">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                        <p className="text-sm font-bold text-red-700 uppercase">Observaciones de Gerencia</p>
                      </div>
                      
                      <div className="flex flex-col gap-4 pl-7">
                        {(agr.observations && agr.observations.length > 0) ? (
                          agr.observations.map((obs, idx) => (
                            <div key={idx} className="bg-white/60 p-3 rounded-lg border border-red-100 shadow-sm relative">
                              <span className="absolute -left-2.5 -top-2.5 bg-red-100 border border-red-200 text-red-700 font-bold w-6 h-6 rounded-full flex items-center justify-center text-xs">
                                {idx + 1}
                              </span>
                              <p className="text-sm text-red-800 leading-relaxed whitespace-pre-wrap">{obs.text}</p>
                              {obs.attachmentBase64 && (
                                <div className="mt-3">
                                  <p className="text-xs font-medium text-red-600 mb-1.5">Archivo adjunto:</p>
                                  {obs.attachmentBase64.includes('.pdf') || obs.attachmentBase64.includes('.doc') || obs.attachmentBase64.includes('.xls') || obs.attachmentBase64.includes('.ppt') || !obs.attachmentBase64.match(/\.(jpeg|jpg|gif|png|webp|bmp|svg)$/i) ? (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); window.open(obs.attachmentBase64, '_blank'); }}
                                      className="flex items-center gap-2 px-3 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-sm transition-colors border border-red-200"
                                    >
                                      <FileText className="w-4 h-4" />
                                      Ver Documento Adjunto
                                    </button>
                                  ) : (
                                    <img 
                                      src={obs.attachmentBase64} 
                                      alt={`Observación ${idx + 1}`} 
                                      className="max-h-32 w-auto rounded-lg border border-red-200 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                                      onClick={(e) => { e.stopPropagation(); setViewImageModal(obs.attachmentBase64); }}
                                    />
                                  )}
                                </div>
                              )}
                              {(obs.correctionText || obs.correctionUrl) && (
                                <div className="mt-4 pt-3 border-t border-red-100/50">
                                  <p className="text-[11px] font-bold text-slate-500 uppercase mb-2">Respuesta / Subsanación</p>
                                  {obs.correctionText && (
                                    <p className="text-sm text-slate-700 whitespace-pre-wrap mb-2 bg-blue-50/50 p-2 rounded border border-blue-100/50">{obs.correctionText}</p>
                                  )}
                                  {obs.correctionUrl && (
                                    <button 
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleViewAttachment(obs.correctionUrl!); }}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                                    >
                                      <FileCheck className="w-4 h-4" /> Ver Evidencia Adjunta
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          // Fallback para observaciones antiguas que usaban solo feedback string
                          <div className="bg-white/60 p-3 rounded-lg border border-red-100 shadow-sm">
                            <p className="text-sm text-red-800 leading-relaxed whitespace-pre-wrap">{agr.feedback}</p>
                            {agr.feedbackAttachment && (
                              <div className="mt-3">
                                <p className="text-xs font-medium text-red-600 mb-1.5">Archivo adjunto:</p>
                                {agr.feedbackAttachment.includes('.pdf') || agr.feedbackAttachment.includes('.doc') || agr.feedbackAttachment.includes('.xls') || agr.feedbackAttachment.includes('.ppt') || !agr.feedbackAttachment.match(/\.(jpeg|jpg|gif|png|webp|bmp|svg)$/i) ? (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); window.open(agr.feedbackAttachment, '_blank'); }}
                                    className="flex items-center gap-2 px-3 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-sm transition-colors border border-red-200"
                                  >
                                    <FileText className="w-4 h-4" />
                                    Ver Documento Adjunto
                                  </button>
                                ) : (
                                  <img 
                                    src={agr.feedbackAttachment} 
                                    alt="Observación" 
                                    className="max-h-32 w-auto rounded-lg border border-red-200 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={(e) => { e.stopPropagation(); setViewImageModal(agr.feedbackAttachment || null); }}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {agr.evidenceUrls && agr.evidenceUrls.length > 0 && (
                    <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <p className="text-xs font-bold text-slate-500 uppercase mb-2">Evidencias Adjuntas</p>
                      
                      {agr.notes && (
                        <div className="mb-4 bg-white border border-slate-200 rounded-lg p-3">
                          <p className="text-xs font-bold text-slate-500 uppercase mb-1">Comentario del Trabajador</p>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{agr.notes}</p>
                        </div>
                      )}

                      <div className="flex gap-2 flex-wrap">
                         {agr.evidenceUrls.map((url, idx) => {
                           const isImage = url.startsWith('data:image/');
                           return (
                             <a 
                               href={url} 
                               download={`Evidencia-${idx + 1}`} 
                               key={idx} 
                               className="relative w-16 h-16 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center group hover:bg-slate-200 transition-colors shrink-0"
                               title="Descargar evidencia"
                             >
                               {isImage ? (
                                 <img src={url} alt="Evidencia" className="w-full h-full object-cover group-hover:opacity-40 transition-opacity" />
                               ) : (
                                 <div className="flex flex-col items-center text-slate-400 group-hover:opacity-40 transition-opacity">
                                   <FileText className="w-6 h-6 text-indigo-500 mb-1" />
                                   <span className="text-[9px] font-bold text-slate-500">ARCHIVO</span>
                                 </div>
                               )}
                               <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                 <Download className="w-6 h-6 text-slate-800 drop-shadow-md" />
                               </div>
                             </a>
                           );
                         })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="w-full md:w-80 flex flex-col items-end justify-center space-y-4">
                  {/* Status Indicator */}
                  {!agr.managerApproved && (
                    <div className="flex gap-2 w-full justify-end">
                      {((agr.observations && agr.observations.length > 0) || agr.feedback) ? (
                        agr.status === 'in_progress' ? (
                          <div className="w-full py-2 px-1 flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wider font-bold rounded-lg border transition-all bg-blue-50 text-blue-700 border-blue-200 shadow-sm ring-1 ring-blue-500/20">
                            <Timer className="w-3.5 h-3.5" /> Corrección en Revisión
                          </div>
                        ) : (
                          <div className="w-full py-2 px-1 flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wider font-bold rounded-lg border transition-all bg-red-50 text-red-700 border-red-200 shadow-sm ring-1 ring-red-500/20">
                            <AlertTriangle className="w-3.5 h-3.5" /> Observado
                          </div>
                        )
                      ) : (
                        <>
                          <div className={`flex-1 py-2 px-1 flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wider font-bold rounded-lg border transition-all ${agr.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm ring-1 ring-amber-500/20' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                            <CircleDashed className="w-3.5 h-3.5" /> Pendiente
                          </div>
                          <div className={`flex-1 py-2 px-1 flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wider font-bold rounded-lg border transition-all ${agr.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm ring-1 ring-blue-500/20' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                            <Timer className="w-3.5 h-3.5" /> En Revisión
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 w-full">
                    {!agr.managerApproved && profile?.role !== "gerencia" && (
                       <button onClick={() => handleUploadEvidenceClick(agr)} className={`flex-1 border px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${agr.status === 'in_progress' ? 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                         {agr.status === 'in_progress' ? (
                           <>
                             <PenTool className="w-4 h-4" /> 
                             {((agr.observations && agr.observations.length > 0) || agr.feedback) ? 'Actualizar Corrección' : 'Actualizar Evidencia'}
                           </>
                         ) : (
                           <>
                             <Upload className="w-4 h-4" /> Subir Evidencia
                           </>
                         )}
                       </button>
                    )}
                    
                    {agr.status === 'in_progress' && !agr.managerApproved && profile?.role === "gerencia" && (
                      <>
                        <button 
                          onClick={() => handleApproveAgreement(agr.id!)} 
                          className="flex-1 bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center justify-center gap-2 shadow-sm shadow-emerald-200"
                        >
                          <CheckCircle className="w-4 h-4" /> Validar
                        </button>
                        <button 
                          onClick={() => {
                            const existingObs = agr.observations && agr.observations.length > 0 
                              ? agr.observations 
                              : (agr.feedback ? [{ text: agr.feedback, attachmentBase64: agr.feedbackAttachment || null }] : [{ text: "", attachmentBase64: null }]);
                            setFeedbackModal({ 
                              isOpen: true, 
                              agreementId: agr.id!, 
                              observations: existingObs, 
                              agreementDescription: agr.description 
                            });
                          }}
                          className="flex-1 bg-amber-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 flex items-center justify-center gap-2 shadow-sm shadow-amber-200"
                        >
                          <AlertTriangle className="w-4 h-4" /> Observar
                        </button>
                      </>
                    )}
                    
                    {agr.managerApproved && (
                      <div className="w-full bg-emerald-100 text-emerald-800 px-4 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 border border-emerald-200">
                         <CheckCircle className="w-5 h-5" /> Validado por Gerencia
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
          {meetingAgreements.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-500 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
              No hay tareas registradas aún para esta reunión.
            </div>
          )}
        </motion.div>

      {/* Create Agreement Modal */}
        {isCreatingAgreement && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                <h3 className="font-bold text-slate-800 text-lg">Nueva Tarea / Compromiso</h3>
                <button onClick={() => setIsCreatingAgreement(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">¿Qué vas a hacer?</label>
                  <textarea 
                    value={newAgreement.description}
                    onChange={e => setNewAgreement({...newAgreement, description: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 outline-none focus:border-blue-500"
                    placeholder="Ej. Actualizar la matriz IPERC"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Para Cuándo (Fecha Límite)</label>
                  <input 
                    type="date"
                    value={newAgreement.deadline}
                    onChange={e => setNewAgreement({...newAgreement, deadline: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Asignar a</label>
                  <select
                    value={newAgreement.assignedToId}
                    onChange={(e) => {
                      const selectedUser = users.find((u) => u.id === e.target.value);
                      setNewAgreement({
                        ...newAgreement,
                        assignedToId: e.target.value,
                        assignedToName: selectedUser ? selectedUser.displayName || selectedUser.email : "",
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 outline-none focus:border-blue-500"
                  >
                    <option value="">Seleccione un responsable</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.displayName || user.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                  <button onClick={() => setIsCreatingAgreement(false)} className="px-5 py-2 text-slate-600 font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">Cancelar</button>
                  <button onClick={handleCreateAgreement} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">Guardar Tarea</button>
              </div>
            </div>
          </div>
        )}
      {/* Signature Modal */}
      {signatureModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <PenTool className="w-5 h-5" /> Firma del Acta
              </h3>
              <button onClick={() => setSignatureModal({isOpen: false, role: null})} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                Dibuja tu firma en el recuadro a continuación para aprobar el acta de esta reunión.
              </p>
              <SignerBanner className="mb-4" />
              <div className="border-2 border-slate-200 border-dashed rounded-xl overflow-hidden bg-slate-50 cursor-crosshair">
                <SignatureCanvas
                  ref={sigCanvas}
                  canvasProps={{
                    className: "w-full h-48",
                  }}
                  backgroundColor="rgb(248 250 252)"
                />
              </div>
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => sigCanvas.current?.clear()}
                  className="text-sm text-slate-500 hover:text-slate-700 underline"
                >
                  Limpiar firma
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setSignatureModal({isOpen: false, role: null})} className="px-5 py-2 text-slate-600 font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">Cancelar</button>
              <button 
                onClick={handleSignMeeting} 
                disabled={isSubmitting}
                className="bg-slate-900 text-white px-6 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                Firmar y Aprobar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {feedbackModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-t-4 border-t-red-500 flex justify-between items-start bg-white shrink-0">
              <div>
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-5 h-5 text-red-500" /> Observar Tarea
                </h3>
                <p className="text-sm text-slate-500">Tarea: <span className="font-medium text-slate-700">{feedbackModal.agreementDescription}</span></p>
              </div>
              <button onClick={() => setFeedbackModal({ isOpen: false, agreementId: "", observations: [{ text: "", attachmentBase64: null }] })} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 pt-2 overflow-y-auto flex-1">
              <div className="space-y-6">
                {feedbackModal.observations.map((obs, index) => (
                  <div key={index} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative">
                    {feedbackModal.observations.length > 1 && (
                      <button 
                        onClick={() => setFeedbackModal(prev => ({ ...prev, observations: prev.observations.filter((_, i) => i !== index) }))}
                        className="absolute -top-3 -right-3 bg-red-50 border border-red-100 text-red-600 p-1.5 rounded-full hover:bg-red-100 transition-colors shadow-sm"
                        title="Eliminar observación"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="bg-red-100 text-red-700 font-bold w-6 h-6 rounded-full flex items-center justify-center text-xs">
                        {index + 1}
                      </span>
                      <h4 className="font-medium text-slate-700 text-sm">Observación</h4>
                    </div>
                    
                    <textarea 
                      value={obs.text}
                      onChange={e => setFeedbackModal(prev => {
                        const newObs = [...prev.observations];
                        newObs[index] = { ...newObs[index], text: e.target.value };
                        return { ...prev, observations: newObs };
                      })}
                      className="w-full bg-slate-50 border border-transparent focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-500/10 rounded-lg p-3 outline-none transition-all resize-none mb-4 text-sm"
                      placeholder="Ej. Falta actualizar el archivo adjunto..."
                      rows={3}
                    />

                    {!obs.attachmentBase64 ? (
                      <div className="relative">
                        <input 
                          type="file" 
                          id={`feedback-file-${index}`} 
                          className="hidden" 
                          onChange={(e) => handleFeedbackFileChange(e, index)}
                        />
                        <label 
                          htmlFor={`feedback-file-${index}`}
                          className="w-full border-2 border-dashed border-slate-300 hover:border-red-400 hover:bg-red-50/50 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
                        >
                          <div className="p-2 bg-white shadow-sm rounded-full border border-slate-100">
                            <Upload className="w-5 h-5 text-slate-400" />
                          </div>
                          <div className="text-center">
                            <p className="text-xs font-medium text-slate-700">Adjuntar archivo <span className="text-red-500">aquí</span></p>
                          </div>
                        </label>
                      </div>
                    ) : (
                      <div className="relative inline-block border border-slate-200 rounded-lg p-1 bg-slate-50">
                        {obs.attachmentBase64.includes('.pdf') || obs.attachmentBase64.includes('.doc') || obs.attachmentBase64.includes('.xls') || obs.attachmentBase64.includes('.ppt') || !obs.attachmentBase64.match(/\.(jpeg|jpg|gif|png|webp|bmp|svg)$/i) ? (
                          <div className="h-24 w-24 flex flex-col items-center justify-center bg-slate-100 rounded">
                             <FileText className="w-8 h-8 text-slate-400 mb-1" />
                             <span className="text-[10px] text-slate-500 font-medium">Documento</span>
                          </div>
                        ) : (
                          <img src={obs.attachmentBase64} alt="Preview" className="h-24 w-auto rounded object-cover" />
                        )}
                        <button 
                          onClick={() => setFeedbackModal(prev => {
                            const newObs = [...prev.observations];
                            newObs[index] = { ...newObs[index], attachmentBase64: null };
                            return { ...prev, observations: newObs };
                          })}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow hover:bg-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              <button
                onClick={() => setFeedbackModal(prev => ({ ...prev, observations: [...prev.observations, { text: "", attachmentBase64: null }] }))}
                className="mt-4 w-full border-2 border-dashed border-slate-200 hover:border-slate-400 text-slate-500 hover:text-slate-700 rounded-xl p-3 flex items-center justify-center gap-2 transition-colors font-medium text-sm"
              >
                <Plus className="w-4 h-4" /> Agregar otra observación
              </button>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
              <button onClick={() => setFeedbackModal({ isOpen: false, agreementId: "", observations: [{ text: "", attachmentBase64: null }] })} className="px-5 py-2 text-slate-600 font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">Cancelar</button>
              <button 
                onClick={handleRequestCorrection} 
                disabled={!feedbackModal.observations.some(obs => obs.text.trim()) || isSubmitting}
                className="bg-red-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm shadow-red-200"
              >
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</>
                ) : (
                  <><Send className="w-4 h-4" /> Enviar Observaciones</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      
      {/* Modales de Confirmación */}
      {deletingMeetingId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex justify-center items-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="font-bold text-slate-800 text-xl mb-2">¿Eliminar Reunión?</h3>
              <p className="text-slate-500 text-sm">
                Estás a punto de eliminar esta reunión de forma permanente. <strong>Se perderán todas sus tareas asociadas.</strong> ¿Deseas continuar?
              </p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                <button onClick={() => setDeletingMeetingId(null)} className="flex-1 px-4 py-2 text-slate-600 font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">Cancelar</button>
                <button onClick={confirmDeleteMeeting} className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors">Sí, Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {deletingAgreementId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex justify-center items-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="font-bold text-slate-800 text-xl mb-2">¿Eliminar Tarea?</h3>
              <p className="text-slate-500 text-sm">
                Esta acción eliminará la tarea seleccionada. ¿Deseas continuar?
              </p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                <button onClick={() => setDeletingAgreementId(null)} className="flex-1 px-4 py-2 text-slate-600 font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">Cancelar</button>
                <button onClick={confirmDeleteAgreement} className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors">Sí, Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Image Modal for Meeting View */}
      <ImageModal
        isOpen={!!viewImageModal}
        imageUrl={viewImageModal}
        onClose={() => setViewImageModal(null)}
      />

      {/* Subsanar Observación Modal */}
      {evidenceModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 text-lg">Subsanar Observación</h3>
              <button onClick={() => setEvidenceModal({ isOpen: false, agreementId: "", notes: "", file: null })} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[70vh]">
              {evidenceModal.observations && evidenceModal.observations.length > 0 ? (
                <div className="space-y-6">
                  {evidenceModal.observations.map((obs, idx) => (
                    <div key={idx} className="bg-red-50 p-4 rounded-xl border border-red-100">
                      <div className="flex gap-2 mb-3">
                        <span className="bg-red-100 text-red-700 font-bold w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                           <p className="text-sm font-bold text-red-800">Observación de Gerencia</p>
                           <p className="text-sm text-red-700 mt-1">{obs.text}</p>
                           {obs.attachmentBase64 && (
                             <img src={obs.attachmentBase64} alt="Obs" className="max-h-24 mt-2 rounded border border-red-200" />
                           )}
                        </div>
                      </div>
                      
                      <div className="bg-white p-4 rounded-lg border border-red-100 mt-3 flex flex-col gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-slate-700">Evidencia de Subsanación (Opcional)</label>
                          <input
                            id={`evidence-file-obs-${idx}`}
                            type="file"
                            className="hidden"
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const newObs = [...(evidenceModal.observations || [])];
                                newObs[idx].correctionFile = file;
                                setEvidenceModal({ ...evidenceModal, observations: newObs });
                              }
                            }}
                          />
                          <button 
                            onClick={() => document.getElementById(`evidence-file-obs-${idx}`)?.click()}
                            className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 justify-center transition-colors"
                          >
                            {obs.correctionFile ? (
                               <><FileCheck className="w-4 h-4 text-emerald-500" /> <span className="text-emerald-700 font-medium">{obs.correctionFile.name}</span></>
                            ) : (
                               <><Upload className="w-4 h-4" /> Adjuntar archivo para esta observación</>
                            )}
                          </button>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-slate-700">Respuesta (Opcional)</label>
                          <textarea
                            value={obs.correctionText || ""}
                            onChange={(e) => {
                               const newObs = [...(evidenceModal.observations || [])];
                               newObs[idx].correctionText = e.target.value;
                               setEvidenceModal({ ...evidenceModal, observations: newObs });
                            }}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm outline-none focus:border-blue-500 min-h-[60px]"
                            placeholder="Ej. Ya se corrigió..."
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-slate-200 pt-4 mt-2">
                    <p className="text-sm font-bold text-slate-700 mb-2">Comentario General Adicional (Opcional)</p>
                    <textarea
                      value={evidenceModal.notes}
                      onChange={(e) => setEvidenceModal({ ...evidenceModal, notes: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-3 text-sm outline-none focus:border-blue-500 min-h-[80px]"
                      placeholder="Algún comentario general para toda la tarea..."
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-slate-700">Evidencia (Obligatorio)</label>
                    <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors relative cursor-pointer" onClick={() => document.getElementById('evidence-file-upload')?.click()}>
                      <input
                        id="evidence-file-upload"
                        type="file"
                        className="hidden"
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setEvidenceModal({ ...evidenceModal, file });
                        }}
                      />
                      {evidenceModal.file ? (
                        <div className="flex flex-col items-center gap-2">
                          <FileCheck className="w-10 h-10 text-emerald-500" />
                          <span className="text-sm font-medium text-emerald-700">{evidenceModal.file.name}</span>
                          <span className="text-xs text-slate-500">Haz clic para cambiar el archivo</span>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-10 h-10 text-slate-400 mb-2" />
                          <p className="text-sm font-medium text-slate-700">Seleccionar archivo</p>
                          <p className="text-xs text-slate-500 mt-1">Soporta imágenes, PDFs y documentos</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-slate-700">Respuesta a la observación (Opcional)</label>
                    <textarea
                      value={evidenceModal.notes}
                      onChange={(e) => setEvidenceModal({ ...evidenceModal, notes: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm outline-none focus:border-blue-500 min-h-[100px]"
                      placeholder="Ej. Ya se corrigió la fecha y se agregó la firma requerida..."
                    />
                  </div>
                </>
              )}
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setEvidenceModal({ isOpen: false, agreementId: "", notes: "", file: null, observations: [] })} className="px-5 py-2 text-slate-600 font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleEvidenceSubmit}
                disabled={isSubmitting || (!evidenceModal.file && (!evidenceModal.observations || !evidenceModal.observations.some(o => o.correctionFile || o.correctionText)))}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Enviar a Revisión</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    );
  }

  // Meetings List
  return (
    <div className="w-full space-y-6">
      <PageHeader 
        title="Reuniones y Seguimiento" 
        description="Lleva el control de tus reuniones y demuestra el avance de tus tareas a Gerencia"
        icon={Users}
        color="blue"
      />

      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative w-72">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Buscar reunión..." className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500" />
        </div>
        {profile?.role !== 'gerencia' && (
          <button 
            onClick={() => setIsCreatingMeeting(true)}
            className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-slate-800 transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" /> Nueva Reunión
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {meetings.map((meeting) => (
          <div 
            key={meeting.id}
            onClick={() => setSelectedMeeting(meeting)}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer relative overflow-hidden group flex flex-col h-full"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-blue-50 to-transparent rounded-bl-full opacity-50 group-hover:opacity-100 transition-opacity"></div>
            
            <div className="flex-1">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-slate-800 pr-6 leading-tight">{meeting.title}</h3>
                {meeting.status === 'approved' && <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />}
                {meeting.status === 'scheduled' && <Clock className="w-5 h-5 text-slate-400 shrink-0" />}
                {(!meeting.status || meeting.status === 'in_review') && <Users className="w-5 h-5 text-blue-500 shrink-0" />}
              </div>
              
              <div className="space-y-2 mb-6">
                <p className="flex items-center text-sm text-slate-600">
                  <Calendar className="w-4 h-4 mr-2 text-slate-400" /> {meeting.date}
                </p>
                <p className="flex items-center text-sm text-slate-600">
                  <Users className="w-4 h-4 mr-2 text-slate-400" /> {meeting.attendees}
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-100 mt-auto">
              <span className={`text-xs font-bold uppercase tracking-wide ${meeting.status === 'approved' ? 'text-emerald-600' : 'text-blue-600'}`}>
                {meeting.status === 'scheduled' ? 'Programada' : meeting.status === 'approved' ? 'Acta Aprobada' : 'Ver Reunión'}
              </span>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${meeting.status === 'approved' ? 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white' : 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white'}`}>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        ))}
        
        {meetings.length === 0 && (
          <div className="col-span-full py-20 text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-10 h-10 text-slate-300" />
            </div>
            <h3 className="text-xl font-bold text-slate-700 mb-2">No hay reuniones registradas</h3>
            <p className="text-slate-500 max-w-md mx-auto">
              Empieza a registrar tus reuniones con gerencia para dar seguimiento a tus tareas.
            </p>
          </div>
        )}
      </div>

      
      
      {/* Create Meeting Modal */}
      {isCreatingMeeting && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Registrar Nueva Reunión</h3>
                  <p className="text-sm text-slate-500 font-medium">Documente los acuerdos y puntos clave</p>
                </div>
              </div>
              <button onClick={() => setIsCreatingMeeting(false)} className="text-slate-400 hover:bg-slate-100 hover:text-slate-600 p-2 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Body */}
            <div className="p-6 space-y-8 overflow-y-auto bg-slate-50/50">
              
              {/* Section 1: General */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  Información General
                </h4>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Título de la Reunión</label>
                    <input 
                      type="text" 
                      value={newMeeting.title}
                      onChange={e => setNewMeeting({...newMeeting, title: e.target.value})}
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                      placeholder="Ej. Reunión Mensual del Comité de SST"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fecha</label>
                      <input 
                        type="date" 
                        value={newMeeting.date}
                        onChange={e => setNewMeeting({...newMeeting, date: e.target.value})}
                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Participantes</label>
                      <div className="bg-white border border-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto space-y-2 shadow-sm">
                        {users.map(user => (
                           <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                              <input 
                                type="checkbox"
                                checked={newMeeting.attendeeIds.includes(user.id)}
                                onChange={(e) => {
                                  const name = user.displayName || user.email;
                                  if (e.target.checked) {
                                    setNewMeeting(prev => ({
                                      ...prev, 
                                      attendeeIds: [...prev.attendeeIds, user.id],
                                      attendees: prev.attendees ? `${prev.attendees}, ${name}` : name
                                    }));
                                  } else {
                                    setNewMeeting(prev => ({
                                      ...prev, 
                                      attendeeIds: prev.attendeeIds.filter(id => id !== user.id),
                                      attendees: prev.attendees.split(", ").filter(n => n !== name).join(", ")
                                    }));
                                  }
                                }}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm text-slate-700">{user.displayName || user.email}</span>
                           </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Section 2: Details */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  Desarrollo y Acuerdos
                </h4>
                
                <div className="space-y-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-2">
                      <Target className="w-4 h-4 text-blue-600" /> Objetivo Principal
                    </label>
                    <input 
                      type="text"
                      value={newMeeting.objective}
                      onChange={e => setNewMeeting({...newMeeting, objective: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      placeholder="¿Cuál es el propósito de esta reunión?"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-2">
                        <MessageSquare className="w-4 h-4 text-amber-500" /> Puntos Discutidos
                      </label>
                      <textarea 
                        value={newMeeting.keyPoints}
                        onChange={e => setNewMeeting({...newMeeting, keyPoints: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                        placeholder="Resume los temas principales tratados..."
                        rows={4}
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-2">
                        <Gavel className="w-4 h-4 text-emerald-600" /> Decisiones Tomadas
                      </label>
                      <textarea 
                        value={newMeeting.decisions}
                        onChange={e => setNewMeeting({...newMeeting, decisions: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                        placeholder="Lista las conclusiones y acciones a tomar..."
                        rows={4}
                      />
                    </div>
                  </div>
                </div>
              </div>
              
            </div>
            
            {/* Footer */}
            <div className="p-5 bg-white border-t border-slate-100 flex justify-end gap-3 shrink-0">
                <button 
                  onClick={() => setIsCreatingMeeting(false)} 
                  className="px-5 py-2.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleCreateMeeting} 
                  className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-blue-700 shadow-sm shadow-blue-600/20 transition-all flex items-center gap-2"
                >
                  Guardar Reunión
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Modal */}
      <ImageModal
        isOpen={!!viewImageModal}
        imageUrl={viewImageModal}
        onClose={() => setViewImageModal(null)}
      />
    </div>
  );
};
