import {
  Newspaper,
  FileText,
  AlertTriangle,
  ShieldAlert,
  User,
  Users,
  BarChart3,
  BookOpen,
  ClipboardCheck,
  FileCheck,
  MessageSquare,
  Building2,
  FileBadge,
  CalendarDays,
  UsersRound,
  UserPlus,
  TrendingUp,
  Megaphone,
  Car,
  Home,
} from "lucide-react";
import type { ElementType } from "react";
import { Company, Role, UserProfile } from "../types";
import { sstBodyFor } from "../utils/brand";

export interface NavigationItem {
  name: string;
  href: string;
  icon: ElementType;
  group?: string;
  // Ilustración 3D para las tarjetas del inicio (public/ilustraciones)
  art?: string;
  // Va en las tarjetas grandes del inicio; el resto, en "Más módulos"
  featured?: boolean;
  // Texto corto bajo el título de la tarjeta grande
  hint?: string;
  // Título más corto para la tarjeta grande
  tileName?: string;
}

export const NAVIGATION: NavigationItem[] = [
  { name: "Inicio", href: "/", icon: Home },
  { name: "Muro", href: "/muro", icon: Newspaper, art: "/ilustraciones/muro.png", hint: "Noticias y avisos" },
  { name: "Panel Directivo", href: "/dashboard", icon: BarChart3, art: "/ilustraciones/panel.png", hint: "Indicadores de la empresa" },

  // Planificación y Control
  { name: "Reuniones y Seguimiento", href: "/management-meetings", icon: Users, group: "Gestión Operativa", art: "/ilustraciones/reuniones.png", hint: "Acuerdos y pendientes" },
  { name: "Programa Anual SST", href: "/annual-program", icon: CalendarDays, group: "Gestión Operativa", art: "/ilustraciones/calendario.png", hint: "Plan y actividades del año" },
  {
    name: "Programa de Inspecciones",
    href: "/inspections",
    icon: FileBadge,
    group: "Gestión Operativa",
    art: "/ilustraciones/clipboard.png",
    featured: true,
    tileName: "Inspecciones",
    hint: "Programa y registra inspecciones",
  },
  { name: "Buzón SST", href: "/suggestions", icon: MessageSquare, group: "Gestión Operativa", art: "/ilustraciones/buzon.png", hint: "Sugerencias y consultas" },

  // Gestión de Personal
  {
    name: "Exámenes Médicos",
    href: "/medical-exams",
    icon: User,
    group: "Personal y Salud",
    art: "/ilustraciones/firstaid.png",
    featured: true,
    hint: "Aptitud y vencimientos",
  },
  { name: "Inducciones (Ley)", href: "/inductions", icon: UserPlus, group: "Personal y Salud", art: "/ilustraciones/induccion.png", hint: "Inducción del personal nuevo" },
  {
    name: "Capacitaciones",
    href: "/trainings",
    icon: BookOpen,
    group: "Personal y Salud",
    art: "/ilustraciones/training.png",
    featured: true,
    hint: "Charlas, cursos y asistencia",
  },
  {
    name: "Entrega de EPPs",
    href: "/epps",
    icon: ShieldAlert,
    group: "Personal y Salud",
    art: "/ilustraciones/hardhat.png",
    featured: true,
    hint: "Entregas y renovaciones",
  },

  // Comité e Incidentes
  { name: "Comité / Supervisor SST", href: "/committee", icon: UsersRound, group: "Comité e Incidentes", art: "/ilustraciones/comite.png", hint: "Miembros, actas y reuniones" },
  {
    name: "Gestión de Incidentes",
    href: "/reports",
    icon: AlertTriangle,
    group: "Comité e Incidentes",
    art: "/ilustraciones/warning.png",
    featured: true,
    hint: "Reporta e investiga",
  },
  {
    name: "Simulacros y Brigadas",
    href: "/drills",
    icon: Megaphone,
    group: "Comité e Incidentes",
    art: "/ilustraciones/extinguisher.png",
    featured: true,
    hint: "Simulacros y brigadistas",
  },

  // Gestión Documental
  {
    name: "Documentos",
    href: "/documents",
    icon: FileText,
    group: "Documentos y Registros",
    art: "/ilustraciones/documents.png",
    featured: true,
    hint: "Políticas, reglamentos y formatos",
  },
  { name: "Registros Legales", href: "/mandatory-registers", icon: FileCheck, group: "Documentos y Registros", art: "/ilustraciones/registros.png", hint: "Registros obligatorios" },
  { name: "Estadísticas SST", href: "/sst-statistics", icon: TrendingUp, group: "Documentos y Registros", art: "/ilustraciones/estadisticas.png", hint: "Cifras y tendencias" },
  { name: "Pre-Uso de Equipos", href: "/preuse", icon: ClipboardCheck, group: "Documentos y Registros", art: "/ilustraciones/preuso.png", hint: "Checklist antes de usar" },

  // Configuración
  { name: "Mi Perfil", href: "/profile", icon: User, group: "Perfil y Accesos", art: "/ilustraciones/perfil.png", hint: "Datos personales y firma" },
  { name: "Vehículos y Brevetes", href: "/vehicles", icon: Car, group: "Perfil y Accesos", art: "/ilustraciones/vehiculo.png", hint: "Unidades y licencias" },
  { name: "Directorio", href: "/users", icon: Users, group: "Perfil y Accesos", art: "/ilustraciones/directorio.png", hint: "Personas de la empresa" },
  { name: "Empresas", href: "/companies", icon: Building2, group: "Perfil y Accesos", art: "/ilustraciones/empresas.png", hint: "Datos de cada empresa" },
];

