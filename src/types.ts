export type Role = "employer" | "worker" | "supervisor" | "super_admin" | "gerencia";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  dni?: string;
  birthDate?: string; // YYYY-MM-DD
  gender?: "M" | "F" | "";
  contractType?: string;
  status?: "active" | "blocked" | "cesado";
  phoneNumber?: string;
  department?: string;
  position?: string;
  businessName?: string;
  ruc?: string;
  companyRuc?: string; // Added for multi-company isolation
  isTrustedPersonnel?: boolean; // Added for SST voting exclusion
  savedSignatureUrl?: string; // Option 6: Saved signature in profile
  digitalSignatureConsent?: {
    consentedAt: any;
    ip?: string;
    userAgent?: string;
    signatureUrl?: string;
  };
  economicActivity?: string;
  address?: string;
  totalWorkers?: number;
  
  // Vehicular information
  hasVehicle?: boolean;
  vehicleType?: "car" | "motorcycle" | "truck" | "other" | "";
  vehiclePlate?: string;
  licenseFileUrl?: string;
  licenseExpiryDate?: string;
  soatFileUrl?: string;
  soatExpiryDate?: string;

  createdAt: any; // Firestore Timestamp
}

export type PostType = "news" | "flyer" | "notice";
export type ReactionType = "like" | "love" | "dislike";

export interface Comment {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: any; // Firestore Timestamp
}

export interface Post {
  id?: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  type: PostType;
  reactions?: Record<string, ReactionType>; // uid -> reaction
  comments?: Comment[];
  attachmentUrl?: string;
  attachmentName?: string;
  readBy?: string[]; // Array of userIds who have confirmed reading
  companyRuc: string; // Added for multi-company isolation
  createdAt: any; // Firestore Timestamp
}

export interface DocumentSignature {
  userId: string;
  userName: string;
  userDni?: string;
  userEmail?: string; // Digital Signature Traceability
  signatureUrl: string;
  signatureBase64?: string;
  timestamp: any; // Firestore Timestamp
}

export interface SSTDocument {
  id?: string;
  title: string;
  description: string;
  url: string;
  fileName?: string;
  uploadedBy: string;
  requiresSignature?: boolean;
  signatures?: DocumentSignature[];
  companyRuc: string; // Added for multi-company isolation
  createdAt: any; // Firestore Timestamp
  category?: string; // e.g., 'Política y Objetivos SST', 'Otros Documentos'
  targetArea?: string; // e.g., 'Todas', 'Ventas', 'Operaciones'
  version?: string;
  status?: "Vigente" | "Obsoleto";
}

export interface EppItem {
  id?: string;
  name: string;
  description: string;
  estimatedLifeMonths: number;
  stock: number; // Added stock
  companyRuc: string;
  photoUrl?: string;
  createdAt?: any;
}

export interface EppDeliveryItem {
  eppId: string;
  name: string;
  quantity: number;
  reason:
    | "Primera entrega"
    | "Renovación por desgaste"
    | "Pérdida"
    | "Cambio de puesto"
    | "Otro";
}

export interface EppDelivery {
  id?: string;
  companyRuc: string;
  workerId?: string;
  workerName: string;
  workerDni: string;
  items: EppDeliveryItem[];
  signature: string; // the base64 or URL
  deliveryDate: any; // Firestore Timestamp
  supervisorId?: string;
  supervisorName?: string;
  supervisorDni?: string;
  supervisorSignatureUrl?: string;
  notes?: string;
  status?: "pending" | "signed" | "pending_signature" | "completed";
  createdAt?: any;
}

export interface HealthCard {
  id?: string;
  workerId?: string;
  workerName: string;
  workerDni?: string;
  issueDate: string; // YYYY-MM-DD
  expirationDate: string; // YYYY-MM-DD
  photoUrl: string;
  companyRuc: string;
  createdAt: any; // Firestore Timestamp
}

export interface MedicalExam {
  id?: string;
  workerId?: string;
  workerName: string;
  workerDni?: string;
  examDate: string; // YYYY-MM-DD
  nextExamDate: string; // YYYY-MM-DD
  result: "apto" | "apto_con_restricciones" | "no_apto";
  restrictions?: string; // Add restrictions field
  recommendations?: string; // Add recommendations field
  photoUrl: string;
  companyRuc: string;
  workerSignatureUrl?: string; // Signature for EMO delivery
  signedAt?: any; // Firestore Timestamp
  status?: "pending_signature" | "signed";
  createdAt: any; // Firestore Timestamp
}

