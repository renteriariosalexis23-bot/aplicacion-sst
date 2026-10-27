import React, { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
  where,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "./ui/PageHeader";
import { useReports } from "../hooks/useReports";
import { useCompany } from "../CompanyContext";
import {
  Report,
  ReportType,
  ReportStatus,
  Inspection,
  Training,
  SSTDocument,
  UserProfile,
  TrainingCompletion,
} from "../types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, AlertTriangle,
  Plus,
  CheckCircle,
  Clock,
  Paperclip,
  X,
  FileText,
  MessageSquare,
  Send,
  Filter,
  Search,
  Calendar,
  Trash2,
  Mic,
  Square,
  Download,
  Sparkles,
  Edit3,
  FileSpreadsheet,
  User,
  ClipboardCheck,
  BookOpen,
  FileCheck, } from "lucide-react";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { sendNotification } from "../utils/notificationUtils";
import { notifyAllEmployers, notifyUser } from "../utils/notifications";
import {
  generateReportPDF,
  generateInspectionPDF,
  generateTrainingCertificatePDF,
} from "../utils/pdfGenerator";
import { uploadToCloudinary } from "../utils/cloudinary";
import { exportToExcel } from "../utils/exportToExcel";
import { getBase64ImageFromURL } from "../utils/imageUtils";
import { getDocs, Timestamp } from "firebase/firestore";
import { InvestigationWizard } from "./InvestigationWizard";
import { MandatoryRegisterModal } from "./MandatoryRegisterModal";
import { ConfirmationModal } from "./ui/ConfirmationModal";
import { ImageModal } from "./ui/ImageModal";

type AnalyticsTab =
  "operacion" | "inspecciones" | "trainings" | "incidents" | "documents";

import { useQueryClient } from "@tanstack/react-query";
import { isMainAdmin } from "../constants/admin";

