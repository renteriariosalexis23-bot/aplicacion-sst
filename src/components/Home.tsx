import React from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { navigationForRole } from "../constants/navigation";
import { resolveBrand } from "../utils/brand";
import { usePendingItems } from "../hooks/usePendingItems";
import { Feed } from "./Feed";

const greeting = (hour: number) =>
  hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

export const Home: React.FC = () => {
  const { profile } = useAuth();
  const { companies, selectedCompany, setSelectedCompanyRuc } = useCompany();
  const navigation = navigationForRole(profile?.role, selectedCompany, profile);
  const firstName = (profile?.displayName || "").split(" ")[0];
  const pending = usePendingItems();
  const counts: Record<string, number> = {
    "/documents": pending.docsToSign.length,
    "/medical-exams": pending.examsToSign.length,
    "/trainings": pending.trainingsToComplete.length,
    "/inspections": pending.inspectionsToReview + pending.equipmentAlerts.length,
    "/reports": pending.reportsToReview,
  };
  const urgent = [
    ...pending.docsToSign.map((d) => ({ key: `doc-${d.id}`, title: d.title, label: "Firmar documento", href: "/documents" })),
    ...pending.examsToSign.map((e) => ({ key: `exam-${e.id}`, title: e.title, label: "Confirmar examen médico", href: "/medical-exams" })),
    ...pending.trainingsToComplete.map((t) => ({ key: `tr-${t.id}`, title: t.title, label: "Completar capacitación", href: "/trainings" })),
    ...(pending.inspectionsToReview > 0
      ? [{ key: "insp", title: `${pending.inspectionsToReview} ${pending.inspectionsToReview === 1 ? "inspección" : "inspecciones"} por revisar`, label: "Revisar y firmar", href: "/inspections" }]
      : []),
    ...pending.equipmentAlerts.map((a) => ({ key: `eq-${a.id}`, title: a.title, label: a.label, href: "/inspections" })),
    ...(pending.reportsToReview > 0
      ? [{ key: "rep", title: `${pending.reportsToReview} ${pending.reportsToReview === 1 ? "incidente" : "incidentes"} sin revisar`, label: "Revisar reportes", href: "/reports" }]
      : []),
  ];
  const now = new Date();
  const canSwitchCompany =
    ["employer", "super_admin", "gerencia"].includes(profile?.role || "") &&
    companies.length > 1;

  const modules = navigation.filter((item) => item.href !== "/" && item.art);
  const featured = modules.filter((item) => item.featured);

  return (
    <div className="pb-6">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-600">
        {format(now, "EEEE, d 'de' MMMM", { locale: es })}
        {selectedCompany ? ` · ${selectedCompany.businessName}` : ""}
      </p>
      <h1 className="mt-2 text-[30px] font-bold leading-[1.1] tracking-[-0.03em] text-slate-900 md:text-[40px]">
        {greeting(now.getHours())}
        {firstName && (
          <>
            , <em className="font-serif font-normal text-blue-600">{firstName}</em>
          </>
        )}
        .
      </h1>
      <p className="mt-2 text-[15px] text-slate-500">
        {urgent.length > 0 ? (
          <>
            Tienes <b className="text-slate-900">{urgent.length} {urgent.length === 1 ? "tema" : "temas"}</b> por atender.
          </>
        ) : (
          "Todo al día."
        )}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
        {/* Columna lateral (en celular va primero): lo urgente, empresas y accesos */}
        <aside className="min-w-0 space-y-5 lg:order-2">
          {urgent.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h2 className="mb-1 text-[17px] font-bold tracking-[-0.02em] text-slate-900">
                Lo <em className="font-serif font-normal text-blue-600">urgente</em>
              </h2>
              <div className="divide-y divide-slate-100">
                {urgent.slice(0, 5).map((u) => (
                  <Link key={u.key} to={u.href} className="group flex items-center gap-3 py-2.5">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#c23a4f] ring-4 ring-[#c23a4f]/15" />
                    <span className="min-w-0 flex-1 leading-tight">
                      <b className="block truncate text-sm font-semibold text-slate-800">{u.title}</b>
                      <small className="text-xs text-slate-500">{u.label}</small>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-blue-600 transition-transform group-hover:translate-x-0.5">
                      Ir →
                    </span>
                  </Link>
                ))}
              </div>
              {urgent.length > 5 && (
                <p className="pt-2 text-xs text-slate-500">Y {urgent.length - 5} más en sus módulos.</p>
              )}
            </section>
          )}

          {canSwitchCompany && (
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tus empresas</p>
              <div className="tab-bar -mx-3 flex gap-2 px-3 pb-1 lg:mx-0 lg:flex-col lg:px-0">
                {companies.map((company) => {
                  const brand = resolveBrand(company);
                  const active = company.ruc === selectedCompany?.ruc;
                  return (
                    <button
                      key={company.id || company.ruc}
                      onClick={() => setSelectedCompanyRuc(company.ruc)}
                      className={`flex w-[78%] min-w-0 items-center gap-3 rounded-xl border bg-white px-3 py-2.5 text-left transition-colors hover:border-slate-300 lg:w-full ${
                        active ? "border-blue-600" : "border-slate-200"
                      }`}
                      style={{ borderLeft: `4px solid ${brand.main}` }}
                    >
                      <span className="flex h-9 w-14 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white p-1">
                        <img src={brand.logo} alt="" className="max-h-full max-w-full object-contain" />
                      </span>
                      <span className="min-w-0 flex-1 leading-tight">
                        <b className="block truncate text-sm text-slate-900">{company.businessName}</b>
                        <small className="block truncate text-xs text-slate-500">RUC {company.ruc}</small>
                      </span>
                      {active && (
                        <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">Viendo</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Celular: accesos rápidos deslizables */}
          {featured.length > 0 && (
            <section className="lg:hidden">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Accesos rápidos</p>
              <div className="tab-bar -mx-3 flex gap-2.5 px-3 pb-1">
                {featured.map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    className="relative flex w-[104px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white"
                  >
                    <span className="flex h-[64px] items-center justify-center overflow-hidden bg-[#f1f1f1]">
                      <img src={item.art} alt="" className="brand-art h-[74px] w-auto max-w-none object-contain" />
                    </span>
                    {counts[item.href] > 0 && (
                      <span className="absolute right-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#c23a4f] px-1.5 text-[11px] font-bold text-white">
                        {counts[item.href]}
                      </span>
                    )}
                    <span className="px-2 py-2 text-center text-[12px] font-semibold leading-tight text-slate-800">
                      {item.tileName || item.name}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Computadora: todos los módulos en una lista */}
          <section className="hidden rounded-2xl border border-slate-200 bg-white p-2 lg:block">
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Módulos</p>
            {modules.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-slate-50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#f1f1f1]">
                  <img src={item.art} alt="" className="brand-art h-11 w-auto max-w-none object-contain" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{item.tileName || item.name}</span>
                {counts[item.href] > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#c23a4f] px-1.5 text-[11px] font-bold text-white">
                    {counts[item.href]}
                  </span>
                )}
              </Link>
            ))}
          </section>
        </aside>

        {/* El Muro: anuncios y comunicados, como en una red social */}
        <section className="min-w-0 lg:order-1">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Muro</h2>
          <Feed embedded />
        </section>
      </div>
    </div>
  );
};