export type ReportType =
  | "accident"
  | "incident"
  | "unsafe_act"
  | "unsafe_condition";
export type ReportStatus = "pending" | "reviewed";

export interface SSTStatistic {
  id?: string;
  companyRuc: string;
  year: number;
  month: number;
  hht: number; // Horas Hombre Trabajadas
  accidentsWithLeave: number; // N° Accidentes incapacitantes / con descanso
  lostDays: number; // Días perdidos
  if: number; // Índice de Frecuencia
  ig: number; // Índice de Gravedad
  ia: number; // Índice de Accidentabilidad
  createdAt: any;
  createdBy: string;
}

export interface InductionChecklistItem {
  id: string;
  topic: string;
  status: "si" | "no" | "na";
  observations?: string;
}

export interface Induction {
  id?: string;
  companyRuc: string;
  workerId?: string;
  workerName: string;
  workerDni: string;
  workerPosition: string;
  date: string;
  
  // Detailed Checklist
  checklist: InductionChecklistItem[];

  // Legacy Checklists (keep for backward compatibility or remove if not needed, I will keep them but optional)
  receivedRisst?: boolean;
  receivedIperc?: boolean;
  receivedMap?: boolean;
  receivedPolicy?: boolean;
  receivedEmergencyPlan?: boolean;

  trainerName: string;
  signatureBase64?: string; // Legacy worker signature
  workerSignatureUrl?: string; // New worker signature
  supervisorId?: string;
  supervisorName?: string;
  supervisorDni?: string;
  supervisorSignatureUrl?: string;
  status?: "pending_supervisor" | "pending_worker" | "signed" | "completed";
  
  createdAt: any;
  createdBy: string;
}

export type MandatoryRegisterType =
  | "accident"
  | "disease"
  | "incident"
  | "medical_exam"
  | "monitoring"
  | "inspection"
  | "statistics"
  | "equipment"
  | "training"
  | "audit";

export interface Investigation {
  methodology: "5whys" | "ishikawa" | "icam" | "fault_tree";
  activityPerformed: string;
  consequences: string;
  summary: string;
  development: string;
  methodologyData?: any;
  immediateCauses: string[];
  basicCauses: string[];
  correctiveMeasures: string[];
  preventiveMeasures: string[];
  recommendations: string[];
  conductedBy: string;
  conductedByName: string;
  conductedAt: any; // Firestore Timestamp
}

export interface CorrectiveMeasure {
  description: string;
  causes?: string;
  measure?: string;
  responsible: string;
  executionDay: string;
  executionMonth: string;
  executionYear: string;
  status: "realizada" | "pendiente" | "en ejecución";
}

export interface RegisterResponsible {
  name: string;
  position: string;
  date: string;
  signatureUrl?: string;
  signedAt?: any; // Firestore Timestamp for Digital Signature Traceability
  signedByEmail?: string; // Digital Signature Traceability
}

export interface BaseLegalRegister {
  id?: string;
  registerNumber: string;
  // Datos del Empleador Principal
  businessName: string;
  ruc: string;
  address: string;
  economicActivity: string;
  totalWorkers: number;
  sctrAffiliated?: number;
  sctrNotAffiliated?: number;
  insuranceName?: string;
  isHighRisk: boolean;

  // Datos del Empleador de Intermediación
  isIntermediation: boolean;
  interBusinessName?: string;
  interRuc?: string;
  interAddress?: string;
  interEconomicActivity?: string;
  interTotalWorkers?: number;
  interSctrAffiliated?: number;
  interSctrNotAffiliated?: number;
  interInsuranceName?: string;

  // Responsables
  responsibles: RegisterResponsible[];

  // Metadata
  completedBy: string;
  completedByName: string;
  completedAt: any;
  type: MandatoryRegisterType;
  correctiveMeasures?: CorrectiveMeasure[];
}

export interface AccidentRegister extends BaseLegalRegister {
  type: "accident";

