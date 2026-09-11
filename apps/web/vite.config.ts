import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "react";
          if (id.includes("@xyflow/react") || id.includes("@dagrejs/dagre")) return "graph";
          if (id.includes("lucide-react")) return "icons";
        }
      }
    }
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } }
  }
});
