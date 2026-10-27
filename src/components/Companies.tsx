import React, { useState, useEffect } from "react";
import { PageHeader } from "./ui/PageHeader";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";
import { Company } from "../types";
import { Loader2, Plus,
  Trash2,
  Edit2,
  Building2,
  X,
  FileBadge,
  Search,
  AlertCircle, } from "lucide-react";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { ConfirmationModal } from "./ui/ConfirmationModal";

export const Companies: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formData, setFormData] = useState<Omit<Company, "id" | "createdAt">>({
    businessName: "",
    ruc: "",
    address: "",
    economicActivity: "",
    areas: [],
  });
  const [newArea, setNewArea] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "companies"), orderBy("businessName")),
      (snapshot) => {
        setCompanies(
          snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as Company,
          ),
        );
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, "companies");
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  const handleAddArea = () => {
    if (newArea.trim() && !formData.areas?.includes(newArea.trim())) {
      setFormData({
        ...formData,
        areas: [...(formData.areas || []), newArea.trim()],
      });
      setNewArea("");
    }
  };

  const handleRemoveArea = (areaToRemove: string) => {
    setFormData({
      ...formData,
      areas: (formData.areas || []).filter((a) => a !== areaToRemove),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.ruc.length !== 11) {
      setError("El RUC debe tener exactamente 11 dígitos.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      if (editingCompany) {
        await updateDoc(doc(db, "companies", editingCompany.id!), {
          ...formData,
        });
        import("react-hot-toast").then((t) => t.default.success("Empresa actualizada."));
      } else {
        await addDoc(collection(db, "companies"), {
          ...formData,
          createdAt: new Date(),
        });
        import("react-hot-toast").then((t) => t.default.success("Empresa registrada."));
      }
      setFormData({
        businessName: "",
        ruc: "",
        address: "",
        economicActivity: "",
      });
      setIsAdding(false);
      setEditingCompany(null);
    } catch (err: any) {
      console.error("Error saving company:", err);
      handleFirestoreError(err, OperationType.WRITE, "companies");
      setError(
        "No se pudo guardar la empresa. Verifica tus permisos o conexión.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteDoc(doc(db, "companies", deletingId));
      import("react-hot-toast").then((toast) => toast.default.success("Empresa eliminada exitosamente."));
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "companies");
    }
  };

  const filteredCompanies = companies.filter(
    (c) =>
      c.businessName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.ruc.includes(searchTerm),
  );

  return (
    <div className="w-full p-4 md:p-6">
      <PageHeader
        title="Gestión de Empresas"
        description="Administra las empresas registradas en el sistema."
        icon={Building2}
        color="purple"
        actions={
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nombre o RUC..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-blue-500 text-sm w-full sm:w-64"
              />
            </div>
            <button
              onClick={() => {
                setIsAdding(true);
                setEditingCompany(null);
                setFormData({
                  businessName: "",
                  ruc: "",
                  address: "",
                  economicActivity: "",
                });
              }}
              className="flex items-center justify-center gap-2 bg-violet-600 text-white px-5 py-2.5 rounded-xl hover:bg-violet-700 shadow-sm transition-all font-medium whitespace-nowrap border border-violet-500"
            >
              <Plus className="w-5 h-5" /> Nueva Empresa
            </button>
          </div>
        }
      />

      {(isAdding || editingCompany) && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmit}
            className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                {editingCompany ? "Editar Empresa" : "Registrar Nueva Empresa"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setEditingCompany(null);
                }}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                title="Cerrar"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm flex items-center gap-2">
                  <X className="w-4 h-4" />
                  {error}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Razón Social
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Mi Empresa S.A.C."
                    value={formData.businessName}
                    onChange={(e) =>
                      setFormData({ ...formData, businessName: e.target.value })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    RUC
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. 20123456789"
                    value={formData.ruc}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        ruc: e.target.value.replace(/\D/g, "").slice(0, 11),
                      })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Dirección Fiscal
                  </label>
                  <input
                    type="text"
                    placeholder="Av. Principal 123..."
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Actividad Económica
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Construcción, Minería..."
                    value={formData.economicActivity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        economicActivity: e.target.value,
                      })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    required
                  />
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-4 mt-2">
                  <label className="text-sm font-medium text-slate-700">
                    Áreas / Departamentos (Opcional)
                  </label>
                  <p className="text-xs text-slate-500">
                    Define las áreas oficiales de tu empresa para organizar
                    documentos y capacitaciones.
                  </p>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ej. Ventas, Operaciones..."
                      value={newArea}
                      onChange={(e) => setNewArea(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddArea();
                        }
                      }}
                      className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleAddArea}
                      className="px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors text-sm whitespace-nowrap"
                    >
                      Agregar
                    </button>
                  </div>

                  {formData.areas && formData.areas.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {formData.areas.map((area) => (
                        <span
                          key={area}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 text-sm font-medium rounded-full border border-blue-100"
                        >
                          {area}
                          <button
                            type="button"
                            onClick={() => handleRemoveArea(area)}
                            className="p-0.5 hover:bg-blue-200 rounded-full transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setEditingCompany(null);
                }}
                className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-md shadow-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Guardando...
                  </>
                ) : editingCompany ? (
                  "Actualizar"
                ) : (
                  "Guardar Empresa"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="¿Eliminar empresa?"
        message="Esta acción no se puede deshacer y afectará a los trabajadores vinculados."
      />

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Empresa
                </th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  RUC
                </th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Dirección
                </th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCompanies.length > 0 ? (
                filteredCompanies.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50/50 transition-colors group"
                  >
                    <td className="p-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mr-3 font-bold">
                          {c.businessName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">
                            {c.businessName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {c.economicActivity}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-sm text-slate-600">
                      {c.ruc}
                    </td>
                    <td className="p-4 text-sm text-slate-600 max-w-[200px] truncate">
                      {c.address}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingCompany(c);
                            setFormData({
                              businessName: c.businessName,
                              ruc: c.ruc,
                              address: c.address,
                              economicActivity: c.economicActivity,
                            });
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                          title="Editar Empresa"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingId(c.id!)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                          title="Eliminar Empresa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="p-12 text-center">
                    <div className="flex flex-col items-center">
                      <Building2 className="w-12 h-12 text-slate-200 mb-3" />
                      <p className="text-slate-500 font-medium">
                        No hay empresas registradas.
                      </p>
                      <button
                        onClick={() => setIsAdding(true)}
                        className="text-blue-600 text-sm font-bold mt-2 hover:underline"
                      >
                        Registrar la primera ahora
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
