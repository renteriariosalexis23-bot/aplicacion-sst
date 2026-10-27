import React, { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  deleteDoc,
  doc,
  updateDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { Induction, InductionChecklistItem, UserProfile } from "../types";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { Loader2, UserPlus,
  Plus,
  Trash2,
  FileSignature,
  AlertCircle,
  FileSpreadsheet,
  Check,
  Download,
  X,
  AlertTriangle,
  Search, } from "lucide-react";
import { exportToExcel } from "../utils/exportToExcel";
import SignatureCanvas from "react-signature-canvas";
import { ConfirmationModal } from "./ui/ConfirmationModal";
import { notifyAllEmployers } from "../utils/notifications";
import { INDUCTION_SECTIONS } from "../constants/inductionTopics";
import { addTraceabilitySignature } from "../utils/pdfGenerator";
import { getNormalizedPdfImage } from "../utils/imageUtils";

import { SignerBanner } from "./ui/SignerBanner";
import { PageHeader } from "./ui/PageHeader";

export const Inductions: React.FC = () => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();
  const [inductions, setInductions] = useState<Induction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Form State
  const [workerName, setWorkerName] = useState("");
  const [workerDni, setWorkerDni] = useState("");
  const [workerPosition, setWorkerPosition] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  // Detailed Checklist State
  const [checklist, setChecklist] = useState<InductionChecklistItem[]>(() => {
    return INDUCTION_SECTIONS.flatMap(section => 
      section.items.map(item => ({
        id: item.id,
        topic: item.topic,
        status: "na" as "si" | "no" | "na",
        observations: ""
      }))
    );
  });

  const updateChecklistItem = (id: string, field: "status" | "observations", value: string) => {
    setChecklist(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const [submitting, setSubmitting] = useState(false);
  const [inductionToDelete, setInductionToDelete] = useState<string | null>(
    null,
  );
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [workers, setWorkers] = useState<UserProfile[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");

  const sigCanvas = useRef<SignatureCanvas>(null);


  useEffect(() => {
    if (!profile || !selectedCompany) return;

    if (["employer", "supervisor", "gerencia"].includes(profile.role || "")) {
      const loadWorkers = async () => {
        try {
          const qUsers = query(
            collection(db, "users"),
            where("companyRuc", "==", selectedCompany.ruc),
            where("role", "in", ["worker", "supervisor", "employer", "gerencia"]),
          );
          const userDocs = await getDocs(qUsers);
          setWorkers(
            userDocs.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile),
          );
        } catch (err) {
          console.error("Error cargando trabajadores:", err);
        }
      };
      loadWorkers();
    }

    let q;
    if (profile.role === "worker") {
      q = query(
        collection(db, "inductions"),
        where("companyRuc", "==", selectedCompany.ruc),
        where("workerId", "==", profile.uid),
        orderBy("createdAt", "desc"),
      );
    } else {
      q = query(
        collection(db, "inductions"),
        where("companyRuc", "==", selectedCompany.ruc),
        orderBy("createdAt", "desc"),
      );
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as Induction,
        );
        setInductions(docs);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "inductions");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [profile, selectedCompany]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || profile?.role === "worker") return;
    
    if (!selectedWorkerId) {
       toast.error("Por favor selecciona un trabajador para la inducción.");
       return;
    }

    const sigUrl = profile.digitalSignatureConsent?.signatureUrl || profile.savedSignatureUrl;
    if (!sigUrl) {
      toast.error("Debes configurar tu firma electrónica en tu perfil primero para autorizar la inducción.");
      return;
    }

    setSubmitting(true);

    try {
      await addDoc(collection(db, "inductions"), {
        companyRuc: selectedCompany.ruc,
        workerId: selectedWorkerId,
        workerName,
        workerDni,
        workerPosition,
        date,
        checklist,
        trainerName: profile.displayName || profile.email,
        supervisorId: profile.uid,
        supervisorName: profile.displayName,
        supervisorDni: profile.dni,
        supervisorSignatureUrl: sigUrl,
        status: "pending_worker",
        createdAt: serverTimestamp(),
        createdBy: profile.uid,
      });

      await notifyAllEmployers(
        "Nueva Inducción Registrada",
        `Se ha registrado una inducción a ${workerName} (${workerPosition}) por ${profile.displayName || profile.email}.`,
        "/inductions",
        selectedCompany.ruc,
      );

      setIsAdding(false);

      // Reset Form
      setSelectedWorkerId("");
      setWorkerName("");
      setWorkerDni("");
      setWorkerPosition("");
      setChecklist(INDUCTION_SECTIONS.flatMap(section => 
        section.items.map(item => ({
          id: item.id,
          topic: item.topic,
          status: "na" as "si" | "no" | "na",
          observations: ""
        }))
      ));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "inductions");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    if (!["employer", "super_admin", "gerencia"].includes(profile?.role || "")) return;
    setInductionToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteInduction = async () => {
    if (!inductionToDelete) return;
    try {
      await deleteDoc(doc(db, "inductions", inductionToDelete));
      setInductionToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "inductions");
    }
  };

  const handleDownloadPDF = async (induction: Induction) => {
    import("../utils/pdfGenerator").then(({ generateInductionPDF }) => {
      generateInductionPDF(
        induction,
        INDUCTION_SECTIONS,
        selectedCompany?.businessName || "",
        selectedCompany?.ruc || ""
      );
    });
  };

  const filteredInductions = inductions.filter((ind) => {
    const search = searchTerm.toLowerCase();
    return (
      ind.workerName.toLowerCase().includes(search) ||
      ind.workerDni.includes(search) ||
      (ind.workerPosition && ind.workerPosition.toLowerCase().includes(search))
    );
  });

  const handleExportExcel = () => {
    const dataToExport = filteredInductions.map((i) => {
      const itemsCount = i.checklist ? i.checklist.filter(c => c.status === "si").length : 0;
      return {
        Fecha: i.date,
        Trabajador: i.workerName,
        DNI: i.workerDni,
        Puesto: i.workerPosition,
        "Items Cumplidos (Detallado)": i.checklist ? `${itemsCount} de ${i.checklist.length}` : 'N/A',
        "RISST Entregado": i.receivedRisst ? "SÍ" : "NO",
        "IPERC Capacitado": i.receivedIperc ? "SÍ" : "NO",
        Instructor: i.trainerName,
        Supervisor: i.supervisorName || "PENDIENTE"
      };
    });
    exportToExcel(
      dataToExport,
      `Inducciones_SST_${selectedCompany?.businessName || ""}`,
    );
  };

  if (!selectedCompany) {
    return (
      <div className="p-8 text-center bg-white rounded-xl shadow-sm border border-slate-200">
        <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-700">
          Seleccione una empresa
        </h2>
        <p className="text-slate-500">
          Debe seleccionar una empresa para ver el registro de inducciones.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Inducciones de Nuevo Personal"
        description="Registro Legal Obligatorio para ingreso de trabajadores"
        icon={UserPlus}
        color="sky"
        actions={
          ["employer", "super_admin", "supervisor", "gerencia"].includes(
            profile?.role || "",
          ) && (
            <div className="flex w-full md:w-auto gap-2">
              <button
                onClick={handleExportExcel}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-white/15 text-white rounded-lg hover:bg-white/25 transition font-medium text-sm md:text-base shadow-sm border border-white/30"
              >
                <FileSpreadsheet className="w-4 h-4 md:w-5 md:h-5" />
                Exportar
              </button>
              <button
                onClick={() => setIsAdding(!isAdding)}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-white text-sky-700 rounded-lg hover:bg-sky-50 transition font-medium text-sm md:text-base border border-transparent shadow-sm"
              >
                {isAdding ? (
                  <X className="w-4 h-4 md:w-5 md:h-5" />
                ) : (
                  <Plus className="w-4 h-4 md:w-5 md:h-5" />
                )}
                {isAdding ? "Cancelar" : "Nueva Inducción"}
              </button>
            </div>
          )
        }
      />

      {isAdding && (
        <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6 rounded-r-lg">
            <p className="text-amber-800 text-sm">
              <strong className="block mb-1">Nota Legal:</strong>
              Este formato corresponde al Anexo 4 de la R.M. 050-2013-TR. Es
              obligatorio realizar esta inducción antes de que el trabajador
              inicie sus labores.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Trabajador
                </label>
                <select
                  required
                  value={selectedWorkerId}
                  onChange={(e) => {
                    const wId = e.target.value;
                    setSelectedWorkerId(wId);
                    const worker = workers.find((w) => w.uid === wId);
                    if (worker) {
                      setWorkerName(worker.displayName);
                      setWorkerDni(worker.dni || "");
                      setWorkerPosition(worker.position || "");
                    } else {
                      setWorkerName("");
                      setWorkerDni("");
                      setWorkerPosition("");
                    }
                  }}
                  className="w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">Seleccione un trabajador...</option>
                  {workers.map((w) => (
                    <option key={w.uid} value={w.uid}>
                      {w.displayName} {w.dni ? `(${w.dni})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Puesto de Trabajo
                </label>
                <input
                  type="text"
                  required
                  value={workerPosition}
                  onChange={(e) => setWorkerPosition(e.target.value)}
                  className="w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Fecha de Inducción
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Supervisor a Cargo (Inductor)
                </label>
                <SignerBanner />
              </div>
            </div>

            <h3 className="font-bold text-slate-800 border-b pb-2">
              Checklist de Temas y Entregables Cumplidos
            </h3>

            <div className="overflow-x-auto mt-2">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <th className="p-2 text-left w-12">N°</th>
                    <th className="p-2 text-left">TEMA / CONTENIDO</th>
                    <th className="p-2 text-center w-12">SÍ</th>
                    <th className="p-2 text-center w-12">NO</th>
                    <th className="p-2 text-center w-16">N/A</th>
                    <th className="p-2 text-left w-48">OBSERVACIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {INDUCTION_SECTIONS.map((section, idx) => (
                    <React.Fragment key={idx}>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <td colSpan={6} className="p-2 font-bold text-slate-700 text-xs">
                          {section.title}
                        </td>
                      </tr>
                      {section.items.map((item) => {
                        const checkItem = checklist.find(c => c.id === item.id);
                        return (
                          <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="p-2 text-center font-medium text-slate-500">{item.number}</td>
                            <td className="p-2 text-slate-700 pr-4">{item.topic}</td>
                            <td className="p-2 text-center">
                              <input
                                type="radio"
                                name={`status_${item.id}`}
                                checked={checkItem?.status === "si"}
                                onChange={() => updateChecklistItem(item.id, "status", "si")}
                                className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <input
                                type="radio"
                                name={`status_${item.id}`}
                                checked={checkItem?.status === "no"}
                                onChange={() => updateChecklistItem(item.id, "status", "no")}
                                className="h-4 w-4 text-red-600 border-slate-300 focus:ring-red-500"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <input
                                type="radio"
                                name={`status_${item.id}`}
                                checked={checkItem?.status === "na"}
                                onChange={() => updateChecklistItem(item.id, "status", "na")}
                                className="h-4 w-4 text-slate-400 border-slate-300 focus:ring-slate-500"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="..."
                                value={checkItem?.observations || ""}
                                onChange={(e) => updateChecklistItem(item.id, "observations", e.target.value)}
                                className="w-full text-xs rounded border border-slate-200 px-2 py-1 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-0 shadow-sm"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4 border-t mt-6">
              <button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 text-white px-8 py-2.5 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Procesando..." : "Generar y Firmar como Supervisor"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List of Inductions */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          {profile?.role !== "worker" && (
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar por nombre, DNI o puesto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              />
            </div>
          )}
          {(!isAdding && (["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || ""))) && (
            <SignerBanner className="w-full md:w-auto" />
          )}
        </div>
        <ul className="divide-y divide-slate-100">
          {loading ? (
            <li className="p-8 text-center text-slate-500">
              Cargando registros...
            </li>
          ) : filteredInductions.length === 0 ? (
            <li className="p-8 text-center text-slate-500">
              {inductions.length === 0 
                ? "Aún no hay inducciones registradas en esta empresa." 
                : "No se encontraron inducciones que coincidan con la búsqueda."}
            </li>
          ) : (
            filteredInductions.map((ind) => (
              <li
                key={ind.id}
                className="p-4 hover:bg-slate-50 flex flex-col sm:flex-row items-start justify-between gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-bold text-slate-900 text-lg">
                      {ind.workerName}
                    </h3>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                      DNI: {ind.workerDni}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mb-2">
                    Ingresa a:{" "}
                    <span className="font-semibold text-slate-700">
                      {ind.workerPosition}
                    </span>
                  </p>

                  <div className="flex flex-wrap gap-2 text-xs font-medium">
                    {ind.checklist && ind.checklist.length > 0 ? (
                      <span className="inline-flex items-center text-slate-700 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                        {ind.checklist.filter(c => c.status === "si").length} items cumplidos
                      </span>
                    ) : (
                      <>
                        {ind.receivedRisst && (
                          <span className="inline-flex items-center text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                            <Check className="w-3 h-3 mr-1" /> RISST
                          </span>
                        )}
                        {ind.receivedIperc && (
                          <span className="inline-flex items-center text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                            <Check className="w-3 h-3 mr-1" /> IPERC
                          </span>
                        )}
                        {ind.receivedPolicy && (
                          <span className="inline-flex items-center text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                            <Check className="w-3 h-3 mr-1" /> Política
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  
                  <div className="mt-4 flex flex-col gap-3 w-full max-w-sm border-t border-slate-100 pt-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-xs text-slate-500">Firma del Supervisor SST:</span>
                      {ind.supervisorSignatureUrl ? (
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <img
                              src={ind.supervisorSignatureUrl}
                              alt="Firma Supervisor"
                              className="h-10 object-contain bg-slate-50 border border-slate-200 rounded px-1"
                            />
                            <span className="text-[10px] text-slate-400 mt-1 leading-tight">{ind.supervisorName}</span>
                          </div>
                          <span className="bg-emerald-100 text-emerald-700 font-medium px-2 py-1 rounded text-xs flex items-center">
                            <Check className="w-3 h-3 mr-1" /> Validado
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between bg-amber-50 p-2 rounded-lg border border-amber-100">
                          <div className="flex items-center text-amber-700 text-xs font-semibold">
                            <AlertTriangle className="w-3 h-3 mr-1" /> Pendiente
                          </div>
                          {(["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "")) && (
                            <button
                              onClick={async () => {
                                const sigUrl = profile.digitalSignatureConsent?.signatureUrl || profile.savedSignatureUrl;
                                if (!sigUrl) {
                                  toast.error("Debes configurar tu firma electrónica en tu perfil primero.");
                                  return;
                                }
                                try {
                                  await updateDoc(doc(db, "inductions", ind.id!), {
                                    supervisorSignatureUrl: sigUrl,
                                    supervisorName: profile.displayName,
                                    supervisorDni: profile.dni,
                                    supervisorId: profile.uid,
                                    status: "signed"
                                  });
                                } catch (err) {
                                  console.error("Error signing:", err);
                                }
                              }}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition"
                            >
                              <FileSignature className="w-3 h-3 inline mr-1" />
                              Firmar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 border-t border-slate-50 pt-2">
                      <span className="font-medium text-xs text-slate-500">Firma del Trabajador:</span>
                      {(ind.workerSignatureUrl || ind.signatureBase64) ? (
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <img
                              src={ind.workerSignatureUrl || ind.signatureBase64}
                              alt="Firma Trabajador"
                              className="h-10 object-contain bg-slate-50 border border-slate-200 rounded px-1"
                            />
                            <span className="text-[10px] text-slate-400 mt-1 leading-tight">{ind.workerName}</span>
                          </div>
                          <span className="bg-emerald-100 text-emerald-700 font-medium px-2 py-1 rounded text-xs flex items-center">
                            <Check className="w-3 h-3 mr-1" /> Firmado
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between bg-amber-50 p-2 rounded-lg border border-amber-100">
                          <div className="flex items-center text-amber-700 text-xs font-semibold">
                            <AlertTriangle className="w-3 h-3 mr-1" /> Pendiente
                          </div>
                          {profile?.uid === ind.workerId && (
                            <button
                              onClick={async () => {
                                const sigUrl = profile.digitalSignatureConsent?.signatureUrl || profile.savedSignatureUrl;
                                if (!sigUrl) {
                                  toast.error("Debes configurar tu firma electrónica en tu perfil primero.");
                                  return;
                                }
                                try {
                                  await updateDoc(doc(db, "inductions", ind.id!), {
                                    workerSignatureUrl: sigUrl,
                                    status: "completed"
                                  });
                                } catch (err) {
                                  console.error("Error signing:", err);
                                }
                              }}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition"
                            >
                              <FileSignature className="w-3 h-3 inline mr-1" />
                              Firmar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 w-full sm:w-auto shrink-0 justify-between">
                  <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2 py-1 rounded-full w-fit">
                    {new Date(ind.date + "T00:00:00").toLocaleDateString()}
                  </span>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownloadPDF(ind)}
                      className="px-3 py-1.5 flex items-center justify-center gap-1 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-100 transition"
                    >
                      <Download className="w-4 h-4" /> PDF Oficial
                    </button>
                    {["employer", "super_admin", "gerencia"].includes(
                      profile?.role || "",
                    ) && (
                      <button
                        onClick={() => handleDelete(ind.id!)}
                        className="px-2 py-1.5 flex items-center justify-center gap-1 bg-red-50 text-red-600 rounded-lg text-sm font-semibold hover:bg-red-100 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setInductionToDelete(null);
        }}
        onConfirm={confirmDeleteInduction}
        title="Eliminar Registro de Inducción"
        message="¿Estás seguro de eliminar este registro de inducción legal? Esta acción no se puede deshacer."
      />
    </div>
  );
};
