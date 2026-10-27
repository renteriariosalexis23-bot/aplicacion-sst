import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  where,
  getDocs,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { PageHeader } from "./ui/PageHeader";
import {
  Report,
  Post,
  UserProfile,
  SSTDocument,
  Training,
  Inspection,
  Company,
  CommitteeEvent,
} from "../types";
import {
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
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";
import { Loader2, AlertTriangle,
  Calendar,
  Users,
  FileText,
  CheckCircle,
  TrendingUp,
  Award,
  ClipboardList,
  ShieldAlert,
  BellRing,
  Clock,
  Building2,
  FileBadge,
  Maximize2,
  X,
  AlertOctagon,
  Bot,
  Trash2,
  BarChart2 } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachMonthOfInterval,
  subMonths,
  isSameMonth,
  addDays,
  isAfter,
  isBefore,
  differenceInDays,
  parseISO,
} from "date-fns";
import { es } from "date-fns/locale";

const COLORS = [
  "#ef4444",
  "#f59e0b",
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
];
const STATUS_COLORS = ["#f59e0b", "#10b981"];

import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { AIAuditorModal } from "./AIAuditorModal";
import { isMainAdmin } from "../constants/admin";

export const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [documents, setDocuments] = useState<SSTDocument[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [eppDeliveries, setEppDeliveries] = useState<any[]>([]);
  const [eppCatalog, setEppCatalog] = useState<any[]>([]);
  const [preuseInspections, setPreuseInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ... further down inside useEffect ...
  const [globalView, setGlobalView] = useState(false);
  const [expandedWidget, setExpandedWidget] = useState<
    "findings" | "compliance" | "alerts" | null
  >(null);
  const { companies } = useCompany();

  const [medicalExams, setMedicalExams] = useState<any[]>([]);
  const [committeeEvents, setCommitteeEvents] = useState<CommitteeEvent[]>([]);
  const [isAuditModalOpen, setAuditModalOpen] = useState(false);

  useEffect(() => {
    const targetRuc = selectedCompany?.ruc || profile?.companyRuc;
    if (
      (!["employer", "super_admin", "gerencia"].includes(profile?.role || "")) ||
      (!targetRuc && !globalView)
    )
      return;

    const buildQuery = (collectionName: string) => {
      if (
        globalView &&
        (isMainAdmin(profile?.email) ||
          profile?.role === "super_admin")
      ) {
        return query(collection(db, collectionName));
      }
      return query(
        collection(db, collectionName),
        where("companyRuc", "==", targetRuc),
      );
    };

    const buildQueryWithOrder = (
      collectionName: string,
      orderByField: string,
      orderDirection: "asc" | "desc",
    ) => {
      if (
        globalView &&
        (isMainAdmin(profile?.email) ||
          profile?.role === "super_admin")
      ) {
        return query(
          collection(db, collectionName),
          orderBy(orderByField, orderDirection),
        );
      }
      return query(
        collection(db, collectionName),
        where("companyRuc", "==", targetRuc),
        orderBy(orderByField, orderDirection),
      );
    };

    const unsubReports = onSnapshot(
      buildQueryWithOrder("reports", "createdAt", "desc"),
      (snapshot) => {
        setReports(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Report),
        );
      },
      (error) => console.error("Error in reports snapshot:", error),
    );

    const unsubUsers = onSnapshot(
      buildQuery("users"),
      (snapshot) => {
        setUsers(snapshot.docs.map((doc) => doc.data() as UserProfile));
      },
      (error) => console.error("Error in users snapshot:", error),
    );

    const unsubPosts = onSnapshot(
      buildQuery("posts"),
      (snapshot) => {
        setPosts(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Post),
        );
      },
      (error) => console.error("Error in posts snapshot:", error),
    );

    const unsubDocuments = onSnapshot(
      buildQuery("documents"),
      (snapshot) => {
        setDocuments(
          snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as SSTDocument,
          ),
        );
      },
      (error) => console.error("Error in documents snapshot:", error),
    );

    const unsubTrainings = onSnapshot(
      buildQuery("trainings"),
      (snapshot) => {
        setTrainings(
          snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as Training,
          ),
        );
      },
      (error) => console.error("Error in trainings snapshot:", error),
    );

    const unsubInspections = onSnapshot(
      buildQuery("inspections"),
      (snapshot) => {
        setInspections(
          snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as Inspection,
          ),
        );
      },
      (error) => console.error("Error in inspections snapshot:", error),
    );


    const unsubMedicalExams = onSnapshot(
      buildQuery("medicalExams"),
      (snapshot) => {
        setMedicalExams(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        );
      },
      (error) => console.error("Error in medicalExams snapshot:", error),
    );

    const unsubEppDeliveries = onSnapshot(
      buildQuery("epp_deliveries"),
      (snapshot) => {
        setEppDeliveries(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        );
      },
      (error) => console.error("Error in eppDeliveries snapshot:", error),
    );

    const unsubEppCatalog = onSnapshot(
      buildQuery("epp_catalog"),
      (snapshot) => {
        setEppCatalog(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        );
      },
      (error) => console.error("Error in eppCatalog snapshot:", error),
    );

    const unsubPreUse = onSnapshot(
      buildQuery("preuse_inspections"),
      (snapshot) => {
        setPreuseInspections(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        );
        setLoading(false);
      },
      (error) => {
        console.error("Error in preuse snapshot:", error);
        setLoading(false);
      },
    );


    const unsubCommitteeEvents = onSnapshot(
      buildQueryWithOrder("committee_events", "date", "asc"),
      (snapshot) => {
        setCommitteeEvents(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as CommitteeEvent),
        );
      },
    );

    let isUnsubscribed = false;

    return () => {
      if (isUnsubscribed) return;
      isUnsubscribed = true;
      try {
        unsubReports();
      } catch (e) {}
      try {
        unsubUsers();
      } catch (e) {}
      try {
        unsubPosts();
      } catch (e) {}
      try {
        unsubDocuments();
      } catch (e) {}
      try {
        unsubTrainings();
      } catch (e) {}
      try {
        unsubInspections();
      } catch (e) {}
      try {
        unsubMedicalExams();
      } catch (e) {}
      try {
        unsubEppDeliveries();
      } catch (e) {}
      try {
        unsubEppCatalog();
      } catch (e) {}
      try {
        unsubPreUse();
      } catch (e) {}
      try {
        unsubCommitteeEvents();
      } catch (e) {}
    };
  }, [profile, selectedCompany, globalView]);

  if (!["employer", "super_admin", "gerencia"].includes(profile?.role || "")) {
    return (
      <div className="text-center py-10">
        No tienes permisos para ver esta página.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-10 text-slate-500">
        Cargando inteligencia de riesgos...
      </div>
    );
  }

  // Helper to ensure date
  const ensureDate = (dateObj: any): Date => {
    if (!dateObj) return new Date();
    if (typeof dateObj.toDate === "function") return dateObj.toDate();
    if (dateObj instanceof Date) return dateObj;
    return new Date(dateObj);
  };

  // --- Statistics Calculations ---

  const workers = users.filter(
    (u) => u.role === "worker" && u.status !== "cesado",
  );
  const totalWorkers = workers.length;

  // 1. Document Signing Rate
  const docsRequiringSignature = documents.filter((d) => d.requiresSignature);
  let totalPossibleSignatures = 0;
  let actualSignatures = 0;

  docsRequiringSignature.forEach((doc) => {
    // Determine which workers need to sign this document
    const targetArea = doc.targetArea || "Todas";
    const applicableWorkers = workers.filter(
      (w) =>
        targetArea === "Todas" ||
        (w.department &&
          w.department.toLowerCase() === targetArea.toLowerCase()),
    );

    totalPossibleSignatures += applicableWorkers.length;

    // Count only signatures from applicable active workers
    const validSignatures =
      doc.signatures?.filter((s) =>
        applicableWorkers.some((w) => w.uid === s.userId),
      ) || [];
    actualSignatures += validSignatures.length;
  });

  const docSigningRate =
    totalPossibleSignatures > 0
      ? Math.min(
          Math.round((actualSignatures / totalPossibleSignatures) * 100),
          100,
        )
      : 0;

  // 2. Training Completion Rate
  let totalPossibleCompletions = 0;
  let actualCompletions = 0;

  trainings.forEach((t) => {
    // Determine which workers need to complete this training
    const targetArea = t.targetArea || "Todas";
    const applicableWorkers = workers.filter(
      (w) =>
        targetArea === "Todas" ||
        (w.department &&
          w.department.toLowerCase() === targetArea.toLowerCase()),
    );

    totalPossibleCompletions += applicableWorkers.length;

    // Count only completions from applicable active workers
    const validCompletions =
      t.completions?.filter((c) =>
        applicableWorkers.some((w) => w.uid === c.userId),
      ) || [];
    actualCompletions += validCompletions.length;
  });

  const trainingCompletionRate =
    totalPossibleCompletions > 0
      ? Math.min(
          Math.round((actualCompletions / totalPossibleCompletions) * 100),
          100,
        )
      : 0;

  // 3. Inspection Issues Analysis
  const totalInspections = inspections.length;
  const inspectionsWithIssues = inspections.filter((i) => i.hasIssues).length;
  const issueRate =
    totalInspections > 0
      ? Math.round((inspectionsWithIssues / totalInspections) * 100)
      : 0;

  // 4. Top Findings (Common Issues in Inspections)
  const allResults = inspections.flatMap((i) => i.results);
  const issues = allResults.filter((r) => r.isIssue);
  const issueCounts: Record<string, number> = {};
  issues.forEach((issue) => {
    issueCounts[issue.question] = (issueCounts[issue.question] || 0) + 1;
  });
  const topFindings = Object.entries(issueCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // 4. Inspection Completion Rate
  const completedInspections = inspections.filter(
    (i) => i.status === "reviewed",
  );
  const inspectionCompletionRate =
    inspections.length > 0
      ? Math.round((completedInspections.length / inspections.length) * 100)
      : 0;

  // 5. Monthly Trends (Last 6 months)
  const last6Months = eachMonthOfInterval({
    start: subMonths(new Date(), 5),
    end: new Date(),
  });

  const monthlyTrendData = last6Months.map((month) => {
    const monthReports = reports.filter((r) =>
      isSameMonth(ensureDate(r.createdAt), month),
    );
    return {
      name: format(month, "MMM", { locale: es }),
      accidentes: monthReports.filter((r) => r.type === "accident").length,
      incidentes: monthReports.filter((r) => r.type === "incident").length,
      otros: monthReports.filter(
        (r) => r.type === "unsafe_act" || r.type === "unsafe_condition",
      ).length,
    };
  });

  // 6. Reports by Type (for Pie/Bar)
  const reportsByType = [
    {
      name: "Accidentes",
      value: reports.filter((r) => r.type === "accident").length,
    },
    {
      name: "Incidentes",
      value: reports.filter((r) => r.type === "incident").length,
    },
    {
      name: "Actos Inseguros",
      value: reports.filter((r) => r.type === "unsafe_act").length,
    },
    {
      name: "Condiciones Inseguras",
      value: reports.filter((r) => r.type === "unsafe_condition").length,
    },
  ].filter((item) => item.value > 0);

  // 7. Expiration Alerts (Health Cards & EPPs)
  const today = new Date();
  const next30Days = addDays(today, 30);

  const expirationAlerts: {
    id: string;
    type: "healthCard" | "epp" | "medicalExam";
    title: string;
    date: Date;
    status: "expired" | "warning";
  }[] = [];

  medicalExams.forEach((exam) => {
    if (!exam.nextExamDate) return;
    const expDate = parseISO(exam.nextExamDate);
    if (!isNaN(expDate.getTime())) {
      if (isBefore(expDate, today)) {
        expirationAlerts.push({
          id: exam.id!,
          type: "medicalExam",
          title: `Examen Médico: ${exam.workerName}`,
          date: expDate,
          status: "expired",
        });
      } else if (isBefore(expDate, next30Days)) {
        expirationAlerts.push({
          id: exam.id!,
          type: "medicalExam",
          title: `Examen Médico: ${exam.workerName}`,
          date: expDate,
          status: "warning",
        });
      }
    }
  });

  // Calculate EPP Expirations
  // Reverse to get the latest delivery of each EPP per worker
  const sortedDeliveries = [...eppDeliveries].sort(
    (a, b) => b.deliveryDate?.toMillis() - a.deliveryDate?.toMillis(),
  );
  const workerEppMap: Record<string, any> = {}; // { workerId_eppId: expirationDate }

  sortedDeliveries.forEach((delivery) => {
    delivery.items.forEach((item: any) => {
      const key = `${delivery.workerId}_${item.eppId}`;
      if (!workerEppMap[key]) {
        const catalogItem = eppCatalog.find((c) => c.id === item.eppId);
        const lifeMonths = catalogItem ? catalogItem.estimatedLifeMonths : 6;
        const deliveryDate = delivery.deliveryDate
          ? delivery.deliveryDate.toDate()
          : new Date();
        const expirationDate = new Date(deliveryDate);
        expirationDate.setMonth(expirationDate.getMonth() + lifeMonths);

        workerEppMap[key] = {
          date: expirationDate,
          workerName: delivery.workerName,
          itemName: item.name,
        };
      }
    });
  });

  Object.entries(workerEppMap).forEach(([_key, data]) => {
    if (isBefore(data.date, today)) {
      expirationAlerts.push({
        id: _key,
        type: "epp",
        title: `EPP Vencido (${data.itemName}): ${data.workerName}`,
        date: data.date,
        status: "expired",
      });
    } else if (isBefore(data.date, next30Days)) {
      expirationAlerts.push({
        id: _key,
        type: "epp",
        title: `Renovar EPP (${data.itemName}): ${data.workerName}`,
        date: data.date,
        status: "warning",
      });
    }
  });

  // Sort alerts: expired first, then by date
  expirationAlerts.sort((a, b) => {
    if (a.status === "expired" && b.status !== "expired") return -1;
    if (a.status !== "expired" && b.status === "expired") return 1;
    return a.date.getTime() - b.date.getTime();
  });

  // 10. Pre-use Inspection Stats
  const operativePreUse = preuseInspections.filter((i) => i.isOperative).length;
  const preuseComplianceRate =
    preuseInspections.length > 0
      ? Math.round((operativePreUse / preuseInspections.length) * 100)
      : 0;

  const equipFaults: Record<string, number> = {};
  preuseInspections.forEach((ins) => {
    if (!ins.isOperative) {
      equipFaults[`${ins.equipmentName} (${ins.equipmentCode})`] =
        (equipFaults[`${ins.equipmentName} (${ins.equipmentCode})`] || 0) + 1;
    }
  });
  const topFaultyEquipments = Object.entries(equipFaults)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // --- Global View Calculations ---
  const auditReadinessScores = companies
    .map((company) => {
      const cDocs = documents.filter((d) => d.companyRuc === company.ruc);
      const hasIPERC = cDocs.some(
        (d) =>
          d.title.toLowerCase().includes("iperc") ||
          d.title.toLowerCase().includes("matriz"),
      );
      const hasMapa = cDocs.some((d) => d.title.toLowerCase().includes("mapa"));
      const hasRISST = cDocs.some(
        (d) =>
          d.title.toLowerCase().includes("reglamento") ||
          d.title.toLowerCase().includes("risst"),
      );

      const cWorkers = users.filter(
        (u) =>
          u.companyRuc === company.ruc &&
          u.role === "worker" &&
          u.status !== "cesado",
      );
      const workersWithValidExam = new Set(
        medicalExams
          .filter(
            (e) =>
              e.companyRuc === company.ruc &&
              e.nextExamDate &&
              !isBefore(parseISO(e.nextExamDate), today),
          )
          .map((e) => e.workerId),
      );
      const healthScore =
        cWorkers.length > 0
          ? cWorkers.filter((w) => workersWithValidExam.has(w.uid)).length /
            cWorkers.length
          : 1;

      const cInspections = inspections.filter(
        (i) => i.companyRuc === company.ruc,
      );
      const hasRecentInspections = cInspections.some((i) =>
        isAfter(ensureDate(i.createdAt), subMonths(today, 1)),
      );

      const cTrainings = trainings.filter((t) => t.companyRuc === company.ruc);
      const hasRecentTrainings = cTrainings.some((t) =>
        isAfter(ensureDate(t.createdAt), subMonths(today, 1)),
      );

      const hasCommittee = users.some(
        (u) => u.companyRuc === company.ruc && u.role === "supervisor",
      );

      let score = 0;
      if (hasIPERC) score += 10;
      if (hasMapa) score += 10;
      if (hasRISST) score += 10;
      score += Math.round(healthScore * 25);
      if (hasRecentInspections) score += 15;
      if (hasRecentTrainings) score += 15;
      if (hasCommittee) score += 15;

      return {
        companyName: company.businessName,
        score: Math.min(score, 100),
        missing: [
          !hasIPERC && "IPERC",
          !hasMapa && "Mapa de Riesgos",
          !hasRISST && "RISST",
          healthScore < 0.8 && "Exámenes Médicos",
          !hasRecentInspections && "Inspecciones",
          !hasRecentTrainings && "Capacitaciones",
          !hasCommittee && "Comité/Supervisor",
        ].filter(Boolean) as string[],
      };
    })
    .sort((a, b) => a.score - b.score);

  const proactiveVsReactiveData = companies.map((company) => {
    const proactive =
      inspections.filter((i) => i.companyRuc === company.ruc).length +
      trainings.filter((t) => t.companyRuc === company.ruc).length;
    const reactive = reports.filter((r) => r.companyRuc === company.ruc).length;

    return {
      name:
        company.businessName.substring(0, 15) +
        (company.businessName.length > 15 ? "..." : ""),
      Proactivas: proactive,
      Reactivas: reactive,
    };
  });

  const handleExportPDF = () => {
    toast("Abriendo diálogo de impresión. Si no funciona, abre la aplicación en una nueva pestaña (icono en la parte superior).", {
      icon: "🖨️",
      duration: 5000,
    });
    setTimeout(() => {
      window.print();
    }, 800);
  };

  // --- Próxima Reunión del Comité ---
  const _today = new Date();
  _today.setHours(0, 0, 0, 0);
  
  const upcomingMeetings = committeeEvents
    .filter(event => event.type === 'meeting' && ensureDate(event.date) >= _today)
    .sort((a, b) => ensureDate(a.date).getTime() - ensureDate(b.date).getTime());
    
  const nextMeeting = upcomingMeetings.length > 0 ? upcomingMeetings[0] : null;
  
  let daysToMeeting = null;
  let alertColorClass = "blue";
  
  if (nextMeeting) {
    const meetingDate = ensureDate(nextMeeting.date);
    meetingDate.setHours(0, 0, 0, 0);
    const diffTime = meetingDate.getTime() - _today.getTime();
    daysToMeeting = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (daysToMeeting <= 2) {
      alertColorClass = "red";
    } else if (daysToMeeting <= 7) {
      alertColorClass = "orange";
    }
  }

  const dataForAI = {
    totalWorkers,
    preuseComplianceRate,
    expirationAlertsCount: expirationAlerts.length,
    auditReadinessScores,
    globalView
  };

  return (
    <div id="dashboard-content" className="w-full space-y-8 pb-12 bg-slate-50 p-6 rounded-xl">
      {nextMeeting && daysToMeeting !== null && (
        <div className={`bg-${alertColorClass}-50 border-l-4 border-${alertColorClass}-600 p-4 rounded-r-xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4`}>
          <div className="flex items-center">
            <div className={`bg-${alertColorClass}-100 p-2 rounded-lg mr-4`}>
              {alertColorClass === 'red' ? (
                <AlertTriangle className={`w-6 h-6 text-${alertColorClass}-600`} />
              ) : (
                <Calendar className={`w-6 h-6 text-${alertColorClass}-600`} />
              )}
            </div>
            <div>
              <h3 className={`text-sm font-bold text-${alertColorClass}-900 flex items-center gap-2`}>
                {alertColorClass === 'red' ? '¡Reunión del Comité SST Inminente!' : 'Recordatorio de Comité SST'}
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold bg-${alertColorClass}-100 text-${alertColorClass}-700`}>
                  {daysToMeeting === 0 ? '¡Es hoy!' : daysToMeeting === 1 ? 'Mañana' : `Faltan ${daysToMeeting} días`}
                </span>
              </h3>
              <p className={`text-sm text-${alertColorClass}-800 mt-1`}>
                La próxima <span className="font-semibold">{nextMeeting.title}</span> está programada para el <span className="font-semibold">{ensureDate(nextMeeting.date).toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>.
              </p>
            </div>
          </div>
          <button 
            onClick={() => window.location.hash = '#committee'} 
            className={`px-4 py-2 bg-${alertColorClass}-600 text-white text-sm font-medium rounded-lg hover:bg-${alertColorClass}-700 transition-colors shadow-sm whitespace-nowrap w-full sm:w-auto text-center`}
          >
            Ir al Comité
          </button>
        </div>
      )}

      <PageHeader
        title="Panel de Control Directivo"
        description={`Dashboard avanzado predictivo y preventivo de riesgos laborales para ${globalView ? "todas las empresas" : selectedCompany?.businessName || "su empresa"}`}
        icon={BarChart2}
        color="blue"
        actions={
          <>
            {isMainAdmin(profile?.email) &&
              companies.length > 1 && (
                <div className="flex items-center bg-white/20 rounded-lg border border-white/20 p-1 shadow-sm backdrop-blur-sm mr-2">
                  <button
                    onClick={() => setGlobalView(false)}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${!globalView ? "bg-white text-blue-700 shadow-sm" : "text-white/80 hover:bg-white/10"}`}
                  >
                    Vista Empresa
                  </button>
                  <button
                    onClick={() => setGlobalView(true)}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${globalView ? "bg-white text-blue-700 shadow-sm" : "text-white/80 hover:bg-white/10"}`}
                  >
                    Vista Global
                  </button>
                </div>
              )}
            <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg border border-white/20 shadow-sm w-full sm:w-auto text-white backdrop-blur-sm font-medium text-sm">
              <TrendingUp className="w-5 h-5 text-emerald-300" />
              <span>
                Actualizado: {format(new Date(), "HH:mm")}
              </span>
            </div>
            <button
              onClick={() => setAuditModalOpen(true)}
              className="flex items-center bg-sky-500 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-sky-400 transition-colors shadow-sm print:hidden border border-sky-400"
            >
              <Bot className="w-5 h-5 mr-2" />
              Auditoría (IA)
            </button>
            <button 
              onClick={handleExportPDF}
              className="flex items-center bg-white text-blue-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-50 transition-colors shadow-sm print:hidden"
            >
              Exportar
            </button>
          </>
        }
      />

      {/* KPI Cards - Row 1: Core Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <ShieldAlert className="w-12 h-12" />
          </div>
          <p className="text-sm font-medium text-slate-500">
            Tasa de Incidentes
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-slate-900">
              {reports.length}
            </p>
            <span className="text-xs font-medium text-slate-400">
              Total reportados
            </span>
          </div>
          <div className="mt-4 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500"
              style={{ width: `${Math.min(reports.length * 5, 100)}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <CheckCircle className="w-12 h-12" />
          </div>
          <p className="text-sm font-medium text-slate-500">
            Inspecciones Pre-Uso
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-slate-900">
              {preuseComplianceRate}%
            </p>
            <span className="text-xs font-medium text-slate-400">
              Operativos
            </span>
          </div>
          <div className="mt-4 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400"
              style={{ width: `${preuseComplianceRate}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <FileText className="w-12 h-12" />
          </div>
          <p className="text-sm font-medium text-slate-500">
            Firma de Documentos
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-slate-900">
              {docSigningRate}%
            </p>
            <span className="text-xs font-medium text-slate-400">
              Cumplimiento
            </span>
          </div>
          <div className="mt-4 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500"
              style={{ width: `${docSigningRate}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Award className="w-12 h-12" />
          </div>
          <p className="text-sm font-medium text-slate-500">Capacitaciones</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-slate-900">
              {trainingCompletionRate}%
            </p>
            <span className="text-xs font-medium text-slate-400">
              Completadas
            </span>
          </div>
          <div className="mt-4 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${trainingCompletionRate}%` }}
            />
          </div>
        </div>

      </div>

      {/* Global View Specific Sections */}
      {globalView && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Audit Readiness Score */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-6">
              <ShieldAlert className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-bold text-slate-800">
                Índice de Preparación para Auditorías
              </h2>
            </div>
            <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
              {auditReadinessScores.map((score, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl border border-slate-100 bg-slate-50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-slate-800">
                      {score.companyName}
                    </span>
                    <span
                      className={`font-bold ${score.score >= 80 ? "text-emerald-600" : score.score >= 50 ? "text-orange-500" : "text-red-600"}`}
                    >
                      {score.score}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 mb-3">
                    <div
                      className={`h-2 rounded-full ${score.score >= 80 ? "bg-emerald-500" : score.score >= 50 ? "bg-orange-500" : "bg-red-500"}`}
                      style={{ width: `${score.score}%` }}
                    />
                  </div>
                  {score.missing.length > 0 && (
                    <div className="text-xs text-slate-500">
                      <span className="font-medium text-slate-700">
                        Falta/Atención:
                      </span>{" "}
                      {score.missing.join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Proactive vs Reactive */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-bold text-slate-800">
                Indicadores Proactivos vs Reactivos
              </h2>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={proactiveVsReactiveData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b", fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b", fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                    }}
                    cursor={{ fill: "#f1f5f9" }}
                  />
                  <Legend />
                  <Bar
                    dataKey="Proactivas"
                    name="Acciones Preventivas"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="Reactivas"
                    name="Eventos Reactivos"
                    fill="#ef4444"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-800">
              Tendencia Mensual de Eventos
            </h2>
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span>Accidentes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-orange-400" />
                <span>Incidentes</span>
              </div>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyTrendData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "none",
                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                  }}
                  cursor={{ fill: "#f1f5f9" }}
                />
                <Legend />
                <Bar
                  dataKey="accidentes"
                  name="Accidentes"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="incidentes"
                  name="Incidentes"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="otros"
                  name="Otros (Actos/Condiciones)"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribution Chart */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-6">
            Distribución de Riesgos
          </h2>
          <div className="h-80 relative">
            {reportsByType.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={reportsByType}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={90}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {reportsByType.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                Sin datos
              </div>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold text-slate-900">
                {reports.length}
              </span>
              <span className="text-xs text-slate-500 uppercase tracking-wider">
                Total
              </span>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {reportsByType.map((item, index) => (
              <div
                key={item.name}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-slate-600">{item.name}</span>
                </div>
                <span className="font-semibold text-slate-900">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Additional Row: Equipments Faulty */}
      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-6">
            <AlertOctagon className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-bold text-slate-800">
              Equipos con más fallas reportadas (Pre-Uso)
            </h2>
          </div>
          <div className="h-64">
            {topFaultyEquipments.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topFaultyEquipments}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={true}
                    vertical={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={180}
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "#f1f5f9" }}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "none",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                  />
                  <Bar
                    dataKey="value"
                    name="Nº de fallas"
                    fill="#ef4444"
                    radius={[0, 4, 4, 0]}
                    barSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                No se han reportado equipos inoperativos.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Worker Compliance & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Worker Compliance List */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-1">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-bold text-slate-800">
                Cumplimiento por Trabajador
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-400">
                Top 5 Activos
              </span>
              <button
                onClick={() => setExpandedWidget("compliance")}
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Expandir"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="pb-3">Trabajador</th>
                  <th className="pb-3 text-center">Docs</th>
                  <th className="pb-3 text-center">Capac.</th>
                  <th className="pb-3 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workers.slice(0, 5).map((worker) => {
                  const applicableDocs = documents.filter(
                    (d) =>
                      d.requiresSignature &&
                      (!d.targetArea ||
                        d.targetArea === "Todas" ||
                        (worker.department &&
                          worker.department.toLowerCase() ===
                            d.targetArea.toLowerCase())),
                  );
                  const applicableTrainings = trainings.filter(
                    (t) =>
                      !t.targetArea ||
                      t.targetArea === "Todas" ||
                      (worker.department &&
                        worker.department.toLowerCase() ===
                          t.targetArea.toLowerCase()),
                  );

                  const signedCount = applicableDocs.filter((d) =>
                    d.signatures?.some((s) => s.userId === worker.uid),
                  ).length;
                  const trainingCount = applicableTrainings.filter((t) =>
                    t.completions?.some((c) => c.userId === worker.uid),
                  ).length;

                  const docPercent =
                    applicableDocs.length > 0
                      ? Math.round((signedCount / applicableDocs.length) * 100)
                      : 100;
                  const trainPercent =
                    applicableTrainings.length > 0
                      ? Math.round(
                          (trainingCount / applicableTrainings.length) * 100,
                        )
                      : 100;


                  return (
                    <tr key={worker.uid}>
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                            {worker.displayName.charAt(0)}
                          </div>
                          <span className="text-sm font-medium text-slate-700 truncate max-w-[80px]">
                            {worker.displayName}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-center">
                        <span
                          className={`text-xs font-bold ${docPercent > 80 ? "text-emerald-600" : "text-orange-600"}`}
                        >
                          {docPercent}%
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span
                          className={`text-xs font-bold ${trainPercent > 80 ? "text-emerald-600" : "text-orange-600"}`}
                        >
                          {trainPercent}%
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {docPercent > 80 &&
                        trainPercent > 80 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                            Óptimo
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                            Atención
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expiration Alerts */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-1 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <BellRing className="w-5 h-5 text-orange-500" />
              <h2 className="text-lg font-bold text-slate-800">
                Alertas de Vencimiento
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {expirationAlerts.length > 0 && (
                <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
                  {expirationAlerts.length}
                </span>
              )}
              <button
                onClick={() => setExpandedWidget("alerts")}
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Expandir"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-3 max-h-[300px]">
            {expirationAlerts.length > 0 ? (
              expirationAlerts.map((alert, idx) => (
                <div
                  key={`${alert.id}-${idx}`}
                  className={`p-3 rounded-lg border flex items-start gap-3 ${
                    alert.status === "expired"
                      ? "bg-red-50 border-red-200"
                      : "bg-orange-50 border-orange-200"
                  }`}
                >
                  <div
                    className={`p-2 rounded-full mt-0.5 flex-shrink-0 ${
                      alert.status === "expired"
                        ? "bg-red-100 text-red-600"
                        : "bg-orange-100 text-orange-600"
                    }`}
                  >
                    {alert.status === "expired" ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : (
                      <Clock className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-bold truncate ${
                        alert.status === "expired"
                          ? "text-red-900"
                          : "text-orange-900"
                      }`}
                    >
                      {alert.title}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span
                        className={`text-xs font-medium ${
                          alert.status === "expired"
                            ? "text-red-700"
                            : "text-orange-700"
                        }`}
                      >
                        {alert.type === "healthCard"
                          ? "Carnet de Sanidad"
                          : alert.type === "epp"
                            ? "Equipo de Prot. Personal"
                            : "Examen Médico"}
                      </span>
                      <span
                        className={`text-xs font-bold ${
                          alert.status === "expired"
                            ? "text-red-600"
                            : "text-orange-600"
                        }`}
                      >
                        {alert.status === "expired" ? "Vencido" : "Próximo"} (
                        {format(alert.date, "dd/MM/yyyy")})
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 py-8">
                <CheckCircle className="w-12 h-12 text-emerald-200 mb-3" />
                <p className="text-sm font-medium text-slate-500">
                  Todo al día
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  No hay vencimientos próximos
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Widget Modal */}
      {expandedWidget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                {expandedWidget === "findings" && (
                  <>
                    <ShieldAlert className="w-5 h-5 text-red-500" /> Hallazgos
                    Críticos
                  </>
                )}
                {expandedWidget === "compliance" && (
                  <>
                    <Users className="w-5 h-5 text-blue-500" /> Cumplimiento por
                    Trabajador (Todos)
                  </>
                )}
                {expandedWidget === "alerts" && (
                  <>
                    <BellRing className="w-5 h-5 text-orange-500" /> Alertas de
                    Vencimiento
                  </>
                )}
              </h3>
              <button
                onClick={() => setExpandedWidget(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {expandedWidget === "findings" && (
                <div className="h-[60vh]">
                  {topFindings.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={topFindings}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          horizontal={true}
                          vertical={false}
                        />
                        <XAxis type="number" hide />
                        <YAxis
                          dataKey="name"
                          type="category"
                          width={150}
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip cursor={{ fill: "transparent" }} />
                        <Bar
                          dataKey="value"
                          fill="#ef4444"
                          radius={[0, 4, 4, 0]}
                          barSize={30}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400">
                      No se han registrado hallazgos críticos aún.
                    </div>
                  )}
                </div>
              )}

              {expandedWidget === "compliance" && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                        <th className="pb-3 pl-2">Trabajador</th>
                        <th className="pb-3 text-center">Documentos</th>
                        <th className="pb-3 text-center">Capacitaciones</th>
                        <th className="pb-3 text-right pr-2">Estado General</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {workers.map((worker) => {
                        const applicableDocs = documents.filter(
                          (d) =>
                            d.requiresSignature &&
                            (!d.targetArea ||
                              d.targetArea === "Todas" ||
                              (worker.department &&
                                worker.department.toLowerCase() ===
                                  d.targetArea.toLowerCase())),
                        );
                        const applicableTrainings = trainings.filter(
                          (t) =>
                            !t.targetArea ||
                            t.targetArea === "Todas" ||
                            (worker.department &&
                              worker.department.toLowerCase() ===
                                t.targetArea.toLowerCase()),
                        );

                        const signedCount = applicableDocs.filter((d) =>
                          d.signatures?.some((s) => s.userId === worker.uid),
                        ).length;
                        const trainingCount = applicableTrainings.filter((t) =>
                          t.completions?.some((c) => c.userId === worker.uid),
                        ).length;

                        const docPercent =
                          applicableDocs.length > 0
                            ? Math.round(
                                (signedCount / applicableDocs.length) * 100,
                              )
                            : 100;
                        const trainPercent =
                          applicableTrainings.length > 0
                            ? Math.round(
                                (trainingCount / applicableTrainings.length) *
                                  100,
                              )
                            : 100;


                        return (
                          <tr
                            key={worker.uid}
                            className="hover:bg-slate-50 transition-colors"
                          >
                            <td className="py-4 pl-2">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600">
                                  {worker.displayName.charAt(0)}
                                </div>
                                <div>
                                  <span className="text-sm font-medium text-slate-900 block">
                                    {worker.displayName}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {worker.email}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 text-center">
                              <span
                                className={`text-sm font-bold ${docPercent > 80 ? "text-emerald-600" : "text-orange-600"}`}
                              >
                                {docPercent}%
                              </span>
                            </td>
                            <td className="py-4 text-center">
                              <span
                                className={`text-sm font-bold ${trainPercent > 80 ? "text-emerald-600" : "text-orange-600"}`}
                              >
                                {trainPercent}%
                              </span>
                            </td>
                            <td className="py-4 text-right pr-2">
                              {docPercent > 80 &&
                              trainPercent > 80 ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800">
                                  Óptimo
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-orange-100 text-orange-800">
                                  Requiere Atención
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {expandedWidget === "alerts" && (
                <div className="space-y-3">
                  {expirationAlerts.length > 0 ? (
                    expirationAlerts.map((alert, idx) => (
                      <div
                        key={`${alert.id}-${idx}`}
                        className={`p-4 rounded-xl border flex items-start gap-4 ${
                          alert.status === "expired"
                            ? "bg-red-50 border-red-200"
                            : "bg-orange-50 border-orange-200"
                        }`}
                      >
                        <div
                          className={`p-3 rounded-full flex-shrink-0 ${
                            alert.status === "expired"
                              ? "bg-red-100 text-red-600"
                              : "bg-orange-100 text-orange-600"
                          }`}
                        >
                          {alert.status === "expired" ? (
                            <AlertTriangle className="w-6 h-6" />
                          ) : (
                            <Clock className="w-6 h-6" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                          <p
                            className={`text-base font-bold ${
                              alert.status === "expired"
                                ? "text-red-900"
                                : "text-orange-900"
                            }`}
                          >
                            {alert.title}
                          </p>
                          <div className="flex items-center gap-4 mt-2">
                            <span
                              className={`text-sm font-medium ${
                                alert.status === "expired"
                                  ? "text-red-700"
                                  : "text-orange-700"
                              }`}
                            >
                              Tipo:{" "}
                              {alert.type === "healthCard"
                                ? "Carnet de Sanidad"
                                : alert.type === "epp"
                                  ? "Equipo de Prot. Personal"
                                  : "Examen Médico"}
                            </span>
                            <span
                              className={`text-sm font-bold ${
                                alert.status === "expired"
                                  ? "text-red-600"
                                  : "text-orange-600"
                              }`}
                            >
                              Estado:{" "}
                              {alert.status === "expired"
                                ? "Vencido"
                                : "Próximo a vencer"}{" "}
                              ({format(alert.date, "dd/MM/yyyy")})
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 py-12">
                      <CheckCircle className="w-16 h-16 text-emerald-200 mb-4" />
                      <p className="text-lg font-medium text-slate-500">
                        Todo al día
                      </p>
                      <p className="text-sm text-slate-400 mt-1">
                        No hay vencimientos próximos registrados en el sistema.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Final closing div for dashboard-content */}
      <AIAuditorModal 
        isOpen={isAuditModalOpen} 
        onClose={() => setAuditModalOpen(false)} 
        dataSummary={dataForAI} 
      />
    </div>
  );
};
