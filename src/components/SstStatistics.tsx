import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { SSTStatistic } from "../types";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { Loader2, Calculator,
  Plus,
  Trash2,
  TrendingUp,
  AlertCircle,
  FileSpreadsheet,
  X,
  ShieldCheck,
  Activity,
  CalendarDays, } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { exportToExcel } from "../utils/exportToExcel";
import { ConfirmationModal } from "./ui/ConfirmationModal";

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

import { PageHeader } from "./ui/PageHeader";

export const SstStatistics: React.FC = () => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();
  const [statistics, setStatistics] = useState<SSTStatistic[]>([]);
  const [reportsData, setReportsData] = useState<any[]>([]);
  const [activitiesData, setActivitiesData] = useState<any[]>([]);
  const [eppData, setEppData] = useState<any[]>([]);
  const [drillsData, setDrillsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  // Form State
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [hht, setHht] = useState<number | "">("");
  const [accidents, setAccidents] = useState<number | "">(0);
  const [lostDays, setLostDays] = useState<number | "">(0);
  const [submitting, setSubmitting] = useState(false);

  const [statToDelete, setStatToDelete] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  useEffect(() => {
    if (!profile || !selectedCompany) return;

    const q = query(
      collection(db, "sst_statistics"),
      where("companyRuc", "==", selectedCompany.ruc),
      orderBy("year", "desc"),
      orderBy("month", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const stats = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as SSTStatistic,
        );
        setStatistics(stats);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "sst_statistics");
        setLoading(false);
      },
    );

    // Fetch reports
    const qReports = query(
      collection(db, "reports"),
      where("companyRuc", "==", selectedCompany.ruc)
    );
    const unReports = onSnapshot(qReports, (snapshot) => {
      setReportsData(snapshot.docs.map((doc) => doc.data()));
    }, () => {});

    // Fetch activities
    const qActivities = query(
      collection(db, "annual_activities"),
      where("companyRuc", "==", selectedCompany.ruc)
    );
    const unActivities = onSnapshot(qActivities, (snapshot) => {
      setActivitiesData(snapshot.docs.map((doc) => doc.data()));
    }, () => {});

    // Fetch EPPs
    const qEpps = query(
      collection(db, "epp_deliveries"),
      where("companyRuc", "==", selectedCompany.ruc)
    );
    const qDrills = query(
      collection(db, "drills"),
      where("companyRuc", "==", selectedCompany.ruc)
    );
    const unDrills = onSnapshot(qDrills, (snapshot) => {
      setDrillsData(snapshot.docs.map((doc) => doc.data()));
    }, () => {});

    const unEpps = onSnapshot(qEpps, (snapshot) => {
      setEppData(snapshot.docs.map((doc) => doc.data()));
    }, () => {});

    return () => {
      unsubscribe();
      unReports();
      unActivities();
      unEpps();
      unDrills();
    };
  }, [profile, selectedCompany]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || profile?.role === "worker") return;
    if (hht === "" || accidents === "" || lostDays === "") return;

    // Check if record for year and month already exists
    const exists = statistics.some((s) => s.year === year && s.month === month);
    if (exists) {
      toast.error(`Ya existe un registro estadístico para ${MONTHS[month]} ${year}.`);
      return;
    }

    setSubmitting(true);

    // Calculations
    const numHht = Number(hht);
    const numAccidents = Number(accidents);
    const numLostDays = Number(lostDays);

    let indexFrecuencia = 0;
    let indexGravedad = 0;
    let indexAccidentabilidad = 0;

    if (numHht > 0) {
      indexFrecuencia = (numAccidents * 1000000) / numHht;
      indexGravedad = (numLostDays * 1000000) / numHht;
      indexAccidentabilidad = (indexFrecuencia * indexGravedad) / 1000;
    }

    try {
      await addDoc(collection(db, "sst_statistics"), {
        companyRuc: selectedCompany.ruc,
        year,
        month,
        hht: numHht,
        accidentsWithLeave: numAccidents,
        lostDays: numLostDays,
        if: Number(indexFrecuencia.toFixed(2)),
        ig: Number(indexGravedad.toFixed(2)),
        ia: Number(indexAccidentabilidad.toFixed(2)),
        createdAt: serverTimestamp(),
        createdBy: profile.uid,
      });

      setIsAdding(false);
      setHht("");
      setAccidents(0);
      setLostDays(0);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "sst_statistics");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    setStatToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteStat = async () => {
    if (!statToDelete) return;
    try {
      await deleteDoc(doc(db, "sst_statistics", statToDelete));
      setStatToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "sst_statistics");
    }
  };

  const currentYearStats = statistics
    .filter((s) => s.year === new Date().getFullYear())
    .sort((a, b) => a.month - b.month)
    .map((s) => ({
      name: MONTHS[s.month].substring(0, 3),
      IF: s.if,
      IG: s.ig,
      IA: s.ia,
    }));

  const handleExportExcel = () => {
    const dataToExport = statistics.map((s) => ({
      Año: s.year,
      Mes: MONTHS[s.month],
      "Horas Hombre Trabajadas (HHT)": s.hht,
      "Accidentes Incapacitantes": s.accidentsWithLeave,
      "Días Perdidos": s.lostDays,
      "Índice de Frecuencia (IF)": s.if,
      "Índice de Gravedad (IG)": s.ig,
      "Índice de Accidentabilidad (IA)": s.ia,
    }));
    exportToExcel(dataToExport, `Estadisticas_SST_${selectedCompany?.businessName}`);
  };

  // Advanced Visuals Calculations
  const currentYear = new Date().getFullYear();
  const yearStats = statistics.filter((s) => s.year === currentYear);

  const totalAccidentsYear = yearStats.reduce(
    (sum, s) => sum + s.accidentsWithLeave,
    0,
  );
  const totalLostDaysYear = yearStats.reduce((sum, s) => sum + s.lostDays, 0);
  const totalHHTYear = yearStats.reduce((sum, s) => sum + s.hht, 0);

  const avgIfYear =
    totalHHTYear > 0 ? (totalAccidentsYear * 1000000) / totalHHTYear : 0;
  const avgIgYear =
    totalHHTYear > 0 ? (totalLostDaysYear * 1000000) / totalHHTYear : 0;

  // Calculate "Days without accidents" based on the last registered month without accidents.
  // This is a proxy since we don't know the exact day without full report integration.
  let monthsWithoutAccidents = 0;
  const sortedStatsAsc = [...statistics].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  for (const s of sortedStatsAsc) {
    if (s.accidentsWithLeave === 0) {
      monthsWithoutAccidents++;
    } else {
      break;
    }
  }

  // Bar chart data
  const currentYearBarStats = yearStats
    .sort((a, b) => a.month - b.month)
    .map((s) => ({
      name: MONTHS[s.month].substring(0, 3),
      Accidentes: s.accidentsWithLeave,
      "Días Perdidos": s.lostDays,
    }));

  // Reports Dataset
  const reportsByType = reportsData.reduce((acc, r) => {
    const t = r.type || "Otro";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const reportsChartData = Object.keys(reportsByType).map(k => ({ name: k, value: reportsByType[k] }));
  const COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#64748b"];

  // EPP Delivery Dataset (Count of deliveries per month for current year)
  const eppByMonth = new Array(12).fill(0);
  eppData.forEach(epp => {
    let m = -1;
    let y = -1;
    if (epp.deliveryDate && epp.deliveryDate.seconds) {
      const d = new Date(epp.deliveryDate.seconds * 1000);
      m = d.getMonth();
      y = d.getFullYear();
    } else if (epp.date) {
      const parts = epp.date.split('-');
      if (parts.length === 3) {
        y = parseInt(parts[0]);
        m = parseInt(parts[1]) - 1;
      }
    }
    if (y === currentYear && m >= 0 && m < 12) {
      // you can count number of items, or just the delivery record. We are counting the delivery record
      eppByMonth[m] += 1;
    }
  });
  const eppChartData = eppByMonth.map((val, i) => ({ name: MONTHS[i].slice(0,3), Entregas: val }));

  // Activities Compliance Dataset
  const activitiesByStatus = activitiesData.reduce((acc, a) => {
    let valid = false;
    let y = currentYear;
    // We try to stick to currentYear for activities. 
    // Usually they are scheduled for the current year. Or check category.
    const st = a.status === 'completed' ? 'Completado' : (a.status === 'in_progress' ? 'En Proceso' : 'Pendiente');
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const activitiesChartData = Object.keys(activitiesByStatus).map(k => ({ name: k, value: activitiesByStatus[k] }));
  const STATUS_COLORS: Record<string, string> = { "Completado": "#10b981", "En Proceso": "#3b82f6", "Pendiente": "#64748b" };

  // Drills Metrics
  const drillsByType = drillsData.reduce((acc, d) => {
    const type = d.type || "Otro";
    if (!acc[type]) acc[type] = { count: 0, totalTime: 0, complianceCount: 0 };
    acc[type].count += 1;
    acc[type].totalTime += Number(d.evacuationTimeSeconds) || 0;
    // Assuming compliance = evacuado en <= 180s (3 minutos)
    if ((Number(d.evacuationTimeSeconds) || 0) <= 180 && (Number(d.evacuationTimeSeconds) || 0) > 0) {
      acc[type].complianceCount += 1;
    }
    return acc;
  }, {} as Record<string, { count: number, totalTime: number, complianceCount: number }>);

  const drillsChartData = Object.keys(drillsByType).map(k => {
    const d = drillsByType[k];
    return {
      name: k,
      Frecuencia: d.count,
      TiempoPromedio: d.count > 0 ? Math.round(d.totalTime / d.count) : 0,
      Cumplimiento: d.count > 0 ? Math.round((d.complianceCount / d.count) * 100) : 0
    };
  });

  if (!selectedCompany) {
    return (
      <div className="p-8 text-center bg-white rounded-xl shadow-sm border border-slate-200">
        <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-700">
          Seleccione una empresa
        </h2>
        <p className="text-slate-500">
          Debe seleccionar una empresa para ver sus estadísticas SST.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Estadísticas de Seguridad"
        description="Cálculo de índices IF, IG, IA (Ley 29783)"
        icon={TrendingUp}
        color="sky"
        actions={
          ["employer", "super_admin", "supervisor", "gerencia"].includes(
            profile?.role || "",
          ) && (
            <div className="flex w-full md:w-auto gap-2">
              <button
                onClick={handleExportExcel}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-white/15 text-white rounded-lg hover:bg-white/25 transition font-medium text-sm md:text-base border border-white/30 shadow-sm"
              >
                <FileSpreadsheet className="w-4 h-4 md:w-5 md:h-5" />
                Exportar
              </button>
              <button
                onClick={() => setIsAdding(!isAdding)}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-white text-sky-700 rounded-lg hover:bg-sky-50 transition font-medium text-sm md:text-base border border-transparent shadow-sm"
              >
                {isAdding ? (
                  <X className="w-4 h-4 md:w-5 md:h-5" />
                ) : (
                  <Plus className="w-4 h-4 md:w-5 md:h-5" />
                )}
                {isAdding ? "Cancelar" : "Nuevo Registro"}
              </button>
            </div>
          )
        }
      />

      {isAdding && (
        <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-blue-500" />
            Calcular Nuevos Índices Mensuales
          </h2>
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end"
          >
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Año
              </label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500 bg-slate-50"
              >
                {[year, year - 1, year - 2, year - 3].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Mes
              </label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500 bg-slate-50"
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Horas Trabajadas (HHT)
              </label>
              <input
                type="number"
                min="1"
                required
                value={hht}
                onChange={(e) =>
                  setHht(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                placeholder="Ej. 5000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Accidentes (Descanso)
              </label>
              <input
                type="number"
                min="0"
                required
                value={accidents}
                onChange={(e) =>
                  setAccidents(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                className="w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Días Perdidos
              </label>
              <input
                type="number"
                min="0"
                required
                value={lostDays}
                onChange={(e) =>
                  setLostDays(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                className="w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div className="lg:col-span-5 flex justify-end mt-4">
              <button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Calculando..." : "Calcular y Guardar"}
              </button>
            </div>
          </form>

          <div className="mt-6 bg-slate-50 p-4 rounded-lg text-sm text-slate-600 border border-slate-200">
            <strong>Fórmula ANSI Z16.1</strong>
            <br />
            IF = (Accidentes incapacitantes x 1,000,000) / HHT
            <br />
            IG = (Días perdidos x 1,000,000) / HHT
            <br />
            IA = (IF x IG) / 1000
          </div>
        </div>
      )}

      {/* KPI Summary Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Meses Invictos</p>
            <p className="text-2xl font-bold text-slate-900">
              {monthsWithoutAccidents}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">
              Accidentes ({currentYear})
            </p>
            <p className="text-2xl font-bold text-slate-900">
              {totalAccidentsYear}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <Activity className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">
              IF Promedio ({currentYear})
            </p>
            <p className="text-2xl font-bold text-slate-900">
              {avgIfYear.toFixed(2)}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
            <CalendarDays className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">
              Días Perdidos ({currentYear})
            </p>
            <p className="text-2xl font-bold text-slate-900">
              {totalLostDaysYear}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {currentYearStats.length > 0 && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">
              Evolución de Índices ({currentYear})
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={currentYearStats}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b" }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b" }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "0.5rem",
                      border: "none",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="IF"
                    name="Índice Frecuencia"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="IG"
                    name="Índice Gravedad"
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="IA"
                    name="Accidentabilidad"
                    stroke="#8b5cf6"
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {currentYearBarStats.length > 0 && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">
              Accidentes y Severidad ({currentYear})
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={currentYearBarStats}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b" }}
                  />
                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b" }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b" }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "0.5rem",
                      border: "none",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                  />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="Accidentes"
                    fill="#ef4444"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="Días Perdidos"
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {reportsChartData.length > 0 && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">
              Reportes por Tipo
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={reportsChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {reportsChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: "0.5rem", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activitiesChartData.length > 0 && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">
              Cumplimiento Prog. Anual
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={activitiesChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={0}
                    outerRadius={80}
                    dataKey="value"
                  >
                    {activitiesChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || COLORS[0]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: "0.5rem", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {eppByMonth.some(v => v > 0) && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">
              Entregas EPPs ({currentYear})
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eppChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: "0.5rem", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                  />
                  <Bar dataKey="Entregas" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {drillsChartData.length > 0 && (
          <>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800 mb-4">
                Frecuencia de Simulacros
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={drillsChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b" }} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: "0.5rem", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                    <Bar dataKey="Frecuencia" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Realizados" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800 mb-4">
                Tiempo de Respuesta (Promedio)
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={drillsChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b" }} />
                    <Tooltip contentStyle={{ borderRadius: "0.5rem", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                    <Bar dataKey="TiempoPromedio" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Segundos" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800 mb-4">
                Nivel de Cumplimiento (%)
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={drillsChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b" }} domain={[0, 100]} />
                    <Tooltip contentStyle={{ borderRadius: "0.5rem", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                    <Bar dataKey="Cumplimiento" fill="#10b981" radius={[4, 4, 0, 0]} name="% Cumplimiento (<= 3 min)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 text-center md:text-left">
            Registro Histórico
          </h2>
        </div>

        {/* Mobile View - Cards */}
        <div className="md:hidden flex flex-col gap-4 p-4 bg-slate-50">
          {statistics.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No hay registros estadísticos.
            </div>
          ) : (
            statistics.map((stat, idx) => (
              <div
                key={idx}
                className="bg-white rounded-lg shadow-sm border border-slate-200 p-4"
              >
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-slate-900">
                    {MONTHS[stat.month]} {stat.year}
                  </h3>
                  {["employer", "super_admin", "gerencia"].includes(
                    profile?.role || "",
                  ) && (
                    <button
                      onClick={() => handleDelete(stat.id!)}
                      className="text-slate-400 hover:text-red-500 p-1 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-50 p-2 rounded text-center">
                    <p className="text-xs text-slate-500">HHT</p>
                    <p className="font-medium text-slate-800">
                      {stat.hht.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-red-50 p-2 rounded text-center">
                    <p className="text-xs text-red-600">Accidentes</p>
                    <p className="font-medium text-red-700">
                      {stat.accidentsWithLeave}
                    </p>
                  </div>
                  <div className="col-span-2 bg-orange-50 p-2 rounded text-center">
                    <p className="text-xs text-orange-600">Días Perdidos</p>
                    <p className="font-medium text-orange-700">
                      {stat.lostDays}
                    </p>
                  </div>
                </div>

                <div className="flex justify-between items-center text-sm border-t border-slate-100 pt-3">
                  <div className="text-center w-1/3">
                    <p className="text-xs text-slate-500">IF</p>
                    <p className="font-bold text-blue-600">{stat.if}</p>
                  </div>
                  <div className="text-center w-1/3 border-x border-slate-100">
                    <p className="text-xs text-slate-500">IG</p>
                    <p className="font-bold text-red-600">{stat.ig}</p>
                  </div>
                  <div className="text-center w-1/3">
                    <p className="text-xs text-slate-500">IA</p>
                    <p className="font-bold text-purple-600">{stat.ia}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop View - Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-center">
              <tr>
                <th className="px-4 py-3 font-medium text-left">Periodo</th>
                <th className="px-4 py-3 font-medium">HHT</th>
                <th className="px-4 py-3 font-medium">Accidentes</th>
                <th className="px-4 py-3 font-medium">Días Perdidos</th>
                <th className="px-4 py-3 font-bold text-blue-700 bg-blue-50/50">
                  IF
                </th>
                <th className="px-4 py-3 font-bold text-red-700 bg-red-50/50">
                  IG
                </th>
                <th className="px-4 py-3 font-bold text-purple-700 bg-purple-50/50">
                  IA
                </th>
                {["employer", "super_admin", "gerencia"].includes(profile?.role || "") && (
                  <th className="px-4 py-3 font-medium w-16">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-center">
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Cargando registros...
                  </td>
                </tr>
              ) : statistics.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No hay registros tabulados.
                  </td>
                </tr>
              ) : (
                statistics.map((stat) => (
                  <tr
                    key={stat.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-800 text-left">
                      {MONTHS[stat.month]} {stat.year}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {stat.hht.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {stat.accidentsWithLeave}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {stat.lostDays}
                    </td>
                    <td className="px-4 py-3 font-bold text-blue-600 bg-blue-50/20">
                      {stat.if}
                    </td>
                    <td className="px-4 py-3 font-bold text-red-600 bg-red-50/20">
                      {stat.ig}
                    </td>
                    <td className="px-4 py-3 font-bold text-purple-600 bg-purple-50/20">
                      {stat.ia}
                    </td>
                    {["employer", "super_admin", "gerencia"].includes(
                      profile?.role || "",
                    ) && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDelete(stat.id!)}
                          className="text-slate-400 hover:text-red-500 p-1.5 transition-colors rounded-lg hover:bg-red-50"
                          title="Eliminar registro"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setStatToDelete(null);
        }}
        onConfirm={confirmDeleteStat}
        title="Eliminar Registro"
        message="¿Eliminar este registro estadístico? Esta acción no se puede deshacer."
      />
    </div>
  );
};
