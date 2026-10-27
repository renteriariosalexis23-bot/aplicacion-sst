import { Loader2, FileText } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { MedicalExam, UserProfile } from "../types";
import {
  Plus,
  Trash2,
  X,
  AlertTriangle,
  CheckCircle,
  Clock,
  UploadCloud,
  Image as ImageIcon,
  Search,
} from "lucide-react";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { notifyAllEmployers } from "../utils/notifications";
import { uploadToCloudinary } from "../utils/cloudinary";
import { format, differenceInDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useCompany } from "../CompanyContext";
import { useAuth } from "../AuthContext";
import { PageHeader } from "./ui/PageHeader";
import { ConfirmationModal } from "./ui/ConfirmationModal";

export const MedicalExamsManager: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { profile } = useAuth();
  const [exams, setExams] = useState<MedicalExam[]>([]);
  const [workers, setWorkers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [workerDni, setWorkerDni] = useState("");
  const [examDate, setExamDate] = useState("");
  const [nextExamDate, setNextExamDate] = useState("");
  const [result, setResult] = useState<MedicalExam["result"]>("apto");
  const [restrictions, setRestrictions] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedCompany) {
      setLoading(false);
      return;
    }

    const baseQuery = collection(db, "medicalExams");
    let q;

    if (["employer", "super_admin", "gerencia"].includes(profile?.role || "") || profile?.role === "super_admin") {
      q = query(
        baseQuery,
        where("companyRuc", "==", selectedCompany.ruc),
        orderBy("examDate", "desc"),
      );
    } else {
      q = query(
        baseQuery,
        where("companyRuc", "==", selectedCompany.ruc),
        where("workerId", "==", profile?.uid),
        orderBy("examDate", "desc"),
      );
    }

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setExams(
          snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as MedicalExam,
          ),
        );
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, "medicalExams");
        setLoading(false);
      },
    );

    // Fetch workers for selection if employer
    let unsubWorkers = () => {};
    if (["employer", "super_admin", "gerencia"].includes(profile?.role || "")) {
      const wq = query(
        collection(db, "users"),
        where("companyRuc", "==", selectedCompany.ruc),
        where("role", "==", "worker"),
      );
      unsubWorkers = onSnapshot(wq, (snapshot) => {
        setWorkers(snapshot.docs.map((doc) => doc.data() as UserProfile));
      });
    }

    return () => {
      unsub();
      unsubWorkers();
    };
  }, [selectedCompany, profile]);

  useEffect(() => {
    if (selectedWorkerId) {
      const worker = workers.find((w) => w.uid === selectedWorkerId);
      if (worker) {
        setWorkerName(worker.displayName || "");
        setWorkerDni(worker.dni || "");
      }
    }
  }, [selectedWorkerId, workers]);

  if (!selectedCompany) {
    return (
      <div className="p-6 text-center text-slate-500">
        Por favor, seleccione una empresa para gestionar los exámenes médicos.
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Debes subir la foto del resultado.");
      return;
    }
    if (!workerName || !examDate || !nextExamDate) {
      setError("Completa todos los campos obligatorios.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const photoUrl = await uploadToCloudinary(file);

      await addDoc(collection(db, "medicalExams"), {
        workerId:
          ["employer", "super_admin", "gerencia"].includes(profile?.role || "") ? selectedWorkerId : profile?.uid,
        workerName,
        workerDni,
        examDate,
        nextExamDate,
        result,
        restrictions,
        recommendations,
        photoUrl,
        companyRuc: selectedCompany.ruc,
        status: ["employer", "super_admin", "gerencia"].includes(profile?.role || "") ? "pending_signature" : "signed",
        createdAt: serverTimestamp(),
      });

      // Notify employers if uploaded by a worker
      if (profile?.role === "worker") {
        await notifyAllEmployers(
          "Nuevo Examen Médico (EMO)",
          `El trabajador ${workerName} ha subido su examen médico.`,
          "/medical-exams",
          selectedCompany.ruc,
        );
      } else if (["employer", "super_admin", "gerencia"].includes(profile?.role || "") && selectedWorkerId) {
        // Here we could notify the worker, but we need a notifyWorker util. We'll add it if it exists.
        // Actually, we can just use addDoc to notifications collection directly
        await addDoc(collection(db, "notifications"), {
          userId: selectedWorkerId,
          title: "Constancia de Entrega de EMO",
          message: "Se han registrado las recomendaciones de tu Examen Médico. Entra para leer y firmar el cargo de recepción.",
          read: false,
          link: "/medical-exams",
          companyRuc: selectedCompany.ruc,
          createdAt: serverTimestamp(),
        });
      }
      
      import("react-hot-toast").then((t) => t.default.success("Registro de examen médico guardado correctamente."));

      setSelectedWorkerId("");
      setWorkerName("");
      setWorkerDni("");
      setExamDate("");
      setNextExamDate("");
      setResult("apto");
      setRestrictions("");
      setRecommendations("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsAdding(false);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, "medicalExams");
      setError("No se pudo guardar el examen. Inténtalo de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    setItemToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (itemToDelete) {
      try {
        await deleteDoc(doc(db, "medicalExams", itemToDelete));
        import("react-hot-toast").then((t) => t.default.success("Examen médico eliminado."));
        setItemToDelete(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, "medicalExams");
      }
    }
  };

  const getStatus = (nextDate: string) => {
    const daysLeft = differenceInDays(parseISO(nextDate), new Date());
    if (daysLeft < 0)
      return {
        label: "Vencido",
        color: "bg-red-100 text-red-700 border-red-200",
        icon: AlertTriangle,
      };
    if (daysLeft <= 30)
      return {
        label: `Próximo: ${daysLeft} días`,
        color: "bg-amber-100 text-amber-700 border-amber-200",
        icon: Clock,
      };
    return {
      label: "Vigente",
      color: "bg-emerald-100 text-emerald-700 border-emerald-200",
      icon: CheckCircle,
    };
  };

  const filteredExams = exams.filter(
    (exam) =>
      exam.workerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (exam.workerDni && exam.workerDni.includes(searchTerm)),
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Exámenes Médicos"
        description={selectedCompany.businessName}
        icon={FileText}
        color="emerald"
        actions={
          !isAdding && (
            <div className="flex flex-col sm:flex-row gap-3">
              {profile?.role !== "worker" && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
                  <input
                    type="text"
                    placeholder="Buscar trabajador o DNI..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-white/20 bg-white/10 text-white placeholder:text-white/60 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-sm w-full sm:w-64"
                  />
                </div>
              )}
              {["employer", "super_admin", "gerencia"].includes(profile?.role || "") && (
                <button
                  onClick={() => setIsAdding(true)}
                  className="flex items-center justify-center gap-2 bg-white text-emerald-700 px-4 py-2 rounded-lg hover:bg-emerald-50 transition-colors text-sm font-medium whitespace-nowrap shadow-sm border border-transparent"
                >
                  <Plus className="w-4 h-4" /> Registrar Examen
                </button>
              )}
            </div>
          )
        }
      />

      <div className="p-6 flex-1 overflow-y-auto bg-slate-50/50">
        {!isAdding ? (
          <>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : filteredExams.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-slate-200 border-dashed">
                <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">
                  No se encontraron exámenes con esa búsqueda.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredExams.map((exam) => {
                  const status = getStatus(exam.nextExamDate);
                  const StatusIcon = status.icon;
                  return (
                    <div
                      key={exam.id}
                      className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
                    >
                      <div
                        className="h-32 bg-slate-100 relative group cursor-pointer"
                        onClick={() => window.open(exam.photoUrl, "_blank")}
                      >
                        <img
                          src={exam.photoUrl}
                          alt="Examen"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-white text-sm font-medium flex items-center gap-1">
                            <ImageIcon className="w-4 h-4" /> Ver Resultado
                          </span>
                        </div>
                      </div>
                      <div className="p-4 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-2">
                          <h3
                            className="font-bold text-slate-900 line-clamp-1"
                            title={exam.workerName}
                          >
                            {exam.workerName}
                          </h3>
                          {["employer", "super_admin", "gerencia"].includes(profile?.role || "") && (
                            <button
                              onClick={() => handleDelete(exam.id!)}
                              className="text-slate-400 hover:text-red-500 transition-colors p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        {exam.workerDni && (
                          <p className="text-xs text-slate-500 mb-3">
                            DNI: {exam.workerDni}
                          </p>
                        )}

                        <div className="mt-auto space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Fecha:</span>
                            <span className="font-medium text-slate-700">
                              {format(parseISO(exam.examDate), "dd MMM yyyy", {
                                locale: es,
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Resultado:</span>
                            <span className="font-medium text-slate-700 capitalize">
                              {exam.result.replace(/_/g, " ")}
                            </span>
                          </div>

                          {(exam.restrictions || exam.recommendations) && (
                            <div className="mt-2 text-xs bg-amber-50 p-2 rounded border border-amber-100">
                              {exam.restrictions && (
                                <div className="mb-1">
                                  <span className="font-bold text-amber-800">Restricciones: </span>
                                  <span className="text-amber-700">{exam.restrictions}</span>
                                </div>
                              )}
                              {exam.recommendations && (
                                <div>
                                  <span className="font-bold text-amber-800">Recomendaciones: </span>
                                  <span className="text-amber-700">{exam.recommendations}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {exam.status === "pending_signature" && profile?.uid === exam.workerId ? (
                            <div className="mt-3 bg-blue-50 p-3 rounded-lg border border-blue-100 flex flex-col gap-2">
                              <span className="text-xs font-semibold text-blue-800 text-center">Constancia de Entrega EMO</span>
                              <p className="text-[10px] text-blue-700 text-center">Por favor firma para confirmar la recepción de tus resultados y recomendaciones.</p>
                              <button
                                onClick={async () => {
                                  const sigUrl = profile.digitalSignatureConsent?.signatureUrl || profile.savedSignatureUrl;
                                  if (!sigUrl) {
                                    toast.error("Debes configurar tu firma electrónica en tu perfil primero.");
                                    return;
                                  }
                                  try {
                                    await updateDoc(doc(db, "medicalExams", exam.id!), {
                                      workerSignatureUrl: sigUrl,
                                      signedAt: serverTimestamp(),
                                      status: "signed"
                                    });
                                  } catch (err) {
                                    console.error("Error signing:", err);
                                  }
                                }}
                                className="w-full py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition"
                              >
                                Firmar Constancia
                              </button>
                            </div>
                          ) : exam.status === "signed" ? (
                            <div className="mt-3 flex flex-col items-center justify-center p-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                              <span className="text-[10px] text-emerald-700 font-semibold mb-1">Constancia Firmada</span>
                              {exam.workerSignatureUrl && (
                                <img
                                  src={exam.workerSignatureUrl}
                                  alt="Firma Trabajador"
                                  className="h-8 object-contain bg-white rounded border border-emerald-200 px-1"
                                />
                              )}
                            </div>
                          ) : null}

                          <div
                            className={`mt-3 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-bold border ${status.color}`}
                          >
                            <StatusIcon className="w-3.5 h-3.5" />
                            {status.label}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-2xl mx-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              Registrar Nuevo Examen
            </h3>
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {["employer", "super_admin", "gerencia"].includes(profile?.role || "") && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Seleccionar Trabajador *
                  </label>
                  <select
                    required
                    value={selectedWorkerId}
                    onChange={(e) => setSelectedWorkerId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- Seleccione un trabajador --</option>
                    {workers.map((w) => (
                      <option key={w.uid} value={w.uid}>
                        {w.displayName} ({w.dni || "Sin DNI"})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nombre del Trabajador *
                  </label>
                  <input
                    type="text"
                    required
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50"
                    placeholder="Ej. Juan Pérez"
                    disabled={
                      ["employer", "super_admin", "gerencia"].includes(profile?.role || "") && !!selectedWorkerId
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    DNI (Opcional)
                  </label>
                  <input
                    type="text"
                    value={workerDni}
                    onChange={(e) => setWorkerDni(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50"
                    placeholder="Ej. 12345678"
                    disabled={
                      ["employer", "super_admin", "gerencia"].includes(profile?.role || "") && !!selectedWorkerId
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Fecha del Examen *
                  </label>
                  <input
                    type="date"
                    required
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Próximo Examen *
                  </label>
                  <input
                    type="date"
                    required
                    value={nextExamDate}
                    onChange={(e) => setNextExamDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Resultado *
                </label>
                <select
                  value={result}
                  onChange={(e) =>
                    setResult(e.target.value as MedicalExam["result"])
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="apto">Apto</option>
                  <option value="apto_con_restricciones">
                    Apto con Restricciones
                  </option>
                  <option value="no_apto">No Apto</option>
                </select>
              </div>

              {result === "apto_con_restricciones" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Restricciones
                  </label>
                  <textarea
                    value={restrictions}
                    onChange={(e) => setRestrictions(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ej. Uso obligatorio de lentes correctores"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Recomendaciones Médicas Ocupacionales
                </label>
                <textarea
                  value={recommendations}
                  onChange={(e) => setRecommendations(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ej. Pausas activas cada 2 horas"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Resultado del Examen (Foto/PDF) *
                </label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="space-y-1 text-center">
                    <UploadCloud className="mx-auto h-12 w-12 text-slate-400" />
                    <div className="flex text-sm text-slate-600 justify-center">
                      <label
                        htmlFor="file-upload"
                        className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                      >
                        <span>Subir un archivo</span>
                        <input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          className="sr-only"
                          ref={fileInputRef}
                          accept="image/*"
                          onChange={(e) => setFile(e.target.files?.[0] || null)}
                        />
                      </label>
                    </div>
                    <p className="text-xs text-slate-500">
                      PNG, JPG, GIF hasta 10MB
                    </p>
                    {file && (
                      <p className="text-sm font-medium text-emerald-600 mt-2">
                        Archivo seleccionado: {file.name}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
                >
                  {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Guardando...</> : "Guardar Examen"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setItemToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Eliminar Examen Médico"
        message="¿Estás seguro de eliminar este examen médico? Esta acción no se puede deshacer."
      />
    </div>
  );
};
