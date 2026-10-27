import React, { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { UserProfile, CommitteeMember } from "../types";
import { Plus, Trash2, Mail, Phone, Calendar, User, Briefcase, Award, ShieldCheck, X } from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import Select from "react-select";
import { isMainAdmin } from "../constants/admin";

type Mode = "committee" | "supervisor";

const COMMITTEE_ROLES = ["Presidente", "Secretario", "Miembro Titular", "Miembro Suplente", "Observador"] as const;
const SUPERVISOR_ROLES = ["Supervisor SST", "Supervisor Suplente"] as const;
const ROLE_ORDER: Record<string, number> = {
  "Supervisor SST": 0,
  "Supervisor Suplente": 1,
  Presidente: 1,
  Secretario: 2,
  Vocal: 3,
  "Miembro Titular": 4,
  "Miembro Suplente": 5,
  Observador: 6,
};

const formatDate = (value?: string) => {
  if (!value) return "";
  const d = new Date(value + "T00:00:00");
  return isNaN(d.getTime()) ? value : format(d, "dd/MM/yyyy");
};

// Miembros del Comité de SST o Supervisor de SST de la empresa.
// El administrador elige a la persona entre los trabajadores registrados.
export const CommitteeMembersTab: React.FC<{ mode?: Mode }> = ({ mode = "committee" }) => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();
  const isSupervisorMode = mode === "supervisor";
  const roles: readonly string[] = isSupervisorMode ? SUPERVISOR_ROLES : COMMITTEE_ROLES;

  const [members, setMembers] = useState<CommitteeMember[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUid, setSelectedUid] = useState<string>("");
  const [position, setPosition] = useState("");
  const [representation, setRepresentation] = useState<"employer" | "worker">("employer");
  const [role, setRole] = useState<string>(roles[0]);
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdmin = ["employer", "super_admin", "gerencia"].includes(profile?.role || "") || isMainAdmin(profile?.email);

  useEffect(() => {
    if (!selectedCompany) return;
    setLoading(true);

    getDocs(query(collection(db, "users"), where("companyRuc", "==", selectedCompany.ruc)))
      .then((snap) => setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile)))
      .catch((err) => console.error("Error fetching users", err));

    const qMembers = query(collection(db, "committee_members"), where("companyRuc", "==", selectedCompany.ruc));
    const unsubscribe = onSnapshot(
      qMembers,
      (snap) => {
        setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CommitteeMember));
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching committee members", err);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [selectedCompany]);

  // Solo se muestran los del tipo que corresponde a la empresa
  const visibleMembers = useMemo(
    () =>
      members
        .filter((m) => (SUPERVISOR_ROLES as readonly string[]).includes(m.role) === isSupervisorMode)
        .sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99)),
    [members, isSupervisorMode],
  );

  const userOptions = useMemo(
    () =>
      users
        .filter((u) => !visibleMembers.some((m) => m.userId === u.uid))
        .map((u) => ({ value: u.uid, label: `${u.displayName || u.email}${u.dni ? ` · DNI ${u.dni}` : ""}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [users, visibleMembers],
  );
  const selectedUser = users.find((u) => u.uid === selectedUid);
  const userFor = (m: CommitteeMember) => users.find((u) => u.uid === m.userId);

  const openModal = () => {
    setSelectedUid("");
    setPosition("");
    setRepresentation(isSupervisorMode ? "worker" : "employer");
    const hasTitular = visibleMembers.some((m) => m.role === "Supervisor SST");
    setRole(isSupervisorMode && hasTitular ? "Supervisor Suplente" : roles[isSupervisorMode ? 0 : 2]);
    setStartDate(format(new Date(), "yyyy-MM-dd"));
    setEndDate("");
    setIsModalOpen(true);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !selectedUser) {
      toast.error("Elige a una persona de la lista");
      return;
    }
    setSaving(true);
    try {
      // Solo hay un supervisor titular y un suplente: el nuevo reemplaza al anterior
      if (isSupervisorMode) {
        await Promise.all(
          visibleMembers.filter((m) => m.role === role && m.id).map((m) => deleteDoc(doc(db, "committee_members", m.id!))),
        );
      }
      await addDoc(collection(db, "committee_members"), {
        userId: selectedUser.uid,
        name: selectedUser.displayName || selectedUser.email,
        dni: selectedUser.dni || "",
        position: position || selectedUser.position || "",
        representation: isSupervisorMode ? "worker" : representation,
        role,
        startDate,
        endDate,
        companyRuc: selectedCompany.ruc,
        createdAt: serverTimestamp(),
      });
      toast.success(isSupervisorMode ? "Supervisor designado" : "Miembro agregado");
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (member: CommitteeMember) => {
    const what = isSupervisorMode ? "quitar a este supervisor" : "quitar a este miembro del comité";
    if (!window.confirm(`¿Seguro que quieres ${what}?`)) return;
    try {
      await deleteDoc(doc(db, "committee_members", member.id!));
      toast.success("Quitado");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo quitar");
    }
  };

  if (loading) return <div className="py-12 text-center text-slate-500">Cargando...</div>;

  const title = isSupervisorMode ? "Supervisor de SST" : "Miembros del Comité de SST";
  const subtitle = isSupervisorMode
    ? "Persona elegida para vigilar la seguridad y salud en el trabajo de la empresa (Ley N° 29783)."
    : "Representantes del empleador y de los trabajadores (Ley N° 29783).";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        {isAdmin && (
          <button
            onClick={openModal}
            className="flex shrink-0 items-center justify-center rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            {isSupervisorMode ? "Elegir supervisor" : "Agregar miembro"}
          </button>
        )}
      </div>

      {visibleMembers.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="font-semibold text-slate-700">
            {isSupervisorMode ? "Todavía no se ha elegido un supervisor." : "Todavía no hay miembros en el comité."}
          </p>
          {isAdmin && (
            <p className="mt-1 text-sm text-slate-500">
              Usa el botón «{isSupervisorMode ? "Elegir supervisor" : "Agregar miembro"}» para elegirlo de la lista de trabajadores.
            </p>
          )}
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 ${isSupervisorMode ? "" : "lg:grid-cols-3 xl:grid-cols-4"}`}>
          {visibleMembers.map((member) => {
            const user = userFor(member);
            const main = member.role === "Supervisor SST" || member.role === "Presidente";
            return (
              <div
                key={member.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <div className={`relative h-16 w-full ${main ? "brand-gradient" : "bg-blue-100"}`}>
                  {isAdmin && (
                    <button
                      onClick={() => handleRemoveMember(member)}
                      className="absolute right-2 top-2 rounded-lg bg-white/80 p-2 text-slate-500 transition-colors hover:bg-white hover:text-red-600"
                      title="Quitar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="relative -mt-9 flex justify-center">
                  <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white bg-blue-50 text-2xl font-black text-blue-700 shadow">
                    {(member.name || "U").charAt(0).toUpperCase()}
                  </div>
                </div>
                <div className="flex flex-1 flex-col items-center p-5 pt-3 text-center">
                  <h4 className="text-base font-bold text-slate-900">{member.name || "Usuario"}</h4>
                  <span className="mb-4 mt-1 inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                    <Award className="mr-1 h-3.5 w-3.5" />
                    {member.role}
                  </span>
                  <div className="mt-auto w-full space-y-2 text-left text-sm text-slate-600">
                    <Row icon={Briefcase}>{member.position || "Sin cargo registrado"}</Row>
                    <Row icon={User}>DNI: {member.dni || "No registrado"}</Row>
                    {!isSupervisorMode && (
                      <Row icon={ShieldCheck}>
                        {member.representation === "employer" ? "Representa al empleador" : "Representa a los trabajadores"}
                      </Row>
                    )}
                    {member.startDate && (
                      <Row icon={Calendar}>
                        Desde {formatDate(member.startDate)}
                        {member.endDate ? ` hasta ${formatDate(member.endDate)}` : ""}
                      </Row>
                    )}
                    {user?.email && <Row icon={Mail}>{user.email}</Row>}
                    {user?.phoneNumber && <Row icon={Phone}>{user.phoneNumber}</Row>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <h3 className="font-bold text-slate-800">{isSupervisorMode ? "Elegir supervisor de SST" : "Agregar miembro al comité"}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600" title="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-4 p-6 text-left">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Trabajador</label>
                <Select
                  options={userOptions}
                  value={userOptions.find((o) => o.value === selectedUid) || null}
                  onChange={(opt) => {
                    setSelectedUid(opt?.value || "");
                    const u = users.find((x) => x.uid === opt?.value);
                    setPosition(u?.position || "");
                  }}
                  placeholder="Busca por nombre o DNI..."
                  noOptionsMessage={() => "No hay trabajadores para elegir"}
                  menuPortalTarget={document.body}
                  styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }}
                />
                {selectedUser && !selectedUser.dni && (
                  <p className="mt-1 text-xs text-amber-700">Esta persona no tiene DNI en su perfil.</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Cargo</label>
                <input
                  type="text"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej. Jefe de laboratorio"
                />
              </div>
              <div className={`grid gap-4 ${isSupervisorMode ? "grid-cols-1" : "grid-cols-2"}`}>
                {!isSupervisorMode && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Representa a</label>
                    <select
                      value={representation}
                      onChange={(e) => setRepresentation(e.target.value as "employer" | "worker")}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="employer">Empleador</option>
                      <option value="worker">Trabajadores</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{isSupervisorMode ? "Tipo" : "Rol en el comité"}</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r === "Supervisor SST" ? "Supervisor titular" : r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {isSupervisorMode && visibleMembers.some((m) => m.role === role) && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Ya hay un {role === "Supervisor SST" ? "supervisor titular" : "supervisor suplente"}. Al guardar, esta persona lo reemplaza.
                </p>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Desde</label>
                  <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Hasta (opcional)</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 font-medium text-slate-600 hover:text-slate-800">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !selectedUid}
                  className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const Row: React.FC<{ icon: React.ElementType; children: React.ReactNode }> = ({ icon: Icon, children }) => (
  <div className="flex items-center rounded-lg bg-slate-50 p-2">
    <Icon className="mr-3 h-4 w-4 shrink-0 text-slate-400" />
    <span className="min-w-0 truncate">{children}</span>
  </div>
);
