import React, { useState, useEffect, useRef } from "react";
import {
  doc,
  updateDoc,
  query,
  collection,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { Loader2, Save, UserCircle, LogOut, FileSignature, Trash2 } from "lucide-react";
import { Company } from "../types";
import SignatureCanvas from "react-signature-canvas";
import { uploadToCloudinary } from "../utils/cloudinary";

export const Profile: React.FC = () => {
  const { profile, logout } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [dni, setDni] = useState("");
  const [department, setDepartment] = useState("");
  const [customDepartment, setCustomDepartment] = useState("");
  const [isOtherDepartment, setIsOtherDepartment] = useState(false);
  const [position, setPosition] = useState("");
  const [companyAreas, setCompanyAreas] = useState<string[]>([]);
  const [savedSignatureUrl, setSavedSignatureUrl] = useState<string | null>(
    null,
  );

  const sigCanvas = useRef<SignatureCanvas>(null);
  const [isEditingSignature, setIsEditingSignature] = useState(false);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || "");
      setPhoneNumber(profile.phoneNumber || "");
      setDni(profile.dni || "");
      setDepartment(profile.department || "");
      setPosition(profile.position || "");
      setSavedSignatureUrl(profile.savedSignatureUrl || null);

      if (profile.companyRuc) {
        const q = query(
          collection(db, "companies"),
          where("ruc", "==", profile.companyRuc),
        );
        const unsubscribeCompany = onSnapshot(q, (snapshot) => {
          if (!snapshot.empty) {
            const companyData = snapshot.docs[0].data() as Company;
            setCompanyAreas(prev => {
              const combined = Array.from(new Set([...prev, ...(companyData.areas || [])]));
              return combined.sort();
            });
          }
        });

        const unsubscribeUsers = onSnapshot(query(collection(db, "users"), where("companyRuc", "==", profile.companyRuc)), (snapshot) => {
          const uniqueAreas = new Set<string>();
          snapshot.forEach(doc => {
             const data = doc.data();
             if (data.department && data.department.trim() !== '') {
                uniqueAreas.add(data.department.trim());
             }
          });
          setCompanyAreas(prev => {
            const combined = Array.from(new Set([...prev, ...Array.from(uniqueAreas)]));
            return combined.sort();
          });
        });

        return () => {
          unsubscribeCompany();
          unsubscribeUsers();
        };
      }
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setMessage(null);

    try {
      const userRef = doc(db, "users", profile.uid);
      const finalDepartment = isOtherDepartment ? customDepartment : department;

      const updateData: any = {
        displayName,
        phoneNumber,
        dni,
        department: finalDepartment.trim(),
        position,
      };

      if (
        isEditingSignature &&
        sigCanvas.current &&
        !sigCanvas.current.isEmpty()
      ) {
        const signatureBase64 = sigCanvas.current
          .getTrimmedCanvas()
          .toDataURL("image/png");
        updateData.savedSignatureUrl = signatureBase64;
        setSavedSignatureUrl(signatureBase64);
        setIsEditingSignature(false);
      }

      await updateDoc(userRef, updateData);

      console.log("Profile updated successfully in Firestore");
      setMessage({
        type: "success",
        text: "Perfil actualizado correctamente.",
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: any) {
      console.error("Error updating profile:", error);
      let errorText = "Hubo un error al actualizar el perfil.";
      if (error.code === "permission-denied") {
        errorText =
          "No tienes permisos para actualizar este perfil. Por favor, contacta al administrador.";
      }
      setMessage({ type: "error", text: errorText });
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="w-full">
      <div className="flex items-center mb-6">
        <UserCircle className="w-8 h-8 text-sky-600 mr-3" />
        <h1 className="text-2xl font-bold text-slate-900">Mi Perfil</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 sm:p-8">
          {message && (
            <div
              className={`mb-6 p-4 rounded-md ${message.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Read-only fields */}
              <div>
                <label className="block text-sm font-medium text-slate-500 mb-1">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  disabled
                  value={profile.email}
                  className="w-full rounded-md border-slate-200 bg-slate-50 text-slate-500 p-2 border cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-500 mb-1">
                  Rol en el Sistema
                </label>
                <input
                  type="text"
                  disabled
                  value={
                    profile.role === "super_admin"
                      ? "Super Administrador"
                      : profile.role === "employer"
                        ? "Empleador (Administrador)"
                        : profile.role === "supervisor"
                          ? "Supervisor SST"
                          : "Trabajador"
                  }
                  className="w-full rounded-md border-slate-200 bg-slate-50 text-slate-500 p-2 border cursor-not-allowed"
                />
              </div>

              {/* Editable fields */}
              <div className="md:col-span-2 border-t border-slate-100 pt-6 mt-2">
                <h3 className="text-lg font-medium text-slate-900 mb-4">
                  Información Personal y Laboral
                </h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                  placeholder="Tu nombre completo"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  DNI / Documento de Identidad
                </label>
                <input
                  type="text"
                  required
                  maxLength={20}
                  value={dni}
                  onChange={(e) => setDni(e.target.value)}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                  placeholder="Ej. 70654321"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Teléfono de Contacto
                </label>
                <input
                  type="tel"
                  maxLength={20}
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                  placeholder="Ej. +51 987 654 321"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Área / Departamento
                </label>
                {companyAreas.length > 0 ? (
                  <div className="space-y-3">
                    <select
                      value={isOtherDepartment ? "otra" : department}
                      onChange={(e) => {
                        if (e.target.value === "otra") {
                          setIsOtherDepartment(true);
                          setDepartment("");
                        } else {
                          setIsOtherDepartment(false);
                          setDepartment(e.target.value);
                        }
                      }}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border bg-white"
                    >
                      <option value="">Seleccionar Área</option>
                      {companyAreas.map((area) => (
                        <option key={area} value={area}>
                          {area}
                        </option>
                      ))}
                      <option value="otra">Otra área...</option>
                    </select>

                    {isOtherDepartment && (
                      <input
                        type="text"
                        maxLength={100}
                        value={customDepartment}
                        onChange={(e) => setCustomDepartment(e.target.value)}
                        className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border animate-in fade-in slide-in-from-top-2"
                        placeholder="Escribe tu área o departamento"
                        required
                      />
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    maxLength={100}
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                    placeholder="Ej. Operaciones, Recursos Humanos..."
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Cargo / Puesto
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                  placeholder="Ej. Técnico de Mantenimiento"
                />
              </div>
            </div>



            <div className="border-t border-slate-100 pt-6 mt-6">
              <h3 className="text-lg font-medium text-slate-900 mb-4 flex items-center">
                <FileSignature className="w-5 h-5 mr-2 text-blue-600" />
                Firma Electrónica Guardada
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                Guarda tu firma para usarla automáticamente al entregar EPPs,
                recibir inducciones o completar documentos.
              </p>

              {!isEditingSignature && savedSignatureUrl ? (
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col items-center justify-center space-y-4">
                  <div className="bg-white p-4 rounded border border-slate-200">
                    <img
                      src={savedSignatureUrl}
                      alt="Firma Guardada"
                      className="h-24 object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditingSignature(true)}
                    className="text-sm text-blue-600 font-medium hover:text-blue-800 transition-colors"
                  >
                    Actualizar mi firma
                  </button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 bg-white flex flex-col relative w-full h-48">
                  <SignatureCanvas
                    ref={sigCanvas}
                    penColor="black"
                    canvasProps={{
                      className:
                        "w-full h-full absolute top-0 left-0 cursor-crosshair rounded-xl",
                    }}
                  />
                  <div className="absolute bottom-2 right-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => sigCanvas.current?.clear()}
                      className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-colors shadow-sm"
                      title="Limpiar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {savedSignatureUrl && isEditingSignature && (
                    <button
                      type="button"
                      onClick={() => setIsEditingSignature(false)}
                      className="absolute top-2 right-2 text-xs font-medium bg-white px-2 py-1 rounded shadow text-slate-500 hover:text-slate-800"
                    >
                      Cancelar
                    </button>
                  )}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-10">
                    <span className="text-2xl font-bold uppercase tracking-widest text-slate-400">
                      Firmar Aquí
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={logout}
                className="flex items-center px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-md hover:bg-red-100 transition-colors"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Cerrar sesión
              </button>

              <div className="flex items-center gap-4">
                {message && message.type === "success" && (
                  <span className="text-sm text-emerald-600 font-medium hidden sm:inline-block">
                    ¡Guardado!
                  </span>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center px-6 py-2.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Guardar Cambios
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Opción adicional para dispositivos móviles donde el menú lateral se oculta */}
      <div className="mt-8 flex justify-center md:hidden pb-12">
        <button
          onClick={logout}
          className="flex items-center px-6 py-3 bg-red-100 text-red-700 font-bold rounded-xl hover:bg-red-200 transition-colors shadow-sm"
        >
          <LogOut className="w-5 h-5 mr-2" />
          Cerrar Sesión desde este dispositivo
        </button>
      </div>
    </div>
  );
};
