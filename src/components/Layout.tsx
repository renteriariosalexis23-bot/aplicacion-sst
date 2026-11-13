import React, { useState, useEffect } from "react";
import { Outlet, Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { setPdfIssuer } from "../utils/pdfLetterhead";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { CompanyLogo } from "./CompanyLogo";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { LogOut, ShieldAlert, Menu, X, Search, ArrowLeft, Home, LayoutGrid } from "lucide-react";
import { NAVIGATION, NavigationItem, navigationForRole, roleLabel, labelForCompany } from "../constants/navigation";
import { resolveBrand } from "../utils/brand";
import { NotificationsWidget } from "./NotificationsWidget";
import { EmergencyWidget } from "./EmergencyWidget";
import { useEquipmentAlerts } from "../hooks/useEquipmentAlerts";
import { GlobalSearchModal } from "./GlobalSearchModal";

export const Layout: React.FC = () => {
  useEquipmentAlerts();
  const { profile, logout, isPendingActivation } = useAuth();
  const { companies, selectedCompany, setSelectedCompanyRuc } = useCompany();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);

  useEffect(() => {
    if (profile?.role === "gerencia" && selectedCompany?.ruc) {
      const q = query(
        collection(db, "managementAgreements"),
        where("companyRuc", "==", selectedCompany.ruc),
        where("status", "==", "in_progress")
      );
      const unsubscribe = onSnapshot(q, (snap) => {
        const count = snap.docs.filter(doc => !doc.data().managerApproved).length;
        setPendingReviewCount(count);
      });
      return () => unsubscribe();
    } else {
      setPendingReviewCount(0);
    }
  }, [profile?.role, selectedCompany?.ruc]);

  React.useEffect(() => {
    setIsMobileMenuOpen(false);
    setMenuQuery("");
  }, [location.pathname]);

  // Nombre que figura como "generado por" en la verificación de los PDF
  React.useEffect(() => {
    setPdfIssuer(profile?.displayName);
  }, [profile?.displayName]);

  // Barras de pestañas: quita el borde desvanecido cuando ya se ve la última pestaña
  React.useEffect(() => {
    const update = (el: Element) =>
      el.classList.toggle("at-end", el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
    let frame = 0;
    const updateAll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => document.querySelectorAll(".tab-bar").forEach(update));
    };
    const onScroll = (e: Event) => {
      const el = e.target as Element;
      if (el instanceof Element && el.classList.contains("tab-bar")) update(el);
    };
    const observer = new MutationObserver(updateAll);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", updateAll);
    updateAll();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", updateAll);
    };
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isMobileMenuOpen) {
          setIsMobileMenuOpen(false);
          return;
        }
        const hasModal = document.querySelector('[role="dialog"], .fixed.inset-0:not(.md\\:hidden)');
        if (hasModal) return;

        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
           return;
        }
        if (location.pathname !== "/") {
          navigate(-1);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, location.pathname, isMobileMenuOpen]);

  React.useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
    };
  }, []);

  React.useEffect(() => {
    const handleGlobalSearchShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && profile?.role !== "worker") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleGlobalSearchShortcut);
    return () => window.removeEventListener('keydown', handleGlobalSearchShortcut);
  }, [profile?.role]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } else {
      setShowInstallModal(true);
    }
  };

  if (isPendingActivation) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-8 h-8 text-sky-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Cuenta Pendiente
          </h1>
          <p className="text-slate-600 mb-8">
            Tu cuenta está pendiente de activación. Por favor, espera a que tu
            empleador te dirija a tu empresa.
          </p>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center px-4 py-3 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  const filteredNavigation = navigationForRole(profile?.role, selectedCompany, profile);
  const brand = resolveBrand(selectedCompany);
  const matchedItem = NAVIGATION.find(
    (item) => item.href !== "/" && location.pathname.startsWith(item.href),
  );
  const currentItem = matchedItem && labelForCompany(matchedItem, selectedCompany);
  // Un módulo que no está en el menú de esta persona tampoco se abre escribiendo la dirección.
  // "Equipos" solo existe dentro de Inspecciones para administradores.
  const isBlockedRoute =
    (!!matchedItem && !filteredNavigation.some((item) => item.href === matchedItem.href)) ||
    (profile?.role === "worker" && location.pathname.startsWith("/equipments"));
  const canSwitchCompany =
    ["employer", "super_admin", "gerencia"].includes(profile?.role || "") &&
    companies.length > 1;
  const workerCompany = companies.find((c) => c.ruc === profile?.companyRuc);
  const initials =
    (profile?.displayName || "U")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "U";

  // Agrupa la navegación (sin Inicio, que va en el encabezado)
  const groupedNavigation = filteredNavigation
    .filter((item) => item.href !== "/")
    .reduce(
      (acc, item) => {
        const group = item.group || "General";
        if (!acc[group]) acc[group] = [];
        acc[group].push(item);
        return acc;
      },
      {} as Record<string, NavigationItem[]>,
    );

  const companySelect = (
    <select
      value={selectedCompany?.ruc || ""}
      onChange={(e) => {
        setSelectedCompanyRuc(e.target.value);
        setIsMobileMenuOpen(false);
      }}
      className="absolute inset-0 opacity-0 cursor-pointer"
      aria-label="Cambiar de empresa"
    >
      {companies.map((c) => (
        <option key={c.id} value={c.ruc}>
          {c.businessName}
        </option>
      ))}
    </select>
  );

  // Lista de módulos del panel: una sola columna, íconos simples, el activo con una barra fina
  const moduleQuery = menuQuery.trim().toLowerCase();
  const modulesList = (
    <div>
      {Object.entries(groupedNavigation)
        .map(([group, items]) => [group, items.filter((i) => !moduleQuery || i.name.toLowerCase().includes(moduleQuery))] as const)
        .filter(([, items]) => items.length > 0)
        .map(([group, items]) => (
          <div key={group} className="mb-5">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">{group}</p>
            <div>
              {items.map((item) => {
                const isActive = location.pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors ${
                      isActive ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    {isActive && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-blue-600" />}
                    <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-blue-600" : "text-slate-400"}`} strokeWidth={1.75} />
                    <span className="truncate">{item.name}</span>
                    {item.name === "Reuniones y Seguimiento" && pendingReviewCount > 0 && (
                      <span className="ml-auto shrink-0 rounded-full bg-[#c23a4f] px-2 py-0.5 text-[10px] font-bold text-white">
                        {pendingReviewCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      {moduleQuery && Object.values(groupedNavigation).every((items) => !items.some((i) => i.name.toLowerCase().includes(moduleQuery))) && (
        <p className="px-3 py-6 text-center text-sm text-slate-500">No hay módulos con ese nombre.</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white print:block">
      {/* Encabezado con el color de la empresa */}
      <header
        className={`relative z-40 text-white shadow-[0_3px_14px_rgba(0,0,0,0.08)] print:hidden ${
          brand.header === "panel" ? "brand-gradient-soft" : "brand-gradient"
        }`}
      >
        {brand.header === "panel" && (
          <div
            className="absolute inset-y-0 left-0 hidden w-[430px] bg-white md:block"
            style={{ clipPath: "polygon(0 0, 100% 0, calc(100% - 56px) 100%, 0 100%)" }}
            aria-hidden="true"
          />
        )}
        <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:h-[100px] md:px-8">
          <div className="flex min-w-0 items-center gap-1">
            {location.pathname !== "/" && (
              <button
                onClick={() => navigate(-1)}
                className="-ml-2 rounded-full p-2 text-white/90 hover:bg-white/10 md:hidden"
                aria-label="Volver"
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
            )}
            <Link to="/" className="flex min-w-0 items-center" aria-label="Ir al inicio">
              <CompanyLogo
                variant="white"
                className={`w-auto object-contain object-left sm:max-w-[200px] md:h-10 md:max-w-[270px] ${
                  brand.key === "ih" ? "h-7 max-w-[150px]" : "h-11 max-w-[120px]"
                } ${
                  brand.header === "panel" ? "md:hidden" : ""
                }`}
              />
              {brand.header === "panel" && (
                <CompanyLogo className="hidden h-[60px] w-auto max-w-[300px] object-contain object-left md:block" />
              )}
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-2 md:gap-4">
            {canSwitchCompany && (
              <div className="relative hidden items-center gap-3 rounded-xl border border-white/25 bg-white/12 px-4 py-2 hover:bg-white/20 lg:flex">
                <span className="h-2.5 w-2.5 rounded-full bg-white/80 ring-4 ring-white/20" />
                <span className="leading-tight">
                  <small className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">
                    Viendo
                  </small>
                  <b className="block max-w-[200px] truncate text-[13px] uppercase">
                    {selectedCompany?.businessName}
                  </b>
                </span>
                <span aria-hidden="true" className="text-xs">▾</span>
                {companySelect}
              </div>
            )}

            <div className="flex items-center gap-1.5">
              {profile?.role !== "worker" && (
                <button
                  onClick={() => setIsSearchOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white hover:bg-white/20"
                  title="Buscador global (Ctrl+K)"
                  aria-label="Buscar"
                >
                  <Search className="h-5 w-5" />
                </button>
              )}
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
                <EmergencyWidget />
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
                <NotificationsWidget />
              </div>
            </div>

            <div className="hidden text-right leading-tight xl:block">
              <b className="block max-w-[200px] truncate text-[15px]">
                {profile?.displayName || "Usuario"}
              </b>
              <small className="text-xs text-white/80">
                {roleLabel(profile?.role)}
                {!canSwitchCompany && workerCompany ? ` · ${workerCompany.businessName}` : ""}
              </small>
            </div>
            <Link
              to="/profile"
              className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white/60 bg-white/90 text-base font-bold text-blue-600 md:flex"
              title="Mi perfil"
            >
              {initials}
            </Link>
            <button
              onClick={logout}
              className="hidden rounded-md bg-white px-5 py-3 text-[13px] font-semibold text-blue-700 hover:bg-blue-50 md:block"
            >
              Cerrar sesión
            </button>
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white hover:bg-white/20 md:hidden"
              aria-label="Abrir módulos"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Barra de ubicación y acceso a todos los módulos */}
      <div className="mx-auto hidden max-w-7xl items-center justify-between gap-4 px-8 pt-5 md:flex print:hidden">
        <nav className="flex min-w-0 items-center gap-2 text-sm font-semibold" aria-label="Ubicación">
          <Link
            to="/"
            className={location.pathname === "/" ? "text-slate-900" : "text-blue-600 hover:text-blue-800"}
          >
            Inicio
          </Link>
          {currentItem && (
            <>
              <span className="text-slate-300">/</span>
              <span className="truncate text-slate-900">{currentItem.name}</span>
            </>
          )}
        </nav>
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          <LayoutGrid className="h-4 w-4 text-slate-400" />
          Módulos
        </button>
      </div>

      {/* Panel de módulos: lateral en computadora, pantalla completa en celular */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={() => setIsMobileMenuOpen(false)}>
          <div
            role="dialog"
            aria-label="Módulos"
            className="flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-[400px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0 leading-tight">
                <b className="block truncate text-[15px] text-slate-900">{profile?.displayName || "Usuario"}</b>
                <small className="text-[13px] text-slate-500">{roleLabel(profile?.role)}</small>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {(canSwitchCompany || workerCompany) && (
              <div className="shrink-0 px-5 pt-4">
                <div className="relative flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                  <CompanyLogo className="h-7 w-12 shrink-0 object-contain" />
                  <span className="min-w-0 flex-1 leading-tight">
                    <small className="block text-[11px] text-slate-400">
                      {canSwitchCompany ? "Empresa · tocar para cambiar" : "Tu empresa"}
                    </small>
                    <b className="block truncate text-sm font-semibold text-slate-900">
                      {canSwitchCompany ? selectedCompany?.businessName : workerCompany?.businessName}
                    </b>
                  </span>
                  {canSwitchCompany && (
                    <>
                      <span aria-hidden="true" className="text-xs text-slate-400">▾</span>
                      {companySelect}
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="shrink-0 px-5 pb-2 pt-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={menuQuery}
                  onChange={(e) => setMenuQuery(e.target.value)}
                  placeholder="Buscar módulo"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              {!moduleQuery && (
                <Link
                  to="/"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`mb-4 flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] ${
                    location.pathname === "/" ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Home className={`h-[18px] w-[18px] ${location.pathname === "/" ? "text-blue-600" : "text-slate-400"}`} strokeWidth={1.75} />
                  Inicio
                </Link>
              )}
              {modulesList}
            </div>

            <div className="shrink-0 border-t border-slate-200 px-5 py-3 pb-safe">
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-red-700"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contenido */}
      <main className="mx-auto max-w-7xl px-3 pb-32 pt-4 md:px-8 md:pb-12 md:pt-6 print:max-w-none print:p-0">
        {isBlockedRoute ? (
          <Navigate to="/" replace />
        ) : (
          // La clave hace que cada pantalla entre con una transición suave
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        )}
      </main>

      {/* Navegación inferior en móvil */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t border-slate-200 bg-white pb-safe md:hidden print:hidden">
        {filteredNavigation
          .filter((n) =>
            ["Inicio", "Documentos", "Gestión de Incidentes", "Buzón SST", "Mi Perfil"].includes(n.name),
          )
          .map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            const shortName =
              item.name === "Gestión de Incidentes"
                ? "Incidentes"
                : item.name === "Buzón SST"
                  ? "Buzón"
                  : item.name === "Mi Perfil"
                    ? "Perfil"
                    : item.name;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex h-full w-full flex-col items-center justify-center gap-1 transition-colors ${
                  isActive ? "text-blue-600" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                <span className={`truncate px-1 text-[10px] ${isActive ? "font-bold" : "font-medium"}`}>
                  {shortName}
                </span>
              </Link>
            );
          })}
      </div>

      {showInstallModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="p-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Instalar Aplicación</h3>
              <p className="text-slate-600 text-sm mb-4">
                Para usar GESTIÓN SST como una aplicación nativa en tu dispositivo, sigue estos pasos según tu sistema:
              </p>
              
              <div className="mb-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h4 className="font-semibold text-slate-800 text-sm flex items-center">En iOS (Safari)</h4>
                <ol className="list-decimal pl-5 text-sm text-slate-600 mt-2 space-y-1">
                  <li>Toca el ícono de <b>Compartir</b> en la barra inferior.</li>
                  <li>Selecciona <b>"Agregar a inicio"</b>.</li>
                </ol>
              </div>

              <div className="mb-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h4 className="font-semibold text-slate-800 text-sm flex items-center">En Android (Chrome)</h4>
                <ol className="list-decimal pl-5 text-sm text-slate-600 mt-2 space-y-1">
                  <li>Toca el menú de los <b>tres puntos</b> arriba a la derecha.</li>
                  <li>Selecciona <b>"Instalar aplicación" / "Agregar a la pantalla principal"</b>.</li>
                </ol>
              </div>
              
              <button
                onClick={() => setShowInstallModal(false)}
                className="w-full bg-sky-600 text-white font-semibold py-2.5 rounded-lg hover:bg-sky-700 transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        navigation={filteredNavigation}
      />
    </div>
  );
};
