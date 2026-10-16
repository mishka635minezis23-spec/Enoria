import "./styles.css";
import { APP_CONFIG } from "./config/app-config";
import { getCurrentRoute, loadRouteContent, navigateTo, ROUTES, type RouteKey } from "./router";
import { registerSW } from "virtual:pwa-register";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Le conteneur principal #app est introuvable.");

const navItems = (Object.entries(ROUTES) as [RouteKey, (typeof ROUTES)[RouteKey]][])
  .map(([key, item]) => `
    <a class="sidebar-link" href="#/${key}" data-route="${key}">
      <span class="nav-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span>
    </a>`)
  .join("");

app.innerHTML = `
  <div class="min-h-screen md:flex">
    <aside class="sidebar flex min-h-screen flex-col bg-[#123b32] text-white" id="sidebar" data-open="false">
      <div class="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <div class="grid h-11 w-11 place-items-center rounded-xl bg-white text-lg font-bold text-[#176653]">E</div>
        <div class="min-w-0"><p class="text-lg font-semibold tracking-wide">Enoria</p><p class="truncate text-xs text-emerald-100/70">${APP_CONFIG.parishName}</p></div>
        <button class="ml-auto rounded-lg p-2 text-white/70 hover:bg-white/10 md:hidden" id="close-menu" aria-label="Fermer le menu">✕</button>
      </div>
      <div class="px-5 pb-2 pt-6 text-[10px] font-semibold uppercase tracking-[.18em] text-emerald-100/50">Espace paroissial</div>
      <nav class="flex-1 space-y-1 px-3" aria-label="Navigation principale">${navItems}</nav>
      <div class="m-3 rounded-xl border border-white/10 bg-white/5 p-3">
        <p class="text-xs font-medium text-white/90">Registres papier</p>
        <p class="mt-1 text-[11px] leading-relaxed text-emerald-100/60">Les registres physiques restent la référence officielle.</p>
      </div>
      <div class="border-t border-white/10 px-5 py-4 text-[11px] text-emerald-100/50">Enoria · Version 0.1.0</div>
    </aside>
    <button class="sidebar-backdrop" id="sidebar-backdrop" aria-label="Fermer le menu" data-open="false"></button>
    <div class="flex min-h-screen min-w-0 flex-1 flex-col">
      <header class="sticky top-0 z-20 flex h-[4.25rem] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur md:px-8">
        <div class="flex items-center gap-3">
          <button class="mobile-nav rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700" id="open-menu" aria-label="Ouvrir le menu">☰</button>
          <div><p class="text-xs text-slate-400">Paroisse</p><p class="text-sm font-semibold text-slate-700">${APP_CONFIG.parishName}</p></div>
        </div>
        <div class="flex items-center gap-3">
          <span class="hidden text-xs text-slate-500 sm:inline" id="today"></span>
          <span class="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-800">Mode préparation</span>
          <div class="grid h-9 w-9 place-items-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-800" aria-label="Compte utilisateur">U</div>
        </div>
      </header>
      <main class="w-full flex-1 px-4 py-6 md:px-8 md:py-8">
        <div id="page-content" class="mx-auto max-w-7xl" aria-live="polite">
          <div class="page-card p-8 text-sm text-slate-500">Chargement…</div>
        </div>
      </main>
      <footer class="border-t border-slate-200/80 bg-white px-4 py-4 text-center text-[11px] text-slate-400 md:px-8">
        Enoria accompagne les registres papier ; il ne les remplace pas.
      </footer>
    </div>
  </div>
`;

const content = document.querySelector<HTMLElement>("#page-content")!;
const sidebar = document.querySelector<HTMLElement>("#sidebar")!;
const backdrop = document.querySelector<HTMLElement>("#sidebar-backdrop")!;

function closeMenu(): void {
  sidebar.dataset.open = "false";
  backdrop.dataset.open = "false";
}
function updateActiveLink(route: RouteKey): void {
  document.querySelectorAll<HTMLAnchorElement>("[data-route]").forEach((link) => {
    if (link.dataset.route === route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}
async function renderRoute(): Promise<void> {
  const route = getCurrentRoute();
  updateActiveLink(route);
  closeMenu();
  try {
    await loadRouteContent(route, content);
    document.title = `${ROUTES[route].label} — Enoria`;
    window.scrollTo({ top: 0, behavior: "instant" });
  } catch {
    content.innerHTML = `
      <section class="page-card p-6 md:p-8">
        <p class="text-sm font-semibold text-rose-700">Page indisponible</p>
        <h1 class="mt-2 text-xl font-semibold text-slate-900">Connexion ou fichier indisponible</h1>
        <p class="mt-2 max-w-xl text-sm leading-6 text-slate-600">Cette page n'a pas pu être chargée. Vérifie la connexion puis réessaie. Aucune donnée personnelle n'est enregistrée hors ligne dans cette version.</p>
        <button id="retry-page" class="mt-5 rounded-lg bg-[#176653] px-4 py-2.5 text-sm font-medium text-white">Réessayer</button>
      </section>`;
    document.querySelector<HTMLButtonElement>("#retry-page")?.addEventListener("click", () => void renderRoute());
  }
}
document.addEventListener("click", (event) => {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("[data-route]");
  if (link) {
    event.preventDefault();
    navigateTo(link.dataset.route as RouteKey);
  }
});
window.addEventListener("hashchange", () => void renderRoute());
document.querySelector("#open-menu")?.addEventListener("click", () => {
  sidebar.dataset.open = "true";
  backdrop.dataset.open = "true";
});
document.querySelector("#close-menu")?.addEventListener("click", closeMenu);
backdrop.addEventListener("click", closeMenu);

const dateNode = document.querySelector<HTMLElement>("#today");
if (dateNode) dateNode.textContent = new Intl.DateTimeFormat(APP_CONFIG.locale, { dateStyle: "full" }).format(new Date());

void renderRoute();

const updateSW = registerSW({
  onNeedRefresh() {
    if (document.querySelector("#update-banner")) return;
    const banner = document.createElement("div");
    banner.id = "update-banner";
    banner.className = "fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-emerald-200 bg-white p-4 shadow-xl";
    const message = document.createElement("p");
    message.className = "text-sm text-slate-700";
    message.textContent = "Une mise à jour d'Enoria est prête.";
    const button = document.createElement("button");
    button.className = "shrink-0 rounded-lg bg-[#176653] px-3 py-2 text-xs font-semibold text-white";
    button.textContent = "Actualiser";
    button.addEventListener("click", () => void updateSW(true));
    banner.append(message, button);
    document.body.append(banner);
  },
  onOfflineReady() {
    console.info("Enoria : les ressources statiques sont disponibles hors ligne.");
  }
});

