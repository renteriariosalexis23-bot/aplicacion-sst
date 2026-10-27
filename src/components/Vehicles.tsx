import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { PageHeader } from "./ui/PageHeader";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { UserProfile } from "../types";
import { Loader2, Car,
  Upload,
  Calendar,
  AlertTriangle,
  CheckCircle,
  FileBadge,
  Save,
  Search, } from "lucide-react";
import { uploadToCloudinary } from "../utils/cloudinary";
import { format, isBefore, addDays } from "date-fns";

export const Vehicles: React.FC = () => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states for worker
  const [hasVehicle, setHasVehicle] = useState(false);
  const [vehicleType, setVehicleType] = useState<string>("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [licenseFileUrl, setLicenseFileUrl] = useState("");
  const [licenseExpiryDate, setLicenseExpiryDate] = useState("");
  const [soatFileUrl, setSoatFileUrl] = useState("");
  const [soatExpiryDate, setSoatExpiryDate] = useState("");
  
  const [uploadingLicense, setUploadingLicense] = useState(false);
  const [uploadingSoat, setUploadingSoat] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchData();
  }, [profile, selectedCompany]);

  useEffect(() => {
    if (profile) {
      setHasVehicle(profile.hasVehicle || false);
      setVehicleType(profile.vehicleType || "");
      setVehiclePlate(profile.vehiclePlate || "");
      setLicenseFileUrl(profile.licenseFileUrl || "");
      setLicenseExpiryDate(profile.licenseExpiryDate || "");
      setSoatFileUrl(profile.soatFileUrl || "");
      setSoatExpiryDate(profile.soatExpiryDate || "");
    }
  }, [profile]);

  const fetchData = async () => {
    if (!profile || !selectedCompany) return;
    setLoading(true);
    try {
      if (profile.role !== "worker") {
        const q = query(
          collection(db, "users"),
          where("companyRuc", "==", selectedCompany.ruc),
          where("hasVehicle", "==", true)
        );
        const snapshot = await getDocs(q);
        const fetchedUsers = snapshot.docs.map(
          (doc) => ({ uid: doc.id, ...doc.data() } as UserProfile)
        );
        setUsers(fetchedUsers);
      }
    } catch (error) {
      console.error("Error fetching vehicles:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLicenseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        setUploadingLicense(true);
        const url = await uploadToCloudinary(e.target.files[0], "auto");
        setLicenseFileUrl(url);
      } catch (error) {
        setMessage({ type: "error", text: "Error al subir la licencia" });
      } finally {
        setUploadingLicense(false);
      }
    }
  };

  const handleSoatUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        setUploadingSoat(true);
        const url = await uploadToCloudinary(e.target.files[0], "auto");
        setSoatFileUrl(url);
      } catch (error) {
        setMessage({ type: "error", text: "Error al subir el SOAT" });
      } finally {
        setUploadingSoat(false);
      }
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateDoc(doc(db, "users", profile.uid), {
        hasVehicle,
        vehicleType,
        vehiclePlate: vehiclePlate.toUpperCase(),
        licenseFileUrl,
        licenseExpiryDate,
        soatFileUrl,
        soatExpiryDate,
      });
      setMessage({ type: "success", text: "Información guardada exitosamente." });
      
      // Update local profile object if using AuthContext (it might refresh automatically)
    } catch (error) {
      setMessage({ type: "error", text: "Error al guardar información." });
    } finally {
      setSaving(false);
    }
  };

  const checkStatus = (dateStr?: string) => {
    if (!dateStr) return { status: "missing", text: "No registrado", color: "text-slate-500", bg: "bg-slate-100" };
    const date = new Date(dateStr);
    const today = new Date();
    const warningDate = addDays(today, 30);

    if (isBefore(date, today)) {
      return { status: "expired", text: "Vencido", color: "text-red-700", bg: "bg-red-100" };
    } else if (isBefore(date, warningDate)) {
      return { status: "warning", text: "Por Vencer", color: "text-amber-700", bg: "bg-amber-100" };
    }
    return { status: "valid", text: "Vigente", color: "text-emerald-700", bg: "bg-emerald-100" };
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => 
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.vehiclePlate?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title={profile?.role === "worker" ? "Mi Vehículo y Brevete" : "Control de Vehículos y Brevetes"}
        description="Gestión de licencias de conducir, SOAT y datos de movilidad."
        icon={Car}
        color="indigo"
      />

      {profile?.role === "worker" || profile?.hasVehicle ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6">
            {message && (
              <div
                className={`mb-6 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between ${
                  message.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                <span>{message.text}</span>
              </div>
            )}

            <div className="space-y-6">
              <div className="flex items-center space-x-2 bg-blue-50 p-4 rounded-lg">
                <input
                  type="checkbox"
                  id="hasVehicle"
                  checked={hasVehicle}
                  onChange={(e) => setHasVehicle(e.target.checked)}
                  className="h-5 w-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                />
                <label htmlFor="hasVehicle" className="font-medium text-slate-900">
                  Tengo vehículo propio / Conduciré para la empresa
                </label>
              </div>

              {hasVehicle && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Tipo de Vehículo
                    </label>
                    <select
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value)}
                      className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2.5 border bg-white"
                    >
                      <option value="">Seleccionar...</option>
                      <option value="car">Automóvil / Camioneta</option>
                      <option value="motorcycle">Motocicleta</option>
                      <option value="truck">Camión</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Placa del Vehículo
                    </label>
                    <input
                      type="text"
                      value={vehiclePlate}
                      onChange={(e) => setVehiclePlate(e.target.value)}
                      placeholder="Ej. ABC-123"
                      className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2.5 border uppercase"
                    />
                  </div>

                  <div className="md:col-span-2 border-t border-slate-200 my-2"></div>

                  {/* License Upload */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Licencia de Conducir (Brevete)
                    </label>
                    <div className="flex flex-col space-y-3">
                      {licenseFileUrl ? (
                        <div className="flex items-center space-x-2 bg-white p-3 border border-slate-200 rounded-lg shadow-sm">
                          <CheckCircle className="w-5 h-5 text-emerald-500" />
                          <span className="text-sm text-slate-700 font-medium flex-1 truncate">Archivo subido</span>
                          <a href={licenseFileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-sm font-medium px-2 border-r border-slate-200">Ver</a>
                          <button
                            type="button"
                            onClick={() => setLicenseFileUrl("")}
                            className="text-red-500 hover:text-red-700 text-sm font-medium px-2"
                          >
                            Eliminar
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-slate-50 transition-colors">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            {uploadingLicense ? (
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                            ) : (
                              <>
                                <Upload className="w-8 h-8 text-slate-400 mb-2" />
                                <p className="text-sm text-slate-600 font-medium">Subir foto o PDF</p>
                              </>
                            )}
                          </div>
                          <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleLicenseUpload} disabled={uploadingLicense} />
                        </label>
                      )}
                      <div>
                        <label className="text-sm font-medium text-slate-700 flex items-center mt-2">
                          <Calendar className="w-4 h-4 mr-1 text-slate-400" />
                          Fecha de Vencimiento
                        </label>
                        <input
                          type="date"
                          value={licenseExpiryDate}
                          onChange={(e) => setLicenseExpiryDate(e.target.value)}
                          className="mt-1 w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2.5 border"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SOAT Upload */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      SOAT / Seguro Vehicular
                    </label>
                    <div className="flex flex-col space-y-3">
                      {soatFileUrl ? (
                        <div className="flex items-center space-x-2 bg-white p-3 border border-slate-200 rounded-lg shadow-sm">
                          <CheckCircle className="w-5 h-5 text-emerald-500" />
                          <span className="text-sm text-slate-700 font-medium flex-1 truncate">Archivo subido</span>
                          <a href={soatFileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-sm font-medium px-2 border-r border-slate-200">Ver</a>
                          <button
                            type="button"
                            onClick={() => setSoatFileUrl("")}
                            className="text-red-500 hover:text-red-700 text-sm font-medium px-2"
                          >
                            Eliminar
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-slate-50 transition-colors">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            {uploadingSoat ? (
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                            ) : (
                              <>
                                <Upload className="w-8 h-8 text-slate-400 mb-2" />
                                <p className="text-sm text-slate-600 font-medium">Subir foto o PDF</p>
                              </>
                            )}
                          </div>
                          <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleSoatUpload} disabled={uploadingSoat} />
                        </label>
                      )}
                      <div>
                        <label className="text-sm font-medium text-slate-700 flex items-center mt-2">
                          <Calendar className="w-4 h-4 mr-1 text-slate-400" />
                          Fecha de Vencimiento
                        </label>
                        <input
                          type="date"
                          value={soatExpiryDate}
                          onChange={(e) => setSoatExpiryDate(e.target.value)}
                          className="mt-1 w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2.5 border"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:bg-blue-400 font-medium"
                >
                  {saving ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  ) : (
                    <Save className="w-5 h-5 mr-2" />
                  )}
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {profile?.role !== "worker" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <h3 className="font-semibold text-slate-800 flex items-center">
              <Car className="w-5 h-5 mr-2 text-blue-600" />
              Personal con Vehículo
            </h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por nombre o placa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 w-full sm:w-64"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="p-4 font-semibold">Personal</th>
                  <th className="p-4 font-semibold">Vehículo</th>
                  <th className="p-4 font-semibold text-center">Licencia</th>
                  <th className="p-4 font-semibold text-center">SOAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500 border-b border-slate-200">
                      No hay personal registrado con vehículo.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const licenseStatus = checkStatus(user.licenseExpiryDate);
                    const soatStatus = checkStatus(user.soatExpiryDate);

                    return (
                      <tr key={user.uid} className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0">
                        <td className="p-4">
                          <div className="flex items-center">
                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm mr-3">
                              {user.displayName?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-slate-900">{user.displayName || 'Sin nombre'}</div>
                              <div className="text-xs text-slate-500">{user.email}</div>
                              {user.department && <div className="text-[10px] text-slate-400 mt-0.5">{user.department}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-sm font-medium text-slate-900 capitalize text-center mb-1">
                            {user.vehicleType === "car" ? "Automóvil" : user.vehicleType === "motorcycle" ? "Motocicleta" : user.vehicleType === "truck" ? "Camión" : user.vehicleType || "Otro"}
                          </div>
                          <div className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded inline-block mx-auto text-center font-mono font-medium uppercase tracking-wider border border-slate-200">
                            {user.vehiclePlate || 'Sin placa'}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          {user.licenseFileUrl ? (
                            <div className="flex flex-col items-center space-y-2">
                              <a 
                                href={user.licenseFileUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="inline-flex items-center text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-colors"
                              >
                                <FileBadge className="w-3 h-3 mr-1" />
                                Ver Documento
                              </a>
                              <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full ${licenseStatus.bg} ${licenseStatus.color}`}>
                                {licenseStatus.text}
                                {user.licenseExpiryDate && ` (${format(new Date(user.licenseExpiryDate), "dd/MM/yyyy")})`}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500 italic">No subida</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          {user.soatFileUrl ? (
                            <div className="flex flex-col items-center space-y-2">
                               <a 
                                href={user.soatFileUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="inline-flex items-center text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-colors"
                              >
                                <FileBadge className="w-3 h-3 mr-1" />
                                Ver Documento
                              </a>
                              <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full ${soatStatus.bg} ${soatStatus.color}`}>
                                {soatStatus.text}
                                {user.soatExpiryDate && ` (${format(new Date(user.soatExpiryDate), "dd/MM/yyyy")})`}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500 italic">No subido</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
