import React, { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { PageHeader } from "./ui/PageHeader";
import { InspectionDetailsModal } from "./InspectionDetailsModal";
import { useInspections, useInspectionTemplates } from "../hooks/useInspections";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  Timestamp,
  doc,
  getDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  where,
  serverTimestamp,
  getCountFromServer,
} from "firebase/firestore";
import {
  InspectionTemplate,
  InspectionItem,
  Inspection,
  InspectionResultItem,
  Company,
  Equipment,
} from "../types";
import { Loader2, ClipboardCheck,
  Plus,
  Trash2,
  X,
  CheckCircle,
  AlertTriangle,
  Camera,
  PenTool,
  Sparkles,
  Download,
  Search,
  FileSpreadsheet,
  QrCode,
  Globe,
  ChevronDown,
  ChevronUp,
  Folder,
  FileSignature,
  Eye,
  User,
  Calendar,
  Clock,
  ShieldCheck,
  Building,
  LayoutGrid,
  ClipboardList,
  History,
} from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { sendNotification } from "../utils/notificationUtils";
import { notifyAllEmployers, notifyUser, deleteNotificationsByTarget } from "../utils/notifications";
import { generateInspectionPDF } from "../utils/pdfGenerator";
import { MandatoryRegisterModal } from "./MandatoryRegisterModal";
import { uploadToCloudinary } from "../utils/cloudinary";
import {
  savePendingInspection,
  syncPendingInspections,
  getPendingInspections,
} from "../utils/offlineSync";
import { exportToExcel } from "../utils/exportToExcel";
import { Equipments } from "./Equipments";
import { ImageModal } from "./ui/ImageModal";
import { isMainAdmin } from "../constants/admin";
import { SignerBanner } from "./ui/SignerBanner";

