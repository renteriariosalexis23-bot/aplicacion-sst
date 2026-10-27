import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  addDoc,
  query,
  onSnapshot,
  orderBy,
  Timestamp,
  updateDoc,
  doc,
  where,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { Suggestion } from "../types";
import { Loader2, MessageSquare,
  Send,
  Shield,
  User,
  UploadCloud,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Trash2, } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { uploadToCloudinary } from "../utils/cloudinary";
import { PageHeader } from "./ui/PageHeader";
import { ConfirmationModal } from "./ui/ConfirmationModal";
import toast from "react-hot-toast";
import { notifyAllEmployers, notifyAllWorkers } from "../utils/notifications";
import { sendNotification } from "../utils/notificationUtils";
import { isMainAdmin } from "../constants/admin";

export const Suggestions: React.FC = () => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [category, setCategory] = useState<Suggestion["category"]>("safety");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Admin state
  const [selectedSuggestion, setSelectedSuggestion] =
    useState<Suggestion | null>(null);
  const [adminComment, setAdminComment] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [suggestionToDelete, setSuggestionToDelete] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!profile) return;

    let q;
    if (["employer", "super_admin", "gerencia"].includes(profile.role || "") || profile.role === "super_admin") {
      if (selectedCompany) {
        q = query(
          collection(db, "suggestions"),
          where("companyRuc", "==", selectedCompany.ruc),
          orderBy("createdAt", "desc"),
        );
      } else {
        q = query(collection(db, "suggestions"), orderBy("createdAt", "desc"));
      }
    } else if (profile.companyRuc) {
      // Workers only see their own identified suggestions within their company
      q = query(
        collection(db, "suggestions"),
        where("authorId", "==", profile.uid),
        where("companyRuc", "==", profile.companyRuc),
        orderBy("createdAt", "desc"),
      );
    } else {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as Suggestion,
        );
        setSuggestions(docs);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "suggestions");
        setLoading(false);
      },
    );

    return () => unsub();
  }, [profile, selectedCompany]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      let attachmentUrl = "";
      if (file) {
        attachmentUrl = await uploadToCloudinary(file);
      }

      const ruc =
        ["employer", "super_admin", "gerencia"].includes(profile.role || "")
          ? selectedCompany?.ruc || ""
          : profile.companyRuc || "";
      const newSuggestion: any = {
        category,
        subject,
        description,
        isAnonymous,
        companyRuc: ruc,
        status: "received",
        createdAt: Timestamp.now(),
      };

      if (attachmentUrl) {
        newSuggestion.attachmentUrl = attachmentUrl;
      }

      if (!isAnonymous) {
        newSuggestion.authorId = profile.uid;
        newSuggestion.authorName = profile.displayName || profile.email;
      }

      await addDoc(collection(db, "suggestions"), newSuggestion);

      await notifyAllEmployers(
        "Nuevo Buzón SST",
        `Se ha recibido una nueva ${category === "safety" ? "alerta de seguridad" : category === "health" ? "alerta de salud" : "sugerencia"} en el buzón.`,
        "/suggestions",
        ruc,
      );

      toast.success("Mensaje enviado exitosamente.");
      setSuccess(true);
      setSubject("");
      setDescription("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error(err);
      toast.error("Error al enviar el mensaje.");
      setError("Error al enviar la sugerencia. Por favor intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (
    id: string,
    newStatus: Suggestion["status"],
  ) => {
    setUpdatingStatus(true);
    try {
      const updateData: any = {
        status: newStatus,
      };

      if (adminComment) {
        updateData.adminComment = adminComment;
      }

      await updateDoc(doc(db, "suggestions", id), updateData);

      // Notify the author if it wasn't anonymous
      if (
        selectedSuggestion &&
        selectedSuggestion.authorId &&
        selectedSuggestion.authorId !== profile?.uid
      ) {
        let statusString = "";
        if (newStatus === "in_review") statusString = "En Revisión";
        if (newStatus === "implemented") statusString = "Implementada/Atendida";
        if (newStatus === "dismissed") statusString = "Desestimada";

        await sendNotification(
          selectedSuggestion.authorId,
          "Actualización de Buzón SST",
          `Tu envío "${selectedSuggestion.subject}" ha cambiado de estado a: ${statusString}.`,
          "/suggestions",
          selectedSuggestion.companyRuc,
        );
      }

      setSelectedSuggestion(null);
      setAdminComment("");
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDeleteSuggestion = (id: string) => {
    setSuggestionToDelete(id);
  };

  const confirmDeleteSuggestion = async () => {
    if (!suggestionToDelete) return;
    try {
      await deleteDoc(doc(db, "suggestions", suggestionToDelete));
      toast.success("Mensaje eliminado exitosamente.");
      setSuggestionToDelete(null);
    } catch (error) {
      console.error("Error al eliminar sugerencia:", error);
      toast.error("Error al eliminar la sugerencia.");
    }
  };

  const getStatusIcon = (status: Suggestion["status"]) => {
    switch (status) {
      case "received":
        return <Clock className="w-4 h-4 text-sky-500" />;
      case "in_review":
        return <AlertCircle className="w-4 h-4 text-orange-500" />;
      case "implemented":
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case "dismissed":
        return <XCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusLabel = (status: Suggestion["status"]) => {
    switch (status) {
      case "received":
        return "Recibido";
      case "in_review":
        return "En Revisión";
      case "implemented":
        return "Implementado";
      case "dismissed":
        return "Archivado";
    }
  };

  const getCategoryLabel = (cat: Suggestion["category"]) => {
    switch (cat) {
      case "safety":
        return "Seguridad";
      case "health":
        return "Salud Ocupacional";
      case "improvement":
        return "Mejora de Procesos";
      case "other":
        return "Otros";
    }
  };

  if (loading)
    return (
      <div className="p-8 text-center text-slate-500">Cargando buzón...</div>
    );

  return (
    <div className="w-full space-y-8">
      <PageHeader
        title="Buzón de Sugerencias SST"
        description="Tu voz es fundamental para un entorno de trabajo más seguro."
        icon={MessageSquare}
        color="blue"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Submission Form */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sticky top-24">
            <h2 className="text-lg font-bold text-slate-800 mb-4">
              Enviar Sugerencia
            </h2>

            {success && (
              <div className="mb-4 p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                <span>¡Sugerencia enviada con éxito!</span>
              </div>
            )}

            {error && (
              <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Categoría
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="safety">Seguridad</option>
                  <option value="health">Salud Ocupacional</option>
                  <option value="improvement">Mejora de Procesos</option>
                  <option value="other">Otros</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Asunto
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ej. Mejora en iluminación pasillo 4"
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
                  placeholder="Explica tu sugerencia o reporte..."
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Evidencia (Opcional)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-200 border-dashed rounded-xl hover:border-blue-500 transition-colors cursor-pointer bg-slate-50"
                >
                  <div className="space-y-1 text-center">
                    <UploadCloud className="mx-auto h-10 w-10 text-slate-400" />
                    <div className="text-sm text-slate-600">
                      {file ? (
                        <span className="text-blue-600 font-medium">
                          {file.name}
                        </span>
                      ) : (
                        "Subir foto o documento"
                      )}
                    </div>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={(e) =>
                      setFile(e.target.files ? e.target.files[0] : null)
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-2">
                  {isAnonymous ? (
                    <Shield className="w-4 h-4 text-blue-600" />
                  ) : (
                    <User className="w-4 h-4 text-slate-600" />
                  )}
                  <span className="text-sm font-medium text-slate-700">
                    {isAnonymous ? "Envío Anónimo" : "Identificarme"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAnonymous(!isAnonymous)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isAnonymous ? "bg-blue-600" : "bg-slate-200"}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isAnonymous ? "translate-x-6" : "translate-x-1"}`}
                  />
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Enviando...</>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Enviar Sugerencia
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Suggestions List */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-bold text-slate-800">
            {["employer", "super_admin", "gerencia"].includes(profile?.role || "")
              ? "Todas las Sugerencias"
              : "Mis Sugerencias Identificadas"}
          </h2>

          {suggestions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <MessageSquare className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500">No hay sugerencias para mostrar.</p>
            </div>
          ) : (
            suggestions.map((s) => (
              <div
                key={s.id}
                className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase rounded">
                          {getCategoryLabel(s.category)}
                        </span>
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-50 text-slate-500 text-[10px] font-medium rounded">
                          {getStatusIcon(s.status)}
                          {getStatusLabel(s.status)}
                        </div>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900">
                        {s.subject}
                      </h3>
                    </div>
                    <span className="text-xs text-slate-400">
                      {format(s.createdAt.toDate(), "d MMM, HH:mm", {
                        locale: es,
                      })}
                    </span>
                  </div>

                  <p className="text-slate-600 text-sm whitespace-pre-wrap mb-4">
                    {s.description}
                  </p>

                  {s.attachmentUrl && (
                    <a
                      href={s.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs font-medium text-blue-600 hover:underline mb-4"
                    >
                      <UploadCloud className="w-4 h-4" />
                      Ver evidencia adjunta
                    </a>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                    <div className="flex items-center gap-2">
                      {s.isAnonymous ? (
                        <div className="flex items-center gap-1 text-xs text-slate-400 italic">
                          <Shield className="w-3 h-3" />
                          Anónimo
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                          <User className="w-3 h-3" />
                          {s.authorName}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {["employer", "super_admin", "gerencia"].includes(profile?.role || "") && (
                        <button
                          onClick={() => setSelectedSuggestion(s)}
                          className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Gestionar
                        </button>
                      )}
                      {(["employer", "super_admin", "gerencia"].includes(profile?.role || "") ||
                        isMainAdmin(profile?.email) ||
                        (profile?.uid === s.authorId &&
                          s.status === "received")) && (
                        <button
                          onClick={() => handleDeleteSuggestion(s.id!)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                          title="Eliminar sugerencia"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {s.adminComment && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-[10px] font-bold text-blue-400 uppercase mb-1">
                        Respuesta SST:
                      </p>
                      <p className="text-sm text-blue-900 italic">
                        "{s.adminComment}"
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Delete Suggestion Modal */}
      <ConfirmationModal
        isOpen={!!suggestionToDelete}
        onClose={() => setSuggestionToDelete(null)}
        onConfirm={confirmDeleteSuggestion}
        title="Eliminar Sugerencia"
        message="¿Estás seguro de que deseas eliminar esta sugerencia permanentemente? Esta acción no se puede deshacer."
      />

      {/* Admin Management Modal */}
      {selectedSuggestion && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 space-y-6">
            <h2 className="text-xl font-bold text-slate-900">
              Gestionar Sugerencia
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Comentario / Respuesta
                </label>
                <textarea
                  rows={3}
                  value={adminComment}
                  onChange={(e) => setAdminComment(e.target.value)}
                  placeholder="Escribe una respuesta para el trabajador..."
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() =>
                    handleUpdateStatus(selectedSuggestion.id!, "in_review")
                  }
                  disabled={updatingStatus}
                  className="flex items-center justify-center gap-2 py-3 bg-orange-50 text-orange-600 rounded-xl font-bold hover:bg-orange-100 transition-colors"
                >
                  <AlertCircle className="w-5 h-5" />
                  En Revisión
                </button>
                <button
                  onClick={() =>
                    handleUpdateStatus(selectedSuggestion.id!, "implemented")
                  }
                  disabled={updatingStatus}
                  className="flex items-center justify-center gap-2 py-3 bg-emerald-50 text-emerald-600 rounded-xl font-bold hover:bg-emerald-100 transition-colors"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Implementar
                </button>
                <button
                  onClick={() =>
                    handleUpdateStatus(selectedSuggestion.id!, "dismissed")
                  }
                  disabled={updatingStatus}
                  className="flex items-center justify-center gap-2 py-3 bg-slate-50 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                  Archivar
                </button>
                <button
                  onClick={() => setSelectedSuggestion(null)}
                  className="flex items-center justify-center gap-2 py-3 bg-white text-slate-400 rounded-xl font-bold hover:bg-slate-50 transition-colors border border-slate-100"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
