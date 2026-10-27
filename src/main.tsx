import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();
import "./index.css";
// @ts-ignore
import { registerSW } from "virtual:pwa-register";

// Registro de PWA (Service Worker) mediante vite-plugin-pwa
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm("Hay una nueva versión disponible. ¿Recargar?")) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log("Aplicación lista para uso sin conexión");
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