  // Datos del Trabajador
  workerName: string;
  workerDocument: string;
  workerAge: number;
  workerArea: string;
  workerPosition: string;
  workerSeniority: string;
  workerGender: "M" | "F" | "";
  workerShift: "D" | "T" | "N" | "";
  workerContractType: string;
  workerExperience: string;
  hoursWorkedBeforeAccident: number;

  // Investigación del Accidente
  accidentDate: string;
  accidentTime: string;
  investigationStartDate: string;
  exactLocation: string;
  accidentGravity: "Leve" | "Incapacitante" | "Mortal" | "";
  incapacityDegree?:
    | "Total Temporal"
    | "Parcial Temporal"
    | "Parcial Permanente"
    | "Total Permanente"
    | "";
  medicalRestDays: number;
  affectedWorkersCount: number;
  witnessesCount: number;
  injuredBodyPart: string;
  accidentDescription: string;
  causesDescription: string;

  // Medidas Correctivas
  correctiveMeasures: CorrectiveMeasure[];
}

export interface DiseaseRegister extends BaseLegalRegister {
  type: "disease";
  startYear: string;
  productionLines: string;

  interStartYear?: string;
  interProductionLines?: string;

  // Datos referentes a la enfermedad
  agentType:
    | "Físico"
    | "Químico"
    | "Biológico"
    | "Disergonómico"
    | "Psicosocial";
  specificAgent: string;
  monthlyCases: number[]; // Array of 12 numbers for E, F, M, A, M, J, J, A, S, O, N, D
  diseaseName: string;
  affectedBodyPart: string;
  affectedWorkersCount: number;
  areas: string;
  positionChangesCount: number;

  // Detalle causas
  causesDetail: string;
  causesUrl?: string;
  causesName?: string;
  workDescription: string;

  // Sustancias cancerígenas
  carcinogenicSubstances?: string;
  hasAgentMonitoring?: boolean;

  // Medidas Correctivas
  correctiveMeasures: CorrectiveMeasure[];
}

export interface IncidentRegister extends BaseLegalRegister {
  type: "incident";
  // Datos del Trabajador
  workerName?: string;
  workerDocument?: string;
  workerAge?: number;
  workerArea?: string;
  workerPosition?: string;
  workerSeniority?: string;
  workerGender?: "M" | "F" | "";
  workerShift?: "D" | "T" | "N" | "";
  workerContractType?: string;
  workerExperience?: string;
  hoursWorkedBeforeIncident?: number;

  // Investigación
  incidentType: "Incidente Peligroso" | "Incidente";
  potentiallyAffectedWorkers?: number;
  potentiallyAffectedPopulation?: number;
  firstAidDetail?: string;
  incidentDate: string;
  incidentTime: string;
  investigationStartDate: string;
  witnessesCount?: number;
  exactLocation: string;
  incidentDescription: string;
  causesDescription: string;

  // Medidas Correctivas
  correctiveMeasures: CorrectiveMeasure[];
}

export interface MedicalExamRegister extends BaseLegalRegister {
  type: "medical_exam";
  workerName: string;
  workerDocument: string;
  workerAge: number;
  workerArea: string;
  workerPosition: string;
  workerGender: "M" | "F" | "";
  examDate: string;
  examType: "Pre-ocupacional" | "Periódico" | "Retiro" | "Otros";
  medicalCenter: string;
  examResult: "Apto" | "Apto con restricciones" | "No apto";
  recommendations: string;
  correctiveMeasures: CorrectiveMeasure[];
  certificateUrl?: string;
  certificateName?: string;
}

export interface MonitoringRegister extends BaseLegalRegister {
  type: "monitoring";
  monitoredArea: string;
  monitoringDate: string;
  riskType: string; // Físico, Químico, etc.
  agentMonitored: string;
  hasMonitoringProgram: boolean;
  frequency: string;
  exposedWorkersCount: number;
  monitoringOrganization: string;
  results: string;
  deviationsCauses: string;
  conclusions: string;
  correctiveMeasures: CorrectiveMeasure[];
  programUrl?: string;
  programName?: string;
  reportUrl?: string;
  reportName?: string;
  calibrationUrl?: string;
  calibrationName?: string;
}

