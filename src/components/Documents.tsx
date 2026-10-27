import React, { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  deleteDoc,
  doc,
  updateDoc,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { PageHeader } from "./ui/PageHeader";
import { SSTDocument as DocType, DocumentSignature, Company } from "../types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, Trash2,
  Plus,
  FileText,
  Download,
  ExternalLink,
  UploadCloud,
  PenTool,
  CheckCircle,
  Users,
  X,
  AlertTriangle,
  Eye,
  Search,
  Folder,
  ArrowLeft,
  ChevronRight,
  FileCheck, } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { notifyAllWorkers, notifyAllEmployers } from "../utils/notifications";
import { uploadToCloudinary } from "../utils/cloudinary";
import { IpercManager } from "./IpercManager";
import { generateDocumentCargoPDF } from "../utils/pdfGenerator";
import { ConfirmationModal } from "./ui/ConfirmationModal";
import { SignerBanner } from "./ui/SignerBanner";

const DOCUMENT_CATEGORIES = [
  "Política y Objetivos SST",
  "Reglamento Interno (RISST)",
  "Matriz IPERC y Mapa de Riesgos",
  "Procedimientos y Planes de Emergencia",
  "Otros Documentos",
];

// Ilustración 3D de cada categoría (public/ilustraciones)
const CATEGORY_ART: Record<string, string> = {
  "Política y Objetivos SST": "/ilustraciones/doc-politica.png",
  "Reglamento Interno (RISST)": "/ilustraciones/doc-reglamento.png",
  "Matriz IPERC y Mapa de Riesgos": "/ilustraciones/doc-mapa.png",
  "Procedimientos y Planes de Emergencia": "/ilustraciones/doc-emergencia.png",
  "Otros Documentos": "/ilustraciones/doc-otros.png",
};

