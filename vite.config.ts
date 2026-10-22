import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `base: "./"`: rutas relativas, para que el mismo build sirva en Vercel (raíz) y en GitHub Pages
// (subcarpeta del repositorio) sin reconstruir.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    // MapLibre (~1 MB) y Plot van en archivos propios: cambian menos que el código de la app.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: {
          mapa: ["maplibre-gl"],
          graficas: ["@observablehq/plot"],
        },
      },
    },
  },
});
