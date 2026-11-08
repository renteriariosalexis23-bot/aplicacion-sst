import React from "react";
import { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  description?: string;
  // Se conservan por compatibilidad; el encabezado ya no muestra ícono ni color propio
  icon?: LucideIcon;
  color?: "blue" | "indigo" | "purple" | "emerald" | "amber" | "rose" | "cyan" | "sky";
  actions?: React.ReactNode;
}

// Encabezado de cada módulo: título, una línea que explica para qué sirve y las acciones.
// Sobrio a propósito: el color de la empresa queda para la barra superior y los botones.
export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions }) => (
  <header className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-8 print:hidden">
    <div className="min-w-0">
      <h1 className="text-[26px] font-bold leading-[1.15] tracking-[-0.025em] text-slate-900 sm:text-[32px]">{title}</h1>
      {description && <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-slate-500 sm:text-[15px]">{description}</p>}
    </div>
    {actions && (
      <div className="page-header-actions flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
    )}
  </header>
);