export const Documents: React.FC = () => {
  const { profile } = useAuth();
  const { selectedCompany, companies } = useCompany();
  const [documents, setDocuments] = useState<DocType[]>([]);
  const [loading, setLoading] = useState(true);

  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0");
  const [selectedCompanyRuc, setSelectedCompanyRuc] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [category, setCategory] = useState<string>("Otros Documentos");
  const [targetArea, setTargetArea] = useState<string>("Todas");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [usingSavedSignature, setUsingSavedSignature] = useState(false);

  const [docToToggle, setDocToToggle] = useState<DocType | null>(null);
  const [isToggleModalOpen, setIsToggleModalOpen] = useState(false);

  // Fetch unique areas from selected company
  const [companyAreas, setCompanyAreas] = useState<string[]>([]);
  useEffect(() => {
    if (!["employer", "super_admin", "gerencia"].includes(profile?.role || "")) return;
    const ruc = selectedCompany?.ruc || profile?.companyRuc;
    if (!ruc) return;

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
  }, [profile, selectedCompany]);

  // Signature state
  const [signingDoc, setSigningDoc] = useState<DocType | null>(null);
  const [viewingSignaturesDoc, setViewingSignaturesDoc] =
    useState<DocType | null>(null);
  const [isSubmittingSignature, setIsSubmittingSignature] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [docToDelete, setDocToDelete] = useState<DocType | null>(null);
  const sigCanvas = useRef<SignatureCanvas>(null);

  useEffect(() => {
    let q;
    if (["employer", "super_admin", "gerencia"].includes(profile?.role || "")) {
      if (selectedCompany) {
        q = query(
          collection(db, "documents"),
          where("companyRuc", "in", [selectedCompany.ruc, "ALL"]),
          orderBy("createdAt", "desc"),
        );
      } else {
        q = query(collection(db, "documents"), orderBy("createdAt", "desc"));
      }
    } else if (profile?.companyRuc) {
      q = query(
        collection(db, "documents"),
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
        const docsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as DocType[];
        setDocuments(docsData);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "documents");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [profile, selectedCompany]);

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !["employer", "super_admin", "gerencia"].includes(profile.role || "") || files.length === 0) return;

    setUploading(true);
    setErrorMsg(null);
    try {
      const ruc = selectedCompanyRuc || (["employer", "super_admin", "gerencia"].includes(profile.role || "") ? selectedCompany?.ruc : profile.companyRuc) || "";

      for (const f of files) {
        // 1. Upload file to Cloudinary
        const downloadUrl = await uploadToCloudinary(f);

        // 2. Save metadata to Firestore
        await addDoc(collection(db, "documents"), {
          title: files.length > 1 ? f.name : title,
          description,
          version,
          status: "Vigente",
          url: downloadUrl,
          fileName: f.name,
          uploadedBy: profile.uid,
          companyRuc: ruc,
          requiresSignature,
          signatures: [],
          createdAt: serverTimestamp(),
          category,
          targetArea,
        });
      }

      // Send notification to all workers
      await notifyAllWorkers(
        "Nuevos Documentos SST",
        `Se han subido ${files.length} documento(s)`,
        "/documents",
        ruc,
      );

      setTitle("");
      setDescription("");
      setVersion("1.0");
      setFiles([]);
      setRequiresSignature(false);
      setCategory("Otros Documentos");
      setTargetArea("Todas");
      setErrorMsg(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsCreating(false);
    } catch (error) {
      console.error("Error uploading document:", error);
      setErrorMsg(
        "Hubo un error al subir el documento. Asegúrate de configurar la variable de entorno de VITE_CLOUDINARY_UPLOAD_PRESET y habilitarlo como 'Unsigned'.",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleToggleDocStatus = (docItem: DocType) => {
    setDocToToggle(docItem);
    setIsToggleModalOpen(true);
  };

  const confirmToggleStatus = async () => {
    if (!docToToggle) return;
    try {
      await updateDoc(doc(db, "documents", docToToggle.id!), {
        status: docToToggle.status === "Obsoleto" ? "Vigente" : "Obsoleto",
      });
      toast.success("Estado actualizado al instante.");
      setDocToToggle(null);
      setIsToggleModalOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("Error al actualizar estado");
    }
  };

  const handleDeleteDocument = (docItem: DocType) => {
    setDocToDelete(docItem);
  };

  const confirmDeleteDocument = async () => {
    if (!docToDelete || (profile?.role !== "employer" && profile?.role !== "super_admin" && profile?.role !== "gerencia")) return;
    try {
      // Note: We are skipping Cloudinary deletion for now to keep it simple,
      // but we still delete the document from Firestore.

      await deleteDoc(doc(db, "documents", docToDelete.id!));
      toast.success("Documento eliminado.");
      setDocToDelete(null);
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Error al eliminar el documento.");
    }
  };

  const hasSigned = (docItem: DocType) => {
    if (!profile) return false;
    return (
      docItem.signatures?.some((sig) => sig.userId === profile.uid) || false
    );
  };

  const [viewedDocs, setViewedDocs] = useState<string[]>([]);

  useEffect(() => {
    const stored = sessionStorage.getItem("viewedDocs");
    if (stored) {
      try {
        setViewedDocs(JSON.parse(stored));
      } catch (e) {
        // ignore
      }
    }
  }, []);

  const handleViewDoc = (docId: string) => {
    if (!viewedDocs.includes(docId)) {
      const updated = [...viewedDocs, docId];
      setViewedDocs(updated);
      sessionStorage.setItem("viewedDocs", JSON.stringify(updated));
    }
  };

  const [hasConfirmedReading, setHasConfirmedReading] = useState(false);
  const [hasExplicitlyConfirmed, setHasExplicitlyConfirmed] = useState(false);

  // Persist progress in session storage to handle mobile browser reloads
  useEffect(() => {
    if (signingDoc) {
      const savedProgress = sessionStorage.getItem(
        `sig_progress_${signingDoc.id}`,
      );
      if (savedProgress) {
        const { confirmed, explicitlyConfirmed } = JSON.parse(savedProgress);
        setHasConfirmedReading(confirmed);
        setHasExplicitlyConfirmed(explicitlyConfirmed);
      } else {
        setHasConfirmedReading(false);
        setHasExplicitlyConfirmed(false);
      }
    }
  }, [signingDoc]);

  useEffect(() => {
    if (signingDoc) {
      sessionStorage.setItem(
        `sig_progress_${signingDoc.id}`,
        JSON.stringify({
          confirmed: hasConfirmedReading,
          explicitlyConfirmed: hasExplicitlyConfirmed,
        }),
      );
    }
  }, [hasConfirmedReading, hasExplicitlyConfirmed, signingDoc]);

  const handleSignDocument = async () => {
    if (!profile || !signingDoc || !sigCanvas.current) return;
    setSignatureError(null);
    if (!profile?.dni) {
      setSignatureError(
        "Es obligatorio registrar su DNI en su perfil ('Mi Perfil') para poder firmar digitalmente.",
      );
      return;
    }
    if (!hasConfirmedReading || !hasExplicitlyConfirmed) {
      setSignatureError(
        "Debes confirmar que has leído el documento y aceptar la declaración jurada antes de firmar.",
      );
      return;
    }
    if (!usingSavedSignature && sigCanvas.current.isEmpty()) {
      setSignatureError(
        "Por favor, dibuja tu firma o marca usar tu firma guardada.",
      );
      return;
    }

    setIsSubmittingSignature(true);
    setSignatureError(null);
    try {
      // Get signature as base64 image
      const signatureDataUrl =
        usingSavedSignature && profile.savedSignatureUrl
          ? profile.savedSignatureUrl
          : sigCanvas.current.getCanvas().toDataURL("image/png");

      // Upload signature image to Cloudinary
      // This is the part that might be slow or fail on mobile
      const signatureUrl = await uploadToCloudinary(signatureDataUrl);

      // Create signature object
      const newSignature: DocumentSignature = {
        userId: profile.uid,
        userName: profile.displayName || profile.email,
        userDni: profile.dni || "No registrado",
        userEmail: profile.email,
        signatureUrl,
        signatureBase64: signatureDataUrl,
        timestamp: new Date(),
      };

      // Update document with new signature
      const currentSignatures = signingDoc.signatures || [];
      const docRef = doc(db, "documents", signingDoc.id!);

      try {
        await updateDoc(docRef, {
          signatures: [...currentSignatures, newSignature],
        });

        // Notify employers
        await notifyAllEmployers(
          "Documento Firmado",
          `El trabajador ${profile?.displayName || profile?.email} ha firmado el documento: ${signingDoc.title}`,
          "/documents",
          profile?.companyRuc,
        );

        // Success! Clear progress and close modal
        sessionStorage.removeItem(`sig_progress_${signingDoc.id}`);
        setSigningDoc(null);
      } catch (firestoreError) {
        handleFirestoreError(
          firestoreError,
          OperationType.UPDATE,
          `documents/${signingDoc.id}`,
        );
        throw firestoreError;
      }
    } catch (error: any) {
      console.error("Error saving signature:", error);
      const errorMessage =
        error.message ||
        "Hubo un error al guardar tu firma. Por favor, intenta de nuevo.";
      setSignatureError(errorMessage);
    } finally {
      setIsSubmittingSignature(false);
    }
  };

  const handleDownloadCargo = async (
    docItem: DocType,
    signature: DocumentSignature,
  ) => {
    try {
      const companyName =
        selectedCompany?.businessName ||
        (profile?.role === "worker"
          ? companyAreas.length > 0
            ? "Empresa"
            : "Empresa"
          : "Empresa");
      const finalCompanyName =
        companies?.find((c) => c.ruc === docItem.companyRuc)?.businessName ||
        companyName;

      const blob = await generateDocumentCargoPDF(
        docItem,
        signature,
        finalCompanyName,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Cargo_${docItem.title.replace(/\s+/g, "_")}_${signature.userName.replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF del cargo generado y descargado correctamente.");
    } catch (e) {
      console.error(e);
      toast.error("Hubo un error al generar el PDF del cargo.");
    }
  };

  const filteredDocuments = documents.filter((doc) => {
    // 1. Filter by targetArea if user is a worker
    if (profile?.role === "worker") {
      const docArea = doc.targetArea || "Todas";
      const userArea = profile.department || "";
      if (
        docArea !== "Todas" &&
        docArea.toLowerCase() !== userArea.toLowerCase()
      ) {
        return false;
      }
    }

    // 2. Filter by search term
    const matchesSearch =
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.description.toLowerCase().includes(searchTerm.toLowerCase());

    // 3. Filter by selected category
    if (selectedCategory) {
      const docCategory = doc.category || "Otros Documentos";
      return matchesSearch && docCategory === selectedCategory;
    }

    return matchesSearch;
  });

  const getCategoryCount = (cat: string) => {
    return documents.filter((doc) => {
      if (profile?.role === "worker") {
        const docArea = doc.targetArea || "Todas";
        const userArea = profile.department || "";
        if (
          docArea !== "Todas" &&
          docArea.toLowerCase() !== userArea.toLowerCase()
        ) {
          return false;
        }
      }
      return (doc.category || "Otros Documentos") === cat;
    }).length;
  };

  return (
    <div className="w-full">
      {/* 
         INTERCEPTION FOR IPERC MEGA-MODULE
         If the user is inside the IPERC category, we hijack the render to show the new interactive view,
         giving us the "Tabbed" / "Mixed" SAAS approach the user wants.
      */}
      {selectedCategory === "Matriz IPERC y Mapa de Riesgos" ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px] flex flex-col">
          {/* IPERC Header */}
          <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 rounded-t-xl">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedCategory(null)}
                className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-500"
                title="Volver a Documentos"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-sky-600" />
                  Gestión Dinámica de IPERC
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Identificación de Peligros, Evaluación de Riesgos y Control
                </p>
              </div>
            </div>
          </div>

          {/* IPERC Interactive Module */}
          <div className="flex flex-col flex-1">
            <IpercManager />

            {/* Documentos Históricos Fallback */}
            <div className="px-6 py-8 border-t border-slate-200 bg-slate-50 rounded-b-xl mt-auto">
              <h4 className="text-left font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Folder className="w-4 h-4 text-slate-400" />
                Documentos Históricos Auxiliares (Archivos Físicos)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredDocuments.length === 0 ? (
                  <div className="col-span-2 text-center py-6 bg-white rounded-xl border border-dashed border-slate-300">
                    <p className="text-slate-400 text-sm">
                      No hay documentos PDF complementarios subidos en esta
                      categoría.
                    </p>
                  </div>
                ) : (
                  filteredDocuments.map((docItem) => (
                    <div
                      key={docItem.id}
                      className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-left flex items-start gap-3 relative"
                    >
                      <div className="bg-blue-50 p-2 rounded-lg">
                        <FileText className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className="font-semibold text-sm text-slate-800 truncate"
                          title={docItem.title}
                        >
                          {docItem.title}
                        </p>
                        <p
                          className="text-xs text-slate-500 truncate"
                          title={docItem.description}
                        >
                          {docItem.description}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <a
                            href={docItem.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> Abrir PDF
                          </a>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <PageHeader
            title="Documentos Oficiales SST"
            description="Gestión y control de documentos del sistema"
            icon={FileText}
            color="emerald"
            actions={
              !isCreating && (
                <>
                  {profile?.role !== "worker" && (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-100" />
                      <input
                        type="text"
                        placeholder="Buscar documento..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-black/20 border border-white/20 text-white placeholder:text-emerald-100/70 rounded-lg focus:ring-2 focus:ring-white/30 focus:border-white/30 text-sm w-full sm:w-64 backdrop-blur-sm"
                      />
                    </div>
                  )}
                  {["employer", "super_admin", "gerencia"].includes(profile?.role || "") && (
                    <button
                      onClick={() => setIsCreating(true)}
                      className="flex items-center justify-center px-4 py-2 bg-white text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors shadow-sm whitespace-nowrap font-medium"
                    >
                      <Plus className="w-5 h-5 mr-2" />
                      Subir Documento
                    </button>
                  )}
                </>
              )
            }
          />

          {isCreating &&
            ["employer", "super_admin", "gerencia"].includes(profile?.role || "") && (
              <div className="bg-white rounded-xl shadow-sm p-6 mb-8 border border-slate-200">
                <h2 className="text-lg font-semibold mb-4">Subir Documento</h2>
                {errorMsg && (
                  <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-md text-sm">
                    {errorMsg}
                  </div>
                )}
                <form onSubmit={handleUploadDocument} className="space-y-4">
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
                      Categoría
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                      required
                    >
                      {DOCUMENT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
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
                      Título del Documento
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                      placeholder="Ej. Reglamento Interno de SST"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Versión del Documento
                    </label>
                    <input
                      type="text"
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border bg-slate-50"
                      placeholder="Ej. 1.0, 2.1..."
                      required
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Versión oficial del documento legal para control de
                      cambios.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Descripción
                    </label>
                    <textarea
                      required
                      maxLength={500}
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                      placeholder="Breve descripción del documento..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Archivos (PDF, Word, Excel, etc.)
                    </label>
                    <div 
                      className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md transition-colors ${isDragging ? "border-blue-600 bg-blue-50" : "border-slate-300 bg-slate-50 hover:border-blue-500"}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                          setFiles(Array.from(e.dataTransfer.files));
                        }
                      }}
                    >
                      <div className="space-y-1 text-center">
                        <UploadCloud className={`mx-auto h-12 w-12 ${isDragging ? "text-blue-500" : "text-slate-400"}`} />
                        <div className="flex text-sm text-slate-600 justify-center">
                          <label
                            htmlFor="file-upload"
                            className="relative cursor-pointer bg-transparent rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500 px-2 py-1"
                          >
                            <span>Seleccionar o arrastrar archivos</span>
                            <input
                              id="file-upload"
                              name="file-upload"
                              type="file"
                              multiple
                              className="sr-only"
                              ref={fileInputRef}
                              required={files.length === 0}
                              onChange={(e) => {
                                if (e.target.files) {
                                  setFiles(Array.from(e.target.files));
                                }
                              }}
                            />
                          </label>
                        </div>
                        <p className="text-xs text-slate-500">
                          {files.length > 0
                            ? `${files.length} archivo(s) seleccionado(s)`
                            : "Puedes arrastrar y soltar múltiples archivos aquí"}
                        </p>
                        {files.length > 0 && (
                          <div className="mt-2 text-left text-xs text-slate-600 max-h-24 overflow-y-auto">
                            {files.map((f, i) => (
                              <div key={i} className="truncate">• {f.name}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <input
                      id="requires-signature"
                      type="checkbox"
                      checked={requiresSignature}
                      onChange={(e) => setRequiresSignature(e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                    />
                    <label
                      htmlFor="requires-signature"
                      className="ml-2 block text-sm text-slate-700"
                    >
                      Requerir firma de los trabajadores (Acuse de recibo)
                    </label>
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
                      disabled={uploading || files.length === 0}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
                    >
                      {uploading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Subiendo...
                        </>
                      ) : (
                        "Guardar Documento"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

          {loading ? (
            <div className="text-center py-10 text-slate-500">
              Cargando documentos...
            </div>
          ) : !selectedCategory && !searchTerm ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
              {DOCUMENT_CATEGORIES.map((cat) => {
                const count = getCategoryCount(cat);
                return (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className="group flex flex-col overflow-hidden rounded-[19px] border border-blue-600 bg-blue-600 text-left text-white transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_var(--brand-main)]"
                  >
                    <span className="flex h-[110px] w-full items-center justify-center overflow-hidden bg-[#f1f1f1] sm:h-[170px]">
                      <img
                        src={CATEGORY_ART[cat] || CATEGORY_ART["Otros Documentos"]}
                        alt=""
                        className="brand-art h-[124px] w-auto max-w-none object-contain transition-transform duration-500 group-hover:scale-105 sm:h-[190px]"
                      />
                    </span>
                    <span className="flex w-full flex-1 items-center justify-between gap-2 px-3.5 py-3.5 sm:gap-3 sm:px-6 sm:py-5">
                      <span className="min-w-0">
                        <strong className="block text-[13px] font-extrabold leading-tight sm:text-base">
                          {cat}
                        </strong>
                        <small className="mt-1 block text-[11px] font-semibold text-white/85">
                          {count} {count === 1 ? "documento" : "documentos"}
                        </small>
                      </span>
                      <span aria-hidden="true" className="shrink-0 text-lg transition-transform duration-300 group-hover:translate-x-1 sm:text-xl">
                        →
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              {selectedCategory && !searchTerm && (
                <div className="mb-6 flex items-center">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className="flex items-center text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Volver a Categorías
                  </button>
                  <ChevronRight className="w-4 h-4 mx-2 text-slate-300" />
                  <span className="text-sm font-semibold text-slate-800">
                    {selectedCategory}
                  </span>
                </div>
              )}

              {filteredDocuments.length === 0 ? (
                <div className="text-center py-10 text-slate-500 bg-white rounded-xl shadow-sm border border-slate-200">
                  No se encontraron documentos en esta categoría.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredDocuments.map((docItem) => (
                    <div
                      key={docItem.id}
                      className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full"
                    >
                      <div className="p-5 flex-1">
                        <div className="flex items-start justify-between">
                          <div className="bg-blue-50 p-3 rounded-lg">
                            <FileText className="w-6 h-6 text-blue-600" />
                          </div>
                          {(profile?.role === "super_admin" ||
                            (["employer", "super_admin", "gerencia"].includes(profile?.role || "") &&
                              profile.uid === docItem.uploadedBy)) && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleToggleDocStatus(docItem)}
                                className={`p-1.5 rounded-md transition-colors ${docItem.status === "Obsoleto" ? "text-amber-500 hover:bg-amber-50" : "text-slate-400 hover:text-amber-600 hover:bg-amber-50"}`}
                                title={
                                  docItem.status === "Obsoleto"
                                    ? "Marcar como Vigente"
                                    : "Marcar como Obsoleto (Abrogar)"
                                }
                              >
                                <AlertTriangle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteDocument(docItem)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                title="Eliminar documento"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                        <h3 className="mt-4 text-lg font-semibold text-slate-900 line-clamp-2">
                          {docItem.title}
                          {docItem.version && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200 align-middle">
                              v{docItem.version}
                            </span>
                          )}
                        </h3>
                        {docItem.status === "Obsoleto" && (
                          <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800">
                            ABROGADO / OBSOLETO
                          </span>
                        )}
                        <p className="mt-2 text-sm text-slate-600 line-clamp-3">
                          {docItem.description}
                        </p>
                        {docItem.fileName && (
                          <p
                            className="mt-2 text-xs font-mono text-slate-500 truncate"
                            title={docItem.fileName}
                          >
                            {docItem.fileName}
                          </p>
                        )}
                        <p className="mt-4 text-xs text-slate-400">
                          Subido el{" "}
                          {docItem.createdAt
                            ? format(docItem.createdAt.toDate(), "d MMM yyyy", {
                                locale: es,
                              })
                            : "Justo ahora"}
                        </p>
                        {docItem.requiresSignature && (
                          <div className="mt-3">
                            {["employer", "super_admin", "gerencia"].includes(
                              profile?.role || "",
                            ) ? (
                              <button
                                onClick={() => setViewingSignaturesDoc(docItem)}
                                className="inline-flex items-center text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md hover:bg-blue-100 transition-colors"
                              >
                                <Users className="w-3.5 h-3.5 mr-1" />
                                Ver Firmas ({docItem.signatures?.length || 0})
                              </button>
                            ) : hasSigned(docItem) ? (
                              <span className="inline-flex items-center text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md">
                                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                Firmado
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-md border border-amber-200">
                                <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                                Firma Pendiente
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="border-t border-slate-100 p-4 bg-slate-50 rounded-b-xl flex justify-between items-center">
                        {!docItem.requiresSignature ||
                        ["employer", "super_admin", "gerencia"].includes(profile?.role || "") ||
                        hasSigned(docItem) ? (
                          <a
                            href={docItem.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={docItem.fileName || "documento"}
                            className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
                          >
                            <Download className="w-4 h-4 mr-1.5" />
                            Descargar
                          </a>
                        ) : (
                          <div className="flex gap-2">
                            <a
                              href={docItem.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => handleViewDoc(docItem.id!)}
                              className="inline-flex items-center text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md transition-colors"
                            >
                              <Eye className="w-4 h-4 mr-1.5" />
                              1. Ver
                            </a>
                            <button
                              onClick={() => setSigningDoc(docItem)}
                              disabled={!viewedDocs.includes(docItem.id!)}
                              className={`inline-flex items-center text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
                                viewedDocs.includes(docItem.id!)
                                  ? "text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200"
                                  : "text-slate-400 bg-slate-50 border border-slate-200 cursor-not-allowed"
                              }`}
                              title={
                                !viewedDocs.includes(docItem.id!)
                                  ? "Debes hacer clic en '1. Ver' primero"
                                  : ""
                              }
                            >
                              <PenTool className="w-4 h-4 mr-1.5" />
                              {viewedDocs.includes(docItem.id!)
                                ? "2. Firmar"
                                : "Requiere ver primero"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Signature Modal */}
          {signingDoc && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b border-slate-100 shrink-0">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Firmar Documento
                  </h3>
                  <button
                    onClick={() => setSigningDoc(null)}
                    className="text-slate-400 hover:text-slate-600"
                    title="Cerrar"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 overflow-y-auto">
                  <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <h4 className="font-medium text-slate-900 mb-1">
                      {signingDoc.title}
                    </h4>
                    <p className="text-sm text-slate-600 mb-3">
                      {signingDoc.description}
                    </p>

                    <div className="space-y-3">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setHasConfirmedReading(true);
                            setSignatureError(null);
                          }}
                          disabled={hasConfirmedReading}
                          className={`w-full flex items-center justify-center px-4 py-3 rounded-lg border text-sm font-bold transition-all ${
                            hasConfirmedReading
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-blue-600 text-white border-transparent hover:bg-blue-700 shadow-sm"
                          }`}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          {hasConfirmedReading
                            ? "1. Lectura Confirmada ✓"
                            : "1. Confirmo que he leído el documento"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-start mb-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <div className="flex items-center h-5">
                        <input
                          type="checkbox"
                          id="has-read"
                          checked={hasExplicitlyConfirmed}
                          disabled={!hasConfirmedReading}
                          onChange={(e) => {
                            setHasExplicitlyConfirmed(e.target.checked);
                            setSignatureError(null);
                          }}
                          className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-slate-300 rounded disabled:opacity-50 cursor-pointer"
                        />
                      </div>
                      <label
                        htmlFor="has-read"
                        className={`ml-3 block text-sm font-bold leading-tight ${!hasConfirmedReading ? "text-slate-400" : "text-slate-700"}`}
                      >
                        2. Declaro bajo juramento haber recibido, leído y
                        comprendido el documento adjunto.
                      </label>
                    </div>

                    {hasExplicitlyConfirmed && (
                      <>
                        {signatureError && (
                          <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-md text-sm">
                            {signatureError}
                          </div>
                        )}

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
                          <div className="border-2 border-slate-300 border-dashed rounded-lg bg-slate-50 relative touch-none">
                            <SignatureCanvas
                              ref={sigCanvas}
                              canvasProps={{
                                className:
                                  "signature-canvas w-full h-48 rounded-lg cursor-crosshair",
                              }}
                              backgroundColor="transparent"
                            />
                            <button
                              onClick={() => sigCanvas.current?.clear()}
                              className="absolute top-2 right-2 text-xs text-slate-500 hover:text-slate-700 bg-white px-2 py-1 rounded shadow-sm border border-slate-200"
                            >
                              Limpiar
                            </button>
                          </div>
                        ) : (
                          <div className="border-2 border-slate-200 rounded-lg bg-white relative flex justify-center p-4">
                            <img
                              src={profile!.savedSignatureUrl!}
                              alt="Firma Guardada"
                              className="h-24 object-contain"
                            />
                          </div>
                        )}
                        <p className="text-xs text-slate-500 mt-2 text-center">
                          {!usingSavedSignature
                            ? "Dibuja tu firma en el recuadro superior"
                            : "Se utilizará tu firma guardada"}
                        </p>
                      </>
                    )}
                  </div>
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end space-x-3 shrink-0">
                  <button
                    onClick={() => setSigningDoc(null)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSignDocument}
                    disabled={isSubmittingSignature}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
                  >
                    {isSubmittingSignature
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Guardando...</>
                      : "Firmar y Aceptar"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* View Signatures Modal (Employer) */}
          {viewingSignaturesDoc && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b border-slate-100 shrink-0">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      Registro de Firmas
                    </h3>
                    <p className="text-sm text-slate-500">
                      {viewingSignaturesDoc.title}
                    </p>
                  </div>
                  <button
                    onClick={() => setViewingSignaturesDoc(null)}
                    className="text-slate-400 hover:text-slate-600"
                    title="Cerrar"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-0 overflow-y-auto flex-1">
                  {!viewingSignaturesDoc.signatures ||
                  viewingSignaturesDoc.signatures.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                      <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                      <p>Aún no hay firmas registradas para este documento.</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {viewingSignaturesDoc.signatures.map((sig, idx) => (
                        <li
                          key={idx}
                          className="p-4 hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div>
                            <p className="font-medium text-slate-900">
                              {sig.userName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {sig.userEmail || "Sin correo"}{" "}
                              {sig.userDni ? ` | DNI: ${sig.userDni}` : ""}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              Firmado el{" "}
                              {sig.timestamp?.toDate
                                ? format(
                                    sig.timestamp.toDate(),
                                    "d MMM yyyy 'a las' HH:mm",
                                    { locale: es },
                                  )
                                : "Recientemente"}
                            </p>
                          </div>
                          <div className="flex flex-col sm:flex-row items-center gap-3">
                            <button
                              onClick={() =>
                                handleDownloadCargo(viewingSignaturesDoc, sig)
                              }
                              className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors flex items-center border border-blue-200"
                              title="Descargar Cargo en PDF"
                            >
                              <FileCheck className="w-4 h-4 mr-1.5" />
                              Cargo PDF
                            </button>
                            <div className="bg-white border border-slate-200 rounded-md p-1">
                              <img
                                src={sig.signatureUrl}
                                alt={`Firma de ${sig.userName}`}
                                className="h-12 object-contain"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
                  <button
                    onClick={() => setViewingSignaturesDoc(null)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Document Status Toggle Confirmation Modal */}
          <ConfirmationModal
            isOpen={isToggleModalOpen}
            onClose={() => {
              setIsToggleModalOpen(false);
              setDocToToggle(null);
            }}
            onConfirm={confirmToggleStatus}
            title={
              docToToggle?.status === "Obsoleto"
                ? "Marcar como Vigente"
                : "Marcar como Obsoleto"
            }
            message={`¿Estás seguro de que deseas marcar este documento como ${docToToggle?.status === "Obsoleto" ? "Vigente" : "Obsoleto"}?`}
          />

          {/* Document Deletion Confirmation Modal */}
          <ConfirmationModal
            isOpen={!!docToDelete}
            onClose={() => setDocToDelete(null)}
            onConfirm={confirmDeleteDocument}
            title="Eliminar documento"
            message="Esta acción no se puede deshacer. ¿Estás seguro de que deseas eliminar este documento?"
          />
        </>
      )}
    </div>
  );
};
