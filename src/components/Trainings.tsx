import React, { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  Timestamp,
  arrayUnion,
  where,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { PageHeader } from "./ui/PageHeader";
import { Training, TrainingCompletion, QuizQuestion, Company } from "../types";
import { Loader2, BookOpen,
  Plus,
  Trash2,
  CheckCircle,
  ExternalLink,
  Video,
  FileText,
  Upload,
  X,
  PenTool,
  Users,
  HelpCircle,
  Download,
  Search,
  RefreshCw,
  Presentation,
  AlertCircle,
  Eye, } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { notifyAllWorkers, notifyAllEmployers } from "../utils/notifications";
import { generateTrainingCertificatePDF } from "../utils/pdfGenerator";
import { uploadToCloudinary } from "../utils/cloudinary";
import { exportToExcel } from "../utils/exportToExcel";
import { SignerBanner } from "./ui/SignerBanner";

export const Trainings: React.FC = () => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<"lista" | "dashboard">("lista");

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCompanyRuc, setSelectedCompanyRuc] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState("");
  const [targetArea, setTargetArea] = useState<string>("Todas");
  const [category, setCategory] = useState<string>("Seguridad");
  const [dueDate, setDueDate] = useState<string>("");
  const [validityMonths, setValidityMonths] = useState<number>(12);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Fetch unique areas from selected company or users
  const [companyAreas, setCompanyAreas] = useState<string[]>([]);
  useEffect(() => {
    if (profile?.role !== "employer" && profile?.role !== "super_admin" && profile?.role !== "gerencia") return;
    const ruc =
      selectedCompanyRuc || selectedCompany?.ruc || profile.companyRuc;
    if (!ruc) {
      setCompanyAreas([]);
      return;
    }

    // Try to fetch from companies first
    let areasFromCompany: string[] = [];
    const unsubscribeCompany = onSnapshot(query(collection(db, "companies"), where("ruc", "==", ruc)), (snapshot) => {
      if (!snapshot.empty) {
        const companyData = snapshot.docs[0].data() as Company;
        if (companyData.areas && companyData.areas.length > 0) {
          areasFromCompany = companyData.areas;
          setCompanyAreas([...companyData.areas].sort());
        }
      }
    });

    // Fallback/Enhancement by fetching from users
    const unsubscribeUsers = onSnapshot(query(collection(db, "users"), where("companyRuc", "==", ruc)), (snapshot) => {
      const uniqueAreas = new Set<string>();
      snapshot.forEach(doc => {
         const data = doc.data();
         if (data.department && data.department.trim() !== '') {
            uniqueAreas.add(data.department.trim());
         }
      });
      setCompanyAreas(prev => {
        const combined = Array.from(new Set([...prev, ...Array.from(uniqueAreas)]));
        return combined.sort();
      });
    });

    return () => {
       unsubscribeCompany();
       unsubscribeUsers();
    };
  }, [profile, selectedCompany, selectedCompanyRuc]);

  // Quiz creation state
  const [hasQuiz, setHasQuiz] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [passingScore, setPassingScore] = useState(1);

  // Signature state
  const [signingTrainingId, setSigningTrainingId] = useState<string | null>(
    null,
  );
  const [submittingSignature, setSubmittingSignature] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [trainingToDelete, setTrainingToDelete] = useState<string | null>(null);
  const sigCanvas = useRef<SignatureCanvas>(null);

  // Quiz taking state
  const [takingQuizFor, setTakingQuizFor] = useState<Training | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizPassed, setQuizPassed] = useState(false);
  const [quizScore, setQuizScore] = useState<number | null>(null);

  // View Completions state
  const [viewingCompletions, setViewingCompletions] = useState<Training | null>(
    null,
  );
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // In-Person Training State
  const [inPersonTraining, setInPersonTraining] = useState<Training | null>(
    null,
  );
  const [presentialWorkers, setPresentialWorkers] = useState<any[]>([]); // To store selected workers
  const [workersList, setWorkersList] = useState<any[]>([]); // Full list of available workers
  const [presentialSignaturesIndex, setPresentialSignaturesIndex] = useState<
    number | null
  >(null);
  const [presentialSignatures, setPresentialSignatures] = useState<
    Record<string, string>
  >({});

  // Material preview / presentation viewer state
  const [viewingMaterial, setViewingMaterial] = useState<{
    url: string;
    name: string;
    title: string;
    training?: Training;
  } | null>(null);
  const [safeBlobUrl, setSafeBlobUrl] = useState<string | null>(null);

  // Manage safe blob URL for PDFs to avoid browser blocking
  useEffect(() => {
    if (!viewingMaterial) {
      if (safeBlobUrl) {
        URL.revokeObjectURL(safeBlobUrl);
        setSafeBlobUrl(null);
      }
      return;
    }

    if (viewingMaterial.url.startsWith("data:")) {
      try {
        const parts = viewingMaterial.url.split(",");
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
        const binaryString = atob(parts[1]);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mime });
        const bUrl = URL.createObjectURL(blob);
        setSafeBlobUrl(bUrl);
        return () => {
          URL.revokeObjectURL(bUrl);
        };
      } catch (err) {
        console.error("Error creating safe blob url:", err);
      }
    } else {
      setSafeBlobUrl(viewingMaterial.url);
    }
  }, [viewingMaterial]);

  // Identify material type
  const getMaterialType = (fileName: string = "", url: string = "") => {
    const lowerName = (fileName || "").toLowerCase();
    const lowerUrl = (url || "").toLowerCase();

    if (
      lowerName.endsWith(".ppt") ||
      lowerName.endsWith(".pptx") ||
      lowerName.endsWith(".pps") ||
      lowerName.endsWith(".ppsx") ||
      lowerUrl.includes("powerpoint") ||
      lowerUrl.includes("presentation")
    ) {
      return "ppt";
    }
    if (lowerName.endsWith(".pdf") || lowerUrl.includes("application/pdf")) {
      return "pdf";
    }
    if (
      lowerName.endsWith(".doc") ||
      lowerName.endsWith(".docx") ||
      lowerUrl.includes("msword") ||
      lowerUrl.includes("wordprocessing")
    ) {
      return "word";
    }
    if (
      lowerName.endsWith(".xls") ||
      lowerName.endsWith(".xlsx") ||
      lowerName.endsWith(".csv") ||
      lowerUrl.includes("spreadsheet") ||
      lowerUrl.includes("excel")
    ) {
      return "excel";
    }
    if (
      lowerName.endsWith(".jpg") ||
      lowerName.endsWith(".jpeg") ||
      lowerName.endsWith(".png") ||
      lowerName.endsWith(".webp") ||
      lowerUrl.startsWith("data:image/")
    ) {
      return "image";
    }
    return "other";
  };

  // Safe file downloader for both data URIs and regular URLs
  const downloadMaterialFile = (url: string, name: string) => {
    try {
      const cleanName = name || "material_capacitacion";
      if (url.startsWith("data:")) {
        const parts = url.split(",");
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
        const binaryString = atob(parts[1]);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = cleanName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        toast.success(`Descarga iniciada: ${cleanName}`);
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = cleanName;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Descarga iniciada: ${cleanName}`);
      }
    } catch (err) {
      console.error("Error al descargar material:", err);
      toast.error("No se pudo descargar el archivo");
    }
  };

  const handleQuizSubmit = () => {
    if (!takingQuizFor || !takingQuizFor.quiz) return;

    // Check if all questions are answered
    const unanswered = takingQuizFor.quiz.questions.some(
      (q) => quizAnswers[q.id] === undefined,
    );
    if (unanswered) {
      setQuizError("Por favor, responde todas las preguntas antes de enviar.");
      return;
    }

    let correctCount = 0;
    takingQuizFor.quiz.questions.forEach((q) => {
      if (quizAnswers[q.id] === q.correctOptionIndex) {
        correctCount++;
      }
    });

    if (correctCount >= takingQuizFor.quiz.passingScore) {
      setQuizPassed(true);
      setQuizScore(correctCount);
      setQuizError(null);
    } else {
      setQuizError(
        `Obtuviste ${correctCount} de ${takingQuizFor.quiz.questions.length} correctas. El mínimo para aprobar es ${takingQuizFor.quiz.passingScore}. Por favor, repasa el material e inténtalo de nuevo.`,
      );
    }
  };

  const handleContinueToSign = () => {
    if (takingQuizFor) {
      setSigningTrainingId(takingQuizFor.id!);
      setTakingQuizFor(null);
    }
  };

  const handleAddQuestion = () => {
    setQuizQuestions([
      ...quizQuestions,
      {
        id: Date.now().toString(),
        text: "",
        options: ["", ""],
        correctOptionIndex: 0,
      },
    ]);
  };

  const handleUpdateQuestion = (
    id: string,
    field: keyof QuizQuestion,
    value: any,
  ) => {
    setQuizQuestions(
      quizQuestions.map((q) => (q.id === id ? { ...q, [field]: value } : q)),
    );
  };

  const handleUpdateOption = (
    questionId: string,
    optionIndex: number,
    value: string,
  ) => {
    setQuizQuestions(
      quizQuestions.map((q) => {
        if (q.id === questionId) {
          const newOptions = [...q.options];
          newOptions[optionIndex] = value;
          return { ...q, options: newOptions };
        }
        return q;
      }),
    );
  };

  const handleAddOption = (questionId: string) => {
    setQuizQuestions(
      quizQuestions.map((q) => {
        if (q.id === questionId) {
          return { ...q, options: [...q.options, ""] };
        }
        return q;
      }),
    );
  };

  const handleRemoveOption = (questionId: string, optionIndex: number) => {
    setQuizQuestions(
      quizQuestions.map((q) => {
        if (q.id === questionId) {
          const newOptions = q.options.filter((_, i) => i !== optionIndex);
          // Adjust correctOptionIndex if necessary
          let newCorrectIndex = q.correctOptionIndex;
          if (newCorrectIndex === optionIndex) newCorrectIndex = 0;
          else if (newCorrectIndex > optionIndex) newCorrectIndex--;

          return {
            ...q,
            options: newOptions,
            correctOptionIndex: newCorrectIndex,
          };
        }
        return q;
      }),
    );
  };

  const handleRemoveQuestion = (id: string) => {
    setQuizQuestions(quizQuestions.filter((q) => q.id !== id));
  };

  useEffect(() => {
    if (!profile) return;

    let q;
    if (["employer", "super_admin", "gerencia"].includes(profile.role || "")) {
      if (selectedCompany) {
        q = query(
          collection(db, "trainings"),
          where("companyRuc", "in", [selectedCompany.ruc, "ALL"]),
          orderBy("createdAt", "desc"),
        );
      } else {
        q = query(collection(db, "trainings"), orderBy("createdAt", "desc"));
      }
    } else if (profile.companyRuc) {
      q = query(
        collection(db, "trainings"),
        where("companyRuc", "in", [profile.companyRuc, "ALL"]),
        orderBy("createdAt", "desc"),
      );
    } else {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const trainingsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Training[];
        setTrainings(trainingsData);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "trainings");
        setLoading(false);
      },
    );

    // Fetch workers for in-person training mode
    const loadWorkers = async (rucToLoad: string) => {
      try {
        const qUsers = query(
          collection(db, "users"),
          where("companyRuc", "==", rucToLoad),
          where("role", "in", ["worker", "supervisor"]),
        );
        const userDocs = await getDocs(qUsers);
        setWorkersList(userDocs.docs.map((d) => ({ uid: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error cargando usuarios:", err);
      }
    };

    if (["employer", "super_admin", "gerencia"].includes(profile.role || "") && selectedCompany) {
      loadWorkers(selectedCompany.ruc);
    } else if (profile.companyRuc) {
      loadWorkers(profile.companyRuc);
    }

    return () => unsubscribe();
  }, [profile, selectedCompany]);

  const handleDownloadPDF = async (
    training: Training,
    completion: TrainingCompletion,
  ) => {
    setGeneratingPdfId(`${training.id}-${completion.userId}`);
    try {
      await generateTrainingCertificatePDF(training, completion);
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setGeneratingPdfId(null);
    }
  };

  const handleExportExcel = () => {
    // Generate a flat list of completions
    const data: any[] = [];
    trainings.forEach((training) => {
      if (training.completions) {
        training.completions.forEach((comp) => {
          data.push({
            "Curso / Capacitación": training.title,
            "Área Objetivo": training.targetArea || "Todas",
            Trabajador: comp.userName,
            "Fecha de Completado": comp.completedAt
              ? new Date(comp.completedAt.toDate()).toLocaleString()
              : "N/A",
            Modalidad: "VIRTUAL",
            "Firma Registrada": "SÍ",
          });
        });
      }
    });
    exportToExcel(data, "Reporte_Capacitaciones");
  };

  const startInPersonSignatures = () => {
    if (presentialWorkers.length === 0) {
      toast.error("Seleccione al menos un trabajador asistente.");
      return;
    }
    const workersWithoutDni = presentialWorkers.filter((w) => !w.dni);
    if (workersWithoutDni.length > 0) {
      toast.error(
        "Todos los trabajadores deben tener DNI. Faltan: " +
          workersWithoutDni.map((w) => w.name || w.displayName).join(", "),
      );
      return;
    }
    setPresentialSignaturesIndex(0);
    setPresentialSignatures({});
  };

  const handleNextInPersonSignature = () => {
    if (sigCanvas.current?.isEmpty()) {
      toast.error("Se requiere la firma del trabajador.");
      return;
    }

    const signature = sigCanvas.current
      ?.getTrimmedCanvas()
      .toDataURL("image/png");
    if (presentialSignaturesIndex !== null && signature) {
      const worker = presentialWorkers[presentialSignaturesIndex];
      setPresentialSignatures((prev) => ({ ...prev, [worker.uid]: signature }));
      sigCanvas.current.clear();

      if (presentialSignaturesIndex < presentialWorkers.length - 1) {
        setPresentialSignaturesIndex(presentialSignaturesIndex + 1);
      } else {
        submitInPersonCompletions({
          ...presentialSignatures,
          [worker.uid]: signature,
        });
      }
    }
  };

  const submitInPersonCompletions = async (
    finalSignatures: Record<string, string>,
  ) => {
    if (!inPersonTraining || !inPersonTraining.id) return;
    try {
      const trainingRef = doc(db, "trainings", inPersonTraining.id);

      const newCompletions: TrainingCompletion[] = presentialWorkers.map(
        (worker) => ({
          userId: worker.uid,
          userName: worker.name || worker.displayName,
          completedAt: Timestamp.now(),
          signatureUrl: finalSignatures[worker.uid],
          score: inPersonTraining.quiz
            ? inPersonTraining.quiz.passingScore
            : null,
          method: "in-person",
        }),
      );

      await updateDoc(trainingRef, {
        completions: arrayUnion(...newCompletions),
        completedBy: arrayUnion(...presentialWorkers.map((w) => w.uid)),
      });

      toast.success("Firmas presenciales registradas exitosamente.");

      setInPersonTraining(null);
      setPresentialWorkers([]);
      setPresentialSignaturesIndex(null);
      setPresentialSignatures({});
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `trainings/${inPersonTraining.id}`);
      toast.error("Error guardando las firmas.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !["employer", "super_admin", "gerencia"].includes(profile.role || "")) return;

    setUploading(true);
    try {
      let uploadedMaterialUrl = "";
      let uploadedMaterialName = "";

      if (file) {
        uploadedMaterialUrl = await uploadToCloudinary(file);
        uploadedMaterialName = file.name;
      }

      const ruc = selectedCompanyRuc || (["employer", "super_admin", "gerencia"].includes(profile.role || "") ? selectedCompany?.ruc : profile.companyRuc) || "";

      const newTraining: any = {
        title: title.trim(),
        description: description.trim(),
        createdBy: auth.currentUser?.uid || profile.uid,
        companyRuc: ruc || "",
        completedBy: [],
        completions: [],
        createdAt: Timestamp.now(),
        targetArea: targetArea || "Todas",
        category: category || "Seguridad",
        validityMonths: Number(validityMonths) || 12,
        status: "active",
      };

      if (dueDate) {
        newTraining.dueDate = Timestamp.fromDate(new Date(dueDate));
      }

      if (videoUrl && videoUrl.trim()) newTraining.videoUrl = videoUrl.trim();
      if (uploadedMaterialUrl) newTraining.materialUrl = uploadedMaterialUrl;
      if (uploadedMaterialName) newTraining.materialName = uploadedMaterialName;

      if (hasQuiz && quizQuestions.length > 0) {
        newTraining.quiz = {
          questions: quizQuestions,
          passingScore: Number(passingScore) || 1,
        };
      }

      await addDoc(collection(db, "trainings"), newTraining);
      toast.success("Capacitación creada exitosamente.");

      // Send notification to all workers safely without failing the whole operation if notification fails
      try {
        await notifyAllWorkers(
          "Nueva Capacitación",
          `Se ha publicado la capacitación: ${title}`,
          "/trainings",
          ruc,
        );
      } catch (notifError) {
        console.warn("Could not dispatch notifications to all workers:", notifError);
      }

      setTitle("");
      setDescription("");
      setVideoUrl("");
      setFile(null);
      setTargetArea("Todas");
      setCategory("Seguridad");
      setDueDate("");
      setValidityMonths(12);
      setHasQuiz(false);
      setQuizQuestions([]);
      setPassingScore(1);
      setIsAdding(false);
    } catch (error) {
      console.error("Error adding training:", error);
      handleFirestoreError(error, OperationType.CREATE, "trainings");
      toast.error(
        "Error al crear la capacitación: " +
          (error instanceof Error ? error.message : "Error de permisos"),
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (id: string) => {
    setTrainingToDelete(id);
  };

  const confirmDeleteTraining = async () => {
    if (!trainingToDelete || (profile?.role !== "employer" && profile?.role !== "super_admin" && profile?.role !== "gerencia")) return;
    try {
      await deleteDoc(doc(db, "trainings", trainingToDelete));
      toast.success("Capacitación eliminada exitosamente.");
      setTrainingToDelete(null);
    } catch (error) {
      console.error("Error deleting training:", error);
      handleFirestoreError(error, OperationType.DELETE, `trainings/${trainingToDelete}`);
      toast.error("Error al eliminar capacitación.");
    }
  };

  const handleSaveSignature = async () => {
    if (!profile || !signingTrainingId || !sigCanvas.current) return;
    setSignatureError(null);
    if (!profile.dni) {
      setSignatureError(
        "Es obligatorio registrar su DNI en su perfil ('Mi Perfil') para poder firmar digitalmente.",
      );
      return;
    }
    if (sigCanvas.current.isEmpty()) {
      setSignatureError("Por favor, dibuja tu firma antes de confirmar.");
      return;
    }

    setSubmittingSignature(true);
    try {
      // Get signature as base64 string
      const signatureDataUrl = sigCanvas.current
        .getCanvas()
        .toDataURL("image/png");

      // Upload to Cloudinary
      const signatureUrl = await uploadToCloudinary(signatureDataUrl);

      const completion: TrainingCompletion = {
        userId: profile.uid,
        userName: profile.displayName || profile.email,
        userDni: profile.dni || "No registrado",
        userEmail: profile.email,
        signatureUrl,
        signatureBase64: signatureDataUrl,
        completedAt: Timestamp.now(),
      };

      if (quizScore !== null) {
        completion.score = quizScore;
        completion.passed = true;
      }

      await updateDoc(doc(db, "trainings", signingTrainingId), {
        completedBy: arrayUnion(profile.uid),
        completions: arrayUnion(completion),
      });

      // Notify employers
      const training = trainings.find((t) => t.id === signingTrainingId);
      if (training) {
        await notifyAllEmployers(
          "Capacitación Completada",
          `El trabajador ${profile?.displayName || profile?.email} ha completado la capacitación: ${training.title}`,
          "/trainings",
          profile?.companyRuc,
        );
      }

      setSigningTrainingId(null);
      setQuizScore(null);
    } catch (error) {
      console.error("Error saving signature:", error);
      handleFirestoreError(error, OperationType.UPDATE, `trainings/${signingTrainingId}`);
      setSignatureError(
        "Hubo un error al guardar tu firma. Por favor, intenta de nuevo.",
      );
    } finally {
      setSubmittingSignature(false);
    }
  };

  const filteredTrainings = trainings.filter((training) => {
    // 1. Filter by targetArea if user is a worker
    if (profile?.role === "worker") {
      const trainingArea = training.targetArea || "Todas";
      const userArea = profile.department || "";
      if (
        trainingArea !== "Todas" &&
        trainingArea.toLowerCase() !== userArea.toLowerCase()
      ) {
        return false;
      }
    }

    // 2. Filter by search term
    return (
      training.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      training.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  if (loading) {
    return (
      <div className="text-center py-10 text-slate-500">
        Cargando capacitaciones...
      </div>
    );
  }

  return (
    <div className="w-full relative">
      <PageHeader
        title="Capacitaciones"
        description="Gestión de capacitaciones y entrenamientos"
        icon={BookOpen}
        color="sky"
        actions={
          !isAdding && (
            <>
              {profile?.role !== "worker" && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-100" />
                  <input
                    type="text"
                    placeholder="Buscar capacitación..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-black/20 border border-white/20 text-white placeholder:text-sky-100/70 rounded-lg focus:ring-2 focus:ring-white/30 focus:border-white/30 text-sm w-full sm:w-64 backdrop-blur-sm"
                  />
                </div>
              )}
              {["employer", "supervisor", "super_admin", "gerencia"].includes(
                profile?.role || "",
              ) && (
                <button
                  onClick={handleExportExcel}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-white/15 text-white rounded-lg hover:bg-white/25 transition font-medium text-sm border border-white/30 shadow-sm"
                  title="Descargar Reporte Excel"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Exportar Excel</span>
                </button>
              )}
              {["employer", "super_admin", "gerencia"].includes(profile?.role || "") && (
                <button
                  onClick={() => setIsAdding(!isAdding)}
                  className="flex items-center justify-center px-4 py-2 bg-white text-sky-700 font-medium rounded-lg hover:bg-sky-50 transition-colors whitespace-nowrap shadow-sm"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Nueva Capacitación
                </button>
              )}
            </>
          )
        }
      />

      {isAdding && ["employer", "super_admin", "gerencia"].includes(profile?.role || "") && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Crear Nueva Capacitación
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {profile?.role === "super_admin" && (
              <div className="flex items-center space-x-2 bg-sky-50 p-3 rounded-lg border border-sky-100 mb-4">
                <input
                  type="checkbox"
                  id="global-post"
                  checked={selectedCompanyRuc === "ALL"}
                  onChange={(e) => setSelectedCompanyRuc(e.target.checked ? "ALL" : (selectedCompany?.ruc || ""))}
                  className="rounded border-sky-300 text-sky-600 focus:ring-sky-500 h-4 w-4"
                />
                <label htmlFor="global-post" className="text-sm font-semibold text-sky-900">
                  Publicar para todas las empresas (Global)
                </label>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                ¿A qué área va dirigido?
              </label>
              <select
                value={targetArea}
                onChange={(e) => setTargetArea(e.target.value)}
                className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                required
              >
                <option value="Todas">Todas las áreas</option>
                {companyAreas.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Selecciona "Todas" si es para toda la empresa, o un área
                específica.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Categoría
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
              >
                <option value="Seguridad">Seguridad</option>
                <option value="Salud Ocupacional">Salud Ocupacional</option>
                <option value="Medio Ambiente">Medio Ambiente</option>
                <option value="Desarrollo">Desarrollo Profesional</option>
                <option value="Otro">Otro</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Fecha de Vigencia / Vencimiento (Opcional)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Validez en Meses
                </label>
                <input
                  type="number"
                  min="0"
                  value={validityMonths}
                  onChange={(e) => setValidityMonths(Number(e.target.value))}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Título
              </label>
              <input
                type="text"
                required
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej. Uso correcto de EPP"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Descripción
              </label>
              <textarea
                required
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="Detalles sobre la capacitación..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  URL del Video (opcional)
                </label>
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="https://youtube.com/..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Material de Apoyo (PPT, PDF, Word, etc.)
                </label>
                <div className="relative">
                  <input
                    type="file"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="file-upload"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.pps,.ppsx,.xls,.xlsx,.png,.jpg,.jpeg"
                  />
                  <label
                    htmlFor="file-upload"
                    className="flex items-center justify-between w-full px-3 py-2 border border-slate-300 border-dashed rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center min-w-0 mr-2">
                      <Upload className="w-5 h-5 mr-2 text-slate-400 shrink-0" />
                      <span className="text-sm text-slate-600 truncate">
                        {file ? file.name : "Seleccionar archivo (PPT, PDF, Word)..."}
                      </span>
                    </div>
                    {file && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium shrink-0">
                        {(file.size / 1024).toFixed(0)} KB
                      </span>
                    )}
                  </label>
                </div>
                {file && (
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center">
                      {file.name.toLowerCase().endsWith(".ppt") || file.name.toLowerCase().endsWith(".pptx") ? (
                        <>
                          <Presentation className="w-3.5 h-3.5 mr-1 text-amber-600 inline" />
                          <span className="text-amber-700 font-medium">Presentación PowerPoint</span>
                        </>
                      ) : file.name.toLowerCase().endsWith(".pdf") ? (
                        <>
                          <FileText className="w-3.5 h-3.5 mr-1 text-red-600 inline" />
                          <span className="text-red-700 font-medium">Documento PDF</span>
                        </>
                      ) : (
                        <>
                          <FileText className="w-3.5 h-3.5 mr-1 text-blue-600 inline" />
                          <span className="text-blue-700 font-medium">Documento Adjunto</span>
                        </>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="text-red-500 hover:text-red-700 font-medium ml-2"
                    >
                      Quitar archivo
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 mt-4">
              <div className="flex items-center justify-between mb-4">
                <label className="flex items-center text-sm font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasQuiz}
                    onChange={(e) => setHasQuiz(e.target.checked)}
                    className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                  />
                  Incluir Examen de Evaluación
                </label>
              </div>

              {hasQuiz && (
                <div className="space-y-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <div className="flex justify-between items-center">
                    <h3 className="text-md font-medium text-slate-800">
                      Preguntas del Examen
                    </h3>
                    <button
                      type="button"
                      onClick={handleAddQuestion}
                      className="text-sm flex items-center text-blue-600 hover:text-blue-800"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Agregar Pregunta
                    </button>
                  </div>

                  {quizQuestions.map((q, qIndex) => (
                    <div
                      key={q.id}
                      className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm relative"
                    >
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(q.id)}
                        className="absolute top-4 right-4 text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="mb-4 pr-8">
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Pregunta {qIndex + 1}
                        </label>
                        <input
                          type="text"
                          required
                          value={q.text}
                          onChange={(e) =>
                            handleUpdateQuestion(q.id, "text", e.target.value)
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Ej. ¿Qué tipo de extintor se usa para fuegos eléctricos?"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">
                          Opciones (Selecciona la correcta)
                        </label>
                        {q.options.map((opt, optIndex) => (
                          <div
                            key={optIndex}
                            className="flex items-center space-x-2"
                          >
                            <input
                              type="radio"
                              name={`correct-${q.id}`}
                              checked={q.correctOptionIndex === optIndex}
                              onChange={() =>
                                handleUpdateQuestion(
                                  q.id,
                                  "correctOptionIndex",
                                  optIndex,
                                )
                              }
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300"
                            />
                            <input
                              type="text"
                              required
                              value={opt}
                              onChange={(e) =>
                                handleUpdateOption(
                                  q.id,
                                  optIndex,
                                  e.target.value,
                                )
                              }
                              className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                              placeholder={`Opción ${optIndex + 1}`}
                            />
                            {q.options.length > 2 && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveOption(q.id, optIndex)
                                }
                                className="text-slate-400 hover:text-red-500 p-1"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => handleAddOption(q.id)}
                          className="text-xs flex items-center text-blue-600 hover:text-blue-800 mt-2"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Agregar Opción
                        </button>
                      </div>
                    </div>
                  ))}

                  {quizQuestions.length > 0 && (
                    <div className="flex items-center space-x-2 mt-4">
                      <label className="text-sm font-medium text-slate-700">
                        Puntaje mínimo para aprobar (preguntas correctas):
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={quizQuestions.length}
                        value={passingScore}
                        onChange={(e) =>
                          setPassingScore(parseInt(e.target.value) || 1)
                        }
                        className="w-20 px-2 py-1 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                      <span className="text-sm text-slate-500">
                        de {quizQuestions.length}
                      </span>
                    </div>
                  )}

                  {quizQuestions.length === 0 && (
                    <p className="text-sm text-slate-500 italic">
                      Agrega al menos una pregunta para el examen.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800"
                disabled={uploading}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={uploading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
              >
                {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Subiendo...</> : "Publicar Capacitación"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg mb-6 w-max">
        <button
          onClick={() => setActiveTab("lista")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "lista"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Portal de Capacitaciones
        </button>
        {(profile?.role === "employer" || profile?.role === "super_admin" || profile?.role === "gerencia") && (
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "dashboard"
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Dashboard de Cumplimiento
          </button>
        )}
      </div>

      {activeTab === "lista" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredTrainings.length === 0 ? (
            <div className="col-span-full text-center py-10 bg-white rounded-xl border border-slate-200 text-slate-500">
              No se encontraron capacitaciones.
            </div>
          ) : (
            filteredTrainings.map((training) => {
              const isCompleted = training.completedBy?.includes(
                profile?.uid || "",
              );
              const completionCount = training.completedBy?.length || 0;
              
              // Expiration Logic
              let daysLeft = null;
              if (training.dueDate) {
                const dueTime = new Date(training.dueDate.toDate()).getTime();
                daysLeft = Math.ceil((dueTime - Date.now()) / (1000 * 3600 * 24));
              }

              return (
                <div
                  key={training.id}
                  className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col"
                >
                  <div className="p-6 flex flex-col flex-grow">
                    <div className="flex justify-between items-start mb-2">
                       <div className="flex flex-wrap gap-2">
                         <span className="text-xs font-semibold bg-blue-50 text-blue-600 px-2 py-1 rounded">
                           {training.category || "General"}
                         </span>
                         {training.targetArea && training.targetArea !== "Todas" && (
                           <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-1 rounded flex items-center">
                             <Users className="w-3 h-3 mr-1" />
                             {training.targetArea}
                           </span>
                         )}
                       </div>
                      {["employer", "super_admin", "gerencia"].includes(profile?.role || "") && (
                        <button
                          onClick={() => handleDelete(training.id!)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                          title="Eliminar capacitación"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    
                    <h3 className="text-xl font-bold text-slate-900 mb-2">
                      {training.title}
                    </h3>
                    
                    <p className="text-slate-600 text-sm mb-4 line-clamp-3 flex-grow">
                      {training.description}
                    </p>

                    <div className="flex flex-wrap gap-2 mb-6">
                      {training.videoUrl && (
                        <a
                          href={training.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg text-sm font-medium"
                        >
                          <Video className="w-4 h-4 mr-2" />
                          Video
                        </a>
                      )}
                      {training.materialUrl && (() => {
                        const mType = getMaterialType(training.materialName, training.materialUrl);
                        const isPpt = mType === "ppt";
                        const isPdf = mType === "pdf";
                        const isWord = mType === "word";

                        return (
                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() =>
                                setViewingMaterial({
                                  url: training.materialUrl!,
                                  name: training.materialName || (isPpt ? "Diapositivas PPT" : "Material de Apoyo"),
                                  title: training.title,
                                  training,
                                })
                              }
                              className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                                isPpt
                                  ? "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200"
                                  : isPdf
                                  ? "bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                                  : isWord
                                  ? "bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                                  : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                              }`}
                              title={isPpt ? "Ver diapositivas de la capacitación" : "Ver material adjunto"}
                            >
                              {isPpt ? (
                                <Presentation className="w-4 h-4 mr-2 text-amber-600 shrink-0" />
                              ) : isPdf ? (
                                <FileText className="w-4 h-4 mr-2 text-red-600 shrink-0" />
                              ) : isWord ? (
                                <FileText className="w-4 h-4 mr-2 text-blue-600 shrink-0" />
                              ) : (
                                <FileText className="w-4 h-4 mr-2 text-slate-600 shrink-0" />
                              )}
                              <span className="truncate max-w-[130px] sm:max-w-[200px]">
                                {training.materialName || (isPpt ? "Diapositivas PPT" : "Material")}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadMaterialFile(
                                  training.materialUrl!,
                                  training.materialName || (isPpt ? "presentacion.pptx" : "material")
                                );
                              }}
                              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
                              title="Descargar archivo directamente a su equipo"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })()}
                      {training.quiz && training.quiz.questions.length > 0 && (
                         <span className="flex items-center text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg text-sm font-medium">
                           <HelpCircle className="w-4 h-4 mr-2" />
                           Evaluación Integrada
                         </span>
                      )}
                    </div>
                  </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-slate-50 border-t border-slate-100 gap-4 mt-auto">
                      <div className="text-sm text-slate-500">
                        {["employer", "supervisor", "super_admin", "gerencia"].includes(
                          profile?.role || "",
                        ) ? (
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => setViewingCompletions(training)}
                              className="flex items-center text-blue-600 hover:text-blue-800 font-medium"
                            >
                              <Users className="w-4 h-4 mr-1" />
                              Ver {completionCount} trabajador(es) que completaron
                            </button>
                            <button
                              onClick={() => setInPersonTraining(training)}
                              className="flex items-center text-emerald-600 hover:text-emerald-800 font-medium"
                            >
                              <PenTool className="w-4 h-4 mr-1" />
                              Pase Lista Presencial (Recoger Firmas)
                            </button>
                            {daysLeft !== null && (
                               <span className={`text-xs font-semibold px-2 py-1 rounded w-max mt-1 ${daysLeft < 0 ? 'bg-red-100 text-red-700' : daysLeft <= 14 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-700'}`}>
                                 {daysLeft < 0 ? `Vencida hace ${Math.abs(daysLeft)} días` : `Vence en ${daysLeft} días`}
                               </span>
                            )}
                          </div>
                        ) : (
                          <span className="flex items-center">
                            {isCompleted ? (
                              <div className="flex flex-col gap-1">
                                <span className="text-green-600 flex items-center font-medium">
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Completado y Firmado
                                </span>
                                {daysLeft !== null && daysLeft < 0 && (
                                   <span className="text-red-500 font-medium flex items-center text-xs mt-1">
                                      <RefreshCw className="w-3 h-3 mr-1" /> Requiere Renovación (Vencida)
                                   </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1">
                                <span className="text-orange-500">
                                  Pendiente de completar
                                </span>
                                {daysLeft !== null && (
                                   <span className={`text-xs font-semibold px-2 py-1 rounded w-max mt-1 ${daysLeft < 0 ? 'bg-red-100 text-red-700' : daysLeft <= 14 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-700'}`}>
                                     {daysLeft < 0 ? `Vencida hace ${Math.abs(daysLeft)} días` : `Vence en ${daysLeft} días`}
                                   </span>
                                )}
                              </div>
                            )}
                          </span>
                        )}
                      </div>

                    {profile?.role === "worker" && !isCompleted && (
                      <button
                        onClick={() => {
                          if (
                            training.quiz &&
                            training.quiz.questions.length > 0
                          ) {
                            setTakingQuizFor(training);
                            setQuizAnswers({});
                            setQuizError(null);
                            setQuizPassed(false);
                          } else {
                            setSigningTrainingId(training.id!);
                          }
                        }}
                        className="flex items-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                      >
                        {training.quiz && training.quiz.questions.length > 0 ? (
                          <>
                            <HelpCircle className="w-4 h-4 mr-2" />
                            Tomar Examen
                          </>
                        ) : (
                          <>
                            <PenTool className="w-4 h-4 mr-2" />
                            Confirmar Lectura y Firmar
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
            );
          })
        )}
        </div>
      )}

      {activeTab === "dashboard" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 overflow-hidden">
           <h2 className="text-xl font-bold text-slate-800 mb-6">Métricas y Cumplimiento de Capacitaciones</h2>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
             <div className="bg-blue-50 rounded-lg p-4">
               <h3 className="text-blue-800 text-sm font-medium">Total Capacitaciones</h3>
               <p className="text-3xl font-bold text-blue-900 mt-1">{trainings.filter(t => profile.role === "super_admin" || t.companyRuc === (selectedCompany?.ruc || profile.companyRuc)).length}</p>
             </div>
             <div className="bg-emerald-50 rounded-lg p-4">
               <h3 className="text-emerald-800 text-sm font-medium">Completadas Total</h3>
               <p className="text-3xl font-bold text-emerald-900 mt-1">{trainings.filter(t => profile.role === "super_admin" || t.companyRuc === (selectedCompany?.ruc || profile.companyRuc)).reduce((acc, curr) => acc + (curr.completedBy?.length || 0), 0)}</p>
             </div>
             <div className="bg-amber-50 rounded-lg p-4">
               <h3 className="text-amber-800 text-sm font-medium">Tasa de Aprobación Global</h3>
               <p className="text-3xl font-bold text-amber-900 mt-1">
                 {(() => {
                   const trs = trainings.filter(t => profile.role === "super_admin" || t.companyRuc === (selectedCompany?.ruc || profile.companyRuc));
                   let totalC = 0; let totalP = 0;
                   trs.forEach(t => { if (t.completions) { t.completions.forEach(c => { totalC++; if(c.passed !== false) totalP++; }) } });
                   return totalC > 0 ? Math.round((totalP / totalC) * 100) + '%' : '0%';
                 })()}
               </p>
             </div>
           </div>

           <div className="overflow-x-auto">
             <table className="min-w-full text-left text-sm whitespace-nowrap">
               <thead className="lowercase bg-slate-50 text-slate-500 uppercase tracking-wider">
                 <tr>
                   <th className="px-4 py-3 font-medium">Capacitación</th>
                   <th className="px-4 py-3 font-medium">Categoría</th>
                   <th className="px-4 py-3 font-medium">Vencimiento</th>
                   <th className="px-4 py-3 font-medium text-right">Completados</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100 pb-10">
                 {trainings.filter(t => profile.role === "super_admin" || t.companyRuc === (selectedCompany?.ruc || profile.companyRuc)).map(t => {
                   let dLeft = null;
                   if (t.dueDate) dLeft = Math.ceil((new Date(t.dueDate.toDate()).getTime() - Date.now()) / (1000 * 3600 * 24));
                   
                   return (
                   <tr key={t.id} className="hover:bg-slate-50">
                     <td className="px-4 py-3 font-medium text-slate-900 truncate max-w-xs">{t.title}</td>
                     <td className="px-4 py-3 text-slate-600">{t.category || "General"}</td>
                     <td className="px-4 py-3">
                       {dLeft !== null ? (
                         <span className={`px-2 py-0.5 rounded text-xs font-semibold ${dLeft < 0 ? 'bg-red-100 text-red-700' : dLeft <= 14 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                           {dLeft < 0 ? 'Vencida' : `${dLeft} días`}
                         </span>
                       ) : <span className="text-slate-400">Sin vencimiento</span>}
                     </td>
                     <td className="px-4 py-3 text-right">
                       <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold text-xs">
                         {t.completedBy?.length || 0}
                       </span>
                     </td>
                   </tr>
                 )})}
               </tbody>
             </table>
           </div>
        </div>
      )}

      {/* In-Person Training Modal */}
      {inPersonTraining && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="text-lg font-bold text-slate-800 flex items-center">
                <Users className="w-5 h-5 mr-2 text-emerald-600" />
                Control de Asistencia Presencial
              </h3>
              <button
                onClick={() => {
                  setInPersonTraining(null);
                  setPresentialWorkers([]);
                  setPresentialSignaturesIndex(null);
                  setPresentialSignatures({});
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {presentialSignaturesIndex === null ? (
                <>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h4 className="font-semibold text-slate-800 mb-2">
                      1. Agregar Asistentes
                    </h4>
                    <p className="text-sm text-slate-600 mb-4">
                      Seleccione a los trabajadores que están presentes en la
                      charla: "{inPersonTraining.title}"
                    </p>
                    <select
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 bg-white mb-4"
                      onChange={(e) => {
                        const w = workersList.find(
                          (w) => w.uid === e.target.value,
                        );
                        if (
                          w &&
                          !presentialWorkers.find((sw) => sw.uid === w.uid)
                        ) {
                          // Prevent adding if already completed via other means
                          if (!inPersonTraining.completedBy.includes(w.uid)) {
                            setPresentialWorkers([
                              ...presentialWorkers,
                              { uid: w.uid, name: w.displayName },
                            ]);
                          } else {
                            toast.error(
                              "Este trabajador ya completó esta capacitación anteriormente.",
                            );
                          }
                        }
                        e.target.value = "";
                      }}
                    >
                      <option value="">
                        -- Buscar trabajador para agregar --
                      </option>
                      {workersList.map((w) => (
                        <option key={w.uid} value={w.uid}>
                          {w.displayName}
                        </option>
                      ))}
                    </select>

                    {presentialWorkers.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-4">
                        {presentialWorkers.map((w) => (
                          <div
                            key={w.uid}
                            className="flex items-center bg-white border border-slate-200 rounded-full px-3 py-1"
                          >
                            <span className="text-sm font-medium text-slate-700">
                              {w.name}
                            </span>
                            <button
                              onClick={() =>
                                setPresentialWorkers(
                                  presentialWorkers.filter(
                                    (sw) => sw.uid !== w.uid,
                                  ),
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
                  <div className="flex justify-end">
                    <button
                      onClick={startInPersonSignatures}
                      className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700"
                    >
                      Continuar a Firma ({presentialWorkers.length} asistentes)
                    </button>
                  </div>
                </>
              ) : (
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 text-center">
                  <h4 className="text-lg font-bold text-emerald-800 mb-2">
                    Firma de Asistencia ({presentialSignaturesIndex + 1} de{" "}
                    {presentialWorkers.length})
                  </h4>
                  <p className="text-slate-700 font-medium mb-4">
                    Por favor, pase el dispositivo a: <br />
                    <span className="text-xl font-bold text-emerald-700">
                      {presentialWorkers[presentialSignaturesIndex].name}
                    </span>
                  </p>
                  <p className="text-sm text-slate-600 italic mb-4">
                    Declaro haber recibido y comprendido la capacitación
                    brindada.
                  </p>
                  <div className="border border-emerald-300 bg-white rounded-xl overflow-hidden shadow-inner mx-auto max-w-lg">
                    <SignatureCanvas
                      ref={sigCanvas}
                      canvasProps={{ className: "w-full h-40 sm:h-64" }}
                    />
                  </div>
                  <div className="flex justify-between items-center max-w-lg mx-auto mt-4">
                    <button
                      type="button"
                      onClick={() => sigCanvas.current?.clear()}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition-colors"
                    >
                      Limpiar firma
                    </button>
                    <button
                      onClick={handleNextInPersonSignature}
                      className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-sm"
                    >
                      {presentialSignaturesIndex < presentialWorkers.length - 1
                        ? "Guardar y Siguiente"
                        : "Finalizar Charla"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quiz Modal */}
      {takingQuizFor && takingQuizFor.quiz && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="text-lg font-bold text-slate-800 flex items-center">
                <HelpCircle className="w-5 h-5 mr-2 text-blue-600" />
                Examen de Evaluación
              </h3>
              <button
                onClick={() => setTakingQuizFor(null)}
                className="text-slate-400 hover:text-slate-600"
                title="Cerrar"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {takingQuizFor.materialUrl && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-2 truncate mr-2">
                    <Presentation className="w-5 h-5 text-amber-600 shrink-0" />
                    <span className="text-xs text-amber-900 font-medium truncate">
                      {takingQuizFor.materialName || "Material / Diapositivas de la capacitación"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setViewingMaterial({
                        url: takingQuizFor.materialUrl!,
                        name: takingQuizFor.materialName || "Material",
                        title: takingQuizFor.title,
                        training: takingQuizFor,
                      })
                    }
                    className="text-xs bg-white text-amber-800 hover:bg-amber-100 font-bold px-3 py-1.5 rounded-lg border border-amber-300 shrink-0 shadow-xs"
                  >
                    Revisar Diapositivas
                  </button>
                </div>
              )}

              {!quizPassed ? (
                <>
                  <p className="text-slate-600 mb-6">
                    Para completar esta capacitación, debes aprobar el siguiente
                    examen. Puntaje mínimo:{" "}
                    <span className="font-bold">
                      {takingQuizFor.quiz.passingScore}
                    </span>{" "}
                    de {takingQuizFor.quiz.questions.length} correctas.
                  </p>

                  {quizError && (
                    <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg">
                      {quizError}
                    </div>
                  )}

                  <div className="space-y-8">
                    {takingQuizFor.quiz.questions.map((q, qIndex) => (
                      <div
                        key={q.id}
                        className="bg-slate-50 p-5 rounded-xl border border-slate-200"
                      >
                        <h4 className="font-medium text-slate-900 mb-4">
                          {qIndex + 1}. {q.text}
                        </h4>
                        <div className="space-y-3">
                          {q.options.map((opt, optIndex) => (
                            <label
                              key={optIndex}
                              className="flex items-start p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
                            >
                              <input
                                type="radio"
                                name={`question-${q.id}`}
                                checked={quizAnswers[q.id] === optIndex}
                                onChange={() =>
                                  setQuizAnswers({
                                    ...quizAnswers,
                                    [q.id]: optIndex,
                                  })
                                }
                                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300"
                              />
                              <span className="ml-3 text-slate-700">{opt}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">
                    ¡Examen Aprobado!
                  </h3>
                  <p className="text-slate-600 mb-6">
                    Has respondido correctamente {quizScore} de{" "}
                    {takingQuizFor.quiz.questions.length} preguntas.
                  </p>
                  <button
                    onClick={handleContinueToSign}
                    className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Continuar a Firmar
                  </button>
                </div>
              )}
            </div>

            {!quizPassed && (
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end space-x-3 shrink-0">
                <button
                  onClick={() => setTakingQuizFor(null)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleQuizSubmit}
                  className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Enviar Respuestas
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Signature Modal */}
      {signingTrainingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="text-lg font-bold text-slate-800 flex items-center">
                <PenTool className="w-5 h-5 mr-2 text-blue-600" />
                Firma Electrónica Requerida
              </h3>
              <button
                onClick={() => setSigningTrainingId(null)}
                className="text-slate-400 hover:text-slate-600"
                title="Cerrar"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <p className="text-sm text-slate-600 mb-4">
                Al firmar este documento, confirmas que has leído, visto y
                comprendido el material de esta capacitación.
              </p>

              {(() => {
                const tr = trainings.find((t) => t.id === signingTrainingId);
                if (tr && tr.materialUrl) {
                  return (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                      <div className="flex items-center space-x-2 truncate mr-2">
                        <Presentation className="w-5 h-5 text-amber-600 shrink-0" />
                        <span className="text-xs text-amber-900 font-medium truncate">
                          {tr.materialName || "Material / Diapositivas"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setViewingMaterial({
                            url: tr.materialUrl!,
                            name: tr.materialName || "Material",
                            title: tr.title,
                            training: tr,
                          })
                        }
                        className="text-xs bg-white text-amber-800 hover:bg-amber-100 font-bold px-3 py-1.5 rounded-lg border border-amber-300 shrink-0 shadow-xs"
                      >
                        Revisar Diapositivas
                      </button>
                    </div>
                  );
                }
                return null;
              })()}

              <SignerBanner className="mb-4" />

              {signatureError && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-md text-sm">
                  {signatureError}
                </div>
              )}

              <div className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 mb-4 overflow-hidden touch-none">
                <SignatureCanvas
                  ref={sigCanvas}
                  penColor="black"
                  canvasProps={{ className: "w-full h-48 cursor-crosshair" }}
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <button
                onClick={() => sigCanvas.current?.clear()}
                className="text-sm text-slate-500 hover:text-slate-700 underline"
              >
                Limpiar firma
              </button>
              <div className="space-x-3">
                <button
                  onClick={() => setSigningTrainingId(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                  disabled={submittingSignature}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveSignature}
                  disabled={submittingSignature}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submittingSignature ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Guardando...</> : "Firmar y Completar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Completions Modal (For Employers) */}
      {viewingCompletions && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">
                Asistencia: {viewingCompletions.title}
              </h3>
              <button
                onClick={() => setViewingCompletions(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {!viewingCompletions.completions ||
              viewingCompletions.completions.length === 0 ? (
                <p className="text-center text-slate-500 py-8">
                  Nadie ha completado esta capacitación aún.
                </p>
              ) : (
                <div className="space-y-4">
                  {viewingCompletions.completions.map((comp, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-slate-50"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">
                          {comp.userName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {comp.userEmail || "Sin correo"}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Completado el:{" "}
                          {comp.completedAt?.toDate().toLocaleString()}
                        </p>
                        {comp.score !== undefined &&
                          viewingCompletions.quiz && (
                            <p className="text-xs text-green-600 font-medium mt-1">
                              Examen: {comp.score} /{" "}
                              {viewingCompletions.quiz.questions.length}{" "}
                              correctas
                            </p>
                          )}
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="bg-white border border-slate-200 rounded p-1">
                          <img
                            src={comp.signatureUrl}
                            alt={`Firma de ${comp.userName}`}
                            className="h-12 w-auto object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <button
                          onClick={() =>
                            handleDownloadPDF(viewingCompletions, comp)
                          }
                          disabled={
                            generatingPdfId ===
                            `${viewingCompletions.id}-${comp.userId}`
                          }
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Descargar Certificado PDF"
                        >
                          {generatingPdfId ===
                          `${viewingCompletions.id}-${comp.userId}` ? (
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                          ) : (
                            <Download className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Training Deletion Confirmation Modal */}
      {trainingToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              ¿Eliminar capacitación?
            </h3>
            <p className="text-slate-600 mb-6">
              Esta acción no se puede deshacer. ¿Estás seguro de que deseas
              eliminar esta capacitación?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setTrainingToDelete(null)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteTraining}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Material Preview & Presentation Viewer Modal */}
      {viewingMaterial && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[110] p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <div className="flex items-center space-x-3 truncate mr-3">
                {(() => {
                  const mType = getMaterialType(viewingMaterial.name, viewingMaterial.url);
                  if (mType === "ppt") {
                    return (
                      <div className="p-2 bg-amber-100 text-amber-700 rounded-lg shrink-0">
                        <Presentation className="w-5 h-5" />
                      </div>
                    );
                  }
                  if (mType === "pdf") {
                    return (
                      <div className="p-2 bg-red-100 text-red-700 rounded-lg shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                    );
                  }
                  if (mType === "word") {
                    return (
                      <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                    );
                  }
                  return (
                    <div className="p-2 bg-slate-100 text-slate-700 rounded-lg shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                  );
                })()}
                <div className="truncate">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                    {viewingMaterial.name || "Material de Capacitación"}
                  </h3>
                  <p className="text-xs text-slate-500 truncate">
                    {viewingMaterial.title}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => downloadMaterialFile(viewingMaterial.url, viewingMaterial.name)}
                  className="flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium rounded-lg shadow-xs transition-colors"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  Descargar
                </button>
                <button
                  type="button"
                  onClick={() => setViewingMaterial(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Cerrar visor"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50/50 flex flex-col justify-center">
              {(() => {
                const mType = getMaterialType(viewingMaterial.name, viewingMaterial.url);

                // --- 1. POWERPOINT PRESENTATION (.ppt, .pptx) ---
                if (mType === "ppt") {
                  return (
                    <div className="flex flex-col items-center text-center max-w-xl mx-auto py-6 sm:py-8">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl flex items-center justify-center shadow-lg shadow-amber-500/20 mb-6 text-white">
                        <Presentation className="w-10 h-10 sm:w-12 sm:h-12" />
                      </div>

                      <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 mb-3">
                        Presentación de Diapositivas PowerPoint
                      </div>

                      <h4 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
                        {viewingMaterial.name || "Diapositivas de Capacitación"}
                      </h4>

                      <p className="text-sm text-slate-600 mb-6 max-w-md">
                        Las diapositivas están preparadas para su revisión. Los navegadores web no reproducen archivos PowerPoint (.ppt / .pptx) directamente sin descargarlos. Haz clic abajo para descargar y abrir con PowerPoint o tu visor de presentaciones.
                      </p>

                      <div className="w-full bg-white p-5 rounded-2xl border border-slate-200 shadow-xs mb-6 text-left">
                        <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                          ¿Cómo revisar este material?
                        </h5>
                        <ul className="text-sm text-slate-700 space-y-2.5">
                          <li className="flex items-start">
                            <CheckCircle className="w-4 h-4 text-emerald-600 mr-2 mt-0.5 shrink-0" />
                            <span><strong>Descarga el archivo</strong> haciendo clic en el botón principal naranja abajo.</span>
                          </li>
                          <li className="flex items-start">
                            <CheckCircle className="w-4 h-4 text-emerald-600 mr-2 mt-0.5 shrink-0" />
                            <span>Ábrelo con <strong>Microsoft PowerPoint</strong>, <strong>Google Slides (Presentaciones)</strong>, <strong>Keynote</strong> o <strong>WPS Office</strong> en tu computadora o teléfono.</span>
                          </li>
                          <li className="flex items-start">
                            <CheckCircle className="w-4 h-4 text-emerald-600 mr-2 mt-0.5 shrink-0" />
                            <span>Al finalizar la revisión, regresa aquí para registrar tu firma o rendir la evaluación.</span>
                          </li>
                        </ul>
                      </div>

                      <button
                        type="button"
                        onClick={() => downloadMaterialFile(viewingMaterial.url, viewingMaterial.name)}
                        className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center text-base"
                      >
                        <Download className="w-5 h-5 mr-2" />
                        Descargar Diapositivas PowerPoint
                      </button>

                      {viewingMaterial.url.startsWith("http") && (
                        <div className="w-full mt-6 pt-6 border-t border-slate-200">
                          <p className="text-xs text-slate-500 mb-3">
                            Intentar previsualización en la nube (Google Docs Viewer):
                          </p>
                          <iframe
                            src={`https://docs.google.com/viewer?url=${encodeURIComponent(viewingMaterial.url)}&embedded=true`}
                            className="w-full h-80 rounded-xl border border-slate-200 bg-white"
                            title="Previsualización PowerPoint"
                          />
                        </div>
                      )}
                    </div>
                  );
                }

                // --- 2. PDF DOCUMENT (.pdf) ---
                if (mType === "pdf") {
                  return (
                    <div className="flex flex-col h-full space-y-3">
                      <div className="flex items-center justify-between bg-white px-4 py-2 rounded-lg border border-slate-200 text-xs text-slate-600">
                        <span>Visor de Documento PDF</span>
                        <div className="space-x-2">
                          {safeBlobUrl && (
                            <button
                              type="button"
                              onClick={() => window.open(safeBlobUrl, "_blank")}
                              className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center"
                            >
                              <ExternalLink className="w-3.5 h-3.5 mr-1" />
                              Pantalla Completa
                            </button>
                          )}
                        </div>
                      </div>

                      {safeBlobUrl ? (
                        <iframe
                          src={safeBlobUrl}
                          className="w-full h-[65vh] rounded-xl border border-slate-200 bg-white shadow-inner"
                          title={viewingMaterial.name}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
                          <p>Cargando documento PDF...</p>
                        </div>
                      )}

                      <div className="text-center pt-1">
                        <p className="text-xs text-slate-500">
                          ¿No puedes ver el PDF en tu navegador?{" "}
                          <button
                            type="button"
                            onClick={() => downloadMaterialFile(viewingMaterial.url, viewingMaterial.name)}
                            className="text-blue-600 hover:underline font-semibold"
                          >
                            Descárgalo aquí directamente
                          </button>
                        </p>
                      </div>
                    </div>
                  );
                }

                // --- 3. IMAGES (.png, .jpg, .jpeg, .webp) ---
                if (mType === "image") {
                  return (
                    <div className="flex flex-col items-center justify-center py-4">
                      <img
                        src={viewingMaterial.url}
                        alt={viewingMaterial.name}
                        className="max-h-[68vh] max-w-full rounded-xl object-contain shadow-md border border-slate-200 bg-white"
                      />
                    </div>
                  );
                }

                // --- 4. WORD, EXCEL OR OTHER DOCUMENTS ---
                return (
                  <div className="flex flex-col items-center text-center max-w-md mx-auto py-8">
                    <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-3xl flex items-center justify-center shadow-md mb-4">
                      <FileText className="w-10 h-10" />
                    </div>
                    <span className="text-xs font-semibold bg-slate-100 text-slate-700 px-3 py-1 rounded-full mb-3 uppercase">
                      {mType === "word" ? "Documento Word" : mType === "excel" ? "Hoja de Cálculo Excel" : "Documento Adjunto"}
                    </span>
                    <h4 className="text-xl font-bold text-slate-900 mb-2">
                      {viewingMaterial.name}
                    </h4>
                    <p className="text-sm text-slate-600 mb-6">
                      Para ver este documento con su formato original completo, descárgalo a tu equipo o dispositivo móvil.
                    </p>
                    <button
                      type="button"
                      onClick={() => downloadMaterialFile(viewingMaterial.url, viewingMaterial.name)}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center"
                    >
                      <Download className="w-5 h-5 mr-2" />
                      Descargar Documento
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
