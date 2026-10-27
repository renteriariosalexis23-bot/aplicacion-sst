import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackAllowlist: [/^(?!\/api).*/],
        },
        includeAssets: [],
        manifest: {
          name: "Gestión SST",
          short_name: "SST Gestión",
          description: "Portal de Seguridad y Salud en el Trabajo",
          theme_color: "#4f46e5",
          background_color: "#ffffff",
          display: "standalone",
          icons: [
            {
              src: "icon-192x192.svg",
              sizes: "192x192 512x512",
              type: "image/svg+xml",
              purpose: "any maskable",
            },
          ],
        },
      }),
    ],
    define: {
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== "true",
    },
    build: {
      rollupOptions: {
        // Removed manual chunking to allow Vite to optimize chunks natively and prevent Vercel timeout/load issues
      }
    }
  };
});
