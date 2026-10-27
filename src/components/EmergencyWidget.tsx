import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { createPortal } from "react-dom";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { EmergencyContact } from "../types";
import { Loader2, Phone, AlertCircle, Plus, Trash2, X } from "lucide-react";

import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";

export const EmergencyWidget: React.FC = () => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();
  const [isOpen, setIsOpen] = useState(false);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<"hospital" | "fire" | "police" | "internal">(
    "internal",
  );
  const [description, setDescription] = useState("");

  useEffect(() => {
    const targetRuc = selectedCompany?.ruc || profile?.companyRuc;
    if (!targetRuc) return;

    const q = query(
      collection(db, "emergency_contacts"),
      where("companyRuc", "==", targetRuc),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setContacts(
          snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as EmergencyContact,
          ),
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "emergency_contacts");
      },
    );
    return () => unsubscribe();
  }, [profile?.companyRuc]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetRuc = selectedCompany?.ruc || profile?.companyRuc;
    if (
      ["employer", "super_admin", "gerencia"].indexOf(profile?.role || "") === -1 ||
      !targetRuc
    )
      return;

    try {
      await addDoc(collection(db, "emergency_contacts"), {
        name,
        phone,
        type,
        description,
        companyRuc: targetRuc,
        createdAt: Timestamp.now(),
      });
      setName("");
      setPhone("");
      setDescription("");
      setIsAdding(false);
    } catch (error) {
      console.error("Error adding contact:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (["employer", "super_admin", "gerencia"].indexOf(profile?.role || "") === -1) return;
    try {
      await deleteDoc(doc(db, "emergency_contacts", id));
      toast.success("Contacto de emergencia eliminado.");
    } catch (error) {
      console.error("Error deleting contact:", error);
      toast.error("Error al eliminar contacto.");
    }
  };

  return (
    <>
      {/* Header Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="relative p-2 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors focus:outline-none"
        title="Contactos de Emergencia"
      >
        <AlertCircle className="w-6 h-6" />
      </button>

      {/* Modal */}
      {isOpen &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
              <div className="bg-red-600 p-4 flex justify-between items-center text-white">
                <h2 className="text-xl font-bold flex items-center">
                  <AlertCircle className="w-6 h-6 mr-2" />
                  Directorio de Emergencias
                </h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-white/80 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto flex-1">
                {["employer", "super_admin", "gerencia"].includes(profile?.role || "") &&
                  !isAdding && (
                    <button
                      onClick={() => setIsAdding(true)}
                      className="w-full mb-4 py-2 border-2 border-dashed border-slate-300 text-slate-600 rounded-lg hover:border-red-400 hover:text-red-600 flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-5 h-5 mr-2" />
                      Agregar Contacto
                    </button>
                  )}

                {isAdding &&
                  ["employer", "super_admin", "gerencia"].includes(profile?.role || "") && (
                    <form
                      onSubmit={handleAdd}
                      className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200"
                    >
                      <div className="space-y-3">
                        <input
                          type="text"
                          required
                          placeholder="Nombre (ej. Bomberos Central)"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                        <input
                          type="tel"
                          required
                          placeholder="Teléfono"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                        <select
                          value={type}
                          onChange={(e) => setType(e.target.value as any)}
                          className="w-full px-3 py-2 border rounded-lg"
                        >
                          <option value="internal">Brigada Interna</option>
                          <option value="hospital">Hospital / Clínica</option>
                          <option value="fire">Bomberos</option>
                          <option value="police">Policía</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Descripción (opcional)"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                        <div className="flex justify-end space-x-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setIsAdding(false)}
                            className="px-3 py-1 text-slate-600"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className="px-3 py-1 bg-red-600 text-white rounded-lg"
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                <div className="space-y-3">
                  {contacts.length === 0 && !isAdding && (
                    <p className="text-center text-slate-500 py-4">
                      No hay contactos de emergencia registrados.
                    </p>
                  )}
                  {contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative group"
                    >
                      {["employer", "super_admin", "gerencia"].includes(
                        profile?.role || "",
                      ) && (
                        <button
                          onClick={() => handleDelete(contact.id!)}
                          className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <div className="flex items-start">
                        <div
                          className={`p-2 rounded-lg mr-3 ${
                            contact.type === "hospital"
                              ? "bg-sky-100 text-blue-600"
                              : contact.type === "fire"
                                ? "bg-orange-100 text-orange-600"
                                : contact.type === "police"
                                  ? "bg-slate-100 text-slate-800"
                                  : "bg-red-100 text-red-600"
                          }`}
                        >
                          <Phone className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900">
                            {contact.name}
                          </h3>
                          <a
                            href={`tel:${contact.phone}`}
                            className="text-lg font-medium text-blue-600 hover:underline block my-1"
                          >
                            {contact.phone}
                          </a>
                          {contact.description && (
                            <p className="text-sm text-slate-500">
                              {contact.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