export interface InspectionRegister extends BaseLegalRegister {
  type: "inspection";
  inspectedArea: string;
  inspectionDate: string;
  inspectionTime: string;
  inspectedAreaResponsible: string;
  inspectionResponsible: string;
  inspectionType: "Planeada" | "No planeada" | "Otro";
  inspectionTypeDetail?: string;
  objective: string;
  result: string;
  unfavorableResultsCauses: string;
  conclusions: string;
  correctiveMeasures: CorrectiveMeasure[];
}

export interface MonthlyStatistic {
  statisticsMonth: string;
  fatalAccidentsCount: number;
  fatalAccidentsArea?: string;
  incapacitatingAccidentsCount: number;
  incapacitatingAccidentsArea?: string;
  slightAccidentsCount: number;
  slightAccidentsArea?: string;
  lostDays: number;
  frequencyIndex: number;
  severityIndex: number;
  accidentabilityIndex: number;
  occupationalDiseasesCount: number;
  occupationalDiseasesArea?: string;
  exposedWorkersCount?: number;
  incidenceRate?: number;
  occupationalCancerCount?: number;
  dangerousIncidentsCount: number;
  dangerousIncidentsArea?: string;
  incidentsCount: number;
  incidentsArea?: string;
}

export interface StatisticsRegister extends BaseLegalRegister {
  type: "statistics";
  year: string;
  monthlyStats: MonthlyStatistic[];
  resultsDescription: string;
  deviationsAnalysis: string;
  conclusions: string;
}

export interface EquipmentWorker {
  name: string;
  dni: string;
  area: string;
  deliveryDate: string;
  renewalDate: string;
  signatureUrl?: string;
  signedAt?: any; // Firestore Timestamp
  signedByEmail?: string;
}

export interface EquipmentRegister extends BaseLegalRegister {
  type: "equipment";
  equipmentType: "EPP" | "Emergencia";
  equipmentNames: string;
  workers: EquipmentWorker[];
}

export interface TrainingWorker {
  name: string;
  dni: string;
  area: string;
  signatureUrl?: string;
  signedAt?: any; // Firestore Timestamp
  signedByEmail?: string;
  observations?: string;
}

export interface TrainingRegister extends BaseLegalRegister {
  type: "training";
  trainingType: "Inducción" | "Capacitación" | "Entrenamiento" | "Simulacro";
  topic: string;
  date: string;
  trainerName: string;
  hours: number;
  workers: TrainingWorker[];
}

export interface AuditActionPlan {
  description: string;
  causes: string;
  correctiveMeasure: string;
  responsible: string;
  executionDate: string;
  status: "realizada" | "pendiente" | "en ejecución";
}

export interface AuditRegister extends BaseLegalRegister {
  type: "audit";
  auditorName: string;
  auditorRegistrationNumber: string;
  auditStartDate: string;
  auditEndDate: string;
  auditedProcesses: string;
  auditedProcessesResponsible: string;
  auditScope: string;
  auditConclusions: string;
  nonConformitiesCount: number;
}

export type LegalRegister =
  | AccidentRegister
  | DiseaseRegister
  | IncidentRegister
  | MedicalExamRegister
  | MonitoringRegister
  | InspectionRegister
  | StatisticsRegister
  | EquipmentRegister
  | TrainingRegister
  | AuditRegister;

export interface Company {
  id?: string;
  businessName: string;
  ruc: string;
  address: string;
  economicActivity: string;
  createdAt: any; // Firestore Timestamp
  areas?: string[]; // Array of predefined areas/departments
  logoUrl?: string; // Custom logo; falls back to the bundled brand logo
  brandHue?: number; // 0-360 hue used for the company theme
}

export interface CompanySettings {
  id?: string;
  businessName: string;
  ruc: string;
  address: string;
  economicActivity: string;
  totalWorkers: number;
  highRiskActivity: boolean;
  sctrAffiliated: number;
  sctrNotAffiliated: number;
  insuranceName: string;

  isIntermediation: boolean;
  interBusinessName?: string;
  interRuc?: string;
  interAddress?: string;
  interEconomicActivity?: string;
  interTotalWorkers?: number;
  interHighRiskActivity?: boolean;
  interSctrAffiliated?: number;
  interSctrNotAffiliated?: number;
  interInsuranceName?: string;
}

