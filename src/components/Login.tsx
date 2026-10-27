import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext";

export const Login: React.FC = () => {
  const { login } = useAuth();
  
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } else {
      setShowInstallModal(true);
    }
  };

  const logos = [
    { color: "/logos/image-health.png", white: "/logos/image-health-blanco.png", name: "IMAGE & HEALTH", h: "h-6", hw: "h-7" },
    { color: "/logos/cc-laboratorios.png", white: "/logos/cc-laboratorios-blanco.png", name: "CC Laboratorios", h: "h-7", hw: "h-14" },
    { color: "/logos/poder-fenix-lab.png", white: "/logos/poder-fenix-lab-blanco.png", name: "Poder Fénix Lab", h: "h-8", hw: "h-14" },
  ];

  return (
    <div
      className="relative flex min-h-screen bg-[#14183a] bg-cover bg-center"
      style={{ backgroundImage: "url(/login-sst.jpg)" }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(20,24,58,.78) 0%, rgba(20,24,58,0) 38%), linear-gradient(90deg, rgba(20,24,58,.86) 0%, rgba(20,24,58,.62) 55%, rgba(20,24,58,.4) 100%)",
        }}
        aria-hidden="true"
      />

      {/* Marca y mensaje */}
      <section className="relative hidden flex-1 flex-col items-center justify-between px-12 py-14 text-white lg:flex">
        <div className="flex flex-col items-center">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-white/80">
            Portal integrado
          </p>
          <div className="flex items-center gap-7">
            {logos.map((logo, i) => (
              <React.Fragment key={logo.name}>
                {i > 0 && <i className="h-12 w-px bg-gradient-to-b from-white/0 via-white/70 to-white/0" />}
                <img src={logo.white} alt={logo.name} className={`${logo.hw} w-auto object-contain`} />
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-[64px] font-bold leading-[1] tracking-[-0.04em]">
            Prevenir es tarea
            <br />
            <em className="font-serif text-[60px] font-normal tracking-[-0.03em] text-[#d9e4ff]">de todos.</em>
          </h1>
          <p className="mt-6 text-base font-semibold text-[#eef1ff]">
            Seguridad y salud en el trabajo, en un solo lugar.
          </p>
        </div>
      </section>

      {/* Ingreso */}
      <section className="relative flex w-full items-center justify-center p-4 sm:p-7 lg:w-[470px] lg:shrink-0 lg:justify-end lg:pl-0">
        <div className="flex w-full max-w-[434px] flex-col rounded-[26px] bg-white/[0.97] px-7 pb-6 pt-8 text-[#302732] shadow-[0_30px_80px_rgba(7,11,34,0.4),0_0_0_1px_rgba(255,255,255,0.25)] sm:px-[34px] sm:pt-[34px] lg:min-h-[calc(100vh-56px)]">
          <div className="flex items-center gap-4 sm:gap-5">
            {logos.map((logo) => (
              <img key={logo.name} src={logo.color} alt={logo.name} className={`${logo.h} w-auto min-w-0 max-w-[30%] object-contain`} />
            ))}
          </div>

          <div className="my-auto py-10">
            <p className="text-[13px] font-medium text-[#302732]">Bienvenido a tu portal de seguridad</p>
            <h2 className="mt-1.5 text-[34px] font-bold tracking-[-1px]">Inicia sesión</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-[#867280]">
              Ingresa con la cuenta de Google de tu empresa. Te llevaremos directo a tu empresa.
            </p>

            <button
              onClick={login}
              className="mt-8 flex w-full items-center justify-between rounded-[7px] px-5 py-4 text-[13px] font-semibold text-white shadow-[0_12px_26px_rgba(91,58,160,0.25)] transition-transform hover:-translate-y-0.5"
              style={{ background: "linear-gradient(100deg, #2585b5, #5b3aa0 55%, #861079)" }}
            >
              <span className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                </span>
                Ingresar con Google
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20" aria-hidden="true">
                ↗
              </span>
            </button>

            <div className="mt-6 rounded-lg border border-[#eee2cf] bg-[#faf5ed] px-4 py-3.5 text-[#866e45]">
              <b className="block text-xs font-bold">¿Pantalla en blanco?</b>
              <span className="mt-1 block text-[11px] leading-relaxed">
                Abre la aplicación en una nueva pestaña e intenta de nuevo.
              </span>
            </div>
          </div>

          <p className="border-t border-[#efe7ee] pt-4 text-center text-[9px] tracking-[0.5px] text-[#9a8693]">
            Seguridad y Salud en el Trabajo · Acceso solo para personal autorizado
          </p>
        </div>
      </section>

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
                className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