const WORKER_ITEMS = [
  "Inicio",
  "Muro",
  "Exámenes Médicos",
  "Pre-Uso de Equipos",
  "Programa de Inspecciones",
  "Entrega de EPPs",
  "Inducciones (Ley)",
  "Capacitaciones",
  "Gestión de Incidentes",
  "Comité / Supervisor SST",
  "Documentos",
  "Buzón SST",
  "Mi Perfil",
  "Vehículos y Brevetes",
];

const SUPERVISOR_ITEMS = [
  "Inicio",
  "Muro",
  "Exámenes Médicos",
  "Pre-Uso de Equipos",
  "Programa de Inspecciones",
  "Entrega de EPPs",
  "Inducciones (Ley)",
  "Capacitaciones",
  "Gestión de Incidentes",
  "Programa Anual SST",
  "Comité / Supervisor SST",
  "Documentos",
  "Estadísticas SST",
  "Buzón SST",
  "Mi Perfil",
  "Vehículos y Brevetes",
];

// Filtra la navegación según el rol (empleador, gerencia y super_admin ven todo)
// Vehículos y Pre-Uso son solo para el personal de Despacho (motorizados)
const DISPATCH_ONLY = ["Pre-Uso de Equipos", "Vehículos y Brevetes"];
const normalize = (text?: string) =>
  (text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const isDispatchWorker = (profile?: Pick<UserProfile, "department" | "position"> | null) =>
  normalize(profile?.department).includes("despacho") || normalize(profile?.position).includes("motoriz");

export const navigationForRole = (
  role?: Role,
  company?: Company | null,
  profile?: Pick<UserProfile, "department" | "position"> | null,
) => {
  const items =
    role === "worker"
      ? NAVIGATION.filter(
          (i) => WORKER_ITEMS.includes(i.name) && (!DISPATCH_ONLY.includes(i.name) || isDispatchWorker(profile)),
        )
      : role === "supervisor"
        ? NAVIGATION.filter((i) => SUPERVISOR_ITEMS.includes(i.name))
        : NAVIGATION;
  return items.map((i) => labelForCompany(i, company));
};

// El módulo del comité se llama según lo que tenga la empresa
export const labelForCompany = (item: NavigationItem, company?: Company | null): NavigationItem => {
  if (item.href !== "/committee") return item;
  return sstBodyFor(company) === "committee"
    ? { ...item, name: "Comité de SST", tileName: "Comité de SST", hint: "Miembros, actas y acuerdos" }
    : { ...item, name: "Supervisor de SST", tileName: "Supervisor de SST", hint: "Quién es el supervisor" };
};

export const roleLabel = (role?: Role) =>
  role === "super_admin"
    ? "Super Administrador"
    : role === "gerencia"
      ? "Gerencia General"
      : role === "employer"
        ? "Empleador (Admin)"
        : role === "supervisor"
          ? "Supervisor SST"
          : "Trabajador";
