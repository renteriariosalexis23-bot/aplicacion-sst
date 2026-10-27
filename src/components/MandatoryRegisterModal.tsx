import React, { useState, useEffect, useRef } from "react";
import { Loader2, X,
  Save,
  FileText,
  PenTool,
  AlertCircle,
  Upload,
  File,
  Download,
  Plus, } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import {
  Report,
  BaseLegalRegister,
  AccidentRegister,
  DiseaseRegister,
  IncidentRegister,
  MonitoringRegister,
  InspectionRegister,
  StatisticsRegister,
  EquipmentRegister,
  TrainingRegister,
  AuditRegister,
  MandatoryRegisterType,
  CompanySettings,
  UserProfile,
  CorrectiveMeasure,
  RegisterResponsible,
  Company,
} from "../types";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { useAuth } from "../AuthContext";
import { generateLegalRegisterPDF } from "../utils/pdfGenerator";

interface MandatoryRegisterModalProps {
  type: MandatoryRegisterType;
  report?: Report;
  initialData?: any;
  onClose: () => void;
  companyRuc?: string;
}

const AGENTS_REFERENCE = {
  Físico: [
    "Ruido",
    "Vibración",
    "Iluminación",
    "Ventilación",
    "Presión alta o baja",
    "Temperatura (Calor o frío)",
    "Humedad",
    "Radiación en general",
    "Otros",
  ],
  Químico: [
    "Gases",
    "Vapores",
    "Neblinas",
    "Rocío",
    "Polvo",
    "Humos",
    "Líquidos",
    "Otros",
  ],
  Biológico: [
    "Virus",
    "Bacilos",
    "Bacterias",
    "Hongos",
    "Parásitos",
    "Insectos",
    "Roedores",
    "Otros",
  ],
  Disergonómico: [
    "Manipulación inadecuada de carga",
    "Diseño de puesto inadecuado",
    "Posturas inadecuadas",
    "Trabajos repetitivos",
    "Otros",
  ],
  Psicosocial: [
    "Hostigamiento psicológico",
    "Estrés laboral",
    "Turno rotativo",
    "Falta de comunicación y entrenamiento",
    "Autoritarismo",
    "Otros",
  ],
};