export interface Report {
  id?: string;
  type: ReportType;
  description: string;
  location: string;
  date: string; // YYYY-MM-DD
  reportedBy: string;
  reportedByName: string;
  status: ReportStatus;
  attachmentUrl?: string; // Legacy
  attachmentName?: string; // Legacy
  attachmentUrls?: { url: string; name: string; type: string }[]; // New multiple attachments
  attachments?: { url: string; name: string; type: string }[];
  comments?: Comment[];
  investigation?: Investigation;
  legalRegister?: LegalRegister;
  equipmentId?: string; // Links report to a specific equipment
  companyRuc: string; // Added for multi-company isolation
  createdAt: any; // Firestore Timestamp
}

export interface Equipment {
  id?: string;
  companyRuc: string;
  name: string; // Used as the generic name, e.g., 'Extintor CO2', 'Luz de Emergencia'
  codigoInterno?: string; // Used for the physical tag/QR code, e.g., 'IH-P3-CO2-02'
  type: string; // e.g., 'Extintor', 'Botiquín', 'Maquinaria', 'Vehículo'
  location?: string;
  sede?: string;
  area?: string;
  controls?: { id: string; name: string; date: string }[];
  description?: string;
  inspectionTemplateId?: string; // Associated inspection template
  expirationDate?: string; // e.g. for extinguishers
  hydrostaticTestDate?: string; // e.g. for extinguishers
  code?: string;
  status?: "operative" | "inoperative";
  checklistItems?: { question: string; isCritical: boolean }[];
  createdAt: any; // Firestore Timestamp
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  correctOptionIndex: number;
}

export interface Quiz {
  questions: QuizQuestion[];
  passingScore: number;
}

export interface TrainingCompletion {
  userId: string;
  userName: string;
  userDni?: string;
  userEmail?: string; // Digital Signature Traceability
  signatureUrl: string; // URL to the signature image
  signatureBase64?: string;
  completedAt: any; // Firestore Timestamp
  score?: number;
  passed?: boolean;
}

export interface Training {
  id?: string;
  title: string;
  description: string;
  videoUrl?: string;
  materialUrl?: string;
  materialName?: string;
  createdBy: string;
  completedBy?: string[]; // Array of UIDs for quick checking
  completions?: TrainingCompletion[]; // Detailed completion info
  companyRuc: string; // Added for multi-company isolation
  createdAt: any; // Firestore Timestamp
  quiz?: Quiz;
  targetArea?: string; // e.g., 'Todas', 'Ventas', 'Operaciones'
  dueDate?: any; // Firestore Timestamp for deadline
  category?: string; // Type/Category of training
  validityMonths?: number; // How many months the training is valid for
  status?: "active" | "archived";
}

export interface Notification {
  id?: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  link?: string;
  targetId?: string;
  companyRuc?: string;
  createdAt: any; // Firestore Timestamp
}

export interface AnnualActivity {
  id?: string;
  title: string;
  description?: string;
  category?:
    | "Capacitación"
    | "Inspección"
    | "Auditoría"
    | "Simulacro"
    | "Reunión"
    | "Otro";
  evidenceUrl?: string;
  month: number; // 1-12
  date?: string; // YYYY-MM-DD
  responsibleId: string;
  responsibleName: string;
  status: "pending" | "in_progress" | "completed";
  companyRuc: string;
  createdAt: any;
}

export interface ElectionCandidate {
  userId: string;
  votes: number;
  postulationDate?: string;
  dniFileUrl?: string;
  credentialFileUrl?: string;
  name?: string;
  department?: string;
  position?: string;
  isTachado?: boolean;
  physicalVotes?: number;
}

export interface CommitteeElection {
  digitalBlankVotes?: number;
  digitalNullVotes?: number;
  committeeType?: "sst" | "hostigamiento";
  id?: string;
  title: string;
  status: "convocatoria" | "inscripcion" | "tachas" | "aptos" | "votacion" | "finalizada";
  startDate: string;
  endDate: string;
  candidates: ElectionCandidate[];
  voters: string[];
  companyRuc: string;
  createdAt: any;
  titularesCount?: number;
  blankPhysicalVotes?: number;
  nullPhysicalVotes?: number;
  suplentesCount?: number;
  electoralBoard?: {
    president: string | { id: string; name: string; };
    secretary: string | { id: string; name: string; };
    vocal1: string | { id: string; name: string; };
    vocal2?: string | { id: string; name: string; };
  };
  employerRepresentatives?: {
    userId: string;
    name: string;
    role: "titular" | "suplente";
  }[];
}