export const Inspections: React.FC = () => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { selectedCompany, companies } = useCompany();
  const { data: templatesData, isLoading: templatesLoading } = useInspectionTemplates(
    (profile?.role === "employer" || profile?.role === "super_admin" || profile?.role === "gerencia") ? selectedCompany?.ruc : profile?.companyRuc,
    profile?.role
  );
  const templates = templatesData || [];

  const {
    data: inspectionsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: inspectionsLoading
  } = useInspections(
    (profile?.role === "employer" || profile?.role === "super_admin" || profile?.role === "gerencia") ? selectedCompany?.ruc : profile?.companyRuc,
    profile?.uid,
    profile?.role
  );
  
  const inspections = inspectionsData ? inspectionsData.pages.flatMap(p => p.docs) : [];
  
  const [pendingCount, setPendingCount] = useState(0);
  const loading = templatesLoading || inspectionsLoading;

  // Conteos reales del historial (la lista se carga por páginas)
  const historyRuc =
    (profile?.role === "employer" || profile?.role === "super_admin" || profile?.role === "gerencia") ? selectedCompany?.ruc : profile?.companyRuc;
  const canReviewInspections = ["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "");
  useEffect(() => {
    if (!canReviewInspections || !historyRuc) return;
    const base = collection(db, "inspections");
    const count = (...c: any[]) =>
      getCountFromServer(query(base, where("companyRuc", "==", historyRuc), ...c))
        .then((r) => r.data().count)
        .catch(() => 0);
    Promise.all([
      count(where("status", "==", "pending_review")),
      count(where("hasIssues", "==", true)),
      count(where("status", "==", "reviewed")),
    ]).then(([pending, issues, reviewed]) => setHistoryCounts({ pending, issues, reviewed }));
  }, [canReviewInspections, historyRuc, inspections.map((i) => i.status).join(",")]);

  // Template Creation State
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [newTemplateTitle, setNewTemplateTitle] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [newTemplateIsGlobal, setNewTemplateIsGlobal] = useState(false);
  const [selectedCompanyRuc, setSelectedCompanyRuc] = useState<string>("");
  const [newTemplateItems, setNewTemplateItems] = useState<InspectionItem[]>(
    [],
  );
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Inspection Taking State
  const [takingInspection, setTakingInspection] =
    useState<InspectionTemplate | null>(null);
  const [inspectionResults, setInspectionResults] = useState<
    Record<string, InspectionResultItem>
  >({});
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [usingSavedSignature, setUsingSavedSignature] = useState(false);
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generalPhotoFiles, setGeneralPhotoFiles] = useState<File[]>([]);
  const [generalPhotosPreviews, setGeneralPhotosPreviews] = useState<{url: string; name: string; type: string}[]>([]);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<InspectionTemplate | null>(null);
  const [selectedInspectionToView, setSelectedInspectionToView] = useState<Inspection | null>(null);
  const [isSigningId, setIsSigningId] = useState<string | null>(null);
  const [inspectionToDelete, setInspectionToDelete] = useState<string | null>(
    null,
  );
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerInitialData, setRegisterInitialData] = useState<any>(null);
  const [showGenerateRegisterPrompt, setShowGenerateRegisterPrompt] =
    useState(false);
  const [completedInspectionData, setCompletedInspectionData] =
    useState<any>(null);

  // Search States
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [inspectionSearchQuery, setInspectionSearchQuery] = useState("");

  // Admin View State
  const [activeAdminTab, setActiveAdminTab] = useState<
    "equipments" | "templates" | "history"
  >("equipments");
  const [historyFilter, setHistoryFilter] = useState<
    "all" | "pending" | "issues" | "reviewed"
  >("all");
  const [historyCounts, setHistoryCounts] = useState({ pending: 0, issues: 0, reviewed: 0 });
  const [historyGrouping, setHistoryGrouping] = useState<
    "none" | "template" | "equipment" | "status"
  >("none");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const [searchParams] = useSearchParams();
  const eqId = searchParams.get("eq");
  const [targetEquipment, setTargetEquipment] = useState<Equipment | null>(
    null,
  );

  useEffect(() => {
    if (selectedCompany && !selectedCompanyRuc) {
      setSelectedCompanyRuc(selectedCompany.ruc);
    }
  }, [selectedCompany, selectedCompanyRuc]);

  const handleDownloadPDF = async (inspection: Inspection) => {
    setGeneratingPdfId(inspection.id!);
    try {
      await generateInspectionPDF(inspection);
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setGeneratingPdfId(null);
    }
  };

  const generateTemplateWithAI = async () => {
    if (!aiPrompt) return;
    setIsGenerating(true);
    setError(null);
    try {
      const prompt = `Genera una lista de ítems de inspección para: ${aiPrompt}. 
      Devuélvelo estrictamente en formato JSON con un array de objetos, cada uno con 'question' (string) y 'type' (boolean, text, o number). Un ejemplo: [{"question": "¿El piso está limpio?", "type": "boolean"}]`;
      
      const httpResponse = await fetch('/api/gemini/generate-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      let parsedData;
      const contentType = httpResponse.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        parsedData = await httpResponse.json();
      } else {
        const textResponse = await httpResponse.text();
        console.error("Respuesta no JSON del servidor:", textResponse.substring(0, 200));
        throw new Error("El servidor no devolvió una respuesta válida (posible error 404 o configuración de Vercel incorrecta).");
      }
      
      if (!httpResponse.ok) {
         throw new Error(parsedData.error || "Error al contactar al servidor.");
      }

      console.log("Respuesta de IA recibida");

      const generatedItems = parsedData as {
        question: string;
        type: "boolean" | "text" | "number";
      }[];

      if (!Array.isArray(generatedItems)) {
        throw new Error("El formato devuelto no es válido.");
      }

      setNewTemplateItems(
        generatedItems.map((item) => ({
          id: Date.now().toString() + Math.random(),
          question: item.question,
          type: item.type,
          required: true,
        })),
      );
    } catch (err: any) {
      console.error("Error detallado de IA:", err);
      const errorMessage = err.message || "Error desconocido";
      setError(`Error al generar la plantilla con IA: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    const handleSmartQR = async () => {
      if (!eqId || !profile) return;
      try {
        const eqDoc = await getDoc(doc(db, "equipment", eqId));
        if (eqDoc.exists()) {
          const eqData = { id: eqDoc.id, ...eqDoc.data() } as Equipment;
          setTargetEquipment(eqData);
          if (eqData.inspectionTemplateId) {
            const tempDoc = await getDoc(
              doc(db, "inspection_templates", eqData.inspectionTemplateId),
            );
            if (tempDoc.exists()) {
              const template = {
                id: tempDoc.id,
                ...tempDoc.data(),
              } as InspectionTemplate;
              // Initialize results as it happens in handleStartInspection
              const initialResults: Record<string, InspectionResultItem> = {};
              template.items.forEach((item) => {
                initialResults[item.id] = {
                  itemId: item.id,
                  question: item.question,
                  answer: "",
                  isIssue: false,
                  photos: [],
                };
              });
              setInspectionResults(initialResults);
              setTakingInspection(template);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching smart QR equipment", error);
      }
    };
    handleSmartQR();
  }, [eqId, profile]);

  useEffect(() => {
    const checkPending = async () => {
      const pending = await getPendingInspections();
      setPendingCount(pending.length);
    };

    checkPending();

    if (navigator.onLine) {
      syncPendingInspections().then(checkPending);
    }
    const handleOnline = () => {
      syncPendingInspections().then(checkPending);
    };
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [profile, selectedCompany]);

  const handleAddTemplateItem = () => {
    setNewTemplateItems([
      ...newTemplateItems,
      {
        id: Date.now().toString(),
        question: "",
        type: "boolean",
        required: true,
      },
    ]);
  };

  const handleUpdateTemplateItem = (
    id: string,
    field: keyof InspectionItem,
    value: any,
  ) => {
    setNewTemplateItems(
      newTemplateItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
  };

  const handleRemoveTemplateItem = (id: string) => {
    setNewTemplateItems(newTemplateItems.filter((item) => item.id !== id));
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (newTemplateItems.length === 0) {
      setError("Debes agregar al menos un ítem a revisar.");
      return;
    }

    if (newTemplateItems.some((item) => item.question.trim() === "")) {
      setError("Todos los ítems de inspección deben tener una pregunta.");
      return;
    }

    try {
      setSubmitting(true);
      const ruc = ["employer", "super_admin", "gerencia"].includes(profile?.role)
        ? selectedCompany?.ruc || ""
        : profile.companyRuc || "";
      if (editingTemplateId) {
        await updateDoc(doc(db, "inspection_templates", editingTemplateId), {
          title: newTemplateTitle,
          description: newTemplateDesc,
          items: newTemplateItems,
          isGlobal: newTemplateIsGlobal,
        });
        toast.success("Plantilla actualizada exitosamente.");
      } else {
        await addDoc(collection(db, "inspection_templates"), {
          title: newTemplateTitle,
          description: newTemplateDesc,
          items: newTemplateItems,
          createdBy: profile.uid,
          companyRuc: ruc,
          isGlobal: newTemplateIsGlobal,
          createdAt: Timestamp.now(),
        });
        toast.success("Plantilla creada exitosamente.");
      }

      queryClient.invalidateQueries({ queryKey: ["inspection_templates"] });

      setIsCreatingTemplate(false);
      setEditingTemplateId(null);
      setNewTemplateTitle("");
      setNewTemplateDesc("");
      setNewTemplateItems([]);
      setNewTemplateIsGlobal(false);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Error al guardar la plantilla.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplateToDelete(id);
  };

  const handleEditTemplate = (template: InspectionTemplate) => {
    setEditingTemplateId(template.id || null);
    setNewTemplateTitle(template.title);
    setNewTemplateDesc(template.description);
    setNewTemplateItems(template.items);
    setNewTemplateIsGlobal(template.isGlobal || false);
    setIsCreatingTemplate(true);
  };

  const handleCancelTemplate = () => {
    setIsCreatingTemplate(false);
    setEditingTemplateId(null);
    setNewTemplateTitle("");
    setNewTemplateDesc("");
    setNewTemplateItems([]);
    setNewTemplateIsGlobal(false);
    setError(null);
  };

  const confirmDeleteTemplate = async () => {
    if (templateToDelete) {
      await deleteDoc(doc(db, "inspection_templates", templateToDelete));
      queryClient.invalidateQueries({ queryKey: ["inspection_templates"] });
      setTemplateToDelete(null);
    }
  };

  const handleStartInspection = (template: InspectionTemplate) => {
    setTakingInspection(template);
    const initialResults: Record<string, InspectionResultItem> = {};
    template.items.forEach((item) => {
      initialResults[item.id] = {
        itemId: item.id,
        question: item.question,
        answer: "",
        isIssue: false,
      };
    });
    setInspectionResults(initialResults);
    setGeneralPhotoFiles([]);
    setGeneralPhotosPreviews([]);
    setSigning(false);
    setError(null);
  };

  const handleAddPhoto = (itemId: string, files: FileList | null) => {
    if (!files) return;

    setInspectionResults((prev) => {
      const current = prev[itemId] || {
        itemId,
        question: "",
        isIssue: false,
        answer: "",
      };
      const currentFiles = current.photoFiles || [];
      const currentPhotos = current.photos || [];

      const newFiles = Array.from(files);
      const newPhotos = newFiles.map((file) => ({
        url: URL.createObjectURL(file), // temporary preview
        name: file.name,
        type: file.type.startsWith("image/") ? "image" : "video",
      }));

      return {
        ...prev,
        [itemId]: {
          ...current,
          photoFiles: [...currentFiles, ...newFiles],
          photos: [...currentPhotos, ...newPhotos],
        },
      };
    });
  };

  const handleRemovePhoto = (itemId: string, index: number) => {
    setInspectionResults((prev) => {
      const current = prev[itemId];
      if (!current) return prev;

      const newFiles = [...(current.photoFiles || [])];
      newFiles.splice(index, 1);

      const newPhotos = [...(current.photos || [])];
      newPhotos.splice(index, 1);

      return {
        ...prev,
        [itemId]: {
          ...current,
          photoFiles: newFiles,
          photos: newPhotos,
        },
      };
    });
  };

  const handleAddGeneralPhoto = (files: FileList | null) => {
    if (!files) return;

    const newFiles = Array.from(files);
    const newPhotos = newFiles.map((file) => ({
      url: URL.createObjectURL(file), // temporary preview
      name: file.name,
      type: file.type.startsWith("image/") ? "image" : "video",
    }));

    setGeneralPhotoFiles((prev) => [...prev, ...newFiles]);
    setGeneralPhotosPreviews((prev) => [...prev, ...newPhotos]);
  };

  const handleRemoveGeneralPhoto = (index: number) => {
    setGeneralPhotoFiles((prev) => {
      const newFiles = [...prev];
      newFiles.splice(index, 1);
      return newFiles;
    });
    setGeneralPhotosPreviews((prev) => {
      const newPhotos = [...prev];
      newPhotos.splice(index, 1);
      return newPhotos;
    });
  };

  const handleUpdateResult = (
    itemId: string,
    field: keyof InspectionResultItem,
    value: any,
  ) => {
    setInspectionResults((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
  };

  const handleSubmitInspection = async () => {
    console.log("handleSubmitInspection called");
    if (!takingInspection || !profile) {
      console.error("takingInspection or profile is missing", {
        takingInspection,
        profile,
      });
      return;
    }

    // Validate
    let isValid = true;
    console.log("Inspection Results:", inspectionResults);
    takingInspection.items.forEach((item) => {
      const result = inspectionResults[item.id];
      console.log(`Checking item ${item.id}:`, result);
      if (!result) {
        console.error(`Result for item ${item.id} is missing!`);
        isValid = false;
        return;
      }
      if (
        item.required &&
        (result.answer === "" || result.answer === undefined)
      ) {
        console.log(`Item ${item.id} is required and missing answer`);
        isValid = false;
      }
      if (result.isIssue && !result.comment) {
        console.log(`Item ${item.id} is issue and missing comment`);
        isValid = false; // Require comment if it's an issue
      }
    });

    if (!isValid) {
      console.log("Validation failed");
      setError(
        "Por favor responde todas las preguntas requeridas y agrega un comentario si marcaste algún problema (❌).",
      );
      return;
    }
    console.log("Validation passed");

    if (!signing) {
      if (!profile?.dni) {
        setError(
          "Es obligatorio registrar su DNI en su perfil ('Mi Perfil') para poder firmar digitalmente.",
        );
        return;
      }
      console.log("Setting signing to true");
      setSigning(true);
      return;
    }

    if (!usingSavedSignature && sigCanvas.current?.isEmpty()) {
      console.log("Signature is empty");
      setError("Por favor, dibuja tu firma o marca usar tu firma guardada.");
      return;
    }
    console.log("Signature is not empty");

    try {
      setSubmitting(true);
      const signatureDataUrl =
        usingSavedSignature && profile?.savedSignatureUrl
          ? profile.savedSignatureUrl
          : sigCanvas.current?.getTrimmedCanvas().toDataURL("image/png");

      if (!signatureDataUrl) throw new Error("No signature");

      const resultsArray = Object.values(inspectionResults);
      const hasIssues = resultsArray.some((r) => r.isIssue);

      if (!navigator.onLine) {
        // Save offline
        await savePendingInspection({
          templateId: takingInspection.id,
          templateTitle: takingInspection.title,
          workerId: profile.uid,
          workerName: profile.displayName || profile.email,
          workerDni: profile.dni || "No registrado",
          workerEmail: profile.email,
          companyRuc: profile.companyRuc || "",
          results: resultsArray,
          generalPhotoFiles,
          signatureBase64: signatureDataUrl,
          hasIssues,
        });

        setError(
          "Estás sin conexión. La inspección se guardó localmente y se sincronizará cuando recuperes la conexión.",
        );

        const pending = await getPendingInspections();
        setPendingCount(pending.length);

        setTimeout(() => {
          setGeneralPhotoFiles([]);
          setGeneralPhotosPreviews([]);
          setTakingInspection(null);
          setSigning(false);
          setError(null);
        }, 3000);
        return;
      }

      const signatureUrl = await uploadToCloudinary(signatureDataUrl);

      // Upload photos if any
      for (const result of resultsArray) {
        if (result.photoFile) {
          result.photoUrl = await uploadToCloudinary(result.photoFile as File);
          delete result.photoFile; // Remove the file object before saving to Firestore
        }
        if (result.photoFiles && result.photoFiles.length > 0) {
          const uploadedPhotos = [];
          for (let i = 0; i < result.photoFiles.length; i++) {
            const file = result.photoFiles[i];
            const url = await uploadToCloudinary(file);
            uploadedPhotos.push({
              url,
              name: file.name,
              type: file.type.startsWith("image/") ? "image" : "video",
            });
          }
          result.photos = uploadedPhotos;
          delete result.photoFiles;
        }
      }

      let attachmentUrls = [];
      if (generalPhotoFiles.length > 0) {
        for (const file of generalPhotoFiles) {
          const url = await uploadToCloudinary(file);
          attachmentUrls.push({
            url,
            name: file.name,
            type: file.type.startsWith("image/") ? "image" : "video",
          });
        }
      }

      const ruc = ["employer", "super_admin", "gerencia"].includes(profile?.role)
        ? selectedCompany?.ruc || ""
        : profile.companyRuc || "";
      const newInspection: any = {
        templateId: takingInspection.id,
        templateTitle: takingInspection.title,
        workerId: profile.uid,
        workerName: profile.displayName || profile.email,
        workerDni: profile.dni || "No registrado",
        workerEmail: profile.email,
        companyRuc: ruc,
        results: resultsArray,
        signatureUrl,
        signatureBase64: signatureDataUrl,
        hasIssues,
        status: "pending_review",
        createdAt: serverTimestamp(),
      };

      if (attachmentUrls.length > 0) {
        newInspection.attachmentUrls = attachmentUrls;
      }

      if (targetEquipment) {
        newInspection.equipmentId = targetEquipment.id;
        newInspection.equipmentName = targetEquipment.name;
      }

      await addDoc(collection(db, "inspections"), newInspection);
      toast.success("Inspección guardada exitosamente.");
      queryClient.invalidateQueries({ queryKey: ["inspections"] });

      // Notify employers
      await notifyAllEmployers(
        "Nueva Inspección Completada",
        `El trabajador ${profile?.displayName || profile?.email} ha completado la inspección: ${takingInspection.title}`,
        "/inspections",
        ruc,
      );

      setCompletedInspectionData(newInspection);
      if (
        ["employer", "super_admin", "supervisor", "gerencia"].includes(profile?.role || "") || 
        profile?.role === "gerencia"
      ) {
        setShowGenerateRegisterPrompt(true);
      }

      setGeneralPhotoFiles([]);
      setGeneralPhotosPreviews([]);
      setTakingInspection(null);
      setSigning(false);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(
        `Error al enviar la inspección: ${err.message || "Error desconocido"}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkReviewed = async (inspectionId: string) => {
    try {
      await updateDoc(doc(db, "inspections", inspectionId), {
        status: "reviewed",
      });
      queryClient.invalidateQueries({ queryKey: ["inspections"] });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteInspection = (inspectionId: string) => {
    setInspectionToDelete(inspectionId);
  };

  const confirmDeleteInspection = async () => {
    if (!inspectionToDelete) return;
    try {
      await deleteDoc(doc(db, "inspections", inspectionToDelete));
      await deleteNotificationsByTarget(inspectionToDelete);
      // Optimistic update
      queryClient.setQueryData(["inspections", (profile?.role === "employer" || profile?.role === "super_admin" || profile?.role === "gerencia") ? selectedCompany?.ruc : profile?.companyRuc, profile?.uid, profile?.role], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            docs: page.docs.filter((d: any) => d.id !== inspectionToDelete)
          }))
        };
      });

      try {
        // Cascade delete corrective actions matching this sourceId
        const q = query(
          collection(db, "corrective_actions"),
          where("sourceId", "==", inspectionToDelete),
        );
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, "corrective_actions", d.id)).catch(e => console.warn(e)));
        await Promise.all(deletePromises);
      } catch (e) {
        console.warn(
          "No se pudieron eliminar acciones correctivas vinculadas (ignorando):",
          e,
        );
      }

      toast.success("Inspección eliminada exitosamente.");
      setInspectionToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["inspections"] });
    } catch (error) {
      console.error("Error al eliminar inspección:", error);
      toast.error("Error al eliminar la inspección.");
    }
  };

  const filteredTemplates = templates.filter(
    (template) =>
      template.title
        .toLowerCase()
        .includes(templateSearchQuery.toLowerCase()) ||
      template.description
        .toLowerCase()
        .includes(templateSearchQuery.toLowerCase()),
  );

  const matchesHistoryFilter = (inspection: Inspection) =>
    historyFilter === "all" ||
    (historyFilter === "pending" && inspection.status === "pending_review") ||
    (historyFilter === "issues" && !!inspection.hasIssues) ||
    (historyFilter === "reviewed" && inspection.status === "reviewed");

  const filteredInspections = inspections.filter(
    (inspection) =>
      matchesHistoryFilter(inspection) && (
      inspection.templateTitle
        .toLowerCase()
        .includes(inspectionSearchQuery.toLowerCase()) ||
      inspection.workerName
        .toLowerCase()
        .includes(inspectionSearchQuery.toLowerCase()) ||
      (inspection.equipmentName &&
        inspection.equipmentName
          .toLowerCase()
          .includes(inspectionSearchQuery.toLowerCase()))),
  );

  const getGroupedInspections = () => {
    if (historyGrouping === "none") return { Todas: filteredInspections };

    return filteredInspections.reduce(
      (acc, inspection) => {
        let key = "Otros";
        if (historyGrouping === "template") {
          key = inspection.templateTitle || "Sin plantilla";
        } else if (historyGrouping === "equipment") {
          key = inspection.equipmentName || "Sin equipo asignado";
        } else if (historyGrouping === "status") {
          key = inspection.hasIssues
            ? "🔴 Con Anomalías / Problemas"
            : "🟢 Correctas (Sin observaciones)";
        }

        if (!acc[key]) acc[key] = [];
        acc[key].push(inspection);
        return acc;
      },
      {} as Record<string, Inspection[]>,
    );
  };

  const groupedInspections = getGroupedInspections();

  const handleExportExcel = () => {
    const dataToExport = filteredInspections.map((inspection) => ({
      ID: inspection.id,
      Plantilla: inspection.templateTitle,
      Trabajador: inspection.workerName,
      DNI: inspection.workerDni || "",
      Estado: inspection.status === "reviewed" ? "Revisado" : "Pendiente",
      "Problemas Encontrados": inspection.hasIssues ? "Sí" : "No",
      "Fecha de Creación": inspection.createdAt?.toDate
        ? inspection.createdAt.toDate().toLocaleString()
        : "",
    }));

    exportToExcel(dataToExport, "Inspecciones_SST");
  };

  const renderInspectionCard = (inspection: Inspection) => {
    const isPending = inspection.status === "pending_review";
    const formattedDate = inspection.createdAt?.toDate().toLocaleDateString("es-ES", { day: '2-digit', month: 'short', year: 'numeric' }) || "";
    const formattedTime = inspection.createdAt?.toDate().toLocaleTimeString("es-ES", { hour: '2-digit', minute: '2-digit' }) || "";

    return (
      <div
        key={inspection.id}
        onClick={() => setSelectedInspectionToView(inspection)}
        className={`bg-white rounded-2xl border ${isPending && inspection.hasIssues ? "border-red-300 shadow-md shadow-red-100/50" : "border-slate-200 shadow-sm"} overflow-hidden flex flex-col transition-all hover:shadow-lg cursor-pointer`}
      >
        {/* HEADER */}
        <div className={`p-4 border-b ${inspection.hasIssues ? 'bg-red-50/50 border-red-100' : 'bg-slate-50/50 border-slate-100'} flex justify-between items-start gap-4`}>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                inspection.hasIssues 
                  ? 'bg-red-100 text-red-700 border border-red-200' 
                  : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              }`}>
                {inspection.hasIssues ? <AlertTriangle className="w-3 h-3 mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                {inspection.hasIssues ? "Observaciones" : "Sin Anomalías"}
              </span>
              <span className="text-xs text-slate-500 font-medium flex items-center bg-white px-2 py-0.5 rounded-full border border-slate-200">
                <Clock className="w-3 h-3 mr-1 text-slate-400" />
                {formattedDate} {formattedTime}
              </span>
            </div>
            <h3 className="font-bold text-slate-900 text-lg leading-tight mt-1">
              {inspection.templateTitle}
            </h3>
            {inspection.equipmentName && (
              <p className="text-xs font-semibold text-indigo-700 mt-2 bg-indigo-50/80 px-2.5 py-1 rounded-md w-fit border border-indigo-100 flex items-center">
                <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" />
                {inspection.equipmentName}
              </p>
            )}
          </div>
          
          {/* Actions Menu */}
          <div className="flex flex-col gap-2 items-end shrink-0">
             <button
                onClick={(e) => { e.stopPropagation(); handleDownloadPDF(inspection); }}
                disabled={generatingPdfId === inspection.id}
                className="flex items-center justify-center p-2 bg-white text-blue-600 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-lg transition-all disabled:opacity-50 shadow-sm"
                title="Descargar PDF"
              >
                {generatingPdfId === inspection.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </button>
              {(profile?.role === "employer" || profile?.role === "gerencia" ||
              isMainAdmin(profile?.email) ||
              (profile?.uid === inspection.workerId &&
                inspection.status === "pending_review")) && (
              <button
                onClick={(e) => { e.stopPropagation(); setInspectionToDelete(inspection.id!); }}
                className="flex items-center justify-center p-2 bg-white text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-all shadow-sm"
                title="Eliminar inspección"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* BODY */}
        <div className="p-4 flex-1 flex flex-col gap-4">
          <div className="flex items-center gap-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
             <div className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 shrink-0">
               <User className="w-5 h-5" />
             </div>
             <div className="flex flex-col">
               <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">Realizado por</span>
               <span className="font-bold text-slate-800">{inspection.workerName}</span>
             </div>
          </div>

          {inspection.hasIssues && (
            <div className="space-y-4 bg-red-50/50 p-4 rounded-xl border-l-4 border-l-red-500 border-y border-r border-red-100">
              <p className="text-xs font-bold text-red-800 uppercase tracking-wider flex items-center">
                <AlertTriangle className="w-4 h-4 mr-1.5" />
                Problemas Reportados
              </p>
              <div className="space-y-3">
                {inspection.results
                  .filter((r) => r.isIssue)
                  .map((issue, idx) => (
                    <div
                      key={idx}
                      className="text-sm bg-white p-3 rounded-lg border border-red-100 shadow-sm"
                    >
                      <p className="font-semibold text-slate-800">{issue.question}</p>
                      <p className="text-red-600 mt-1.5 font-medium italic border-l-2 border-red-300 pl-2">"{issue.comment}"</p>

                      {/* Legacy single photo */}
                      {issue.photoUrl && !issue.photos && (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => setSelectedImage(issue.photoUrl!)}
                            className="block overflow-hidden rounded-lg border border-red-200 hover:opacity-90 transition-opacity"
                          >
                            <img
                              src={issue.photoUrl}
                              alt="Evidencia"
                              className="h-20 w-32 object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </button>
                        </div>
                      )}

                      {/* Multiple photos/videos */}
                      {issue.photos && issue.photos.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {issue.photos.map((photo, pIdx) => (
                            <div
                              key={pIdx}
                              className="block h-20 w-24 relative rounded-lg overflow-hidden border border-red-200 group shadow-sm"
                            >
                              {photo.type === "image" ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedImage(photo.url)}
                                  className="w-full h-full"
                                >
                                  <img
                                    src={photo.url}
                                    alt={photo.name || "Evidencia"}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                    referrerPolicy="no-referrer"
                                  />
                                </button>
                              ) : (
                                <a
                                  href={photo.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-full h-full bg-slate-900 flex flex-col items-center justify-center hover:bg-slate-800 transition-colors"
                                >
                                  <div className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center mb-1">
                                    <div className="w-0 h-0 border-t-4 border-t-transparent border-l-6 border-l-white border-b-4 border-b-transparent ml-1"></div>
                                  </div>
                                  <span className="text-white text-[10px] font-medium">Video</span>
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Rendering general photos (Evidencia general) */}
          {inspection.attachmentUrls && inspection.attachmentUrls.length > 0 && (
            <div className="mt-2 pt-4 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center">
                <Camera className="w-4 h-4 mr-1.5 text-slate-400" />
                Evidencia General
              </p>
              <div className="flex flex-wrap gap-2">
                {inspection.attachmentUrls.map((photo, pIdx) => (
                  <div
                    key={pIdx}
                    className="block h-20 w-24 relative rounded-lg overflow-hidden border border-slate-200 group shadow-sm"
                  >
                    {photo.type === "image" ? (
                      <button
                        type="button"
                        onClick={() => setSelectedImage(photo.url)}
                        className="w-full h-full"
                      >
                        <img
                          src={photo.url}
                          alt={photo.name || "Evidencia General"}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          referrerPolicy="no-referrer"
                        />
                      </button>
                    ) : (
                      <a
                        href={photo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full h-full bg-slate-900 flex flex-col items-center justify-center hover:bg-slate-800 transition-colors"
                      >
                         <div className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center mb-1">
                            <div className="w-0 h-0 border-t-4 border-t-transparent border-l-6 border-l-white border-b-4 border-b-transparent ml-1"></div>
                         </div>
                        <span className="text-white text-[10px] font-medium">Video</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* FOOTER - Signatures and Actions */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="font-semibold text-xs text-slate-500 uppercase tracking-wider">Firma del Supervisor SST</span>
            {inspection.supervisorSignatureUrl ? (
              <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-emerald-100 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-500 font-medium">Validado por</span>
                    <span className="text-sm font-bold text-slate-800">{inspection.supervisorName}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <img
                    src={inspection.supervisorSignatureUrl}
                    alt="Firma Supervisor"
                    className="h-8 object-contain opacity-80"
                  />
                  <span className="flex items-center text-emerald-600 font-bold text-[10px] uppercase mt-1">
                    <CheckCircle className="w-3 h-3 mr-1" /> Firmado
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-amber-50 p-3 rounded-xl border border-amber-200 shadow-sm gap-3">
                <div className="flex items-center gap-3 text-amber-700">
                  <div className="w-10 h-10 rounded-full bg-white border border-amber-200 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm">Pendiente de Firma</span>
                    <span className="text-xs opacity-80">Requiere validación del supervisor</span>
                  </div>
                </div>
                {(["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "")) && (
                  <button
                    onClick={async () => {
                      if (isSigningId) return;
                      const sigUrl = profile.digitalSignatureConsent?.signatureUrl || profile.savedSignatureUrl;
                      if (!sigUrl) {
                        toast.error("Debes configurar tu firma electrónica en tu perfil primero.");
                        return;
                      }
                      setIsSigningId(inspection.id!);
                      try {
                        const { updateDoc, doc } = await import("firebase/firestore");
                        await updateDoc(doc(db, "inspections", inspection.id!), {
                            supervisorSignatureUrl: sigUrl,
                            supervisorName: profile.displayName,
                            supervisorDni: profile.dni,
                            supervisorId: profile.uid,
                            status: "reviewed"
                        });
                        if (inspection.workerId) {
                           notifyUser(
                             inspection.workerId, 
                             "Inspección Firmada", 
                             `Tu inspección "${inspection.templateTitle}" ha sido validada y firmada.`, 
                             "/inspections",
                             selectedCompany?.ruc
                           ).catch(() => {});
                        }
                        toast.success("Firma electrónica aplicada correctamente.");
                      } catch (err) {
                        console.error("Error signing:", err);
                        toast.error("Error al aplicar la firma.");
                      } finally {
                        setIsSigningId(null);
                      }
                    }}
                    disabled={isSigningId === inspection.id}
                    className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all shadow-sm hover:shadow flex items-center justify-center shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSigningId === inspection.id ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <FileSignature className="w-4 h-4 mr-2" />
                    )}
                    {isSigningId === inspection.id ? "Firmando..." : "Aplicar Firma Electrónica"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons for Issues */}
          {inspection.status === "pending_review" &&
            inspection.hasIssues &&
            (["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "")) && (
              <div className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={() => handleMarkReviewed(inspection.id!)}
                  className="w-full px-3 py-2 bg-white text-slate-700 text-sm font-bold rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  Solo Marcar Revisado
                </button>
                <button
                  onClick={() => {
                    const generateFromInspection = (ins: any) => {
                      const issues = ins.results.filter((r: any) => r.isIssue);
                      const now = new Date();
                      const dateStr = now.toISOString().split("T")[0];
                      const timeStr = now
                        .toTimeString()
                        .split(" ")[0]
                        .substring(0, 5);
                      const initialData = {
                        inspectionDate: dateStr,
                        inspectionTime: timeStr,
                        inspectionType: "Planeada",
                        objective: ins.templateTitle,
                        result: `Se inspeccionaron ${ins.results.length} ítems. ${issues.length} no conformes.`,
                        unfavorableResultsCauses: issues
                          .map((i: any) => i.comment)
                          .join("; "),
                        conclusions:
                          issues.length > 0
                            ? "Se encontraron observaciones que requieren medidas correctivas."
                            : "Inspección completada sin observaciones.",
                        correctiveMeasures: issues.map((i: any) => ({
                          description: i.comment || i.question,
                          responsible: "",
                          executionDay: "",
                          executionMonth: "",
                          executionYear: "",
                          status: "pendiente",
                        })),
                      };
                      setRegisterInitialData(initialData);
                      setShowRegisterModal(true);
                    };
                    generateFromInspection(inspection);
                  }}
                  className="w-full px-3 py-2 bg-indigo-100 text-indigo-800 text-sm font-bold rounded-lg border border-indigo-200 hover:bg-indigo-200 transition-colors shadow-sm flex items-center justify-center sm:col-span-2 lg:col-span-1"
                  title="Generar Registro Legal"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                  Registro Legal
                </button>
              </div>
            )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        Cargando inspecciones...
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Inspecciones y Checklists"
        description="Gestión de revisiones de equipos y áreas"
        icon={ClipboardCheck}
        color="indigo"
        actions={
          <>
            {pendingCount > 0 && (
              <div className="flex items-center gap-2 bg-amber-500/20 text-white px-3 py-2 rounded-xl border border-amber-400/50 text-sm font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-200" />
                <span>{pendingCount} pendiente(s) de sincronizar</span>
              </div>
            )}
            {["employer", "super_admin", "gerencia"].includes(profile?.role || "") && (
              <button
                onClick={handleExportExcel}
                className="flex items-center px-4 py-2 bg-white/15 text-white rounded-lg hover:bg-white/25 transition-colors border border-white/30"
                title="Exportar a Excel"
              >
                <FileSpreadsheet className="w-5 h-5 mr-2" />
                <span className="hidden sm:inline">Exportar</span>
              </button>
            )}
            {["employer", "super_admin", "gerencia"].includes(profile?.role || "") &&
              !isCreatingTemplate && (
                <button
                  onClick={() => setIsCreatingTemplate(true)}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm border border-blue-500"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Nueva Plantilla
                </button>
              )}
          </>
        }
      />

      {/* Template Creation Form */}
      {isCreatingTemplate &&
        ["employer", "super_admin", "gerencia"].includes(profile?.role || "") && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800">
                {editingTemplateId ? "Editar Plantilla de Inspección" : "Crear Plantilla de Inspección"}
              </h2>
              <button
                onClick={handleCancelTemplate}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="space-y-6">
              {/* AI Generation Section */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 space-y-3">
                <label className="block text-sm font-medium text-blue-900">
                  Generar con IA
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    className="flex-1 px-3 py-2 border border-blue-200 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ej. Checklist para inspección de montacargas"
                  />
                  <button
                    type="button"
                    onClick={generateTemplateWithAI}
                    disabled={isGenerating || !aiPrompt}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    {isGenerating ? "Generando..." : "Generar"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Título de la Inspección
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={newTemplateTitle}
                  onChange={(e) => setNewTemplateTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ej. Inspección Pre-uso de Montacargas"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Descripción / Instrucciones
                </label>
                <textarea
                  required
                  maxLength={500}
                  value={newTemplateDesc}
                  onChange={(e) => setNewTemplateDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Instrucciones para el trabajador..."
                  rows={2}
                />
              </div>

              {(profile?.role === "super_admin" || profile?.role === "employer" || profile?.role === "gerencia") && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isGlobal"
                    checked={newTemplateIsGlobal}
                    onChange={(e) => setNewTemplateIsGlobal(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="isGlobal" className="text-sm font-medium text-slate-700">
                    Hacer esta plantilla Global (disponible para todas las empresas)
                  </label>
                </div>
              )}

              <div className="space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium text-slate-800">
                    Ítems a Revisar
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddTemplateItem}
                    className="text-sm flex items-center text-blue-600 hover:text-blue-800"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Agregar Ítem
                  </button>
                </div>

                {newTemplateItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-start space-x-3 bg-white p-3 rounded-lg border border-slate-200"
                  >
                    <span className="mt-2 font-medium text-slate-400">
                      {index + 1}.
                    </span>
                    <div className="flex-1 space-y-3">
                      <input
                        type="text"
                        required
                        value={item.question}
                        onChange={(e) =>
                          handleUpdateTemplateItem(
                            item.id,
                            "question",
                            e.target.value,
                          )
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        placeholder="Ej. ¿Los frenos funcionan correctamente?"
                      />
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center text-sm text-slate-600">
                          <span className="mr-2">Tipo:</span>
                          <select
                            value={item.type}
                            onChange={(e) =>
                              handleUpdateTemplateItem(
                                item.id,
                                "type",
                                e.target.value,
                              )
                            }
                            className="border border-slate-300 rounded-md text-sm p-1"
                          >
                            <option value="boolean">Bien / Mal / N/A</option>
                            <option value="text">Respuesta de Texto</option>
                            <option value="number">Número</option>
                            <option value="visual_pressure">
                              Presión Visual
                            </option>
                          </select>
                        </label>
                        <label className="flex items-center text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={item.required}
                            onChange={(e) =>
                              handleUpdateTemplateItem(
                                item.id,
                                "required",
                                e.target.checked,
                              )
                            }
                            className="mr-2 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          Obligatorio
                        </label>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveTemplateItem(item.id)}
                      className="text-slate-400 hover:text-red-500 p-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {newTemplateItems.length === 0 && (
                  <p className="text-sm text-slate-500 italic text-center py-4">
                    No has agregado ningún ítem a revisar.
                  </p>
                )}
              </div>

              {error && <p className="text-red-600 text-sm">{error}</p>}

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleCancelTemplate}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Guardando...</> : (editingTemplateId ? "Actualizar Plantilla" : "Guardar Plantilla")}
                </button>
              </div>
            </form>
          </div>
        )}

      {/* Taking Inspection Modal */}
      {takingInspection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="text-lg font-bold text-slate-800 flex items-center">
                <ClipboardCheck className="w-5 h-5 mr-2 text-blue-600" />
                {takingInspection.title}
              </h3>
              <button
                onClick={() => setTakingInspection(null)}
                className="text-slate-400 hover:text-slate-600"
                title="Cerrar"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {!signing ? (
                <>
                  {targetEquipment && (
                    <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-lg flex items-center">
                      <span className="font-semibold mr-2">
                        Inspeccionando Equipo:
                      </span>
                      {targetEquipment.name} ({targetEquipment.type}) -{" "}
                      {targetEquipment.location}
                    </div>
                  )}
                  <p className="text-slate-600 mb-6">
                    {takingInspection.description}
                  </p>

                  {error && (
                    <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
                      {error}
                    </div>
                  )}

                  <div className="space-y-6">
                    {takingInspection.items.map((item, index) => {
                      const result = inspectionResults[item.id];
                      return (
                        <div
                          key={item.id}
                          className={`p-4 rounded-xl border ${result?.isIssue ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}
                        >
                          <p className="font-medium text-slate-900 mb-3">
                            {index + 1}. {item.question}{" "}
                            {item.required && (
                              <span className="text-red-500">*</span>
                            )}
                          </p>

                          {item.type === "boolean" && (
                            <div className="flex space-x-3 mb-3">
                              <button
                                onClick={() => {
                                  handleUpdateResult(item.id, "answer", "Bien");
                                  handleUpdateResult(item.id, "isIssue", false);
                                }}
                                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium flex items-center justify-center transition-colors ${
                                  result?.answer === "Bien"
                                    ? "bg-green-100 border-green-500 text-green-700"
                                    : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                <CheckCircle className="w-4 h-4 mr-2" /> Bien
                              </button>
                              <button
                                onClick={() => {
                                  handleUpdateResult(item.id, "answer", "Mal");
                                  handleUpdateResult(item.id, "isIssue", true);
                                }}
                                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium flex items-center justify-center transition-colors ${
                                  result?.answer === "Mal"
                                    ? "bg-red-100 border-red-500 text-red-700"
                                    : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                <X className="w-4 h-4 mr-2" /> Mal
                              </button>
                              <button
                                onClick={() => {
                                  handleUpdateResult(item.id, "answer", "N/A");
                                  handleUpdateResult(item.id, "isIssue", false);
                                }}
                                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium flex items-center justify-center transition-colors ${
                                  result?.answer === "N/A"
                                    ? "bg-slate-200 border-slate-400 text-slate-800"
                                    : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                N/A
                              </button>
                            </div>
                          )}

                          {item.type === "text" && (
                            <input
                              type="text"
                              value={(result?.answer as string) || ""}
                              onChange={(e) =>
                                handleUpdateResult(
                                  item.id,
                                  "answer",
                                  e.target.value,
                                )
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-3"
                              placeholder="Escribe tu respuesta..."
                            />
                          )}

                          {item.type === "number" && (
                            <input
                              type="number"
                              value={(result?.answer as number) || ""}
                              onChange={(e) =>
                                handleUpdateResult(
                                  item.id,
                                  "answer",
                                  e.target.value,
                                )
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-3"
                              placeholder="0"
                            />
                          )}

                          {item.type === "visual_pressure" && (
                            <div className="flex justify-between items-center mb-3 space-x-2">
                              {["Baja", "Normal", "Alta"].map((label) => (
                                <button
                                  key={label}
                                  onClick={() => {
                                    handleUpdateResult(
                                      item.id,
                                      "answer",
                                      label,
                                    );
                                    handleUpdateResult(
                                      item.id,
                                      "isIssue",
                                      label !== "Normal",
                                    );
                                  }}
                                  className={`flex-1 py-3 px-2 rounded-lg border text-sm font-medium flex flex-col items-center justify-center transition-colors ${
                                    result?.answer === label
                                      ? label === "Normal"
                                        ? "bg-green-100 border-green-500 text-green-700"
                                        : "bg-red-100 border-red-500 text-red-700"
                                      : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                                  }`}
                                >
                                  <div
                                    className={`w-8 h-8 rounded-full mb-1 ${label === "Normal" ? "bg-green-500" : "bg-red-500"}`}
                                  />
                                  {label}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Show comment box if it's an issue or if they want to add a note */}
                          {(result?.isIssue || result?.answer !== "") && (
                            <div className="mt-3">
                              <textarea
                                value={result?.comment || ""}
                                onChange={(e) =>
                                  handleUpdateResult(
                                    item.id,
                                    "comment",
                                    e.target.value,
                                  )
                                }
                                placeholder={
                                  result?.isIssue
                                    ? "Describe el problema (Requerido)..."
                                    : "Comentario opcional..."
                                }
                                className={`w-full px-3 py-2 border rounded-lg text-sm ${result?.isIssue ? "border-red-300 focus:ring-red-500" : "border-slate-300 focus:ring-blue-500"}`}
                                rows={2}
                              />

                              {result?.isIssue && (
                                <div className="mt-3">
                                  <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Adjuntar fotos/videos del problema:
                                  </label>
                                  <input
                                    type="file"
                                    accept="image/*,video/*"
                                    multiple
                                    capture="environment"
                                    onChange={(e) =>
                                      handleAddPhoto(item.id, e.target.files)
                                    }
                                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                  />

                                  {/* Legacy single photo display */}
                                  {result.photoUrl && !result.photos && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSelectedImage(result.photoUrl!)
                                      }
                                      className="mt-2 w-full h-32 block"
                                    >
                                      <img
                                        src={result.photoUrl}
                                        alt="Problema"
                                        className="w-full h-full object-cover rounded-lg"
                                        referrerPolicy="no-referrer"
                                      />
                                    </button>
                                  )}

                                  {/* Multiple photos/videos display */}
                                  {result.photos &&
                                    result.photos.length > 0 && (
                                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {result.photos.map((photo, index) => (
                                          <div
                                            key={index}
                                            className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-50 aspect-square"
                                          >
                                            {photo.type === "image" ? (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setSelectedImage(photo.url)
                                                }
                                                className="w-full h-full block"
                                              >
                                                <img
                                                  src={photo.url}
                                                  alt={photo.name}
                                                  className="w-full h-full object-cover"
                                                  referrerPolicy="no-referrer"
                                                />
                                              </button>
                                            ) : (
                                              <video
                                                src={photo.url}
                                                className="w-full h-full object-cover"
                                              />
                                            )}
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleRemovePhoto(
                                                  item.id,
                                                  index,
                                                )
                                              }
                                              className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="space-y-6">
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <h4 className="font-medium text-blue-900 mb-2">
                      Resumen de Inspección
                    </h4>
                    <p className="text-sm text-blue-700">
                      Al firmar este documento, declaras que la inspección fue
                      realizada de manera veraz y que has reportado cualquier
                      anomalía encontrada.
                    </p>
                  </div>

                  {error && <p className="text-red-600 text-sm">{error}</p>}

                  <div className="bg-white p-4 rounded-lg border border-slate-200">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Evidencia Fotográfica (Opcional)
                    </label>
                    <p className="text-xs text-slate-500 mb-3">
                      Si lo deseas, puedes adjuntar fotos generales de la inspección.
                    </p>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      onChange={(e) => handleAddGeneralPhoto(e.target.files)}
                      className="hidden"
                      id="general-photo-upload"
                    />
                    <label
                      htmlFor="general-photo-upload"
                      className="inline-flex items-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 cursor-pointer font-medium text-sm transition-colors"
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      Añadir Fotos / Videos
                    </label>

                    {generalPhotosPreviews.length > 0 && (
                      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {generalPhotosPreviews.map((preview, index) => (
                          <div
                            key={index}
                            className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-50 aspect-video"
                          >
                            {preview.type === "video" ? (
                              <video
                                src={preview.url}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <img
                                src={preview.url}
                                alt={`Evidencia ${index + 1}`}
                                className="w-full h-full object-cover"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveGeneralPhoto(index)}
                              className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <SignerBanner className="mb-4" />

                  {profile?.savedSignatureUrl && (
                    <div className="mb-4">
                      <label className="flex items-center space-x-2 text-sm font-medium text-slate-700 bg-white p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors w-max shadow-sm">
                        <input
                          type="checkbox"
                          checked={usingSavedSignature}
                          onChange={(e) =>
                            setUsingSavedSignature(e.target.checked)
                          }
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500 rounded"
                        />
                        <span>
                          Utilizar mi firma electrónica guardada en mi perfil
                        </span>
                      </label>
                    </div>
                  )}

                  {!usingSavedSignature ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Firma Electrónica
                      </label>
                      <div className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 overflow-hidden">
                        <SignatureCanvas
                          ref={sigCanvas}
                          penColor="black"
                          canvasProps={{
                            className: "w-full h-48 cursor-crosshair",
                          }}
                        />
                      </div>
                      <button
                        onClick={() => sigCanvas.current?.clear()}
                        className="text-sm text-slate-500 hover:text-slate-700 underline mt-2"
                      >
                        Limpiar firma
                      </button>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Firma Guardada Seleccionada
                      </label>
                      <div className="border-2 border-slate-200 rounded-xl bg-white p-4 flex justify-center">
                        <img
                          src={profile!.savedSignatureUrl!}
                          alt="Firma Guardada"
                          className="h-32 object-contain"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end space-x-3 shrink-0">
              <button
                onClick={() =>
                  signing ? setSigning(false) : setTakingInspection(null)
                }
                className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                disabled={submitting}
              >
                {signing ? "Atrás" : "Cancelar"}
              </button>
              <button
                onClick={handleSubmitInspection}
                disabled={submitting}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center"
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Enviando...</>
                  : signing
                    ? "Firmar y Enviar"
                    : "Continuar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Deletion Confirmation Modal */}
      {templateToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              ¿Eliminar plantilla?
            </h3>
            <p className="text-slate-600 mb-6">
              Esta acción no se puede deshacer. ¿Estás seguro de que deseas
              eliminar esta plantilla?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setTemplateToDelete(null)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteTemplate}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <div>
                <h3 className="text-xl font-bold text-slate-800">
                  {previewTemplate.title}
                </h3>
                <p className="text-sm text-slate-500 mt-1">{previewTemplate.description}</p>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="text-slate-400 hover:text-slate-600 bg-white rounded-full p-2 shadow-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="font-semibold text-slate-700 flex items-center">
                  <ClipboardCheck className="w-4 h-4 mr-2 text-blue-600" />
                  Ítems a evaluar ({previewTemplate.items.length})
                </h4>
              </div>
              
              <div className="space-y-3">
                {previewTemplate.items.map((item, index) => (
                  <div key={item.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{item.question}</p>
                      {item.required && (
                        <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wider text-red-600 bg-red-100 px-2 py-0.5 rounded">
                          Obligatorio
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-white rounded-b-xl flex justify-end">
              <button
                onClick={() => setPreviewTemplate(null)}
                className="px-6 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium transition-colors"
              >
                Cerrar vista previa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Tabs */}
      {!isCreatingTemplate && (
        ["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "") ? (
        <div className="space-y-6">
          <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 hide-scrollbar">
            {([
              { id: "equipments", label: "Tablero de Equipos", short: "Equipos", icon: LayoutGrid, badge: 0 },
              { id: "templates", label: "Plantillas de Inspección", short: "Plantillas", icon: ClipboardList, badge: 0 },
              { id: "history", label: "Historial Global", short: "Historial", icon: History, badge: historyCounts.pending },
            ] as const).map((tab) => {
              const active = activeAdminTab === tab.id;
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveAdminTab(tab.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-2.5 text-[13px] font-semibold sm:gap-2 sm:px-4 sm:text-sm transition-colors ${
                    active ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                  }`}
                >
                  <TabIcon className="h-4 w-4 shrink-0" />
                  <span className="sm:hidden">{tab.short}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                  {tab.badge > 0 && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? "bg-white text-blue-700" : "bg-[#c23a4f] text-white"}`}>
                      {tab.badge}<span className="hidden sm:inline"> por firmar</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {activeAdminTab === "equipments" && (
            <div className="-mx-4 sm:mx-0">
              <Equipments
                onViewHistory={(eqName) => {
                  setInspectionSearchQuery(eqName);
                  setActiveAdminTab("history");
                }}
              />
            </div>
          )}

          {activeAdminTab === "templates" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-800">
                  Plantillas Disponibles
                </h2>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar checklist..."
                    value={templateSearchQuery}
                    onChange={(e) => setTemplateSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 w-full sm:w-64 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              {filteredTemplates.length === 0 ? (
                <div className="bg-white p-6 rounded-xl border border-slate-200 text-center text-slate-500">
                  {templateSearchQuery
                    ? "No se encontraron plantillas que coincidan con la búsqueda."
                    : "No hay plantillas creadas."}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900">
                            {template.title}
                          </h3>
                          {template.isGlobal && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">
                              <Globe className="w-3 h-3" />
                              Global
                            </span>
                          )}
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => setPreviewTemplate(template)}
                            className="text-slate-400 hover:text-blue-500"
                            title="Ver detalles"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {["employer", "super_admin", "gerencia"].includes(profile?.role || "") && (
                            <>
                              <button
                                onClick={() => handleEditTemplate(template)}
                                className="text-slate-400 hover:text-blue-500"
                                title="Editar plantilla"
                              >
                                <PenTool className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTemplate(template.id!)}
                                className="text-slate-400 hover:text-red-500"
                                title="Eliminar plantilla"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 mb-4 line-clamp-2">
                        {template.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded-md">
                          {template.items.length} ítems a revisar
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeAdminTab === "history" && (
            <div className="space-y-6">
              
              {/* Top Control Bar */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center">
                    <ClipboardCheck className="w-5 h-5 mr-2 text-blue-600" />
                    Historial de Inspecciones
                  </h2>
                  <p className="text-sm text-slate-500">
                    Revisa, filtra y firma las inspecciones de los equipos.
                  </p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
                  <div className="relative flex-1 sm:min-w-[280px]">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar equipo o trabajador"
                      value={inspectionSearchQuery}
                      onChange={(e) => setInspectionSearchQuery(e.target.value)}
                      className="pl-9 pr-4 py-2.5 w-full border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                    />
                  </div>
                  <select
                    value={historyGrouping}
                    onChange={(e) => setHistoryGrouping(e.target.value as any)}
                    className="border border-slate-300 rounded-xl text-sm bg-white py-2.5 pl-3 pr-8 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none transition-shadow min-w-[200px]"
                  >
                    <option value="none">Más recientes primero</option>
                    <option value="template">Agrupar por plantilla</option>
                    <option value="equipment">Agrupar por equipo</option>
                    <option value="status">Agrupar por estado</option>
                  </select>
                </div>
              </div>

              {/* Resumen: también sirve de filtro */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {([
                  { id: "all", label: "Todas", value: historyCounts.pending + historyCounts.reviewed, dot: "bg-slate-400" },
                  { id: "pending", label: "Por firmar", value: historyCounts.pending, dot: "bg-[#c23a4f]" },
                  { id: "issues", label: "Con problemas", value: historyCounts.issues, dot: "bg-amber-500" },
                  { id: "reviewed", label: "Revisadas", value: historyCounts.reviewed, dot: "bg-emerald-500" },
                ] as const).map((card) => {
                  const active = historyFilter === card.id;
                  return (
                    <button
                      key={card.id}
                      onClick={() => setHistoryFilter(card.id)}
                      className={`rounded-2xl border bg-white p-4 text-left transition-all hover:-translate-y-0.5 ${
                        active ? "border-blue-600 ring-2 ring-blue-600/15" : "border-slate-200"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <span className={`h-2.5 w-2.5 rounded-full ${card.dot}`} />
                        {card.label}
                      </span>
                      <span className="mt-1 block text-3xl font-bold tabular-nums text-slate-900">{card.value}</span>
                    </button>
                  );
                })}
              </div>

              {/* Firma: siempre con los datos del perfil */}
              <SignerBanner />

              {filteredInspections.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-6 pb-8 pt-4 text-center">
                  <img src="/ilustraciones/clipboard.png" alt="" className="brand-art h-36 w-auto" />
                  <h3 className="text-lg font-bold text-slate-900">
                    {inspectionSearchQuery || historyFilter !== "all"
                      ? "No hay inspecciones con ese filtro"
                      : "Aún no hay inspecciones"}
                  </h3>
                  <p className="mt-1 max-w-md text-sm text-slate-500">
                    {inspectionSearchQuery || historyFilter !== "all"
                      ? "Prueba con otro filtro o borra la búsqueda."
                      : "Cuando un trabajador llene un checklist, aparecerá aquí para que lo revises y firmes."}
                  </p>
                  {inspectionSearchQuery || historyFilter !== "all" ? (
                    <button
                      onClick={() => { setInspectionSearchQuery(""); setHistoryFilter("all"); }}
                      className="mt-4 rounded-full bg-blue-50 px-5 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      Ver todas
                    </button>
                  ) : (
                    <button
                      onClick={() => setActiveAdminTab("templates")}
                      className="mt-4 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Ver plantillas de inspección
                    </button>
                  )}
                </div>
              ) : historyGrouping === "none" ? (
                <>
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                  {filteredInspections.map(renderInspectionCard)}

                </div>
                {hasNextPage && (
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      className="px-6 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium transition-colors disabled:opacity-50"
                    >
                      {isFetchingNextPage ? "Cargando..." : "Cargar más"}
                    </button>
                  </div>
                )}

                </>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedInspections).map(
                    ([groupName, groupItems]) => {
                      const isExpanded = expandedGroups[groupName] !== false; // Default open
                      return (
                        <div
                          key={groupName}
                          className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm"
                        >
                          <button
                            onClick={() =>
                              setExpandedGroups((prev) => ({
                                ...prev,
                                [groupName]: !isExpanded,
                              }))
                            }
                            className="w-full px-5 py-4 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
                          >
                            <div className="flex items-center space-x-3">
                              <Folder className="w-5 h-5 text-blue-500" />
                              <h3 className="font-semibold text-slate-800 text-left">
                                {groupName}
                              </h3>
                              <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-1 rounded-full">
                                {groupItems.length}
                              </span>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-slate-400" />
                            )}
                          </button>
                          {isExpanded && (
                            <div className="p-4 bg-white border-t border-slate-200">
                              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                                {groupItems.map(renderInspectionCard)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    },
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Templates List */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-800">
                Plantillas Disponibles
              </h2>
              {profile?.role !== "worker" && (
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar checklist..."
                    value={templateSearchQuery}
                    onChange={(e) => setTemplateSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 w-full sm:w-64 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}
            </div>
            {filteredTemplates.length === 0 ? (
              <div className="bg-white p-6 rounded-xl border border-slate-200 text-center text-slate-500">
                {templateSearchQuery
                  ? "No se encontraron plantillas que coincidan con la búsqueda."
                  : "No hay plantillas creadas."}
              </div>
            ) : (
              filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900">
                        {template.title}
                      </h3>
                      {template.isGlobal && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">
                          <Globe className="w-3 h-3" />
                          Global
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setPreviewTemplate(template)}
                      className="text-slate-400 hover:text-blue-500"
                      title="Ver detalles"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-slate-600 mb-4 line-clamp-2">
                    {template.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {template.items.length} ítems a revisar
                    </span>
                    <button
                      onClick={() => handleStartInspection(template)}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      Iniciar Inspección
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Recent Inspections List */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-800">
                Mis Inspecciones
              </h2>
              {profile?.role !== "worker" && (
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar inspección..."
                    value={inspectionSearchQuery}
                    onChange={(e) => setInspectionSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 w-full sm:w-64 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}
            </div>
            {filteredInspections.length === 0 ? (
              <div className="bg-white p-6 rounded-xl border border-slate-200 text-center text-slate-500">
                {inspectionSearchQuery
                  ? "No se encontraron inspecciones que coincidan con la búsqueda."
                  : "No hay inspecciones registradas."}
              </div>
            ) : (
              <>
              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                {filteredInspections.map(renderInspectionCard)}

                {hasNextPage && (
                  <div className="col-span-full mt-6 flex justify-center">
                    <button
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      className="px-6 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium transition-colors disabled:opacity-50"
                    >
                      {isFetchingNextPage ? "Cargando..." : "Cargar más"}
                    </button>
                  </div>
                )}
              </div>
              </>
            )}
          </div>
        </div>
      ))}

      {/* Delete Inspection Modal */}
      {inspectionToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mb-4 mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-center text-slate-900 mb-2">
                Eliminar Inspección
              </h3>
              <p className="text-center text-slate-600 mb-6">
                ¿Estás seguro de que deseas eliminar esta inspección
                permanentemente? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setInspectionToDelete(null)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDeleteInspection}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prompt to generate Mandatory Register */}
      {showGenerateRegisterPrompt && completedInspectionData && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mb-4 mx-auto">
                <CheckCircle className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-center text-slate-900 mb-2">
                Inspección Guardada
              </h3>
              <p className="text-center text-slate-600 mb-6">
                ¿Deseas generar el Registro Obligatorio de Inspección Interna
                para el Ministerio de Trabajo basado en estos resultados?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowGenerateRegisterPrompt(false);
                    setCompletedInspectionData(null);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                >
                  No, gracias
                </button>
                <button
                  onClick={() => {
                    // Prepare initial data
                    const issues = completedInspectionData.results.filter(
                      (r: any) => r.isIssue,
                    );
                    const now = new Date();
                    const dateStr = now.toISOString().split("T")[0];
                    const timeStr = now
                      .toTimeString()
                      .split(" ")[0]
                      .substring(0, 5);

                    const initialData = {
                      inspectionDate: dateStr,
                      inspectionTime: timeStr,
                      inspectionType: "Planeada",
                      objective: completedInspectionData.templateTitle,
                      result: `Se inspeccionaron ${completedInspectionData.results.length} ítems. ${issues.length} no conformes.`,
                      unfavorableResultsCauses: issues
                        .map((i: any) => i.comment)
                        .join("; "),
                      conclusions:
                        issues.length > 0
                          ? "Se encontraron observaciones que requieren medidas correctivas."
                          : "Inspección completada sin observaciones.",
                      correctiveMeasures: issues.map((i: any) => ({
                        description: i.comment || i.question,
                        responsible: "",
                        executionDay: "",
                        executionMonth: "",
                        executionYear: "",
                        status: "pendiente",
                      })),
                    };

                    setRegisterInitialData(initialData);
                    setShowGenerateRegisterPrompt(false);
                    setShowRegisterModal(true);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                >
                  Sí, generar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory Register Modal */}
      {showRegisterModal && (
        <MandatoryRegisterModal
          type="inspection"
          initialData={registerInitialData}
          onClose={() => {
            setShowRegisterModal(false);
            setRegisterInitialData(null);
            setCompletedInspectionData(null);
          }}
        />
      )}

      {selectedInspectionToView && (
        <InspectionDetailsModal
          inspection={selectedInspectionToView}
          onClose={() => setSelectedInspectionToView(null)}
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
