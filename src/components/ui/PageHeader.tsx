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
    <div className="brand-gradient relative overflow-hidden rounded-2xl p-6 sm:p-8 mb-8 shadow-lg shadow-blue-900/15 print:hidden">
      {/* Background Graphic */}
      <div className="absolute -right-6 -top-6 opacity-10 transform rotate-12 scale-150 pointer-events-none">
        <Icon className="w-64 h-64 text-white" />
      </div>
      
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="bg-white/20 p-4 rounded-xl backdrop-blur-sm border border-white/10 shadow-inner">
            <Icon className="w-10 h-10 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight mb-1">
              {title}
            </h1>
            {description && (
              <p className="text-white/80 font-medium text-sm sm:text-base max-w-2xl">
                {description}
              </p>
            )}
          </div>
        </div>
        
        {actions && (
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