export const MandatoryRegisterModal: React.FC<MandatoryRegisterModalProps> = ({
  type,
  report,
  initialData,
  onClose,
  companyRuc,
}) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<any>(initialData || {});
  const [companySettings, setCompanySettings] =
    useState<CompanySettings | null>(null);
  const [workerProfile, setWorkerProfile] = useState<UserProfile | null>(null);
  const [isSigning, setIsSigning] = useState<{
    type: "responsible" | "worker" | "trainer" | "deliverer";
    index: number;
  } | null>(null);
  const sigPad = useRef<SignatureCanvas>(null);

  useEffect(() => {
    console.log("MandatoryRegisterModal formData updated:", formData);
  }, [formData]);

  useEffect(() => {
    console.log("MandatoryRegisterModal useEffect running:", {
      loading,
      report,
      initialData,
      type,
    });
    if (report) {
      console.log("Report data:", {
        date: report.date,
        description: report.description,
        workerName: report.reportedByName,
      });
    }
    const fetchData = async () => {
      try {
        // Fetch company settings for the specific company if RUC is provided
        const targetRuc = companyRuc || profile?.companyRuc;

        if (targetRuc) {
          const q = query(
            collection(db, "companies"),
            where("ruc", "==", targetRuc),
          );
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            const companyData = snapshot.docs[0].data() as Company;
            // Map Company to CompanySettings structure for compatibility
            setCompanySettings({
              businessName: companyData.businessName,
              ruc: companyData.ruc,
              address: companyData.address,
              economicActivity: companyData.economicActivity,
              totalWorkers: 0, // Default or fetch from somewhere else
              highRiskActivity: false,
              sctrAffiliated: 0,
              sctrNotAffiliated: 0,
              insuranceName: "",
              isIntermediation: false,
              interBusinessName: "",
              interRuc: "",
              interAddress: "",
              interEconomicActivity: "",
              interTotalWorkers: 0,
              interSctrAffiliated: 0,
              interSctrNotAffiliated: 0,
              interInsuranceName: "",
            });
          } else {
            // Fallback to default settings
            const settingsDoc = await getDoc(
              doc(db, "company_settings", "default"),
            );
            if (settingsDoc.exists()) {
              setCompanySettings(settingsDoc.data() as CompanySettings);
            }
          }
        } else {
          // Fetch default company settings
          const settingsDoc = await getDoc(
            doc(db, "company_settings", "default"),
          );
          if (settingsDoc.exists()) {
            setCompanySettings(settingsDoc.data() as CompanySettings);
          }
        }

        // Fetch worker profile if report exists
        if (report?.reportedBy) {
          const workerDoc = await getDoc(doc(db, "users", report.reportedBy));
          if (workerDoc.exists()) {
            const worker = workerDoc.data() as UserProfile;
            console.log("Worker profile fetched:", worker);
            setWorkerProfile(worker);
          }
        }

        setLoading(false);
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.GET,
          "company_settings/users",
        );
        setLoading(false);
      }
    };

    fetchData();
  }, [report?.reportedBy]);

  useEffect(() => {
    // Auto-fill data if it's a new register or pre-filled from another source
    if (companySettings && !loading) {
      if (initialData && initialData.id) {
        // It's an existing record, just use it
        setFormData(initialData);
        return;
      }

      const baseData = {
        registerNumber: report?.id || `REG-${Date.now()}`,
        businessName: companySettings.businessName || "",
        ruc: companySettings.ruc || "",
        address: companySettings.address || "",
        economicActivity: companySettings.economicActivity || "",
        totalWorkers: companySettings.totalWorkers || 0,

        isIntermediation: companySettings.isIntermediation || false,
        interBusinessName: companySettings.interBusinessName || "",
        interRuc: companySettings.interRuc || "",
        interAddress: companySettings.interAddress || "",
        interEconomicActivity: companySettings.interEconomicActivity || "",
        interTotalWorkers: companySettings.interTotalWorkers || 0,

        responsibles: [
          {
            name: "",
            position: "",
            date: new Date().toISOString().split("T")[0],
          },
          {
            name: "",
            position: "",
            date: new Date().toISOString().split("T")[0],
          },
        ],
        sctrAffiliated: companySettings.sctrAffiliated || 0,
        sctrNotAffiliated: companySettings.sctrNotAffiliated || 0,
        insuranceName: companySettings.insuranceName || "",
        interSctrAffiliated: companySettings.interSctrAffiliated || 0,
        interSctrNotAffiliated: companySettings.interSctrNotAffiliated || 0,
        interInsuranceName: companySettings.interInsuranceName || "",

        completedBy: profile?.uid || "",
        completedByName: profile?.displayName || profile?.email || "",
        completedAt: new Date(),
        type: type,
        isHighRisk: companySettings.highRiskActivity || false,
        correctiveMeasures: [],
      };

      let specificData = {};

      switch (type) {
        case "accident":
          specificData = {
            workerName: workerProfile?.displayName || "",
            workerDocument: workerProfile?.dni || "",
            workerAge: calculateAge(workerProfile?.birthDate),
            workerGender: workerProfile?.gender || "M",
            workerArea: workerProfile?.department || "",
            workerPosition: workerProfile?.position || "",
            workerSeniority: "",
            workerShift: "D",
            workerContractType: workerProfile?.contractType || "",
            workerExperience: "",
            hoursWorkedBeforeAccident: 0,
            accidentDate: report?.date || "",
            accidentTime: "",
            investigationStartDate: report?.investigation?.conductedAt
              ? new Date(report.investigation.conductedAt.seconds * 1000)
                  .toISOString()
                  .split("T")[0]
              : "",
            exactLocation: report?.location || "",
            accidentGravity: "",
            incapacityDegree: "",
            medicalRestDays: 0,
            affectedWorkersCount: 1,
            witnessesCount: 0,
            injuredBodyPart: "",
            accidentDescription: report?.description || "",
            causesDescription: report?.investigation?.summary || "",
            correctiveMeasures:
              report?.investigation?.correctiveMeasures?.map((m) => ({
                description: m,
                responsible: "",
                executionDate: "",
                status: "pendiente" as const,
              })) || [],
          };
          break;
        case "disease":
          specificData = {
            startYear: new Date().getFullYear().toString(),
            productionLines: "",
            interStartYear: "",
            interProductionLines: "",
            agentType: "Físico",
            specificAgent: "",
            monthlyCases: Array(12).fill(0),
            diseaseName: "",
            affectedBodyPart: "",
            affectedWorkersCount: 0,
            areas: "",
            positionChangesCount: 0,
            causesDetail: "",
            causesUrl: "",
            causesName: "",
            workDescription: "",
            carcinogenicSubstances: "",
            hasAgentMonitoring: false,
            correctiveMeasures: [],
          };
          break;
        case "incident":
          specificData = {
            workerName: workerProfile?.displayName || "",
            workerDocument: workerProfile?.dni || "",
            workerAge: calculateAge(workerProfile?.birthDate),
            workerGender: workerProfile?.gender || "M",
            workerArea: workerProfile?.department || "",
            workerPosition: workerProfile?.position || "",
            workerSeniority: "",
            workerShift: "D",
            workerContractType: workerProfile?.contractType || "",
            workerExperience: "",
            hoursWorkedBeforeIncident: 0,
            incidentType: "Incidente",
            potentiallyAffectedWorkers: 0,
            potentiallyAffectedPopulation: 0,
            firstAidDetail: "",
            incidentDate: report?.date || "",
            incidentTime: "",
            investigationStartDate: report?.investigation?.conductedAt
              ? new Date(report.investigation.conductedAt.seconds * 1000)
                  .toISOString()
                  .split("T")[0]
              : "",
            witnessesCount: 0,
            exactLocation: report?.location || "",
            incidentDescription: report?.description || "",
            causesDescription: report?.investigation?.summary || "",
            correctiveMeasures:
              report?.investigation?.correctiveMeasures?.map((m) => ({
                description: m,
                responsible: "",
                executionDate: "",
                status: "pendiente" as const,
              })) || [],
          };
          break;
        case "medical_exam":
          specificData = {
            workerName: workerProfile?.displayName || "",
            workerDocument: workerProfile?.dni || "",
            workerAge: calculateAge(workerProfile?.birthDate),
            workerGender: workerProfile?.gender || "M",
            workerArea: workerProfile?.department || "",
            workerPosition: workerProfile?.position || "",
            examDate: new Date().toISOString().split("T")[0],
            examType: "Periódico",
            medicalCenter: "",
            examResult: "Apto",
            recommendations: "",
            correctiveMeasures: [],
          };
          break;
        case "monitoring":
          specificData = {
            monitoredArea: "",
            monitoringDate: new Date().toISOString().split("T")[0],
            riskType: "Físico",
            agentMonitored: "",
            hasMonitoringProgram: true,
            frequency: "",
            exposedWorkersCount: 0,
            monitoringOrganization: "",
            results: "",
            deviationsCauses: "",
            conclusions: "",
            correctiveMeasures: [],
          };
          break;
        case "inspection":
          specificData = {
            inspectedArea: "",
            inspectionDate: new Date().toISOString().split("T")[0],
            inspectionTime: "",
            inspectedAreaResponsible: "",
            inspectionResponsible: "",
            inspectionType: "Planeada",
            objective: "",
            result: "",
            unfavorableResultsCauses: "",
            conclusions: "",
            correctiveMeasures: [],
          };
          break;
        case "statistics":
          specificData = {
            year: new Date().getFullYear(),
            monthlyStats: [
              "ENERO",
              "FEBRERO",
              "MARZO",
              "ABRIL",
              "MAYO",
              "JUNIO",
              "JULIO",
              "AGOSTO",
              "SEPTIEMBRE",
              "OCTUBRE",
              "NOVIEMBRE",
              "DICIEMBRE",
            ].map((month) => ({
              month,
              fatalAccidentsCount: 0,
              fatalAccidentsArea: "",
              slightAccidentsCount: 0,
              slightAccidentsArea: "",
              incapacitatingAccidentsCount: 0,
              incapacitatingAccidentsArea: "",
              totalHoursWorked: 0,
              frequencyIndex: 0,
              lostDays: 0,
              severityIndex: 0,
              accidentabilityIndex: 0,
              occupationalDiseasesCount: 0,
              occupationalDiseasesArea: "",
              exposedWorkersCount: 0,
              incidenceRate: 0,
              occupationalCancerCount: 0,
              dangerousIncidentsCount: 0,
              dangerousIncidentsArea: "",
              incidentsCount: 0,
              incidentsArea: "",
            })),
            statisticalResultsDescription: "",
            deviationsCausesAnalysis: "",
          };
          break;
        case "equipment":
          specificData = {
            equipmentType: "EPP",
            equipmentNames: "",
            workers: [],
          };
          break;
        case "training":
          specificData = {
            trainingType: "Capacitación",
            trainingDate: "",
            trainingTopic: "",
            trainingHours: 0,
            trainerName: "",
            workers: [],
          };
          break;
        case "audit":
          specificData = {
            auditorName: "",
            auditorRegistrationNumber: "",
            auditStartDate: "",
            auditEndDate: "",
            auditedProcesses: "",
            auditedProcessesResponsible: "",
            auditScope: "",
            auditConclusions: "",
            nonConformitiesCount: 0,
            correctiveMeasures: [],
          };
          break;
      }

      setFormData({ ...baseData, ...specificData, ...(initialData || {}) });
    }
  }, [
    companySettings,
    workerProfile,
    loading,
    report,
    profile,
    initialData,
    type,
  ]);

  const calculateAge = (birthDate?: string) => {
    if (!birthDate) return 0;
    const today = new Date();
    const birthDateObj = new Date(birthDate);
    let age = today.getFullYear() - birthDateObj.getFullYear();
    const m = today.getMonth() - birthDateObj.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDateObj.getDate())) {
      age--;
    }
    return age;
  };

  const getDayOfWeek = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const days = [
      "Domingo",
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
    ];
    return days[date.getDay()];
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCorrectiveMeasureChange = (
    index: number,
    field: keyof CorrectiveMeasure,
    value: string,
  ) => {
    setFormData((prev) => {
      const measures = [...(prev.correctiveMeasures || [])];
      measures[index] = { ...measures[index], [field]: value };
      return { ...prev, correctiveMeasures: measures };
    });
  };

  useEffect(() => {
    if (
      type === "statistics" &&
      (!formData.monthlyStats || formData.monthlyStats.length === 0)
    ) {
      const months = [
        "ENERO",
        "FEBRERO",
        "MARZO",
        "ABRIL",
        "MAYO",
        "JUNIO",
        "JULIO",
        "AGOSTO",
        "SEPTIEMBRE",
        "OCTUBRE",
        "NOVIEMBRE",
        "DICIEMBRE",
      ];
      setFormData((prev) => ({
        ...prev,
        monthlyStats: months.map((month) => ({
          month,
          fatalAccidentsCount: 0,
          fatalAccidentsArea: "",
          slightAccidentsCount: 0,
          slightAccidentsArea: "",
          incapacitatingAccidentsCount: 0,
          incapacitatingAccidentsArea: "",
          totalHoursWorked: 0,
          frequencyIndex: 0,
          lostDays: 0,
          severityIndex: 0,
          accidentabilityIndex: 0,
          occupationalDiseasesCount: 0,
          occupationalDiseasesArea: "",
          exposedWorkersCount: 0,
          incidenceRate: 0,
          occupationalCancerCount: 0,
          dangerousIncidentsCount: 0,
          dangerousIncidentsArea: "",
          incidentsCount: 0,
          incidentsArea: "",
        })),
      }));
    }
  }, [type, formData.monthlyStats]);

  const autoCalculateStats = async () => {
    try {
      const yearStr =
        formData.year?.toString() || new Date().getFullYear().toString();

      const registersRef = collection(db, "mandatory_registers");
      const q = query(registersRef);
      const querySnapshot = await getDocs(q);

      const months = [
        "ENERO",
        "FEBRERO",
        "MARZO",
        "ABRIL",
        "MAYO",
        "JUNIO",
        "JULIO",
        "AGOSTO",
        "SEPTIEMBRE",
        "OCTUBRE",
        "NOVIEMBRE",
        "DICIEMBRE",
      ];

      const newStats = months.map((month, idx) => {
        const existingStat = formData.monthlyStats?.[idx] || {};
        return {
          month,
          fatalAccidentsCount: 0,
          fatalAccidentsArea: "",
          slightAccidentsCount: 0,
          slightAccidentsArea: "",
          incapacitatingAccidentsCount: 0,
          incapacitatingAccidentsArea: "",
          totalHoursWorked: existingStat.totalHoursWorked || 0,
          frequencyIndex: 0,
          lostDays: 0,
          severityIndex: 0,
          accidentabilityIndex: 0,
          occupationalDiseasesCount: 0,
          occupationalDiseasesArea: "",
          exposedWorkersCount: existingStat.exposedWorkersCount || 0,
          incidenceRate: 0,
          occupationalCancerCount: 0,
          dangerousIncidentsCount: 0,
          dangerousIncidentsArea: "",
          incidentsCount: 0,
          incidentsArea: "",
        };
      });

      querySnapshot.forEach((doc) => {
        const data = doc.data() as any;

        if (
          data.type === "accident" &&
          data.accidentDate &&
          data.accidentDate.startsWith(yearStr)
        ) {
          const monthIndex = parseInt(data.accidentDate.split("-")[1]) - 1;
          if (monthIndex >= 0 && monthIndex < 12) {
            const stat = newStats[monthIndex];
            const area = data.workerArea || "No especificada";
            if (data.accidentGravity === "Mortal") {
              stat.fatalAccidentsCount += 1;
              stat.fatalAccidentsArea = stat.fatalAccidentsArea
                ? `${stat.fatalAccidentsArea}, ${area}`
                : area;
            } else if (data.accidentGravity === "Leve") {
              stat.slightAccidentsCount += 1;
              stat.slightAccidentsArea = stat.slightAccidentsArea
                ? `${stat.slightAccidentsArea}, ${area}`
                : area;
            } else if (data.accidentGravity === "Incapacitante") {
              stat.incapacitatingAccidentsCount += 1;
              stat.incapacitatingAccidentsArea =
                stat.incapacitatingAccidentsArea
                  ? `${stat.incapacitatingAccidentsArea}, ${area}`
                  : area;
              stat.lostDays += Number(data.medicalRestDays) || 0;
            }
          }
        }

        if (
          data.type === "incident" &&
          data.incidentDate &&
          data.incidentDate.startsWith(yearStr)
        ) {
          const monthIndex = parseInt(data.incidentDate.split("-")[1]) - 1;
          if (monthIndex >= 0 && monthIndex < 12) {
            const stat = newStats[monthIndex];
            const area = data.workerArea || "No especificada";
            if (data.incidentType === "Incidente Peligroso") {
              stat.dangerousIncidentsCount += 1;
              stat.dangerousIncidentsArea = stat.dangerousIncidentsArea
                ? `${stat.dangerousIncidentsArea}, ${area}`
                : area;
            } else {
              stat.incidentsCount += 1;
              stat.incidentsArea = stat.incidentsArea
                ? `${stat.incidentsArea}, ${area}`
                : area;
            }
          }
        }

        if (data.type === "disease" && data.startYear === yearStr) {
          if (Array.isArray(data.monthlyCases)) {
            data.monthlyCases.forEach((count: number, idx: number) => {
              if (idx >= 0 && idx < 12 && count > 0) {
                newStats[idx].occupationalDiseasesCount += count;
                const area = data.areas || "No especificada";
                newStats[idx].occupationalDiseasesArea = newStats[idx]
                  .occupationalDiseasesArea
                  ? `${newStats[idx].occupationalDiseasesArea}, ${area}`
                  : area;
              }
            });
          }
        }
      });

      // Calculate indices after gathering all data
      newStats.forEach((stat) => {
        const totalHours = Number(stat.totalHoursWorked) || 0;
        const exposedWorkers = Number(stat.exposedWorkersCount) || 0;

        if (totalHours > 0) {
          const totalAccidents =
            (Number(stat.fatalAccidentsCount) || 0) +
            (Number(stat.incapacitatingAccidentsCount) || 0);
          stat.frequencyIndex = Number(
            ((totalAccidents * 1000000) / totalHours).toFixed(2),
          );
          stat.severityIndex = Number(
            (((Number(stat.lostDays) || 0) * 1000000) / totalHours).toFixed(2),
          );
          stat.accidentabilityIndex = Number(
            ((stat.frequencyIndex * stat.severityIndex) / 1000).toFixed(2),
          );
        }

        if (exposedWorkers > 0) {
          stat.incidenceRate = Number(
            (
              ((Number(stat.occupationalDiseasesCount) || 0) / exposedWorkers) *
              100
            ).toFixed(2),
          );
        }
      });

      setFormData((prev) => ({
        ...prev,
        monthlyStats: newStats,
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, "legalRegisters");
    }
  };

  const addCorrectiveMeasure = () => {
    setFormData((prev) => ({
      ...prev,
      correctiveMeasures: [
        ...(prev.correctiveMeasures || []),
        {
          description: "",
          causes: "",
          measure: "",
          responsible: "",
          executionDay: "",
          executionMonth: "",
          executionYear: "",
          status: "pendiente",
        },
      ],
    }));
  };

  const removeCorrectiveMeasure = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      correctiveMeasures: (prev.correctiveMeasures || []).filter(
        (_, i) => i !== index,
      ),
    }));
  };

  const handleResponsibleChange = (
    index: number,
    field: keyof RegisterResponsible,
    value: string,
  ) => {
    setFormData((prev) => {
      const responsibles = [...(prev.responsibles || [])];
      responsibles[index] = { ...responsibles[index], [field]: value };
      return { ...prev, responsibles: responsibles };
    });
  };

  const addResponsible = () => {
    setFormData((prev) => ({
      ...prev,
      responsibles: [
        ...(prev.responsibles || []),
        {
          name: "",
          position: "",
          date: new Date().toISOString().split("T")[0],
          signatureUrl: "",
        },
      ],
    }));
  };

  const removeResponsible = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      responsibles: (prev.responsibles || []).filter((_, i) => i !== index),
    }));
  };

  const handleMonthlyStatChange = (
    index: number,
    field: string,
    value: any,
  ) => {
    setFormData((prev) => {
      const monthlyStats = [...(prev.monthlyStats || [])];
      const stat = { ...monthlyStats[index], [field]: value };

      // Auto-calculate indices if relevant fields change
      if (
        [
          "fatalAccidentsCount",
          "incapacitatingAccidentsCount",
          "lostDays",
          "totalHoursWorked",
          "occupationalDiseasesCount",
          "exposedWorkersCount",
        ].includes(field)
      ) {
        const totalHours = Number(stat.totalHoursWorked) || 0;
        const exposedWorkers = Number(stat.exposedWorkersCount) || 0;

        if (totalHours > 0) {
          const totalAccidents =
            (Number(stat.fatalAccidentsCount) || 0) +
            (Number(stat.incapacitatingAccidentsCount) || 0);
          stat.frequencyIndex = Number(
            ((totalAccidents * 1000000) / totalHours).toFixed(2),
          );
          stat.severityIndex = Number(
            (((Number(stat.lostDays) || 0) * 1000000) / totalHours).toFixed(2),
          );
          stat.accidentabilityIndex = Number(
            ((stat.frequencyIndex * stat.severityIndex) / 1000).toFixed(2),
          );
        } else {
          stat.frequencyIndex = 0;
          stat.severityIndex = 0;
          stat.accidentabilityIndex = 0;
        }

        if (exposedWorkers > 0) {
          stat.incidenceRate = Number(
            (
              ((Number(stat.occupationalDiseasesCount) || 0) / exposedWorkers) *
              100
            ).toFixed(2),
          );
        } else {
          stat.incidenceRate = 0;
        }
      }

      monthlyStats[index] = stat;
      return { ...prev, monthlyStats };
    });
  };

  const saveSignature = () => {
    if (sigPad.current && isSigning !== null) {
      const signatureUrl = sigPad.current
        .getTrimmedCanvas()
        .toDataURL("image/png");
      const signedAt = new Date().toISOString();
      const signedByEmail = profile?.email || "";

      if (isSigning.type === "responsible") {
        const newResponsibles = [...(formData.responsibles || [])];
        if (newResponsibles[isSigning.index]) {
          newResponsibles[isSigning.index] = {
            ...newResponsibles[isSigning.index],
            signatureUrl,
            signedAt,
            signedByEmail,
          };
          setFormData((prev) => ({ ...prev, responsibles: newResponsibles }));
        }
      } else if (isSigning.type === "trainer") {
        setFormData((prev) => ({
          ...prev,
          trainerSignatureUrl: signatureUrl,
          trainerSignedAt: signedAt,
          trainerSignedByEmail: signedByEmail,
        }));
      } else if (isSigning.type === "deliverer") {
        setFormData((prev) => ({
          ...prev,
          delivererSignatureUrl: signatureUrl,
          delivererSignedAt: signedAt,
          delivererSignedByEmail: signedByEmail,
        }));
      } else {
        const newWorkers = [...formData.workers];
        newWorkers[isSigning.index].signatureUrl = signatureUrl;
        newWorkers[isSigning.index].signedAt = signedAt;
        newWorkers[isSigning.index].signedByEmail = signedByEmail;
        setFormData({ ...formData, workers: newWorkers });
      }
      setIsSigning(null);
    }
  };

  const clearSignature = () => {
    if (sigPad.current) {
      sigPad.current.clear();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const dataToSave = {
        ...formData,
        companyRuc: companyRuc || profile?.companyRuc || "",
        completedAt: initialData ? formData.completedAt : serverTimestamp(),
      };

      if (initialData?.id) {
        await updateDoc(
          doc(db, "mandatory_registers", initialData.id),
          dataToSave,
        );
      } else {
        await addDoc(collection(db, "mandatory_registers"), dataToSave);

        // If tied to a report, update the report with the register reference
        if (report?.id && type === "accident") {
          await updateDoc(doc(db, "reports", report.id), {
            legalRegister: dataToSave,
          });
        }
      }
      onClose();
    } catch (error) {
      console.error("Error saving register:", error);
      handleFirestoreError(error, OperationType.WRITE, "mandatory_registers");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-xl shadow-xl flex items-center space-x-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-600"></div>
          <span className="text-slate-700 font-medium">Cargando datos...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden mx-auto sm:my-4">
        {/* Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="bg-blue-100 p-1.5 sm:p-2 rounded-lg text-blue-600">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-lg font-bold text-slate-800">
                {type === "accident" && "Registro de Accidentes"}
                {type === "disease" && "Enfermedades Ocupacionales"}
                {type === "incident" && "Incidentes y Peligrosos"}
                {type === "medical_exam" && "Exámenes Médicos"}
                {type === "monitoring" && "Monitoreo de Agentes"}
                {type === "inspection" && "Inspecciones"}
                {type === "statistics" && "Estadísticas"}
                {type === "equipment" && "Equipos de Seguridad"}
                {type === "training" && "Capacitaciones"}
                {type === "audit" && "Auditorías"}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Complete los campos requeridos por la normativa RM 050-2013-TR
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <form
            id="legal-register-form"
            onSubmit={handleSubmit}
            className="space-y-8"
          >
            {/* Registro Number */}
            <div className="flex justify-end">
              <div className="w-48">
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  N° REGISTRO:
                </label>
                <input
                  type="text"
                  name="registerNumber"
                  value={formData.registerNumber || ""}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border-2 border-slate-800 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            {/* Section 1: Employer */}
            <section>
              <h3 className="text-md font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">
                1. Datos del Empleador Principal
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Razón Social
                  </label>
                  <input
                    type="text"
                    name="businessName"
                    value={formData.businessName || ""}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    RUC
                  </label>
                  <input
                    type="text"
                    name="ruc"
                    value={formData.ruc || ""}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Tipo de Actividad Económica
                  </label>
                  <input
                    type="text"
                    name="economicActivity"
                    value={formData.economicActivity || ""}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Domicilio
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address || ""}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    N° Trabajadores Totales
                  </label>
                  <input
                    type="number"
                    name="totalWorkers"
                    value={formData.totalWorkers || ""}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* Specific Employer Fields for Accident/Disease */}
                {(type === "accident" || type === "disease") && (
                  <>
                    {type === "disease" && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Año inicio actividad
                        </label>
                        <input
                          type="text"
                          name="startYear"
                          value={formData.startYear || ""}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    )}
                    <div className="md:col-span-3">
                      <label className="flex items-center space-x-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <input
                          type="checkbox"
                          name="isHighRisk"
                          checked={formData.isHighRisk || false}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              isHighRisk: e.target.checked,
                            }))
                          }
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                        />
                        <span className="text-sm font-semibold text-slate-800">
                          ¿Las actividades del empleador son consideradas de
                          alto riesgo?
                        </span>
                      </label>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        N° Trabajadores Afiliados al SCTR
                      </label>
                      <input
                        type="number"
                        name="sctrAffiliated"
                        value={formData.sctrAffiliated || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        N° Trabajadores NO Afiliados al SCTR
                      </label>
                      <input
                        type="number"
                        name="sctrNotAffiliated"
                        value={formData.sctrNotAffiliated || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Nombre de la Aseguradora
                      </label>
                      <input
                        type="text"
                        name="insuranceName"
                        value={formData.insuranceName || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    {type === "disease" && (
                      <div className="md:col-span-3">
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Líneas de producción y/o servicios
                        </label>
                        <input
                          type="text"
                          name="productionLines"
                          value={formData.productionLines || ""}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

            {/* Section 1.5: Intermediation Employer */}
            <section>
              <div className="flex items-center mb-4">
                <input
                  type="checkbox"
                  id="isIntermediation"
                  name="isIntermediation"
                  checked={formData.isIntermediation || false}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      isIntermediation: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                />
                <label
                  htmlFor="isIntermediation"
                  className="ml-2 block text-sm font-medium text-slate-700"
                >
                  ¿Es empleador de intermediación, tercerización, contratista,
                  subcontratista u otros?
                </label>
              </div>

              {formData.isIntermediation && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Razón Social o Denominación Social
                    </label>
                    <input
                      type="text"
                      name="interBusinessName"
                      value={formData.interBusinessName || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      RUC
                    </label>
                    <input
                      type="text"
                      name="interRuc"
                      value={formData.interRuc || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Domicilio
                    </label>
                    <input
                      type="text"
                      name="interAddress"
                      value={formData.interAddress || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Tipo de Actividad Económica
                    </label>
                    <input
                      type="text"
                      name="interEconomicActivity"
                      value={formData.interEconomicActivity || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      N° Trabajadores
                    </label>
                    <input
                      type="number"
                      name="interTotalWorkers"
                      value={formData.interTotalWorkers || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      N° Trabajadores Afiliados al SCTR
                    </label>
                    <input
                      type="number"
                      name="interSctrAffiliated"
                      value={formData.interSctrAffiliated || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      N° Trabajadores NO Afiliados al SCTR
                    </label>
                    <input
                      type="number"
                      name="interSctrNotAffiliated"
                      value={formData.interSctrNotAffiliated || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nombre de la Aseguradora
                    </label>
                    <input
                      type="text"
                      name="interInsuranceName"
                      value={formData.interInsuranceName || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Año inicio actividad
                    </label>
                    <input
                      type="text"
                      name="interStartYear"
                      value={formData.interStartYear || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Líneas de producción y/o servicios
                    </label>
                    <input
                      type="text"
                      name="interProductionLines"
                      value={formData.interProductionLines || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Section 2: Worker (for Accident, Incident) */}
            {(type === "accident" || type === "incident") && (
              <section>
                <h3 className="text-md font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">
                  2. Datos del Trabajador
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nombres y Apellidos
                    </label>
                    <input
                      type="text"
                      name="workerName"
                      value={formData.workerName || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      DNI / CE
                    </label>
                    <input
                      type="text"
                      name="workerDocument"
                      value={formData.workerDocument || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Edad
                    </label>
                    <input
                      type="number"
                      name="workerAge"
                      value={formData.workerAge || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Género
                    </label>
                    <select
                      name="workerGender"
                      value={formData.workerGender || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    >
                      <option value="M">Masculino</option>
                      <option value="F">Femenino</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Área
                    </label>
                    <input
                      type="text"
                      name="workerArea"
                      value={formData.workerArea || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Puesto
                    </label>
                    <input
                      type="text"
                      name="workerPosition"
                      value={formData.workerPosition || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Antigüedad en el empleo
                    </label>
                    <input
                      type="text"
                      name="workerSeniority"
                      value={formData.workerSeniority || ""}
                      onChange={handleChange}
                      placeholder="Ej: 2 años, 3 meses"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Turno
                    </label>
                    <select
                      name="workerShift"
                      value={formData.workerShift || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    >
                      <option value="D">Día</option>
                      <option value="T">Tarde</option>
                      <option value="N">Noche</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Tipo de Contrato
                    </label>
                    <input
                      type="text"
                      name="workerContractType"
                      value={formData.workerContractType || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Tiempo de Experiencia en el Puesto de Trabajo
                    </label>
                    <input
                      type="text"
                      name="workerExperience"
                      value={formData.workerExperience || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  {type === "incident" && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        N° Horas Trabajadas en la Jornada (Antes del suceso)
                      </label>
                      <input
                        type="number"
                        name="hoursWorkedBeforeIncident"
                        value={formData.hoursWorkedBeforeIncident || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Section 3: Accident Details */}
            {type === "accident" && (
              <>
                <section>
                  <h3 className="text-md font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">
                    3. Investigación del Accidente de Trabajo
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        N° Horas Trabajadas en la Jornada (Antes del accidente)
                      </label>
                      <input
                        type="number"
                        name="hoursWorkedBeforeAccident"
                        value={formData.hoursWorkedBeforeAccident || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Fecha de Ocurrencia{" "}
                        {formData.accidentDate && (
                          <span className="text-blue-600 font-bold">
                            ({getDayOfWeek(formData.accidentDate)})
                          </span>
                        )}
                      </label>
                      <input
                        type="date"
                        name="accidentDate"
                        value={formData.accidentDate || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Hora de Ocurrencia
                      </label>
                      <input
                        type="time"
                        name="accidentTime"
                        value={formData.accidentTime || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Fecha Inicio Investigación
                      </label>
                      <input
                        type="date"
                        name="investigationStartDate"
                        value={formData.investigationStartDate || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Lugar exacto donde ocurrió el accidente
                      </label>
                      <input
                        type="text"
                        name="exactLocation"
                        value={formData.exactLocation || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Gravedad del Accidente
                      </label>
                      <select
                        name="accidentGravity"
                        value={formData.accidentGravity || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      >
                        <option value="">Seleccione...</option>
                        <option value="Leve">Accidente Leve</option>
                        <option value="Incapacitante">
                          Accidente Incapacitante
                        </option>
                        <option value="Mortal">Accidente Mortal</option>
                      </select>
                    </div>
                    {formData.accidentGravity === "Incapacitante" && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Grado del Accidente Incapacitante
                        </label>
                        <select
                          name="incapacityDegree"
                          value={formData.incapacityDegree || ""}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                        >
                          <option value="">Seleccione...</option>
                          <option value="Total Temporal">Total Temporal</option>
                          <option value="Parcial Temporal">
                            Parcial Temporal
                          </option>
                          <option value="Parcial Permanente">
                            Parcial Permanente
                          </option>
                          <option value="Total Permanente">
                            Total Permanente
                          </option>
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        N° Días Descanso Médico
                      </label>
                      <input
                        type="number"
                        name="medicalRestDays"
                        value={formData.medicalRestDays || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        N° Trabajadores Afectados
                      </label>
                      <input
                        type="number"
                        name="affectedWorkersCount"
                        value={formData.affectedWorkersCount || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        N° Trabajadores que presenciaron el accidente
                      </label>
                      <input
                        type="number"
                        name="witnessesCount"
                        value={formData.witnessesCount || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Parte del cuerpo lesionado
                      </label>
                      <input
                        type="text"
                        name="injuredBodyPart"
                        value={formData.injuredBodyPart || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Descripción del Accidente de Trabajo
                      </label>
                      <textarea
                        name="accidentDescription"
                        value={formData.accidentDescription || ""}
                        onChange={handleChange}
                        rows={3}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Descripción de las Causas que originaron el Accidente
                      </label>
                      <textarea
                        name="causesDescription"
                        value={formData.causesDescription || ""}
                        onChange={handleChange}
                        rows={3}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                  </div>
                </section>
              </>
            )}

            {/* Section: Disease Details */}
            {type === "disease" && (
              <section className="space-y-6">
                <h3 className="text-md font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">
                  3. Datos Referentes a la Enfermedad Ocupacional
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Tipo de Agente
                    </label>
                    <select
                      name="agentType"
                      value={formData.agentType || "Físico"}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {Object.keys(AGENTS_REFERENCE).map((agent) => (
                        <option key={agent} value={agent}>
                          {agent}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Agente Específico
                    </label>
                    <select
                      name="specificAgent"
                      value={formData.specificAgent || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccione...</option>
                      {AGENTS_REFERENCE[
                        formData.agentType as keyof typeof AGENTS_REFERENCE
                      ]?.map((agent) => (
                        <option key={agent} value={agent}>
                          {agent}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <label className="block text-sm font-bold text-slate-700 mb-3 text-center">
                    N° Enfermedades Ocupacionales por Mes
                  </label>
                  <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
                    {[
                      "E",
                      "F",
                      "M",
                      "A",
                      "M",
                      "J",
                      "J",
                      "A",
                      "S",
                      "O",
                      "N",
                      "D",
                    ].map((month, idx) => (
                      <div key={idx} className="text-center">
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">
                          {month}
                        </label>
                        <input
                          type="number"
                          value={formData.monthlyCases?.[idx] || 0}
                          onChange={(e) => {
                            const newCases = [
                              ...(formData.monthlyCases || Array(12).fill(0)),
                            ];
                            newCases[idx] = parseInt(e.target.value) || 0;
                            setFormData((prev) => ({
                              ...prev,
                              monthlyCases: newCases,
                            }));
                          }}
                          className="w-full px-1 py-1 text-center border border-slate-300 rounded focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nombre de la Enfermedad Ocupacional
                    </label>
                    <input
                      type="text"
                      name="diseaseName"
                      value={formData.diseaseName || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Parte del cuerpo o sistema afectado
                    </label>
                    <input
                      type="text"
                      name="affectedBodyPart"
                      value={formData.affectedBodyPart || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      N° Trab. Afectados
                    </label>
                    <input
                      type="number"
                      name="affectedWorkersCount"
                      value={formData.affectedWorkersCount || 0}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Áreas
                    </label>
                    <input
                      type="text"
                      name="areas"
                      value={formData.areas || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      N° de cambios de puestos
                    </label>
                    <input
                      type="number"
                      name="positionChangesCount"
                      value={formData.positionChangesCount || 0}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Detalle de las causas que generan las enfermedades
                      ocupacionales
                    </label>
                    <div className="space-y-2">
                      <textarea
                        name="causesDetail"
                        value={formData.causesDetail || ""}
                        onChange={handleChange}
                        rows={3}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg cursor-pointer hover:bg-slate-200 transition-colors text-sm border border-slate-300">
                          <Upload className="h-4 w-4" />
                          <span>Adjuntar documento de causas</span>
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setFormData((prev) => ({
                                  ...prev,
                                  causesName: file.name,
                                  causesUrl: "temp-url",
                                }));
                              }
                            }}
                          />
                        </label>
                        {formData.causesName && (
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <File className="h-3 w-3" />
                            <span>{formData.causesName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Descripción de las labores desarrolladas por el trabajador
                      antes de adquirir la enfermedad
                    </label>
                    <textarea
                      name="workDescription"
                      value={formData.workDescription || ""}
                      onChange={handleChange}
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                </div>

                <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 space-y-4">
                  <h4 className="text-sm font-bold text-amber-800">
                    Sustancias Cancerígenas (Ref. D.S. 039-93-PCM / D.S.
                    015-2005-SA)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-amber-900 mb-1">
                        Relación de Sustancias Cancerígenas
                      </label>
                      <input
                        type="text"
                        name="carcinogenicSubstances"
                        value={formData.carcinogenicSubstances || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-amber-900 mb-1">
                        ¿Se han realizado monitoreos?
                      </label>
                      <select
                        name="hasAgentMonitoring"
                        value={formData.hasAgentMonitoring ? "true" : "false"}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            hasAgentMonitoring: e.target.value === "true",
                          }))
                        }
                        className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="false">NO</option>
                        <option value="true">SI</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Section: Incident Details */}
            {type === "incident" && (
              <section className="space-y-6">
                <h3 className="text-md font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">
                  3. Investigación del Incidente Peligroso o Incidente
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Tipo de Suceso
                    </label>
                    <select
                      name="incidentType"
                      value={formData.incidentType || "Incidente"}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Incidente">Incidente</option>
                      <option value="Incidente Peligroso">
                        Incidente Peligroso
                      </option>
                    </select>
                  </div>
                  {formData.incidentType === "Incidente Peligroso" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          N° Trab. Potencialmente Afectados
                        </label>
                        <input
                          type="number"
                          name="potentiallyAffectedWorkers"
                          value={formData.potentiallyAffectedWorkers || 0}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          N° Pobladores Potencialmente Afectados
                        </label>
                        <input
                          type="number"
                          name="potentiallyAffectedPopulation"
                          value={formData.potentiallyAffectedPopulation || 0}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Detallar tipo de atención en primeros auxilios
                      </label>
                      <input
                        type="text"
                        name="firstAidDetail"
                        value={formData.firstAidDetail || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Fecha del Suceso{" "}
                      {formData.incidentDate && (
                        <span className="text-blue-600 font-bold">
                          ({getDayOfWeek(formData.incidentDate)})
                        </span>
                      )}
                    </label>
                    <input
                      type="date"
                      name="incidentDate"
                      value={formData.incidentDate || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Hora del Suceso
                    </label>
                    <input
                      type="time"
                      name="incidentTime"
                      value={formData.incidentTime || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Fecha Inicio Investigación
                    </label>
                    <input
                      type="date"
                      name="investigationStartDate"
                      value={formData.investigationStartDate || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      N° Testigos
                    </label>
                    <input
                      type="number"
                      name="witnessesCount"
                      value={formData.witnessesCount || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Lugar exacto donde ocurrió el hecho
                    </label>
                    <input
                      type="text"
                      name="exactLocation"
                      value={formData.exactLocation || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Descripción del Incidente Peligroso o Incidente
                    </label>
                    <textarea
                      name="incidentDescription"
                      value={formData.incidentDescription || ""}
                      onChange={handleChange}
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Describa solo los hechos, no escriba información subjetiva
                      que no pueda ser comprobada.
                    </p>
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Descripción de las causas que originaron el incidente
                    </label>
                    <textarea
                      name="causesDescription"
                      value={formData.causesDescription || ""}
                      onChange={handleChange}
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Section: Medical Exam Details */}
            {type === "medical_exam" && (
              <section className="space-y-6">
                <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <AlertCircle className="h-5 w-5 text-amber-400" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-amber-700">
                        <strong>Nota de Confidencialidad:</strong> Conforme a la
                        Ley N° 26842 y Ley N° 29783, los resultados de los
                        exámenes médicos son confidenciales. Este registro debe
                        garantizar la privacidad del trabajador, manteniendo
                        solo la constancia de aptitud.
                      </p>
                    </div>
                  </div>
                </div>

                <h3 className="text-md font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">
                  2. Datos del Trabajador
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nombre Completo
                    </label>
                    <input
                      type="text"
                      name="workerName"
                      value={formData.workerName || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      DNI / CE
                    </label>
                    <input
                      type="text"
                      name="workerDocument"
                      value={formData.workerDocument || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Edad
                    </label>
                    <input
                      type="number"
                      name="workerAge"
                      value={formData.workerAge || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Género
                    </label>
                    <select
                      name="workerGender"
                      value={formData.workerGender || "M"}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    >
                      <option value="M">Masculino</option>
                      <option value="F">Femenino</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Área
                    </label>
                    <input
                      type="text"
                      name="workerArea"
                      value={formData.workerArea || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Puesto de Trabajo
                    </label>
                    <input
                      type="text"
                      name="workerPosition"
                      value={formData.workerPosition || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                </div>

                <h3 className="text-md font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">
                  3. Datos del Examen Médico
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Fecha del Examen
                    </label>
                    <input
                      type="date"
                      name="examDate"
                      value={formData.examDate || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Tipo de Examen
                    </label>
                    <select
                      name="examType"
                      value={formData.examType || "Periódico"}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    >
                      <option value="Pre-ocupacional">Pre-ocupacional</option>
                      <option value="Periódico">Periódico</option>
                      <option value="Retiro">Retiro</option>
                      <option value="Otros">Otros</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nombre del Centro Médico
                    </label>
                    <input
                      type="text"
                      name="medicalCenter"
                      value={formData.medicalCenter || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Resultado
                    </label>
                    <select
                      name="examResult"
                      value={formData.examResult || "Apto"}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    >
                      <option value="Apto">Apto</option>
                      <option value="Apto con restricciones">
                        Apto con restricciones
                      </option>
                      <option value="No apto">No apto</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Certificado de Aptitud (Opcional)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = ".pdf,.jpg,.png";
                          input.onchange = (e: any) => {
                            const file = e.target.files[0];
                            if (file) {
                              setFormData({
                                ...formData,
                                certificateName: file.name,
                              });
                            }
                          };
                          input.click();
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm"
                      >
                        <Upload className="w-4 h-4" />
                        Subir Certificado
                      </button>
                      {formData.certificateName && (
                        <div className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                          <File className="w-3 h-3" />
                          {formData.certificateName}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Recomendaciones
                    </label>
                    <textarea
                      name="recommendations"
                      value={formData.recommendations || ""}
                      onChange={handleChange}
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Section: Monitoring Details */}
            {type === "monitoring" && (
              <section className="space-y-6">
                <h3 className="text-md font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">
                  2. Datos del Monitoreo
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Fecha
                    </label>
                    <input
                      type="date"
                      name="monitoringDate"
                      value={formData.monitoringDate || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Área Monitoreada
                    </label>
                    <input
                      type="text"
                      name="monitoredArea"
                      value={formData.monitoredArea || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Tipo de Riesgo
                    </label>
                    <select
                      name="riskType"
                      value={formData.riskType || "Físico"}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    >
                      <option value="Físico">Físico</option>
                      <option value="Químico">Químico</option>
                      <option value="Biológico">Biológico</option>
                      <option value="Psicosocial">Psicosocial</option>
                      <option value="Disergonómico">Disergonómico</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Agente Monitoreado
                    </label>
                    <input
                      type="text"
                      name="agentMonitored"
                      value={formData.agentMonitored || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      N° Trab. Expuestos
                    </label>
                    <input
                      type="number"
                      name="exposedWorkersCount"
                      value={formData.exposedWorkersCount || 0}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Organización que realiza el monitoreo
                    </label>
                    <input
                      type="text"
                      name="monitoringOrganization"
                      value={formData.monitoringOrganization || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      ¿Tiene programa?
                    </label>
                    <select
                      name="hasMonitoringProgram"
                      value={formData.hasMonitoringProgram ? "true" : "false"}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          hasMonitoringProgram: e.target.value === "true",
                        }))
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    >
                      <option value="true">SI</option>
                      <option value="false">NO</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Frecuencia
                    </label>
                    <input
                      type="text"
                      name="frequency"
                      value={formData.frequency || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <h3 className="text-md font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">
                  3. Resultados y Conclusiones
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="md:col-span-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Resultados
                    </label>
                    <textarea
                      name="results"
                      value={formData.results || ""}
                      onChange={handleChange}
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Causas de desviaciones
                    </label>
                    <textarea
                      name="deviationsCauses"
                      value={formData.deviationsCauses || ""}
                      onChange={handleChange}
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Conclusiones y Recomendaciones
                    </label>
                    <textarea
                      name="conclusions"
                      value={formData.conclusions || ""}
                      onChange={handleChange}
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                </div>

                <h3 className="text-md font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">
                  4. Documentos Adjuntos
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Programa Anual
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.onchange = (e: any) => {
                            const file = e.target.files[0];
                            if (file)
                              setFormData({
                                ...formData,
                                programName: file.name,
                              });
                          };
                          input.click();
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-xs"
                      >
                        <Upload className="w-3 h-3" /> Subir
                      </button>
                      {formData.programName && (
                        <span className="text-[10px] text-blue-600 truncate max-w-[100px]">
                          {formData.programName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Informe de Resultados
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.onchange = (e: any) => {
                            const file = e.target.files[0];
                            if (file)
                              setFormData({
                                ...formData,
                                reportName: file.name,
                              });
                          };
                          input.click();
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-xs"
                      >
                        <Upload className="w-3 h-3" /> Subir
                      </button>
                      {formData.reportName && (
                        <span className="text-[10px] text-blue-600 truncate max-w-[100px]">
                          {formData.reportName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Certificado Calibración
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.onchange = (e: any) => {
                            const file = e.target.files[0];
                            if (file)
                              setFormData({
                                ...formData,
                                calibrationName: file.name,
                              });
                          };
                          input.click();
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-xs"
                      >
                        <Upload className="w-3 h-3" /> Subir
                      </button>
                      {formData.calibrationName && (
                        <span className="text-[10px] text-blue-600 truncate max-w-[100px]">
                          {formData.calibrationName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Section: Inspection Details */}
            {type === "inspection" && (
              <section className="space-y-6">
                <h3 className="text-md font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">
                  2. Datos de la Inspección
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Fecha
                    </label>
                    <input
                      type="date"
                      name="inspectionDate"
                      value={formData.inspectionDate || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Hora
                    </label>
                    <input
                      type="time"
                      name="inspectionTime"
                      value={formData.inspectionTime || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Área Inspeccionada
                    </label>
                    <input
                      type="text"
                      name="inspectedArea"
                      value={formData.inspectedArea || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Responsable del Área
                    </label>
                    <input
                      type="text"
                      name="inspectedAreaResponsible"
                      value={formData.inspectedAreaResponsible || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Responsable de la Inspección
                    </label>
                    <input
                      type="text"
                      name="inspectionResponsible"
                      value={formData.inspectionResponsible || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Tipo de Inspección
                    </label>
                    <select
                      name="inspectionType"
                      value={formData.inspectionType || "Planeada"}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    >
                      <option value="Planeada">Planeada</option>
                      <option value="No planeada">No planeada</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Objetivo de la Inspección
                    </label>
                    <input
                      type="text"
                      name="objective"
                      value={formData.objective || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                </div>

                <h3 className="text-md font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">
                  3. Resultados y Conclusiones
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="md:col-span-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Resultados/Hallazgos
                    </label>
                    <textarea
                      name="result"
                      value={formData.result || ""}
                      onChange={handleChange}
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Causas de resultados desfavorables
                    </label>
                    <textarea
                      name="unfavorableResultsCauses"
                      value={formData.unfavorableResultsCauses || ""}
                      onChange={handleChange}
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Conclusiones
                    </label>
                    <textarea
                      name="conclusions"
                      value={formData.conclusions || ""}
                      onChange={handleChange}
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Section: Statistics Details */}
            {type === "statistics" && (
              <section>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-4">
                  <h3 className="text-md font-semibold text-slate-800">
                    2. Registro de Estadísticas de Seguridad y Salud en el
                    Trabajo
                  </h3>
                  <div className="flex items-center gap-2">
                    {(!formData.monthlyStats ||
                      formData.monthlyStats.length === 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          const months = [
                            "ENERO",
                            "FEBRERO",
                            "MARZO",
                            "ABRIL",
                            "MAYO",
                            "JUNIO",
                            "JULIO",
                            "AGOSTO",
                            "SEPTIEMBRE",
                            "OCTUBRE",
                            "NOVIEMBRE",
                            "DICIEMBRE",
                          ];
                          setFormData({
                            ...formData,
                            monthlyStats: months.map((month) => ({
                              month,
                              fatalAccidentsCount: 0,
                              fatalAccidentsArea: "",
                              slightAccidentsCount: 0,
                              slightAccidentsArea: "",
                              incapacitatingAccidentsCount: 0,
                              incapacitatingAccidentsArea: "",
                              totalHoursWorked: 0,
                              frequencyIndex: 0,
                              lostDays: 0,
                              severityIndex: 0,
                              accidentabilityIndex: 0,
                              occupationalDiseasesCount: 0,
                              occupationalDiseasesArea: "",
                              exposedWorkersCount: 0,
                              incidenceRate: 0,
                              occupationalCancerCount: 0,
                              dangerousIncidentsCount: 0,
                              dangerousIncidentsArea: "",
                              incidentsCount: 0,
                              incidentsArea: "",
                            })),
                          });
                        }}
                        className="text-[10px] bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 transition-all shadow-sm"
                      >
                        Generar Tabla Anual
                      </button>
                    )}
                    <label className="text-sm font-medium text-slate-700">
                      Año:
                    </label>
                    <input
                      type="number"
                      name="year"
                      value={formData.year || new Date().getFullYear()}
                      onChange={handleChange}
                      className="w-24 px-2 py-1 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={autoCalculateStats}
                      className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-all shadow-sm flex items-center gap-1"
                    >
                      <PenTool className="w-3 h-3" />
                      Calcular Año Automáticamente
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="min-w-[2000px] text-[10px] text-left border-collapse">
                    <thead className="bg-slate-50 text-slate-700 uppercase font-bold">
                      <tr>
                        <th
                          rowSpan={2}
                          className="px-2 py-3 border border-slate-200 text-center sticky left-0 bg-slate-50 z-10 w-24"
                        >
                          MES
                        </th>
                        <th
                          colSpan={2}
                          className="px-2 py-3 border border-slate-200 text-center bg-blue-50"
                        >
                          3-4. ACCIDENTE MORTAL
                        </th>
                        <th
                          colSpan={2}
                          className="px-2 py-3 border border-slate-200 text-center bg-blue-50"
                        >
                          5-6. ACCID. TRABAJO LEVE
                        </th>
                        <th
                          colSpan={7}
                          className="px-2 py-3 border border-slate-200 text-center bg-amber-50"
                        >
                          7. SOLO PARA ACCIDENTES INCAPACITANTES
                        </th>
                        <th
                          colSpan={5}
                          className="px-2 py-3 border border-slate-200 text-center bg-emerald-50"
                        >
                          8. ENFERMEDAD OCUPACIONAL
                        </th>
                        <th
                          colSpan={2}
                          className="px-2 py-3 border border-slate-200 text-center bg-rose-50"
                        >
                          9-10. INCIDENTES PELIGROSOS
                        </th>
                        <th
                          colSpan={2}
                          className="px-2 py-3 border border-slate-200 text-center bg-rose-50"
                        >
                          11-12. INCIDENTES
                        </th>
                      </tr>
                      <tr>
                        <th className="px-2 py-2 border border-slate-200 text-center w-20">
                          N° ACCID.
                        </th>
                        <th className="px-2 py-2 border border-slate-200 text-center w-32">
                          ÁREA/SEDE
                        </th>
                        <th className="px-2 py-2 border border-slate-200 text-center w-20">
                          N° ACCID.
                        </th>
                        <th className="px-2 py-2 border border-slate-200 text-center w-32">
                          ÁREA/SEDE
                        </th>

                        <th className="px-2 py-2 border border-slate-200 text-center w-20">
                          N° ACCID.
                        </th>
                        <th className="px-2 py-2 border border-slate-200 text-center w-32">
                          ÁREA/SEDE
                        </th>
                        <th className="px-2 py-2 border border-slate-200 text-center w-24">
                          TOTAL HORAS TRAB.
                        </th>
                        <th className="px-2 py-2 border border-slate-200 text-center w-24">
                          ÍNDICE FREC.
                        </th>
                        <th className="px-2 py-2 border border-slate-200 text-center w-20">
                          N° DÍAS PERD.
                        </th>
                        <th className="px-2 py-2 border border-slate-200 text-center w-24">
                          ÍNDICE GRAV.
                        </th>
                        <th className="px-2 py-2 border border-slate-200 text-center w-24">
                          ÍNDICE ACCID.
                        </th>

                        <th className="px-2 py-2 border border-slate-200 text-center w-20">
                          N° ENF.
                        </th>
                        <th className="px-2 py-2 border border-slate-200 text-center w-32">
                          ÁREA/SEDE
                        </th>
                        <th className="px-2 py-2 border border-slate-200 text-center w-24">
                          TRAB. EXPUESTOS
                        </th>
                        <th className="px-2 py-2 border border-slate-200 text-center w-24">
                          TASA INCID.
                        </th>
                        <th className="px-2 py-2 border border-slate-200 text-center w-24">
                          CÁNCER PROF.
                        </th>

                        <th className="px-2 py-2 border border-slate-200 text-center w-20">
                          N° INCID.
                        </th>
                        <th className="px-2 py-2 border border-slate-200 text-center w-32">
                          ÁREA/SEDE
                        </th>
                        <th className="px-2 py-2 border border-slate-200 text-center w-20">
                          N° INCID.
                        </th>
                        <th className="px-2 py-2 border border-slate-200 text-center w-32">
                          ÁREA/SEDE
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {(formData.monthlyStats || []).map(
                        (stat: any, index: number) => (
                          <tr
                            key={index}
                            className="hover:bg-slate-50 transition-colors"
                          >
                            <td className="px-2 py-2 border border-slate-200 font-bold bg-slate-50 sticky left-0 z-10">
                              {stat.month}
                            </td>

                            {/* Accident Mortal */}
                            <td className="p-1 border border-slate-200">
                              <input
                                type="number"
                                value={stat.fatalAccidentsCount}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "fatalAccidentsCount",
                                    parseInt(e.target.value) || 0,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded text-center"
                              />
                            </td>
                            <td className="p-1 border border-slate-200">
                              <input
                                type="text"
                                value={stat.fatalAccidentsArea}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "fatalAccidentsArea",
                                    e.target.value,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded"
                              />
                            </td>

                            {/* Accident Leve */}
                            <td className="p-1 border border-slate-200">
                              <input
                                type="number"
                                value={stat.slightAccidentsCount}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "slightAccidentsCount",
                                    parseInt(e.target.value) || 0,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded text-center"
                              />
                            </td>
                            <td className="p-1 border border-slate-200">
                              <input
                                type="text"
                                value={stat.slightAccidentsArea}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "slightAccidentsArea",
                                    e.target.value,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded"
                              />
                            </td>

                            {/* Accident Incapacitante */}
                            <td className="p-1 border border-slate-200">
                              <input
                                type="number"
                                value={stat.incapacitatingAccidentsCount}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "incapacitatingAccidentsCount",
                                    parseInt(e.target.value) || 0,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded text-center"
                              />
                            </td>
                            <td className="p-1 border border-slate-200">
                              <input
                                type="text"
                                value={stat.incapacitatingAccidentsArea}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "incapacitatingAccidentsArea",
                                    e.target.value,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded"
                              />
                            </td>
                            <td className="p-1 border border-slate-200">
                              <input
                                type="number"
                                value={stat.totalHoursWorked}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "totalHoursWorked",
                                    parseInt(e.target.value) || 0,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded text-center"
                              />
                            </td>
                            <td className="p-1 border border-slate-200">
                              <input
                                type="number"
                                step="0.01"
                                value={stat.frequencyIndex}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "frequencyIndex",
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded text-center"
                              />
                            </td>
                            <td className="p-1 border border-slate-200">
                              <input
                                type="number"
                                value={stat.lostDays}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "lostDays",
                                    parseInt(e.target.value) || 0,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded text-center"
                              />
                            </td>
                            <td className="p-1 border border-slate-200">
                              <input
                                type="number"
                                step="0.01"
                                value={stat.severityIndex}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "severityIndex",
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded text-center"
                              />
                            </td>
                            <td className="p-1 border border-slate-200">
                              <input
                                type="number"
                                step="0.01"
                                value={stat.accidentabilityIndex}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "accidentabilityIndex",
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded text-center"
                              />
                            </td>

                            {/* Enfermedad Ocupacional */}
                            <td className="p-1 border border-slate-200">
                              <input
                                type="number"
                                value={stat.occupationalDiseasesCount}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "occupationalDiseasesCount",
                                    parseInt(e.target.value) || 0,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded text-center"
                              />
                            </td>
                            <td className="p-1 border border-slate-200">
                              <input
                                type="text"
                                value={stat.occupationalDiseasesArea}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "occupationalDiseasesArea",
                                    e.target.value,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded"
                              />
                            </td>
                            <td className="p-1 border border-slate-200">
                              <input
                                type="number"
                                value={stat.exposedWorkersCount}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "exposedWorkersCount",
                                    parseInt(e.target.value) || 0,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded text-center"
                              />
                            </td>
                            <td className="p-1 border border-slate-200">
                              <input
                                type="number"
                                step="0.01"
                                value={stat.incidenceRate}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "incidenceRate",
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded text-center"
                              />
                            </td>
                            <td className="p-1 border border-slate-200">
                              <input
                                type="number"
                                value={stat.occupationalCancerCount}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "occupationalCancerCount",
                                    parseInt(e.target.value) || 0,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded text-center"
                              />
                            </td>

                            {/* Incidentes Peligrosos */}
                            <td className="p-1 border border-slate-200">
                              <input
                                type="number"
                                value={stat.dangerousIncidentsCount}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "dangerousIncidentsCount",
                                    parseInt(e.target.value) || 0,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded text-center"
                              />
                            </td>
                            <td className="p-1 border border-slate-200">
                              <input
                                type="text"
                                value={stat.dangerousIncidentsArea}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "dangerousIncidentsArea",
                                    e.target.value,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded"
                              />
                            </td>

                            {/* Incidentes */}
                            <td className="p-1 border border-slate-200">
                              <input
                                type="number"
                                value={stat.incidentsCount}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "incidentsCount",
                                    parseInt(e.target.value) || 0,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded text-center"
                              />
                            </td>
                            <td className="p-1 border border-slate-200">
                              <input
                                type="text"
                                value={stat.incidentsArea}
                                onChange={(e) =>
                                  handleMonthlyStatChange(
                                    index,
                                    "incidentsArea",
                                    e.target.value,
                                  )
                                }
                                className="w-full px-1 py-1 border border-slate-200 rounded"
                              />
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-800 mb-2">
                      6. DESCRIBIR LOS RESULTADOS ESTADÍSTICOS (COMPARAR CON LOS
                      OBJETIVOS DEL SG-SST)
                    </label>
                    <textarea
                      name="statisticalResultsDescription"
                      value={formData.statisticalResultsDescription || ""}
                      onChange={handleChange}
                      rows={4}
                      placeholder="Ej: Se logró reducir el índice de frecuencia en un 10% respecto al año anterior, cumpliendo con el objetivo anual..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-800 mb-2">
                      7. ANÁLISIS DE LAS CAUSAS QUE ORIGINARON LAS DESVIACIONES
                    </label>
                    <textarea
                      name="deviationsCausesAnalysis"
                      value={formData.deviationsCausesAnalysis || ""}
                      onChange={handleChange}
                      rows={4}
                      placeholder="Ej: El incremento en incidentes leves en el mes de marzo se debió a la incorporación de personal nuevo sin capacitación completa..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>

                <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-blue-600" />
                    FICHA TÉCNICA DEL FORMATO DE DATOS PARA EL INFORME
                    ESTADÍSTICO
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] text-slate-600">
                    <div className="space-y-2">
                      <p>
                        <strong>1. ÍNDICE DE FRECUENCIA (IF):</strong> Número de
                        accidentes incapacitantes por cada millón de horas
                        hombre trabajadas.
                      </p>
                      <p className="pl-4 font-mono bg-white p-1 rounded border border-slate-100">
                        IF = (N° Accidentes Incapacitantes x 1'000,000) / Horas
                        Hombre Trabajadas
                      </p>

                      <p>
                        <strong>2. ÍNDICE DE GRAVEDAD (IS):</strong> Número de
                        días perdidos por cada millón de horas hombre
                        trabajadas.
                      </p>
                      <p className="pl-4 font-mono bg-white p-1 rounded border border-slate-100">
                        IS = (N° Días Perdidos x 1'000,000) / Horas Hombre
                        Trabajadas
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p>
                        <strong>3. ÍNDICE DE ACCIDENTABILIDAD (IA):</strong>{" "}
                        Relación entre el índice de frecuencia y el índice de
                        gravedad.
                      </p>
                      <p className="pl-4 font-mono bg-white p-1 rounded border border-slate-100">
                        IA = (IF x IS) / 1,000
                      </p>

                      <p>
                        <strong>4. TASA DE INCIDENCIA (TI):</strong> Número de
                        enfermedades ocupacionales por cada mil trabajadores
                        expuestos.
                      </p>
                      <p className="pl-4 font-mono bg-white p-1 rounded border border-slate-100">
                        TI = (N° Enfermedades Ocupacionales x 1,000) / N°
                        Trabajadores Expuestos
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Section: Equipment Details */}
            {type === "equipment" && (
              <section>
                <h3 className="text-md font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">
                  2. Entrega de Equipos de Seguridad
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Tipo de Equipo
                    </label>
                    <select
                      name="equipmentType"
                      value={formData.equipmentType || "EPP"}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    >
                      <option value="EPP">EPP</option>
                      <option value="Emergencia">Equipo de Emergencia</option>
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nombre del Equipo/EPP
                    </label>
                    <input
                      type="text"
                      name="equipmentNames"
                      value={formData.equipmentNames || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Entregado Por (Nombre)
                    </label>
                    <input
                      type="text"
                      name="deliveredBy"
                      value={formData.deliveredBy || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Firma del Entregador
                    </label>
                    <div className="flex flex-col items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                      {formData.delivererSignatureUrl ? (
                        <img
                          src={formData.delivererSignatureUrl}
                          alt="Firma Entregador"
                          className="h-12 object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-xs text-slate-400 italic">
                          Sin firma
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setIsSigning({ type: "deliverer", index: 0 })
                        }
                        className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100 transition-colors w-full"
                      >
                        {formData.delivererSignatureUrl
                          ? "Cambiar Firma"
                          : "Firmar"}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Section: Training Details */}
            {type === "training" && (
              <section>
                <h3 className="text-md font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">
                  2. Datos de la Capacitación/Inducción
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Tipo de Capacitación
                    </label>
                    <select
                      name="trainingType"
                      value={formData.trainingType || "Capacitación"}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="Inducción">Inducción</option>
                      <option value="Capacitación">Capacitación</option>
                      <option value="Entrenamiento">Entrenamiento</option>
                      <option value="Simulacro">Simulacro</option>
                      <option value="Charla">Charla de 5 minutos</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Fecha
                    </label>
                    <input
                      type="date"
                      name="trainingDate"
                      value={formData.trainingDate || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Tema
                    </label>
                    <input
                      type="text"
                      name="trainingTopic"
                      value={formData.trainingTopic || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      N° Horas
                    </label>
                    <input
                      type="number"
                      name="trainingHours"
                      value={formData.trainingHours || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nombre del Capacitador
                    </label>
                    <input
                      type="text"
                      name="trainerName"
                      value={formData.trainerName || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Firma del Capacitador
                    </label>
                    <div className="flex flex-col items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                      {formData.trainerSignatureUrl ? (
                        <img
                          src={formData.trainerSignatureUrl}
                          alt="Firma Capacitador"
                          className="h-12 object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-xs text-slate-400 italic">
                          Sin firma
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setIsSigning({ type: "trainer", index: 0 })
                        }
                        className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100 transition-colors w-full"
                      >
                        {formData.trainerSignatureUrl
                          ? "Cambiar Firma"
                          : "Firmar"}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Section: Audit Details */}
            {type === "audit" && (
              <section className="space-y-6">
                <h3 className="text-md font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">
                  2. Datos de la Auditoría
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nombre del Auditor(es)
                    </label>
                    <input
                      type="text"
                      name="auditorName"
                      value={formData.auditorName || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      N° Registro del Auditor
                    </label>
                    <input
                      type="text"
                      name="auditorRegistrationNumber"
                      value={formData.auditorRegistrationNumber || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Fecha Inicio
                    </label>
                    <input
                      type="date"
                      name="auditStartDate"
                      value={formData.auditStartDate || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Fecha Fin
                    </label>
                    <input
                      type="date"
                      name="auditEndDate"
                      value={formData.auditEndDate || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Alcance de la Auditoría
                    </label>
                    <input
                      type="text"
                      name="auditScope"
                      value={formData.auditScope || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Procesos Auditados
                    </label>
                    <input
                      type="text"
                      name="auditedProcesses"
                      value={formData.auditedProcesses || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Responsables de los Procesos Auditados
                    </label>
                    <input
                      type="text"
                      name="auditedProcessesResponsible"
                      value={formData.auditedProcessesResponsible || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      N° de No Conformidades
                    </label>
                    <input
                      type="number"
                      name="nonConformitiesCount"
                      value={formData.nonConformitiesCount || 0}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Conclusiones de la Auditoría
                    </label>
                    <textarea
                      name="auditConclusions"
                      value={formData.auditConclusions || ""}
                      onChange={handleChange}
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Section 4/5: Corrective Measures */}
            {[
              "accident",
              "disease",
              "incident",
              "monitoring",
              "inspection",
              "audit",
            ].includes(type) && (
              <section>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-4">
                  <h3 className="text-md font-semibold text-slate-800">
                    {type === "audit"
                      ? "4. Plan de Acción para Cierre de No Conformidades"
                      : "4. Medidas Correctivas"}
                  </h3>
                  <button
                    type="button"
                    onClick={addCorrectiveMeasure}
                    className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    {type === "audit"
                      ? "+ Agregar No Conformidad"
                      : "+ Agregar Medida"}
                  </button>
                </div>

                <div className="space-y-4">
                  {(formData.correctiveMeasures || []).map((measure, index) => (
                    <div
                      key={index}
                      className="p-4 bg-slate-50 rounded-xl border border-slate-200 relative"
                    >
                      <button
                        type="button"
                        onClick={() => removeCorrectiveMeasure(index)}
                        className="absolute top-2 right-2 text-slate-400 hover:text-red-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-3">
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            {type === "audit"
                              ? "Descripción de la No Conformidad"
                              : "Descripción de la Medida"}
                          </label>
                          <textarea
                            value={measure.description}
                            onChange={(e) =>
                              handleCorrectiveMeasureChange(
                                index,
                                "description",
                                e.target.value,
                              )
                            }
                            rows={2}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                          />
                        </div>
                        {type === "audit" && (
                          <>
                            <div className="md:col-span-3">
                              <label className="block text-sm font-medium text-slate-700 mb-1">
                                Causas que originaron la No Conformidad
                              </label>
                              <textarea
                                value={measure.causes}
                                onChange={(e) =>
                                  handleCorrectiveMeasureChange(
                                    index,
                                    "causes",
                                    e.target.value,
                                  )
                                }
                                rows={2}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                              />
                            </div>
                            <div className="md:col-span-3">
                              <label className="block text-sm font-medium text-slate-700 mb-1">
                                Medidas Correctivas
                              </label>
                              <textarea
                                value={measure.measure}
                                onChange={(e) =>
                                  handleCorrectiveMeasureChange(
                                    index,
                                    "measure",
                                    e.target.value,
                                  )
                                }
                                rows={2}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                              />
                            </div>
                          </>
                        )}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Responsable
                          </label>
                          <input
                            type="text"
                            value={measure.responsible}
                            onChange={(e) =>
                              handleCorrectiveMeasureChange(
                                index,
                                "responsible",
                                e.target.value,
                              )
                            }
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                          />
                        </div>
                        <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="md:col-span-1">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Día
                            </label>
                            <input
                              type="text"
                              value={measure.executionDay}
                              onChange={(e) =>
                                handleCorrectiveMeasureChange(
                                  index,
                                  "executionDay",
                                  e.target.value,
                                )
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                              placeholder="DD"
                            />
                          </div>
                          <div className="md:col-span-1">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Mes
                            </label>
                            <input
                              type="text"
                              value={measure.executionMonth}
                              onChange={(e) =>
                                handleCorrectiveMeasureChange(
                                  index,
                                  "executionMonth",
                                  e.target.value,
                                )
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                              placeholder="MM"
                            />
                          </div>
                          <div className="md:col-span-1">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Año
                            </label>
                            <input
                              type="text"
                              value={measure.executionYear}
                              onChange={(e) =>
                                handleCorrectiveMeasureChange(
                                  index,
                                  "executionYear",
                                  e.target.value,
                                )
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                              placeholder="AAAA"
                            />
                          </div>
                          <div className="md:col-span-1">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Estado
                            </label>
                            <select
                              value={measure.status}
                              onChange={(e) =>
                                handleCorrectiveMeasureChange(
                                  index,
                                  "status",
                                  e.target.value as any,
                                )
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                            >
                              <option value="pendiente">Pendiente</option>
                              <option value="en ejecución">En ejecución</option>
                              <option value="realizada">Realizada</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(formData.correctiveMeasures || []).length === 0 && (
                    <p className="text-sm text-slate-500 italic text-center py-4">
                      {type === "audit"
                        ? "No hay no conformidades registradas."
                        : "No hay medidas correctivas registradas."}
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* Section: Workers List (for Training and Equipment) */}
            {(type === "training" || type === "equipment") && (
              <section>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-4">
                  <h3 className="text-md font-semibold text-slate-800">
                    Lista de Trabajadores
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({
                        ...prev,
                        workers: [
                          ...(prev.workers || []),
                          {
                            name: "",
                            dni: "",
                            area: "",
                            signatureUrl: "",
                            deliveryDate: "",
                            renewalDate: "",
                          },
                        ],
                      }));
                    }}
                    className="flex items-center gap-2 text-sm bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-all shadow-sm active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar Trabajador
                  </button>
                </div>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-700 uppercase text-[10px] font-bold tracking-wider">
                      <tr>
                        <th className="px-4 py-3 border-b border-slate-200">
                          Nombre Completo
                        </th>
                        <th className="px-4 py-3 border-b border-slate-200">
                          DNI / CE
                        </th>
                        <th className="px-4 py-3 border-b border-slate-200">
                          Área / Puesto
                        </th>
                        <th className="px-4 py-3 border-b border-slate-200 text-center">
                          Firma del Trabajador
                        </th>
                        {type === "equipment" && (
                          <>
                            <th className="px-4 py-3 border-b border-slate-200">
                              F. Entrega
                            </th>
                            <th className="px-4 py-3 border-b border-slate-200">
                              F. Renovación
                            </th>
                          </>
                        )}
                        <th className="px-4 py-3 border-b border-slate-200 text-center">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {(formData.workers || []).map(
                        (worker: any, index: number) => (
                          <tr
                            key={index}
                            className="hover:bg-slate-50 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                placeholder="Ej: Juan Pérez"
                                value={worker.name}
                                onChange={(e) => {
                                  const newWorkers = [...formData.workers];
                                  newWorkers[index].name = e.target.value;
                                  setFormData({
                                    ...formData,
                                    workers: newWorkers,
                                  });
                                }}
                                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                placeholder="DNI"
                                value={worker.dni}
                                onChange={(e) => {
                                  const newWorkers = [...formData.workers];
                                  newWorkers[index].dni = e.target.value;
                                  setFormData({
                                    ...formData,
                                    workers: newWorkers,
                                  });
                                }}
                                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                placeholder="Área"
                                value={worker.area}
                                onChange={(e) => {
                                  const newWorkers = [...formData.workers];
                                  newWorkers[index].area = e.target.value;
                                  setFormData({
                                    ...formData,
                                    workers: newWorkers,
                                  });
                                }}
                                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col items-center gap-2">
                                {worker.signatureUrl ? (
                                  <div className="bg-white border border-slate-200 rounded p-1 shadow-sm">
                                    <img
                                      src={worker.signatureUrl}
                                      alt="Firma"
                                      className="h-10 object-contain"
                                      referrerPolicy="no-referrer"
                                    />
                                    {worker.signedByEmail && (
                                      <div
                                        className="text-[8px] text-slate-400 text-center truncate w-full"
                                        title={worker.signedByEmail}
                                      >
                                        {worker.signedByEmail}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="w-20 h-10 border border-dashed border-slate-300 rounded flex items-center justify-center bg-slate-50">
                                    <span className="text-[10px] text-slate-400 italic">
                                      Pendiente
                                    </span>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setIsSigning({ type: "worker", index })
                                  }
                                  className={`flex items-center justify-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg transition-all ${
                                    worker.signatureUrl
                                      ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                      : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-95"
                                  }`}
                                >
                                  <PenTool className="w-3.5 h-3.5" />
                                  {worker.signatureUrl
                                    ? "Cambiar Firma"
                                    : "Firmar Aquí"}
                                </button>
                              </div>
                            </td>
                            {type === "equipment" && (
                              <>
                                <td className="px-4 py-2">
                                  <input
                                    type="date"
                                    value={worker.deliveryDate || ""}
                                    onChange={(e) => {
                                      const newWorkers = [...formData.workers];
                                      newWorkers[index].deliveryDate =
                                        e.target.value;
                                      setFormData({
                                        ...formData,
                                        workers: newWorkers,
                                      });
                                    }}
                                    className="w-full px-2 py-1 border border-slate-300 rounded"
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <input
                                    type="date"
                                    value={worker.renewalDate || ""}
                                    onChange={(e) => {
                                      const newWorkers = [...formData.workers];
                                      newWorkers[index].renewalDate =
                                        e.target.value;
                                      setFormData({
                                        ...formData,
                                        workers: newWorkers,
                                      });
                                    }}
                                    className="w-full px-2 py-1 border border-slate-300 rounded"
                                  />
                                </td>
                              </>
                            )}
                            <td className="px-4 py-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const newWorkers = formData.workers.filter(
                                    (_: any, i: number) => i !== index,
                                  );
                                  setFormData({
                                    ...formData,
                                    workers: newWorkers,
                                  });
                                }}
                                className="text-red-500 hover:text-red-700"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                  {(formData.workers || []).length === 0 && (
                    <p className="text-sm text-slate-500 italic text-center py-4">
                      No hay trabajadores registrados.
                    </p>
                  )}
                </div>
              </section>
            )}
            {[
              "accident",
              "disease",
              "incident",
              "medical_exam",
              "monitoring",
              "inspection",
              "statistics",
              "equipment",
              "training",
              "audit",
            ].includes(type) && (
              <section>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-4">
                  <h3 className="text-md font-semibold text-slate-800">
                    5. Responsables del Registro y de la Investigación
                  </h3>
                  <button
                    type="button"
                    onClick={addResponsible}
                    className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    + Agregar Responsable
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {(formData.responsibles || []).length === 0 ? (
                    <div className="md:col-span-2 py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                      <p className="text-sm text-slate-500 italic">
                        No hay responsables registrados.
                      </p>
                      <button
                        type="button"
                        onClick={addResponsible}
                        className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        + Agregar el primer responsable
                      </button>
                    </div>
                  ) : (
                    (formData.responsibles || []).map((resp, index) => (
                      <div
                        key={index}
                        className="p-4 bg-slate-50 rounded-xl border border-slate-200 relative"
                      >
                        <button
                          type="button"
                          onClick={() => removeResponsible(index)}
                          className="absolute top-2 right-2 text-slate-400 hover:text-red-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <h4 className="text-sm font-bold text-slate-700 mb-3">
                          Responsable {index + 1}
                        </h4>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Nombre
                            </label>
                            <input
                              type="text"
                              value={resp.name}
                              onChange={(e) =>
                                handleResponsibleChange(
                                  index,
                                  "name",
                                  e.target.value,
                                )
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Cargo
                            </label>
                            <input
                              type="text"
                              value={resp.position}
                              onChange={(e) =>
                                handleResponsibleChange(
                                  index,
                                  "position",
                                  e.target.value,
                                )
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Fecha
                            </label>
                            <input
                              type="date"
                              value={resp.date}
                              onChange={(e) =>
                                handleResponsibleChange(
                                  index,
                                  "date",
                                  e.target.value,
                                )
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              required
                            />
                          </div>
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() =>
                                setIsSigning({ type: "responsible", index })
                              }
                              className="flex items-center gap-2 text-sm bg-blue-50 text-blue-600 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors w-full justify-center"
                            >
                              <PenTool className="w-4 h-4" />
                              {resp.signatureUrl
                                ? "Cambiar Firma"
                                : "Firmar Digitalmente"}
                            </button>
                            {resp.signatureUrl && (
                              <div className="mt-2 p-2 bg-white border border-slate-200 rounded-lg flex flex-col items-center">
                                <img
                                  src={resp.signatureUrl}
                                  alt="Firma"
                                  className="h-12 object-contain"
                                  referrerPolicy="no-referrer"
                                />
                                {resp.signedByEmail && (
                                  <span className="text-[10px] text-slate-400 mt-1">
                                    {resp.signedByEmail}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}
          </form>
        </div>

        {/* Signature Modal */}
        {isSigning !== null && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800">
                  Firma Electrónica
                </h3>
                <button
                  onClick={() => setIsSigning(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6">
                <div className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 overflow-hidden">
                  <SignatureCanvas
                    ref={sigPad}
                    penColor="black"
                    canvasProps={{
                      className:
                        "signature-canvas w-full h-64 cursor-crosshair",
                    }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2 text-center">
                  Use el mouse o su dedo para firmar arriba
                </p>
              </div>
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-between gap-3">
                <button
                  onClick={clearSignature}
                  className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Limpiar
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsSigning(null)}
                    className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveSignature}
                    className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
                  >
                    Aceptar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end items-center space-x-3">
          {initialData && (
            <button
              type="button"
              onClick={() => generateLegalRegisterPDF(formData)}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center mr-auto"
            >
              <Download className="w-4 h-4 mr-2" />
              Descargar PDF
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="legal-register-form"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Guardar Registro Legal
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
