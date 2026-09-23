import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { vercelApiPlugin } from "./vite-api-plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [vercelApiPlugin(), react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replaceAll("\\", "/");
          if (!moduleId.includes("/node_modules/")) return undefined;
          // Keep React, router, Radix and their shared helpers in Vite's
          // default vendor graph. Splitting that graph creates circular chunks
          // where React can be evaluated after a consumer calls createContext.
          if (moduleId.includes("/node_modules/@supabase/")) return "vendor-supabase";
          if (moduleId.includes("/node_modules/pdfjs-dist/") || moduleId.includes("/node_modules/jspdf")) return "vendor-pdf";
          return undefined;
        },
      },
    },
  },
  esbuild: {
    target: "esnext",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
}));