export interface CommitteeAgreement {
  id: string;
  task: string;
  responsibleId: string;
  responsibleName: string;
  deadline: string; // YYYY-MM-DD
  status: "pending" | "in_progress" | "completed";
}

export interface CommitteeMeeting {
  id?: string;
  meetingNumber?: string; // Acta N°
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  location?: string;
  type: "ordinaria" | "extraordinaria";
  agenda?: string;
  development?: string;
  anexos?: string; // Desarrollo de la reunión
  attendees: string[]; // User IDs
  employerAttendees?: string[];
  workerAttendees?: string[];
  agreements: CommitteeAgreement[];
  attachmentUrl?: string;
  attachmentName?: string;
  companyRuc: string;
  createdAt: any;
}

export type EmergencyType = "hospital" | "fire" | "police" | "internal";

export interface EmergencyContact {
  id?: string;
  name: string;
  phone: string;
  description?: string;
  type: EmergencyType;
  createdAt: any; // Firestore Timestamp
}

export type InspectionItemType =
  | "boolean"
  | "text"
  | "number"
  | "visual_pressure";

export interface InspectionItem {
  id: string;
  question: string;
  type: InspectionItemType;
  required: boolean;
}

export interface InspectionTemplate {
  id?: string;
  title: string;
  description: string;
  items: InspectionItem[];
  createdBy: string;
  companyRuc?: string;
  isGlobal?: boolean;
  createdAt: any; // Firestore Timestamp
}

export interface InspectionResultItem {
  itemId: string;
  question: string;
  answer: string | boolean | number;
  isIssue: boolean;
  comment?: string;
  photoUrl?: string; // Legacy
  photoFile?: File; // Legacy
  photos?: { url: string; name: string; type: string }[];
  photoFiles?: File[];
}

export interface Inspection {
  id?: string;
  templateId: string;
  templateTitle: string;
  workerId: string;
  workerName: string;
  workerDni?: string;
  workerEmail?: string; // Digital Signature Traceability
  equipmentId?: string;
  equipmentName?: string;
  results: InspectionResultItem[];
  signatureUrl: string;
  signatureBase64?: string;
  hasIssues: boolean;
  status: "pending_review" | "reviewed" | "pending_supervisor";
  supervisorId?: string;
  supervisorName?: string;
  supervisorDni?: string;
  supervisorSignatureUrl?: string;
  attachmentUrls?: { url: string; name: string; type: string }[]; // New multiple attachments
  companyRuc: string; // Added for multi-company isolation
  createdAt: any; // Firestore Timestamp
}

export interface Suggestion {
  id?: string;
  category: "safety" | "health" | "improvement" | "other";
  subject: string;
  description: string;
  isAnonymous: boolean;
  authorId?: string; // Optional if anonymous
  authorName?: string; // Optional if anonymous
  attachmentUrl?: string;
  status: "received" | "in_review" | "implemented" | "dismissed";
  adminComment?: string;
  companyRuc: string; // Added for multi-company isolation
  createdAt: any; // Firestore Timestamp
}

export interface CorrectiveAction {
  id?: string;
  companyRuc: string;
  sourceType: "inspection" | "report" | "preuse" | "manual" | "audit";
  sourceId?: string;
  description: string;
  assignedToUid: string;
  assignedToName: string;
  assignedByUid: string;
  deadline: any;
  status: "pending" | "resolved";
  resolutionNotes?: string;
  resolutionPhotoBeforeUrl?: string;
  resolutionPhotoAfterUrl?: string;
  createdAt: any;
  resolvedAt?: any;
}

export interface PreUseInspection {
  id?: string;
  companyRuc: string;
  equipmentId: string;
  equipmentName: string;
  equipmentCode: string;
  workerUid: string;
  workerName: string;
  workerDni?: string;
  date: any;
  items: {
    question: string;
    isOk: boolean;
    isCritical: boolean;
    comment?: string;
  }[];
  isOperative: boolean;
  signature?: string;
  supervisorId?: string;
  supervisorName?: string;
  supervisorDni?: string;
  supervisorSignatureUrl?: string;
  status?: "pending_supervisor" | "signed";
  attachmentUrls?: {
    url: string;
    name: string;
    type: "image" | "video";
  }[];
}

