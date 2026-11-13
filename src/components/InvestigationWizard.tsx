import React, { useState } from "react";
import { Report, Investigation } from "../types";
import { X, Loader2, Save, Edit3 } from "lucide-react";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";

interface InvestigationWizardProps {
  report: Report;
  onClose: () => void;
}

export const InvestigationWizard: React.FC<InvestigationWizardProps> = ({
  report,
  onClose,
}) => {
  const { profile } = useAuth();
  const [methodology, setMethodology] = useState<Investigation["methodology"]>(
    report.investigation?.methodology || "5whys",
  );
  const [activityPerformed, setActivityPerformed] = useState("");
  const [consequences, setConsequences] = useState("");

  // Manual fields
  const [summary, setSummary] = useState(report.investigation?.summary || "");
  const [whys, setWhys] = useState(
    report.investigation?.methodologyData?.whys || ["", "", "", "", ""],
  );
  const [ishikawa, setIshikawa] = useState(
    report.investigation?.methodologyData?.ishikawa || {
      manpower: "",
      machine: "",
      material: "",
      method: "",
      environment: "",
      measurement: "",
    },
  );
  const [icam, setIcam] = useState(
    report.investigation?.methodologyData?.icam || {
      defenses: "",
      actions: "",
      conditions: "",
      organizational: "",
    },
  );
  const [faultTree, setFaultTree] = useState(
    report.investigation?.methodologyData?.faultTree || {
      topEvent: "",
      causes: "",
    },
  );
  const [immediateCauses, setImmediateCauses] = useState(
    report.investigation?.immediateCauses?.join("\n") || "",
  );
  const [basicCauses, setBasicCauses] = useState(
    report.investigation?.basicCauses?.join("\n") || "",
  );
  const [correctiveMeasures, setCorrectiveMeasures] = useState(
    report.investigation?.correctiveMeasures?.join("\n") || "",
  );
  const [preventiveMeasures, setPreventiveMeasures] = useState(
    report.investigation?.preventiveMeasures?.join("\n") || "",
  );
  const [recommendations, setRecommendations] = useState(
    report.investigation?.recommendations?.join("\n") || "",
  );

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!summary.trim()) {
      setError("Por favor, completa al menos el resumen de la investigación.");
      return;
    }

    setIsSaving(true);
    setError(null);

    let compiledDevelopment = "";
    let methData = {};
    if (methodology === "5whys") {
      compiledDevelopment = whys
        .map((w, i) => `¿Por qué ${i + 1}?: ${w}`)
        .join("\n");
      methData = { whys };
    } else if (methodology === "ishikawa") {
      compiledDevelopment = `Mano de obra: ${ishikawa.manpower}\n\nMáquina: ${ishikawa.machine}\n\nMaterial: ${ishikawa.material}\n\nMétodo: ${ishikawa.method}\n\nMedio Ambiente: ${ishikawa.environment}\n\nMedida: ${ishikawa.measurement}`;
      methData = { ishikawa };
    } else if (methodology === "icam") {
      compiledDevelopment = `Defensas Ausentes/Fallidas:\n${icam.defenses}\n\nAcciones Individuales/Equipo:\n${icam.actions}\n\nCondiciones de la Tarea/Entorno:\n${icam.conditions}\n\nFactores Organizacionales:\n${icam.organizational}`;
      methData = { icam };
    } else if (methodology === "fault_tree") {
      compiledDevelopment = `Hecho Principal:\n${faultTree.topEvent}\n\nCausas:\n${faultTree.causes}`;
      methData = { faultTree };
    }

    const investigation: Investigation = {
      methodology,
      activityPerformed,
      consequences,
      summary,
      development: compiledDevelopment,
      methodologyData: methData,
      immediateCauses: immediateCauses.split("\n").filter((c) => c.trim()),
      basicCauses: basicCauses.split("\n").filter((c) => c.trim()),
      correctiveMeasures: correctiveMeasures
        .split("\n")
        .filter((c) => c.trim()),
      preventiveMeasures: preventiveMeasures
        .split("\n")
        .filter((c) => c.trim()),
      recommendations: recommendations.split("\n").filter((c) => c.trim()),
      conductedBy: profile?.uid || "",
      conductedByName: profile?.displayName || profile?.email || "Admin",
      conductedAt: new Date(),
    };

    try {
      await updateDoc(doc(db, "reports", report.id!), {
        investigation,
        status: "reviewed", // Automatically mark as reviewed
      });
      onClose();
    } catch (err) {
      console.error("Error saving investigation:", err);
      setError("Error al guardar la investigación.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-7xl max-h-[95vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <Edit3 className="w-6 h-6 text-sky-600" />
            <h2 className="text-xl font-bold text-slate-800">
              Investigación de Evento
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h3 className="font-medium text-slate-800 mb-2">
              Datos del Reporte Original
            </h3>
            <p className="text-sm text-slate-600">
              <strong>Tipo:</strong> {report.type}
            </p>
            <p className="text-sm text-slate-600">
              <strong>Descripción:</strong> {report.description}
            </p>
            <p className="text-sm text-slate-600">
              <strong>Lugar:</strong> {report.location}
            </p>
            <p className="text-sm text-slate-600">
              <strong>Trabajador:</strong> {report.reportedByName}
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Actividad que realizaba
              </label>
              <input
                type="text"
                value={activityPerformed}
                onChange={(e) => setActivityPerformed(e.target.value)}
                placeholder="Ej. Mantenimiento preventivo..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Consecuencias o daños
              </label>
              <input
                type="text"
                value={consequences}
                onChange={(e) => setConsequences(e.target.value)}
                placeholder="Ej. Corte superficial en mano..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-4">
            <div>
              <label className="block text-sm font-medium text-blue-900 mb-1">
                Metodología de Investigación
              </label>
              <select
                value={methodology}
                onChange={(e) => setMethodology(e.target.value as any)}
                className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="5whys">Método de los 5 ¿Por qué?</option>
                <option value="ishikawa">
                  Diagrama de Ishikawa (Causa-Efecto)
                </option>
                <option value="icam">Modelo de causalidad ICAM</option>
                <option value="fault_tree">Árbol de causas</option>
              </select>
            </div>

            <div className="bg-white p-4 rounded-lg border border-blue-100 shadow-sm">
              <h4 className="font-bold text-slate-800 mb-3">
                Datos para{" "}
                {methodology === "5whys"
                  ? "5 ¿Por qué?"
                  : methodology === "ishikawa"
                    ? "Ishikawa"
                    : methodology === "icam"
                      ? "ICAM"
                      : "Árbol de Causas"}
              </h4>
              <p className="text-sm text-slate-500 mb-4">
                Llena los datos que conozcas de la metodología elegida; sirven de base para
                completar los detalles de abajo.
              </p>

              {methodology === "5whys" && (
                <div className="space-y-3">
                  {whys.map((why, index) => (
                    <div key={index}>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        ¿Por qué {index + 1}?
                      </label>
                      <input
                        type="text"
                        value={why}
                        onChange={(e) => {
                          const newWhys = [...whys];
                          newWhys[index] = e.target.value;
                          setWhys(newWhys);
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
              )}

              {methodology === "ishikawa" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Mano de Obra
                    </label>
                    <textarea
                      value={ishikawa.manpower}
                      onChange={(e) =>
                        setIshikawa({ ...ishikawa, manpower: e.target.value })
                      }
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Máquina
                    </label>
                    <textarea
                      value={ishikawa.machine}
                      onChange={(e) =>
                        setIshikawa({ ...ishikawa, machine: e.target.value })
                      }
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Material
                    </label>
                    <textarea
                      value={ishikawa.material}
                      onChange={(e) =>
                        setIshikawa({ ...ishikawa, material: e.target.value })
                      }
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Método
                    </label>
                    <textarea
                      value={ishikawa.method}
                      onChange={(e) =>
                        setIshikawa({ ...ishikawa, method: e.target.value })
                      }
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Medio Ambiente
                    </label>
                    <textarea
                      value={ishikawa.environment}
                      onChange={(e) =>
                        setIshikawa({
                          ...ishikawa,
                          environment: e.target.value,
                        })
                      }
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Medición
                    </label>
                    <textarea
                      value={ishikawa.measurement}
                      onChange={(e) =>
                        setIshikawa({
                          ...ishikawa,
                          measurement: e.target.value,
                        })
                      }
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              {methodology === "icam" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Defensas Ausentes / Fallidas
                    </label>
                    <textarea
                      value={icam.defenses}
                      onChange={(e) =>
                        setIcam({ ...icam, defenses: e.target.value })
                      }
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Acciones Individuales / de Equipo
                    </label>
                    <textarea
                      value={icam.actions}
                      onChange={(e) =>
                        setIcam({ ...icam, actions: e.target.value })
                      }
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Condiciones de la Tarea / Entorno
                    </label>
                    <textarea
                      value={icam.conditions}
                      onChange={(e) =>
                        setIcam({ ...icam, conditions: e.target.value })
                      }
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Factores Organizacionales
                    </label>
                    <textarea
                      value={icam.organizational}
                      onChange={(e) =>
                        setIcam({ ...icam, organizational: e.target.value })
                      }
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              {methodology === "fault_tree" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Hecho Principal (Top Event)
                    </label>
                    <input
                      type="text"
                      value={faultTree.topEvent}
                      onChange={(e) =>
                        setFaultTree({ ...faultTree, topEvent: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Causas y Hechos Previos
                    </label>
                    <textarea
                      value={faultTree.causes}
                      onChange={(e) =>
                        setFaultTree({ ...faultTree, causes: e.target.value })
                      }
                      rows={4}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 border-t border-slate-200 pt-6">
            <h3 className="font-bold text-slate-800 text-lg">
              Detalles de la Investigación
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Completa el resumen, las causas y las medidas a partir del análisis de arriba.
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Resumen del Evento
              </label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="Resumen claro y conciso..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Causas Inmediatas (una por línea)
                </label>
                <textarea
                  value={immediateCauses}
                  onChange={(e) => setImmediateCauses(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="- Causa 1&#10;- Causa 2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Causas Básicas (una por línea)
                </label>
                <textarea
                  value={basicCauses}
                  onChange={(e) => setBasicCauses(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="- Causa 1&#10;- Causa 2"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Medidas Correctivas (una por línea)
                </label>
                <textarea
                  value={correctiveMeasures}
                  onChange={(e) => setCorrectiveMeasures(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="- Medida 1&#10;- Medida 2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Medidas Preventivas (una por línea)
                </label>
                <textarea
                  value={preventiveMeasures}
                  onChange={(e) => setPreventiveMeasures(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="- Medida 1&#10;- Medida 2"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Recomendaciones SST (una por línea)
              </label>
              <textarea
                value={recommendations}
                onChange={(e) => setRecommendations(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="- Recomendación 1&#10;- Recomendación 2"
              />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center justify-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium"
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5 mr-2" />
                Guardar Investigación
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
