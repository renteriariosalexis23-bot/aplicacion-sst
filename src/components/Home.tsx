import React from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { navigationForRole } from "../constants/navigation";
import { resolveBrand } from "../utils/brand";
import { usePendingItems } from "../hooks/usePendingItems";

const greeting = (hour: number) =>
  hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

export const Home: React.FC = () => {
  const { profile } = useAuth();
  const { companies, selectedCompany, setSelectedCompanyRuc } = useCompany();
  const navigation = navigationForRole(profile?.role, selectedCompany, profile);
  // Todos los módulos en tarjetas grandes; los principales primero
  const tiles = [
    ...navigation.filter((item) => item.featured),
    ...navigation.filter((item) => !item.featured && item.art),
  ];
  const firstName = (profile?.displayName || "").split(" ")[0];
  const pending = usePendingItems();
  const counts: Record<string, number> = {
    "/documents": pending.docsToSign.length,
    "/medical-exams": pending.examsToSign.length,
    "/trainings": pending.trainingsToComplete.length,
    "/inspections": pending.inspectionsToReview,
    "/reports": pending.reportsToReview,
  };
  const urgent = [
    ...pending.docsToSign.map((d) => ({ key: `doc-${d.id}`, title: d.title, label: "Firmar documento", href: "/documents" })),
    ...pending.examsToSign.map((e) => ({ key: `exam-${e.id}`, title: e.title, label: "Confirmar examen médico", href: "/medical-exams" })),
    ...pending.trainingsToComplete.map((t) => ({ key: `tr-${t.id}`, title: t.title, label: "Completar capacitación", href: "/trainings" })),
    ...(pending.inspectionsToReview > 0
      ? [{ key: "insp", title: `${pending.inspectionsToReview} ${pending.inspectionsToReview === 1 ? "inspección" : "inspecciones"} por revisar`, label: "Revisar y firmar", href: "/inspections" }]
      : []),
    ...(pending.reportsToReview > 0
      ? [{ key: "rep", title: `${pending.reportsToReview} ${pending.reportsToReview === 1 ? "incidente" : "incidentes"} sin revisar`, label: "Revisar reportes", href: "/reports" }]
      : []),
  ];
  const now = new Date();
  const canSwitchCompany =
    ["employer", "super_admin", "gerencia"].includes(profile?.role || "") &&
    companies.length > 1;

  return (
    <div className="px-2 pb-6 md:px-0">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-600">
        {format(now, "EEEE, d 'de' MMMM", { locale: es })}
        {selectedCompany ? ` · ${selectedCompany.businessName}` : ""}
      </p>
      <h1 className="mt-2 text-[34px] font-bold leading-[1.1] tracking-[-0.03em] text-slate-900 md:text-[46px]">
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
            Tienes <b className="text-slate-900">{urgent.length} {urgent.length === 1 ? "tema" : "temas"}</b> por atender. Elige por dónde empezar.
          </>
        ) : (
          "Todo al día. Elige por dónde empezar."
        )}
      </p>

      {urgent.length > 0 && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="mb-2 text-[18px] font-bold tracking-[-0.02em] text-slate-900">
            Lo <em className="font-serif font-normal text-blue-600">urgente</em>
          </h2>
          <div className="divide-y divide-slate-100">
            {urgent.slice(0, 5).map((u) => (
              <Link key={u.key} to={u.href} className="group flex items-center gap-3 py-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#c23a4f] ring-4 ring-[#c23a4f]/15" />
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
        <section className="mt-7">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Tus empresas
          </p>
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
            {companies.map((company) => {
              const brand = resolveBrand(company);
              const active = company.ruc === selectedCompany?.ruc;
              return (
                <button
                  key={company.id || company.ruc}
                  onClick={() => setSelectedCompanyRuc(company.ruc)}
                  className={`flex min-w-0 items-center gap-3 rounded-2xl border bg-white px-3 py-3 text-left sm:gap-4 sm:px-4 sm:py-3.5 transition-shadow hover:shadow-md ${
                    active ? "border-blue-600 shadow-[0_10px_30px_-18px_var(--brand-main)]" : "border-slate-200"
                  }`}
                  style={{ borderLeft: `4px solid ${brand.main}` }}
                >
                  <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 sm:h-14 sm:w-24 sm:p-2">
                    <img src={brand.logo} alt="" className="max-h-full max-w-full object-contain" />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <b className="block truncate text-[15px] text-slate-900">{company.businessName}</b>
                    <small className="text-xs text-slate-500">RUC {company.ruc}</small>
                  </span>
                  {active ? (
                    <span className="shrink-0 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                      Viendo
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs font-bold" style={{ color: brand.main }}>
                      Ver →
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {tiles.length > 0 && (
        <section className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
          {tiles.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="group relative flex flex-col overflow-hidden rounded-[19px] border border-blue-600 bg-blue-600 text-white transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_var(--brand-main)]"
            >
              <span className="flex h-[110px] items-center justify-center overflow-hidden bg-[#f1f1f1] sm:h-[170px]">
                <img
                  src={item.art}
                  alt=""
                  className="brand-art h-[124px] w-auto sm:h-[190px] max-w-none object-contain transition-transform duration-500 group-hover:scale-105"
                />
              </span>
              {counts[item.href] > 0 && (
                <span
                  className="absolute left-3 top-3 z-10 grid h-8 min-w-8 place-items-center rounded-full bg-[#c23a4f] px-2.5 font-serif text-lg italic text-white shadow-[0_8px_18px_#c23a4f55] sm:left-3.5 sm:top-3.5 sm:h-[38px] sm:min-w-[38px] sm:text-[22px]"
                  aria-label={`${counts[item.href]} pendientes`}
                >
                  {counts[item.href]}
                </span>
              )}
              <span className="flex flex-1 items-center justify-between gap-2 px-3.5 py-3.5 sm:gap-3 sm:px-6 sm:py-5">
                <span className="min-w-0">
                  <strong className="block text-[13px] font-extrabold leading-tight sm:text-base">{item.tileName || item.name}</strong>
                  <small className="mt-1 block text-[11px] font-semibold text-white/85">{item.hint || item.group || "General"}</small>
                </span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-lg transition-transform sm:text-xl duration-300 group-hover:translate-x-1"
                >
                  →
                </span>
              </span>
            </Link>
          ))}
        </section>
      )}

    </div>
  );
};