export interface MedicalLeave {
  id?: string;
  companyRuc: string;
  workerId?: string;
  workerName: string;
  workerDni: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  daysLost: number;
  cie10Code?: string;
  diagnosis: string;
  type:
    | "Enfermedad Común"
    | "Enfermedad Ocupacional"
    | "Accidente de Trabajo"
    | "Accidente Común"
    | "Maternidad"
    | "Paternidad"
    | "Otros";
  attachmentUrl?: string; // Evidencia / Certificado Médico
  attachmentName?: string;
  status: "Aprobado" | "Pendiente" | "Rechazado";
  notes?: string;
  recordedBy?: string;
  createdAt?: any;
}

// Risk Map Interfaces
export interface RiskMapIcon {
  id: string; 
  type: string; 
  x: number; 
  y: number; 
}

export interface RiskMap {
  id?: string;
  companyRuc: string;
  name: string;
  imageUrl: string; 
  icons: RiskMapIcon[];
  createdAt: any;
  updatedAt: any;
}

// Drills and Brigades Interfaces
export interface BrigadeMember {
  id?: string;
  companyRuc: string;
  uid: string;
  name: string;
  brigadeType: "Primeros Auxilios" | "Evacuación" | "Contra Incendios" | "Otra";
  role: "Líder" | "Miembro";
  contact: string;
}

export interface Drill {
  id?: string;
  companyRuc: string;
  title: string;
  date: any; // Timestamp
  type: "Sismo" | "Incendio" | "Evacuación Médica" | "Derrame" | "Otro";
  evacuationTimeSeconds: number;
  participantsCount: number;
  evaluation: string; 
  photos: { url: string; name: string; type: string }[];
  createdAt: any;
}

// Audits Interfaces
export interface AuditTemplateItem {
  question: string;
  category: string;
}

export interface AuditTemplate {
  id?: string;
  companyRuc: string; 
  name: string; 
  items: AuditTemplateItem[];
}

export interface AuditItemResult {
  question: string;
  category: string;
  compliant: "yes" | "no" | "n/a";
  findings?: string;
}

export interface Audit {
  id?: string;
  companyRuc: string;
  templateId: string;
  templateName: string;
  date: any;
  auditorUid: string;
  auditorName: string;
  score: number; 
  results: AuditItemResult[];
  status: "draft" | "completed";
  createdAt: any;
}

export interface CommitteeMember {
  id?: string;
  userId?: string;
  name: string;
  dni: string;
  position: string;
  representation: "employer" | "worker";
  role: "Presidente" | "Secretario" | "Vocal" | "Miembro Titular" | "Miembro Suplente" | "Observador" | "Supervisor SST" | "Supervisor Suplente";
  startDate: string;
  endDate: string;
  companyRuc: string;
  createdAt: any;
}

export interface CommitteeEvent {
  id?: string;
  title: string;
  date: string;
  type: "meeting" | "inspection" | "audit" | "other";
  description?: string;
  companyRuc: string;
  createdAt: any;
}

export interface AgreementUpdate {
  id: string;
  date: string;
  text: string;
}

export interface ManagementMeeting {
  id?: string;
  date: string; // YYYY-MM-DD
  gerenciaSignature?: string;
  sstSignature?: string;
  title: string;
  attendees: string;
  attendeeIds?: string[];
  topics?: string;
  objective?: string;
  keyPoints?: string;
  decisions?: string;
  status?: "scheduled" | "in_review" | "approved";
  feedback?: string;
  managerApprovedAt?: any;
  companyRuc: string;
  createdAt: any;
}

export interface ManagementAgreement {
  id?: string;
  meetingId: string;
  description: string;
  deadline: string; // YYYY-MM-DD
  status: "pending" | "in_progress" | "completed";
  assignedToId?: string;
  assignedToName?: string;
  managerApproved?: boolean;
  managerApprovedAt?: any;
  evidenceUrls: string[];
  notes?: string;
  feedback?: string;
  feedbackAttachment?: string;
  observations?: { 
    text: string; 
    attachmentBase64: string | null;
    correctionText?: string;
    correctionUrl?: string;
  }[];
  companyRuc: string;
  createdAt: any;
}
