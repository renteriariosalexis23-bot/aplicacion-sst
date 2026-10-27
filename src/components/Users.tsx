import { PageHeader } from "./ui/PageHeader";
import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { UserProfile, Company, Role } from "../types";
import { Loader2, Shield,
  ShieldAlert,
  UserX,
  UserCheck,
  Trash2,
  UserMinus,
  AlertTriangle,
  Search,
  ChevronDown,
  ChevronUp,
  Building2,
  FileSpreadsheet,
  FileBadge,
  Car,
  Pencil,
  X,

  UsersRound, } from "lucide-react";

import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { exportToExcel } from "../utils/exportToExcel";
import { generateDigitalSignatureConsentPDF } from "../utils/pdfGenerator";
import { isMainAdmin } from "../constants/admin";

const VehicleInfoModal = ({ user, onClose }: { user: UserProfile, onClose: () => void }) => {
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden relative">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Car className="w-5 h-5 text-sky-600" />
            Información Vehicular
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
             <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold">
              {user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-slate-900">{user.displayName || user.email}</p>
              <p className="text-xs text-slate-500">Documentos vehiculares</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="block text-xs font-medium text-slate-500">Tipo</span>
              <span className="font-medium text-slate-900 capitalize">{user.vehicleType === "car" ? "Automóvil" : user.vehicleType === "motorcycle" ? "Motocicleta" : user.vehicleType === "truck" ? "Camión" : user.vehicleType || "No especificado"}</span>
            </div>
            <div>
              <span className="block text-xs font-medium text-slate-500">Placa</span>
              <span className="font-medium text-slate-900 uppercase">{user.vehiclePlate || "No especificado"}</span>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div>
              <span className="block text-xs font-medium text-slate-500 mb-1">Licencia de Conducir</span>
              {user.licenseFileUrl ? (
                <div className="flex items-center justify-between bg-slate-50 p-2 rounded">
                  <span className="text-sm font-medium text-green-600">Subida</span>
                  <div className="flex gap-2 items-center">
                     {user.licenseExpiryDate && <span className="text-xs text-slate-500">Vence: {user.licenseExpiryDate}</span>}
                     <a href={user.licenseFileUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 hover:underline">Ver</a>
                  </div>
                </div>
              ) : (
                <span className="text-sm text-red-500 italic font-medium">No subida</span>
              )}
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-500 mb-1">SOAT / Seguro Vehicular</span>
              {user.soatFileUrl ? (
                <div className="flex items-center justify-between bg-slate-50 p-2 rounded">
                   <span className="text-sm font-medium text-green-600">Subido</span>
                   <div className="flex gap-2 items-center">
                     {user.soatExpiryDate && <span className="text-xs text-slate-500">Vence: {user.soatExpiryDate}</span>}
                     <a href={user.soatFileUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 hover:underline">Ver</a>
                   </div>
                </div>
              ) : (
                <span className="text-sm text-red-500 italic font-medium">No subido</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


const EditUserModal = ({ user, companies, onClose, onSave }: { user: UserProfile, companies: Company[], onClose: () => void, onSave: (updatedUser: Partial<UserProfile>) => Promise<void> }) => {
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [dni, setDni] = useState(user.dni || "");
  const [role, setRole] = useState(user.role);
  const [companyRuc, setCompanyRuc] = useState(user.companyRuc || "");
  const [department, setDepartment] = useState(user.department || (user.role === "gerencia" ? "Gerencia General" : ""));
  const [position, setPosition] = useState(user.position || (user.role === "gerencia" ? "Gerente General" : ""));
  const [isTrustedPersonnel, setIsTrustedPersonnel] = useState(user.isTrustedPersonnel || (user.role === "gerencia"));
  const [isSaving, setIsSaving] = useState(false);

  const selectedCompany = companies.find(c => c.ruc === companyRuc);

  const handleRoleChange = (newRole: any) => {
    setRole(newRole);
    if (newRole === "gerencia") {
      if (!position || position === "Trabajador") setPosition("Gerente General");
      if (!department) setDepartment("Gerencia General");
      setIsTrustedPersonnel(true);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    await onSave({
      displayName: displayName.trim(),
      dni: dni.trim(),
      role,
      companyRuc,
      department: department.trim(),
      position: position.trim(),
      isTrustedPersonnel: role === "gerencia" ? true : isTrustedPersonnel,
    });
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Pencil className="w-5 h-5 text-blue-600" />
            Editar Usuario
          </h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
             <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold">
              {displayName ? displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-slate-900">{displayName || user.email}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Nombres y Apellidos</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Ej. Carlos Mendoza"
                  className="w-full text-sm font-medium border border-slate-200 rounded-xl p-2.5 bg-white text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">DNI / Pasaporte</label>
                <input
                  type="text"
                  value={dni}
                  onChange={e => setDni(e.target.value)}
                  placeholder="Ej. 12345678"
                  maxLength={20}
                  className="w-full text-sm font-medium border border-slate-200 rounded-xl p-2.5 bg-white text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Rol en el Sistema</label>
                <select value={role} onChange={e => handleRoleChange(e.target.value as any)} className="w-full text-sm font-medium border border-slate-200 rounded-xl p-2.5 bg-white text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none">
                  <option value="worker">Trabajador</option>
                  <option value="supervisor">Supervisor SST</option>
                  <option value="employer">Empleador (Admin)</option>
                  <option value="gerencia">Gerencia General</option>
                  <option value="super_admin">Super Administrador</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Cargo / Puesto</label>
                <input
                  type="text"
                  value={position}
                  onChange={e => setPosition(e.target.value)}
                  placeholder="Ej. Gerente General, Operario..."
                  className="w-full text-sm font-medium border border-slate-200 rounded-xl p-2.5 bg-white text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Empresa</label>
              <select value={companyRuc} onChange={e => { setCompanyRuc(e.target.value); }} className="w-full text-sm font-medium border border-slate-200 rounded-xl p-2.5 bg-white text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none">
                <option value="">{role === "gerencia" || role === "super_admin" ? "Todas las Empresas (Multi-Empresa)" : "Sin Empresa Asignada"}</option>
                {companies.map(c => <option key={c.id} value={c.ruc}>{c.businessName}</option>)}
              </select>
              {(role === "gerencia" || role === "super_admin") && !companyRuc && (
                <p className="text-xs text-emerald-600 font-medium mt-1">
                  ✓ Como {role === "gerencia" ? "Gerencia General" : "Super Admin"}, tiene acceso ejecutivo a todas las empresas.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Área / Departamento</label>
              {selectedCompany?.areas && selectedCompany.areas.length > 0 ? (
                <div className="space-y-2">
                  <select
                    value={selectedCompany.areas.includes(department) ? department : "custom"}
                    onChange={e => {
                      if (e.target.value !== "custom") {
                        setDepartment(e.target.value);
                      }
                    }}
                    className="w-full text-sm font-medium border border-slate-200 rounded-xl p-2.5 bg-white text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                  >
                    <option value="">Seleccionar del catálogo de la empresa</option>
                    {selectedCompany.areas.map(area => <option key={area} value={area}>{area}</option>)}
                    <option value="custom">Otro (escribir personalizado)...</option>
                  </select>
                  {(!selectedCompany.areas.includes(department) || department === "") && (
                    <input
                      type="text"
                      value={department}
                      onChange={e => setDepartment(e.target.value)}
                      placeholder="Escribe el área (ej. Gerencia General)"
                      className="w-full text-sm font-medium border border-slate-200 rounded-xl p-2.5 bg-white text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                    />
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  placeholder="Ej. Gerencia General, Operaciones, etc."
                  className="w-full text-sm font-medium border border-slate-200 rounded-xl p-2.5 bg-white text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                />
              )}
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-3 cursor-pointer group p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                <input type="checkbox" checked={isTrustedPersonnel} onChange={e => setIsTrustedPersonnel(e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer" />
                <div>
                  <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 block">
                    Personal de Dirección o Confianza
                  </span>
                  <span className="text-xs text-slate-400">
                    Excluye al trabajador de participar como votante de base en elecciones del CSST
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} disabled={isSaving} className="px-5 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={isSaving} className="px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2">
            {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Guardando...</> : "Guardar Cambios"}
          </button>
        </div>
      </div>
    </div>
  );
};

export const Users: React.FC = () => {
  const { profile } = useAuth();
  const { companies, selectedCompany } = useCompany();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const [selectedVehicleUser, setSelectedVehicleUser] = useState<UserProfile | null>(null);

  const [activeTab, setActiveTab] = useState<"active" | "cesados" | "pending">(
    "active",
  );

  useEffect(() => {
    if (profile?.role !== "employer" && profile?.role !== "super_admin" && profile?.role !== "gerencia") return;

    let q;
    if (
      isMainAdmin(profile.email) ||
      profile.role === "super_admin"
    ) {
      // Default admin and super_admin can see all users
      q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    } else if (selectedCompany) {
      // Other employers only see users of their selected company
      q = query(
        collection(db, "users"),
        where("companyRuc", "==", selectedCompany.ruc),
        orderBy("createdAt", "desc"),
      );
    } else {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const usersData = snapshot.docs.map((doc) => ({
          ...doc.data(),
        })) as UserProfile[];
        setUsers(usersData);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "users");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [profile, selectedCompany]);

  const handleToggleStatus = async (
    userId: string,
    currentStatus?: "active" | "blocked" | "cesado",
  ) => {
    if (profile?.role !== "employer" && profile?.role !== "super_admin" && profile?.role !== "gerencia") return;
    if (userId === profile.uid) return; // Cannot block yourself

    const newStatus = currentStatus === "blocked" ? "active" : "blocked";

    try {
      await updateDoc(doc(db, "users", userId), {
        status: newStatus,
      });
   } catch (error) {
      console.error("Error updating user status:", error);
    }
  };

  const handleDarDeBaja = async (
    userId: string,
    currentStatus?: "active" | "blocked" | "cesado",
  ) => {
    if (profile?.role !== "employer" && profile?.role !== "super_admin" && profile?.role !== "gerencia") return;
    if (userId === profile.uid) return; // Cannot delete yourself

    const newStatus = currentStatus === "cesado" ? "active" : "cesado";

    try {
      await updateDoc(doc(db, "users", userId), {
        status: newStatus,
      });
   } catch (error) {
      console.error("Error al dar de baja:", error);
    }
  };

    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  const handleDeleteUser = async (userId: string) => {
    if (profile?.role !== "employer" && profile?.role !== "super_admin" && profile?.role !== "gerencia") {
      alert("No tienes permisos para eliminar roles.");
      return;
    }
    if (userId === profile.uid) {
      alert("No puedes eliminarte a ti mismo.");
      return;
    }
    setUserToDelete(userId);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await deleteDoc(doc(db, "users", userToDelete));
      setUserToDelete(null);
   } catch (error) {
      console.error("Error al eliminar usuario:", error);
      alert("Hubo un error al eliminar el usuario.");
      setUserToDelete(null);
    }
  };


  const handleRoleChange = async (userId: string, newRole: Role) => {
    if (profile?.role !== "employer" && profile?.role !== "super_admin" && profile?.role !== "gerencia") return;
    if (userId === profile.uid) return; // Cannot change own role

    try {
      await updateDoc(doc(db, "users", userId), {
        role: newRole,
      });
      toast.success("Rol actualizado exitosamente.");
   } catch (error) {
      console.error("Error updating user role:", error);
      toast.error("Error al actualizar el rol.");
    }
  };

  const handleDownloadConsent = async (user: UserProfile) => {
    try {
      const companyName =
        companies.find((c) => c.ruc === user.companyRuc)?.businessName ||
        "La Empresa";
      await generateDigitalSignatureConsentPDF(user, companyName);
   } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Hubo un error al generar el PDF. Verifica que la firma exista.");
    }
  };

  const handleChangeCompany = async (userId: string, companyRuc: string) => {
    if (profile?.role !== "employer" && profile?.role !== "super_admin" && profile?.role !== "gerencia") return;
    try {
      await updateDoc(doc(db, "users", userId), {
        companyRuc,
      });
      toast.success("Empresa actualizada exitosamente.");
   } catch (error) {
      console.error("Error updating user company:", error);
      toast.error("Error al actualizar la empresa.");
    }
  };

  if (profile?.role !== "employer" && profile?.role !== "super_admin" && profile?.role !== "gerencia") {
    return (
      <div className="text-center py-10">
        No tienes permisos para ver esta página.
      </div>
    );
  }

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      (user.displayName?.toLowerCase() || "").includes(
        searchTerm.toLowerCase(),
      ) ||
      (user.email?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (user.dni?.toLowerCase() || "").includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (activeTab === "cesados") return user.status === "cesado";
    if (activeTab === "pending")
      return (
        !user.companyRuc &&
        user.role !== "employer" &&
        user.role !== "super_admin" &&
        user.role !== "gerencia" &&
        !isMainAdmin(user.email)
      );
    return (
      user.status !== "cesado" &&
      (user.role === "employer" ||
        user.role === "super_admin" ||
        user.role === "gerencia" ||
        !!user.companyRuc)
    );
  });

  const groupedUsers: Record<string, UserProfile[]> = {};
  filteredUsers.forEach((user) => {
    const key = user.companyRuc || "unassigned";
    if (!groupedUsers[key]) groupedUsers[key] = [];
    groupedUsers[key].push(user);
  });

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isExpanded = (key: string) => {
    if (searchTerm) return true;
    if (Object.keys(groupedUsers).length === 1) return true;
    return !!expandedGroups[key];
  };

  const handleExportExcel = () => {
    const dataToExport = filteredUsers.map((user) => ({
      ID: user.uid,
      Nombre: user.displayName || "Sin nombre",
      Correo: user.email || "",
      DNI: user.dni || "",
      Rol:
        user.role === "super_admin"
          ? "Super Administrador"
          : user.role === "gerencia"
            ? "Gerencia General"
            : user.role === "employer"
              ? "Empleador"
              : user.role === "supervisor"
                ? "Supervisor"
                : "Trabajador",
      Estado:
        user.status === "cesado"
          ? "Cesado"
          : user.status === "blocked"
            ? "Bloqueado"
            : "Activo",
      "Empresa RUC": user.companyRuc || "No asignada",
      "Fecha de Registro": user.createdAt?.toDate
        ? user.createdAt.toDate().toLocaleString()
        : "",
    }));

    exportToExcel(dataToExport, "Directorio_Trabajadores");
  };

  return (
    <div className="w-full">
      <PageHeader
        title="Directorio de Usuarios"
        description="Gestión y control de cuentas de usuarios en el sistema"
        icon={UsersRound}
        color="indigo"
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportExcel}
              className="flex items-center px-4 py-2 bg-white text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors shadow-sm font-medium border border-transparent"
              title="Exportar a Excel"
            >
              <FileSpreadsheet className="w-5 h-5 mr-2" />
              <span className="hidden sm:inline">Exportar</span>
            </button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
              <input
                type="text"
                placeholder="Buscar por nombre, correo o DNI..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border border-white/20 bg-white/10 text-white placeholder:text-white/60 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-sm w-full sm:w-80 outline-none"
              />
            </div>
          </div>
        }
      />

      <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl w-fit mb-6">
        <button
          onClick={() => setActiveTab("active")}
          className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "active"
              ? "bg-white text-blue-600 shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
          }`}
        >
          <UserCheck className="w-4 h-4 mr-2" />
          Trabajadores Activos
        </button>
        <button
          onClick={() => setActiveTab("cesados")}
          className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "cesados"
              ? "bg-white text-blue-600 shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
          }`}
        >
          <UserMinus className="w-4 h-4 mr-2" />
          Trabajadores Cesados
        </button>
        <button
          onClick={() => setActiveTab("pending")}
          className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "pending"
              ? "bg-white text-blue-600 shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
          }`}
        >
          <AlertTriangle className="w-4 h-4 mr-2" />
          Pendientes
        </button>
      </div>

      {activeTab === "pending" && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-amber-800 font-medium">
              Usuarios Pendientes de Aprobación
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Aquí aparecen todos los usuarios que se han registrado pero no
              tienen empresa. Puedes <strong>cambiar su rol</strong>{" "}
              (Trabajador, Supervisor o Empleador) y
              <strong>asignarles una empresa</strong> para darles acceso.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-slate-500">
          Cargando usuarios...
        </div>
      ) : Object.keys(groupedUsers).length === 0 ? (
        <div className="text-center py-10 bg-white rounded-xl border border-slate-200 text-slate-500">
          No se encontraron usuarios.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedUsers).map(([ruc, groupUsers]) => {
            const company = companies.find((c) => c.ruc === ruc);
            const companyName = company
              ? company.businessName
              : ruc === "unassigned"
                ? "Dirección General / Multi-Empresa / Administradores"
                : "Empresa Desconocida";
            const expanded = isExpanded(ruc);

            return (
              <div
                key={ruc}
                className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
              >
                <button
                  onClick={() => toggleGroup(ruc)}
                  className="w-full px-6 py-4 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-bold text-slate-800 text-left">
                      {companyName}
                    </h2>
                    <span className="bg-blue-100 text-blue-700 py-0.5 px-2.5 rounded-full text-xs font-bold">
                      {groupUsers.length} usuario
                      {groupUsers.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {expanded ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </button>

                {expanded && (
                  <div className="overflow-x-auto border-t border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                          >
                            Usuario
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                          >
                            Rol
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                          >
                            Empresa / Área
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                          >
                            Estado
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider"
                          >
                            Acciones
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {groupUsers.map((user) => (
                          <tr
                            key={user.uid}
                            className={
                              user.status === "blocked"
                                ? "bg-red-50/50"
                                : user.status === "cesado"
                                  ? "bg-slate-50 opacity-75"
                                  : ""
                            }
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold">
                                  {user.displayName
                                    ? user.displayName.charAt(0).toUpperCase()
                                    : user.email.charAt(0).toUpperCase()}
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-slate-900">
                                    {user.displayName || "Sin nombre"}
                                  </div>
                                  <div className="text-sm text-slate-500">
                                    {user.email}
                                  </div>
                                  {user.dni && (
                                    <div className="text-xs text-slate-400 font-mono">
                                      DNI: {user.dni}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border shadow-sm ${
                                  user.role === "employer"
                                    ? "bg-purple-50 text-purple-700 border-purple-100"
                                    : user.role === "gerencia"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                      : user.role === "supervisor"
                                        ? "bg-amber-50 text-amber-700 border-amber-100"
                                        : user.role === "super_admin"
                                          ? "bg-red-50 text-red-700 border-red-100"
                                          : "bg-blue-50 text-blue-700 border-blue-100"
                                }`}
                              >
                                {user.role === "employer"
                                  ? "Empleador (Admin)"
                                  : user.role === "gerencia"
                                    ? "Gerencia General"
                                    : user.role === "supervisor"
                                      ? "Supervisor SST"
                                      : user.role === "super_admin"
                                        ? "Super Administrador"
                                        : "Trabajador"}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              {user.role === "super_admin" || (!user.companyRuc && (user.role === "employer" || user.role === "gerencia")) ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className={`text-xs font-semibold px-2 py-1 rounded-md w-fit border ${
                                    user.role === "gerencia"
                                      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                      : "text-slate-500 bg-slate-50 border-slate-200/50"
                                  }`}>
                                    {user.role === "gerencia" ? "Dirección / Multi-Empresa" : "Admin General"}
                                  </span>
                                  {user.position && (
                                    <span className="text-[10px] text-slate-500 font-medium">
                                      {user.position}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex items-center gap-1.5">
                                     <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                     <span className="text-xs font-semibold text-slate-700 truncate max-w-[150px]">{companies.find(c => c.ruc === user.companyRuc)?.businessName || "Sin Empresa"}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {user.department && (
                                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                        {user.department}
                                      </span>
                                    )}
                                    {user.isTrustedPersonnel && (
                                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200" title="Personal de Dirección o Confianza">
                                        Dir/Confianza
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shadow-sm ${
                                  user.status === "blocked"
                                    ? "bg-red-50 text-red-700 border-red-100"
                                    : user.status === "cesado"
                                      ? "bg-slate-50 text-slate-600 border-slate-200"
                                      : "bg-emerald-50 text-emerald-700 border-emerald-100"
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  user.status === "blocked"
                                    ? "bg-red-500 animate-pulse"
                                    : user.status === "cesado"
                                      ? "bg-slate-400"
                                      : "bg-emerald-500 animate-pulse"
                                }`} />
                                {user.status === "blocked"
                                  ? "Bloqueado"
                                  : user.status === "cesado"
                                    ? "Cesado"
                                    : "Activo"}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex items-center justify-end space-x-3">
                                {user.hasVehicle && (
                                  <button
                                    onClick={() => setSelectedVehicleUser(user)}
                                    className="inline-flex items-center text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-md transition-colors"
                                    title="Ver Información Vehicular"
                                  >
                                    <Car className="w-4 h-4 mr-1" />
                                    <span className="text-xs">Vehículo</span>
                                  </button>
                                )}
                                {(user as any).digitalSignatureConsent && (
                                  <button
                                    onClick={() => handleDownloadConsent(user)}
                                    className="inline-flex items-center text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md transition-colors"
                                    title="Descargar Declaración Jurada de Firma Electrónica"
                                  >
                                    <FileBadge className="w-4 h-4 mr-1" />
                                    <span className="text-xs">Consentimiento</span>
                                  </button>
                                )}
                                {user.uid !== profile.uid && (
                                  <div className="flex items-center space-x-3">
                                    {user.status !== "cesado" && (
                                      <>
                                      <button
                                        onClick={() =>
                                          handleToggleStatus(
                                            user.uid,
                                            user.status,
                                          )
                                        }
                                        className={`${user.status === "blocked" ? "text-green-600 hover:text-green-700" : "text-orange-500 hover:text-orange-600 "} transition-colors`}
                                        title={
                                          user.status === "blocked"
                                            ? "Desbloquear usuario"
                                            : "Bloquear usuario (No podrá iniciar sesión)"
                                        }
                                      >
                                        {user.status === "blocked" ? (
                                          <UserCheck className="w-5 h-5" />
                                        ) : (
                                          <UserX className="w-5 h-5" />
                                        )}
                                      </button>
                                    </>
                                  )}

                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDarDeBaja(user.uid, user.status);
                                    }}
                                    className={`${user.status === "cesado" ? "text-blue-600 hover:text-blue-700" : "text-orange-500 hover:text-orange-600 "} transition-colors`}
                                    title={
                                      user.status === "cesado"
                                        ? "Reactivar trabajador"
                                        : "Dar de baja (Mover a Cesados)"
                                    }
                                  >
                                    {user.status === "cesado" ? (
                                      <UserCheck className="w-5 h-5" />
                                    ) : (
                                      <UserMinus className="w-5 h-5" />
                                    )}
                                  </button>
                                  
                                                                  {user.uid !== profile.uid && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingUser(user);
                                      }}
                                      className="text-blue-500 hover:text-blue-700 transition-colors"
                                      title="Editar Perfil"
                                    >
                                      <Pencil className="w-5 h-5" />
                                    </button>
                                  )}
                                  
                                  {user.status === "cesado" && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteUser(user.uid);
                                      }}
                                      className="text-red-500 hover:text-red-700 transition-colors"
                                      title="Eliminar permanentemente"
                                    >
                                      <Trash2 className="w-5 h-5" />
                                    </button>
                                  )}
                                </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedVehicleUser && (
        <VehicleInfoModal
          user={selectedVehicleUser}
          onClose={() => setSelectedVehicleUser(null)}
        />
      )}

            {editingUser && (
        <EditUserModal
          user={editingUser}
          companies={companies}
          onClose={() => setEditingUser(null)}
          onSave={async (updatedData) => {
            try {
              await updateDoc(doc(db, "users", editingUser.uid), updatedData);
              toast.success("Usuario actualizado exitosamente");
              setEditingUser(null);
            } catch (error) {
              console.error("Error updating user:", error);
              toast.error("Error al actualizar el usuario");
            }
          }}
        />
      )}

      {userToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden p-6 text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
              <Trash2 className="h-6 w-6 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">¿Eliminar usuario?</h3>
            <p className="text-sm text-slate-500 mb-6">
              ¿Estás seguro de que deseas eliminar permanentemente a este usuario? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteUser}
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
};
