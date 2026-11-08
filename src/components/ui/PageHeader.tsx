import React from 'react';
import { Loader2, LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  // Se conserva por compatibilidad; el encabezado siempre usa el color de la empresa
  color?: 'blue' | 'indigo' | 'purple' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'sky';
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  icon: Icon,
  actions,
}) => {
  return (
    <div className="brand-gradient relative mb-5 overflow-hidden rounded-2xl p-4 shadow-lg shadow-blue-900/15 sm:mb-8 sm:p-8 print:hidden">
      {/* Background Graphic */}
      <div className="pointer-events-none absolute -right-6 -top-6 rotate-12 scale-150 transform opacity-10">
        <Icon className="h-32 w-32 text-white sm:h-64 sm:w-64" />
      </div>
      
      <div className="relative z-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-5">
          <div className="shrink-0 rounded-xl border border-white/10 bg-white/20 p-2.5 shadow-inner backdrop-blur-sm sm:p-4">
            <Icon className="h-6 w-6 text-white sm:h-10 sm:w-10" />
          </div>
          <div className="min-w-0">
            <h1 className="mb-0.5 text-xl font-bold leading-tight tracking-tight text-white sm:mb-1 sm:text-3xl">
              {title}
            </h1>
            {description && (
              <p className="line-clamp-2 max-w-2xl text-xs font-medium text-white/80 sm:line-clamp-none sm:text-base">
                {description}
              </p>
            )}
          </div>
        </div>

        {actions && (
          <div className="page-header-actions flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
