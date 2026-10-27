import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { Equipment, InspectionTemplate, Inspection } from "../types";
import { Loader2, Plus,
  QrCode,
  Trash2,
  Printer,
  X,
  Search,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  PenTool,
  Globe,
  Filter,
  Calendar,
  Activity,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { PageHeader } from "./ui/PageHeader";
import { ConfirmationModal } from "./ui/ConfirmationModal";

interface EquipmentsProps {
  onViewHistory?: (equipmentName: string) => void;
}

export const Equipments: React.FC<EquipmentsProps> = ({ onViewHistory }) => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [activeSubCategory, setActiveSubCategory] = useState("Todos");

  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [codigoInterno, setCodigoInterno] = useState("");
  const [type, setType] = useState("");
  const [location, setLocation] = useState("");
  const [sede, setSede] = useState("");
  const [area, setArea] = useState("");
  const [controls, setControls] = useState<{ id: string; name: string; date: string }[]>([]);
  const [description, setDescription] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [hydrostaticTestDate, setHydrostaticTestDate] = useState("");
  const [originalExpDate, setOriginalExpDate] = useState("");
  const [originalHydroDate, setOriginalHydroDate] = useState("");
  const [inspectionTemplateId, setInspectionTemplateId] = useState("");

  const [selectedEquipmentQR, setSelectedEquipmentQR] =
    useState<Equipment | null>(null);
  const [equipmentToDelete, setEquipmentToDelete] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!profile) return;

    let q;
    let templateQ;
    let inspectionsQ;
    if (["employer", "super_admin", "gerencia"].includes(profile?.role)) {
      if (selectedCompany) {
        q = query(
          collection(db, "equipment"),
          where("companyRuc", "==", selectedCompany.ruc),
        );
        templateQ = query(
          collection(db, "inspection_templates"),
          where("companyRuc", "==", selectedCompany.ruc),
        );
        inspectionsQ = query(
          collection(db, "inspections"),
          where("companyRuc", "==", selectedCompany.ruc),
        );
      } else {
        q = query(collection(db, "equipment"));
        templateQ = query(collection(db, "inspection_templates"));
        inspectionsQ = query(collection(db, "inspections"));
      }
    } else {
      setLoading(false);
      return;
    }

    // To support global templates, we fetch them via React Query hook instead of onSnapshot
    // but for simplicity in this component since it uses onSnapshot for real-time:
    let globalTemplateQ = query(
      collection(db, "inspection_templates"),
      where("isGlobal", "==", true)
    );

    const unsubEquipments = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Equipment[];
      setEquipments(data);
      setLoading(false);
    });

    const unsubTemplates = onSnapshot(templateQ, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as InspectionTemplate[];
      
      // Merge with global templates
      onSnapshot(globalTemplateQ, (globalSnapshot) => {
        const globalData = globalSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as InspectionTemplate[];
        
        const all = [...data, ...globalData];
        const unique = Array.from(new Map(all.map(item => [item.id, item])).values());
        setTemplates(unique);
      });
    });

    const unsubGlobalTemplates = onSnapshot(globalTemplateQ, (snapshot) => {
       const globalData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as InspectionTemplate[];
        
        // When global updates, we also need to get current specific ones
        setTemplates(prev => {
           const specifics = prev.filter(p => !p.isGlobal);
           const all = [...specifics, ...globalData];
           return Array.from(new Map(all.map(item => [item.id, item])).values());
        });
    });

    const unsubInspections = onSnapshot(inspectionsQ, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Inspection[];
      setInspections(data);
    });

    return () => {
      unsubEquipments();
      unsubTemplates();
      unsubGlobalTemplates();
      unsubInspections();
    };
  }, [profile, selectedCompany]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!selectedCompany) {
      toast.error("Debes seleccionar una empresa primero.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingEquipmentId) {
        const updateData: any = {
          name,
          codigoInterno,
          type,
          location: `${sede} - ${area}`,
          sede,
          area,
          controls,
          description,
          inspectionTemplateId,
          expirationDate,
          hydrostaticTestDate,
          updatedAt: serverTimestamp()
        };
        if (expirationDate !== originalExpDate) updateData.expirationNotifiedUsers = [];
        if (hydrostaticTestDate !== originalHydroDate) updateData.hydrostaticNotifiedUsers = [];
        await updateDoc(doc(db, "equipment", editingEquipmentId), updateData);
        /*
          codigoInterno,
          type,
          location: `${sede} - ${area}`,
          sede,
          area,
          controls,
          description,
          inspectionTemplateId,
          expirationDate,
          */
        toast.success("Equipo actualizado exitosamente.");
      } else {
        await addDoc(collection(db, "equipment"), {
          name,
          codigoInterno,
          type,
          location: `${sede} - ${area}`,
          sede,
          area,
          controls,
          description,
          inspectionTemplateId,
          expirationDate,
          hydrostaticTestDate,
          companyRuc: selectedCompany.ruc,
          createdAt: serverTimestamp(),
        });
        toast.success("Equipo creado exitosamente.");
      }
      setIsCreating(false);
      setEditingEquipmentId(null);
      setName("");
      setCodigoInterno("");
      setType("");
      setLocation("");
      setSede("");
      setArea("");
      setControls([]);
      setDescription("");
      setInspectionTemplateId("");
    } catch (error) {
      console.error("Error saving equipment:", error);
      toast.error("Error al guardar equipo");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (eq: Equipment) => {
    setEditingEquipmentId(eq.id!);
    setName(eq.name);
    setCodigoInterno(eq.codigoInterno || "");
    setType(eq.type || "");
    setLocation(eq.location || "");
    setSede(eq.sede || "");
    setArea(eq.area || "");
    setDescription(eq.description || "");
    setInspectionTemplateId(eq.inspectionTemplateId || "");
    setExpirationDate(eq.expirationDate || "");
    setOriginalExpDate(eq.expirationDate || "");
    setHydrostaticTestDate(eq.hydrostaticTestDate || "");
    setOriginalHydroDate(eq.hydrostaticTestDate || "");
    setControls(eq.controls || []);
    setIsCreating(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setIsCreating(false);
    setEditingEquipmentId(null);
    setName("");
    setCodigoInterno("");
    setType("");
    setLocation("");
    setSede("");
    setArea("");
    setControls([]);
    setDescription("");
    setInspectionTemplateId("");
    setExpirationDate("");
    setHydrostaticTestDate("");
  };

  const handleDelete = (id: string) => {
    setEquipmentToDelete(id);
  };

  const confirmDelete = async () => {
    if (equipmentToDelete) {
      try {
        await deleteDoc(doc(db, "equipment", equipmentToDelete));
        toast.success("Equipo eliminado exitosamente.");
        setEquipmentToDelete(null);
      } catch (error) {
        console.error("Error deleting equipment:", error);
        toast.error("Error al eliminar equipo");
      }
    }
  };

  const printQR = () => {
    window.print();
  };

  const getEquipmentStatus = (equipmentId: string) => {
    const eqInspections = inspections
      .filter((i) => i.equipmentId === equipmentId)
      .sort((a, b) => {
        const dateA = a.createdAt?.seconds || 0;
        const dateB = b.createdAt?.seconds || 0;
        return dateB - dateA;
      });

    if (eqInspections.length === 0) {
      return { status: "gray", text: "Sin inspecciones", icon: Clock };
    }

    const latest = eqInspections[0];
    const latestDate = new Date((latest.createdAt?.seconds || 0) * 1000);
    const now = new Date();
    const daysSince = Math.floor(
      (now.getTime() - latestDate.getTime()) / (1000 * 3600 * 24),
    );

    if (latest.hasIssues) {
      return {
        status: "red",
        text: "Con Anomalías",
        icon: AlertCircle,
        date: latestDate,
      };
    }

    // Si tiene más de 30 días, requiere inspección
    if (daysSince > 30) {
      return {
        status: "yellow",
        text: `Vencida (${daysSince} días)`,
        icon: Clock,
        date: latestDate,
      };
    }

    return {
      status: "green",
      text: "Al Día",
      icon: CheckCircle2,
      date: latestDate,
    };
  };

  const filteredEquipments = equipments.filter((eq) => {
    const matchesSearch = eq.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          eq.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          eq.type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === "Todos" || eq.type === activeCategory;
    
    // Subcategory matching logic
    let matchesSubCategory = true;
    if (activeSubCategory !== "Todos") {
       // Si el subfiltro es "Luz de Emergencia", buscamos "Luz" en el nombre del equipo 
       // We match the exact name (case insensitive) since the subcategory is generated from the names
       matchesSubCategory = eq.name.toLowerCase() === activeSubCategory.toLowerCase() || 
                            eq.name.toLowerCase().includes(activeSubCategory.toLowerCase());
    }

    return matchesSearch && matchesCategory && matchesSubCategory;
  }).sort((a, b) => {
    const nameA = a.codigoInterno || a.name || "";
    const nameB = b.codigoInterno || b.name || "";
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  });

  // Extract common prefixes/types from equipment names within the current active category
  const getSubCategories = () => {
    if (activeCategory === "Todos") return [];
    
    const categoryEquipments = equipments.filter(e => e.type === activeCategory);
    
    // Instead of using names like IH-P3-CO2, which generates weird subcategories, 
    // let's define static, sensible subcategories based on the active master category.
    // We dynamically extract unique names provided by the user in the "name" field
    // Because the "name" is now separate from the "codigoInterno", users can type "Extintor", "Extintor CO2", etc.
    const uniqueNames = new Set<string>();
    
    categoryEquipments.forEach(eq => {
      if (eq.name && eq.name.trim() !== '') {
        // We'll use the whole name as a subcategory if it's short, or the first two words if it's very long
        // To keep things simple and let the user control it: we use the exact name they typed.
        // We capitalize the first letter to make it look nice.
        const formattedName = eq.name.trim().charAt(0).toUpperCase() + eq.name.trim().slice(1).toLowerCase();
        
        // Let's avoid adding the raw codes as names just in case they haven't migrated their old data yet
        if (!formattedName.includes('-')) {
            uniqueNames.add(formattedName);
        }
      }
    });

    return Array.from(uniqueNames).sort();
  };


  const subCategories = getSubCategories();


  // When category changes, reset subcategory
  useEffect(() => {
    setActiveSubCategory("Todos");
  }, [activeCategory]);

  // Extraer las categorías únicas de los equipos existentes (o usar una lista estática)
  // Usaremos los tipos predefinidos, pero dinámicamente viendo cuáles tienen equipos
  const categories = ["Todos", "Equipos Contra Incendios", "Primeros Auxilios", "Maquinaria y Equipos", "Vehículos", "EPP Crítico / Trabajos de Alto Riesgo", "Otros"];


  if (!["employer", "super_admin", "gerencia"].includes(profile?.role || "")) {
    return (
      <div className="text-center p-8">
        No tienes permisos para ver esta sección.
      </div>
    );
  }

  return (
    <div className="w-full p-4 sm:p-0">
      <PageHeader
        title="Equipos y Códigos QR"
        description="Gestiona activos físicos e imprime códigos QR para inspecciones rápidas."
        icon={QrCode}
        color="indigo"
        actions={
          !isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center px-4 py-2 bg-white text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors shadow-sm font-medium border border-transparent"
            >
              <Plus className="w-5 h-5 mr-2" />
              Añadir Equipo
            </button>
          )
        }
      />

      {isCreating && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-slate-800">
              {editingEquipmentId ? "Editar Equipo" : "Registrar Nuevo Equipo"}
            </h2>
            <button
              onClick={resetForm}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Codificación (ID Interno) *
                </label>
                <input
                  type="text"
                  required
                  value={codigoInterno}
                  onChange={(e) => setCodigoInterno(e.target.value)}
                  placeholder="Ej. IH-P3-CO2-02"
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre del Equipo *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Extintor, Luz de Emergencia"
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tipo de Equipo *
                </label>
                <select
                  required
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Selecciona un tipo...</option>
                  <option value="Equipos Contra Incendios">Equipos Contra Incendios</option>
                  <option value="Primeros Auxilios">Primeros Auxilios</option>
                  <option value="Maquinaria y Equipos">Maquinaria y Equipos</option>
                  <option value="Vehículos">Vehículos</option>
                  <option value="EPP Crítico / Trabajos de Alto Riesgo">EPP Crítico / Trabajos de Alto Riesgo</option>
                  <option value="Otros">Otros</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Sede *
                </label>
                <input
                  type="text"
                  required
                  value={sede}
                  onChange={(e) => setSede(e.target.value)}
                  placeholder="Ej. Sede Central, Planta Sur"
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Área / Ubicación Específica *
                </label>
                <input
                  type="text"
                  required
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="Ej. Almacén Principal, Recepción"
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Plantilla de Inspección Asociada
                </label>
                <select
                  value={inspectionTemplateId}
                  onChange={(e) => setInspectionTemplateId(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- Ninguna --</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Fecha de Vencimiento / Caducidad
                </label>
                <input
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Prueba Hidrostática
                </label>
                <input
                  type="date"
                  value={hydrostaticTestDate}
                  onChange={(e) => setHydrostaticTestDate(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Descripción extra (Opcional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 mt-4">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-semibold text-slate-700">Fechas de Control y Vencimientos (Opcional)</h4>
                <button
                  type="button"
                  onClick={() => setControls([...controls, { id: Date.now().toString(), name: '', date: '' }])}
                  className="text-sm flex items-center text-blue-600 hover:text-blue-700"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Agregar Fecha
                </button>
              </div>
              
              {controls.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No hay fechas de control agregadas para este equipo.</p>
              ) : (
                <div className="space-y-3">
                  {controls.map((control, index) => (
                    <div key={control.id} className="flex items-center gap-2">
                      <div className="flex-1">
                        <input
                          type="text"
                          required
                          value={control.name}
                          onChange={(e) => {
                            const newControls = [...controls];
                            newControls[index].name = e.target.value;
                            setControls(newControls);
                          }}
                          placeholder="Nombre del control (Ej. Prueba Hidrostática)"
                          className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                      </div>
                      <div className="w-40">
                        <input
                          type="date"
                          required
                          value={control.date}
                          onChange={(e) => {
                            const newControls = [...controls];
                            newControls[index].date = e.target.value;
                            setControls(newControls);
                          }}
                          className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const newControls = controls.filter((_, i) => i !== index);
                          setControls(newControls);
                        }}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-md"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end mt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Guardando...</> : (editingEquipmentId ? 'Actualizar Equipo' : 'Guardar Equipo')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* QR Print Modal */}
      {selectedEquipmentQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm print:bg-white print:p-0">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full overflow-hidden print:shadow-none">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center print:hidden">
              <h3 className="font-semibold text-slate-800">
                Código QR del Equipo
              </h3>
              <button
                onClick={() => setSelectedEquipmentQR(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8 flex flex-col items-center justify-center text-center">
              <h2 className="text-xl font-bold text-slate-900 mb-1">
                {selectedEquipmentQR.name}
              </h2>
              <p className="text-sm text-slate-500 mb-6 uppercase tracking-wider">
                {selectedEquipmentQR.type} - {selectedEquipmentQR.location}
              </p>

              <div className="bg-white p-4 rounded-xl border-2 border-slate-100 shadow-sm inline-block">
                <QRCodeSVG
                  value={`${window.location.origin}/qr?type=equipment&id=${selectedEquipmentQR.id}`}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
              </div>

              <p className="text-xs text-slate-500 mt-6 max-w-[250px] print:hidden">
                Imprime este código y pégalo en el equipo. Los supervisores
                podrán escanearlo con la cámara de su celular.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 print:hidden">
              <button
                onClick={() => setSelectedEquipmentQR(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={printQR}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <Printer className="w-4 h-4 mr-2" />
                Imprimir QR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex flex-col gap-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar equipo (ej. Extintor, Manguera)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm w-full transition-shadow shadow-sm"
            />
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <div className="flex items-center text-slate-400 mr-2 shrink-0">
              <Filter className="w-4 h-4 mr-1" />
              <span className="text-xs font-semibold uppercase tracking-wider">Categoría:</span>
            </div>
            {categories.map(cat => {
               const count = cat === "Todos" 
                  ? equipments.length 
                  : equipments.filter(e => e.type === cat).length;
                  
               if (cat !== "Todos" && count === 0) return null;

               const isActive = activeCategory === cat;
               return (
                 <button
                   key={cat}
                   onClick={() => setActiveCategory(cat)}
                   className={`flex items-center px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 shadow-sm shrink-0 border ${
                     isActive 
                       ? "bg-blue-600 text-white border-blue-600 shadow-blue-200" 
                       : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:bg-blue-50"
                   }`}
                 >
                   {cat}
                   <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${isActive ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                     {count}
                   </span>
                 </button>
               )
            })}
          </div>
          
          {/* Sub-categories row (only shows if a specific category is selected and has sub-types) */}
          {activeCategory !== "Todos" && subCategories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pt-2 pb-1 scrollbar-hide border-t border-slate-100">
              <div className="flex items-center text-slate-400 mr-2 shrink-0">
                <span className="text-xs font-semibold uppercase tracking-wider">Tipo:</span>
              </div>
              <button
                 onClick={() => setActiveSubCategory("Todos")}
                 className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
                   activeSubCategory === "Todos" 
                     ? "bg-indigo-50 text-indigo-700 border-indigo-200" 
                     : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                 }`}
               >
                 Todos los {activeCategory.toLowerCase()}
               </button>
              {subCategories.map(subCat => {
                 const count = equipments.filter(e => e.type === activeCategory && 
                                                (e.name.toLowerCase() === subCat.toLowerCase() || 
                                                 e.name.toLowerCase().includes(subCat.toLowerCase()))).length;
                 const isActive = activeSubCategory === subCat;
                 
                 return (
                   <button
                     key={subCat}
                     onClick={() => setActiveSubCategory(subCat)}
                     className={`flex items-center px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
                       isActive 
                         ? "bg-indigo-50 text-indigo-700 border-indigo-200" 
                         : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                     }`}
                   >
                     {subCat}
                     <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${isActive ? 'bg-indigo-200 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>
                       {count}
                     </span>
                   </button>
                 )
              })}
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500">
            Cargando equipos...
          </div>
        ) : filteredEquipments.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <QrCode className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">
              No hay equipos registrados
            </h3>
            <p className="text-slate-500">
              Añade equipos para generarles un código QR inteligente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Identificador
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Tipo & Ubicación
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Plantilla Asociada
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Vencimiento / Prueba
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredEquipments.map((eq) => {
                  const statusInfo = getEquipmentStatus(eq.id!);
                  const StatusIcon = statusInfo.icon;

                  return (
                    <tr
                      key={eq.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900 mb-0.5">
                          {eq.codigoInterno || eq.name}
                        </div>
                        {eq.codigoInterno && (
                           <div className="text-xs text-slate-500 font-medium truncate max-w-xs mb-1">
                             {eq.name}
                           </div>
                        )}
                        {eq.description && (
                          <div className="text-[11px] text-slate-400 truncate max-w-xs italic">
                            {eq.description}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 w-fit mb-1">
                            {eq.type}
                          </span>
                          <span className="text-sm text-slate-500">
                            📍 {eq.location}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col items-start">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium shadow-sm mb-1 ${
                              statusInfo.status === "green"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                : statusInfo.status === "red"
                                  ? "bg-rose-100 text-rose-800 border border-rose-200"
                                  : statusInfo.status === "yellow"
                                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                                    : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            <StatusIcon className="w-3.5 h-3.5 mr-1" />
                            {statusInfo.text}
                          </span>
                          {statusInfo.date && (
                            <span className="text-[10px] text-slate-400">
                              Última: {statusInfo.date.toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {eq.inspectionTemplateId ? (
                          <div className="flex items-center text-sm text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md w-fit border border-emerald-100">
                            <FileText className="w-3.5 h-3.5 mr-1.5" />
                            {templates.find(
                              (t) => t.id === eq.inspectionTemplateId,
                            )?.title || "Plantilla desconocida"}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400 italic">
                            No asignada
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          {eq.expirationDate ? (
                            <span className="text-xs font-medium text-slate-600 bg-orange-50 px-2 py-1 rounded-md border border-orange-100 flex items-center gap-1 w-fit">
                              <Calendar className="w-3 h-3 text-orange-500" />
                              Vence: {eq.expirationDate}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Sin vencimiento</span>
                          )}
                          {eq.hydrostaticTestDate && (
                            <span className="text-xs font-medium text-slate-600 bg-sky-50 px-2 py-1 rounded-md border border-sky-100 flex items-center gap-1 w-fit">
                              <Activity className="w-3 h-3 text-sky-500" />
                              P. Hidrostática: {eq.hydrostaticTestDate}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-medium">
                        <div className="flex justify-end gap-2">
                          {onViewHistory && (
                            <button
                              onClick={() => onViewHistory(eq.name)}
                              className="p-2 text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                              title="Ver Historial"
                            >
                              <Clock className="w-5 h-5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(eq)}
                            className="p-2 text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 hover:text-slate-800 transition-colors"
                            title="Editar"
                          >
                            <PenTool className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => setSelectedEquipmentQR(eq)}
                            className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                            title="Ver QR"
                          >
                            <QrCode className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(eq.id!)}
                            className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!equipmentToDelete}
        onClose={() => setEquipmentToDelete(null)}
        onConfirm={confirmDelete}
        title="¿Eliminar Equipo?"
        message="Esta acción eliminará el equipo de forma permanente. Los códigos QR impresos dejarán de funcionar."
      />
    </div>
  );
};
