import { useLocation } from "react-router-dom";
import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import {
  CommitteeMeeting,
  CommitteeAgreement,
  UserProfile,
  AnnualActivity,
  CommitteeMember,
} from "../types";
import Select from "react-select";
import { Loader2, Users,
  Plus,
  Trash2,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  Download,
  X,
  Paperclip,
  ExternalLink,

  UsersRound, } from "lucide-react";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { ConfirmationModal } from "./ui/ConfirmationModal";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { uploadToCloudinary } from "../utils/cloudinary";
import { notifyAllEmployers, notifyAllWorkers } from "../utils/notifications";
import { sendNotification } from "../utils/notificationUtils";
import { exportToExcel } from "../utils/exportToExcel";
import { generateCommitteeActPdf } from "../utils/pdfGenerator";

import { PageHeader } from "./ui/PageHeader";

import { CommitteeAgreementsKanban } from "./CommitteeAgreementsKanban";
import { CommitteeMembersTab } from "./CommitteeMembersTab";
import { CommitteeCalendarTab } from "./CommitteeCalendarTab";
import { isMainAdmin } from "../constants/admin";
import { sstBodyFor } from "../utils/brand";

export const Committee: React.FC = () => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();
  const [meetings, setMeetings] = useState<CommitteeMeeting[]>([]);
  const [annualActivities, setAnnualActivities] = useState<AnnualActivity[]>(
    [],
  );
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [committeeMembers, setCommitteeMembers] = useState<CommitteeMember[]>([]);
  const [loading, setLoading] = useState(true);
  const routerLocation = useLocation();
  const [activeTab, setActiveTab] = useState<"members" | "meetings" | "agreements" | "calendar" | "elections">(
    routerLocation.hash === "#elections" ? "elections" : "members"
  );
  
  useEffect(() => {
    if (routerLocation.hash === "#elections") {
      setActiveTab("elections");
    }
  }, [routerLocation.hash]);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [meetingNumber, setMeetingNumber] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState<"ordinaria" | "extraordinaria">("ordinaria");
  const [agenda, setAgenda] = useState("");
  const [development, setDevelopment] = useState("");
  const [anexos, setAnexos] = useState("");
  const [attendees, setAttendees] = useState<string[]>([]);
  const [employerAttendees, setEmployerAttendees] = useState<string[]>([]);
  const [workerAttendees, setWorkerAttendees] = useState<string[]>([]);
  const [agreements, setAgreements] = useState<CommitteeAgreement[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [meetingToDelete, setMeetingToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCompany) return;

    setLoading(true);

    const qMeetings = query(
      collection(db, "committee_meetings"),
      where("companyRuc", "==", selectedCompany.ruc),
      orderBy("date", "desc"),
    );
    const unMeetings = onSnapshot(
      qMeetings,
      (snap) => {
        setMeetings(
          snap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as CommitteeMeeting,
          ),
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "committee_meetings");
      },
    );

    const qActivities = query(
      collection(db, "annual_activities"),
      where("companyRuc", "==", selectedCompany.ruc),
    );
    const unActivities = onSnapshot(qActivities, (snap) => {
      setAnnualActivities(
        snap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as AnnualActivity,
        ),
      );
    });

    const fetchUsers = async () => {
      if (
        ["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "")
      ) {
        const qUsers = query(
          collection(db, "users"),
          where("companyRuc", "==", selectedCompany.ruc),
        );
        const snapUsers = await getDocs(qUsers);
        setUsers(snapUsers.docs.map((doc) => doc.data() as UserProfile));
      }
      
      // Fetch committee members
      const qMembers = query(
        collection(db, "committee_members"),
        where("companyRuc", "==", selectedCompany.ruc)
      );
      const snapMembers = await getDocs(qMembers);
      setCommitteeMembers(snapMembers.docs.map(doc => ({ id: doc.id, ...doc.data() } as CommitteeMember)).filter(m => !["Supervisor SST", "Supervisor Suplente"].includes(m.role)));

      setLoading(false);
    };

    fetchUsers();

    return () => {
      unMeetings();
      unActivities();
    };
  }, [selectedCompany, profile]);


  const handleCreateMeetingFromCalendar = (calendarDate: string, meetingType: "ordinaria" | "extraordinaria") => {
    setActiveTab("meetings");
    setDate(calendarDate);
    setType(meetingType);
    setMeetingNumber("");
    setStartTime("");
    setEndTime("");
    setLocation("");
    setAgenda("");
    setDevelopment("");
    setAnexos("");
    setAttendees([]);
    setEmployerAttendees([]);
    setWorkerAttendees([]);
    setAgreements([]);
    setFile(null);
    setIsModalOpen(true);
  };


  const handleExportAgreements = () => {
    const exportData = allAgreements.map(a => ({
      'Tarea / Acuerdo': a.task,
      'Responsable': a.responsibleName,
      'Fecha Límite': format(new Date(a.deadline), "dd/MM/yyyy"),
      'Fecha de Reunión': format(new Date(a.meetingDate), "dd/MM/yyyy"),
      'Estado': a.status === 'pending' ? 'Pendiente' : a.status === 'in_progress' ? 'En Proceso' : 'Completado'
    }));
    exportToExcel(exportData, "Acuerdos_Comite");
  };

  const handleAddMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    setUploading(true);
    try {
      let attachmentUrl = "";
      let attachmentName = "";

      if (file) {
        attachmentUrl = await uploadToCloudinary(file);
        attachmentName = file.name;
      }

      const newMeeting: Omit<CommitteeMeeting, "id"> = {
        meetingNumber,
        date,
        startTime,
        endTime,
        location,
        type,
        agenda,
        development,
        anexos,
        attendees,
        employerAttendees,
        workerAttendees,
        agreements,
        attachmentUrl,
        attachmentName,
        companyRuc: selectedCompany.ruc,
        createdAt: Timestamp.now(),
      };

      const docRef = await addDoc(
        collection(db, "committee_meetings"),
        newMeeting,
      );
      setMeetings([{ id: docRef.id, ...newMeeting }, ...meetings]);

      await notifyAllEmployers(
        "Nueva Acta de Comité SST",
        `Se ha registrado una nueva acta de reunión (${type}) de suma importancia.`,
        "/committee",
        selectedCompany.ruc,
      );

      // Notify attendees if they are workers/supervisors
      await Promise.all(
        attendees.map((uid) =>
          sendNotification(
            uid,
            "Acta de Comité",
            "Te han etiquetado como asistente en la nueva Acta de Comité SST",
            "/committee",
            selectedCompany.ruc,
          ),
        ),
      );
      toast.success("Acta registrada exitosamente.");
      setIsModalOpen(false);
      resetForm();
   } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "committee_meetings");
      toast.error("Hubo un error al guardar el acta. Inténtalo de nuevo.");
   } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setMeetingNumber("");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setStartTime("");
    setEndTime("");
    setLocation("");
    setType("ordinaria");
    setAgenda("");
    setDevelopment("");
    setAnexos("");
    setAttendees([]);
    setEmployerAttendees([]);
    setWorkerAttendees([]);
    setAgreements([]);
    setFile(null);
  };

  const handleAddAgreementToForm = () => {
    setAgreements([
      ...agreements,
      {
        id: Date.now().toString(),
        task: "",
        responsibleId: "",
        responsibleName: "",
        deadline: format(new Date(), "yyyy-MM-dd"),
        status: "pending",
      },
    ]);
  };

  const updateAgreementInForm = (id: string, field: string, value: string) => {
    setAgreements(
      agreements.map((a) => {
        if (a.id === id) {
          const updated = { ...a, [field]: value };
          if (field === "responsibleId") {
            const user = users.find((u) => u.uid === value);
            updated.responsibleName = user
              ? user.displayName || user.email
              : "";
          }
          return updated;
        }
        return a;
      }),
    );
  };

  const removeAgreementFromForm = (id: string) => {
    setAgreements(agreements.filter((a) => a.id !== id));
  };

  const handleUpdateAgreementStatus = async (
    meetingId: string,
    agreementId: string,
    newStatus: "pending" | "in_progress" | "completed",
  ) => {
    if (!["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "")) return;
    try {
      const meeting = meetings.find((m) => m.id === meetingId);
      if (!meeting) return;

      const updatedAgreements = meeting.agreements.map((a) =>
        a.id === agreementId ? { ...a, status: newStatus } : a,
      );

      await updateDoc(doc(db, "committee_meetings", meetingId), {
        agreements: updatedAgreements,
      });

      setMeetings(
        meetings.map((m) =>
          m.id === meetingId ? { ...m, agreements: updatedAgreements } : m,
        ),
      );
   } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "committee_meetings");
    }
  };

  const generatePDF = (meeting: CommitteeMeeting) => {
    const isLegacy = !meeting.employerAttendees && !meeting.workerAttendees && meeting.attendees?.length > 0;
    
    if (!isLegacy) {
      if (!meeting.employerAttendees || meeting.employerAttendees.length === 0) {
        toast.error("Debe haber al menos un representante del empleador seleccionado para generar el PDF.");
        return;
      }
      if (!meeting.workerAttendees || meeting.workerAttendees.length === 0) {
        toast.error("Debe haber al menos un representante de los trabajadores seleccionado para generar el PDF.");
        return;
      }
    }
    
    generateCommitteeActPdf(meeting, users, committeeMembers, selectedCompany?.businessName || "Empresa Sin Nombre");
  };

  const handleDeleteMeeting = (meetingId: string) => {
    // Immediate feedback to see if the function is even called
    console.log("Delete button clicked for ID:", meetingId);

    const isAdminEmail = isMainAdmin(profile?.email);
    const isAuthorized =
      ["employer", "super_admin", "gerencia"].includes(profile?.role || "") || isAdminEmail;

    if (!isAuthorized) {
      toast.error(
        "Error: No tienes permisos suficientes para eliminar (Rol detectado: " +
          (profile?.role || "ninguno") +
          ")",
      );
      return;
    }

    setMeetingToDelete(meetingId);
  };

  const confirmDeleteMeeting = async () => {
    if (!meetingToDelete) return;

    try {
      await deleteDoc(doc(db, "committee_meetings", meetingToDelete));
      toast.success("Acta eliminada exitosamente.");
      setMeetings((prev) => prev.filter((m) => m.id !== meetingToDelete));
      setMeetingToDelete(null);
   } catch (error) {
      console.error("Error al eliminar:", error);
      toast.error("Error al eliminar de la base de datos. Revisa la consola.");
      handleFirestoreError(error, OperationType.DELETE, "committee_meetings");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800">
            <CheckCircle className="w-3 h-3 mr-1" /> Completado
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-sky-100 text-blue-800">
            <Clock className="w-3 h-3 mr-1" /> En Proceso
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-800">
            <AlertCircle className="w-3 h-3 mr-1" /> Pendiente
          </span>
        );
    }
  };

  if (!selectedCompany) {
    return (
      <div className="p-8 text-center text-slate-500">
        Selecciona una empresa para ver el Comité SST.
      </div>
    );
  }

  // Flatten agreements for the agreements tab
  const allAgreements = meetings
    .flatMap((m) =>
      m.agreements.map((a) => ({ ...a, meetingId: m.id, meetingDate: m.date })),
    )
    .sort(
      (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
    );

  // CC Laboratorios y Poder Fénix tienen Supervisor de SST (sin actas ni acuerdos de comité)
  if (sstBodyFor(selectedCompany) === "supervisor") {
    return (
      <div className="w-full space-y-6">
        <PageHeader
          title="Supervisor de SST"
          description="Quién vigila la seguridad y salud en el trabajo de la empresa"
          icon={UsersRound}
          color="indigo"
        />
        <CommitteeMembersTab mode="supervisor" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Delete Meeting Modal */}
      <ConfirmationModal
        isOpen={!!meetingToDelete}
        onClose={() => setMeetingToDelete(null)}
        onConfirm={confirmDeleteMeeting}
        title="Eliminar Acta"
        message="¿Estás seguro de que deseas eliminar esta acta de reunión permanentemente? Esta acción no se puede deshacer."
      />

      <PageHeader
        title="Comité de SST"
        description="Miembros, reuniones y seguimiento de acuerdos"
        icon={UsersRound}
        color="indigo"
        actions={
          (["employer", "super_admin", "gerencia"].includes(profile?.role || "") ||
          isMainAdmin(profile?.email)) ? (
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center px-4 py-2 bg-white text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors shadow-sm font-medium border border-transparent"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nueva Reunión
            </button>
          ) : null
        }
      />

      <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl w-full max-w-full overflow-x-auto whitespace-nowrap hide-scrollbar">
        <button
          onClick={() => setActiveTab("members")}
          className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "members"
              ? "bg-white text-indigo-600 shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
          }`}
        >
          <Users className="w-4 h-4 mr-2" />
          Directorio de Miembros
        </button>
        <button
          onClick={() => setActiveTab("calendar")}
          className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "calendar"
              ? "bg-white text-indigo-600 shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
          }`}
        >
          <Calendar className="w-4 h-4 mr-2" />
          Cronograma Anual
        </button>
        <button
          onClick={() => setActiveTab("meetings")}
          className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "meetings"
              ? "bg-white text-indigo-600 shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
          }`}
        >
          <FileText className="w-4 h-4 mr-2" />
          Actas de Reunión
        </button>
        <button
          onClick={() => setActiveTab("agreements")}
          className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "agreements"
              ? "bg-white text-indigo-600 shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
          }`}
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          Tablero de Acuerdos
        </button>
        
  </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">
          Cargando datos...
        </div>
      ) : activeTab === "members" ? (
        <CommitteeMembersTab mode="committee" />
      ) : activeTab === "calendar" ? (
        <CommitteeCalendarTab onCreateMeeting={handleCreateMeetingFromCalendar} />
      
      ) : activeTab === "meetings" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {meetings.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-white rounded-xl border border-slate-200 text-slate-500">
              No hay reuniones registradas.
            </div>
          ) : (
            meetings.map((meeting) => (
              <div
                key={meeting.id}
                className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col"
              >
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-slate-800">
                      {format(new Date(meeting.date), "dd MMM yyyy", {
                        locale: es,
                      })}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${meeting.type === "ordinaria" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}
                  >
                    {meeting.type === "ordinaria"
                      ? "Ordinaria"
                      : "Extraordinaria"}
                  </span>
                </div>
                <div className="p-4 flex-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                    Asistentes ({meeting.attendees.length})
                  </p>
                  <div className="flex flex-wrap gap-1 mb-4">
                    {meeting.attendees.map((id) => {
                      const member = committeeMembers.find((m) => m.id === id);
                      // Fallback for old records using user.uid
                      const u = !member ? users.find((user) => user.uid === id) : null;
                      return member ? (
                        <span
                          key={id}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700"
                        >
                          {member.name}
                        </span>
                      ) : u ? (
                        <span
                          key={id}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700"
                        >
                          {u.displayName || u.email}
                        </span>
                      ) : null;
                    })}
                  </div>

                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                    Acuerdos ({meeting.agreements.length})
                  </p>
                  <div className="space-y-2">
                    {meeting.agreements.slice(0, 3).map((a) => (
                      <div
                        key={a.id}
                        className="text-sm flex items-start gap-2"
                      >
                        <div className="mt-0.5">{getStatusBadge(a.status)}</div>
                        <span className="text-slate-700 line-clamp-2">
                          {a.task}
                        </span>
                      </div>
                    ))}
                    {meeting.agreements.length > 3 && (
                      <p className="text-xs text-slate-400 italic">
                        + {meeting.agreements.length - 3} acuerdos más
                      </p>
                    )}
                  </div>
                </div>
                <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => generatePDF(meeting)}
                      className="text-sm text-blue-600 font-medium hover:text-blue-700 flex items-center"
                    >
                      <Download className="w-4 h-4 mr-1" /> PDF
                    </button>
                    {meeting.attachmentUrl && (
                      <a
                        href={meeting.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-slate-600 font-medium hover:text-blue-600 flex items-center"
                        title={meeting.attachmentName}
                      >
                        <ExternalLink className="w-4 h-4 mr-1" /> Adjunto
                      </a>
                    )}
                  </div>
                  {(["employer", "super_admin", "gerencia"].includes(profile?.role || "") ||
                    isMainAdmin(profile?.email)) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteMeeting(meeting.id!);
                      }}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                      title="Eliminar acta"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        
        
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={handleExportAgreements}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm"
            >
              <Download className="w-4 h-4 mr-2" />
              Exportar Acuerdos (Excel)
            </button>
          </div>
          <CommitteeAgreementsKanban 
            agreements={allAgreements} 
            onUpdateStatus={(meetingId, agreementId, newStatus) => handleUpdateAgreementStatus(meetingId, agreementId, newStatus as any)}
            isAdmin={["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "")}
          />
        </div>

  
      )}

      {/* Add Meeting Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
              <h2 className="text-lg font-bold text-slate-800">
                Registrar Acta de Reunión
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={handleAddMeeting}
              className="p-4 overflow-y-auto flex-1 space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Acta N°
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. 001-2026"
                    value={meetingNumber}
                    onChange={(e) => setMeetingNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Tipo de Reunión
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="ordinaria">Ordinaria (Mensual)</option>
                    <option value="extraordinaria">Extraordinaria</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Hora de Inicio
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Hora de Término
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Lugar
                  </label>
                  <input
                    type="text"
                    placeholder="Sala de reuniones o Link"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

                            <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Asistentes - Representantes del Empleador (Comité)
                  </label>
                  <Select
                    isMulti
                    options={committeeMembers.filter(m => m.representation === "employer").map((m) => ({
                      value: m.id!,
                      label: `${m.name} - ${m.role}`,
                    }))}
                    value={committeeMembers
                      .filter((m) => employerAttendees.includes(m.id!))
                      .map((m) => ({
                        value: m.id!,
                        label: `${m.name} - ${m.role}`,
                      }))}
                    onChange={(selected) => {
                      const vals = selected ? selected.map((s) => s.value) : [];
                      setEmployerAttendees(vals);
                      setAttendees([...vals, ...workerAttendees]);
                    }}
                    placeholder="Seleccionar empleadores del comité..."
                    className="react-select-container"
                    classNamePrefix="react-select"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Asistentes - Representantes de los Trabajadores (Comité)
                  </label>
                  <Select
                    isMulti
                    options={committeeMembers.filter(m => m.representation === "worker").map((m) => ({
                      value: m.id!,
                      label: `${m.name} - ${m.role}`,
                    }))}
                    value={committeeMembers
                      .filter((m) => workerAttendees.includes(m.id!))
                      .map((m) => ({
                        value: m.id!,
                        label: `${m.name} - ${m.role}`,
                      }))}
                    onChange={(selected) => {
                      const vals = selected ? selected.map((s) => s.value) : [];
                      setWorkerAttendees(vals);
                      setAttendees([...employerAttendees, ...vals]);
                    }}
                    placeholder="Seleccionar trabajadores del comité..."
                    className="react-select-container"
                    classNamePrefix="react-select"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Agenda de la Reunión
                </label>
                <textarea
                  rows={3}
                  placeholder="Puntos a tratar en la reunión..."
                  value={agenda}
                  onChange={(e) => setAgenda(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                ></textarea>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Desarrollo de la Reunión
                </label>
                <textarea
                  rows={4}
                  placeholder="Resumen de lo conversado, revisión de acuerdos anteriores, reportes, etc."
                  value={development}
                  onChange={(e) => setDevelopment(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                ></textarea>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Anexos
                </label>
                <textarea
                  rows={2}
                  placeholder="Lista de anexos (opcional)..."
                  value={anexos}
                  onChange={(e) => setAnexos(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none mb-4"
                ></textarea>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Acuerdos Tomados
                  </label>
                  <button
                    type="button"
                    onClick={handleAddAgreementToForm}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center"
                  >
                    <Plus className="w-3 h-3 mr-1" /> Añadir Acuerdo
                  </button>
                </div>
                <div className="space-y-3">
                  {agreements.length === 0 ? (
                    <p className="text-sm text-slate-500 italic text-center py-4 bg-slate-50 rounded-lg border border-slate-200 border-dashed">
                      No se han añadido acuerdos.
                    </p>
                  ) : (
                    agreements.map((agreement, index) => (
                      <div
                        key={agreement.id}
                        className="flex gap-2 items-start bg-slate-50 p-3 rounded-lg border border-slate-200"
                      >
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            required
                            placeholder="Descripción de la tarea o acuerdo"
                            value={agreement.task}
                            onChange={(e) =>
                              updateAgreementInForm(
                                agreement.id,
                                "task",
                                e.target.value,
                              )
                            }
                            className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                          <div className="flex gap-2">
                            <select
                              required
                              value={agreement.responsibleId}
                              onChange={(e) =>
                                updateAgreementInForm(
                                  agreement.id,
                                  "responsibleId",
                                  e.target.value,
                                )
                              }
                              className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                              <option value="">Responsable...</option>
                              {users.map((u) => (
                                <option key={u.uid} value={u.uid}>
                                  {u.displayName || u.email}
                                </option>
                              ))}
                            </select>
                            <input
                              type="date"
                              required
                              value={agreement.deadline}
                              onChange={(e) =>
                                updateAgreementInForm(
                                  agreement.id,
                                  "deadline",
                                  e.target.value,
                                )
                              }
                              className="w-36 px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAgreementFromForm(agreement.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-md hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Documento Adjunto (Opcional)
                </label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-lg hover:border-blue-500 transition-colors bg-slate-50">
                  <div className="space-y-1 text-center">
                    <Paperclip className="mx-auto h-12 w-12 text-slate-400" />
                    <div className="flex text-sm text-slate-600 justify-center">
                      <label
                        htmlFor="file-upload"
                        className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500 px-2 py-1"
                      >
                        <span>Seleccionar archivo</span>
                        <input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          className="sr-only"
                          onChange={(e) =>
                            setFile(e.target.files ? e.target.files[0] : null)
                          }
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        />
                      </label>
                    </div>
                    <p className="text-xs text-slate-500">
                      PDF, Word o Imágenes hasta 10MB
                    </p>
                    {file && (
                      <p className="text-sm font-medium text-blue-600 mt-2 bg-blue-50 py-1 px-2 rounded-md inline-block">
                        {file.name}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={uploading}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 flex items-center"
                >
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Guardando...
                    </>
                  ) : (
                    "Guardar Acta"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
