import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext";
import { useSearchParams } from "react-router-dom";
import { Loader2, BookText } from "lucide-react";
import {  useCompany } from "../CompanyContext";
import {  PageHeader } from "./ui/PageHeader";
import {  db } from "../firebase";
import { 
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { 
  FileText,
  AlertCircle,
  Stethoscope,
  Activity,
  ClipboardCheck,
  BarChart3,
  Shield,
  GraduationCap,
  Search,
  Plus,
  ChevronRight,
  ChevronLeft,
  FileCheck,
  Download,
  Filter,
  FileSpreadsheet,
  Clock,
  Trash2,
} from "lucide-react";
import {  startOfYear, isAfter } from "date-fns";
import {  MandatoryRegisterType, BaseLegalRegister } from "../types";
import {  MandatoryRegisterModal } from "./MandatoryRegisterModal";
import {  generateLegalRegisterPDF } from "../utils/pdfGenerator";

interface RegisterCategory {
  id: MandatoryRegisterType;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

const CATEGORIES: RegisterCategory[] = [
  {
    id: "accident",
    title: "Accidentes de Trabajo",
    description:
      "Registro de accidentes con investigación y medidas correctivas.",
    icon: AlertCircle,
    color: "bg-red-500",
  },
  {
    id: "disease",
    title: "Enfermedades Ocupacionales",
    description: "Registro de enfermedades detectadas y sus causas.",
    icon: Stethoscope,
    color: "bg-orange-500",
  },
  {
    id: "incident",
    title: "Incidentes y Peligrosos",
    description: "Registro de incidentes y casi-accidentes.",
    icon: AlertCircle,
    color: "bg-yellow-500",
  },
  {
    id: "medical_exam",
    title: "Exámenes Médicos",
    description: "Seguimiento de exámenes pre, durante y post ocupacionales.",
    icon: Activity,
    color: "bg-sky-500",
  },
  {
    id: "monitoring",
    title: "Monitoreo de Agentes",
    description:
      "Físicos, químicos, biológicos, psicosociales y disergonómicos.",
    icon: Activity,
    color: "bg-blue-500",
  },
  {
    id: "inspection",
    title: "Inspecciones Internas",
    description: "Resultados de verificaciones de seguridad en campo.",
    icon: ClipboardCheck,
    color: "bg-emerald-500",
  },
  {
    id: "statistics",
    title: "Estadísticas de SST",
    description: "Índices de frecuencia, gravedad y accidentabilidad.",
    icon: BarChart3,
    color: "bg-purple-500",
  },
  {
    id: "equipment",
    title: "Equipos de Seguridad",
    description: "Entrega y renovación de EPP y equipos de emergencia.",
    icon: Shield,
    color: "bg-slate-500",
  },
  {
    id: "training",
    title: "Capacitación y Entrenamiento",
    description: "Inducciones, charlas y simulacros realizados.",
    icon: GraduationCap,
    color: "bg-cyan-500",
  },
  {
    id: "audit",
    title: "Auditorías",
    description: "Resultados de auditorías internas y externas.",
    icon: FileCheck,
    color: "bg-zinc-700",
  },
];

export const MandatoryRegisters: React.FC = () => {
  const { profile, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const targetId = searchParams.get("id");
  const { selectedCompany } = useCompany();
  const [selectedCategory, setSelectedCategory] =
    useState<RegisterCategory | null>(null);
  const [allRegisters, setAllRegisters] = useState<BaseLegalRegister[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRegister, setSelectedRegister] = useState<
    BaseLegalRegister | undefined
  >(undefined);

  // Filters and Pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const targetRuc = selectedCompany?.ruc || profile?.companyRuc;
    if (
      (profile?.role !== "employer" && profile?.role !== "super_admin" && profile?.role !== "gerencia") ||
      !targetRuc
    )
      return;

    setLoading(true);
    const q = query(
      collection(db, "mandatory_registers"),
      where("companyRuc", "==", targetRuc),
      orderBy("completedAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as BaseLegalRegister,
        );
        setAllRegisters(docs);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching registers:", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [profile]);

  useEffect(() => {
    if (targetId && allRegisters.length > 0 && !selectedCategory) {
      const reg = allRegisters.find(r => r.id === targetId);
      if (reg) {
        const cat = CATEGORIES.find(c => c.id === reg.type);
        if (cat) {
          setSelectedCategory(cat);
          setSearchTerm(targetId);
          // Remove ID from URL so subsequent category changes behave normally
          searchParams.delete("id");
          setSearchParams(searchParams, { replace: true });
        }
      }
    }
  }, [targetId, allRegisters, selectedCategory, searchParams, setSearchParams]);

  // Reset filters when changing category
  useEffect(() => {
    setCurrentPage(1);
    setDateFrom("");
    setDateTo("");
    // Only reset if we are not actively targeting an ID
    if (!targetId || searchTerm !== targetId) {
      setSearchTerm("");
    }
  }, [selectedCategory, targetId, searchTerm]);

  const filteredRegisters = selectedCategory
    ? allRegisters
        .filter((r) => r.type === selectedCategory.id)
        .filter((r) => {
          const matchesSearch =
            (r.registerNumber?.toLowerCase() || "").includes(
              searchTerm.toLowerCase(),
            ) ||
            (r.completedByName?.toLowerCase() || "").includes(
              searchTerm.toLowerCase(),
            ) || r.id === searchTerm;
          const rDate = r.completedAt?.toDate();
          const matchesDateFrom =
            dateFrom && rDate
              ? rDate >= new Date(dateFrom + "T00:00:00")
              : true;
          const matchesDateTo =
            dateTo && rDate ? rDate <= new Date(dateTo + "T23:59:59") : true;
          return matchesSearch && matchesDateFrom && matchesDateTo;
        })
    : [];

  const totalPages = Math.ceil(filteredRegisters.length / itemsPerPage);
  const paginatedRegisters = filteredRegisters.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const handleExportCSV = () => {
    if (!selectedCategory) return;
    const headers = ["N° Registro", "Fecha", "Completado por", "Tipo"];
    const rows = filteredRegisters.map((r) => [
      `"${r.registerNumber || ""}"`,
      `"${r.completedAt?.toDate().toLocaleDateString() || ""}"`,
      `"${r.completedByName || ""}"`,
      `"${r.type || ""}"`,
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `registros_${selectedCategory.id}_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (profile?.role === "worker") {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
        <Shield className="w-16 h-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">
          Acceso Restringido
        </h2>
        <p className="text-slate-600 max-w-md">
          Esta sección es exclusiva para empleadores y administradores de SST.
        </p>
      </div>
    );
  }

  const handleCreateNew = () => {
    setSelectedRegister(undefined);
    setIsModalOpen(true);
  };

  const handleEdit = (register: BaseLegalRegister) => {
    setSelectedRegister(register);
    setIsModalOpen(true);
  };

  const [registerToDelete, setRegisterToDelete] = useState<BaseLegalRegister | null>(null);

  const handleDelete = async (register: BaseLegalRegister) => {
    setRegisterToDelete(register);
  };

  const confirmDeleteRegister = async () => {
    if (!registerToDelete) return;
    try {
      await deleteDoc(doc(db, "mandatory_registers", registerToDelete.id));
      setRegisterToDelete(null);
    } catch (error) {
      console.error("Error al eliminar el registro:", error);
      alert("Hubo un error al eliminar el registro.");
      setRegisterToDelete(null);
    }
  };


  if (selectedCategory) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
          <div className="flex items-center space-x-4 w-full md:w-auto">
            <button
              onClick={() => setSelectedCategory(null)}
              className="p-2 hover:bg-slate-200 rounded-full transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {selectedCategory.title}
              </h1>
              <p className="text-slate-500">{selectedCategory.description}</p>
            </div>
          </div>
          {["employer", "super_admin", "gerencia"].includes(profile?.role || "") && (
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={handleExportCSV}
                className="flex items-center px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors shadow-sm whitespace-nowrap"
              >
                <FileSpreadsheet className="w-5 h-5 mr-2" />
                Exportar Excel
              </button>
              <button
                onClick={handleCreateNew}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
              >
                <Plus className="w-5 h-5 mr-2" />
                Nuevo Registro
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Buscar
            </label>
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="N° Registro o Responsable..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
          <div className="w-full md:w-48">
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Desde
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div className="w-full md:w-48">
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-sm font-semibold text-slate-700">
                    N° Registro
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-700">
                    Fecha
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-700">
                    Completado por
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-700 text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center">
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    </td>
                  </tr>
                ) : paginatedRegisters.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-12 text-center text-slate-500"
                    >
                      No se encontraron registros.
                    </td>
                  </tr>
                ) : (
                  paginatedRegisters.map((reg) => (
                    <tr
                      key={reg.id}
                      className="hover:bg-slate-50 transition-colors group"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">
                        {reg.registerNumber}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {reg.completedAt?.toDate().toLocaleDateString() ||
                          "N/A"}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {reg.completedByName}
                      </td>
                      <td className="px-6 py-4 text-right space-x-4">
                        <button
                          onClick={() => generateLegalRegisterPDF(reg)}
                          className="text-emerald-600 hover:text-emerald-900 font-medium text-sm inline-flex items-center"
                          title="Descargar PDF"
                        >
                          <Download className="w-4 h-4 mr-1" />
                          PDF
                        </button>
                        <button
                          onClick={() => handleEdit(reg)}
                          className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                          title="Ver / Editar"
                        >
                          Ver / Editar
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(reg);
                          }}
                          className="text-red-500 hover:text-red-700 font-medium text-sm inline-flex items-center"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between">
              <span className="text-sm text-slate-500">
                Mostrando {(currentPage - 1) * itemsPerPage + 1} a{" "}
                {Math.min(currentPage * itemsPerPage, filteredRegisters.length)}{" "}
                de {filteredRegisters.length} registros
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentPage === 1}
                  className="p-1 rounded-md text-slate-500 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm font-medium text-slate-700">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  className="p-1 rounded-md text-slate-500 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {isModalOpen && selectedCategory && (
          <MandatoryRegisterModal
            onClose={() => setIsModalOpen(false)}
            initialData={selectedRegister}
            type={selectedCategory.id}
            companyRuc={selectedCompany?.ruc || profile?.companyRuc || ""}
          />
        )}

        {registerToDelete && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden p-6 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-2">¿Eliminar registro?</h3>
              <p className="text-sm text-slate-500 mb-6">
                ¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setRegisterToDelete(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDeleteRegister}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Registros Legales - ${selectedCompany?.businessName || "Todas las Empresas"}`}
        description="Gestione sus registros obligatorios SST"
        icon={BookText}
        color="indigo"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const catRegisters = allRegisters.filter((r) => r.type === cat.id);
          const thisYearCount = catRegisters.filter(
            (r) =>
              r.completedAt &&
              isAfter(r.completedAt.toDate(), startOfYear(new Date())),
          ).length;
          const lastRecord = catRegisters[0]; // Already sorted by desc

          // Simple compliance indicator logic
          let statusColor = "bg-slate-100 text-slate-500";
          let statusText = "Sin registros";
          if (lastRecord && lastRecord.completedAt) {
            const daysSince = Math.floor(
              (new Date().getTime() -
                lastRecord.completedAt.toDate().getTime()) /
                (1000 * 3600 * 24),
            );
            if (daysSince < 30) {
              statusColor = "bg-emerald-100 text-emerald-700";
              statusText = "Al día";
            } else if (daysSince < 90) {
              statusColor = "bg-yellow-100 text-yellow-700";
              statusText = "Atención";
            } else {
              statusColor = "bg-red-100 text-red-700";
              statusText = "Desactualizado";
            }
          }

          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat)}
              className="flex flex-col text-left bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-300 transition-all group relative"
            >
              <div className="flex justify-between items-start w-full mb-4">
                <div
                  className={`${cat.color} p-3 rounded-xl text-white group-hover:scale-110 transition-transform`}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <div
                  className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center ${statusColor}`}
                >
                  <Clock className="w-3 h-3 mr-1" />
                  {statusText}
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                {cat.title}
              </h3>
              <p className="text-sm text-slate-500 flex-1">{cat.description}</p>

              <div className="w-full mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  <span className="font-bold text-slate-700">
                    {thisYearCount}
                  </span>{" "}
                  este año
                </div>
                <div className="flex items-center text-blue-600 font-semibold text-sm">
                  Ver registros
                  <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
