import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { Loader2, Plus,
  Trash2,
  AlertTriangle,
  ShieldCheck,
  Activity,
  X,
  Search, } from "lucide-react";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { ConfirmationModal } from "./ui/ConfirmationModal";

export interface IpercRisk {
  id?: string;
  companyRuc: string;
  jobPosition: string;
  activity: string;
  hazard: string;
  risk: string;
  probability: number;
  severity: number;
  riskScore: number;
  riskLevel: string;
  controlMeasures: string;
  createdAt?: any;
  createdBy: string;
}

export const IpercManager: React.FC = () => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();
  const [risks, setRisks] = useState<IpercRisk[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form State
  const [jobPosition, setJobPosition] = useState("");
  const [activity, setActivity] = useState("");
  const [hazard, setHazard] = useState("");
  const [riskDesc, setRiskDesc] = useState("");
  const [probability, setProbability] = useState<number>(1);
  const [severity, setSeverity] = useState<number>(1);
  const [controlMeasures, setControlMeasures] = useState("");

  const [searchTerm, setSearchTerm] = useState("");

  const companyRuc = selectedCompany?.ruc || profile?.companyRuc;
  const isEmployer = ["employer", "super_admin", "gerencia"].includes(profile?.role || "");
  const [riskToDelete, setRiskToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!companyRuc) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "iperc_matrix"),
      where("companyRuc", "==", companyRuc),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as IpercRisk[];
        setRisks(data);
        setLoading(false);
      },
      (error) => {
        // It's possible we may get permission denied if rules aren't set up yet,
        // handled gracefully by the error handler
        handleFirestoreError(error, OperationType.LIST, "iperc_matrix");
        setLoading(false);
      },
    );

    return () => {
      let isUnsubscribed = false;
      try {
        unsubscribe();
        isUnsubscribed = true;
      } catch (err) {
        console.error("Error formatting exit in IpercManager:", err);
      }
    };
  }, [companyRuc]);

  const getRiskLevelConfig = (score: number) => {
    if (score <= 2)
      return {
        label: "Trivial / Tolerable",
        color: "bg-emerald-100 text-emerald-800 border-emerald-200",
      };
    if (score <= 4)
      return {
        label: "Moderado",
        color: "bg-amber-100 text-amber-800 border-amber-200",
      };
    if (score <= 6)
      return {
        label: "Importante",
        color: "bg-orange-100 text-orange-800 border-orange-200",
      };
    return {
      label: "Intolerable",
      color: "bg-red-100 text-red-800 border-red-200",
    };
  };

  const handleSaveRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyRuc || !profile) return;

    const score = probability * severity;
    const levelConfig = getRiskLevelConfig(score);

    try {
      await addDoc(collection(db, "iperc_matrix"), {
        companyRuc,
        jobPosition,
        activity,
        hazard,
        risk: riskDesc,
        probability,
        severity,
        riskScore: score,
        riskLevel: levelConfig.label,
        controlMeasures,
        createdBy: profile.uid,
        createdAt: serverTimestamp(),
      });
      toast.success("Riesgo IPERC agregado exitosamente.");
      setIsModalOpen(false);
      // Reset form
      setJobPosition("");
      setActivity("");
      setHazard("");
      setRiskDesc("");
      setProbability(1);
      setSeverity(1);
      setControlMeasures("");
    } catch (error) {
      console.error("Error saving risk:", error);
      toast.error(
        "Error al guardar el riesgo. Tu base de datos puede tener las reglas cerradas aún, estamos por corregirlo si pasa.",
      );
    }
  };

  const handleDelete = (id: string) => {
    setRiskToDelete(id);
  };

  const confirmDelete = async () => {
    if (!riskToDelete) return;
    try {
      await deleteDoc(doc(db, "iperc_matrix", riskToDelete));
      toast.success("Riesgo eliminado exitosamente.");
      setRiskToDelete(null);
    } catch (e) {
      console.error(e);
      toast.error("Error al eliminar el riesgo");
    }
  };

  if (loading)
    return (
      <div className="p-8 text-center text-slate-500">Cargando matriz...</div>
    );

  const filteredRisks = risks.filter(
    (r) =>
      r.jobPosition.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.activity.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="flex-1 w-full bg-white rounded-b-xl border-t border-slate-200">
      {/* Action Bar */}
      <div className="p-6 flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-100 bg-white">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-bold text-slate-800">
            Matriz Operativa Vivo
          </h3>
          <p className="text-sm text-slate-500">
            Registro y evaluación matemática de peligros ({risks.length})
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar puesto o actividad..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
            />
          </div>
          {isEmployer && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center justify-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Añadir Riesgo
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-semibold">Puesto / Actividad</th>
              <th className="px-6 py-4 font-semibold">Peligro y Riesgo</th>
              <th className="px-6 py-4 font-semibold text-center">
                Evaluación (P x S)
              </th>
              <th className="px-6 py-4 font-semibold">Medidas de Control</th>
              {isEmployer && (
                <th className="px-6 py-4 text-center font-semibold">
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRisks.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-12 text-center text-slate-500"
                >
                  <ShieldCheck className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                  <p className="text-base font-medium text-slate-700">
                    No hay riesgos para mostrar
                  </p>
                  <p className="mt-1">
                    {searchTerm
                      ? "No se encontraron coincidencias para tu búsqueda."
                      : "Comienza añadiendo los peligros por puesto de trabajo."}
                  </p>
                </td>
              </tr>
            ) : (
              filteredRisks.map((r) => {
                const config = getRiskLevelConfig(r.riskScore);
                return (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-6 py-4 align-top w-1/4">
                      <div className="font-semibold text-slate-800">
                        {r.jobPosition}
                      </div>
                      <div className="text-slate-500 text-xs mt-1">
                        {r.activity}
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top w-1/4">
                      <div className="font-medium text-slate-700">
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-0.5">
                          Peligro (Situación/Fuente)
                        </span>
                        {r.hazard}
                      </div>
                      <div className="text-slate-600 mt-2">
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-0.5">
                          Riesgo (Consecuencia)
                        </span>
                        {r.risk}
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top text-center w-48">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <div className="flex gap-2 text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-md mb-2 shadow-sm border border-slate-200">
                          <span title="Probabilidad">P:{r.probability}</span>
                          <span className="text-slate-300">×</span>
                          <span title="Severidad">S:{r.severity}</span>
                          <span className="text-slate-300">=</span>
                          <span className="text-slate-800 text-sm">
                            {r.riskScore}
                          </span>
                        </div>
                        <span
                          className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${config.color} uppercase tracking-wider text-center`}
                        >
                          {config.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <p className="text-slate-600 leading-relaxed font-medium">
                        {r.controlMeasures}
                      </p>
                    </td>
                    {isEmployer && (
                      <td className="px-6 py-4 align-top text-center w-24">
                        <button
                          onClick={() => r.id && handleDelete(r.id)}
                          title="Eliminar Riesgo"
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Full-screen Modal for Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-50 overflow-y-auto flex flex-col">
          {/* Sticky Header Full Screen */}
          <div className="flex justify-between items-center p-6 border-b border-slate-200 bg-white sticky top-0 z-10 shadow-sm">
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Activity className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
                Registrar Nuevo Riesgo o Peligro
              </h3>
              <p className="text-sm sm:text-base text-slate-500 mt-1">
                Completa los datos para alimentar la Matriz Interactiva de la
                empresa.
              </p>
            </div>
            <button
              onClick={() => setIsModalOpen(false)}
              className="text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 p-2 sm:px-4 sm:py-2 rounded-full sm:rounded-lg transition-colors flex items-center gap-2 font-medium"
            >
              <X className="w-5 h-5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Cerrar y Cancelar</span>
            </button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-8">
            <form
              onSubmit={handleSaveRisk}
              className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 sm:p-10 mb-12 grid grid-cols-1 md:grid-cols-2 gap-8"
            >
              {/* Paso 1 */}
              <div className="md:col-span-2 space-y-4">
                <h4 className="text-xs font-bold text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1.5 inline-block rounded-md uppercase tracking-wider mb-2">
                  Paso 1: Contexto
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Filtro de Puesto de Trabajo
                    </label>
                    <input
                      required
                      type="text"
                      value={jobPosition}
                      onChange={(e) => setJobPosition(e.target.value)}
                      placeholder="Ej. Soldador, Electricista, Administrativo..."
                      className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-all text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Actividad Específica
                    </label>
                    <input
                      required
                      type="text"
                      value={activity}
                      onChange={(e) => setActivity(e.target.value)}
                      placeholder="Ej. Izaje de cargas, Trabajo en oficina..."
                      className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-all text-slate-700"
                    />
                  </div>
                </div>
              </div>

              {/* Paso 2 */}
              <div className="md:col-span-2 space-y-4 mt-2 pt-8 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1.5 inline-block rounded-md uppercase tracking-wider mb-2">
                  Paso 2: Identificador IP
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Peligro (La Fuente/Situación)
                    </label>
                    <textarea
                      required
                      value={hazard}
                      onChange={(e) => setHazard(e.target.value)}
                      rows={3}
                      placeholder="Ej. Exposición a ruido constante de 90dB en sala general..."
                      className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-all resize-none text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Riesgo (Evento y Consecuencia)
                    </label>
                    <textarea
                      required
                      value={riskDesc}
                      onChange={(e) => setRiskDesc(e.target.value)}
                      rows={3}
                      placeholder="Ej. Pérdida auditiva progresiva, estrés agudo..."
                      className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-all resize-none text-slate-700"
                    />
                  </div>
                </div>
              </div>

              {/* Paso 3 */}
              <div className="md:col-span-2 space-y-4 mt-4 bg-blue-50/50 p-6 sm:p-8 rounded-2xl border border-blue-100">
                <h4 className="text-xs font-bold text-blue-500 bg-blue-100 border border-blue-200 px-3 py-1.5 inline-block rounded-md uppercase tracking-wider mb-4">
                  Paso 3: Evaluación Algorítmica (ER)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 items-center flex-wrap">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Índice de Probabilidad (P)
                    </label>
                    <select
                      value={probability}
                      onChange={(e) => setProbability(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-xl p-3 bg-white font-medium outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 shadow-sm"
                    >
                      <option value={1}>1 - Baja Probabilidad</option>
                      <option value={2}>2 - Media Probabilidad</option>
                      <option value={3}>3 - Alta Probabilidad</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Índice de Severidad (S)
                    </label>
                    <select
                      value={severity}
                      onChange={(e) => setSeverity(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-xl p-3 bg-white font-medium outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 shadow-sm"
                    >
                      <option value={1}>1 - Ligeramente Dañino</option>
                      <option value={2}>2 - Dañino / Lesión</option>
                      <option value={3}>3 - Fatal / Irreversible</option>
                    </select>
                  </div>
                  <div className="text-center pt-6 pb-4 bg-white px-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-sm text-slate-400 font-bold uppercase tracking-widest mb-2 flex justify-center gap-1.5">
                      <span title="Probabilidad">P: {probability}</span>
                      <span>×</span>
                      <span title="Severidad">S: {severity}</span>
                      <span>=</span>
                      <span className="text-blue-600 font-black">
                        {probability * severity}
                      </span>
                    </div>
                    <div
                      className={`px-6 py-3 font-bold rounded-xl border inline-block w-full text-center shadow-sm ${getRiskLevelConfig(probability * severity).color}`}
                    >
                      {getRiskLevelConfig(probability * severity).label}
                    </div>
                  </div>
                </div>
              </div>

              {/* Paso 4 */}
              <div className="md:col-span-2 space-y-4 mt-2 pt-8 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1.5 inline-block rounded-md uppercase tracking-wider mb-2">
                  Paso 4: Controles
                </h4>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    Medidas de Control (Existentes o Propuestas)
                  </label>
                  <textarea
                    required
                    value={controlMeasures}
                    onChange={(e) => setControlMeasures(e.target.value)}
                    rows={4}
                    placeholder="Ej. Implementación de guardas, Tapones tipo copa (NRR 25dB), capacitaciones bimestrales..."
                    className="w-full border border-slate-300 rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-all resize-none text-slate-700"
                  />
                </div>
              </div>

              <div className="md:col-span-2 flex flex-col sm:flex-row justify-end gap-4 mt-8 pt-8 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-8 py-4 text-slate-600 border border-slate-300 font-bold bg-white hover:bg-slate-50 rounded-xl transition-colors shadow-sm text-center"
                >
                  Cancelar Redacción
                </button>
                <button
                  type="submit"
                  className="px-8 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                >
                  Guardar e Ingresar a IPERC
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!riskToDelete}
        onClose={() => setRiskToDelete(null)}
        onConfirm={confirmDelete}
        title="Eliminar Riesgo"
        message="¿Estás seguro de que deseas eliminar este riesgo de la matriz IPERC? Esta acción no se puede deshacer."
      />
    </div>
  );
};
