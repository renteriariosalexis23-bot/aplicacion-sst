import React from "react";
import { Inbox } from "lucide-react";

// Mientras cargan los datos: bloques grises que laten, con la forma de una lista.
export const PageLoader: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="space-y-3 py-2" role="status" aria-label="Cargando">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="skeleton h-10 w-10 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3.5 rounded" style={{ width: `${62 - i * 9}%` }} />
          <div className="skeleton h-3 rounded" style={{ width: `${38 - i * 4}%` }} />
        </div>
      </div>
    ))}
  </div>
);

// Cuando todavía no hay nada que mostrar.
export const EmptyState: React.FC<{ text: string; hint?: string }> = ({ text, hint }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
    <Inbox className="mx-auto mb-3 h-8 w-8 text-slate-300" strokeWidth={1.5} />
    <p className="text-[15px] font-semibold text-slate-700">{text}</p>
    {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
  </div>
);