export const Reports: React.FC = () => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const targetId = searchParams.get("id");
  const { selectedCompany } = useCompany();

  const {
    data: reportsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: reportsLoading,
  } = useReports(
    ["employer", "super_admin", "gerencia"].includes(profile?.role || "")
      ? selectedCompany?.ruc
      : profile?.companyRuc,
    profile?.uid,
    profile?.role,
  );
  const reports = reportsData ? reportsData.pages.flatMap((p) => p.docs) : [];
  const loading = reportsLoading;
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("operacion");

  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Analytics/Filters State
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filterWorker, setFilterWorker] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  const [isCreating, setIsCreating] = useState(false);
  const [type, setType] = useState<ReportType>("incident");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  // Advanced Filters State (Incident specific)
  const [filterType, setFilterType] = useState<ReportType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<ReportStatus | "all">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState(targetId || "");

  // Comments State
  const [activeCommentReport, setActiveCommentReport] = useState<string | null>(
    null,
  );
  const [commentText, setCommentText] = useState("");
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);
  const [activeInvestigationReport, setActiveInvestigationReport] =
    useState<Report | null>(null);
  const [activeLegalRegisterReport, setActiveLegalRegisterReport] =
    useState<Report | null>(null);
  const [activeTabs, setActiveTabs] = useState<
    Record<string, "details" | "investigation">
  >({});
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!profile) return;
    if (activeTab === "operacion") {
      // Handled by the first useEffect
      return;
    }

    setLoadingAnalytics(true);
    const ruc = selectedCompany?.ruc || profile.companyRuc;
    if (!ruc) {
      setLoadingAnalytics(false);
      return;
    }

    let unsubs: (() => void)[] = [];

    // Fetch users for filtering if not already fetched
    if (users.length === 0) {
      const uq = query(collection(db, "users"), where("companyRuc", "==", ruc));
      const unUsers = onSnapshot(uq, (usersSnap) => {
        setUsers(
          usersSnap.docs.map(
            (doc) => ({ uid: doc.id, ...doc.data() }) as UserProfile,
          ),
        );
      });
      unsubs.push(unUsers);
    }

    let collectionName = "";
    if (activeTab === "inspecciones") collectionName = "inspections";
    else if (activeTab === "trainings") collectionName = "trainings";
    else if (activeTab === "documents") collectionName = "documents";

    if (collectionName) {
      let q;
      if (["employer", "super_admin", "supervisor", "gerencia"].includes(profile.role)) {
        q = query(
          collection(db, collectionName),
          where("companyRuc", "==", ruc),
          orderBy("createdAt", "desc"),
        );
      } else {
        // Workers have specific permission boundaries
        if (activeTab === "inspecciones") {
          q = query(
            collection(db, collectionName),
            where("workerId", "==", profile.uid),
            orderBy("createdAt", "desc"),
          );
        } else {
          // For trainings/documents, let's keep the company filter and rely on
          // the rules or adjust if needed. If it fails, then we need to filter client side
          // after listing or update the rules.
          q = query(
            collection(db, collectionName),
            where("companyRuc", "==", ruc),
            orderBy("createdAt", "desc"),
          );
        }
      }

      const unRecords = onSnapshot(
        q,
        (snapshot) => {
          const data = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as object),
          }));
          setRecords(data);
          setLoadingAnalytics(false);
        },
        (error) => {
          console.error("Error fetching analytics data:", error);
          setLoadingAnalytics(false);
        },
      );
      unsubs.push(unRecords);
    } else {
      setLoadingAnalytics(false);
    }

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [activeTab, profile, selectedCompany]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        const audioFile = new File(
          [audioBlob],
          `nota_de_voz_${new Date().getTime()}.webm`,
          { type: "audio/webm" },
        );
        setAttachments((prev) => [...prev, audioFile]);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      toast.error(
        "No se pudo acceder al micrófono. Por favor, verifica los permisos.",
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setUploading(true);

    try {
      let uploadedAttachments: { url: string; name: string; type: string }[] =
        [];

      if (attachments.length > 0) {
        for (const file of attachments) {
          const url = await uploadToCloudinary(file);
          uploadedAttachments.push({
            url,
            name: file.name,
            type: file.type.startsWith("image/")
              ? "image"
              : file.type.startsWith("video/")
                ? "video"
                : file.type.startsWith("audio/")
                  ? "audio"
                  : "document",
          });
        }
      }

      const ruc = ["employer", "super_admin", "gerencia"].includes(profile.role || "")
        ? selectedCompany?.ruc || ""
        : profile.companyRuc || "";

      const reportData: any = {
        type,
        description,
        location,
        date,
        reportedBy: profile.uid,
        reportedByName: profile.displayName || profile.email,
        companyRuc: ruc,
        status: "pending",
        createdAt: serverTimestamp(),
      };

      if (uploadedAttachments.length > 0) {
        reportData.attachmentUrls = uploadedAttachments;
      }

      await addDoc(collection(db, "reports"), reportData);

      // Notify employers
      await notifyAllEmployers(
        "Nuevo Reporte SST",
        `${profile.displayName} ha enviado un nuevo reporte de tipo: ${getTypeLabel(type)}`,
        "/reports",
        ruc,
      );

      toast.success("Reporte enviado exitosamente.");
      setType("incident");
      setDescription("");
      setLocation("");
      setDate("");
      setAttachments([]);
      setIsCreating(false);
    } catch (error) {
      console.error("Error submitting report:", error);
      toast.error("Error al enviar el reporte.");
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateStatus = async (
    reportId: string,
    newStatus: ReportStatus,
    reportedBy: string,
  ) => {
    if (profile?.role !== "employer" && profile?.role !== "super_admin" && profile?.role !== "gerencia") return;
    try {
      await updateDoc(doc(db, "reports", reportId), {
        status: newStatus,
      });

      if (newStatus === "reviewed") {
        toast.success("Reporte marcado como revisado.");

        await notifyUser(
          reportedBy,
          "Reporte Revisado",
          "Tu reporte ha sido marcado como revisado por un administrador.",
          "/reports",
        );
      }
    } catch (error) {
      console.error("Error updating report status:", error);
    }
  };

  const handleAddComment = async (
    reportId: string,
    currentComments: any[] = [],
  ) => {
    if (!profile || !commentText.trim()) return;

    const newComment = {
      id: Date.now().toString(),
      text: commentText.trim(),
      authorId: profile.uid,
      authorName: profile.displayName || profile.email,
      createdAt: new Date(),
    };

    try {
      await updateDoc(doc(db, "reports", reportId), {
        comments: [...currentComments, newComment],
      });
      setCommentText("");
    } catch (error) {
      console.error("Error adding comment:", error);
    }
  };

  const getTypeLabel = (type: ReportType) => {
    switch (type) {
      case "accident":
        return "Accidente";
      case "incident":
        return "Incidente";
      case "unsafe_act":
        return "Acto Inseguro";
      case "unsafe_condition":
        return "Condición Insegura";
      default:
        return "Reporte";
    }
  };

  const getTypeColor = (type: ReportType) => {
    switch (type) {
      case "accident":
        return "bg-red-100 text-red-800 border-red-200";
      case "incident":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "unsafe_act":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "unsafe_condition":
        return "bg-sky-100 text-blue-800 border-blue-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const filteredReports = reports.filter((report) => {
    // Filter by type
    if (filterType !== "all" && report.type !== filterType) return false;

    // Filter by status
    if (filterStatus !== "all" && report.status !== filterStatus) return false;

    // Filter by date range
    if (filterStartDate) {
      const start = new Date(filterStartDate);
      const reportDate = report.createdAt?.toDate
        ? report.createdAt.toDate()
        : new Date();
      if (reportDate < start) return false;
    }

    if (filterEndDate) {
      const end = new Date(filterEndDate);
      end.setHours(23, 59, 59, 999);
      const reportDate = report.createdAt?.toDate
        ? report.createdAt.toDate()
        : new Date();
      if (reportDate > end) return false;
    }

    // Filter by search term (description or location)
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        report.description.toLowerCase().includes(search) ||
        report.location.toLowerCase().includes(search) ||
        report.reportedByName?.toLowerCase().includes(search) ||
        report.id === searchTerm
      );
    }

    return true;
  });

  const handleDownloadPDF = async (report: Report) => {
    setGeneratingPdfId(report.id!);
    try {
      await generateReportPDF(report);
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setGeneratingPdfId(null);
    }
  };

  const handleDeleteReport = (reportId: string) => {
    setReportToDelete(reportId);
  };

  const confirmDeleteReport = async () => {
    if (!reportToDelete) return;
    try {
      await deleteDoc(doc(db, "reports", reportToDelete));
      queryClient.setQueryData(["reports", (profile?.role === "employer" || profile?.role === "super_admin" || profile?.role === "gerencia") ? selectedCompany?.ruc : profile?.companyRuc, profile?.uid, profile?.role], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            docs: page.docs.filter((d: any) => d.id !== reportToDelete)
          }))
        };
      });
      queryClient.invalidateQueries({ queryKey: ["reports"] });

      try {
        // Cascade delete corrective actions matching this sourceId
        const q = query(
          collection(db, "corrective_actions"),
          where("sourceId", "==", reportToDelete),
        );
        const snapshot = await getDocs(q);
        snapshot.forEach(async (d) => {
          await deleteDoc(doc(db, "corrective_actions", d.id));
        });
      } catch (e) {
        console.warn(
          "No se pudieron eliminar acciones correctivas vinculadas (ignorando):",
          e,
        );
      }

      setReportToDelete(null);
      toast.success("Reporte eliminado exitosamente.");
    } catch (error) {
      console.error("Error al eliminar reporte:", error);
      toast.error("Error al eliminar el reporte.");
    }
  };

  const isImage = (filename?: string) => {
    if (!filename) return false;
    return /\.(jpg|jpeg|png|gif|webp|jfif|svg|bmp)$/i.test(filename);
  };

  const getFilteredAnalyticsRecords = () => {
    return records.filter((record) => {
      // 1. Worker filter
      if (filterWorker) {
        if (activeTab === "inspecciones") {
          if (record.workerId !== filterWorker) return false;
        } else if (activeTab === "trainings") {
          const completions = record.completions || [];
          const presential = record.presentialSignatures || {};
          if (
            !completions.some((c: any) => c.workerId === filterWorker) &&
            !presential[filterWorker]
          ) {
            return false;
          }
        } else if (activeTab === "documents") {
          const signatures = record.signatures || [];
          if (!signatures.some((s: any) => s.userId === filterWorker))
            return false;
        }
      }

      // 2. Date filters
      const recordDate = record.createdAt?.toDate
        ? record.createdAt.toDate()
        : null;
      if (recordDate) {
        if (filterStartDate) {
          const start = new Date(filterStartDate);
          start.setHours(0, 0, 0, 0);
          if (recordDate < start) return false;
        }
        if (filterEndDate) {
          const end = new Date(filterEndDate);
          end.setHours(23, 59, 59, 999);
          if (recordDate > end) return false;
        }
      }
      return true;
    });
  };

  const handleExportExcel = () => {
    let dataToExport: any[] = [];
    let filename = "Reportes_SST";

    if (activeTab === "operacion") {
      dataToExport = filteredReports.map((report) => ({
        ID: report.id,
        Tipo: getTypeLabel(report.type),
        Estado: report.status === "reviewed" ? "Revisado" : "Pendiente",
        "Fecha del Evento": report.date,
        Lugar: report.location,
        Descripción: report.description,
        "Reportado Por": report.reportedByName || "Desconocido",
        "Fecha de Creación": report.createdAt?.toDate
          ? format(report.createdAt.toDate(), "dd/MM/yyyy HH:mm")
          : "",
        Investigado: report.investigation ? "Sí" : "No",
        "Registro Legal Generado": report.legalRegister ? "Sí" : "No",
      }));
      filename = "Alertas_SST";
    } else if (activeTab === "inspecciones") {
      dataToExport = getFilteredAnalyticsRecords().map((i: any) => ({
        ID: i.id,
        Plantilla: i.templateTitle,
        Trabajador: i.workerName,
        DNI: i.workerDni || "",
        Puntuación: `${i.score || 0}%`,
        Fecha: i.createdAt?.toDate
          ? format(i.createdAt.toDate(), "dd/MM/yyyy HH:mm")
          : "",
      }));
      filename = "Inspecciones_SST";
    } else if (activeTab === "trainings") {
      getFilteredAnalyticsRecords().forEach((t: any) => {
        const completions = t.completions || [];
        completions.forEach((c: any) => {
          dataToExport.push({
            Fecha: t.date,
            Tema: t.topic,
            Tipo:
              t.type === "safety"
                ? "Seguridad"
                : t.type === "health"
                  ? "Salud"
                  : t.type === "emergency"
                    ? "Emergencia"
                    : "Otro",
            Trabajador: c.workerName,
            DNI: c.workerDni || "",
            Puntuación: `${c.score}%`,
            Aprobado: c.passed ? "Sí" : "No",
          });
        });
        const presentials = t.presentialSignatures || {};
        Object.keys(presentials).forEach((uid) => {
          const signature = presentials[uid];
          dataToExport.push({
            Fecha: t.date,
            Tema: t.topic,
            Tipo:
              t.type === "safety"
                ? "Seguridad"
                : t.type === "health"
                  ? "Salud"
                  : t.type === "emergency"
                    ? "Emergencia"
                    : "Otro",
            Trabajador: signature.workerName || "Desconocido",
            DNI: signature.workerDni || "",
            Puntuación: "Presencial",
            Aprobado: "Sí",
          });
        });
      });
      filename = "Capacitaciones_SST";
    } else if (activeTab === "documents") {
      getFilteredAnalyticsRecords().forEach((d: any) => {
        const signatures = d.signatures || [];
        signatures.forEach((s: any) => {
          dataToExport.push({
            Documento: d.title,
            Categoría: d.category,
            Trabajador: s.userName || "Desconocido",
            DNI: s.userDni || "",
            "Fecha de Firma": s.signedAt?.toDate
              ? format(s.signedAt.toDate(), "dd/MM/yyyy HH:mm")
              : s.timestamp?.toDate
                ? format(s.timestamp.toDate(), "dd/MM/yyyy HH:mm")
                : "-",
          });
        });
      });
      filename = "Documentos_Firmados_SST";
    }

    exportToExcel(dataToExport, filename);
  };

  return (
    <div className="w-full">
      <PageHeader
        title="Gestión de Incidentes"
        description="Reporte y seguimiento de eventos SST"
        icon={AlertTriangle}
        color="rose"
        actions={
          <>
            {["employer", "super_admin", "gerencia"].includes(profile?.role || "") && (
              <button
                onClick={handleExportExcel}
                className="flex items-center px-4 py-2 bg-white/15 text-white rounded-lg hover:bg-white/25 transition-colors shadow-sm border border-white/30"
                title="Exportar a Excel"
              >
                <FileSpreadsheet className="w-5 h-5 mr-2" />
                <span className="hidden sm:inline">Exportar Excel</span>
              </button>
            )}
            {activeTab === "operacion" && (
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center px-4 py-2 rounded-lg border transition-colors shadow-sm ${
                  showFilters ||
                  filterType !== "all" ||
                  filterStatus !== "all" ||
                  filterStartDate ||
                  filterEndDate ||
                  searchTerm
                    ? "bg-white text-rose-700 border-white"
                    : "bg-white/20 text-white border-white/20 hover:bg-white/30"
                }`}
              >
                <Filter className="w-5 h-5 mr-2" />
                Filtros
                {(filterType !== "all" ||
                  filterStatus !== "all" ||
                  filterStartDate ||
                  filterEndDate ||
                  searchTerm) && (
                  <span className="ml-2 w-2 h-2 bg-white rounded-full"></span>
                )}
              </button>
            )}
            {profile?.role === "worker" &&
              !isCreating &&
              activeTab === "operacion" && (
                <button
                  onClick={() => setIsCreating(true)}
                  className="flex items-center px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors shadow-sm border border-white/20"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Nuevo Reporte
                </button>
              )}
          </>
        }
      />

      {["employer", "super_admin", "gerencia"].includes(profile?.role || "") && (
        <div className="flex border-b border-slate-200 overflow-x-auto mb-6 bg-white rounded-t-xl">
          <button
            onClick={() => setActiveTab("operacion")}
            className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === "operacion"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Operaciones
            </div>
          </button>
          <button
            onClick={() => setActiveTab("inspecciones")}
            className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === "inspecciones"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center">
              <ClipboardCheck className="w-4 h-4 mr-2" />
              Inspecciones
            </div>
          </button>
          <button
            onClick={() => setActiveTab("trainings")}
            className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === "trainings"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center">
              <BookOpen className="w-4 h-4 mr-2" />
              Capacitaciones
            </div>
          </button>
          <button
            onClick={() => setActiveTab("documents")}
            className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === "documents"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center">
              <FileCheck className="w-4 h-4 mr-2" />
              Documentos Firmados
            </div>
          </button>
        </div>
      )}

      {activeTab === "operacion" ? (
        <>
          {/* Delete Report Modal */}
          <ConfirmationModal
            isOpen={!!reportToDelete}
            onClose={() => setReportToDelete(null)}
            onConfirm={confirmDeleteReport}
            title="Eliminar Reporte"
            message="¿Estás seguro de que deseas eliminar este reporte permanentemente? Esta acción no se puede deshacer."
          />

          {showFilters && (
            <div className="bg-white rounded-xl shadow-sm p-6 mb-8 border border-slate-200 animate-in fade-in slide-in-from-top-4 duration-200">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Buscar
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Descripción, lugar..."
                      className="w-full pl-9 pr-4 py-2 rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm border"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Tipo de Evento
                  </label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as any)}
                    className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2 border"
                  >
                    <option value="all">Todos los tipos</option>
                    <option value="incident">Incidente</option>
                    <option value="accident">Accidente</option>
                    <option value="unsafe_act">Acto Inseguro</option>
                    <option value="unsafe_condition">Condición Insegura</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Estado
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as any)}
                    className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2 border"
                  >
                    <option value="all">Todos los estados</option>
                    <option value="pending">Pendiente</option>
                    <option value="reviewed">Revisado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Rango de Fechas
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={filterStartDate}
                      onChange={(e) => setFilterStartDate(e.target.value)}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs p-2 border"
                    />
                    <span className="text-slate-400">-</span>
                    <input
                      type="date"
                      value={filterEndDate}
                      onChange={(e) => setFilterEndDate(e.target.value)}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs p-2 border"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => {
                    setFilterType("all");
                    setFilterStatus("all");
                    setFilterStartDate("");
                    setFilterEndDate("");
                    setSearchTerm("");
                  }}
                  className="text-sm text-slate-500 hover:text-blue-600 font-medium flex items-center"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Limpiar Filtros
                </button>
              </div>
            </div>
          )}

          {isCreating && profile?.role === "worker" && (
            <div className="bg-white rounded-xl shadow-sm p-6 mb-8 border border-slate-200">
              <h2 className="text-lg font-semibold mb-4">
                Reportar Evento SST
              </h2>
              <form onSubmit={handleSubmitReport} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Tipo de Evento
                    </label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as ReportType)}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                    >
                      <option value="incident">
                        Incidente (Casi accidente)
                      </option>
                      <option value="accident">Accidente de Trabajo</option>
                      <option value="unsafe_act">Acto Inseguro</option>
                      <option value="unsafe_condition">
                        Condición Insegura
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Fecha del Evento
                    </label>
                    <input
                      type="date"
                      required
                      maxLength={50}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Lugar Exacto
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={200}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                    placeholder="Ej. Almacén principal, pasillo 3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Descripción Detallada
                  </label>
                  <textarea
                    required
                    maxLength={2000}
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                    placeholder="Describe qué sucedió, cómo sucedió y posibles causas..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Evidencia (Opcional)
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center justify-center px-4 py-2 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 cursor-pointer">
                      <Paperclip className="w-4 h-4 mr-2" />
                      Adjuntar archivos
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        onChange={(e) => {
                          if (e.target.files) {
                            setAttachments((prev) => [
                              ...prev,
                              ...Array.from(e.target.files!),
                            ]);
                          }
                        }}
                        accept="image/*,video/*,.pdf,.doc,.docx"
                      />
                    </label>

                    <label className="flex md:hidden items-center justify-center px-4 py-2 border border-blue-300 rounded-md shadow-sm text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 cursor-pointer">
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      Tomar Foto/Video
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        onChange={(e) => {
                          if (e.target.files) {
                            setAttachments((prev) => [
                              ...prev,
                              ...Array.from(e.target.files!),
                            ]);
                          }
                        }}
                        accept="image/*,video/*"
                        capture="environment"
                      />
                    </label>

                    {isRecording ? (
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="flex items-center justify-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 cursor-pointer animate-pulse"
                      >
                        <Square className="w-4 h-4 mr-2" />
                        Detener ({formatTime(recordingTime)})
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={startRecording}
                        className="flex items-center justify-center px-4 py-2 border border-blue-300 rounded-md shadow-sm text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 cursor-pointer"
                      >
                        <Mic className="w-4 h-4 mr-2" />
                        Grabar Audio
                      </button>
                    )}

                    {attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 w-full mt-2">
                        {attachments.map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center text-sm text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full"
                          >
                            <span className="truncate max-w-[150px]">
                              {file.name}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setAttachments((prev) =>
                                  prev.filter((_, i) => i !== index),
                                )
                              }
                              className="ml-2 text-slate-400 hover:text-red-500"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    disabled={uploading}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
                  >
                    {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Enviando...</> : "Enviar Reporte"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {loading ? (
            <div className="text-center py-10 text-slate-500">
              Cargando reportes...
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="text-center py-10 text-slate-500 bg-white rounded-xl shadow-sm border border-slate-200">
              {searchTerm ||
              filterType !== "all" ||
              filterStatus !== "all" ||
              filterStartDate ||
              filterEndDate
                ? "No se encontraron reportes con los filtros aplicados."
                : ["employer", "super_admin", "gerencia"].includes(profile?.role || "")
                  ? "No hay reportes de trabajadores."
                  : "No has enviado ningún reporte."}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredReports.map((report) => (
                <div
                  key={report.id}
                  className={`bg-white rounded-xl shadow-sm border-l-4 overflow-hidden ${getTypeColor(report.type).split(" ")[0].replace("bg-", "border-")}`}
                >
                  <div className="p-6">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getTypeColor(report.type)}`}
                          >
                            {getTypeLabel(report.type)}
                          </span>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              report.status === "reviewed"
                                ? "bg-green-100 text-green-800"
                                : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {report.status === "reviewed" ? (
                              <>
                                <CheckCircle className="w-3 h-3 mr-1" />{" "}
                                Revisado
                              </>
                            ) : (
                              <>
                                <Clock className="w-3 h-3 mr-1" /> Pendiente
                              </>
                            )}
                          </span>
                          {(["employer", "super_admin", "gerencia"].includes(
                            profile?.role || "",
                          ) ||
                            isMainAdmin(profile?.email) ||
                            profile?.uid === report.reportedBy) && (
                            <button
                              onClick={() => handleDeleteReport(report.id!)}
                              className="p-2 ml-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-full transition-colors flex-shrink-0"
                              title="Eliminar reporte"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        <div className="flex border-b border-slate-200 mb-4">
                          <button
                            onClick={() =>
                              setActiveTabs({
                                ...activeTabs,
                                [report.id!]: "details",
                              })
                            }
                            className={`px-4 py-2 text-sm font-medium ${!activeTabs[report.id!] || activeTabs[report.id!] === "details" ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-700"}`}
                          >
                            Reporte Inicial
                          </button>
                          {report.investigation &&
                            ["employer", "super_admin", "gerencia"].includes(
                              profile?.role || "",
                            ) && (
                              <button
                                onClick={() =>
                                  setActiveTabs({
                                    ...activeTabs,
                                    [report.id!]: "investigation",
                                  })
                                }
                                className={`px-4 py-2 text-sm font-medium ${activeTabs[report.id!] === "investigation" ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-700"}`}
                              >
                                Investigación
                              </button>
                            )}
                        </div>

                        {(!activeTabs[report.id!] ||
                          activeTabs[report.id!] === "details") && (
                          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <p className="text-slate-800 mt-3 whitespace-pre-wrap">
                              {report.description}
                            </p>

                            {report.attachmentUrls &&
                            report.attachmentUrls.length > 0 ? (
                              <div className="mt-4">
                                <span className="font-semibold block text-slate-700 mb-2 text-sm">
                                  Evidencia adjunta:
                                </span>
                                <div className="flex flex-wrap gap-4">
                                  {report.attachmentUrls.map((att, index) =>
                                    att.type === "image" ? (
                                      <div
                                        key={index}
                                        className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50 relative group inline-block"
                                      >
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setSelectedImage(att.url)
                                          }
                                          className="flex justify-center cursor-zoom-in"
                                        >
                                          <img
                                            src={att.url}
                                            alt={att.name || "Evidencia"}
                                            className="max-h-64 object-contain group-hover:opacity-90 transition-opacity"
                                            referrerPolicy="no-referrer"
                                          />
                                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                            <div className="bg-black/50 text-white px-3 py-1.5 rounded-full flex items-center backdrop-blur-sm text-sm">
                                              <svg
                                                className="w-4 h-4 mr-1.5"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                                                />
                                              </svg>
                                              Ampliar
                                            </div>
                                          </div>
                                        </button>
                                      </div>
                                    ) : att.type === "video" ? (
                                      <div
                                        key={index}
                                        className="rounded-lg overflow-hidden border border-slate-200 bg-black relative group inline-block"
                                      >
                                        <video
                                          src={att.url}
                                          controls
                                          className="max-h-64 object-contain"
                                        />
                                      </div>
                                    ) : att.type === "audio" ? (
                                      <div
                                        key={index}
                                        className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50 p-3 inline-block w-full sm:w-auto"
                                      >
                                        <div className="flex items-center mb-2">
                                          <Mic className="w-4 h-4 text-blue-500 mr-2" />
                                          <span className="text-sm font-medium text-slate-700 truncate max-w-[200px]">
                                            {att.name || "Nota de voz"}
                                          </span>
                                        </div>
                                        <audio
                                          src={att.url}
                                          controls
                                          className="w-full sm:w-64 h-10"
                                        />
                                      </div>
                                    ) : (
                                      <a
                                        key={index}
                                        href={att.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50"
                                      >
                                        <FileText className="w-4 h-4 mr-2 text-slate-500" />
                                        {att.name || "Ver documento"}
                                      </a>
                                    ),
                                  )}
                                </div>
                              </div>
                            ) : (
                              report.attachmentUrl && (
                                <div className="mt-4">
                                  <span className="font-semibold block text-slate-700 mb-2 text-sm">
                                    Evidencia adjunta:
                                  </span>
                                  {isImage(report.attachmentName) ? (
                                    <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50 relative group inline-block">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSelectedImage(
                                            report.attachmentUrl!,
                                          )
                                        }
                                        className="flex justify-center cursor-zoom-in"
                                      >
                                        <img
                                          src={report.attachmentUrl}
                                          alt={
                                            report.attachmentName || "Evidencia"
                                          }
                                          className="max-h-64 object-contain group-hover:opacity-90 transition-opacity"
                                          referrerPolicy="no-referrer"
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                          <div className="bg-black/50 text-white px-3 py-1.5 rounded-full flex items-center backdrop-blur-sm text-sm">
                                            <svg
                                              className="w-4 h-4 mr-1.5"
                                              fill="none"
                                              stroke="currentColor"
                                              viewBox="0 0 24 24"
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                                              />
                                            </svg>
                                            Ampliar
                                          </div>
                                        </div>
                                      </button>
                                    </div>
                                  ) : (
                                    <a
                                      href={report.attachmentUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50"
                                    >
                                      <FileText className="w-4 h-4 mr-2 text-slate-500" />
                                      {report.attachmentName || "Ver documento"}
                                    </a>
                                  )}
                                </div>
                              )
                            )}

                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                              <div>
                                <span className="font-semibold block text-slate-700">
                                  Lugar:
                                </span>
                                {report.location}
                              </div>
                              <div>
                                <span className="font-semibold block text-slate-700">
                                  Fecha del evento:
                                </span>
                                {report.date}
                              </div>
                              {["employer", "super_admin", "gerencia"].includes(
                                profile?.role || "",
                              ) && (
                                <div className="sm:col-span-2">
                                  <span className="font-semibold block text-slate-700">
                                    Reportado por:
                                  </span>
                                  {report.reportedByName}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Investigation Results */}
                        {activeTabs[report.id!] === "investigation" &&
                          report.investigation &&
                          ["employer", "super_admin", "gerencia"].includes(
                            profile?.role || "",
                          ) && (
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                              <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                                <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex items-center justify-between">
                                  <div className="flex items-center text-blue-800 font-semibold">
                                    <Sparkles className="w-5 h-5 mr-2" />
                                    Investigación (
                                    {report.investigation.methodology})
                                  </div>
                                  <span className="text-xs text-blue-600 font-medium bg-white px-2 py-1 rounded-full border border-blue-200">
                                    Por: {report.investigation.conductedByName}
                                  </span>
                                </div>
                                <div className="p-4 space-y-4">
                                  <div>
                                    <h4 className="text-sm font-bold text-slate-800 mb-1">
                                      Resumen
                                    </h4>
                                    <p className="text-sm text-slate-600">
                                      {report.investigation.summary}
                                    </p>
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-bold text-slate-800 mb-1">
                                      Desarrollo
                                    </h4>
                                    <p className="text-sm text-slate-600 whitespace-pre-wrap">
                                      {report.investigation.development}
                                    </p>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                      <h4 className="text-sm font-bold text-orange-800 mb-1">
                                        Causas Inmediatas
                                      </h4>
                                      <ul className="list-disc list-inside text-sm text-orange-700">
                                        {report.investigation.immediateCauses.map(
                                          (cause, i) => (
                                            <li key={i}>{cause}</li>
                                          ),
                                        )}
                                      </ul>
                                    </div>
                                    <div>
                                      <h4 className="text-sm font-bold text-red-800 mb-1">
                                        Causas Básicas
                                      </h4>
                                      <ul className="list-disc list-inside text-sm text-red-700">
                                        {report.investigation.basicCauses.map(
                                          (cause, i) => (
                                            <li key={i}>{cause}</li>
                                          ),
                                        )}
                                      </ul>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                      <h4 className="text-sm font-bold text-blue-800 mb-1">
                                        Medidas Correctivas
                                      </h4>
                                      <ul className="list-disc list-inside text-sm text-blue-700">
                                        {report.investigation.correctiveMeasures.map(
                                          (measure, i) => (
                                            <li key={i}>{measure}</li>
                                          ),
                                        )}
                                      </ul>
                                    </div>
                                    <div>
                                      <h4 className="text-sm font-bold text-emerald-800 mb-1">
                                        Medidas Preventivas
                                      </h4>
                                      <ul className="list-disc list-inside text-sm text-emerald-700">
                                        {report.investigation.preventiveMeasures.map(
                                          (measure, i) => (
                                            <li key={i}>{measure}</li>
                                          ),
                                        )}
                                      </ul>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                        <div className="mt-4 flex items-center justify-between flex-wrap gap-2 pt-4 border-t border-slate-100">
                          <div className="flex items-center space-x-4">
                            <p className="text-xs text-slate-400">
                              Enviado el{" "}
                              {report.createdAt
                                ? format(
                                    report.createdAt.toDate(),
                                    "d MMM yyyy 'a las' HH:mm",
                                    { locale: es },
                                  )
                                : "Justo ahora"}
                            </p>
                            <button
                              onClick={() => handleDownloadPDF(report)}
                              disabled={generatingPdfId === report.id}
                              className="flex items-center text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50"
                            >
                              {generatingPdfId === report.id ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-1"></div>
                              ) : (
                                <Download className="w-3.5 h-3.5 mr-1" />
                              )}
                              Descargar PDF
                            </button>
                          </div>
                          <div className="flex items-center space-x-3">
                            {["employer", "super_admin", "gerencia"].includes(
                              profile?.role || "",
                            ) &&
                              !report.investigation && (
                                <button
                                  onClick={() =>
                                    setActiveInvestigationReport(report)
                                  }
                                  className="flex items-center space-x-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100"
                                >
                                  <Sparkles className="w-4 h-4" />
                                  <span>Investigar</span>
                                </button>
                              )}
                            {["employer", "super_admin", "gerencia"].includes(
                              profile?.role || "",
                            ) &&
                              report.investigation && (
                                <button
                                  onClick={() =>
                                    setActiveInvestigationReport(report)
                                  }
                                  className="flex items-center space-x-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100"
                                >
                                  <Edit3 className="w-4 h-4" />
                                  <span>Editar Investigación</span>
                                </button>
                              )}
                            {["employer", "super_admin", "gerencia"].includes(
                              profile?.role || "",
                            ) &&
                              ["accident", "incident"].includes(
                                report.type,
                              ) && (
                                <button
                                  onClick={() =>
                                    setActiveLegalRegisterReport(report)
                                  }
                                  className="flex items-center space-x-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100"
                                >
                                  <FileText className="w-4 h-4" />
                                  <span>Generar Registro Legal</span>
                                </button>
                              )}
                            <button
                              onClick={() =>
                                setActiveCommentReport(
                                  activeCommentReport === report.id
                                    ? null
                                    : report.id!,
                                )
                              }
                              className="flex items-center space-x-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors"
                            >
                              <MessageSquare className="w-4 h-4" />
                              <span>
                                {report.comments?.length || 0} Comentarios
                              </span>
                            </button>
                          </div>
                        </div>

                        {/* Comments Section */}
                        {activeCommentReport === report.id && (
                          <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50 -mx-6 -mb-6 p-6">
                            <div className="space-y-4 mb-4">
                              {!report.comments ||
                              report.comments.length === 0 ? (
                                <p className="text-sm text-slate-500 text-center py-2">
                                  No hay comentarios aún. ¡Sé el primero!
                                </p>
                              ) : (
                                report.comments.map((comment: any) => (
                                  <div
                                    key={comment.id}
                                    className="flex space-x-3"
                                  >
                                    <div className="flex-shrink-0 h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-xs">
                                      {comment.authorName
                                        .charAt(0)
                                        .toUpperCase()}
                                    </div>
                                    <div className="flex-1 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                      <div className="flex justify-between items-baseline mb-1">
                                        <span className="text-sm font-medium text-slate-900">
                                          {comment.authorName}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                          {comment.createdAt?.toDate
                                            ? format(
                                                comment.createdAt.toDate(),
                                                "d MMM HH:mm",
                                                { locale: es },
                                              )
                                            : "Justo ahora"}
                                        </span>
                                      </div>
                                      <p className="text-sm text-slate-700 whitespace-pre-wrap">
                                        {comment.text}
                                      </p>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>

                            <div className="flex items-center space-x-3">
                              <div className="flex-shrink-0 h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-xs">
                                {profile?.displayName
                                  ?.charAt(0)
                                  .toUpperCase() ||
                                  profile?.email.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 relative">
                                <input
                                  type="text"
                                  value={commentText}
                                  onChange={(e) =>
                                    setCommentText(e.target.value)
                                  }
                                  onKeyPress={(e) => {
                                    if (e.key === "Enter") {
                                      handleAddComment(
                                        report.id!,
                                        report.comments,
                                      );
                                    }
                                  }}
                                  placeholder="Escribe un comentario..."
                                  className="w-full pl-4 pr-10 py-2 border border-slate-300 rounded-full focus:ring-blue-500 focus:border-blue-500 text-sm"
                                />
                                <button
                                  onClick={() =>
                                    handleAddComment(
                                      report.id!,
                                      report.comments,
                                    )
                                  }
                                  disabled={!commentText.trim()}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-600 hover:text-blue-800 disabled:opacity-50"
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {["employer", "super_admin", "gerencia"].includes(
                        profile?.role || "",
                      ) && (
                        <div className="flex-shrink-0">
                          {report.status === "pending" ? (
                            <button
                              onClick={() =>
                                handleUpdateStatus(
                                  report.id!,
                                  "reviewed",
                                  report.reportedBy,
                                )
                              }
                              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="w-4 h-4 mr-1.5" />
                              Marcar como Revisado
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                handleUpdateStatus(
                                  report.id!,
                                  "pending",
                                  report.reportedBy,
                                )
                              }
                              className="inline-flex items-center px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50"
                            >
                              <Clock className="w-4 h-4 mr-1.5" />
                              Marcar como Pendiente
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Investigation Wizard Modal */}
          {activeInvestigationReport && (
            <InvestigationWizard
              report={activeInvestigationReport}
              onClose={() => setActiveInvestigationReport(null)}
            />
          )}
          {activeLegalRegisterReport && (
            <MandatoryRegisterModal
              report={activeLegalRegisterReport}
              type={
                activeLegalRegisterReport.type === "accident"
                  ? "accident"
                  : "incident"
              }
              initialData={activeLegalRegisterReport.legalRegister}
              onClose={() => setActiveLegalRegisterReport(null)}
            />
          )}
        </>
      ) : (
        <AnalyticsTabsView
          activeTab={activeTab}
          records={records}
          loading={loadingAnalytics}
          users={users}
          profile={profile}
        />
      )}

      <ImageModal
        isOpen={selectedImage !== null}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage}
      />
    </div>
  );
};

const AnalyticsTabsView: React.FC<{
  activeTab: string;
  records: any[];
  loading: boolean;
  users: UserProfile[];
  profile: UserProfile | null;
}> = ({ activeTab, records, loading, users, profile }) => {
  const [filterWorker, setFilterWorker] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);

  const getFilteredRecords = () => {
    return records.filter((record) => {
      // 1. Worker filter
      if (filterWorker) {
        if (activeTab === "inspecciones") {
          if (record.workerId !== filterWorker) return false;
        } else if (activeTab === "trainings") {
          // For trainings, check if the worker is in the completions array or was presential
          const completions = record.completions || [];
          const presential = record.presentialSignatures || {};
          if (
            !completions.some((c: any) => c.workerId === filterWorker) &&
            !presential[filterWorker]
          ) {
            return false;
          }
        } else if (activeTab === "documents") {
          const signatures = record.signatures || [];
          if (!signatures.some((s: any) => s.userId === filterWorker))
            return false;
        }
      }

      // 2. Date filters
      const recordDate = record.createdAt?.toDate
        ? record.createdAt.toDate()
        : null;
      if (recordDate) {
        if (filterStartDate) {
          const start = new Date(filterStartDate);
          start.setHours(0, 0, 0, 0);
          if (recordDate < start) return false;
        }
        if (filterEndDate) {
          const end = new Date(filterEndDate);
          end.setHours(23, 59, 59, 999);
          if (recordDate > end) return false;
        }
      }

      return true;
    });
  };

  const filteredRecords = getFilteredRecords();

  const handleExportData = () => {
    if (activeTab === "inspecciones") {
      const data = filteredRecords.map((i) => ({
        ID: i.id,
        Plantilla: i.templateTitle,
        Trabajador: i.workerName,
        DNI: i.workerDni || "",
        Estado: i.status === "reviewed" ? "Revisado" : "Pendiente",
        Problemas: i.hasIssues ? "Sí" : "No",
        Fecha: i.createdAt?.toDate
          ? format(i.createdAt.toDate(), "dd/MM/yyyy HH:mm")
          : "",
      }));
      exportToExcel(data, "Auditoria_Inspecciones");
    } else if (activeTab === "trainings") {
      const data: any[] = [];
      filteredRecords.forEach((t) => {
        const completions = t.completions || [];
        completions.forEach((c: any) => {
          data.push({
            Capacitación: t.title,
            Trabajador: c.workerName,
            Nota: c.score || "N/A",
            Aprobado: c.passed ? "Sí" : "No",
            Fecha: c.completedAt?.toDate
              ? format(c.completedAt.toDate(), "dd/MM/yyyy")
              : "",
          });
        });
        const presential = t.presentialSignatures || {};
        Object.keys(presential).forEach((uid) => {
          const u = users.find((u) => u.uid === uid);
          data.push({
            Capacitación: t.title,
            Trabajador: u ? u.displayName : uid,
            Modalidad: "Presencial",
            Estado: "Asistió",
            Fecha: t.createdAt?.toDate
              ? format(t.createdAt.toDate(), "dd/MM/yyyy")
              : "",
          });
        });
      });
      exportToExcel(data, "Auditoria_Capacitaciones");
    } else if (activeTab === "documents") {
      const data: any[] = [];
      filteredRecords.forEach((d) => {
        const signatures = d.signatures || [];
        signatures.forEach((s: any) => {
          data.push({
            Documento: d.title,
            "Firmado por": s.userName,
            DNI: s.userDni || "",
            Email: s.userEmail || "",
            "Fecha Firma": s.timestamp?.toDate
              ? format(s.timestamp.toDate(), "dd/MM/yyyy HH:mm")
              : "",
          });
        });
      });
      exportToExcel(data, "Auditoria_Documentos_Firmados");
    }
  };

  const handleDownloadPdf = async (record: any, type: string, extra?: any) => {
    setGeneratingPdfId(record.id);
    try {
      if (type === "inspection") {
        await generateInspectionPDF(record);
      } else if (type === "training") {
        const dummyDate = new Date(
          extra.completionDate.split("/").reverse().join("-") + "T12:00:00",
        );
        const completionObj: any = {
          userName: extra.workerName,
          userDni: extra.workerDni,
          completedAt: { toDate: () => dummyDate },
          score: extra.score,
          passed: true,
          userId: "dummy",
          signatureUrl: "",
        };
        await generateTrainingCertificatePDF(record, completionObj);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error descargando PDF");
    } finally {
      setGeneratingPdfId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        Cargando registros...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Top Controls */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
            Trabajador
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={filterWorker}
              onChange={(e) => setFilterWorker(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none"
            >
              <option value="">Todos los trabajadores</option>
              {users.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.displayName} ({u.dni})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
            Desde
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
            Hasta
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
          </div>
        </div>

        <button
          onClick={handleExportData}
          disabled={filteredRecords.length === 0}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4 mr-2" />
          Exportar Excel
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          {activeTab === "inspecciones" && (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    Fecha
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    Inspección
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    Trabajador
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    Estado
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredRecords.map((record) => (
                  <tr
                    key={record.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {record.createdAt?.toDate
                        ? format(record.createdAt.toDate(), "dd/MM/yyyy")
                        : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                      {record.templateTitle}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {record.workerName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {record.hasIssues ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Con Problemas
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Correcta
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium border-l border-slate-100">
                      <button
                        onClick={() => handleDownloadPdf(record, "inspection")}
                        disabled={generatingPdfId === record.id}
                        className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                      >
                        {generatingPdfId === record.id
                          ? "Descargando..."
                          : "PDF"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === "trainings" && (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    Tema
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    Trabajadores Asistentes/Aprobados
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredRecords.map((record) => {
                  const completions = record.completions || [];
                  const presentialSignatures =
                    record.presentialSignatures || {};
                  const hasCompletions = completions.length > 0;
                  const hasPresential =
                    Object.keys(presentialSignatures).length > 0;

                  return (
                    <tr key={record.id}>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900 border-r border-slate-100 w-1/3 align-top">
                        {record.title}
                        <div className="text-xs text-slate-500 mt-1">
                          {record.createdAt?.toDate
                            ? format(record.createdAt.toDate(), "dd/MM/yyyy")
                            : "-"}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {!hasCompletions && !hasPresential ? (
                          <span className="text-sm text-slate-500 italic">
                            No hay registros de participación.
                          </span>
                        ) : (
                          <div className="space-y-4">
                            {hasCompletions && (
                              <div>
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">
                                  Virtual (Evaluación)
                                </h4>
                                <div className="space-y-2">
                                  {completions
                                    .filter((c: any) =>
                                      filterWorker
                                        ? c.workerId === filterWorker
                                        : true,
                                    )
                                    .map((c: any, i: number) => (
                                      <div
                                        key={i}
                                        className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100"
                                      >
                                        <div>
                                          <div className="text-sm font-medium text-slate-900">
                                            {c.workerName}
                                          </div>
                                          <div className="text-xs text-slate-500">
                                            Nota: {c.score} -{" "}
                                            {c.passed
                                              ? "Aprobado"
                                              : "Desaprobado"}
                                          </div>
                                        </div>
                                        {c.passed && (
                                          <button
                                            onClick={() =>
                                              handleDownloadPdf(
                                                record,
                                                "training",
                                                {
                                                  workerName: c.workerName,
                                                  workerDni: c.workerDni || "",
                                                  completionDate: c.completedAt
                                                    ?.toDate
                                                    ? format(
                                                        c.completedAt.toDate(),
                                                        "dd/MM/yyyy",
                                                      )
                                                    : "",
                                                  score: c.score,
                                                },
                                              )
                                            }
                                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                          >
                                            Certificado
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}

                            {hasPresential && (
                              <div>
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 mt-4 pt-4 border-t border-slate-100">
                                  Presencial (Firmas)
                                </h4>
                                <div className="space-y-2">
                                  {Object.entries(presentialSignatures)
                                    .filter(([uid]) =>
                                      filterWorker
                                        ? uid === filterWorker
                                        : true,
                                    )
                                    .map(([uid, sigBase64]: [string, any]) => {
                                      const u = users.find(
                                        (u) => u.uid === uid,
                                      );
                                      return (
                                        <div
                                          key={uid}
                                          className="flex items-center justify-between bg-blue-50/50 p-2 rounded-lg border border-blue-100"
                                        >
                                          <div className="text-sm font-medium text-slate-900">
                                            {u
                                              ? u.displayName
                                              : "Usuario Desconocido"}{" "}
                                            ({u?.dni || "-"})
                                          </div>
                                          <div className="h-8 w-24 bg-white border border-slate-200 rounded flex items-center justify-center overflow-hidden">
                                            <img
                                              src={sigBase64}
                                              alt="Firma"
                                              className="max-h-full object-contain"
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {activeTab === "documents" && (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    Documento
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    Firmado Por
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    Fecha Firma
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredRecords.map((record) => {
                  const signatures = record.signatures || [];
                  const filteredSigs = signatures.filter((s: any) =>
                    filterWorker ? s.userId === filterWorker : true,
                  );

                  if (filteredSigs.length === 0) return null;

                  return filteredSigs.map((sig: any, idx: number) => (
                    <tr
                      key={`${record.id}-${idx}`}
                      className="hover:bg-slate-50"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                        <a
                          href={record.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline flex items-center"
                        >
                          <FileText className="w-4 h-4 mr-2 text-blue-500" />
                          {record.title}
                        </a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-slate-900">
                          {sig.userName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {sig.userEmail || sig.userDni}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {sig.timestamp?.toDate
                          ? format(sig.timestamp.toDate(), "dd/MM/yyyy HH:mm")
                          : "-"}
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          )}

          {filteredRecords.length === 0 && (
            <div className="p-8 text-center text-slate-500">
              No se encontraron registros para los filtros seleccionados.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
