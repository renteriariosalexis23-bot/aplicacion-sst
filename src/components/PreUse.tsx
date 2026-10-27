import React, { useState, useEffect } from "react";
import { SignerBanner } from "./ui/SignerBanner";
import { PageHeader } from "./ui/PageHeader";
import { useSearchParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  Timestamp,
  deleteDoc,
} from "firebase/firestore";
import { Equipment, PreUseInspection } from "../types";
import { Loader2, Truck,
  ShieldAlert,
  CheckCircle,
  Plus,
  Wrench,
  Clock,
  ShieldCheck,
  Settings,
  FileSignature,
  AlertTriangle,
  AlertCircle,
  X,
  Download,
  Trash2,
  FileSpreadsheet,
  Camera, } from "lucide-react";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import SignatureCanvas from "react-signature-canvas";
import { generatePreUsePDF } from "../utils/pdfGenerator";
import { exportToExcel } from "../utils/exportToExcel";
import { uploadToCloudinary } from "../utils/cloudinary";
import { ConfirmationModal } from "./ui/ConfirmationModal";
import { notifyAllEmployers } from "../utils/notifications";

export const PreUse: React.FC = () => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();

  const [activeTab, setActiveTab] = useState<
    "my_equipment" | "manage_equipment" | "history"
  >("my_equipment");
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [inspections, setInspections] = useState<PreUseInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Management State
  const [isCreatingEquipment, setIsCreatingEquipment] = useState(false);
  const [newEqName, setNewEqName] = useState("");
  const [newEqCode, setNewEqCode] = useState("");
  const [newEqType, setNewEqType] = useState("Vehículo");
  const [checklistTemplate, setChecklistTemplate] = useState<
    { question: string; isCritical: boolean }[]
  >([
    { question: "Nivel de aceite de motor ok", isCritical: true },
    { question: "Nivel líquido de frenos ok", isCritical: true },
    { question: "Llantas en buen estado", isCritical: true },
    { question: "Luces delanteras y traseras operativas", isCritical: false },
    { question: "Espejos completos", isCritical: false },
  ]);

  // Inspection State
  const [inspectingFor, setInspectingFor] = useState<Equipment | null>(null);
  const [checkResults, setCheckResults] = useState<
    { isOk: boolean; comment: string }[]
  >([]);
  const sigCanvas = React.useRef<SignatureCanvas>(null);
  const [usingSavedSignature, setUsingSavedSignature] = useState(false);
  const [generalPhotoFiles, setGeneralPhotoFiles] = useState<File[]>([]);
  const [generalPhotosPreviews, setGeneralPhotosPreviews] = useState<
    { url: string; name: string; type: string }[]
  >([]);

  // Deletion modals state
  const [equipmentToDelete, setEquipmentToDelete] = useState<string | null>(
    null,
  );
  const [isEquipmentDeleteModalOpen, setIsEquipmentDeleteModalOpen] =
    useState(false);
  const [inspectionToDelete, setInspectionToDelete] = useState<string | null>(
    null,
  );
  const [isInspectionDeleteModalOpen, setIsInspectionDeleteModalOpen] =
    useState(false);

  const [searchParams] = useSearchParams();
  const eqId = searchParams.get("eq");
  const navigate = useNavigate();

  const startInspection = (eq: Equipment) => {
    if (eq.inspectionTemplateId) {
      navigate(`/inspections?eq=${eq.id}`);
      return;
    }
    setInspectingFor(eq);
    setCheckResults((eq.checklistItems || []).map(() => ({ isOk: true, comment: "" })));
  };

  useEffect(() => {
    if (eqId && equipments.length > 0 && !inspectingFor) {
      const targetEq = equipments.find((eq) => eq.id === eqId);
      if (targetEq) {
        if (targetEq.inspectionTemplateId) {
           navigate(`/inspections?eq=${targetEq.id}`);
        } else {
           startInspection(targetEq);
        }
      }
    }
  }, [eqId, equipments, inspectingFor, navigate]);


  useEffect(() => {
    if (!profile) return;
    const ruc =
      ["employer", "super_admin", "gerencia"].includes(profile.role || "") ? selectedCompany?.ruc : profile.companyRuc;
    if (!ruc) {
      setLoading(false);
      return;
    }

    const qEq = query(
      collection(db, "equipment"),
      where("companyRuc", "==", ruc),
    );
    const unsubscribeEq = onSnapshot(
      qEq,
      (snapshot) => {
        setEquipments(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Equipment[],
        );
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, "equipment"),
    );

    return () => unsubscribeEq();
  }, [profile, selectedCompany]);

  useEffect(() => {
    if (!profile) return;
    const ruc =
      ["employer", "super_admin", "gerencia"].includes(profile.role || "") ? selectedCompany?.ruc : profile.companyRuc;
    if (!ruc) return;

    // El trabajador solo recibe sus propias inspecciones pre-uso
    const isWorkerView = profile.role === "worker";
    const qIns = isWorkerView
      ? query(
          collection(db, "preuse_inspections"),
          where("companyRuc", "==", ruc),
          where("workerUid", "==", profile.uid),
        )
      : query(
          collection(db, "preuse_inspections"),
          where("companyRuc", "==", ruc),
          orderBy("date", "desc"),
        );

    const unsubscribeIns = onSnapshot(qIns, (snapshot) => {
      const list = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as PreUseInspection[];
      if (isWorkerView) {
        list.sort(
          (a: any, b: any) => (b.date?.toMillis?.() ?? 0) - (a.date?.toMillis?.() ?? 0),
        );
      }
      setInspections(list);
    });

    return () => unsubscribeIns();
  }, [profile, selectedCompany]);

  const handleAddTemplateItem = () => {
    setChecklistTemplate([
      ...checklistTemplate,
      { question: "", isCritical: false },
    ]);
  };

  const handleAddGeneralPhoto = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files);
    setGeneralPhotoFiles((prev) => [...prev, ...newFiles]);

    const newPreviews = newFiles.map((file) => ({
      url: URL.createObjectURL(file),
      name: file.name,
      type: file.type.startsWith("video/") ? "video" : "image",
    }));
    setGeneralPhotosPreviews((prev) => [...prev, ...newPreviews]);
  };

  const handleRemoveGeneralPhoto = (index: number) => {
    setGeneralPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setGeneralPhotosPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const ruc =
      ["employer", "super_admin", "gerencia"].includes(profile.role || "") ? selectedCompany?.ruc : profile.companyRuc;
    if (!ruc) return;

    try {
      await addDoc(collection(db, "equipment"), {
        companyRuc: ruc,
        name: newEqName,
        code: newEqCode,
        type: newEqType,
        status: "operative",
        checklistItems: checklistTemplate.filter(
          (t) => t.question.trim().length > 0,
        ),
        createdAt: Timestamp.now(),
      });
      setIsCreatingEquipment(false);
      setNewEqName("");
      setNewEqCode("");
      setChecklistTemplate([]);
      toast.success("Equipo registrado exitosamente.");
    } catch (err) {
      console.error(err);
      toast.error("Error al crear equipo.");
    }
  };

  const handleDeleteEquipment = (id: string) => {
    setEquipmentToDelete(id);
    setIsEquipmentDeleteModalOpen(true);
  };

  const confirmDeleteEquipment = async () => {
    if (!equipmentToDelete) return;
    try {
      await deleteDoc(doc(db, "equipment", equipmentToDelete));
      toast.success("Equipo eliminado exitosamente.");
      setEquipmentToDelete(null);
    } catch (err) {
      console.error("Error al eliminar equipo:", err);
      toast.error("Error al eliminar el equipo.");
    }
  };


  const handleDownloadPDF = async (ins: PreUseInspection) => {
    try {
      const blob = await generatePreUsePDF(ins);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PreUso_${ins.equipmentCode}_${new Date(ins.date?.toDate ? ins.date.toDate() : (ins.date as any)).getTime()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Error al descargar PDF:", e);
      toast.error("Hubo un error al generar el PDF.");
    }
  };

  const handleDeleteInspection = (id: string) => {
    setInspectionToDelete(id);
    setIsInspectionDeleteModalOpen(true);
  };

  const confirmDeleteInspection = async () => {
    if (!inspectionToDelete) return;
    try {
      await deleteDoc(doc(db, "preuse_inspections", inspectionToDelete));
      toast.success("Inspección eliminada exitosamente.");
      setInspectionToDelete(null);
    } catch (err) {
      console.error("Error capturado:", err);
      toast.error("Error al eliminar la inspección.");
    }
  };

  const submitInspection = async () => {
    if (!inspectingFor || submitting) return;
    if (!profile?.dni) {
      toast.error(
        "Es obligatorio registrar su DNI en su perfil ('Mi Perfil') para poder firmar digitalmente.",
      );
      return;
    }
    if (!usingSavedSignature && sigCanvas.current?.isEmpty()) {
      toast.error("Firma requerida. Dibuja tu firma o marca usar tu firma guardada.");
      return;
    }

    const ruc =
      ["employer", "super_admin", "gerencia"].includes(profile?.role || "") ? selectedCompany?.ruc : profile?.companyRuc;
    if (!ruc || !profile) return;

    // Evaluate Operativity
    let isOperative = true;
    checkResults.forEach((val, idx) => {
      const isCritical = (inspectingFor.checklistItems || [])[idx]?.isCritical;
      if (!val.isOk && isCritical) isOperative = false;
    });

    const signature =
      usingSavedSignature && profile.savedSignatureUrl
        ? profile.savedSignatureUrl
        : sigCanvas.current!.getTrimmedCanvas().toDataURL("image/png");

    let basicPreUseData: any = {
      companyRuc: ruc,
      equipmentId: inspectingFor.id,
      equipmentName: inspectingFor.name,
      equipmentCode: inspectingFor.code,
      workerUid: profile.uid,
      workerName: profile.displayName || profile.email,
      workerDni: profile.dni || "No registrado",
      date: Timestamp.now(),
      items: (inspectingFor.checklistItems || []).map((c, i) => ({
        question: c.question,
        isCritical: c.isCritical,
        isOk: checkResults[i].isOk,
        comment: checkResults[i].comment,
      })),
      isOperative,
      signatureBase64: signature,
      generalPhotoFiles,
    };

    try {
      setSubmitting(true);
      if (!navigator.onLine) {
        // We need to await the dynamic import or just standard import
        const { savePendingPreUse } = await import("../utils/offlineSync");
        await savePendingPreUse(basicPreUseData);
        setGeneralPhotoFiles([]);
        setGeneralPhotosPreviews([]);
        setInspectingFor(null);
        toast[isOperative ? 'success' : 'error'](
          isOperative
            ? "Inspección guardada SIN CONEXIÓN. Se subirá automáticamente al recuperar internet."
            : "Inspección Crítica Guardada SIN CONEXIÓN. ¡Recuerde subirla apenas tenga internet!"
        );
        return;
      }

      delete basicPreUseData.generalPhotoFiles;

      let attachmentUrls = [];
      if (generalPhotoFiles && generalPhotoFiles.length > 0) {
        for (const file of generalPhotoFiles) {
          const url = await uploadToCloudinary(file);
          attachmentUrls.push({
            url,
            name: file.name,
            type: file.type.startsWith("image/") ? "image" : "video",
          });
        }
      }

      const finalData: any = {
        ...basicPreUseData,
        signature,
      };

      if (attachmentUrls.length > 0) {
        finalData.attachmentUrls = attachmentUrls;
      }

      await addDoc(collection(db, "preuse_inspections"), finalData);

      setGeneralPhotoFiles([]);
      setGeneralPhotosPreviews([]);
      
      // Notify employers
      await notifyAllEmployers(
        !isOperative
          ? "Equipo Inoperativo Reportado"
          : "Checklist Pre-Uso Registrado",
        `El trabajador ${profile.displayName} ha registrado un checklist para el equipo ${inspectingFor.name}${!isOperative ? " y lo marcó como INOPERATIVO." : "."}`,
        "/preuse",
        ruc,
      );

      // Update Equipment Status if it changed
      if (inspectingFor.status === "operative" && !isOperative) {
        await updateDoc(doc(db, "equipment", inspectingFor.id!), {
          status: "inoperative",
        });
      } else if (inspectingFor.status === "inoperative" && isOperative) {
        await updateDoc(doc(db, "equipment", inspectingFor.id!), {
          status: "operative",
        });
      }

      setInspectingFor(null);
      toast[isOperative ? 'success' : 'error'](
        isOperative
          ? "Inspección completada con éxito. Equipo Operativo."
          : "¡Alerta! Equipo marcado como INOPERATIVO."
      );
    } catch (err) {
      console.error(err);
      toast.error("Error al registrar inspección");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportExcel = () => {
    const formattedData = inspections.map((ins) => ({
      ID: ins.id,
      Trabajador: ins.workerName,
      Equipo: ins.equipmentName,
      Código: ins.equipmentCode,
      Estado: ins.isOperative ? "OPERATIVO" : "INOPERATIVO",
      Fecha: ins.date ? new Date(ins.date.toDate()).toLocaleString() : "N/A",
      Fallas_Encontradas:
        (ins.items || [])
          .filter((i) => !i.isOk)
          .map((i) => i.question)
          .join(" | ") || "Ninguna",
      Comentarios: (ins.items || [])
        .map((i) => i.comment)
        .filter((c) => c)
        .join(" | "),
    }));
    exportToExcel(formattedData, "Inspecciones_PreUso");
  };

  if (loading)
    return <div className="p-8 text-center text-slate-500">Cargando...</div>;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Checklist Pre-Uso de Equipos"
        description="Inspecciones diarias para vehículos y maquinaria operativa"
        icon={Truck}
      />

      <div className="flex overflow-x-auto bg-slate-100 p-1 rounded-xl mb-6 w-fit">
        <button
          onClick={() => setActiveTab("my_equipment")}
          className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all whitespace-nowrap flex items-center ${activeTab === "my_equipment" ? "bg-white text-sky-600 shadow-sm" : "text-slate-600"}`}
        >
          <Truck className="w-4 h-4 mr-2" />
          Realizar Inspección Pre-Uso
        </button>
        {["employer", "supervisor", "super_admin", "gerencia"].includes(
          profile?.role || "",
        ) && (
          <>
            <button
              onClick={() => setActiveTab("manage_equipment")}
              className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all whitespace-nowrap flex items-center ${activeTab === "manage_equipment" ? "bg-white text-blue-600 shadow-sm" : "text-slate-600"}`}
            >
              <Settings className="w-4 h-4 mr-2" />
              Gestión de Equipos
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all whitespace-nowrap flex items-center ${activeTab === "history" ? "bg-white text-blue-600 shadow-sm" : "text-slate-600"}`}
            >
              <FileSignature className="w-4 h-4 mr-2" />
              Historial de Inspecciones
            </button>
          </>
        )}
      </div>

      {!inspectingFor ? (
        <>
          {activeTab === "my_equipment" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-slate-800">
                Seleccionar Equipo o Vehículo
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {equipments.map((eq) => {
                  const misInspections = inspections.filter(
                    (i) =>
                      i.equipmentId === eq.id && i.workerUid === profile?.uid,
                  );
                  const lastInspection =
                    misInspections.length > 0 ? misInspections[0] : null;
                  const doneToday =
                    lastInspection?.date &&
                    new Date(lastInspection.date.toDate()).toDateString() ===
                      new Date().toDateString();

                  return (
                    <div
                      key={eq.id}
                      className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                          <Wrench className="w-6 h-6" />
                        </div>
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${eq.status === "operative" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}
                        >
                          {eq.status === "operative"
                            ? "OPERATIVO"
                            : "INOPERATIVO"}
                        </span>
                      </div>
                      <h3 className="font-bold text-slate-900 text-lg">
                        {eq.name}
                      </h3>
                      <p className="text-slate-500 font-mono text-sm">
                        {eq.type} | Placa/Cód: {eq.code}
                      </p>

                      <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-3">
                        {doneToday ? (
                          <div className="text-sm text-emerald-600 flex items-center bg-emerald-50 px-3 py-2 rounded-lg font-medium">
                            <CheckCircle className="w-4 h-4 mr-2 shrink-0" />
                            Ya realizaste tu checklist hoy para este equipo.
                          </div>
                        ) : (
                          <button
                            onClick={() => startInspection(eq)}
                            className="w-full py-2 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white font-medium rounded-lg transition-colors border border-blue-200 hover:border-blue-600"
                          >
                            Iniciar Checklist Pre-Uso
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "manage_equipment" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-slate-800">
                  Directorio de Equipos
                </h2>
                <button
                  onClick={() => setIsCreatingEquipment(!isCreatingEquipment)}
                  className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900"
                >
                  Nuevo Equipo
                </button>
              </div>

              {isCreatingEquipment && (
                <form
                  onSubmit={handleCreateEquipment}
                  className="bg-slate-50 p-6 rounded-xl border border-slate-200"
                >
                  <h3 className="font-bold text-slate-800 mb-4">
                    Registrar Nuevo Equipo/Vehículo
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Nombre (Ref)
                      </label>
                      <input
                        type="text"
                        value={newEqName}
                        onChange={(e) => setNewEqName(e.target.value)}
                        required
                        className="w-full border border-slate-300 rounded-lg p-2 bg-white"
                        placeholder="Ej. Camioneta Toyota 4x4"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Código/Placa
                      </label>
                      <input
                        type="text"
                        value={newEqCode}
                        onChange={(e) => setNewEqCode(e.target.value)}
                        required
                        className="w-full border border-slate-300 rounded-lg p-2 bg-white"
                        placeholder="Ej. ABX-123"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Tipo
                      </label>
                      <input
                        type="text"
                        value={newEqType}
                        onChange={(e) => setNewEqType(e.target.value)}
                        required
                        className="w-full border border-slate-300 rounded-lg p-2 bg-white"
                        placeholder="Ej. Vehículo Liviano"
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-4 mt-4">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-medium text-slate-700">
                        Checklist Pre-Uso Diario (Preguntas)
                      </h4>
                      <button
                        type="button"
                        onClick={handleAddTemplateItem}
                        className="text-sm bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg flex items-center"
                      >
                        <Plus className="w-4 h-4 mr-1" /> Añadir Pregunta
                      </button>
                    </div>
                    <div className="space-y-3">
                      {checklistTemplate.map((item, index) => (
                        <div key={index} className="flex gap-3 items-center">
                          <input
                            type="text"
                            value={item.question}
                            required
                            onChange={(e) => {
                              const nt = [...checklistTemplate];
                              nt[index].question = e.target.value;
                              setChecklistTemplate(nt);
                            }}
                            className="flex-1 border border-slate-300 rounded-lg p-2 bg-white"
                            placeholder="Ej. Llantas en buen estado"
                          />
                          <label className="flex items-center text-sm font-medium text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.isCritical}
                              onChange={(e) => {
                                const nt = [...checklistTemplate];
                                nt[index].isCritical = e.target.checked;
                                setChecklistTemplate(nt);
                              }}
                              className="mr-2 rounded text-red-600 focus:ring-red-500"
                            />
                            Ítem CRÍTICO (Bloquea equipo)
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setChecklistTemplate(
                                checklistTemplate.filter((_, i) => i !== index),
                              )
                            }
                            className="p-2 text-red-500 hover:bg-red-50 rounded"
                          >
                            <AlertCircle className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end">
                    <button
                      type="submit"
                      className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold"
                    >
                      Guardar Equipo
                    </button>
                  </div>
                </form>
              )}

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-6 py-4 font-medium">Nombre / Equipo</th>
                      <th className="px-6 py-4 font-medium">Código/Placa</th>
                      <th className="px-6 py-4 font-medium">Estado</th>
                      <th className="px-6 py-4 font-medium text-right">
                        Ítems a Revisar
                      </th>
                      {["employer", "super_admin", "gerencia"].includes(
                        profile?.role || "",
                      ) && (
                        <th className="px-6 py-4 font-medium text-right">
                          Acciones
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {equipments.map((eq) => (
                      <tr key={eq.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-bold text-slate-800">
                          {eq.name}{" "}
                          <span className="text-slate-400 font-normal ml-2">
                            {eq.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-slate-600">
                          {eq.code}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-bold ${eq.status === "operative" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}
                          >
                            {eq.status === "operative"
                              ? "OPERATIVO"
                              : "INOPERATIVO"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-slate-500">
                          {(eq.checklistItems || []).length} ítems configurados
                        </td>
                        {["employer", "super_admin", "gerencia"].includes(
                          profile?.role || "",
                        ) && (
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleDeleteEquipment(eq.id!)}
                              className="text-slate-400 hover:text-red-500 transition-colors p-2"
                              title="Eliminar Configuración de Equipo"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col justify-between items-start gap-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center w-full gap-4">
                  <h3 className="font-semibold text-slate-800">
                    Registros de Inspecciones Pre-Uso
                  </h3>
                  <button
                    onClick={handleExportExcel}
                    className="flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Exportar a Excel
                  </button>
                </div>
                {(["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "")) && (
                  <SignerBanner className="w-full" />
                )}
              </div>
              <div className="divide-y divide-slate-200">
                {inspections.map((ins) => (
                  <div
                    key={ins.id}
                    className="p-4 flex flex-col md:flex-row gap-4 justify-between items-start"
                  >
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-bold text-slate-900">
                          {ins.equipmentName} ({ins.equipmentCode})
                        </h4>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold ${ins.isOperative ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}
                        >
                          {ins.isOperative ? "OPERATIVO" : "INOPERATIVO"}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 mb-2">
                        Inspeccionado por:{" "}
                        <span className="font-semibold">{ins.workerName}</span>{" "}
                        el {new Date(ins.date?.toDate()).toLocaleString()}
                      </p>

                      <div className="flex flex-col gap-1 mt-3 pl-3 border-l-2 border-slate-200">
                        {(ins.items || []).map((item, idx) => (
                          <div key={idx} className="flex items-start text-xs">
                            {item.isOk ? (
                              <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 mr-1" />
                            ) : (
                              <AlertTriangle className="w-3 h-3 text-red-500 mt-0.5 mr-1" />
                            )}
                            <span
                              className={
                                !item.isOk
                                  ? "text-red-700 font-medium"
                                  : "text-slate-600"
                              }
                            >
                              {item.question}{" "}
                              {item.comment && ` - Nota: ${item.comment}`}
                            </span>
                          </div>
                        ))}
                      </div>

                      {ins.attachmentUrls && ins.attachmentUrls.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-slate-100 w-full col-span-full">
                          <p className="text-xs font-semibold text-slate-800 uppercase tracking-wider mb-2">
                            Evidencia Adjunta:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {(ins.attachmentUrls || []).map((photo, pIdx) => (
                              <div
                                key={pIdx}
                                className="block h-20 w-20 relative rounded-md overflow-hidden border border-slate-200 group"
                              >
                                {photo.type === "image" ? (
                                  <a
                                    href={photo.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full h-full block"
                                  >
                                    <img
                                      src={photo.url}
                                      alt="Evidencia"
                                      className="w-full h-full object-cover group-hover:opacity-90"
                                      referrerPolicy="no-referrer"
                                    />
                                  </a>
                                ) : (
                                  <a
                                    href={photo.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full h-full bg-black flex items-center justify-center hover:opacity-90"
                                  >
                                    <span className="text-white text-[10px] font-medium">Video</span>
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-center gap-2 w-full md:w-auto">
                      <div className="flex flex-col gap-3 w-full border border-slate-200 rounded-lg p-3 bg-slate-50">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs text-slate-500 font-medium">
                            Firma del Trabajador
                          </span>
                          <img
                            src={ins.signature}
                            alt="Firma"
                            className="h-10 border border-slate-200 bg-white rounded object-contain px-1"
                          />
                        </div>
                        
                        <div className="flex flex-col items-center gap-1 border-t border-slate-200 pt-2 w-full">
                          <span className="text-xs text-slate-500 font-medium text-center">
                            Firma de Supervisor SST
                          </span>
                          {ins.supervisorSignatureUrl ? (
                            <div className="flex flex-col items-center">
                               <img
                                src={ins.supervisorSignatureUrl}
                                alt="Firma Supervisor"
                                className="h-10 border border-slate-200 bg-white rounded object-contain px-1 mb-1"
                              />
                              <span className="text-[10px] text-slate-400 font-medium leading-tight text-center">{ins.supervisorName}</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center w-full gap-2">
                               <div className="flex items-center text-amber-600 text-[10px] font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
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
                                        import("firebase/firestore").then(({ updateDoc, doc }) => {
                                          updateDoc(doc(db, "preuse_inspections", ins.id!), {
                                            supervisorSignatureUrl: sigUrl,
                                            supervisorName: profile.displayName,
                                            supervisorDni: profile.dni,
                                            supervisorId: profile.uid,
                                            status: "signed"
                                          });
                                        });
                                      } catch (err) {
                                        console.error("Error signing:", err);
                                      }
                                    }}
                                    className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition w-full"
                                  >
                                    <FileSignature className="w-3 h-3 inline mr-1" />
                                    Firmar
                                  </button>
                               )}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex gap-2 w-full mt-1">
                        <button
                          onClick={() => handleDownloadPDF(ins)}
                          className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1.5 rounded transition-colors"
                        >
                          <Download className="w-3 h-3" /> PDF
                        </button>
                        {["employer", "super_admin", "supervisor", "gerencia"].includes(
                          profile?.role || "",
                        ) && (
                          <button
                            onClick={() => handleDeleteInspection(ins.id!)}
                            className="flex items-center justify-center p-1.5 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded transition-colors"
                            title="Eliminar registro"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {inspections.length === 0 && (
                  <div className="p-8 text-center text-slate-500">
                    No hay registros de inspección.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 md:p-8 max-w-3xl mx-auto">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-1">
                Checklist Pre-Uso
              </h2>
              <p className="text-blue-600 font-semibold">
                {inspectingFor.name}{" "}
                <span className="text-slate-500 font-mono font-normal">
                  | {inspectingFor.code}
                </span>
              </p>
            </div>
            <button
              onClick={() => setInspectingFor(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8 flex text-blue-800 text-sm">
            <AlertCircle className="w-5 h-5 mr-3 shrink-0" />
            <p>
              Debe responder obligatoriamente todos los ítems. Si marca un ítem{" "}
              <span className="font-bold text-red-600">CRÍTICO</span> como "Mal
              Estado", el equipo quedará reportado como{" "}
              <span className="font-bold text-red-600">INOPERATIVO</span> y se
              generará un reporte automático.
            </p>
          </div>

          <div className="space-y-4 mb-8">
            {(inspectingFor.checklistItems || []).map((item, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border ${item.isCritical ? "border-amber-200 bg-amber-50/30" : "border-slate-200 bg-slate-50"}`}
              >
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">
                      {item.question}
                    </p>
                    {item.isCritical && (
                      <span className="text-[10px] uppercase font-bold text-red-600 tracking-wider">
                        Ítem Crítico
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex bg-white rounded-lg p-1 border border-slate-300">
                      <button
                        onClick={() => {
                          const nr = [...checkResults];
                          nr[idx].isOk = true;
                          setCheckResults(nr);
                        }}
                        className={`px-4 py-1.5 rounded-md text-sm font-bold ${checkResults[idx].isOk ? "bg-emerald-500 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"}`}
                      >
                        OK / Bueno
                      </button>
                      <button
                        onClick={() => {
                          const nr = [...checkResults];
                          nr[idx].isOk = false;
                          setCheckResults(nr);
                        }}
                        className={`px-4 py-1.5 rounded-md text-sm font-bold ${!checkResults[idx].isOk ? "bg-red-500 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"}`}
                      >
                        N/A / Malo
                      </button>
                    </div>
                    {!checkResults[idx].isOk && (
                      <input
                        type="text"
                        placeholder="Motivo breve..."
                        value={checkResults[idx].comment}
                        onChange={(e) => {
                          const nr = [...checkResults];
                          nr[idx].comment = e.target.value;
                          setCheckResults(nr);
                        }}
                        className="text-sm border-b-2 border-red-300 focus:border-red-500 bg-transparent px-2 py-1 outline-none w-full sm:w-48"
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-8">
            <h3 className="font-bold text-slate-800 mb-2">
              Firma de Certificación Diaria
            </h3>
            {/* Evidencia Fotográfica */}
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Evidencia Fotográfica / Adicional (Opcional)
              </label>
              <p className="text-xs text-slate-500 mb-3">
                Si lo deseas, puedes adjuntar fotos o videos generales del equipo
                (ej. si el equipo está inoperativo, toma foto a la falla).
              </p>
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={(e) => handleAddGeneralPhoto(e.target.files)}
                className="hidden"
                id="preuse-general-photo"
              />
              <label
                htmlFor="preuse-general-photo"
                className="inline-flex items-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 cursor-pointer font-medium text-sm transition-colors cursor-pointer"
              >
                <Camera className="w-4 h-4 mr-2" />
                Añadir Archivos
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

            <p className="text-sm text-slate-600 mb-4">
              Declaro bajo juramento que los datos ingresados en esta inspección
              reflejan el estado real del equipo al inicio de mi jornada.
            </p>

            <SignerBanner className="mb-4" />

            {profile?.savedSignatureUrl && (
              <div className="mb-4">
                <label className="flex items-center space-x-2 text-sm font-medium text-slate-700 bg-white p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors w-max shadow-sm">
                  <input
                    type="checkbox"
                    checked={usingSavedSignature}
                    onChange={(e) => setUsingSavedSignature(e.target.checked)}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 rounded"
                  />
                  <span>Utilizar mi firma electrónica guardada</span>
                </label>
              </div>
            )}

            {!usingSavedSignature ? (
              <>
                <div className="border border-slate-300 rounded-xl bg-white overflow-hidden shadow-inner w-full max-w-sm">
                  <SignatureCanvas
                    ref={sigCanvas}
                    canvasProps={{ className: "w-full h-32" }}
                  />
                </div>
                <button
                  onClick={() => sigCanvas.current?.clear()}
                  className="mt-2 text-sm text-slate-500 font-medium hover:text-slate-700"
                >
                  Limpiar firma
                </button>
              </>
            ) : (
              <div className="w-full max-w-sm bg-white p-4 rounded border border-slate-200 flex justify-center shadow-inner">
                <img
                  src={profile!.savedSignatureUrl!}
                  alt="Firma Guardada"
                  className="h-20 object-contain"
                />
              </div>
            )}
          </div>

          <div className="flex gap-4 pt-6 border-t border-slate-200">
            <button
              disabled={submitting}
              onClick={() => setInspectingFor(null)}
              className="flex-1 py-3 border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              disabled={submitting}
              onClick={submitInspection}
              className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Guardando...</> : "Guardar Inspección"}
            </button>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={isEquipmentDeleteModalOpen}
        onClose={() => {
          setIsEquipmentDeleteModalOpen(false);
          setEquipmentToDelete(null);
        }}
        onConfirm={confirmDeleteEquipment}
        title="Eliminar Equipo"
        message="¿Está seguro de que desea eliminar este equipo? Esto solo eliminará la configuración del equipo, no el historial de inspecciones previas."
      />

      <ConfirmationModal
        isOpen={isInspectionDeleteModalOpen}
        onClose={() => {
          setIsInspectionDeleteModalOpen(false);
          setInspectionToDelete(null);
        }}
        onConfirm={confirmDeleteInspection}
        title="Eliminar Registro de Inspección"
        message="¿Está seguro de que desea eliminar este registro de inspección de pre-uso? Esta acción no se puede deshacer."
      />
    </div>
  );
};
