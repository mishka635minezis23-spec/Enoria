import { defineConfig } from "vite";
import { APP_CONFIG } from "./src/config/app-config";
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
        background_color: APP_CONFIG.theme.surface,
        theme_color: APP_CONFIG.theme.primaryDark,
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
