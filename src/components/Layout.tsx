import React, { useState, useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
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
  }, [location.pathname]);

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

  const modulesList = (
    <div className="gap-x-8 sm:columns-2 lg:columns-3">
      {Object.entries(groupedNavigation).map(([group, items]) => (
        <div key={group} className="mb-6 break-inside-avoid">
          <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-blue-600">
            {group === "General" ? "General" : group}
          </p>
          <div className="space-y-0.5">
            {items.map((item) => {
              const isActive = location.pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isActive ? "bg-white/15" : "bg-blue-50 text-blue-600 group-hover:bg-white"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="truncate">{item.name}</span>
                  {item.name === "Reuniones y Seguimiento" && pendingReviewCount > 0 && (
                    <span className="ml-auto shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      {pendingReviewCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
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
                className={`h-7 w-auto max-w-[120px] object-contain object-left sm:max-w-[200px] md:h-10 md:max-w-[270px] ${
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
          className="flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-[13px] font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <LayoutGrid className="h-4 w-4" />
          Todos los módulos
        </button>
      </div>

      {/* Panel de módulos (escritorio y móvil) */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-blue-950/40 backdrop-blur-[2px] md:p-8"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Módulos"
            className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl md:h-auto md:max-h-[calc(100vh-4rem)] md:rounded-[26px] animate-in fade-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="brand-gradient flex shrink-0 items-center justify-between px-5 py-4 text-white md:px-8 md:py-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white/60 bg-white/90 font-bold text-blue-600">
                  {initials}
                </div>
                <div className="min-w-0 leading-tight">
                  <b className="block truncate">{profile?.displayName || "Usuario"}</b>
                  <small className="text-white/80">{roleLabel(profile?.role)}</small>
                </div>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
                aria-label="Cerrar"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {(canSwitchCompany || workerCompany) && (
              <div className="shrink-0 border-b border-slate-200 px-5 py-4 md:px-8">
                <div className="relative flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <CompanyLogo className="h-8 w-16 shrink-0 object-contain" />
                  <span className="min-w-0 flex-1 leading-tight">
                    <small className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      {canSwitchCompany ? "Viendo · toca para cambiar" : "Tu empresa"}
                    </small>
                    <b className="block truncate text-sm text-slate-900">
                      {canSwitchCompany ? selectedCompany?.businessName : workerCompany?.businessName}
                    </b>
                  </span>
                  {canSwitchCompany && (
                    <>
                      <span aria-hidden="true" className="text-slate-500">▾</span>
                      {companySelect}
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-3 py-5 md:px-6 md:py-6">
              <Link
                to="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className="mb-5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Home className="h-[18px] w-[18px]" />
                </span>
                Inicio
              </Link>
              {modulesList}
            </div>

            <div className="shrink-0 border-t border-slate-200 px-5 py-4 pb-safe md:hidden">
              <button
                onClick={logout}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-red-50 hover:text-red-700"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contenido */}
      <main className="mx-auto max-w-7xl px-2 pb-32 pt-4 md:px-8 md:pb-12 md:pt-6 print:max-w-none print:p-0">
        <Outlet />
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
                <h4 className="font-semibold text-slate-800 text-sm flex items-center"><span className="text-xl mr-2">🍏</span> En iOS (Safari)</h4>
                <ol className="list-decimal pl-5 text-sm text-slate-600 mt-2 space-y-1">
                  <li>Toca el ícono de <b>Compartir</b> en la barra inferior.</li>
                  <li>Selecciona <b>"Agregar a inicio"</b>.</li>
                </ol>
              </div>

              <div className="mb-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h4 className="font-semibold text-slate-800 text-sm flex items-center"><span className="text-xl mr-2">🤖</span> En Android (Chrome)</h4>
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
