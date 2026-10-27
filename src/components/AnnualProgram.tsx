import React, { useState, useEffect } from "react";
import { Calendar as BigCalendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { es } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
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
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { PageHeader } from "./ui/PageHeader";
import { AnnualActivity, UserProfile } from "../types";
import { Loader2, Calendar,
  Plus,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
  User,
  X,
  Download,
  LayoutGrid,
  List,
  FileUp,
  Link as LinkIcon,
  Tag,
  AlignLeft,
  Bell,
  Calendar as CalendarIcon, } from "lucide-react";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { ConfirmationModal } from "./ui/ConfirmationModal";
import { exportToExcel } from "../utils/exportToExcel";
import { uploadToCloudinary } from "../utils/cloudinary";
import { notifyAllEmployers } from "../utils/notifications";
import { sendNotification } from "../utils/notificationUtils";

const locales = {
  es: es,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export const AnnualProgram: React.FC = () => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();
  const [activities, setActivities] = useState<AnnualActivity[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"calendar" | "grid" | "list">("calendar");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterResponsibleId, setFilterResponsibleId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [editingActivity, setEditingActivity] = useState<AnnualActivity | null>(
    null,
  );
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<AnnualActivity["category"]>("Otro");
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [dateStr, setDateStr] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [responsibleId, setResponsibleId] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  useEffect(() => {
    fetchData();
  }, [selectedCompany]);

  const fetchData = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      // Fetch activities
      const qActivities = query(
        collection(db, "annual_activities"),
        where("companyRuc", "==", selectedCompany.ruc),
        orderBy("month", "asc"),
      );
      const snapActivities = await getDocs(qActivities);
      setActivities(
        snapActivities.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as AnnualActivity,
        ),
      );

      // Fetch users for responsible dropdown
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
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, "annual_activities");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !title || !responsibleId) return;

    const responsibleUser = users.find((u) => u.uid === responsibleId);
    if (!responsibleUser) return;

    try {
      setUploadingEvidence(true);
      let newEvidenceUrl = editingActivity?.evidenceUrl;

      if (evidenceFile) {
        newEvidenceUrl = await uploadToCloudinary(evidenceFile);
      }

      const updateData = {
        title,
        description,
        category,
        month,
        date: dateStr,
        responsibleId,
        responsibleName: responsibleUser.displayName || responsibleUser.email,
        ...(newEvidenceUrl && { evidenceUrl: newEvidenceUrl }),
      };

      if (editingActivity) {
        // Update existing
        await updateDoc(
          doc(db, "annual_activities", editingActivity.id!),
          updateData,
        );
        setActivities(
          activities
            .map((a) =>
              a.id === editingActivity.id ? { ...a, ...updateData } : a,
            )
            .sort((a, b) => a.month - b.month),
        );
      } else {
        // Create new
        const newActivity: Omit<AnnualActivity, "id"> = {
          ...updateData,
          status: "pending",
          companyRuc: selectedCompany.ruc,
          createdAt: Timestamp.now(),
        };

        const docRef = await addDoc(
          collection(db, "annual_activities"),
          newActivity,
        );
        setActivities(
          [...activities, { id: docRef.id, ...newActivity }].sort(
            (a, b) => a.month - b.month,
          ),
        );

        // Notify employer
        await notifyAllEmployers(
          "Nueva Actividad Programada",
          `Se ha programado una nueva actividad (${title}) para el mes de ${MONTHS[month - 1]}.`,
          "/annual-program",
          selectedCompany.ruc,
        );
        // Inform user
        if (responsibleId !== profile?.uid) {
          await sendNotification(
            responsibleId,
            "Nueva Actividad Asignada",
            `Se te asignó la actividad: ${title}`,
            "/annual-program",
            selectedCompany.ruc,
          );
        }
      }

      closeModal();
    } catch (error) {
      handleFirestoreError(
        error,
        editingActivity ? OperationType.UPDATE : OperationType.CREATE,
        "annual_activities",
      );
    } finally {
      setUploadingEvidence(false);
    }
  };

  const handleEdit = (activity: AnnualActivity) => {
    setEditingActivity(activity);
    setTitle(activity.title);
    setDescription(activity.description || "");
    setCategory(activity.category || "Otro");
    setMonth(activity.month);
    setDateStr(activity.date || new Date(new Date().getFullYear(), activity.month - 1, 1).toISOString().split("T")[0]);
    setResponsibleId(activity.responsibleId);
    setEvidenceFile(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingActivity(null);
    setTitle("");
    setDescription("");
    setCategory("Otro");
    setMonth(new Date().getMonth() + 1);
    setDateStr(new Date().toISOString().split("T")[0]);
    setResponsibleId("");
    setEvidenceFile(null);
  };

  const handleDragStart = (e: React.DragEvent, activityId: string) => {
    e.dataTransfer.setData("activityId", activityId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetMonth: number) => {
    e.preventDefault();
    if (!["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "")) return;

    const activityId = e.dataTransfer.getData("activityId");
    if (!activityId) return;

    const activity = activities.find((a) => a.id === activityId);
    if (!activity || activity.month === targetMonth) return;

    try {
      await updateDoc(doc(db, "annual_activities", activityId), {
        month: targetMonth,
      });
      setActivities(
        activities
          .map((a) => (a.id === activityId ? { ...a, month: targetMonth } : a))
          .sort((a, b) => a.month - b.month),
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "annual_activities");
    }
  };

  const handleUpdateStatus = async (
    activityId: string,
    newStatus: "pending" | "in_progress" | "completed",
  ) => {
    if (!["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "")) return;
    try {
      await updateDoc(doc(db, "annual_activities", activityId), {
        status: newStatus,
      });
      setActivities(
        activities.map((a) =>
          a.id === activityId ? { ...a, status: newStatus } : a,
        ),
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "annual_activities");
    }
  };

  const handleDelete = (activityId: string) => {
    if (!["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "")) return;
    setItemToDelete(activityId);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await deleteDoc(doc(db, "annual_activities", itemToDelete));
      setActivities(activities.filter((a) => a.id !== itemToDelete));
      setItemToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "annual_activities");
    }
  };

  const handleExport = () => {
    if (!selectedCompany) return;
    const exportData = activities.map((a) => ({
      Título: a.title,
      Mes: MONTHS[a.month - 1],
      Responsable: a.responsibleName,
      Estado:
        a.status === "completed"
          ? "Completado"
          : a.status === "in_progress"
            ? "En Proceso"
            : "Pendiente",
    }));
    exportToExcel(
      exportData,
      `Programa_Anual_${(selectedCompany as any).businessName || (selectedCompany as any).name || selectedCompany.ruc}`,
    );
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
        Selecciona una empresa para ver su programa anual.
      </div>
    );
  }

  // Applied filters
  const filteredActivities = activities.filter((a) => {
    const matchSearch = a.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchResponsible = filterResponsibleId
      ? a.responsibleId === filterResponsibleId
      : true;
    const matchStatus = filterStatus ? a.status === filterStatus : true;
    const matchCategory = filterCategory ? a.category === filterCategory : true;
    return matchSearch && matchResponsible && matchStatus && matchCategory;
  });

  // Dashboard Stats
  const totalActivities = filteredActivities.length;
  const completedActivities = filteredActivities.filter(
    (a) => a.status === "completed",
  ).length;
  const pendingActivities = filteredActivities.filter(
    (a) => a.status === "pending",
  ).length;
  const inProgressActivities = filteredActivities.filter(
    (a) => a.status === "in_progress",
  ).length;
  const progressPercentage =
    totalActivities > 0
      ? Math.round((completedActivities / totalActivities) * 100)
      : 0;

  // Group activities by month
  const activitiesByMonth: Record<number, AnnualActivity[]> = {};
  for (let i = 1; i <= 12; i++) activitiesByMonth[i] = [];
  filteredActivities.forEach((a) => {
    if (activitiesByMonth[a.month]) {
      activitiesByMonth[a.month].push(a);
    }
  });

  const currentMonth = new Date().getMonth() + 1;

  const calendarEvents = filteredActivities.map((a) => {
    let start = new Date(new Date().getFullYear(), a.month - 1, 1, 10, 0);
    let end = new Date(new Date().getFullYear(), a.month - 1, 1, 12, 0);
    if (a.date) {
      const parts = a.date.split("-");
      if (parts.length === 3) {
        start = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 10, 0);
        end = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0);
      }
    }
    return {
      id: a.id,
      title: a.title,
      start,
      end,
      resource: a,
    };
  });

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Programa Anual SST"
        description="Planificación y seguimiento de actividades del año"
        icon={CalendarIcon}
        color="purple"
        actions={
          <>
            <div className="flex bg-white/20 p-1 rounded-lg backdrop-blur-sm border border-white/10 shadow-inner mr-2">
              <button
                onClick={() => setViewMode("calendar")}
                className={`p-2 rounded-md transition-colors ${viewMode === "calendar" ? "bg-white text-purple-600 shadow-sm" : "text-white/80 hover:text-white hover:bg-white/10"}`}
                title="Vista de Calendario"
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-md transition-colors ${viewMode === "list" ? "bg-white text-purple-600 shadow-sm" : "text-white/80 hover:text-white hover:bg-white/10"}`}
                title="Vista de Lista"
              >
                <List className="w-5 h-5" />
              </button>
            </div>
            <button
              onClick={handleExport}
              className="flex items-center justify-center px-4 py-2 bg-white/20 text-white border border-white/20 rounded-lg hover:bg-white/30 transition-colors shadow-sm"
            >
              <Download className="w-5 h-5 mr-2" />
              Exportar
            </button>
            {["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "") && (
              <button
                onClick={() => {
                  setEditingActivity(null);
                  setIsModalOpen(true);
                }}
                className="flex items-center justify-center px-4 py-2 bg-white text-purple-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium border border-transparent"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nueva Actividad
              </button>
            )}
          </>
        }
      />

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            placeholder="Buscar por título..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none sm:w-48"
          >
            <option value="">Todas las Categorías</option>
            <option value="Capacitación">Capacitación</option>
            <option value="Inspección">Inspección</option>
            <option value="Auditoría">Auditoría</option>
            <option value="Simulacro">Simulacro</option>
            <option value="Reunión">Reunión</option>
            <option value="Otro">Otro</option>
          </select>
          <select
            value={filterResponsibleId}
            onChange={(e) => setFilterResponsibleId(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none sm:w-48"
          >
            <option value="">Todos los responsables</option>
            {users.map((u) => (
              <option key={u.uid} value={u.uid}>
                {u.displayName || u.email}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none sm:w-48"
          >
            <option value="">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="in_progress">En Proceso</option>
            <option value="completed">Completado</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">
          Cargando programa...
        </div>
      ) : (
        <>
          {/* Progress Dashboard */}
          {activities.length > 0 && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-sm font-medium text-slate-700">
                      Progreso Anual de Implementación
                    </span>
                    <span className="text-2xl font-bold text-blue-600">
                      {progressPercentage}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 min-w-max pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-slate-100 lg:pl-8">
                  <div>
                    <p className="text-[10px] sm:text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">
                      Total
                    </p>
                    <p className="text-xl font-bold text-slate-800">
                      {totalActivities}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">
                      Completadas
                    </p>
                    <p className="text-xl font-bold text-emerald-600">
                      {completedActivities}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">
                      En Proceso
                    </p>
                    <p className="text-xl font-bold text-blue-600">
                      {inProgressActivities}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">
                      Pendientes
                    </p>
                    <p className="text-xl font-bold text-slate-600">
                      {pendingActivities}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {viewMode === "calendar" ? (
             <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 h-[600px]">
               <BigCalendar
                 localizer={localizer}
                 events={calendarEvents}
                 startAccessor="start"
                 endAccessor="end"
                 style={{ height: "100%" }}
                 messages={{
                   next: "Sig",
                   previous: "Ant",
                   today: "Hoy",
                   month: "Mes",
                   week: "Semana",
                   day: "Día",
                   agenda: "Agenda",
                   date: "Fecha",
                   time: "Hora",
                   event: "Evento",
                   noEventsInRange: "No hay actividades en este rango.",
                 }}
                 onSelectEvent={(event) => {
                   if (["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "")) {
                     handleEdit(event.resource);
                   }
                 }}
                 onSelectSlot={(slotInfo) => {
                   if (["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "")) {
                     closeModal(); // Reset form
                     setDateStr(format(slotInfo.start, "yyyy-MM-dd"));
                     setMonth(slotInfo.start.getMonth() + 1);
                     setIsModalOpen(true);
                   }
                 }}
                 selectable={["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "")}
                 eventPropGetter={(event) => {
                   let backgroundColor = "#f1f5f9"; // slate-100
                   let color = "#475569"; // slate-600
                   if (event.resource.status === "completed") {
                     backgroundColor = "#10b981"; color = "white"; // emerald-500
                   } else if (event.resource.status === "in_progress") {
                     backgroundColor = "#3b82f6"; color = "white"; // blue-500
                   } else if (event.resource.status === "pending") {
                     backgroundColor = "#4f46e5"; color = "white"; // blue-600
                   }
                   return { style: { backgroundColor, color, border: "none", borderRadius: "4px" } };
                 }}
               />
             </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {MONTHS.map((monthName, index) => {
                const monthNumber = index + 1;
                const monthActivities = activitiesByMonth[monthNumber];
                const isCurrentMonth = monthNumber === currentMonth;

                return (
                  <div
                    key={monthNumber}
                    className={`bg-white rounded-xl shadow-sm border ${isCurrentMonth ? "border-blue-300 ring-1 ring-blue-100" : "border-slate-200"} overflow-hidden flex flex-col`}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, monthNumber)}
                  >
                    <div
                      className={`px-4 py-3 border-b flex items-center justify-between ${isCurrentMonth ? "bg-blue-50 border-blue-100" : "bg-slate-50 border-slate-100"}`}
                    >
                      <h3
                        className={`font-bold ${isCurrentMonth ? "text-blue-900" : "text-slate-800"}`}
                      >
                        {monthName}
                      </h3>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${isCurrentMonth ? "bg-blue-200 text-blue-800" : "bg-slate-200 text-slate-600"}`}
                      >
                        {monthActivities.length} act.
                      </span>
                    </div>
                    <div className="p-4 flex-1 bg-slate-50/30">
                      {monthActivities.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-sm text-slate-400 italic py-4 pointer-events-none">
                          Sin actividades
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {monthActivities.map((activity) => (
                            <div
                              key={activity.id}
                              className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm cursor-pointer hover:border-blue-300 transition-colors"
                              draggable={["employer", "supervisor", "super_admin", "gerencia"].includes(
                                profile?.role || "",
                              )}
                              onDragStart={(e) =>
                                handleDragStart(e, activity.id!)
                              }
                              onClick={() => {
                                if (
                                  ["employer", "supervisor", "super_admin", "gerencia"].includes(
                                    profile?.role || "",
                                  )
                                )
                                  handleEdit(activity);
                              }}
                            >
                              <div className="flex justify-between items-start mb-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <h4 className="text-sm font-medium text-slate-900 leading-tight">
                                    {activity.title}
                                  </h4>
                                  {activity.category && (
                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded w-max">
                                      {activity.category}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  {activity.evidenceUrl && (
                                    <a
                                      href={activity.evidenceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-slate-400 hover:text-blue-500"
                                      onClick={(e) => e.stopPropagation()}
                                      title="Ver evidencia"
                                    >
                                      <LinkIcon className="w-4 h-4" />
                                    </a>
                                  )}
                                  {["employer", "supervisor", "super_admin", "gerencia"].includes(
                                    profile?.role || "",
                                  ) && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(activity.id!);
                                      }}
                                      className="text-slate-400 hover:text-red-500 shrink-0"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              {activity.description && (
                                <p className="text-xs text-slate-500 mb-2 line-clamp-2">
                                  {activity.description}
                                </p>
                              )}
                              <div className="flex items-center text-xs text-slate-500 mb-3">
                                <User className="w-3 h-3 mr-1" />
                                <span className="truncate">
                                  {activity.responsibleName}
                                </span>
                              </div>
                              <div
                                className="flex items-center justify-between"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {getStatusBadge(activity.status)}

                                {["employer", "supervisor", "super_admin", "gerencia"].includes(
                                  profile?.role || "",
                                ) && (
                                  <select
                                    value={activity.status}
                                    onChange={(e) =>
                                      handleUpdateStatus(
                                        activity.id!,
                                        e.target.value as any,
                                      )
                                    }
                                    className="text-xs border-none bg-transparent text-slate-500 hover:text-blue-600 cursor-pointer focus:ring-0"
                                  >
                                    <option value="pending">Pendiente</option>
                                    <option value="in_progress">
                                      En Proceso
                                    </option>
                                    <option value="completed">
                                      Completado
                                    </option>
                                  </select>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm">
                      <th className="p-4 font-medium">Actividad</th>
                      <th className="p-4 font-medium">Categoría</th>
                      <th className="p-4 font-medium">Mes / Fecha</th>
                      <th className="p-4 font-medium">Responsable</th>
                      <th className="p-4 font-medium">Estado</th>
                      <th className="p-4 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredActivities.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="p-8 text-center text-slate-500 italic"
                        >
                          No se encontraron actividades
                        </td>
                      </tr>
                    ) : (
                      filteredActivities.map((activity) => (
                        <tr
                          key={activity.id}
                          className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                          onClick={() => {
                            if (
                              ["employer", "supervisor", "super_admin", "gerencia"].includes(
                                profile?.role || "",
                              )
                            )
                              handleEdit(activity);
                          }}
                        >
                          <td className="p-4">
                            <p className="font-medium text-slate-900">
                              {activity.title}
                            </p>
                            {activity.description && (
                              <p className="text-xs text-slate-500 line-clamp-1">
                                {activity.description}
                              </p>
                            )}
                          </td>
                          <td className="p-4 text-sm text-slate-600">
                            {activity.category ? (
                              <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded w-max">
                                {activity.category}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">N/A</span>
                            )}
                          </td>
                          <td className="p-4 text-sm text-slate-600">
                            {MONTHS[activity.month - 1]}
                          </td>
                          <td className="p-4 text-sm text-slate-600">
                            <div className="flex items-center">
                              <User className="w-4 h-4 mr-2 text-slate-400" />
                              {activity.responsibleName}
                            </div>
                          </td>
                          <td
                            className="p-4"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {["employer", "supervisor", "super_admin", "gerencia"].includes(
                              profile?.role || "",
                            ) ? (
                              <select
                                value={activity.status}
                                onChange={(e) =>
                                  handleUpdateStatus(
                                    activity.id!,
                                    e.target.value as any,
                                  )
                                }
                                className={`text-sm rounded-lg border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none ${
                                  activity.status === "completed"
                                    ? "text-emerald-700 bg-emerald-50"
                                    : activity.status === "in_progress"
                                      ? "text-blue-700 bg-blue-50"
                                      : "text-slate-700 bg-slate-50"
                                }`}
                              >
                                <option value="pending">Pendiente</option>
                                <option value="in_progress">En Proceso</option>
                                <option value="completed">Completado</option>
                              </select>
                            ) : (
                              getStatusBadge(activity.status)
                            )}
                          </td>
                          <td className="p-4 text-right flex items-center justify-end">
                            {activity.evidenceUrl && (
                              <a
                                href={activity.evidenceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors mr-1"
                                title="Ver evidencia"
                              >
                                <LinkIcon className="w-4 h-4" />
                              </a>
                            )}
                            {["employer", "supervisor", "super_admin", "gerencia"].includes(
                              profile?.role || "",
                            ) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(activity.id!);
                                }}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-lg transition-colors"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">
                {editingActivity
                  ? "Editar Actividad"
                  : "Programar Nueva Actividad"}
              </h2>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={handleSaveActivity}
              className="p-4 space-y-4 max-h-[80vh] overflow-y-auto"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Título de la Actividad
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Ej. Capacitación de Primeros Auxilios"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Descripción (Opcional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  placeholder="Detalles sobre la actividad..."
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Categoría
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="Capacitación">Capacitación</option>
                    <option value="Inspección">Inspección</option>
                    <option value="Auditoría">Auditoría</option>
                    <option value="Simulacro">Simulacro</option>
                    <option value="Reunión">Reunión</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="block text-sm font-medium text-slate-700">
                    Fecha
                  </label>
                  <input
                    type="date"
                    required
                    value={dateStr}
                    onChange={(e) => {
                       setDateStr(e.target.value);
                       const d = new Date(e.target.value);
                       if (!isNaN(d.getTime())) {
                          setMonth(d.getUTCMonth() + 1);
                       }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Responsable
                  </label>
                  <select
                    required
                    value={responsibleId}
                    onChange={(e) => setResponsibleId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Seleccionar...</option>
                    {users.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.displayName || u.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Archivo / Evidencia (Opcional)
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-200 cursor-pointer transition-colors w-full text-sm">
                    <FileUp className="w-4 h-4 mr-2" />
                    {evidenceFile
                      ? evidenceFile.name
                      : "Subir Documento / Foto"}
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setEvidenceFile(e.target.files[0]);
                        }
                      }}
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    />
                  </label>
                </div>
                {editingActivity?.evidenceUrl && !evidenceFile && (
                  <p className="text-xs text-blue-600 mt-1 flex items-center">
                    <LinkIcon className="w-3 h-3 mr-1" />
                    Ya cuenta con evidencia adjunta.
                  </p>
                )}
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploadingEvidence}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadingEvidence
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Guardando...</>
                    : editingActivity
                      ? "Actualizar Actividad"
                      : "Guardar Actividad"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setItemToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Eliminar Actividad"
        message="¿Estás seguro de eliminar esta actividad del programa anual? Esta acción no se puede deshacer."
      />
    </div>
  );
};
