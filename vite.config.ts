import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg"],
      manifest: {
        id: "/",
        name: "Enoria — Notre Dame d'Afrique",
        short_name: "Enoria",
        description: "Registre numérique des sacrements de la paroisse Notre Dame d'Afrique.",
        lang: "fr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f8fafc",
        theme_color: "#123b32",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false
      },
      devOptions: { enabled: false }
    })
  ],
  build: {
    target: "es2022",
    sourcemap: true
  }
});
