import React, { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  Timestamp,
  writeBatch,
  increment,
} from "firebase/firestore";
import { EppItem, EppDelivery, UserProfile } from "../types";
import { Loader2, Shield,
  Plus,
  Package,
  FileSignature,
  AlertTriangle,
  CheckCircle,
  Clock,
  Trash2,
  X,
  Users,
  Search,
  Download, } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import { exportToExcel } from "../utils/exportToExcel";
import { generateEppDeliveryPdf } from "../utils/pdfGenerator";
import { ConfirmationModal } from "./ui/ConfirmationModal";
import { notifyAllEmployers } from "../utils/notifications";
import { sendNotification } from "../utils/notificationUtils";

import { SignerBanner } from "./ui/SignerBanner";
import { PageHeader } from "./ui/PageHeader";

export const Epps: React.FC = () => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();

  const [activeTab, setActiveTab] = useState<
    "dashboard" | "catalog" | "deliveries"
  >("dashboard");
  const [catalog, setCatalog] = useState<EppItem[]>([]);
  const [deliveries, setDeliveries] = useState<EppDelivery[]>([]);
  const [workers, setWorkers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Create / Deliver States
  const [isCreatingEpp, setIsCreatingEpp] = useState(false);
  const [isDelivering, setIsDelivering] = useState(false);

  // New EPP State
  const [newEppName, setNewEppName] = useState("");
  const [newEppDesc, setNewEppDesc] = useState("");
  const [newEppLife, setNewEppLife] = useState(6);
  const [newEppStock, setNewEppStock] = useState(0);

  // Delivery State
  const [selectedWorkers, setSelectedWorkers] = useState<
    { uid: string; name: string; dni: string }[]
  >([]);
  const [deliveryItems, setDeliveryItems] = useState<
    { eppId: string; name: string; quantity: number; reason: any }[]
  >([]);
  const [deliveryNotes, setDeliveryNotes] = useState("");


  const [collectingSignaturesIndex, setCollectingSignaturesIndex] = useState<
    number | null
  >(null);
  const [workerSignatures, setWorkerSignatures] = useState<
    Record<string, string>
  >({});
  const [showSignatureRequestModal, setShowSignatureRequestModal] = useState(false);
  const sigCanvas = useRef<SignatureCanvas>(null);

  const [searchQuery, setSearchQuery] = useState("");

  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deliveryToDelete, setDeliveryToDelete] = useState<string | null>(null);
  const [isDeliveryDeleteModalOpen, setIsDeliveryDeleteModalOpen] = useState(false);

  useEffect(() => {
    if (!selectedCompany?.ruc) return;

    // Load Catalog
    const qCatalog = query(
      collection(db, "epp_catalog"),
      where("companyRuc", "==", selectedCompany.ruc),
    );
    const unsubCatalog = onSnapshot(qCatalog, (snapshot) => {
      setCatalog(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as EppItem),
      );
    });

    // Load Deliveries (el trabajador solo recibe las suyas)
    const isWorkerView = profile?.role === "worker";
    const qDeliveries = isWorkerView
      ? query(
          collection(db, "epp_deliveries"),
          where("workerId", "==", profile?.uid || ""),
        )
      : query(
          collection(db, "epp_deliveries"),
          where("companyRuc", "==", selectedCompany.ruc),
          orderBy("deliveryDate", "desc"),
        );
    const unsubDeliveries = onSnapshot(qDeliveries, (snapshot) => {
      const list = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as EppDelivery,
      );
      if (isWorkerView) {
        list.sort(
          (a: any, b: any) =>
            (b.deliveryDate?.toMillis?.() ?? 0) - (a.deliveryDate?.toMillis?.() ?? 0),
        );
      }
      setDeliveries(list);
    });

    // Load Workers (for selection); el trabajador no necesita la lista de compañeros
    const loadWorkers = async () => {
      if (isWorkerView) {
        setLoading(false);
        return;
      }
      try {
        const qUsers = query(
          collection(db, "users"),
          where("companyRuc", "==", selectedCompany.ruc),
          where("role", "in", ["worker", "supervisor"]),
        );
        const userDocs = await getDocs(qUsers);
        setWorkers(
          userDocs.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile),
        );
      } catch (err) {
        console.error("Error cargando usuarios:", err);
      }
      setLoading(false);
    };

    loadWorkers();

    return () => {
      unsubCatalog();
      unsubDeliveries();
    };
  }, [selectedCompany?.ruc, profile?.uid, profile?.role]);

  const handleCreateEpp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany?.ruc) return;

    try {
      await addDoc(collection(db, "epp_catalog"), {
        name: newEppName,
        description: newEppDesc,
        estimatedLifeMonths: Number(newEppLife),
        stock: Number(newEppStock),
        companyRuc: selectedCompany.ruc,
        createdAt: Timestamp.now(),
      });
      toast.success("EPP guardado exitosamente.");
      setIsCreatingEpp(false);
      setNewEppName("");
      setNewEppDesc("");
      setNewEppLife(6);
      setNewEppStock(0);
    } catch (err) {
      console.error("Error creando EPP:", err);
      toast.error("Error al guardar el EPP");
    }
  };

  const handleDeleteEpp = (id: string) => {
    setItemToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteEpp = async () => {
    if (itemToDelete) {
      try {
        await deleteDoc(doc(db, "epp_catalog", itemToDelete));
        toast.success("EPP eliminado exitosamente.");
        setItemToDelete(null);
      } catch (err) {
        toast.error("Error al eliminar EPP.");
      }
    }
  };

  const handleDeleteDelivery = (id: string) => {
    setDeliveryToDelete(id);
    setIsDeliveryDeleteModalOpen(true);
  };

  const confirmDeleteDelivery = async () => {
    if (deliveryToDelete) {
      try {
        const deliveryToRestore = deliveries.find((d) => d.id === deliveryToDelete);
        
        if (deliveryToRestore && deliveryToRestore.items) {
          const batch = writeBatch(db);
          
          // Restore Stock
          deliveryToRestore.items.forEach((item) => {
            const eppRef = doc(db, "epp_catalog", item.eppId);
            batch.update(eppRef, {
              stock: increment(item.quantity),
            });
          });

          // Delete the delivery document
          batch.delete(doc(db, "epp_deliveries", deliveryToDelete));
          
          await batch.commit();
        } else {
          await deleteDoc(doc(db, "epp_deliveries", deliveryToDelete));
        }

        toast.success("Entrega de EPP eliminada exitosamente.");
        setDeliveryToDelete(null);
        setIsDeliveryDeleteModalOpen(false);
      } catch (err) {
        toast.error("Error al eliminar la entrega de EPP.");
      }
    }
  };

  const handleAddDeliveryItem = () => {
    if (catalog.length === 0) return;
    setDeliveryItems([
      ...deliveryItems,
      {
        eppId: catalog[0].id!,
        name: catalog[0].name,
        quantity: 1,
        reason: "Primera entrega",
      },
    ]);
  };

  const updateDeliveryItem = (index: number, eppId: string) => {
    const epp = catalog.find((c) => c.id === eppId);
    if (!epp) return;
    const newItems = [...deliveryItems];
    newItems[index] = { ...newItems[index], eppId: epp.id!, name: epp.name };
    setDeliveryItems(newItems);
  };

  const updateDeliveryItemField = (
    index: number,
    field: string,
    value: any,
  ) => {
    const newItems = [...deliveryItems];
    (newItems[index] as any)[field] = value;
    setDeliveryItems(newItems);
  };

  const validateDelivery = (requireDni: boolean = true) => {
    const nameInput = document.getElementById('manualWorkerName') as HTMLInputElement;
    if (nameInput && nameInput.value.trim() !== '') {
      toast.error("Tiene un trabajador escrito. Haga clic en 'Agregar manual' primero.");
      return false;
    }

    if (selectedWorkers.length === 0) {
      toast.error("Agregue al menos un trabajador.");
      return false;
    }
    
    if (requireDni) {
      const workersWithoutDni = selectedWorkers.filter((w) => !w.dni);
      if (workersWithoutDni.length > 0) {
        toast.error(
          "Todos los trabajadores seleccionados deben tener un DNI registrado para firmar digitalmente. Trabajadores sin DNI: " +
            workersWithoutDni.map((w) => w.name).join(", "),
        );
        return false;
      }
    }
    
    if (deliveryItems.length === 0) {
      toast.error("Agregue al menos un EPP a entregar.");
      return false;
    }

    // Check stock
    for (const item of deliveryItems) {
      const epp = catalog.find((c) => c.id === item.eppId);
      if (epp) {
        const requiredStock = item.quantity * selectedWorkers.length;
        if ((epp.stock || 0) < requiredStock) {
          toast.error(
            `Stock insuficiente para ${epp.name}. Necesitas ${requiredStock}, pero solo hay ${epp.stock || 0}.`,
          );
          return false;
        }
      }
    }
    
    return true;
  };

  const startSignatureCollection = () => {
    if (!validateDelivery(true)) return;
    setCollectingSignaturesIndex(0);
    setWorkerSignatures({});
  };

  const submitAsSignatureRequest = () => {
    // Prevent if there are manual workers
    const manualWorkers = selectedWorkers.filter(w => w.uid.startsWith('manual_'));
    if (manualWorkers.length > 0) {
      toast.error(`Los siguientes trabajadores fueron agregados manualmente y no tienen cuenta para firmar digitalmente: ${manualWorkers.map(w => w.name).join(', ')}. Por favor, elimínelos de la lista para continuar o use el botón "Registrar (Físico)".`);
      return;
    }

    if (!validateDelivery(true)) return;
    
    // Open confirmation modal
    setShowSignatureRequestModal(true);
  };

  const confirmSignatureRequest = () => {
    setShowSignatureRequestModal(false);
    submitAllDeliveries({}, true);
  };

  const submitWithoutSignatures = () => {
    if (!validateDelivery(false)) return;
    submitAllDeliveries({});
  };

  const handleNextSignature = () => {
    if (sigCanvas.current?.isEmpty()) {
      toast.error("Se requiere la firma del trabajador.");
      return;
    }

    const signature = sigCanvas.current
      ?.getTrimmedCanvas()
      .toDataURL("image/png");
    if (collectingSignaturesIndex !== null && signature) {
      const worker = selectedWorkers[collectingSignaturesIndex];
      setWorkerSignatures((prev) => ({ ...prev, [worker.uid]: signature }));
      sigCanvas.current.clear();

      if (collectingSignaturesIndex < selectedWorkers.length - 1) {
        setCollectingSignaturesIndex(collectingSignaturesIndex + 1);
      } else {
        submitAllDeliveries({ ...workerSignatures, [worker.uid]: signature });
      }
    }
  };

  const submitAllDeliveries = async (
    finalSignatures: Record<string, string>,
    isRequest: boolean = false
  ) => {
    try {
      const batch = writeBatch(db);

      selectedWorkers.forEach((worker) => {
        const deliveryRef = doc(collection(db, "epp_deliveries"));
        batch.set(deliveryRef, {
          companyRuc: selectedCompany?.ruc,
          workerId: worker.uid,
          workerName: worker.name,
          workerDni: worker.dni,
          items: deliveryItems,
          signature: finalSignatures[worker.uid] || null,
          deliveryDate: Timestamp.now(),
          supervisorId: profile?.uid,
          supervisorName: profile?.displayName,
          supervisorDni: profile?.dni,
          notes: deliveryNotes,
          createdAt: Timestamp.now(),
          status: isRequest ? "pending_signature" : "completed",
        });
      });

      // Update Stock
      const stockUpdates: Record<string, number> = {};
      deliveryItems.forEach((item) => {
        if (!stockUpdates[item.eppId]) stockUpdates[item.eppId] = 0;
        stockUpdates[item.eppId] += item.quantity * selectedWorkers.length;
      });

      Object.entries(stockUpdates).forEach(([eppId, totalQty]) => {
        const eppRef = doc(db, "epp_catalog", eppId);
        batch.update(eppRef, {
          stock: increment(-totalQty),
        });
      });

      await batch.commit();

      // Notify employers
      await notifyAllEmployers(
        "Nuevas Entregas de EPPs",
        `Se han registrado entregas de EPPs a ${selectedWorkers.length} trabajador(es) por ${profile?.displayName || "el supervisor"}.`,
        "/epps",
        selectedCompany?.ruc,
      );

      // Notify workers individually
      await Promise.all(
        selectedWorkers.map((w) =>
          sendNotification(
            w.uid,
            isRequest ? "Firma de EPP Requerida" : "Entrega de EPPs Registrada",
            isRequest
              ? "Tienes una entrega de EPP pendiente de firma. Por favor, ingresa para firmar la conformidad."
              : "Se ha registrado una nueva entrega de EPPs a tu nombre. Por favor revisa el registro.",
            "/epps",
            selectedCompany?.ruc || "",
          ),
        ),
      );

      setIsDelivering(false);
      setCollectingSignaturesIndex(null);
      setSelectedWorkers([]);
      setDeliveryItems([]);
      setDeliveryNotes("");
      setWorkerSignatures({});

      toast.success(isRequest ? "¡Solicitudes enviadas exitosamente!" : "¡Entregas registradas exitosamente!");
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar registros.");
    }
  };

  const getWorkerStatusAggregations = () => {
    const statusMap: Record<
      string,
      {
        workerName: string;
        dni: string;
        items: {
          eppName: string;
          diffDays: number;
          status: "ok" | "warning" | "expired";
        }[];
      }
    > = {};

    // Reverse logic: older dates process first, so newer dates overwrite
    const sortedDeliveries = [...deliveries].reverse();

    sortedDeliveries.forEach((d) => {
      const key = d.workerDni;
      if (!statusMap[key]) {
        statusMap[key] = {
          workerName: d.workerName,
          dni: d.workerDni,
          items: [],
        };
      }

      d.items.forEach((item) => {
        const cat = catalog.find((c) => c.id === item.eppId);
        const lifeMonths = cat ? cat.estimatedLifeMonths : 6;

        const deliveryDate = d.deliveryDate?.toDate
          ? d.deliveryDate.toDate()
          : new Date();
        const expirationDate = new Date(deliveryDate);
        expirationDate.setMonth(expirationDate.getMonth() + lifeMonths);

        const now = new Date();
        const diffTime = expirationDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let status: "ok" | "warning" | "expired" = "ok";
        if (diffDays <= 0) status = "expired";
        else if (diffDays <= 15) status = "warning";

        // Use eppId as unique key for that worker's last item status
        const existingItemIndex = statusMap[key].items.findIndex(
          (i) => i.eppName === item.name,
        );
        const record = { eppName: item.name, diffDays, status };

        if (existingItemIndex >= 0) {
          statusMap[key].items[existingItemIndex] = record;
        } else {
          statusMap[key].items.push(record);
        }
      });
    });

    return Object.values(statusMap);
  };

  const dashboardData = getWorkerStatusAggregations();
  const isWorker = profile?.role === "worker";

  const myData = dashboardData.find((d) => d.dni === profile?.dni) || {
    workerName: profile?.displayName,
    dni: profile?.dni,
    items: [],
  };
  const myDeliveries = deliveries.filter(
    (d) => d.workerId === profile?.uid || d.workerDni === profile?.dni,
  );

  const handleExportExcel = () => {
    const formattedData = deliveries.map((d) => ({
      ID: d.id,
      Trabajador: d.workerName,
      DNI: d.workerDni,
      Fecha_Entrega: d.deliveryDate
        ? new Date(d.deliveryDate.toDate()).toLocaleDateString()
        : "N/A",
      Items_Entregados: d.items
        .map((i) => `${i.quantity}x ${i.name} (${i.reason})`)
        .join(" | "),
      Entregado_Por: d.supervisorName,
    }));
    exportToExcel(formattedData, "Historial_Entregas_EPP");
  };

  if (loading) return <div className="p-8 text-center">Cargando...</div>;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title={isWorker ? "Mis EPPs" : "Control de EPPs"}
        description={isWorker ? "Historial y estado de tus Equipos de Protección" : "Gestión y entrega de Equipos de Protección Personal"}
        icon={Package}
        color="sky"
        actions={
          !isWorker && ["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "") && (
            <button
              onClick={() => setIsDelivering(true)}
              className="flex items-center px-4 py-2 bg-white text-sky-700 rounded-lg hover:bg-sky-50 transition-colors shadow-sm font-medium border border-transparent"
            >
              <Package className="w-5 h-5 mr-2" />
              Nueva Entrega a Trabajador
            </button>
          )
        }
      />

      {isDelivering ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-800">
              Registrar Nueva Entrega Múltiple
            </h2>
            <button
              onClick={() => setIsDelivering(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-6">
            {/* 1. Seleccionar Trabajador */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h3 className="text-md font-semibold text-slate-800 mb-3 flex items-center">
                <Users className="w-5 h-5 mr-2 text-blue-600" />
                1. Selección de Trabajadores
              </h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Buscar y agregar trabajadores registrados
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 bg-white"
                  onChange={(e) => {
                    const w = workers.find((w) => w.uid === e.target.value);
                    if (w && !selectedWorkers.find((sw) => sw.uid === w.uid)) {
                      setSelectedWorkers([
                        ...selectedWorkers,
                        { uid: w.uid, name: w.displayName, dni: w.dni || "" },
                      ]);
                    }
                    e.target.value = "";
                  }}
                >
                  <option value="">-- Seleccionar trabajador --</option>
                  {workers.map((w) => (
                    <option key={w.uid} value={w.uid}>
                      {w.displayName} ({w.dni || "Sin DNI"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4 p-3 bg-white border border-slate-200 rounded-lg">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  O agregar trabajador no registrado manualmente
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="manualWorkerName"
                    placeholder="Nombre completo"
                    className="flex-1 border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    id="manualWorkerDni"
                    placeholder="DNI / Doc"
                    className="w-32 border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => {
                      const nameInput = document.getElementById('manualWorkerName') as HTMLInputElement;
                      const dniInput = document.getElementById('manualWorkerDni') as HTMLInputElement;
                      const name = nameInput.value.trim();
                      const dni = dniInput.value.trim();
                      if (name && dni) {
                        // Check if this worker exists in the system by matching DNI or Name (case-insensitive)
                        const matchedWorker = workers.find(
                          (w) => (w.dni && w.dni.trim() === dni) || 
                                 (w.displayName && w.displayName.trim().toLowerCase() === name.toLowerCase())
                        );

                        if (matchedWorker) {
                          if (selectedWorkers.find((sw) => sw.uid === matchedWorker.uid)) {
                            toast.error("El trabajador ya está en la lista de seleccionados.");
                            return;
                          }
                          setSelectedWorkers([
                            ...selectedWorkers,
                            { uid: matchedWorker.uid, name: matchedWorker.displayName, dni: matchedWorker.dni || dni },
                          ]);
                          toast.success(`Se vinculó automáticamente con el trabajador registrado: ${matchedWorker.displayName}`);
                        } else {
                          const uid = 'manual_' + Date.now();
                          setSelectedWorkers([
                            ...selectedWorkers,
                            { uid, name, dni },
                          ]);
                          toast.success("Trabajador agregado en físico (no registrado).");
                        }
                        nameInput.value = '';
                        dniInput.value = '';
                      } else {
                        toast.error("Debe ingresar nombre y DNI para agregar manualmente");
                      }
                    }}
                    className="bg-slate-800 text-white px-3 py-2 rounded-lg text-sm hover:bg-slate-700 whitespace-nowrap transition-colors"
                  >
                    Agregar manual
                  </button>
                </div>
              </div>

              {selectedWorkers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedWorkers.map((w) => (
                    <div
                      key={w.uid}
                      className="flex items-center bg-white border border-slate-200 rounded-full px-3 py-1"
                    >
                      <span className="text-sm font-medium text-slate-700">
                        {w.name}
                      </span>
                      <button
                        onClick={() =>
                          setSelectedWorkers(
                            selectedWorkers.filter((sw) => sw.uid !== w.uid),
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

            {/* 2. Seleccionar EPPs */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-md font-semibold text-slate-800 flex items-center">
                  <Shield className="w-5 h-5 mr-2 text-blue-600" />
                  2. Equipos a Entregar
                </h3>
                <button
                  onClick={handleAddDeliveryItem}
                  className="px-3 py-1.5 bg-blue-100 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-200 transition-colors flex items-center"
                >
                  <Plus className="w-4 h-4 mr-1" /> Agregar Ítem
                </button>
              </div>

              {deliveryItems.length === 0 ? (
                <div className="text-center py-6 text-slate-500 border-2 border-dashed border-slate-300 rounded-xl">
                  Aún no has agregado ningún equipo. Haz clic en "Agregar Ítem".
                </div>
              ) : (
                <div className="space-y-3">
                  {deliveryItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 shadow-sm relative"
                    >
                      <select
                        value={item.eppId}
                        onChange={(e) =>
                          updateDeliveryItem(idx, e.target.value)
                        }
                        className="flex-1 border border-slate-300 rounded-md p-2 text-sm focus:ring-blue-500 min-w-[200px]"
                      >
                        {catalog.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} (Vida: {c.estimatedLifeMonths}m)
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-600">
                          Cant:
                        </span>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateDeliveryItemField(
                              idx,
                              "quantity",
                              Number(e.target.value),
                            )
                          }
                          className="w-16 border border-slate-300 rounded-md p-2 text-sm focus:ring-blue-500"
                        />
                      </div>

                      <select
                        value={item.reason}
                        onChange={(e) =>
                          updateDeliveryItemField(idx, "reason", e.target.value)
                        }
                        className="border border-slate-300 rounded-md p-2 text-sm focus:ring-blue-500 min-w-[180px]"
                      >
                        <option value="Primera entrega">Primera entrega</option>
                        <option value="Renovación por desgaste">
                          Renovación por desgaste
                        </option>
                        <option value="Pérdida">Pérdida</option>
                        <option value="Cambio de puesto">
                          Cambio de puesto
                        </option>
                        <option value="Otro">Otro</option>
                      </select>

                      <button
                        onClick={() =>
                          setDeliveryItems(
                            deliveryItems.filter((_, i) => i !== idx),
                          )
                        }
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h3 className="text-md font-bold text-slate-800 mb-3 flex items-center">
                <Shield className="w-5 h-5 mr-2 text-slate-500" />
                3. Supervisor SST a Cargo
              </h3>
              <SignerBanner />
            </div>

            {collectingSignaturesIndex !== null && (
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                <h3 className="text-md font-bold text-blue-800 mb-3 flex items-center">
                  <FileSignature className="w-5 h-5 mr-2" />
                  4. Firmas (Trabajador {collectingSignaturesIndex + 1} de{" "}
                  {selectedWorkers.length})
                </h3>
                <p className="text-sm text-slate-700 mb-4 font-medium">
                  Firma requerida para:{" "}
                  <span className="font-bold text-blue-700">
                    {selectedWorkers[collectingSignaturesIndex].name}
                  </span>
                </p>
                <div className="border-2 border-blue-300 rounded-xl bg-white overflow-hidden shadow-inner">
                  <SignatureCanvas
                    ref={sigCanvas}
                    canvasProps={{ className: "w-full h-40" }}
                  />
                </div>
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => sigCanvas.current?.clear()}
                    className="px-3 py-1 text-sm text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    Limpiar firma
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-4 pt-4 border-t border-slate-200">
              <button
                onClick={() => {
                  setIsDelivering(false);
                  setCollectingSignaturesIndex(null);
                }}
                className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50"
              >
                Cancelar
              </button>
              {collectingSignaturesIndex === null ? (
                <>
                  <button
                    onClick={submitWithoutSignatures}
                    className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    Registrar (Físico)
                  </button>
                  <button
                    onClick={submitAsSignatureRequest}
                    className="flex-1 px-4 py-3 border-2 border-blue-600 text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-colors"
                  >
                    Solicitar Firmas
                  </button>
                  <button
                    onClick={startSignatureCollection}
                    className="flex-1 px-4 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    Recolectar Firmas
                  </button>
                </>
              ) : (
                <button
                  onClick={handleNextSignature}
                  className="flex-1 px-4 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700"
                >
                  {collectingSignaturesIndex < selectedWorkers.length - 1
                    ? "Siguiente Firma"
                    : "Finalizar Entrega"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : isWorker ? (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
              <Shield className="w-5 h-5 mr-2 text-blue-600" /> Mi Estado de
              Equipos (EPP)
            </h2>
            {myData.items.length === 0 ? (
              <p className="text-slate-500 text-sm">
                Aún no se te han entregado equipos o no hay información de
                fechas.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {myData.items.map((item, idx) => (
                  <span
                    key={idx}
                    className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
                      item.status === "ok"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : item.status === "warning"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-red-50 text-red-700 border-red-200"
                    }`}
                  >
                    {item.eppName}
                    {item.status === "expired" &&
                      " (Vencido, requiere renovación)"}
                    {item.status === "warning" &&
                      ` (Vence en ${item.diffDays} días)`}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
              <Clock className="w-5 h-5 mr-2 text-blue-600" /> Últimas
              Entregas Recibidas
            </h2>
            {myDeliveries.length === 0 ? (
              <p className="text-slate-500 text-sm">
                No hay registros de entregas.
              </p>
            ) : (
              <div className="space-y-4">
                {myDeliveries.map((delivery) => (
                  <div
                    key={delivery.id}
                    className="border border-slate-100 rounded-lg p-4 bg-slate-50 flex flex-col md:flex-row md:items-start md:justify-between gap-4"
                  >
                    <div>
                      <p className="text-sm text-slate-500 font-medium mb-1">
                        Entregado el:{" "}
                        {delivery.deliveryDate?.toDate
                          ? delivery.deliveryDate.toDate().toLocaleString()
                          : "Fecha desconocida"}
                      </p>
                      <ul className="list-disc list-inside space-y-1">
                        {delivery.items.map((item, idx) => (
                          <li
                            key={idx}
                            className="text-sm font-medium text-slate-800"
                          >
                            {item.quantity}x {item.name}{" "}
                            <span className="text-slate-400 font-normal">
                              ({item.reason})
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex items-center gap-2">
                        <img
                          src={delivery.signature}
                          alt="Mi Firma"
                          className="h-6 object-contain bg-white border border-slate-200 rounded px-1"
                        />
                        <span className="text-xs text-slate-400">
                          Supervisado por: {delivery.supervisorName}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        generateEppDeliveryPdf(delivery, selectedCompany)
                      }
                      className="flex items-center text-blue-600 hover:text-blue-800 font-medium text-xs bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-blue-100 shrink-0"
                    >
                      <Download className="w-4 h-4 mr-1" /> Descargar Mi Acta
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Admin Tabs Navigation */}
          {["employer", "supervisor", "super_admin", "gerencia"].includes(
            profile?.role || "",
          ) && (
            <div className="flex overflow-x-auto bg-slate-100 p-1 rounded-xl mb-6 custom-scrollbar w-fit">
              <button
                onClick={() => setActiveTab("dashboard")}
                className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all whitespace-nowrap flex items-center ${
                  activeTab === "dashboard"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-600 hover:bg-slate-200/50"
                }`}
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Alertas de EPPs
              </button>
              <button
                onClick={() => setActiveTab("deliveries")}
                className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all whitespace-nowrap flex items-center ${
                  activeTab === "deliveries"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-600 hover:bg-slate-200/50"
                }`}
              >
                <Clock className="w-4 h-4 mr-2" />
                Historial de Entregas
              </button>
              <button
                onClick={() => setActiveTab("catalog")}
                className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all whitespace-nowrap flex items-center ${
                  activeTab === "catalog"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-600 hover:bg-slate-200/50"
                }`}
              >
                <Shield className="w-4 h-4 mr-2" />
                Catálogo de EPPs
              </button>
            </div>
          )}

          {/* TAB: DASHBOARD (Alertas) */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="bg-blue-100 p-3 rounded-xl">
                      <Users className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        Trabajadores con EPP
                      </p>
                      <h3 className="text-2xl font-bold text-slate-900">
                        {dashboardData.length}
                      </h3>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="bg-amber-100 p-3 rounded-xl">
                      <AlertTriangle className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        Próximos a vencer
                      </p>
                      <h3 className="text-2xl font-bold text-amber-600">
                        {
                          dashboardData
                            .flatMap((d) => d.items)
                            .filter((i) => i.status === "warning").length
                        }
                      </h3>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="bg-red-100 p-3 rounded-xl">
                      <Clock className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        EPPs Vencidos
                      </p>
                      <h3 className="text-2xl font-bold text-red-600">
                        {
                          dashboardData
                            .flatMap((d) => d.items)
                            .filter((i) => i.status === "expired").length
                        }
                      </h3>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                  <h3 className="font-semibold text-slate-800">
                    Estado de EPPs por Trabajador
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600 font-medium">
                      <tr>
                        <th className="px-6 py-3">Trabajador</th>
                        <th className="px-6 py-3">DNI</th>
                        <th className="px-6 py-3">Estado de los EPPs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {dashboardData.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-6 py-8 text-center text-slate-500"
                          >
                            No hay registros de EPPs para mostrar.
                          </td>
                        </tr>
                      ) : (
                        dashboardData.map((worker, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-6 py-4 font-medium text-slate-900">
                              {worker.workerName}
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              {worker.dni}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-2">
                                {worker.items.map((item, idx) => (
                                  <span
                                    key={idx}
                                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                      item.status === "ok"
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        : item.status === "warning"
                                          ? "bg-amber-50 text-amber-700 border-amber-200"
                                          : "bg-red-50 text-red-700 border-red-200"
                                    }`}
                                  >
                                    {item.eppName}
                                    {item.status === "expired" && " (Vencido)"}
                                    {item.status === "warning" &&
                                      ` (${item.diffDays} d)`}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: CATALOGO */}
          {activeTab === "catalog" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-slate-800">
                  Catálogo Maestro de EPPs
                </h2>
                <button
                  onClick={() => setIsCreatingEpp(!isCreatingEpp)}
                  className="flex items-center px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors"
                >
                  {isCreatingEpp ? (
                    <X className="w-5 h-5 mr-1" />
                  ) : (
                    <Plus className="w-5 h-5 mr-1" />
                  )}
                  {isCreatingEpp ? "Cancelar" : "Agregar Tipo de EPP"}
                </button>
              </div>

              {isCreatingEpp && (
                <form
                  onSubmit={handleCreateEpp}
                  className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Nombre del EPP
                      </label>
                      <input
                        type="text"
                        required
                        value={newEppName}
                        onChange={(e) => setNewEppName(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-blue-500 bg-white"
                        placeholder="Ej. Casco Dieléctrico Clase E"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Cantidad en Stock
                      </label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={newEppStock}
                        onChange={(e) => setNewEppStock(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-blue-500 bg-white"
                        placeholder="Ej. 50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Vida Útil Estimada (Meses)
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={newEppLife}
                        onChange={(e) => setNewEppLife(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-blue-500 bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Descripción / Norma Técnica
                    </label>
                    <input
                      type="text"
                      value={newEppDesc}
                      onChange={(e) => setNewEppDesc(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-blue-500 bg-white"
                      placeholder="Ej. Cumple Norma ANSI Z89.1"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
                    >
                      Guardar en Catálogo
                    </button>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {catalog.map((epp) => (
                  <div
                    key={epp.id}
                    className={`bg-white p-5 rounded-xl border shadow-sm relative ${(epp.stock || 0) <= 5 ? "border-red-300" : "border-slate-200"}`}
                  >
                    <div className="absolute top-4 right-4">
                      <button
                        onClick={() => handleDeleteEpp(epp.id!)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                        title="Eliminar EPP del catálogo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-4">
                      <Shield className="w-6 h-6" />
                    </div>
                    <h3 className="font-bold text-slate-900">{epp.name}</h3>
                    <p className="text-sm text-slate-500 line-clamp-2 mt-1 min-h-[40px]">
                      {epp.description || "Sin descripción"}
                    </p>
                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600">
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 mr-1 text-slate-400" />
                        Renova: {epp.estimatedLifeMonths}m
                      </div>
                      <div
                        className={`flex items-center px-2 py-1 rounded border ${
                          (epp.stock || 0) <= 5
                            ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-slate-50 text-slate-700 border-slate-200"
                        }`}
                      >
                        <Package className="w-3 h-3 mr-1" />
                        Stock: {epp.stock || 0}
                      </div>
                    </div>
                  </div>
                ))}
                {catalog.length === 0 && !isCreatingEpp && (
                  <div className="col-span-full p-8 text-center border-2 border-dashed border-slate-300 rounded-xl text-slate-500">
                    Aún no hay EPPs en el catálogo. Agrega los equipos de
                    protección que la empresa proporciona.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: DELIVERIES */}
          {activeTab === "deliveries" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-col gap-2">
                  <h2 className="text-lg font-semibold text-slate-800">
                    Historial de Entregas
                  </h2>
                  {(["employer", "supervisor", "super_admin", "gerencia"].includes(profile?.role || "")) && (
                    <SignerBanner className="w-full" />
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar trabajador..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-4 py-2 w-full sm:w-64 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <button
                    onClick={handleExportExcel}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
                    title="Exportar a Excel"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">Exportar</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {deliveries
                  .filter(
                    (d) =>
                      d.workerName
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase()) ||
                      d.workerDni.includes(searchQuery),
                  )
                  .map((delivery) => (
                    <div
                      key={delivery.id}
                      className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                    >
                      <div className="p-5">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h3 className="font-bold text-slate-900">
                              {delivery.workerName}
                            </h3>
                            <p className="text-sm text-slate-500">
                              DNI: {delivery.workerDni}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              Entregado el:{" "}
                              {delivery.deliveryDate?.toDate
                                ? delivery.deliveryDate
                                    .toDate()
                                    .toLocaleString()
                                : "Fecha desconocida"}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <div className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2 py-1 rounded-md flex items-center">
                              <CheckCircle className="w-3 h-3 mr-1" /> Entregado
                            </div>
                            <button
                              onClick={() => handleDeleteDelivery(delivery.id!)}
                              className="text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors"
                              title="Eliminar entrega"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 bg-slate-50 rounded-lg p-3 border border-slate-100">
                          <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
                            Ítems Entregados:
                          </p>
                          <ul className="space-y-2">
                            {delivery.items.map((item, idx) => (
                              <li
                                key={idx}
                                className="text-sm flex justify-between items-end border-b border-slate-200 pb-2 last:border-0 last:pb-0"
                              >
                                <div>
                                  <span className="font-medium text-slate-800">
                                    {item.name}
                                  </span>
                                  <p className="text-xs text-slate-500">
                                    Motivo: {item.reason}
                                  </p>
                                </div>
                                <span className="font-bold text-slate-600">
                                  Cant: {item.quantity}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="mt-4 flex flex-col gap-4 text-sm text-slate-500">
                          <div className="flex flex-col gap-1 w-full relative">
                            <span className="font-medium text-xs">Firma del Trabajador:</span>
                            <div className="flex items-center justify-between">
                              {delivery.signature ? (
                                <img
                                  src={delivery.signature}
                                  alt="Firma Trabajador"
                                  className="h-8 object-contain bg-slate-50 border border-slate-200 rounded px-1"
                                />
                              ) : delivery.status === "pending_signature" && profile?.uid === delivery.workerId ? (
                                <button
                                  onClick={async () => {
                                    const sigUrl = profile.digitalSignatureConsent?.signatureUrl || profile.savedSignatureUrl;
                                    if (!sigUrl) {
                                      toast.error("Debes configurar tu firma electrónica en tu perfil primero.");
                                      return;
                                    }
                                    try {
                                      await updateDoc(doc(db, "epp_deliveries", delivery.id!), {
                                        signature: sigUrl,
                                        status: "completed"
                                      });
                                      toast.success("Firmado correctamente");
                                    } catch (err) {
                                      console.error("Error signing:", err);
                                    }
                                  }}
                                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
                                >
                                  Firmar Documento
                                </button>
                              ) : (
                                <span className="text-amber-600 bg-amber-50 px-2 py-1 rounded-md text-xs font-medium border border-amber-100">
                                  {delivery.status === "pending_signature" ? "Pendiente de firma" : "Firma física requerida"}
                                </span>
                              )}
                              <button
                                onClick={() =>
                                  generateEppDeliveryPdf(
                                    delivery,
                                    selectedCompany,
                                  )
                                }
                                className="flex items-center text-blue-600 hover:text-blue-800 font-medium text-xs bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-blue-100"
                              >
                                <Download className="w-4 h-4 mr-1" /> Imprimir
                                Acta PDF
                              </button>
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-1 w-full border-t border-slate-100 pt-3">
                            <span className="font-medium text-xs">Firma del Supervisor SST:</span>
                            {delivery.supervisorSignatureUrl ? (
                              <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                  <img
                                    src={delivery.supervisorSignatureUrl}
                                    alt="Firma Supervisor"
                                    className="h-8 object-contain bg-slate-50 border border-slate-200 rounded px-1"
                                  />
                                  <span className="text-xs text-slate-400 mt-1">{delivery.supervisorName}</span>
                                </div>
                                <span className="bg-emerald-100 text-emerald-700 font-medium px-2 py-1 rounded text-xs">
                                  Validado
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between bg-amber-50 p-2 rounded-lg border border-amber-100">
                                <div className="flex items-center text-amber-700 text-xs">
                                  <AlertTriangle className="w-4 h-4 mr-1" /> Pendiente
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
                                          updateDoc(doc(db, "epp_deliveries", delivery.id!), {
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
                    </div>
                  ))}
                {deliveries.length === 0 && (
                  <div className="col-span-full p-8 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
                    No hay registros de entrega de EPPs.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setItemToDelete(null);
        }}
        onConfirm={confirmDeleteEpp}
        title="Eliminar Ítem del Catálogo"
        message="¿Estás seguro de eliminar este ítem del catálogo de EPPs? Esta acción no se puede deshacer."
      />

      <ConfirmationModal
        isOpen={isDeliveryDeleteModalOpen}
        onClose={() => {
          setIsDeliveryDeleteModalOpen(false);
          setDeliveryToDelete(null);
        }}
        onConfirm={confirmDeleteDelivery}
        title="Eliminar Entrega de EPP"
        message="¿Estás seguro de eliminar este registro de entrega? Esta acción no se puede deshacer y borrará el acta firmada."
      />

      <ConfirmationModal
        isOpen={showSignatureRequestModal}
        onClose={() => setShowSignatureRequestModal(false)}
        onConfirm={confirmSignatureRequest}
        title="Solicitar Firmas de EPP"
        message={`Se enviará una notificación a los siguientes trabajadores registrados para que ingresen a su cuenta y firmen la conformidad de la entrega de EPPs:\n\n${selectedWorkers.map(w => "• " + w.name).join("\n")}\n\n¿Deseas continuar?`}
        confirmText="Solicitar Firmas"
        confirmVariant="primary"
      />
    </div>
  );
};
